const mongoose = require('mongoose');

/**
 * Modular Feature Store (PLAN.md §4.1): one document per workspace owner.
 * activeMode picks the preset; enabledFeatures can then be toggled one by one.
 */
const workspaceFeaturesSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  activeMode: { type: String, enum: ['personal', 'business', 'hybrid'], default: 'personal' },
  enabledFeatures: {
    antiAiHumanMimicry: { type: Boolean, default: true },
    reelEmojiReactions: { type: Boolean, default: true },
    mediaStickerVault: { type: Boolean, default: false },
    ragKnowledgeBase: { type: Boolean, default: false },
    leadExtraction: { type: Boolean, default: false },
    bookingScheduler: { type: Boolean, default: false },
    humanHandoffInbox: { type: Boolean, default: true },
    multiLanguageMirroring: { type: Boolean, default: true },
    byoLlmCustomEndpoint: { type: Boolean, default: false },
    desktopPushAlerts: { type: Boolean, default: true },
  },
  customBranding: {
    accentColor: { type: String, default: '#ffffff' },
    theme: { type: String, enum: ['dark', 'light', 'oled'], default: 'dark' },
    storyboardView: { type: String, enum: ['timeline', 'node_canvas', 'cards'], default: 'node_canvas' },
  },
}, { timestamps: true });

module.exports = mongoose.model('WorkspaceFeatures', workspaceFeaturesSchema);
