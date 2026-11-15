const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  // Creator (tenant) this conversation belongs to; null for legacy admin-bot records
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  senderId: {
    type: String,
    required: true,
    index: true,
  },
  recipientId: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  mid: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  sentByAI: {
    type: Boolean,
    default: false,
  },
  isReminder: {
    type: Boolean,
    default: false,
  },
  // A conversation the AI started itself (services/checkInService.js)
  isCheckIn: {
    type: Boolean,
    default: false,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// One person's chat in time order (replies, memory index, voice): both directions, by owner
MessageSchema.index({ ownerId: 1, senderId: 1, timestamp: -1 });
MessageSchema.index({ ownerId: 1, recipientId: 1, timestamp: -1 });
// The owner's own hand-typed messages (voice fingerprint)
MessageSchema.index({ ownerId: 1, role: 1, sentByAI: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
