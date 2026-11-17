const mongoose = require('mongoose');

/**
 * A texting preference learned from the owner's own corrections: times the AI had a reply ready
 * and the owner typed their own instead (services/correctionLearning.js). It starts as a candidate
 * and becomes active (used in every reply) only after 3 corrections agree and none contradict it.
 * senderId '' = applies to everyone; otherwise only to that contact.
 */
const stylePreferenceSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  senderId: { type: String, default: '' },
  contactName: { type: String, default: '' },
  text: { type: String, required: true },
  status: { type: String, enum: ['candidate', 'active', 'retired'], default: 'candidate' },
  support: { type: Number, default: 1 },
  contradictions: { type: Number, default: 0 },
  examples: {
    type: [{ incoming: String, draft: String, human: String, at: { type: Date, default: Date.now }, _id: false }],
    default: [],
  },
}, { timestamps: true, versionKey: false });

stylePreferenceSchema.index({ ownerId: 1, status: 1, senderId: 1 });

module.exports = mongoose.model('StylePreference', stylePreferenceSchema);
