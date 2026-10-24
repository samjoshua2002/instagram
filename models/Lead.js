const mongoose = require('mongoose');

// Sales lead captured from a business DM conversation
const LeadSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  senderId: {
    type: String,
    required: true,
  },
  handle: {
    type: String,
    default: '',
  },
  phone: {
    type: String,
    default: '',
  },
  email: {
    type: String,
    default: '',
  },
  intentSummary: {
    type: String,
    default: '',
  },
  capturedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

LeadSchema.index({ ownerId: 1, senderId: 1 }, { unique: true });

module.exports = mongoose.model('Lead', LeadSchema);
