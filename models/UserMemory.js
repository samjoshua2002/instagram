const mongoose = require('mongoose');

const UserMemorySchema = new mongoose.Schema({
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
  messageCount: {
    type: Number,
    default: 0,
  },
  lastInteraction: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model('UserMemory', UserMemorySchema);
