/**
 * Feature Store labels shared by the settings page, the mode switch and the nav
 * (PLAN.md §4). Keys match services/workspaceFeatureService.js FEATURE_KEYS.
 */
export const WORKSPACE_MODES = [
  { key: 'personal', label: 'Personal', hint: 'Your own voice, reel reactions and stickers' },
  { key: 'business', label: 'Business', hint: 'Brand voice, documents, leads and bookings' },
  { key: 'hybrid', label: 'Hybrid', hint: 'Personal voice plus the business tools' },
];

export const FEATURE_GROUPS = [
  {
    title: 'Conversation',
    features: [
      { key: 'antiAiHumanMimicry', label: 'Human mimicry & anti-AI cadence', hint: 'Typing delays, short bursts and natural slang so replies feel human.' },
      { key: 'multiLanguageMirroring', label: 'Multi-language mirroring', hint: 'Reply in the language and script the other person writes in.' },
      { key: 'reelEmojiReactions', label: 'Reel reactions', hint: 'React to shared reels and posts with a tone-matched emoji or line.' },
      { key: 'mediaStickerVault', label: 'Meme & sticker vault', hint: 'Send stickers and GIFs from your Media Vault when they fit.' },
    ],
  },
  {
    title: 'Business tools',
    features: [
      { key: 'ragKnowledgeBase', label: 'Document knowledge vault (RAG)', hint: 'Answer from your uploaded menus, price lists and policies.' },
      { key: 'leadExtraction', label: 'Lead extraction', hint: 'Pick out names, phone numbers and buying intent from chats.' },
      { key: 'bookingScheduler', label: 'Booking scheduler', hint: 'Offer open slots and take appointments inside the DM.' },
      { key: 'humanHandoffInbox', label: 'Human handoff inbox', hint: 'Pause the bot and flag the chat when a person needs you.' },
    ],
  },
  {
    title: 'Platform',
    features: [
      { key: 'byoLlmCustomEndpoint', label: 'Bring your own AI model', hint: 'Use your own OpenAI-compatible endpoint or a local Ollama model.' },
      { key: 'desktopPushAlerts', label: 'Desktop push alerts', hint: 'Native notifications from the desktop app for new leads and handoffs.' },
    ],
  },
];

/** Mode for the UI before the store has loaded: falls back to the reply voice. */
export function currentMode(workspaceFeatures, user) {
  if (workspaceFeatures?.activeMode) return workspaceFeatures.activeMode;
  return ['business', 'agency'].includes(user?.accountType) ? 'business' : 'personal';
}

/** True unless the store has loaded and the flag is off (keeps nav stable while loading). */
export function isFeatureOn(workspaceFeatures, key) {
  return workspaceFeatures?.enabledFeatures?.[key] !== false;
}
