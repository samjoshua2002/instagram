const mongoose = require('mongoose');

/**
 * Visual Storyboard (PLAN.md §13 Phase 4): one canvas per owner and kind.
 * personal = relationship map + character lore; business = customer journey.
 */
const nodeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, default: 'note' },
  label: { type: String, default: '', maxlength: 120 },
  notes: { type: String, default: '', maxlength: 2000 },
  contactId: { type: String, default: '' },
  senderId: { type: String, default: '' },
  circle: { type: String, enum: ['', 'close', 'online', 'offline', 'family', 'professional'], default: '' },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
}, { _id: false });

const edgeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  label: { type: String, default: '', maxlength: 60 },
}, { _id: false });

const storyboardSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kind: { type: String, enum: ['personal', 'business'], required: true },
  nodes: { type: [nodeSchema], default: [] },
  edges: { type: [edgeSchema], default: [] },
}, { timestamps: true });

storyboardSchema.index({ ownerId: 1, kind: 1 }, { unique: true });

module.exports = mongoose.model('Storyboard', storyboardSchema);
