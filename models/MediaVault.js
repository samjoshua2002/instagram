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
  isDefault: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MediaVault', mediaVaultSchema);
