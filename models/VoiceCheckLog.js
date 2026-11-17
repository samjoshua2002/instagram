const mongoose = require('mongoose');

/**
 * One "sounds like you" check on an AI draft (services/voiceCheck.js): what the judge said, what
 * was done (shadow / enforce), and the owner's own label ("I'd send this" or not), which is used to
 * see whether the judge agrees with the owner and where its threshold should be. Kept 60 days.
 */
const voiceCheckLogSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  senderId: { type: String, default: '' },
  contactName: { type: String, default: '' },
  kind: { type: String, enum: ['reply', 'checkin'], default: 'reply' },
  incoming: { type: String, default: '' },
  draft: { type: String, default: '' },
  final: { type: String, default: '' },
  mode: { type: String, enum: ['off', 'shadow', 'enforce'], default: 'shadow' },
  // pass | rewritten | would_rewrite | timeout | error | skipped
  status: { type: String, default: 'pass' },
  score: { type: Number, default: null },
  issues: { type: [String], default: [] },
  ruleIssues: { type: [String], default: [] },
  judgeMs: { type: Number, default: null },
  language: { type: String, default: '' },
  // The owner's verdict on the draft, from the Voice Check page
  label: { type: String, enum: ['send', 'nosend', null], default: null },
  labelNote: { type: String, default: '' },
  // "Not me": how the owner would really have replied (each line its own message); learned from
  mine: { type: String, default: '' },
  labelledAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now, expires: 60 * 24 * 3600 },
}, { versionKey: false });

voiceCheckLogSchema.index({ ownerId: 1, label: 1, createdAt: -1 });

module.exports = mongoose.model('VoiceCheckLog', voiceCheckLogSchema);
