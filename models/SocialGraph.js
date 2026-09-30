const mongoose = require('mongoose');

const ConnectionSchema = new mongoose.Schema({
  targetName: { type: String, required: true },
  relationship: { type: String, default: 'friend' }, // 'sister', 'bro', 'friend', 'lover', 'relative', 'homie'
  notes: { type: String, default: '' },
}, { _id: false });

const SocialGraphSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  aliases: [{
    type: String,
    lowercase: true,
    trim: true,
  }],
  instagramHandle: {
    type: String,
    default: '',
  },
  profilePic: {
    type: String,
    default: '',
  },
  senderId: {
    type: String,
    default: '',
    index: true,
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'neutral', 'unknown'],
    default: 'unknown',
  },
  relationshipToSam: {
    type: String,
    default: 'friend', // 'bro', 'sister', 'close friend', 'lover', 'relative', 'homie'
  },
  category: {
    type: String,
    enum: ['close_friend', 'online_friend', 'offline_friend', 'family', 'professional', 'business', 'relative', 'homie', 'group_icon', 'other'],
    default: 'online_friend',
  },
  dob: {
    type: String,
    default: '',
  },
  personalNotes: {
    type: String,
    default: '',
  },
  connections: [ConnectionSchema], // Tree chain linking to other friends
  lore: [{
    type: String,
  }],
  languages: [{
    type: String,
    default: ['English'],
  }],
  roastStyle: {
    type: String,
    default: 'Banter back naturally matching their energy.',
  },
  reelInterests: [{
    type: String,
  }],
  lastReelSentAt: {
    type: Date,
  },
  autoSendReels: {
    type: Boolean,
    default: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

SocialGraphSchema.index({ aliases: 1 });

module.exports = mongoose.model('SocialGraph', SocialGraphSchema);
