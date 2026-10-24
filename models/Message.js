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
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);
