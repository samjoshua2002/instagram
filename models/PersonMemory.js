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
  errorCount: { type: Number, default: 0 },
  dirty: { type: Boolean, default: true },
  // Things the AI is not sure about: questions for you (answer or dismiss on the person's page)
  doubts: [{
    question: { type: String, required: true },
    about: { type: String, default: '' },
    status: { type: String, enum: ['open', 'answered', 'dismissed'], default: 'open' },
    answer: { type: String, default: '' },
    askedAt: { type: Date, default: Date.now },
  }],
  // What you told the AI about them (answers and corrections): always true, beats anything read from chats
  ownerFacts: [{ text: { type: String, required: true }, at: { type: Date, default: Date.now } }],
  // Rewrite the document from the notes (after your answer or correction) without re-reading chats
  rebuildDoc: { type: Boolean, default: false },
  lastReviewedAt: { type: Date, default: null },
  // Re-read asked for by you: goes first, and rebuilds from the whole history
  priority: { type: Number, default: 0 },
  forceRebuild: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });

personMemorySchema.index({ ownerId: 1, senderId: 1 }, { unique: true });
personMemorySchema.index({ status: 1, dirty: 1, updatedAt: 1 });

module.exports = mongoose.model('PersonMemory', personMemorySchema);
