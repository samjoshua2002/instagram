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
}, { timestamps: true });

module.exports = mongoose.model('KnowledgeDoc', KnowledgeDocSchema);
