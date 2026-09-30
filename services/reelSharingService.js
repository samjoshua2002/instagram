const SocialGraph = require('../models/SocialGraph');
const UserMemory = require('../models/UserMemory');
const Message = require('../models/Message');
const PersonaConfig = require('../models/PersonaConfig');
const instagramService = require('./instagramService');
const azureOpenAI = require('./azureOpenAI');

// Curated high-engagement viral reel library by topic
const REEL_LIBRARY = {
  hamsters: [
    { title: 'Hamster snack emergency 🐹', url: 'https://www.instagram.com/reel/C35uH7kPq4z/', topic: 'hamsters', tags: ['hamsters', 'cute pets'] },
    { title: 'Tiny hamster life drama', url: 'https://www.instagram.com/reel/C8x7k2pM0y1/', topic: 'hamsters', tags: ['hamsters', 'animals'] }
  ],
  medicine: [
    { title: 'Med student surviving anatomy exams 🩺', url: 'https://www.instagram.com/reel/C6mQ0x0S3d5/', topic: 'medicine', tags: ['medicine', 'med school', 'study'] },
    { title: 'Doctor shift reality vs expectations', url: 'https://www.instagram.com/reel/C4tN2g8r1vB/', topic: 'medicine', tags: ['medicine', 'doctor humor'] }
  ],
  tamil_comedy: [
    { title: 'Semma relatable Tamil friend banter 😂', url: 'https://www.instagram.com/reel/C9aP1x8S2wQ/', topic: 'tamil_comedy', tags: ['tamil memes', 'tanglish comedy'] },
    { title: 'When your friend gives free advice in Tamil', url: 'https://www.instagram.com/reel/C5yH4n6S1qR/', topic: 'tamil_comedy', tags: ['tamil humor', 'bro banter'] }
  ],
  hindi_memes: [
    { title: 'Bro drama reality check 💀', url: 'https://www.instagram.com/reel/C7rT1m4S9qX/', topic: 'hindi_memes', tags: ['hinglish memes', 'bro trolling'] },
    { title: 'Over-dramatic homie in group chat', url: 'https://www.instagram.com/reel/C2bN6x1S8vM/', topic: 'hindi_memes', tags: ['desi comedy', 'dramebaaz'] }
  ],
  design_video: [
    { title: 'Crazy After Effects 3D motion transition 🎬', url: 'https://www.instagram.com/reel/C8kP2q9M7eW/', topic: 'design_video', tags: ['video editing', 'motion graphics'] },
    { title: 'Graphic design client revisions nightmare 🎨', url: 'https://www.instagram.com/reel/C5tY8m2R1qS/', topic: 'design_video', tags: ['graphic design', 'editing'] }
  ],
  cute_wholesome: [
    { title: 'Wholesome cute animal antics ✨', url: 'https://www.instagram.com/reel/C7uP3m9S1wA/', topic: 'cute_wholesome', tags: ['cute', 'wholesome', 'animals'] },
    { title: 'Fluffy puppy morning happiness', url: 'https://www.instagram.com/reel/C3tN8m1S2vL/', topic: 'cute_wholesome', tags: ['pets', 'sweet vibes'] }
  ],
  aesthetic_music: [
    { title: 'Late night drive aesthetic vibes 🎧', url: 'https://www.instagram.com/reel/C6bN2p8M1vS/', topic: 'aesthetic_music', tags: ['aesthetic', 'music', 'cinematic'] },
    { title: 'Retro rainy day lofi atmosphere', url: 'https://www.instagram.com/reel/C9yM1v7S4eR/', topic: 'aesthetic_music', tags: ['lofi', 'mood', 'quotes'] }
  ],
  office_work: [
    { title: 'Corporate meeting that could have been an email ☕', url: 'https://www.instagram.com/reel/C4xM1v8S9qW/', topic: 'office_work', tags: ['work humor', 'office life'] },
    { title: 'Leaving office on Friday like a boss', url: 'https://www.instagram.com/reel/C8pT2m1S6vR/', topic: 'office_work', tags: ['corporate', 'weekend'] }
  ],
  netflix_movies: [
    { title: 'When the Netflix plot twist hits out of nowhere 🍿', url: 'https://www.instagram.com/reel/C5wN1p9S2qM/', topic: 'netflix_movies', tags: ['netflix', 'movies', 'binge watch'] }
  ],
  general_humor: [
    { title: 'The most unhinged funny reel of the week 😂', url: 'https://www.instagram.com/reel/C9tL4m1S7vK/', topic: 'general_humor', tags: ['comedy', 'viral meme'] }
  ]
};

class ReelSharingService {
  /**
   * Intelligently extracts interest topics from SocialGraph & UserMemory data
   */
  extractInterests(node) {
    if (!node) return ['comedy', 'viral memes'];

    const interests = new Set();
    if (Array.isArray(node.reelInterests) && node.reelInterests.length > 0) {
      node.reelInterests.forEach(i => interests.add(i.toLowerCase().trim()));
    }

    const allText = [
      node.name || '',
      node.relationshipToSam || '',
      node.category || '',
      node.personalNotes || '',
      ...(node.lore || []),
      ...(node.facts || []),
      node.roastStyle || '',
      node.conversationStyle || ''
    ].join(' ').toLowerCase();

    // Contextual topic matching
    if (/hamster|hamsters|guinea pig|cage|fluffy/i.test(allText)) {
      interests.add('hamsters');
    }
    if (/medicine|doctor|medical|anatomy|mbbs|hospital|patient|biology/i.test(allText)) {
      interests.add('medicine');
    }
    if (/tamil|tanglish|chennai|dei|machan|loosu|semma|apdiya/i.test(allText)) {
      interests.add('tamil_comedy');
    }
    if (/hindi|hinglish|bhai|bkl|lode|dramebaaz|drama king|delhi/i.test(allText)) {
      interests.add('hindi_memes');
    }
    if (/design|graphic|editing|premiere|after effects|photoshop|motion|render|video/i.test(allText)) {
      interests.add('design_video');
    }
    if (/cute|sweet|moi|ragebait|innocent|soft|baby/i.test(allText)) {
      interests.add('cute_wholesome');
    }
    if (/aesthetic|music|quotes|poetry|dark|noir|vibe|lofi/i.test(allText)) {
      interests.add('aesthetic_music');
    }
    if (/netflix|plan|series|watchlist|movie|binge|kdrama|anime/i.test(allText)) {
      interests.add('netflix_movies');
    }
    if (/office|senior|corporate|work|boss|hr|colleague/i.test(allText)) {
      interests.add('office_work');
    }

    if (interests.size === 0) {
      interests.add('general_humor');
    }

    return Array.from(interests);
  }

  /**
   * Recommends a high-interest reel matching a contact's profile
   */
  async recommendReel(nodeOrIdentifier) {
    let node = typeof nodeOrIdentifier === 'object' ? nodeOrIdentifier : null;
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

    const detectedTopics = this.extractInterests(node);
    const primaryTopic = detectedTopics[0] || 'general_humor';
    const pool = REEL_LIBRARY[primaryTopic] || REEL_LIBRARY.general_humor;
    const selectedReel = pool[Math.floor(Math.random() * pool.length)];

    // Generate tailored message matching Sam's authentic tone and friend's slang
    const caption = this.generateCustomCaption(node, primaryTopic, selectedReel);
    const fullMessage = `${caption}\n${selectedReel.url}`;

    return {
      contactName: node.name,
      senderId: node.senderId,
      handle: node.instagramHandle,
      detectedTopics,
      primaryTopic,
      reel: selectedReel,
      caption,
      fullMessage
    };
  }

  /**
   * Creates an authentic caption in Sam's voice matching the friend's slang/relationship
   */
  generateCustomCaption(node, topic, reel) {
    const name = (node.name || '').trim();
    const nameLower = name.toLowerCase();

    // 1. Bhavani (Hamsters, Medicine, Netflix)
    if (nameLower.includes('bhavani') || topic === 'hamsters') {
      const options = [
        `bhavani saw this hamster reel and immediately thought of u haha 🐹`,
        `omg look at this hamster drama fr haha reminded me of u`,
        `bhavani check this out lmao, hamster energy on point 🐹`
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 2. Arun (Tamil / Tanglish homie banter)
    if (nameLower.includes('arun') || topic === 'tamil_comedy') {
      const options = [
        `dei indha reel paaru da semma funny haha`,
        `dei arun unakku dhaan da indha reel, accurate ah irukku paaru 😂`,
        `machan check this reel out, semma relatable da lmao`
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 3. Rajveer / Moksha (Hinglish drama / trolling)
    if (nameLower.includes('rajveer') || nameLower.includes('moksha') || topic === 'hindi_memes') {
      const options = [
        `bhai ye dekh lmao so accurate`,
        `ye reel dekh dramebaaz haha reminded me of u`,
        `bhai checkout this reel lmao, literal inside joke vibes`
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 4. Fami (Sweet, cute, wholesome)
    if (nameLower.includes('fami') || topic === 'cute_wholesome') {
      const options = [
        `saw this cute reel and wanted to share with u ✨`,
        `omg this is so sweet haha, check this out!`,
        `look at this cute reel haha, had to send it to u`
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 5. Design & Video editing
    if (topic === 'design_video') {
      const options = [
        `check out this motion graphic transition, super clean edit 🔥`,
        `bro look at the keyframing here, pretty sick visual`,
        `this edit is insane fr, check it out`
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // 6. Aesthetic & Music
    if (topic === 'aesthetic_music') {
      const options = [
        `the vibes on this reel are unreal ✨`,
        `late night vibe check, this sound is so good`,
        `saw this cinematic reel and loved the atmosphere`
      ];
      return options[Math.floor(Math.random() * options.length)];
    }

    // General fallback
    return `yo check this reel out haha, pretty good`;
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

    const fullMessage = messageText.includes('http') ? messageText : `${messageText}\n${reelUrl}`;

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

      if (candidates.length === 0) return;

      // Pick one eligible friend to send an interest reel per scan
      const targetFriend = candidates[Math.floor(Math.random() * candidates.length)];
      console.log(`🎬 [Reel Service] Auto-dispatching interest reel to ${targetFriend.name} (${targetFriend.senderId})...`);

      const recommendation = await this.recommendReel(targetFriend);
      await this.sendReel(
        targetFriend.senderId,
        targetFriend.name,
        recommendation.caption,
        recommendation.reel.url
      );

      console.log(`✅ [Reel Service] Sent interest reel to ${targetFriend.name}: "${recommendation.caption}"`);
    } catch (err) {
      console.warn('Reel auto-share scan note:', err.message);
    }
  }
}

module.exports = new ReelSharingService();
