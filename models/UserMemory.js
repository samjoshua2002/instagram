const mongoose = require('mongoose');

const UserMemorySchema = new mongoose.Schema({
  // Creator (tenant) this contact belongs to; null for legacy admin-bot records
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  // Instagram-scoped sender id. Unique per owner only (see the compound index below), never globally:
  // the same id can be a contact of more than one workspace
  senderId: {
    type: String,
    required: true,
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
  // Age they told in DMs (latest statement wins); used to fill the birth year
  age: {
    type: Number,
    default: null,
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
    // "you": typed in by the owner (never condensed or dropped by the tidy-up); "learned": from the chat
    source: { type: String, enum: ['you', 'learned'], default: 'learned' },
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
  // They said they're busy ("going to study", "going out"): no check-ins until they're back
  away: {
    reason: { type: String, default: '' },
    since: { type: Date, default: null },
    until: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  // Last check-in the AI started itself, and the one question it asked (answer is learned into memory)
  lastCheckInAt: { type: Date, default: null },
  pendingQuestion: {
    text: { type: String, default: '' },
    topic: { type: String, default: '' },
    askedAt: { type: Date, default: null },
  },
}, { timestamps: true, versionKey: false });

// One memory per contact per creator (legacy ownerless records are unique per senderId too).
// Existing databases: run scripts/migrate_indexes.js once to drop the old global senderId_1 unique
// index and the old partial ownerId_1_senderId_1 index before this one can be built.
UserMemorySchema.index({ ownerId: 1, senderId: 1 }, { unique: true, name: 'ownerId_1_senderId_1' });

module.exports = mongoose.model('UserMemory', UserMemorySchema);
