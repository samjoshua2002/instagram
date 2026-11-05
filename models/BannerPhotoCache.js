const mongoose = require('mongoose');

// Unsplash photo lists saved per banner topic, so a server restart reuses them
// instead of spending the 50-requests-per-hour Unsplash quota again.
const photoSchema = new mongoose.Schema({
  id: { type: String, required: true },
  raw: { type: String, required: true },
  color: { type: String, default: null },
  alt: { type: String, default: '' },
  author: { type: String, default: 'Unsplash' },
  authorUrl: { type: String, default: 'https://unsplash.com' },
  link: { type: String, default: 'https://unsplash.com' },
}, { _id: false });

const bannerPhotoCacheSchema = new mongoose.Schema({
  topic: { type: String, required: true, unique: true, trim: true },
  photos: { type: [photoSchema], default: [] },
  fetchedAt: { type: Date, required: true },
}, { timestamps: true });

module.exports = mongoose.models.BannerPhotoCache
  || mongoose.model('BannerPhotoCache', bannerPhotoCacheSchema);
