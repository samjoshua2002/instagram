const mongoose = require('mongoose');

/**
 * The AI's memory of one person: a read-only document written from your real chats with them
 * (never from the AI's own replies), the brain score (how well the AI knows them, 0-100) and
 * the bond it reads from the chats. Rebuilt by services/memoryIndexService.js as messages arrive.
 * Owners can read it on the person's page; it cannot be edited or deleted from the app.
 */
const personMemorySchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  senderId: { type: String, required: true },
  name: { type: String, default: '' },
  // Markdown, organised in fixed sections (who they are, bond, people, timeline, ...)
  doc: { type: String, default: '' },
  // Short notes per batch of chunks, folded into `doc` (kept so updates do not re-read everything)
  notes: { type: [String], default: [] },
  slots: { type: mongoose.Schema.Types.Mixed, default: {} },
  brainScore: { type: Number, default: 0 },
  bond: { type: String, enum: ['', 'stranger', 'acquaintance', 'friend', 'close', 'family', 'partner'], default: '' },
  bondReason: { type: String, default: '' },
  totalMessages: { type: Number, default: 0 },
  indexedMessages: { type: Number, default: 0 },
  chunkCount: { type: Number, default: 0 },
  lastIndexedMessageAt: { type: Date, default: null },
  lastIndexedAt: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'indexing', 'ready', 'error'], default: 'pending' },
  error: { type: String, default: '' },
  dirty: { type: Boolean, default: true },
}, { timestamps: true, versionKey: false });

personMemorySchema.index({ ownerId: 1, senderId: 1 }, { unique: true });
personMemorySchema.index({ status: 1, dirty: 1, updatedAt: 1 });

module.exports = mongoose.model('PersonMemory', personMemorySchema);
