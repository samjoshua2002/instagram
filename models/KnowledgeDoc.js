const mongoose = require('mongoose');

// Business knowledge chunk (runbook, FAQ, price list) used for RAG replies
const KnowledgeDocSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    default: 'general',
    trim: true,
    index: true,
  },
  textContent: {
    type: String,
    default: '',
  },
  fileUrl: {
    type: String,
    default: '',
  },
  keywords: [{
    type: String,
  }],
  // All chunks of one uploaded document / link share a sourceId
  sourceId: {
    type: String,
    default: '',
    index: true,
  },
  sourceType: {
    type: String,
    enum: ['file', 'link', 'text'],
    default: 'text',
  },
  chunkIndex: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

KnowledgeDocSchema.index({ ownerId: 1, keywords: 1 });

module.exports = mongoose.model('KnowledgeDoc', KnowledgeDocSchema);
