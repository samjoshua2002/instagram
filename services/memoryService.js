const { AzureOpenAI } = require('openai');
const UserMemory = require('../models/UserMemory');
const Message = require('../models/Message');
const redisService = require('./redisService');

class MemoryService {
  constructor() {
    this.client = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o",
    });
  }

  /**
   * Get or create memory record for an Instagram user
   */
  async getOrCreateUserMemory(senderId, profileData = null) {
    let memory = await UserMemory.findOne({ senderId });
    if (!memory) {
      memory = new UserMemory({
        senderId,
        username: profileData?.username || `User_${senderId.slice(-4)}`,
        name: profileData?.name || '',
        profilePic: profileData?.profile_pic || '',
      });
      await memory.save();
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
    await redisService.cacheUserMemory(senderId, memory.toObject ? memory.toObject() : memory, 3600);
    return memory;
  }

  /**
   * Asynchronously updates the user's memory, conversation style analysis,
   * facts extracted, and rolling summary.
   */
  async updateMemoryAsync(senderId) {
    try {
      let memory = await this.getOrCreateUserMemory(senderId);

      // Intelligent message sampling: if > 100 messages, capture first 25 (origin/lore) + latest 75 (current style/inside jokes)
      const totalMsgCount = await Message.countDocuments({
        $or: [{ senderId }, { recipientId: senderId }]
      });

      let messagesToAnalyze = [];
      if (totalMsgCount === 0) {
        if (memory.recentChatBuffer && memory.recentChatBuffer.length > 0) {
          messagesToAnalyze = memory.recentChatBuffer.map(b => ({
            role: b.role,
            senderId: b.role === 'assistant' ? '17841446877896232' : senderId,
            text: b.text
          }));
        } else {
          return;
        }
      } else if (totalMsgCount <= 100) {
        messagesToAnalyze = await Message.find({
          $or: [{ senderId }, { recipientId: senderId }]
        }).sort({ createdAt: 1 });
      } else {
        const firstBatch = await Message.find({
          $or: [{ senderId }, { recipientId: senderId }]
        }).sort({ createdAt: 1 }).limit(25);

        const recentBatch = await Message.find({
          $or: [{ senderId }, { recipientId: senderId }]
        }).sort({ createdAt: -1 }).limit(75);
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
        return;
      }

      const formattedChat = messagesToAnalyze
        .map(m => {
          const isSam = m.role === 'assistant' || m.senderId === '17841446877896232' || m.senderId === 'me';
          const speaker = isSam ? 'Sam' : (memory.name || memory.username || 'User');
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
   - Gender: female, male, neutral, unknown (infer accurately from their name e.g. Mikasa/Priya is female, Alex/Sam/User is neutral/unknown unless stated, or from how they speak).
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
          { role: 'user', content: prompt }
        ],
        temperature: 0.25,
        response_format: { type: 'json_object' }
      });

      const parsed = JSON.parse(response.choices[0].message.content.trim());

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
                p.notes || ''
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

      memory.messageCount = (memory.messageCount || 0) + 1;
      memory.lastInteraction = new Date();
      await memory.save();

      // Immediate cache sync in Redis
      await redisService.cacheUserMemory(senderId, memory.toObject ? memory.toObject() : memory, 3600);

      console.log(`🧠 [Deep Memory Updated] @${memory.username}: Dates=${memory.importantDates.length}, Favs=${memory.favoriteThings.length}, Events=${memory.lifeEvents.length}, Exchanges=${(memory.fewShotExchanges || []).length}`);

      // Dynamically sync updated memory into SocialGraph so People Menu cards update in real time!
      try {
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

        const node = await SocialGraph.findOne({ $or: orConditions });

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
        } else if (!/^(test_|ig_tester_|catovidz$|me$|user_\d+)/i.test(cleanU)) {
          await SocialGraph.create({
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
          });
          console.log(`✨ [SocialGraph Dynamic Sync]: Created new card for ${displayName} (DOB: "${activeDob}")`);
        }
        socialGraphService.clearCache();
      } catch (sgSyncErr) {
        console.warn('⚠️ Dynamic SocialGraph sync note:', sgSyncErr.message);
      }
    } catch (err) {
      console.error('❌ Error updating user memory:', err.message);
    }
  }

  /**
   * Deletes raw chat messages older than specified days (default 3 days)
   * to conserve database storage while keeping summarized intelligence intact.
   */
  async cleanOldMessages(days = 3) {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const result = await Message.deleteMany({
        createdAt: { $lt: cutoff }
      });

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
  async batchSyncAllChatsFromMongo() {
    console.log('🔄 [Batch Memory Sync]: Starting full backfill from 1-month chat data in MongoDB...');
    const botIds = ['me', '17841446877896232'];
    const senders = await Message.distinct('senderId', { senderId: { $nin: botIds } });
    const recipients = await Message.distinct('recipientId', { recipientId: { $nin: botIds } });
    const memoryUsers = await UserMemory.distinct('senderId', { senderId: { $nin: botIds } });
    const rawIds = [...new Set([...senders, ...recipients, ...memoryUsers])];

    // Compute message counts and sort contacts by chat activity (most active first)
    const contactsWithCounts = [];
    for (const id of rawIds) {
      const count = await Message.countDocuments({
        $or: [{ senderId: id }, { recipientId: id }]
      });
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
        await this.updateMemoryAsync(senderId);
        const mem = await UserMemory.findOne({ senderId });
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
