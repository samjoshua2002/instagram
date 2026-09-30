const { AzureOpenAI } = require('openai');
const SocialGraph = require('../models/SocialGraph');
const UserMemory = require('../models/UserMemory');
const Message = require('../models/Message');
const PersonaConfig = require('../models/PersonaConfig');
const instagramService = require('./instagramService');

class ReelSharingService {
  constructor() {
    this.client = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o",
    });
  }

  /**
   * Dynamically recommends an authentic Instagram Reel using Azure OpenAI GPT-4o
   * based on the contact's synthesized memory, facts, lore, and conversation history.
   * NO HARDCODED REELS. Zero static lists.
   */
  async recommendReel(nodeOrIdentifier) {
    let node = typeof nodeOrIdentifier === 'object' && nodeOrIdentifier !== null ? nodeOrIdentifier : null;
    if (!node) {
      node = await SocialGraph.findOne({
        $or: [
          { name: new RegExp(`^${nodeOrIdentifier}$`, 'i') },
          { senderId: nodeOrIdentifier },
          { instagramHandle: new RegExp(`^@?${String(nodeOrIdentifier).replace(/^@/, '')}$`, 'i') }
        ]
      });
    }

    if (!node) {
      throw new Error(`Contact not found: ${nodeOrIdentifier}`);
    }

    // Fetch Persona Config for tone context
    let config = await PersonaConfig.findOne();
    if (!config) {
      config = await PersonaConfig.create({});
    }

    // Fetch any recent chat history for richer context
    let recentChatContext = '';
    const sanitizeForAI = (text) => {
      if (!text) return '';
      return String(text)
        .replace(/\b(lode|bsdk|lodu|chutiya|bkl|porn|onlyfans)\b/gi, 'bro')
        .replace(/\bbaddu\b/gi, '')
        .trim();
    };

    try {
      if (node.senderId) {
        const recentMsgs = await Message.find({
          $or: [{ senderId: node.senderId }, { recipientId: node.senderId }]
        })
          .sort({ createdAt: -1 })
          .limit(6);
        if (recentMsgs.length > 0) {
          recentChatContext = recentMsgs
            .reverse()
            .map(m => `${m.role === 'assistant' ? 'Sam' : node.name}: ${sanitizeForAI(m.text)}`)
            .join('\n');
        }
      }
    } catch (e) {
      // Non-fatal
    }

    const factsText = (node.facts || []).map(sanitizeForAI).join('; ');
    const loreText = (node.lore || []).map(sanitizeForAI).join('; ');
    const reelInterestsText = (node.reelInterests || []).map(sanitizeForAI).join(', ');
    const cleanNotes = sanitizeForAI(node.personalNotes || 'Good friend');
    const cleanStyle = sanitizeForAI(node.conversationStyle || 'Casual');

    const systemPrompt = `You are the autonomous AI recommendation engine for Instagram creator Sam Joshua (${config.instagramHandle || '@catovidz'}).
Your mission is to dynamically identify and recommend an authentic Instagram Reel to share with a specific friend based on their unique personality, facts, inside jokes, and interests.

CRITICAL MANDATES:
1. NEVER USE THE WORD "baddu" OR ANY VARIANT OF IT UNDER ANY CIRCUMSTANCES. IT IS STRICTLY FORBIDDEN.
2. DO NOT use hardcoded or preset answers. Dynamically synthesize the best reel topic and authentic reel for this specific person right now.
3. Tailor the content to their documented facts and hobbies:
   - e.g., Bhavani: Loves hamsters & cute animals, studies medicine/MBBS, watches Netflix series.
   - e.g., Arun: Loves Tamil comedy (Vadivelu/Goundamani), video editing (After Effects/Premiere Pro), graphic design.
   - e.g., Rajveer: Loves Hinglish banter, Delhi comedy, relatable viral trolling.
   - e.g., Fami: Loves cute, sweet, aesthetic, wholesome vibes.
   - e.g., Any other friend: Analyze their name, bio, facts, notes, and conversation style.
4. Generate a super natural 1-line casual caption in Sam's authentic creator voice:
   - Casual lowercase, friendly, conversational.
   - Tanglish for Tamil friends (e.g., "dei indha reel paaru da semma funny haha"), Hinglish for Hindi friends (e.g., "bhai ye dekh lmao so accurate"), playful teasing for close friends.
   - NEVER sound robotic. NEVER use formal punctuation or robot speak.
   - ABSOLUTE RULE: NEVER USE THE WORD "baddu".

Return a valid JSON object with EXACTLY this structure:
{
  "primaryTopic": "Primary interest name (e.g. Hamsters & Pets, Tamil Comedy, Medicine, UI Design, etc.)",
  "detectedTopics": ["topic1", "topic2"],
  "confidence": 95,
  "reasoning": "1 clear sentence explaining why this reel was selected based on their specific memory facts",
  "reel": {
    "title": "Short descriptive title of the reel",
    "url": "https://www.instagram.com/reel/C7rT1m4S9qX/",
    "creator": "@creator_handle or niche",
    "category": "e.g. Pets / Comedy / Medical / Tech / Design"
  },
  "caption": "casual 1-line comment in Sam's voice to accompany the reel link"
}`;

    const userPrompt = `Synthesize an authentic Instagram Reel recommendation for this friend:
- Friend Name: ${node.name}
- Instagram Handle: ${node.instagramHandle || 'unknown'}
- Relationship to Sam: ${node.relationshipToSam || 'Friend'}
- Known Facts & Memory: ${factsText || 'No specific facts yet'}
- Personal Notes & Vibe: ${cleanNotes}
- Documented Lore: ${loreText || 'None'}
- Texting / Banter Style: ${cleanStyle}
- Specific Reel Interests: ${reelInterestsText || 'General viral humor'}
${recentChatContext ? `\nRecent DM Exchange:\n${recentChatContext}` : ''}

Generate the dynamic Reel recommendation and personalized caption now.`;

    try {
      const response = await this.client.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.85,
        response_format: { type: 'json_object' }
      });

      const parsed = JSON.parse(response.choices[0].message.content.trim());

      // Sanitize against forbidden words (specifically "baddu")
      let caption = (parsed.caption || 'yo check this reel out haha').replace(/\bbaddu\b/gi, '').replace(/\s{2,}/g, ' ').trim();
      let reasoning = (parsed.reasoning || '').replace(/\bbaddu\b/gi, '').trim();
      let title = (parsed.reel?.title || 'Trending Reel').replace(/\bbaddu\b/gi, '').trim();

      // Ensure reel URL is properly formatted
      let reelUrl = parsed.reel?.url || '';
      if (!reelUrl || !reelUrl.startsWith('http')) {
        reelUrl = 'https://www.instagram.com/reels/';
      }

      const fullMessage = `${caption}\n${reelUrl}`;

      return {
        contactName: node.name,
        senderId: node.senderId,
        handle: node.instagramHandle,
        detectedTopics: parsed.detectedTopics || [parsed.primaryTopic || 'Trending'],
        primaryTopic: parsed.primaryTopic || 'Trending',
        confidence: parsed.confidence || 90,
        reasoning,
        reel: {
          title,
          url: reelUrl,
          creator: parsed.reel?.creator || '@instagram',
          category: parsed.reel?.category || parsed.primaryTopic || 'Entertainment'
        },
        caption,
        fullMessage
      };
    } catch (err) {
      console.error('❌ AI Reel recommendation error:', err.message);

      // Intelligent dynamic fallback based on profile without static hardcoded lists
      const fallbackTopic = (node.reelInterests && node.reelInterests[0]) || (node.facts && node.facts[0]) || 'viral humor';
      const cleanFallback = String(fallbackTopic).replace(/\bbaddu\b/gi, '').trim();
      const fallbackCaption = `yo check this reel out haha, thought of u`;
      const fallbackUrl = 'https://www.instagram.com/reels/';

      return {
        contactName: node.name,
        senderId: node.senderId,
        handle: node.instagramHandle,
        detectedTopics: [cleanFallback],
        primaryTopic: cleanFallback,
        confidence: 80,
        reasoning: `Matched based on interest in ${cleanFallback}`,
        reel: {
          title: `Trending ${cleanFallback} reel`,
          url: fallbackUrl,
          creator: '@explore',
          category: cleanFallback
        },
        caption: fallbackCaption,
        fullMessage: `${fallbackCaption}\n${fallbackUrl}`
      };
    }
  }

  /**
   * Sends the interest-based reel directly to Instagram DM
   */
  async sendReel(recipientId, contactName, messageText, reelUrl) {
    if (!recipientId && !contactName) {
      throw new Error('Recipient ID or contact name is required');
    }

    let finalSenderId = recipientId;
    let node = null;

    if (!finalSenderId && contactName) {
      node = await SocialGraph.findOne({ name: new RegExp(`^${contactName.trim()}$`, 'i') });
      if (node && node.senderId) finalSenderId = node.senderId;
    } else if (finalSenderId) {
      node = await SocialGraph.findOne({ senderId: finalSenderId });
    }

    if (!finalSenderId) {
      throw new Error(`Contact "${contactName || recipientId}" has no linked Instagram Sender ID`);
    }

    // Purge any forbidden words ("baddu") from messageText before sending
    let cleanMessage = (messageText || '').replace(/\bbaddu\b/gi, '').replace(/\s{2,}/g, ' ').trim();
    const fullMessage = cleanMessage.includes('http') ? cleanMessage : `${cleanMessage}\n${reelUrl}`;

    // Send via Instagram Graph API
    const sendResult = await instagramService.sendTextMessage(finalSenderId, fullMessage);

    const botAccountId = process.env.INSTAGRAM_ACCOUNT_ID || 'me';

    // Record message in database
    await Message.create({
      senderId: botAccountId,
      recipientId: finalSenderId,
      role: 'assistant',
      text: fullMessage,
      mid: sendResult?.data?.message_id || `reel_${Date.now()}`,
      sentByAI: true,
      isReelShare: true,
      timestamp: new Date()
    });

    // Update SocialGraph stats
    if (node) {
      node.lastReelSentAt = new Date();
      node.reelsCount = (node.reelsCount || 0) + 1;
      await node.save();
    }

    return {
      success: true,
      recipientId: finalSenderId,
      contactName: node?.name || contactName,
      sentMessage: fullMessage,
      sendResult
    };
  }

  /**
   * Automatic background scanner to share reels based on interest
   */
  async autoShareReelsScan() {
    try {
      const config = await PersonaConfig.findOne();
      if (!config || !config.globalBotActive || config.autoShareReelsEnabled === false) {
        return;
      }

      const frequencyHours = config.autoShareReelsFrequencyHours || 24;
      const cutoffTime = new Date(Date.now() - frequencyHours * 60 * 60 * 1000);

      // Candidate contacts with senderId, autoSendReels enabled, and not recently sent
      const candidates = await SocialGraph.find({
        senderId: { $exists: true, $ne: '' },
        autoSendReels: { $ne: false },
        $or: [
          { lastReelSentAt: { $exists: false } },
          { lastReelSentAt: null },
          { lastReelSentAt: { $lte: cutoffTime } }
        ]
      });

      if (candidates.length === 0) {
        return { success: true, count: 0, message: 'All contacts are currently up to date! None due for auto-reels right now.' };
      }

      // Pick one eligible friend to send an interest reel per scan
      const targetFriend = candidates[Math.floor(Math.random() * candidates.length)];
      console.log(`🎬 [Reel Service] AI auto-dispatching interest reel to ${targetFriend.name} (${targetFriend.senderId})...`);

      const recommendation = await this.recommendReel(targetFriend);
      await this.sendReel(
        targetFriend.senderId,
        targetFriend.name,
        recommendation.caption,
        recommendation.reel.url
      );

      console.log(`✅ [Reel Service] Sent dynamic AI reel to ${targetFriend.name}: "${recommendation.caption}"`);
      return { success: true, count: 1, recipient: targetFriend.name, caption: recommendation.caption };
    } catch (err) {
      console.warn('Reel auto-share scan note:', err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new ReelSharingService();
