const mongoose = require('mongoose');

const ConnectionSchema = new mongoose.Schema({
  targetName: { type: String, required: true },
  relationship: { type: String, default: 'friend' }, // 'sister', 'bro', 'friend', 'lover', 'relative', 'homie'
  notes: { type: String, default: '' },
}, { _id: false });

const SocialGraphSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  ownerUsername: {
    type: String,
    default: '',
    trim: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
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
  // 0 = always kind, 100 = savage roasting (contact profile tone tab)
  roastiness: {
    type: Number,
    min: 0,
    max: 100,
    // No default: unset contacts keep the AI's current tone
  },
  // How to open chats with this person, e.g. "yo", "heyy", "macha"
  greetingStyle: {
    type: String,
    default: '',
  },
  chatsCount: {
    type: Number,
    default: 0,
  },
  reelsCount: {
    type: Number,
    default: 0,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

SocialGraphSchema.index({ aliases: 1 });

module.exports = mongoose.model('SocialGraph', SocialGraphSchema);
