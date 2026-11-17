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
  // Who really wrote it, recorded when it is saved (detectors can't tell on short texts later):
  //  contact            their message
  //  human              the owner typed it
  //  human_after_draft  the owner typed it while the AI had a reply ready (a takeover: strongest signal)
  //  ai_auto / ai_checkin / ai_reminder   written by the AI
  // Only human and human_after_draft may ever teach the AI how the owner texts.
  origin: {
    type: String,
    enum: ['', 'contact', 'human', 'human_after_draft', 'ai_auto', 'ai_checkin', 'ai_reminder'],
    default: '',
  },
}, { timestamps: true });

/** Pure: who wrote this message, from what is known when it is saved. */
function originOf(m) {
  if (m.role === 'user') return 'contact';
  if (m.sentByAI) return m.isCheckIn ? 'ai_checkin' : m.isReminder ? 'ai_reminder' : 'ai_auto';
  return 'human';
}
MessageSchema.pre('save', function setOrigin() {
  if (!this.origin) this.origin = originOf(this);
});
MessageSchema.statics.originOf = originOf;
MessageSchema.statics.HUMAN_ORIGINS = ['human', 'human_after_draft'];

// One person's chat in time order (replies, memory index, voice): both directions, by owner
MessageSchema.index({ ownerId: 1, senderId: 1, timestamp: -1 });
MessageSchema.index({ ownerId: 1, recipientId: 1, timestamp: -1 });
// The owner's own hand-typed messages (voice fingerprint)
MessageSchema.index({ ownerId: 1, role: 1, sentByAI: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
