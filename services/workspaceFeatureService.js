/**
 * Feature Store (PLAN.md §4): per-workspace mode + feature toggles that the
 * reply pipeline checks before running each capability.
 *
 * activeMode vs user.accountType: accountType stays the reply *voice*
 * (personal or business). Hybrid keeps the personal voice and turns on the
 * business tools (documents, leads, bookings) through the toggles.
 */
const WorkspaceFeatures = require('../models/WorkspaceFeatures');
const llmAdapter = require('./llmAdapter');

const FEATURE_KEYS = [
  'antiAiHumanMimicry', 'reelEmojiReactions', 'mediaStickerVault', 'ragKnowledgeBase',
  'leadExtraction', 'bookingScheduler', 'humanHandoffInbox', 'multiLanguageMirroring',
  'byoLlmCustomEndpoint', 'desktopPushAlerts',
];

// What each mode turns on when selected (byoLlmCustomEndpoint is kept as the user set it)
const MODE_PRESETS = {
  personal: {
    antiAiHumanMimicry: true, reelEmojiReactions: true, mediaStickerVault: true, ragKnowledgeBase: false,
    leadExtraction: false, bookingScheduler: false, humanHandoffInbox: true, multiLanguageMirroring: true,
    desktopPushAlerts: true,
  },
  business: {
    antiAiHumanMimicry: true, reelEmojiReactions: false, mediaStickerVault: false, ragKnowledgeBase: true,
    leadExtraction: true, bookingScheduler: true, humanHandoffInbox: true, multiLanguageMirroring: true,
    desktopPushAlerts: true,
  },
  hybrid: {
    antiAiHumanMimicry: true, reelEmojiReactions: true, mediaStickerVault: true, ragKnowledgeBase: true,
    leadExtraction: true, bookingScheduler: true, humanHandoffInbox: true, multiLanguageMirroring: true,
    desktopPushAlerts: true,
  },
};

const MODES = Object.keys(MODE_PRESETS);
const CACHE_MS = 30 * 1000;
const cache = new Map();

const isBusinessType = (accountType) => accountType === 'business' || accountType === 'agency';
const modeFromAccountType = (accountType) => (isBusinessType(accountType) ? 'business' : 'personal');

// Plain object for the API and the pipeline
function toView(doc) {
  const enabled = {};
  for (const key of FEATURE_KEYS) enabled[key] = Boolean(doc.enabledFeatures?.[key]);
  return {
    activeMode: doc.activeMode,
    enabledFeatures: enabled,
    customBranding: {
      accentColor: doc.customBranding?.accentColor || '#ffffff',
      theme: doc.customBranding?.theme || 'dark',
      storyboardView: doc.customBranding?.storyboardView || 'node_canvas',
    },
  };
}

// Defaults for workspaces without an owner record (legacy single-tenant flow)
function defaultView(accountType) {
  const mode = modeFromAccountType(accountType);
  return toView({ activeMode: mode, enabledFeatures: { ...MODE_PRESETS[mode], byoLlmCustomEndpoint: true } });
}

/** Loads (or creates from the matching preset) the owner's feature document. */
async function getFeatures(user) {
  if (!user?._id) return defaultView(user?.accountType);
  const key = String(user._id);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.view;

  let doc = await WorkspaceFeatures.findOne({ ownerId: user._id });
  if (!doc) {
    const mode = modeFromAccountType(user.accountType);
    doc = await WorkspaceFeatures.findOneAndUpdate(
      { ownerId: user._id },
      {
        $setOnInsert: {
          ownerId: user._id,
          activeMode: mode,
          // Existing BYO-LLM users keep their provider switched on
          enabledFeatures: { ...MODE_PRESETS[mode], byoLlmCustomEndpoint: llmAdapter.isCustomProvider(user.aiProviderConfig) },
        },
      },
      { upsert: true, new: true }
    );
  }
  const view = toView(doc);
  cache.set(key, { view, expires: Date.now() + CACHE_MS });
  return view;
}

/** Safe wrapper for the reply pipeline: never throws, falls back to mode defaults. */
async function getFeaturesSafe(user) {
  try {
    return await getFeatures(user);
  } catch (err) {
    console.warn('⚠️ [Feature Store] Could not load features, using defaults:', err.message);
    return defaultView(user?.accountType);
  }
}

/**
 * Applies a partial update. A mode change loads that mode's preset first, then any
 * explicit toggles in the same request win. Returns { view, accountType } where
 * accountType is the user's new reply voice (or null when unchanged).
 */
async function updateFeatures(user, { activeMode, enabledFeatures, customBranding } = {}) {
  await getFeatures(user);
  const doc = await WorkspaceFeatures.findOne({ ownerId: user._id });
  let accountType = null;

  if (activeMode !== undefined) {
    if (!MODES.includes(activeMode)) throw Object.assign(new Error('Unknown workspace mode'), { status: 400 });
    if (activeMode !== doc.activeMode) {
      const keepByo = Boolean(doc.enabledFeatures?.byoLlmCustomEndpoint);
      doc.activeMode = activeMode;
      doc.enabledFeatures = { ...MODE_PRESETS[activeMode], byoLlmCustomEndpoint: keepByo };
    }
    // Business voice for business mode (agency stays agency); personal voice for personal and hybrid
    const wantsBusiness = activeMode === 'business';
    if (wantsBusiness !== isBusinessType(user.accountType)) {
      accountType = wantsBusiness ? 'business' : 'personal';
    }
  }

  if (enabledFeatures && typeof enabledFeatures === 'object') {
    for (const key of FEATURE_KEYS) {
      if (typeof enabledFeatures[key] === 'boolean') doc.set(`enabledFeatures.${key}`, enabledFeatures[key]);
    }
  }

  if (customBranding && typeof customBranding === 'object') {
    if (typeof customBranding.accentColor === 'string' && /^#[0-9a-f]{3,8}$/i.test(customBranding.accentColor)) {
      doc.set('customBranding.accentColor', customBranding.accentColor);
    }
    if (['dark', 'light', 'oled'].includes(customBranding.theme)) doc.set('customBranding.theme', customBranding.theme);
    if (['timeline', 'node_canvas', 'cards'].includes(customBranding.storyboardView)) {
      doc.set('customBranding.storyboardView', customBranding.storyboardView);
    }
  }

  await doc.save();
  const view = toView(doc);
  cache.set(String(user._id), { view, expires: Date.now() + CACHE_MS });
  return { view, accountType };
}

module.exports = { FEATURE_KEYS, MODE_PRESETS, MODES, getFeatures, getFeaturesSafe, updateFeatures };
