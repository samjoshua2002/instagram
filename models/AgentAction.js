const mongoose = require('mongoose');

/** What the memory agent did (shown in the app): facts merged or removed, questions raised, cleanups. */
const agentActionSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  senderId: { type: String, default: '' },
  name: { type: String, default: '' },
  kind: { type: String, enum: ['review', 'cleanup'], default: 'review' },
  summary: { type: String, default: '' },
  details: { type: [String], default: [] },
  at: { type: Date, default: Date.now },
}, { versionKey: false });

agentActionSchema.index({ ownerId: 1, at: -1 });

module.exports = mongoose.model('AgentAction', agentActionSchema);
