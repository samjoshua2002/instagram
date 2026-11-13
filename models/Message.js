const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
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
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Fast per-creator conversation lookups (inbox, history, reply context)
MessageSchema.index({ ownerId: 1, senderId: 1, createdAt: -1 });
MessageSchema.index({ ownerId: 1, recipientId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
