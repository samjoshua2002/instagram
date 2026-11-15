const mongoose = require('mongoose');

/**
 * A reminder someone asked for in a DM ("remind me at 5 to call mom"), set by the AI.
 * forWhom 'them': the AI DMs them at dueAt (only inside Instagram's 24-hour window).
 * forWhom 'owner': you get an email at dueAt ("remind Sam to send the notes").
 */
const reminderSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  senderId: { type: String, required: true },
  name: { type: String, default: '' },
  what: { type: String, required: true },
  forWhom: { type: String, enum: ['them', 'owner'], default: 'them' },
  dueAt: { type: Date, required: true },
  sourceText: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'sent', 'emailed', 'failed', 'cancelled'], default: 'pending' },
  sentAt: { type: Date, default: null },
  note: { type: String, default: '' },
}, { timestamps: true, versionKey: false });

reminderSchema.index({ status: 1, dueAt: 1 });
reminderSchema.index({ ownerId: 1, senderId: 1, createdAt: -1 });

module.exports = mongoose.model('Reminder', reminderSchema);
