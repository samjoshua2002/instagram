const { AzureOpenAI } = require('openai');
const UserMemory = require('../models/UserMemory');
const Message = require('../models/Message');

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
    return memory;
  }

  /**
   * Asynchronously updates the user's memory, conversation style analysis,
   * facts extracted, and rolling summary.
   */
  async updateMemoryAsync(senderId) {
    try {
      const memory = await UserMemory.findOne({ senderId });
      if (!memory) return;

      // Fetch the last 15 messages for this user
      const recentMessages = await Message.find({
        $or: [{ senderId }, { recipientId: senderId }]
      })
      .sort({ createdAt: -1 })
      .limit(15);

      recentMessages.reverse();

      if (recentMessages.length < 2) {
        // Not enough context yet to update memory
        return;
      }

      const formattedChat = recentMessages
        .map(m => `${m.role === 'assistant' ? 'Sam' : 'User'}: ${m.text}`)
        .join('\n');

      const currentFacts = (memory.facts || []).map(f => f.fact).join('; ');
      const currentDates = (memory.importantDates || []).map(d => `${d.title} (${d.date || 'TBD'}): ${d.details}`).join('; ');
      const currentFavorites = (memory.favoriteThings || []).map(fv => `${fv.category}: ${fv.item}`).join('; ');
      const currentEvents = (memory.lifeEvents || []).map(e => `${e.title}: ${e.details}`).join('; ');

      const prompt = `Analyze this Instagram DM exchange between Creator Sam Joshua and a user.
Extract comprehensive intelligence and personal notes about this specific user so Sam can converse with them naturally like a close human friend.
Return ONLY a valid JSON object.

EXISTING INTELLIGENCE:
- Preferred Nickname: ${memory.nickname || 'None'}
- User style: ${memory.conversationStyle}
- Existing facts: ${currentFacts || 'None'}
- Important dates: ${currentDates || 'None'}
- Favorite things: ${currentFavorites || 'None'}
- Life events: ${currentEvents || 'None'}
- Personal notes: ${memory.personalNotes || 'None'}
- Prior summary: ${memory.rollingSummary}

RECENT CHAT LOG:
${formattedChat}

Return a valid JSON object with EXACTLY this structure:
{
  "nickname": "Extracted nickname or what they prefer to be called (leave empty if none)",
  "gender": "one of: female, male, neutral, unknown (infer accurately from their name e.g. Mikasa/Priya is female, Alex/Sam/User is neutral/unknown unless stated, bio, pronouns, or how they speak)",
  "conversationStyle": "Short description of how they text: shortcuts they use (e.g. u, rn, fr, idk, wbu), lowercase or caps, energy level, emojis, slang",
  "relationshipType": "one of: stranger, fan, client, collaborator, friend",
  "newFacts": ["fact 1", "fact 2"],
  "importantDates": [
    { "title": "e.g. Birthday / Final Exam / Vacation / Project Launch", "date": "e.g. Oct 12 or next week", "details": "context" }
  ],
  "favoriteThings": [
    { "category": "music/game/food/creator/hobby/general", "item": "name of favorite thing" }
  ],
  "lifeEvents": [
    { "title": "e.g. Moving to new apartment / Studying for exams / Starting new job", "details": "brief context", "dateOrTime": "timeframe" }
  ],
  "personalNotes": "1-2 sentence ongoing note of who this person is, their current vibe or emotional state, and what is happening in their life right now.",
  "rollingSummary": "Concise 1-3 sentence summary of the ongoing relationship and conversation context.",
  "mentionedPeople": [
    {
      "name": "Name of any friend, relative, or person mentioned in the conversation (e.g. Roni, Rajveer, Moksha, Fami, Arun, etc.)",
      "relationship": "Relationship term: sister, bro, friend, lover, relative, cousin",
      "notes": "What was discussed or their role"
    }
  ]
}
Only extract genuine details explicitly stated or strongly implied by the user. Do not invent information. If an array has no new items, leave it empty.`;

      const response = await this.client.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are an empathetic, razor-sharp chat memory analyst. Output pure valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.25,
        response_format: { type: 'json_object' }
      });

      const parsed = JSON.parse(response.choices[0].message.content.trim());

      if (parsed.nickname && parsed.nickname.trim() !== '') {
        memory.nickname = parsed.nickname.trim();
      }
      if (parsed.gender && ['female', 'male', 'neutral', 'unknown'].includes(parsed.gender)) {
        memory.gender = parsed.gender;
      }
      if (parsed.conversationStyle) {
        memory.conversationStyle = parsed.conversationStyle;
      }
      if (parsed.relationshipType) {
        memory.relationshipType = parsed.relationshipType;
      }
      if (parsed.personalNotes) {
        memory.personalNotes = parsed.personalNotes;
      }
      if (parsed.rollingSummary) {
        memory.rollingSummary = parsed.rollingSummary;
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

      console.log(`🧠 [Deep Memory Updated] @${memory.username}: Dates=${memory.importantDates.length}, Favs=${memory.favoriteThings.length}, Events=${memory.lifeEvents.length}`);

      // Dynamically sync updated memory into SocialGraph so People Menu cards update in real time!
      try {
        const SocialGraph = require('../models/SocialGraph');
        const socialGraphService = require('./socialGraphService');
        const cleanU = (memory.username || '').replace(/^@/, '').toLowerCase().trim();
        const displayName = memory.name && !memory.name.startsWith('User_') ? memory.name.trim() : (memory.nickname || memory.username);

        const node = await SocialGraph.findOne({
          $or: [
            { senderId: memory.senderId },
            { instagramHandle: `@${cleanU}` },
            { instagramHandle: cleanU },
            { aliases: cleanU }
          ]
        });

        const allFacts = [
          ...(memory.facts || []).map(f => f.fact),
          ...(memory.importantDates || []).map(d => `${d.title}: ${d.date} ${d.details ? `(${d.details})` : ''}`),
          ...(memory.favoriteThings || []).map(f => `Favorite ${f.category}: ${f.item}`),
          ...(memory.lifeEvents || []).map(e => `${e.title}: ${e.details}`)
        ].filter(Boolean);

        if (node) {
          node.lore = Array.from(new Set([...(node.lore || []), ...allFacts]));
          if (memory.profilePic) node.profilePic = memory.profilePic;
          if (memory.gender && node.gender === 'unknown') node.gender = memory.gender;
          node.updatedAt = new Date();
          await node.save();
        } else if (!/^(test_|ig_tester_|catovidz$|me$|user_\d+)/i.test(cleanU)) {
          await SocialGraph.create({
            name: displayName,
            aliases: [cleanU, (memory.name || '').toLowerCase()].filter(Boolean),
            instagramHandle: `@${cleanU}`,
            senderId: memory.senderId,
            profilePic: memory.profilePic || '',
            gender: memory.gender || 'unknown',
            relationshipToSam: memory.relationshipType && memory.relationshipType !== 'stranger'
              ? `${memory.relationshipType.charAt(0).toUpperCase() + memory.relationshipType.slice(1)}`
              : 'Follower / Online Contact',
            connections: [],
            lore: allFacts.length > 0 ? allFacts : (memory.personalNotes ? [memory.personalNotes] : []),
            languages: ['English'],
            roastStyle: 'Casual & friendly'
          });
        }
        socialGraphService.clearCache();
        console.log(`🌳 [SocialGraph Dynamic Sync]: Live updated card for @${cleanU}`);
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
   * Starts a daily scheduler to auto-purge messages older than 3 days
   */
  startDailyCleanup(days = 3) {
    console.log(`🧹 Daily cleanup scheduler initialized: automatically deleting chat history older than ${days} days.`);
    // Run once after 2 minutes
    setTimeout(() => this.cleanOldMessages(days), 2 * 60 * 1000);
    // Run every 12 hours
    setInterval(() => this.cleanOldMessages(days), 12 * 60 * 60 * 1000);
  }
}

module.exports = new MemoryService();
