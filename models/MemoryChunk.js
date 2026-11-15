const mongoose = require('mongoose');

/**
 * A few consecutive real messages with one person (a "moment" of the chat), searchable by words.
 * Only messages typed by you or by them are included, never the AI's replies.
 */
const memoryChunkSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  senderId: { type: String, required: true },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  text: { type: String, required: true },
  messages: { type: Number, default: 0 },
}, { timestamps: false, versionKey: false });

memoryChunkSchema.index({ ownerId: 1, senderId: 1, startAt: 1 });
// Word search inside one person's chunks (filter by owner + person, then $text)
memoryChunkSchema.index({ ownerId: 1, senderId: 1, text: 'text' }, { default_language: 'none', name: 'chunk_text' });

module.exports = mongoose.model('MemoryChunk', memoryChunkSchema);
