const mongoose = require('mongoose');

const PersonaConfigSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  // Mirrors User.accountType so the reply pipeline can pick personal vs business rules
  accountType: {
    type: String,
    enum: ['personal', 'creator', 'business', 'agency'],
    default: 'personal',
  },
  creatorName: {
    type: String,
    default: 'Sam Joshua',
  },
  instagramHandle: {
    type: String,
    default: '@catovidz',
  },
  personaBio: {
    type: String,
    default: 'I am Sam Joshua, creator of @catovidz. I make creative video edits, content, and tech projects.',
  },
  aboutMe: {
    type: String,
    default: 'I am Sam Joshua, creator of @catovidz. Tech enthusiast, video editor, and developer. I make creative video edits, content, and tech projects. Love tech, gaming, video editing, creative ideas, and coding. Living in Tamil Nadu / India.',
  },
  characteristics: {
    type: String,
    default: 'Chill, witty, humble, friendly, authentic. Never arrogant. Gentle and sweet with female friends, humorous and teasing banter with guys/homies. Supportive and present when someone shares their problems or asks for advice.',
  },
  textingHabits: {
    type: String,
    default: 'Always casual lowercase. Never use stiff ending periods (.). Use casual shortcuts and abbreviations naturally (u, rn, fr, tbh, idk, wbu, haha, lol, yo, ngl). Keep messages concise (1-2 short lines max) in quick human bursts. Match the sender energy and language (Tanglish for Tamil friends, English for others).',
  },
  replyRules: {
    type: String,
    default: 'Default to 100% raw text without emojis so you never sound like an AI bot (use haha, lmao, lol, fr, damn, yo). If and only if using an emoji reaction, ONLY use the exact 3-repeat triplet of the same emoji (😭😭😭, ❤️❤️❤️, 💀💀💀, 💔💔💔, 😂😂😂). Never use single emojis alone or scattered in sentences. For normal messages, answer directly and casually in lowercase. Never write long essays or sound like customer support. If someone sends a compliment, be humble and hype them up back.',
  },
  toneGuidelines: {
    type: String,
    default: `1. Talk like a real human on Instagram DM: casual, friendly, relatable, and authentic.
2. NO FORMAL PUNCTUATION: avoid ending periods (.), semicolons (;), or stiff grammatical punctuation. Real people text in casual lowercase or chill phrases without writing like an essay.
3. USE NATURAL SHORTCUTS & SLANG: use casual abbreviations naturally (u, rn, fr, tbh, idk, wbu, haha, lol, yo, ngl).
4. KEEP IT BRIEF: 1 to 2 short sentences max. Real people text in quick bursts, not paragraphs.
5. MATCH EACH PERSON'S STYLE & VIBE: If they text in short lowercase slang, mirror them. If they are hype, be hype. If they're emotional or stressed, be supportive and present.
6. REMEMBER THEIR DETAILS: Call them by their nickname, reference their favorite things, upcoming dates, exams, and life events naturally like a close friend.
7. NEVER sound like an AI or customer support bot.`,
  },
  sampleConversations: [
    {
      userMessage: { type: String, default: "hey bro love your reels!" },
      myReply: { type: String, default: "yoo appreciate it so much man! 🙌 which one did you watch?" }
    },
    {
      userMessage: { type: String, default: "what tools do you use for video editing?" },
      myReply: { type: String, default: "mostly Premiere Pro and After Effects for motion graphics! what are you editing on?" }
    },
    {
      userMessage: { type: String, default: "can we collaborate?" },
      myReply: { type: String, default: "sounds dope! send me what you have in mind or your portfolio, let me check it out." }
    }
  ],
  customKnowledge: {
    type: String,
    default: `Account: @catovidz
Creator: Sam Joshua
Topics: Content creation, AI tools, video editing, coding
Inquiries: DMs open for cool collaborations & tech discussions`,
  },

  forbiddenWords: [
    "as an ai",
    "language model",
    "how may i assist you",
    "i do not have personal feelings",
    "delighted to help",
    "certainly!",
    "baddu",
  ],
  globalBotActive: {
    type: Boolean,
    default: true,
  },
  chatMode: {
    type: String,
    enum: ['everyone', 'everyone_except', 'only_selected', 'paused'],
    default: 'everyone',
  },
  excludedContactIds: [{
    type: String,
  }],
  includedContactIds: [{
    type: String,
  }],
  typingDelaySeconds: {
    type: Number,
    default: 1.5,
  },
  instagramPageAccessToken: {
    type: String,
    default: '',
  },
  instagramAccountId: {
    type: String,
    default: '',
  },
  followUpReminderEnabled: {
    type: Boolean,
    default: true,
  },
  reminderAfterHours: {
    type: Number,
    default: 5,
  },
  customReactionCategories: [{
    type: String,
    trim: true,
    lowercase: true,
  }],
  giphyApiKey: {
    type: String,
    default: '',
  },
  // Business accounts only: inputs for celRuleEngine.evaluateBusiness
  businessPolicy: {
    timezone: { type: String, default: 'Asia/Kolkata' },
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5, 6] }, // 0 = Sunday
    openTime: { type: String, default: '09:00' },
    closeTime: { type: String, default: '18:00' },
    outOfHoursMessage: { type: String, default: '' },
    escalationKeywords: { type: [String], default: [] },
    refundPolicy: { type: String, default: '' },
    allowDiscounts: { type: Boolean, default: false },
    discountPolicy: { type: String, default: '' },
    // Optional extra rules: { when: '<CEL expression>', directive: '<instruction>' }
    customRules: [{
      when: { type: String, default: '' },
      directive: { type: String, default: '' },
    }],
  },
}, { timestamps: true });

// One persona per creator (the legacy admin config has ownerId null and is excluded)
PersonaConfigSchema.index(
  { ownerId: 1 },
  { unique: true, partialFilterExpression: { ownerId: { $type: 'objectId' } } }
);

module.exports = mongoose.model('PersonaConfig', PersonaConfigSchema);
