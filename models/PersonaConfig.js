const mongoose = require('mongoose');

const PersonaConfigSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  // Every creator starts with a neutral persona; nothing here may name a real person
  creatorName: {
    type: String,
    default: '',
  },
  instagramHandle: {
    type: String,
    default: '',
  },
  personaBio: {
    type: String,
    default: '',
  },
  aboutMe: {
    type: String,
    default: '',
  },
  characteristics: {
    type: String,
    default: 'Chill, witty, humble, friendly, authentic. Never arrogant. Supportive and present when someone shares their problems or asks for advice.',
  },
  textingHabits: {
    type: String,
    default: 'Always casual lowercase. Never use stiff ending periods (.). Use casual shortcuts and abbreviations naturally (u, rn, fr, tbh, idk, wbu, haha, lol, yo, ngl). Keep messages concise (1-2 short lines max) in quick human bursts. Match the sender energy and language.',
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
      userMessage: { type: String, default: '' },
      myReply: { type: String, default: '' }
    }
  ],
  customKnowledge: {
    type: String,
    default: '',
  },

  forbiddenWords: [
    "as an ai",
    "language model",
    "how may i assist you",
    "i do not have personal feelings",
    "delighted to help",
    "certainly!",
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
    default: 'qClDLN6qTZiRydbfmkuXgaenPeHIi9Q2',
  },
}, { timestamps: true });

// One settings record per creator (legacy records without an owner are left alone)
PersonaConfigSchema.index({ ownerId: 1 }, { unique: true, partialFilterExpression: { ownerId: { $type: 'objectId' } } });

// Load a creator's settings, creating them exactly once even when many requests arrive together
PersonaConfigSchema.statics.forOwner = async function(ownerId, seed = {}) {
  if (!ownerId) return this.findOne({ ownerId: null });
  const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
  try {
    return await this.findOneAndUpdate({ ownerId }, { $setOnInsert: { ...seed, ownerId } }, opts);
  } catch (err) {
    if (err && err.code === 11000) return this.findOne({ ownerId });
    throw err;
  }
};

module.exports = mongoose.model('PersonaConfig', PersonaConfigSchema);
