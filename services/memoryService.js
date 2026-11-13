const { AzureOpenAI } = require('openai');
const { creatorIdentity, personalize } = require('./creatorIdentity');
const UserMemory = require('../models/UserMemory');
const Message = require('../models/Message');
const redisService = require('./redisService');

// Background learning waits for the chat to go quiet, then runs once per contact (not once per DM)
const MEMORY_LEARN_QUIET_MS = 45 * 1000;
// ...but a chat that never pauses still gets learned at least this often
const MEMORY_LEARN_MAX_WAIT_MS = 5 * 60 * 1000;
// Fields learning must never write back from its (possibly stale) copy: the creator's toggles and
// live counters are changed elsewhere while the AI call runs
const LEARN_PROTECTED_FIELDS = new Set([
  '_id', '__v', 'ownerId', 'senderId', 'recentChatBuffer', 'messageCount', 'reelsCount', 'lastInteraction',
  'aiEnabled', 'replyToMessages', 'replyToReelsAndPosts', 'remindersEnabled', 'lastReminderSentAt',
]);

class MemoryService {
  constructor() {
    this._client = null;
    this._learnQueue = new Map(); // ownerId:senderId -> { timer, firstAt, running, dirty }
  }

  // Created on first use so a missing AI key never crashes server startup
  get client() {
    if (!this._client) {
      this._client = new AzureOpenAI({
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o",
        // Background learning: a hung request must not hold the worker for the 10-minute default
        maxRetries: 2,
        timeout: 60 * 1000,
      });
    }
    return this._client;
  }

  // Cache key for a contact, unique per creator
  cacheKey(senderId, ownerId) {
    return `${ownerId || 'none'}:${senderId}`;
  }

  // Message filter for one contact's conversation inside one creator's inbox
  conversationQuery(senderId, ownerId) {
    return { ownerId: ownerId || null, $or: [{ senderId }, { recipientId: senderId }] };
  }

  /**
   * Get or create memory record for an Instagram user
   */
  async getOrCreateUserMemory(senderId, profileData = null, ownerId = null) {
    let memory = await UserMemory.findOne({ ownerId: ownerId || null, senderId });
    if (!memory) {
      // Upsert: two first DMs arriving together must not fail on the unique (creator, sender) key
      memory = await UserMemory.findOneAndUpdate(
        { ownerId: ownerId || null, senderId },
        { $setOnInsert: {
          ownerId: ownerId || null,
          senderId,
          username: profileData?.username || `User_${senderId.slice(-4)}`,
          name: profileData?.name || '',
          profilePic: profileData?.profile_pic || '',
        } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).catch(async (e) => {
        if (e && e.code === 11000) return UserMemory.findOne({ ownerId: ownerId || null, senderId });
        throw e;
      });
    } else if (profileData) {
      if (profileData.username && memory.username.startsWith('User_')) {
        memory.username = profileData.username;
      }
      if (profileData.name && !memory.name) {
        memory.name = profileData.name;
      }
      if (profileData.profile_pic) {
        memory.profilePic = profileData.profile_pic;
      }
      await memory.save();
    }
    // Sync with Redis cache
    await redisService.cacheUserMemory(this.cacheKey(senderId, ownerId), memory.toObject ? memory.toObject() : memory, 3600);
    return memory;
  }

  /**
   * Asks for a background learning run for this contact. Bursts of DMs are merged into one run after
   * the chat has been quiet for MEMORY_LEARN_QUIET_MS (or MEMORY_LEARN_MAX_WAIT_MS at the latest),
   * and only one run per contact happens at a time (a request during a run queues exactly one more).
   */
  scheduleMemoryUpdate(senderId, ownerId = null, { quietMs = MEMORY_LEARN_QUIET_MS, maxWaitMs = MEMORY_LEARN_MAX_WAIT_MS } = {}) {
    const key = `${ownerId || ''}:${senderId}`;
    let job = this._learnQueue.get(key);
    if (!job) {
      job = { timer: null, firstAt: Date.now(), running: false, dirty: false };
      this._learnQueue.set(key, job);
    }
    if (job.running) {
      job.dirty = true; // learn again once the current run ends (new messages arrived meanwhile)
      return;
    }
    clearTimeout(job.timer);
    const waited = Date.now() - job.firstAt;
    const delay = waited >= maxWaitMs ? 0 : Math.min(quietMs, maxWaitMs - waited);
    job.timer = setTimeout(async () => {
      job.timer = null;
      job.running = true;
      try {
        await this.updateMemoryAsync(senderId, ownerId);
      } catch (err) {
        console.error('Background memory update failed (non-critical):', err.message);
      } finally {
        job.running = false;
        if (job.dirty) {
          job.dirty = false;
          job.firstAt = Date.now();
          this.scheduleMemoryUpdate(senderId, ownerId, { quietMs, maxWaitMs });
        } else if (this._learnQueue.get(key) === job) {
          this._learnQueue.delete(key);
        }
      }
    }, delay);
  }

  /**
   * Asynchronously updates the user's memory, conversation style analysis,
   * facts extracted, and rolling summary.
   */
  // Returns true when there was nothing to learn or the learned memory was saved, false on failure
  // (callers that delete raw messages afterwards must check this)
  async updateMemoryAsync(senderId, ownerId = null) {
    let saved = false;
    try {
      let memory = await this.getOrCreateUserMemory(senderId, null, ownerId);
      const convoQuery = this.conversationQuery(senderId, ownerId);

      // Intelligent message sampling: if > 100 messages, capture first 25 (origin/lore) + latest 75 (current style/inside jokes)
      const totalMsgCount = await Message.countDocuments(convoQuery);

      let messagesToAnalyze = [];
      if (totalMsgCount === 0) {
        if (memory.recentChatBuffer && memory.recentChatBuffer.length > 0) {
          messagesToAnalyze = memory.recentChatBuffer.map(b => ({
            role: b.role,
            senderId: b.role === 'assistant' ? 'me' : senderId,
            text: b.text
          }));
        } else {
          return true;
        }
      } else if (totalMsgCount <= 100) {
        messagesToAnalyze = await Message.find(convoQuery).sort({ createdAt: 1 });
      } else {
        const firstBatch = await Message.find(convoQuery).sort({ createdAt: 1 }).limit(25);

        const recentBatch = await Message.find(convoQuery).sort({ createdAt: -1 }).limit(75);
        recentBatch.reverse();

        const seenIds = new Set();
        for (const m of [...firstBatch, ...recentBatch]) {
          const idStr = m._id.toString();
          if (!seenIds.has(idStr)) {
            seenIds.add(idStr);
            messagesToAnalyze.push(m);
          }
        }
      }

      if (!messagesToAnalyze || messagesToAnalyze.length === 0) {
        return true;
      }

      const creator = await creatorIdentity(ownerId);
      const formattedChat = messagesToAnalyze
        .map(m => {
          const isCreator = m.role === 'assistant' || m.senderId === 'me' || creator.accountIds.includes(String(m.senderId));
          const speaker = isCreator ? creator.name : (memory.name || memory.username || 'User');
          return `${speaker}: ${m.text}`;
        })
        .join('\n');

      const currentFacts = (memory.facts || []).map(f => f.fact).join('; ');
      const currentDates = (memory.importantDates || []).map(d => `${d.title} (${d.date || 'TBD'}): ${d.details}`).join('; ');
      const currentFavorites = (memory.favoriteThings || []).map(fv => `${fv.category}: ${fv.item}`).join('; ');
      const currentEvents = (memory.lifeEvents || []).map(e => `${e.title}: ${e.details}`).join('; ');
      const currentJokes = (memory.insideJokes || []).join('; ');

      const prompt = `Analyze this real Instagram DM exchange between Creator Sam Joshua (@catovidz) and a user.
You are tasked with deeply learning this person's identity and training Sam's AI to speak and text back with this exact person authentically.

CONTACT INFO:
- Sender ID: ${senderId}
- Current Name in DB: ${memory.name || 'Unknown'}
- Username in DB: @${memory.username || 'Unknown'}
- Existing Facts: ${currentFacts || 'None'}
- Existing Dates: ${currentDates || 'None'}
- Existing Favorites: ${currentFavorites || 'None'}
- Existing Events: ${currentEvents || 'None'}
- Inside Jokes: ${currentJokes || 'None'}
- Existing Notes: ${memory.personalNotes || 'None'}

CHAT LOG (${messagesToAnalyze.length} messages, chronologically ordered):
${formattedChat}

INSTRUCTIONS:
1. REAL IDENTITY & LORE:
   - Identify their real first name or preferred name (look for introductions or how Sam addresses them).
   - Any nicknames Sam uses for them or they use for Sam.
   - Exact birthday / DOB if mentioned or celebrated anywhere in the chat.
   - School, college, workplace, or city/location if mentioned.
   - Gender: female, male, neutral, unknown (infer accurately from their name e.g. Mikasa/Priya is female, Alex/User is neutral/unknown unless stated, or from how they speak).
   - Real facts about their life, family, pets, hobbies, struggles, projects.

2. TEXTING STYLE (HOW THEY TEXT):
   - Specific typing habits: lowercase, all-caps, emoji frequency, shortcuts (u, rn, fr, idk, wbu, lmao, omfg, etc.).
   - Tone: sarcastic, emotional, high-energy, deadpan, sweet, formal, etc.

3. SAM'S SPECIFIC SPEAKING STYLE WITH THIS PERSON (CRITICAL FOR TRAINING):
   - How does Sam talk to THIS specific contact?
   - Is it dry sarcastic one-liners, deadpan roasts ("Fym u", "is that mochis twin", "Like fr")?
   - Is it hyper, all-caps, hysterical laughing ("IMCRINE WTF", "HEYYYYY MY LOVEEEE")?
   - Is it Tamil/Tanglish bro banter ("dei", "semma", "vera level", "podhum")?
   - Is it supportive, deep friendship reassurance?
   - What inside jokes or shared lore exist between them?
   - Roast style: Exactly how they tease, joke, or roast each other.

4. FEW-SHOT EXCHANGES (AUTHENTIC TRAINING SAMPLES):
   - Extract 3 to 6 REAL, verbatim exchanges from the chat log where the user said something and Sam replied in his signature voice.
   - Format: { "userMessage": "...", "myReply": "..." }
   - These will be used directly as in-context few-shot learning for Sam's AI!

Return a valid JSON object matching EXACTLY this structure:
{
  "name": "Real name if stated or clearly known, else empty string",
  "nickname": "Extracted nickname or what Sam calls them, else empty string",
  "dob": "Birthday e.g. 'Oct 12' or '18 May' if stated, else empty string",
  "schoolOrCollege": "School/college/workplace if mentioned, else empty string",
  "gender": "female | male | neutral | unknown",
  "conversationStyle": "Detailed description of their texting style and tone",
  "samSpeakingStyleWithUser": "Precise description of how Sam talks to them (slang, sarcasm, nicknames, teasing)",
  "relationshipType": "stranger | fan | client | collaborator | friend",
  "newFacts": ["fact 1", "fact 2"],
  "importantDates": [
    { "title": "Birthday / Event / Exam", "date": "e.g. Oct 12", "details": "context" }
  ],
  "favoriteThings": [
    { "category": "music/game/food/creator/hobby/general", "item": "favorite item" }
  ],
  "lifeEvents": [
    { "title": "Event title", "details": "context", "dateOrTime": "timeframe" }
  ],
  "personalNotes": "2-3 sentence ongoing note about who this person is, their vibe, their connection to Sam, and current life situation.",
  "roastStyle": "Exact summary of how Sam and this person joke, tease, banter, or speak affectionately.",
  "insideJokes": ["joke 1", "lore 2"],
  "rollingSummary": "1-2 sentence summary of recent conversation and friendship status.",
  "fewShotExchanges": [
    { "userMessage": "what user texted", "myReply": "how Sam replied" }
  ],
  "mentionedPeople": [
    { "name": "Person name", "relationship": "friend/sister/bro", "notes": "context" }
  ]
}
Only extract genuine details explicitly stated or strongly implied by the chat. Do not invent information. If an array has no items, return empty array.`;

      const response = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an empathetic, razor-sharp chat memory analyst. Output pure valid JSON.' },
          { role: 'user', content: personalize(prompt, creator.name) }
        ],
        // gpt-5* deployments reject temperature
        ...(String(process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o').startsWith('gpt-5') ? {} : { temperature: 0.25 }),
        response_format: { type: 'json_object' }
      });

      const parsed = JSON.parse(response.choices[0].message.content.trim());

      // The AI call takes seconds and new DMs may have saved this contact meanwhile:
      // apply what was learned to the LATEST copy so the save does not hit a version conflict
      memory = (await UserMemory.findById(memory._id)) || memory;

      if (parsed.name && parsed.name.trim() !== '') {
        const cleanExtractedName = parsed.name.trim();
        if (!memory.name || memory.name.startsWith('User_') || memory.name.startsWith('ig_tester_')) {
          memory.name = cleanExtractedName;
        }
      }

      if (parsed.nickname && parsed.nickname.trim() !== '') {
        memory.nickname = parsed.nickname.trim();
      }

      // Extract and record Birthday / DOB
      const bdayItem = (parsed.importantDates || []).find(d => /birth|bday/i.test(d?.title || ''));
      const detectedDob = (parsed.dob && parsed.dob.trim()) || bdayItem?.date || '';
      if (detectedDob) {
        memory.dob = detectedDob;
        const hasBdayDate = (memory.importantDates || []).some(d => /birth|bday/i.test(d.title));
        if (!hasBdayDate) {
          memory.importantDates.push({
            title: 'Birthday',
            date: detectedDob,
            details: 'Learned from DM conversation'
          });
        }
      }

      // Extract and record School / College
      if (parsed.schoolOrCollege && parsed.schoolOrCollege.trim()) {
        const sc = parsed.schoolOrCollege.trim();
        const exists = (memory.facts || []).some(f => f.fact.toLowerCase().includes(sc.toLowerCase()));
        if (!exists) {
          memory.facts.push({ fact: `Studies/works at ${sc}` });
        }
      }

      if (parsed.gender && ['female', 'male', 'neutral', 'unknown'].includes(parsed.gender)) {
        memory.gender = parsed.gender;
      }
      if (parsed.conversationStyle) {
        memory.conversationStyle = parsed.conversationStyle;
      }
      if (parsed.samSpeakingStyleWithUser) {
        memory.samSpeakingStyleWithUser = parsed.samSpeakingStyleWithUser;
      }
      if (parsed.relationshipType) {
        const validRel = ['stranger', 'fan', 'client', 'collaborator', 'friend'];
        const cleanRel = parsed.relationshipType.toLowerCase().trim();
        memory.relationshipType = validRel.includes(cleanRel) ? cleanRel : 'friend';
      }
      if (parsed.personalNotes) {
        memory.personalNotes = parsed.personalNotes;
      }
      if (parsed.roastStyle && parsed.roastStyle.trim()) {
        memory.roastStyle = parsed.roastStyle.trim();
      }
      if (Array.isArray(parsed.insideJokes) && parsed.insideJokes.length > 0) {
        const existingJokes = new Set(memory.insideJokes || []);
        for (const j of parsed.insideJokes) {
          if (j && j.trim()) existingJokes.add(j.trim());
        }
        memory.insideJokes = Array.from(existingJokes);
      }
      if (parsed.rollingSummary) {
        memory.rollingSummary = parsed.rollingSummary;
      }
      if (Array.isArray(parsed.fewShotExchanges) && parsed.fewShotExchanges.length > 0) {
        memory.fewShotExchanges = parsed.fewShotExchanges.filter(e => e.userMessage && e.myReply);
      }

      // Update social graph dynamically if friends/relationships were mentioned
      if (Array.isArray(parsed.mentionedPeople) && parsed.mentionedPeople.length > 0) {
        try {
          const socialGraphService = require('./socialGraphService');
          const senderName = memory.name || memory.nickname || memory.username;
          for (const p of parsed.mentionedPeople) {
            if (p.name && p.name.trim()) {
              await socialGraphService.recordConnection(
                senderName,
                p.name.trim(),
                p.relationship || 'friend',
                p.notes || '',
                ownerId
              );
            }
          }
        } catch (sgErr) {
          console.error('⚠️ [MemoryService] Non-critical social graph link error:', sgErr.message);
        }
      }

      // Merge new facts
      if (Array.isArray(parsed.newFacts) && parsed.newFacts.length > 0) {
        const existingFactTexts = new Set(memory.facts.map(f => f.fact.toLowerCase()));
        for (const factStr of parsed.newFacts) {
          if (factStr && !existingFactTexts.has(factStr.toLowerCase())) {
            memory.facts.push({ fact: factStr });
            existingFactTexts.add(factStr.toLowerCase());
          }
        }
      }

      // Merge important dates
      if (Array.isArray(parsed.importantDates) && parsed.importantDates.length > 0) {
        for (const item of parsed.importantDates) {
          if (item?.title) {
            const exists = (memory.importantDates || []).some(
              d => d.title.toLowerCase() === item.title.toLowerCase()
            );
            if (!exists) {
              memory.importantDates.push(item);
            }
          }
        }
      }

      // Merge favorite things
      if (Array.isArray(parsed.favoriteThings) && parsed.favoriteThings.length > 0) {
        for (const fav of parsed.favoriteThings) {
          if (fav?.item) {
            const exists = (memory.favoriteThings || []).some(
              f => f.item.toLowerCase() === fav.item.toLowerCase()
            );
            if (!exists) {
              memory.favoriteThings.push(fav);
            }
          }
        }
      }

      // Merge life events
      if (Array.isArray(parsed.lifeEvents) && parsed.lifeEvents.length > 0) {
        for (const ev of parsed.lifeEvents) {
          if (ev?.title) {
            const exists = (memory.lifeEvents || []).some(
              e => e.title.toLowerCase() === ev.title.toLowerCase()
            );
            if (!exists) {
              memory.lifeEvents.push(ev);
            }
          }
        }
      }

      try {
        await memory.save();
      } catch (saveErr) {
        if (saveErr && saveErr.name === 'VersionError') {
          // A DM landed in the last milliseconds: keep what was learned, never discard it, but write
          // ONLY the fields this run changed (never the whole document: that would undo a toggle the
          // creator flipped meanwhile, or facts another run just added)
          await UserMemory.updateOne({ _id: memory._id }, { $set: this.learnedChanges(memory) });
        } else {
          throw saveErr;
        }
      }
      saved = true;

      // Immediate cache sync in Redis
      await redisService.cacheUserMemory(this.cacheKey(senderId, ownerId), memory.toObject ? memory.toObject() : memory, 3600);

      console.log(`🧠 [Deep Memory Updated] @${memory.username}: Dates=${memory.importantDates.length}, Favs=${memory.favoriteThings.length}, Events=${memory.lifeEvents.length}, Exchanges=${(memory.fewShotExchanges || []).length}`);

      // Dynamically sync updated memory into SocialGraph so People Menu cards update in real time!
      try {
        if (!ownerId) throw new Error('no creator for this contact; skipping People sync');
        const SocialGraph = require('../models/SocialGraph');
        const socialGraphService = require('./socialGraphService');
        const cleanU = (memory.username || '').replace(/^@/, '').toLowerCase().trim();
        const displayName = memory.name && !memory.name.startsWith('User_') ? memory.name.trim() : (memory.nickname || memory.username);

        const orConditions = [{ senderId: memory.senderId }];
        if (cleanU && !cleanU.startsWith('user_')) {
          orConditions.push({ instagramHandle: `@${cleanU}` });
          orConditions.push({ instagramHandle: cleanU });
          orConditions.push({ aliases: cleanU });
          orConditions.push({ name: new RegExp(`^${cleanU.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
        }
        if (memory.name && !memory.name.startsWith('User_')) {
          const n = memory.name.toLowerCase().trim();
          orConditions.push({ aliases: n });
          orConditions.push({ name: new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
        }
        if (memory.nickname) {
          const nk = memory.nickname.toLowerCase().trim();
          orConditions.push({ aliases: nk });
          orConditions.push({ name: new RegExp(`^${nk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
        }

        const node = await SocialGraph.findOne({ ownerId, $or: orConditions });

        const allFacts = [
          ...(memory.facts || []).map(f => f.fact),
          ...(memory.importantDates || []).map(d => `${d.title}: ${d.date} ${d.details ? `(${d.details})` : ''}`),
          ...(memory.favoriteThings || []).map(f => `Favorite ${f.category}: ${f.item}`),
          ...(memory.lifeEvents || []).map(e => `${e.title}: ${e.details}`)
        ].filter(Boolean);

        const activeDob = memory.dob || (memory.importantDates || []).find(d => /birth|bday/i.test(d?.title || ''))?.date || '';

        if (node) {
          node.lore = Array.from(new Set([...(node.lore || []), ...allFacts]));
          if (activeDob && (!node.dob || node.dob.trim() === '')) {
            node.dob = activeDob;
          }
          if (memory.personalNotes) {
            node.personalNotes = memory.personalNotes;
          }
          if (!node.senderId && memory.senderId) {
            node.senderId = memory.senderId;
          }
          if (cleanU && !cleanU.startsWith('user_') && !node.instagramHandle) {
            node.instagramHandle = `@${cleanU}`;
          }
          if (memory.profilePic) node.profilePic = memory.profilePic;
          if (memory.gender && node.gender === 'unknown') node.gender = memory.gender;
          if (memory.relationshipType && memory.relationshipType !== 'stranger' && (!node.relationshipToSam || node.relationshipToSam.toLowerCase() === 'friend')) {
            node.relationshipToSam = memory.relationshipType.charAt(0).toUpperCase() + memory.relationshipType.slice(1);
          }
          if (memory.name && !memory.name.startsWith('User_') && (node.name.startsWith('User_') || node.name.startsWith('ig_tester_'))) {
            node.name = memory.name;
          }
          node.updatedAt = new Date();
          await node.save();
          console.log(`🌳 [SocialGraph Dynamic Sync]: Live updated card for ${node.name} (DOB: "${node.dob || ''}", Rel: "${node.relationshipToSam}", Lore: ${node.lore.length})`);
        } else if (!/^(test_|ig_tester_|catovidz$|me$|user_\d+)/i.test(cleanU) && !/^sim_/.test(memory.senderId)) {
          // Upsert by sender so the webhook and this sync can never make the same person twice
          await SocialGraph.updateOne({ ownerId, senderId: memory.senderId }, { $setOnInsert: {
            ownerId,
            name: displayName,
            aliases: [cleanU, (memory.name || '').toLowerCase(), (memory.nickname || '').toLowerCase()].filter(Boolean),
            instagramHandle: cleanU ? `@${cleanU}` : '',
            senderId: memory.senderId,
            dob: activeDob,
            profilePic: memory.profilePic || '',
            gender: memory.gender || 'unknown',
            relationshipToSam: memory.relationshipType && memory.relationshipType !== 'stranger'
              ? `${memory.relationshipType.charAt(0).toUpperCase() + memory.relationshipType.slice(1)}`
              : 'Follower / Online Contact',
            connections: [],
            lore: allFacts.length > 0 ? allFacts : (memory.personalNotes ? [memory.personalNotes] : []),
            personalNotes: memory.personalNotes || '',
            languages: ['English'],
            roastStyle: 'Casual & friendly'
          } }, { upsert: true });
          console.log(`✨ [SocialGraph Dynamic Sync]: Created new card for ${displayName} (DOB: "${activeDob}")`);
        }
        socialGraphService.clearCache(ownerId);
      } catch (sgSyncErr) {
        console.warn('⚠️ Dynamic SocialGraph sync note:', sgSyncErr.message);
      }
    } catch (err) {
      console.error('❌ Error updating user memory:', err.message);
    }
    return saved;
  }

  /**
   * The top-level fields this learning run actually changed on `memory`, as a $set object,
   * leaving out the creator's toggles and live counters.
   */
  learnedChanges(memory) {
    const plain = memory.toObject({ depopulate: true });
    const out = {};
    for (const path of memory.modifiedPaths()) {
      const top = path.split('.')[0];
      if (LEARN_PROTECTED_FIELDS.has(top) || top in out) continue;
      out[top] = plain[top];
    }
    return out;
  }

  /**
   * Deletes raw chat messages older than specified days (default 3 days)
   * to conserve database storage while keeping summarized intelligence intact.
   */
  async cleanOldMessages(days = 3, ownerId = undefined) {
    try {
      const safeDays = Math.max(1, Number(days) || 3);
      const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
      const filter = { createdAt: { $lt: cutoff } };
      if (ownerId !== undefined) filter.ownerId = ownerId;
      const result = await Message.deleteMany(filter);

      console.log(`🧹 [DB Cleanup] Purged ${result.deletedCount || 0} messages older than ${days} days to optimize database space.`);
      return result.deletedCount || 0;
    } catch (err) {
      console.error('❌ Error in cleanOldMessages:', err.message);
      return 0;
    }
  }

  /**
   * Safe scheduler for chat retention. Preserves full 1-month+ chat history
   * for continuous learning unless explicitly overridden via CHAT_RETENTION_DAYS.
   */
  startDailyCleanup(days = null) {
    const retentionDays = parseInt(process.env.CHAT_RETENTION_DAYS || (days > 14 ? days : null), 10);
    if (!retentionDays || retentionDays <= 0) {
      console.log('📦 [Memory Service] Permanent chat history retention active (1-month+ memory preserved for AI learning).');
      return;
    }
    console.log(`⏱️ Daily chat retention cleanup scheduled (${retentionDays} days retention).`);
    setInterval(() => {
      this.cleanOldMessages(retentionDays).catch(e => console.error('Cleanup error:', e.message));
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Scans the 1-month chat history in MongoDB across all users,
   * analyzes their complete message streams, and updates their UserMemory,
   * SocialGraph lore, and Redis cache.
   */
  async batchSyncAllChatsFromMongo(ownerId, botIdsExtra = []) {
    console.log('🔄 [Batch Memory Sync]: Starting full backfill from 1-month chat data in MongoDB...');
    if (!ownerId) return [];
    const botIds = ['me', ...botIdsExtra.filter(Boolean).map(String)];
    const memoryUsers = await UserMemory.distinct('senderId', { ownerId, senderId: { $nin: botIds } });

    // Message counts per contact in ONE aggregate (no per-contact query), most active first
    const counts = await Message.aggregate([
      { $match: { ownerId } },
      { $project: { contact: { $cond: [{ $in: ['$senderId', botIds] }, '$recipientId', '$senderId'] } } },
      { $match: { contact: { $nin: botIds } } },
      { $group: { _id: '$contact', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map(c => [c._id, c.count]));
    const rawIds = [...new Set([...countMap.keys(), ...memoryUsers])];
    const contactsWithCounts = [];
    for (const id of rawIds) {
      const count = countMap.get(id) || 0;
      if (count > 0) {
        contactsWithCounts.push({ id, count });
      }
    }
    contactsWithCounts.sort((a, b) => b.count - a.count);

    console.log(`📊 Discovered ${contactsWithCounts.length} contacts with active 1-month chat history in MongoDB.`);
    const results = [];

    for (let i = 0; i < contactsWithCounts.length; i++) {
      const { id: senderId, count } = contactsWithCounts[i];
      try {
        console.log(`\n🧠 [${i + 1}/${contactsWithCounts.length}] Processing contact ${senderId} (${count} historical messages)...`);
        await this.updateMemoryAsync(senderId, ownerId);
        const mem = await UserMemory.findOne({ ownerId, senderId });
        results.push({
          senderId,
          username: mem?.username,
          name: mem?.name,
          messageCount: count,
          factsCount: mem?.facts?.length || 0,
          datesCount: mem?.importantDates?.length || 0,
          exchangesCount: (mem?.fewShotExchanges || []).length,
          style: mem?.conversationStyle,
          roastStyle: mem?.roastStyle,
          samSpeakingStyle: mem?.samSpeakingStyleWithUser,
        });
        console.log(`✅ [${i + 1}/${contactsWithCounts.length}] Learned @${mem?.username || senderId} (${mem?.name || 'Unnamed'}): Style="${(mem?.conversationStyle || '').slice(0, 40)}...", FewShots=${(mem?.fewShotExchanges || []).length}, Facts=${mem?.facts?.length || 0}`);
      } catch (err) {
        console.error(`❌ Failed syncing historical memory for ${senderId}:`, err.message);
      }
    }

    console.log(`\n🎉 [Batch Memory Sync Complete]: Successfully synthesized and trained style for ${results.length} contacts!`);
    return results;
  }

}

module.exports = new MemoryService();
