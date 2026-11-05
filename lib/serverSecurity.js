// Small pure helpers used by server.js and routes (kept free of DB / network so they can be unit tested)
const crypto = require('crypto');
const path = require('path');

const isProduction = (env = process.env) => env.NODE_ENV === 'production';

const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Decides whether a Meta webhook POST may be processed.
 * - Production: a signing secret is required and BYPASS_WEBHOOK_VERIFY is ignored.
 * - Elsewhere: BYPASS_WEBHOOK_VERIFY=true or a missing secret skips the check (dev only).
 * Returns { ok: true } or { ok: false, status, reason }.
 */
function checkMetaSignature({ rawBody, signature, secrets, env = process.env }) {
  const prod = isProduction(env);
  if (!prod && env.BYPASS_WEBHOOK_VERIFY === 'true') return { ok: true, reason: 'bypass' };
  const list = (secrets || []).map(s => String(s || '').trim()).filter(Boolean);
  if (!list.length) {
    return prod ? { ok: false, status: 503, reason: 'no-secret' } : { ok: true, reason: 'no-secret-dev' };
  }
  if (!signature) return { ok: false, status: 401, reason: 'missing-signature' };
  const valid = list.some(secret =>
    safeEqual(signature, 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex'))
  );
  return valid ? { ok: true } : { ok: false, status: 401, reason: 'invalid-signature' };
}

/**
 * Absolute path of `filename` inside `dir`, or null if the name is not a plain file name
 * or would resolve outside the directory.
 */
function resolveInsideDir(dir, filename) {
  const name = String(filename || '');
  if (!name || name !== path.basename(name) || name === '.' || name === '..' || /[\\/\0]/.test(name)) return null;
  const root = path.resolve(dir);
  const full = path.resolve(root, name);
  return path.dirname(full) === root ? full : null;
}

/** True for absolute http(s) URLs only */
function isHttpUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.hostname);
  } catch {
    return false;
  }
}

/** Random file name such as `doc-<32 hex>.pdf` */
const randomFilename = (prefix, ext) => `${prefix}${crypto.randomBytes(16).toString('hex')}${String(ext || '').toLowerCase()}`;

/**
 * Persona as sent to the browser: secrets replaced by booleans.
 */
function serializePersona(config, { hasUserToken = false } = {}) {
  const obj = config && typeof config.toObject === 'function' ? config.toObject() : { ...(config || {}) };
  const hasInstagramToken = Boolean(hasUserToken || (obj.instagramPageAccessToken || '').trim());
  const hasGiphyKey = Boolean((obj.giphyApiKey || '').trim());
  delete obj.instagramPageAccessToken;
  delete obj.giphyApiKey;
  return { ...obj, hasInstagramToken, hasGiphyKey };
}

/**
 * Optional date query parameter: missing -> fallback, invalid -> { ok: false }.
 */
function parseDateParam(value, fallback) {
  if (value === undefined || value === null || value === '') return { ok: true, date: fallback };
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? { ok: false } : { ok: true, date: d };
}

const isStringArray = v => Array.isArray(v) && v.every(x => typeof x === 'string');

/**
 * Validates the typed fields of a PUT /api/persona body. Returns an error message or null.
 */
function validatePersonaUpdate(body = {}, { chatModes = [] } = {}) {
  if (body.chatMode !== undefined && !chatModes.includes(body.chatMode)) return 'Invalid chatMode';
  if (body.globalBotActive !== undefined && typeof body.globalBotActive !== 'boolean') return 'globalBotActive must be true or false';
  if (body.typingDelaySeconds !== undefined && body.typingDelaySeconds !== null) {
    const n = Number(body.typingDelaySeconds);
    if (!Number.isFinite(n) || n < 0 || n > 120) return 'typingDelaySeconds must be a number between 0 and 120';
  }
  for (const key of ['excludedContactIds', 'includedContactIds', 'forbiddenWords']) {
    if (body[key] !== undefined && !isStringArray(body[key])) return `${key} must be a list of strings`;
  }
  for (const key of ['creatorName', 'instagramHandle', 'personaBio', 'aboutMe', 'characteristics', 'textingHabits',
    'replyRules', 'toneGuidelines', 'customKnowledge', 'instagramPageAccessToken', 'instagramAccountId', 'giphyApiKey']) {
    if (body[key] !== undefined && body[key] !== null && typeof body[key] !== 'string') return `${key} must be text`;
  }
  return null;
}

/**
 * Owner filter for UserMemory / Message / SocialGraph / MediaVault queries.
 * A tenant sees only its own rows; the superadmin also owns legacy rows with no owner.
 */
function ownerFilter(user) {
  if (!user) return { _id: null }; // matches nothing
  return user.role === 'superadmin' ? { ownerId: { $in: [user._id, null] } } : { ownerId: user._id };
}

/** Key for per-contact in-memory state (debounce, in-flight replies, media pacing) */
const contactKey = (ownerId, senderId) => `${ownerId ? String(ownerId) : 'legacy'}:${senderId}`;

/** Contact ids for a photo refresh: strings of word characters, no repeats, at most `max`. */
function cleanPhotoIds(raw, max = 25) {
  const list = Array.isArray(raw) ? raw : [];
  return [...new Set(list.filter(id => typeof id === 'string' || typeof id === 'number').map(String)
    .filter(id => /^[\w-]{3,64}$/.test(id)))].slice(0, max);
}

module.exports = {
  cleanPhotoIds,
  isProduction,
  safeEqual,
  checkMetaSignature,
  resolveInsideDir,
  isHttpUrl,
  randomFilename,
  serializePersona,
  parseDateParam,
  validatePersonaUpdate,
  ownerFilter,
  contactKey,
};
