const mongoose = require('mongoose');

const mediaVaultSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    default: 'Reaction Media'
  },
  category: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  mediaType: {
    type: String,
    enum: ['image', 'gif', 'video', 'sticker'],
    default: 'gif'
  },
  caption: {
    type: String,
    trim: true,
    default: ''
  },
  keywords: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  ownerUsername: {
    type: String,
    trim: true,
    default: '',
    index: true,
  },
  // File name in public/uploads saved by the upload route; only this file is ever deleted from disk
  storedFilename: {
    type: String,
    default: '',
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  // Saved from a chat (a sticker / meme / reaction GIF someone sent): waits for the owner's Keep
  // before the AI may send it. Uploads are approved as before.
  reviewStatus: {
    type: String,
    enum: ['approved', 'pending'],
    default: 'approved',
    index: true,
  },
  source: {
    type: String,
    enum: ['upload', 'chat'],
    default: 'upload',
  },
  fileId: { type: mongoose.Schema.Types.ObjectId, default: null },   // our permanent copy (GridFS 'shared')
  contentType: { type: String, default: '' },
  contentHash: { type: String, default: '', index: true },          // the same sticker is saved once
  publicToken: { type: String, default: '', index: true },          // unguessable id in its public link
  fromSenderId: { type: String, default: '' },
  fromName: { type: String, default: '' },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MediaVault', mediaVaultSchema);
