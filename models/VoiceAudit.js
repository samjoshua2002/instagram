const mongoose = require('mongoose');

/**
 * One self-test of the voice checker (services/voiceAudit.js): it scored a sample of the owner's
 * own messages (which must pass: they ARE the owner) and of the AI's. "trusted" decides whether the
 * checker may rewrite replies for this account by itself. Kept 90 days.
 */
const voiceAuditSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  threshold: Number,
  realCount: Number,
  realPass: Number,   // % of the owner's own messages the checker passed
  realAvg: Number,
  aiCount: Number,
  aiPass: Number,     // % of the AI's messages the checker passed
  aiAvg: Number,
  trusted: { type: Boolean, default: false },
  reason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now, expires: 90 * 24 * 3600 },
}, { versionKey: false });

voiceAuditSchema.index({ ownerId: 1, createdAt: -1 });

module.exports = mongoose.model('VoiceAudit', voiceAuditSchema);
