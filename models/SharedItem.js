const mongoose = require('mongoose');

/**
 * Something a contact sent that matters: a link, file, photo, video, voice note, or a message
 * that needs you (invite, request, money, urgent). Shown on their People page under "Shared"
 * and, when it needs you, emailed. Files are copied into MongoDB (GridFS), because Instagram's
 * own attachment links expire.
 */
const sharedItemSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  senderId: { type: String, required: true, index: true },
  name: { type: String, default: '' },
  kind: { type: String, enum: ['link', 'file', 'photo', 'video', 'voice', 'post', 'reel', 'message'], default: 'message' },
  // Why it needs you, if it does
  category: { type: String, enum: ['invite', 'request', 'money', 'urgent', 'plan', 'info', ''], default: '' },
  needsYou: { type: Boolean, default: false },
  summary: { type: String, default: '' },
  text: { type: String, default: '' },
  url: { type: String, default: '' },          // the link, or Instagram's (expiring) file link
  fileId: { type: mongoose.Schema.Types.ObjectId, default: null }, // our permanent copy (GridFS)
  contentType: { type: String, default: '' },
  bytes: { type: Number, default: 0 },
  mid: { type: String, default: '' },
  status: { type: String, enum: ['new', 'seen', 'done'], default: 'new' },
  emailedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

sharedItemSchema.index({ ownerId: 1, senderId: 1, createdAt: -1 });
sharedItemSchema.index({ ownerId: 1, needsYou: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('SharedItem', sharedItemSchema);
