const mongoose = require('mongoose');

const UserMemorySchema = new mongoose.Schema({
  // Creator (tenant) this contact belongs to; null for legacy admin-bot records
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  senderId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  username: {
    type: String,
    default: 'Instagram User',
  },
  name: {
    type: String,
    default: '',
  },
  profilePic: {
    type: String,
    default: '',
  },
  conversationStyle: {
    type: String,
    default: 'Casual & friendly',
  },
  relationshipType: {
    type: String,
    enum: ['stranger', 'fan', 'client', 'collaborator', 'friend'],
    default: 'stranger',
  },
  nickname: {
    type: String,
    default: '',
  },
  gender: {
    type: String,
    enum: ['female', 'male', 'neutral', 'unknown'],
    default: 'unknown',
  },
  importantDates: [{
    title: { type: String, required: true },
    date: { type: String, default: '' },
    details: { type: String, default: '' },
  }],
  favoriteThings: [{
    category: { type: String, default: 'general' },
    item: { type: String, required: true },
  }],
  lifeEvents: [{
    title: { type: String, required: true },
    details: { type: String, default: '' },
    dateOrTime: { type: String, default: '' },
  }],
  personalNotes: {
    type: String,
    default: '',
  },
  dob: {
    type: String,
    default: '',
  },
  roastStyle: {
    type: String,
    default: '',
  },
  samSpeakingStyleWithUser: {
    type: String,
    default: '',
  },
  insideJokes: [{
    type: String,
  }],
  fewShotExchanges: [{
    userMessage: { type: String, default: '' },
    myReply: { type: String, default: '' },
  }],
  recentChatBuffer: [{
    role: { type: String, enum: ['user', 'assistant'] },
    text: { type: String },
    timestamp: { type: Date, default: Date.now },
  }],
  facts: [{
    fact: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
  }],
  rollingSummary: {
    type: String,
    default: 'First time contacting.',
  },
  tonePreference: {
    type: String,
    default: 'Match their energy, stay authentic and casual.',
  },
  aiEnabled: {
    type: Boolean,
    default: true,
  },
  // Business handoff: set when a customer escalates; the bot pauses until a human resolves it
  handoffRequestedAt: {
    type: Date,
    default: null,
  },
  handoffReason: {
    type: String,
    default: '',
  },
  replyToMessages: {
    type: Boolean,
    default: true,
  },
  replyToReelsAndPosts: {
    type: Boolean,
    default: true,
  },
  remindersEnabled: {
    type: Boolean,
    default: true,
  },
  messageCount: {
    type: Number,
    default: 0,
  },
  reelsCount: {
    type: Number,
    default: 0,
  },
  lastInteraction: {
    type: Date,
    default: Date.now,
  },
  lastReminderSentAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

// One memory per contact per creator (legacy records without ownerId are excluded)
UserMemorySchema.index(
  { ownerId: 1, senderId: 1 },
  { unique: true, partialFilterExpression: { ownerId: { $type: 'objectId' } } }
);

module.exports = mongoose.model('UserMemory', UserMemorySchema);
