require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const connectDB = require('./config/db');

// Models
const User = require('./models/User');
const UserMemory = require('./models/UserMemory');
const Message = require('./models/Message');
const PersonaConfig = require('./models/PersonaConfig');
const MediaVault = require('./models/MediaVault');

// Services
const instagramService = require('./services/instagramService');
const transcribeService = require('./services/transcribeService');
const mediaService = require('./services/mediaService');
const azureOpenAI = require('./services/azureOpenAI');
const { creatorIdentity } = require('./services/creatorIdentity');
const { aiTask } = require('./services/langfuse');
const { completionParams } = require('./services/models');
const celRuleEngine = require('./services/celRuleEngine');
const analyticsService = require('./services/analyticsService');
const memoryService = require('./services/memoryService');
const reminderService = require('./services/reminderService');
const checkInService = require('./services/checkInService');
const importantService = require('./services/importantService');
const memoryIndexService = require('./services/memoryIndexService');
const { overallScore } = require('./services/memoryIndexRules');
const PersonMemory = require('./models/PersonMemory');
const Reminder = require('./models/Reminder');
const { commitsOwner, holdingReply, asksForCommitment } = require('./services/importantRules');
const SharedItem = require('./models/SharedItem');
const stickerService = require('./services/stickerService');
const socialGraphService = require('./services/socialGraphService');
const { humanizeReply, splitIntoBubbles, bubbleGapMs, reelReactionEmoji } = require('./services/humanizeService');
const { shouldSendAiTextReply, preferencesForMode, routingAfterMode } = require('./lib/replyPolicy');
// the one "does the AI reply to this person?" rule, shared with the frontend pages
const { aiRepliesTo, whyQuiet } = require('./frontend/app/lib/aiReplyRules');
const workspaceFeatureService = require('./services/workspaceFeatureService');
const SocialGraph = require('./models/SocialGraph');
const redisService = require('./services/redisService');
const cryptoService = require('./services/cryptoService');
const { getUserInstagramToken, getOwnerSendToken, setUserInstagram } = require('./services/instagramTokenService');
const {
  isProduction, checkMetaSignature, resolveInsideDir, isHttpUrl, randomFilename, serializePersona,
  validatePersonaUpdate, ownerFilter, contactKey, cleanPhotoIds, cleanInterviewHistory,
} = require('./lib/serverSecurity');
const { router: authRouter, requireAuth } = require('./routes/auth');
const authService = require('./services/authService');
const { rateLimit, MINUTE } = require('./services/rateLimiter');

// Per-IP limits for the public (no login) endpoints other than the Meta webhook
const publicLimiter = rateLimit({ name: 'public', windowMs: MINUTE, max: 60, message: 'Too many requests. Please slow down.' });
const imageProxyLimiter = rateLimit({ name: 'image-proxy', windowMs: MINUTE, max: 300, message: 'Too many requests. Please slow down.' });
const metaCallbackLimiter = rateLimit({ name: 'meta-callback', windowMs: 15 * MINUTE, max: 30, message: 'Too many requests. Please try again later.' });

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB & Initialize owner account
connectDB().then(async () => {
  authService.ensureOwnerUser();
  // A GIPHY key used to be written into the code and copied into every creator's settings.
  // It is matched by fingerprint (the key itself is no longer in the code) and cleared, so the
  // server setting GIPHY_API_KEY is used instead.
  try {
    const LEGACY_GIPHY_SHA256 = 'b9f46622315b13b312c8749a6b2efda7fd2fbc744c3d8dc1270de6073e8be0a7';
    const withKey = await PersonaConfig.find({ giphyApiKey: { $nin: [null, ''] } }).select('giphyApiKey').lean();
    const legacyIds = withKey.filter(c => crypto.createHash('sha256').update(String(c.giphyApiKey)).digest('hex') === LEGACY_GIPHY_SHA256).map(c => c._id);
    if (legacyIds.length) {
      await PersonaConfig.updateMany({ _id: { $in: legacyIds } }, { $set: { giphyApiKey: '' } });
      console.log(`🔧 [Migration] Cleared the old built-in GIPHY key from ${legacyIds.length} creator settings.`);
    }
  } catch (e) { console.warn('GIPHY key cleanup note:', e.message); }
  await repointDeadBuiltInGifs();
  // Vault items owned only by a username get the account id once: ownership is now the account id
  // only (usernames can change and be reused), so they would otherwise disappear from the vault
  try {
    const legacyMediaNames = await MediaVault.distinct('ownerUsername', { ownerId: null, ownerUsername: { $nin: [null, ''] } });
    for (const uname of legacyMediaNames) {
      const u = await User.findOne({ username: uname }).select('_id').lean();
      if (u) await MediaVault.updateMany({ ownerId: null, ownerUsername: uname }, { $set: { ownerId: u._id } });
    }
  } catch (e) { console.warn('Vault owner backfill note:', e.message); }
});

// Built-in GIFs GIPHY took down (404 or "content not available") were replaced in stickerService;
// copies creators already imported still point at the dead links, so move them to the new ones
const DEAD_GIF_REPLACEMENTS = {
  cJMlRUCbMMzpC: 'APqEbxBsVlkWSuFpth',
  WpaVhEcp3nnBAj2LAc: 'YRuFixSNWFVcXaxpmX',
  vjjCsx3izfRSq4Ze05: 'ZqlvCTNHpqrio',
  j9mqKgQvkNOziGICfd: '3oEjHAUOqG3lSS0f1C',
  GCLlQnV7dXZ2E: 'g9582DNuQppxC',
  '26BRv0ThflsDTjDUs': '3o6fJ1BM7R2EBRDnxK',
  '4JVTF9fR99WYo': 'WRQBXSCnEFJIuxktnw',
};
async function repointDeadBuiltInGifs() {
  let moved = 0;
  for (const [oldId, newId] of Object.entries(DEAD_GIF_REPLACEMENTS)) {
    const r = await MediaVault.updateMany(
      { url: `https://media.giphy.com/media/${oldId}/giphy.gif` },
      { $set: { url: `https://media.giphy.com/media/${newId}/giphy.gif` } }
    ).catch(() => ({ modifiedCount: 0 }));
    moved += r.modifiedCount || 0;
  }
  if (moved) console.log(`🔧 [Migration] Moved ${moved} vault GIFs off dead GIPHY links.`);
}

function escapeRegex(string) {
  return (string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =========================================================================
// MEDIA ATTACHMENT GOVERNOR (CONVERSATION PACING & HOURLY RATE-LIMITER)
// Rules:
// 1. Hourly rate cap: Safely protect against 100/hr limit (max 60/hr globally).
// 2. Chat pacing: Must reply with at least 2 plain text messages before next GIF.
// 3. Randomness: ~1 in 6 chance ("bullet in trigger out of 6") when eligible.
// =========================================================================
const userMediaTracker = new Map(); // contact key -> { textCountSinceMedia: number, lastMediaTime: number }
const mediaTimestampsByOwner = new Map(); // owner -> sliding 1-hour window of media sent (Meta's limit is per account)
const mediaOwnerOf = (key) => String(key).split(':')[0];

// Keeps the per-contact tracker from growing forever: drop the oldest entries past 5000
function trimMediaTracker() {
  while (userMediaTracker.size > 5000) userMediaTracker.delete(userMediaTracker.keys().next().value);
}

function canSendMedia(senderId, isExplicitRequest = false) {
  const now = Date.now();
  const owner = mediaOwnerOf(senderId);
  const stamps = mediaTimestampsByOwner.get(owner) || [];
  // Prune timestamps older than 1 hour (3600000ms)
  while (stamps.length > 0 && stamps[0] < now - 3600000) {
    stamps.shift();
  }
  if (stamps.length === 0) mediaTimestampsByOwner.delete(owner);
  // Hard cap to safeguard API quota
  if (stamps.length >= 60) {
    console.log(`🛡️ [Media Governor]: Hourly limit reached for this account (${stamps.length}/60 per hour). Suppressing media attachment.`);
    return false;
  }
  // If user explicitly asks ("send a gif", "send meme"), allow immediately
  if (isExplicitRequest) return true;

  // Conversational pacing: at least 2 plain text replies before another GIF
  const tracker = userMediaTracker.get(senderId) || { textCountSinceMedia: 3, lastMediaTime: 0 };
  if (tracker.textCountSinceMedia < 2) {
    console.log(`🛡️ [Media Governor]: User ${senderId} has only received ${tracker.textCountSinceMedia} text reply since last media (minimum 2 required). Suppressing media.`);
    return false;
  }
  return true;
}

function recordMediaSent(senderId) {
  const now = Date.now();
  const owner = mediaOwnerOf(senderId);
  const stamps = mediaTimestampsByOwner.get(owner) || [];
  stamps.push(now);
  mediaTimestampsByOwner.set(owner, stamps);
  const tracker = userMediaTracker.get(senderId) || { textCountSinceMedia: 0, lastMediaTime: 0 };
  tracker.textCountSinceMedia = 0;
  tracker.lastMediaTime = now;
  userMediaTracker.set(senderId, tracker);
  trimMediaTracker();
}

function recordTextSent(senderId) {
  const tracker = userMediaTracker.get(senderId) || { textCountSinceMedia: 0, lastMediaTime: 0 };
  tracker.textCountSinceMedia = (tracker.textCountSinceMedia || 0) + 1;
  userMediaTracker.set(senderId, tracker);
  trimMediaTracker(); // text-only workspaces never send media, so trim here too
}

// Ensure public/uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Disk Storage Configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.gif';
    cb(null, randomFilename('media-', ext));
  }
});
// Only media files: an uploaded .html or .svg would run scripts on this origin
const UPLOAD_TYPES = { '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4' };
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = UPLOAD_TYPES[ext] && UPLOAD_TYPES[ext] === (file.mimetype || '').toLowerCase();
    if (!ok) req.uploadRejected = true;
    cb(null, !!ok);
  }
});
// The browser picks both the file name and the type, so the file's real first bytes are checked too
function fileMatchesType(filePath, mime) {
  let head;
  try {
    const fd = fs.openSync(filePath, 'r');
    head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
  } catch (e) { return false; }
  const ascii = (a, b) => head.slice(a, b).toString('latin1');
  switch (mime) {
    case 'image/gif': return ascii(0, 4) === 'GIF8';
    case 'image/jpeg': return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'image/png': return head.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'video/mp4': return ascii(4, 8) === 'ftyp';
    default: return false;
  }
}

// Middleware
app.enable('trust proxy');
app.use(cors());
// Keep the raw body so the Meta webhook signature can be checked byte-for-byte
app.use(express.json({ limit: '25mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
// Express 5 leaves req.body undefined when nothing was sent; routes read it as an object
app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });

const { safeEqual } = require('./lib/serverSecurity');

// App secrets used to sign webhooks / signed_requests (Instagram Login and Facebook Login apps can differ)
function getMetaSigningSecrets() {
  return [process.env.META_APP_SECRET, process.env.INSTAGRAM_APP_SECRET]
    .map(s => (s || '').trim())
    .filter(Boolean);
}
if (!getMetaSigningSecrets().length) {
  console.warn(isProduction()
    ? '🚨🚨 META_APP_SECRET / INSTAGRAM_APP_SECRET is not set: ALL webhook POSTs will be REJECTED (503) until it is configured.'
    : '⚠️ META_APP_SECRET / INSTAGRAM_APP_SECRET is not set: webhook signatures are NOT verified (development only).');
}
if (process.env.BYPASS_WEBHOOK_VERIFY === 'true') {
  console.warn(isProduction()
    ? '🚨🚨 BYPASS_WEBHOOK_VERIFY=true is IGNORED in production: webhook signatures are still verified.'
    : '⚠️ BYPASS_WEBHOOK_VERIFY=true: webhook signatures are NOT verified (development only).');
}

// X-Hub-Signature-256 check. Production always requires a signing secret; the bypass flag is dev-only.
function verifyMetaSignature(req, res, next) {
  const result = checkMetaSignature({
    rawBody: req.rawBody,
    signature: req.get('x-hub-signature-256') || '',
    secrets: getMetaSigningSecrets(),
  });
  if (result.ok) return next();
  if (result.reason === 'no-secret') console.error('🚫 Webhook POST rejected: no Meta signing secret configured in production.');
  else console.warn(`🚫 Webhook POST rejected (${result.reason}).`);
  return res.sendStatus(result.status);
}

// Decode and verify Meta's signed_request (base64url signature + payload, HMAC-SHA256 with the App Secret)
function parseSignedRequest(signedRequest) {
  const [encodedSig, payload] = String(signedRequest || '').split('.', 2);
  if (!encodedSig || !payload) return null;
  const valid = getMetaSigningSecrets().some(secret =>
    safeEqual(encodedSig, crypto.createHmac('sha256', secret).update(payload).digest('base64url'))
  );
  if (!valid) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
// The legacy dashboard (public/index.html, public/app.js) is no longer served; the Next.js frontend replaces it
app.get('/', (req, res) => {
  const frontend = (process.env.FRONTEND_URL || '').trim();
  if (frontend && isHttpUrl(frontend)) return res.redirect(302, frontend);
  res.json({ status: 'ok', service: 'chatter-api' });
});
app.use('/stickers', express.static(path.join(__dirname, 'public', 'stickers'), { index: false }));
// Old knowledge documents were saved here; they are served only through the owner-checked /api/knowledge route
app.use('/uploads', (req, res, next) => (/^\/doc-/i.test(req.path) ? res.sendStatus(404) : next()));
app.use('/uploads', express.static(uploadsDir, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'");
  },
}));

// Authentication & Passkey Endpoints
app.use('/api/auth', authRouter);

// Aliases for Instagram handle check and Admin accounts
app.use('/api/instagram/check-handle', (req, res, next) => {
  const queryIndex = req.url.indexOf('?');
  const query = queryIndex !== -1 ? req.url.slice(queryIndex) : '';
  req.url = '/instagram/check-handle' + query;
  authRouter(req, res, next);
});
app.use('/api/admin/accounts', requireAuth, (req, res, next) => {
  const subPath = req.url === '/' ? '' : req.url;
  req.url = '/admin/accounts' + subPath;
  authRouter(req, res, next);
});
app.use('/api/admin/tokens', requireAuth, (req, res, next) => {
  const subPath = req.url === '/' ? '' : req.url;
  req.url = '/admin/tokens' + subPath;
  authRouter(req, res, next);
});
app.use('/api/admin/impersonate', requireAuth, (req, res, next) => {
  req.url = '/admin/impersonate';
  authRouter(req, res, next);
});
app.use('/api/onboarding', requireAuth, (req, res, next) => {
  req.url = '/onboarding';
  authRouter(req, res, next);
});

// Secure private dashboard endpoints (requires valid JWT session or Passkey)
app.use('/api/conversations', requireAuth);
app.use('/api/social-graph', requireAuth);
app.use('/api/persona', requireAuth);
app.use('/api/media-vault', requireAuth);
app.use('/api/simulator', requireAuth);
app.use('/api/memory', requireAuth);
app.use('/api/contacts', requireAuth);
app.use('/api/people', requireAuth);
app.use('/api/memory-index', requireAuth);
app.use('/api/reminders', requireAuth);
app.use('/api/quiz', requireAuth);
app.use('/api/shared', requireAuth);
app.use('/api/checkins', requireAuth);
app.use('/api/voice', requireAuth, require('./routes/voice'));
app.use('/api/priorities', requireAuth);
app.use('/api/giphy', requireAuth);
app.use('/api/analytics', requireAuth, require('./routes/analytics'));
app.use('/api/knowledge', requireAuth, require('./routes/knowledge'));
app.use('/api/settings', requireAuth, require('./routes/aiProvider'));
app.use('/api/workspace', requireAuth, require('./routes/workspace'));
// Browser notification feed (new DMs, leads, bookings, handoffs)
app.use('/api/alerts', requireAuth, require('./routes/alerts'));
// Home dashboard summary (replies, handoffs, Instagram token health)
app.use('/api/home', requireAuth, require('./routes/home'));

// Contact, chat, graph and media queries only see the signed-in account's records, by ownerId.
// The superadmin also owns legacy records saved before records had an owner (ownerId null).
// ownerUsername is never used for access: a re-registered username must not inherit old data.
const isSuperUser = (req) => req.user?.role === 'superadmin';
const ownedBy = (req) => ownerFilter(req.user);
// Wraps a SocialGraph / UserMemory / Message filter so it only matches this account's records
const inGraph = (req, q) => ({ $and: [ownedBy(req), q] });
const inMemories = (req, q) => ({ $and: [ownedBy(req), q] });
const ownedMemoryQuery = (req, senderId) => inMemories(req, { senderId: String(senderId) });
// Owner options for memory / graph services. Only the superadmin may adopt legacy (ownerId null) contacts.
const memOptsFor = (ownerUser) => ({ ownerId: ownerUser?._id || null, adoptLegacy: ownerUser?.role === 'superadmin' });
// Owner options for a contact the signed-in account owns (its record decides the owner)
async function contactMemOpts(req, senderId) {
  const mem = await UserMemory.findOne(ownedMemoryQuery(req, senderId)).select('ownerId').lean();
  return { ownerId: mem?.ownerId || null, adoptLegacy: false };
}
// Messages of one conversation, owned by the same account as its contact record
const conversationMessages = (ownerId, senderId) => ({
  ownerId: ownerId || null,
  $or: [{ senderId }, { recipientId: senderId }],
});

// A contact may only be given a senderId that is new to this account or already its own chat;
// an id another workspace already chats with stays theirs
async function canUseSenderId(req, senderId) {
  if (!senderId) return true;
  if (await UserMemory.exists(ownedMemoryQuery(req, senderId))) return true;
  return !(await UserMemory.exists({ senderId: String(senderId) }));
}

// Generic 500: the real error goes to the log only
function sendServerError(res, err, label = 'Request') {
  console.error(`❌ ${label} failed:`, err && err.message);
  if (res.headersSent) return;
  const status = err && (err.name === 'ValidationError' || err.name === 'CastError') ? 400 : 500;
  res.status(status).json({ error: status === 400 ? 'Invalid input' : 'Something went wrong. Please try again.' });
}

// Keeps a value only if the schema allows it. findOneAndUpdate does not run enum validators, so a
// gender / category from the browser or the AI (e.g. "Female", "bestie") used to be stored as-is.
function allowedEnum(model, field, value, fallback) {
  const allowed = model.schema.path(field)?.enumValues || [];
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowed.includes(v) ? v : fallback;
}

// Every /api/conversations/:senderId/* route works only on a contact this account owns
// A malformed media id is a 400, not a database cast error (500)
app.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: 'Invalid id' });
  next();
});

app.param('senderId', async (req, res, next, senderId) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const owned = await UserMemory.exists(ownedMemoryQuery(req, senderId));
    if (!owned) return res.status(404).json({ error: 'User not found' });
    next();
  } catch (err) {
    next(err);
  }
});

// CORS-safe image proxy so the frontend canvas can sample avatar colours (PLAN.md §15.2).
// Only Instagram / Facebook CDN hosts are allowed, so it can't be used as an open proxy.
const IMAGE_PROXY_HOSTS = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/i;
app.get('/api/image-proxy', imageProxyLimiter, async (req, res) => {
  let target;
  try {
    target = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }
  if (target.protocol !== 'https:' || !IMAGE_PROXY_HOSTS.test(target.hostname)) {
    return res.status(403).json({ error: 'Host not allowed' });
  }
  try {
    const upstream = await fetch(target.href, { redirect: 'error', signal: AbortSignal.timeout(8000) });
    const type = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !type.startsWith('image/')) return res.status(502).end();
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) return res.status(413).end();
    res.set({ 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' });
    res.send(buf);
  } catch {
    res.status(502).end();
  }
});

// Webhook Verification Token
// Required; there is no built-in fallback token
const VERIFY_TOKEN = (process.env.WEBHOOK_VERIFY_TOKEN || '').trim();
if (!VERIFY_TOKEN) console.warn('⚠️ WEBHOOK_VERIFY_TOKEN is not set: Meta webhook verification (GET /webhook) will fail.');

// Cache for recent message IDs to prevent duplicate processing
const processedMids = new Set();
const recentProfileLookups = new Map(); // owner:sender -> { promise of the profile, expiresAt }
const PROFILE_REFRESH_MS = 6 * 60 * 60 * 1000;

// Anti-spam debounce queue: aggregates rapid-fire/spam messages and replies once
// Keyed by contactKey(ownerId, senderId) (also inFlightReplies and the media governor) so two
// workspaces chatting with the same senderId never share state
const userDebounceQueues = new Map();
const DEBOUNCE_WAIT_MS = 1000; // Hold on for 1s to group quick back-to-back messages into one reply

// Replies already past the debounce (AI call + typing delay). A newer reply, a creator echo or a
// manual send marks the older one cancelled so it never goes out as a second answer.
const inFlightReplies = new Map();
const cancelInFlightReply = (contactId, takeover = null) => {
  const flight = inFlightReplies.get(contactId);
  if (!flight) return;
  flight.cancelled = true;
  // The owner typed their own reply while the AI had one coming: kept to learn from (correctionLearning)
  if (takeover && !flight.takeover) flight.takeover = takeover;
};

/**
 * The AI's reply was dropped because the owner typed their own: their message is marked as a
 * takeover, and the (their message, AI draft, owner's reply) trio is learned from. Never throws.
 */
function learnFromTakeover(flight, { ownerUser, senderId, userMemory, incoming, draft }) {
  const t = flight?.takeover;
  if (!t || !draft || !ownerUser?._id) return;
  // The echo is saved a moment after the cancel: mark it once it is there
  setTimeout(() => {
    Message.updateOne({ mid: t.mid }, { $set: { origin: 'human_after_draft' } }).catch(() => {});
  }, 3000).unref?.();
  require('./services/correctionLearning').record({
    ownerId: ownerUser._id, senderId, contactName: userMemory?.name || userMemory?.username || '',
    incoming, draft, human: t.text,
  }).then(r => {
    if (r?.rule) console.log(`📚 [Learning] Takeover on ${senderId}: rule "${r.rule.text}" (${r.rule.status}, ${r.rule.support}/3)`);
  }).catch(() => {});
}

/**
 * ---------------------------------------------------------------------
 * 1. META / INSTAGRAM WEBHOOK ENDPOINTS
 * ---------------------------------------------------------------------
 */

// GET /webhook: Webhook verification challenge from Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log(`📡 Webhook challenge received. Mode: ${mode}`);

  if (!VERIFY_TOKEN) return res.sendStatus(503);
  if (mode && token) {
    if (mode === 'subscribe' && safeEqual(token, VERIFY_TOKEN)) {
      console.log('✅ Webhook verified successfully by Meta!');
      return res.status(200).send(challenge);
    } else {
      console.warn('❌ Webhook verification failed. Token mismatch.');
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
});

// Helper to parse message text, reels, posts, story replies, notes, and media attachments
function parseIncomingEventMessage(msg) {
  if (!msg || msg.is_echo) return null;

  let text = (msg.text || '').trim();
  let isReelOrShare = false;
  let isPost = false;
  let isMedia = false;
  let mediaTitle = '';
  let isStoryReply = false;
  let isNoteReply = false;

  // Check if replying to a Story
  if (msg.reply_to?.story || msg.story) {
    isStoryReply = true;
  }

  // Check if replying to a Note
  if (msg.reply_to?.note || msg.note) {
    isNoteReply = true;
  }

  let audioUrl = '';
  const attachmentList = [];
  if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    for (const att of msg.attachments) {
      const type = (att.type || '').toLowerCase();
      const url = att.payload?.url || '';
      const title = att.payload?.title || att.payload?.caption || att.payload?.name || '';
      if (url) attachmentList.push({ type, url, title });

      if (type === 'ig_reel' || type === 'reel' || url.includes('/reel/') || url.includes('/reels/')) {
        isReelOrShare = true;
        mediaTitle = title;
      } else if (type === 'ig_post' || type === 'post' || url.includes('/p/') || url.includes('/tv/')) {
        isPost = true;
        isReelOrShare = true;
        mediaTitle = title;
      } else if (type === 'share') {
        if (url.includes('/reel/') || url.includes('/reels/')) {
          isReelOrShare = true;
        } else {
          isPost = true;
          isReelOrShare = true;
        }
        mediaTitle = title;
      } else if (type === 'story_mention' || type === 'story') {
        isStoryReply = true;
        mediaTitle = 'Mentioned you in their Story';
      } else if (type === 'image') {
        isMedia = true;
        mediaTitle = 'Photo';
      } else if (type === 'video') {
        isMedia = true;
        mediaTitle = 'Video';
      } else if (type === 'audio') {
        isMedia = true;
        mediaTitle = 'Voice message';
        audioUrl = url;
      }
    }
  }

  // Format incoming text with context
  if (isStoryReply) {
    text = text ? `[Replied to your Instagram Story: "${text}"]` : `[Reacted to your Instagram Story with an emoji]`;
  } else if (isNoteReply) {
    text = text ? `[Replied to your Instagram Note: "${text}"]` : `[Reacted to your Instagram Note]`;
  } else if (isPost) {
    text = text
      ? `${text} [Shared an Instagram Post: "${mediaTitle || 'Post'}"]`
      : (mediaTitle ? `[Shared an Instagram Post: "${mediaTitle}"]` : `[Shared an Instagram Post]`);
  } else if (isReelOrShare) {
    text = text
      ? `${text} [Shared an Instagram Reel: "${mediaTitle || 'Reel'}"]`
      : (mediaTitle ? `[Shared an Instagram Reel: "${mediaTitle}"]` : `[Shared an Instagram Reel]`);
  } else if (isMedia) {
    text = text ? `${text} [Sent a ${mediaTitle}]` : `[Sent a ${mediaTitle}]`;
  }

  // If there's neither text nor post/reel/story, skip
  if (!text) return null;

  return { text, isReelOrShare, reelTitle: mediaTitle, isStoryReply, isNoteReply, audioUrl, attachments: attachmentList };
}

// Finds the one workspace that owns an Instagram account id. Fields are checked in order of trust
// (the OAuth-verified instagram.accountId first); an id linked to more than one workspace is ambiguous
// and matches nobody, so an event is never handled with the wrong tenant's persona or token.
const OWNER_ACCOUNT_FIELDS = ['instagram.accountId', 'instagramAccountId', 'instagramId', 'businessProfile.instagramId'];
async function findOwnerByInstagramAccountId(accountId) {
  const id = String(accountId || '').trim();
  if (!id) return { user: null, ambiguous: false };
  for (const field of OWNER_ACCOUNT_FIELDS) {
    const matches = await User.find({ [field]: id }).sort({ _id: 1 }).limit(5);
    if (matches.length === 1) return { user: matches[0], ambiguous: false };
    if (matches.length > 1) {
      const connected = matches.filter(u => u.instagram?.connected && u.instagram?.accountId === id);
      if (connected.length === 1) return { user: connected[0], ambiguous: false };
      console.warn(`⚠️ Instagram account ${id} is linked to ${matches.length} workspaces (${field}); ignoring the event.`);
      return { user: null, ambiguous: true };
    }
  }
  return { user: null, ambiguous: false };
}

// SocialGraph filter for the contacts of a webhook owner (legacy admin contacts have no owner)
const graphOwnerFilter = (ownerUser) => ({ ownerId: ownerUser ? ownerUser._id : null });

// Helper to record messages sent manually by the creator from the Instagram phone app
function handleCreatorEcho(event, accountId) {
  const botAccountId = process.env.INSTAGRAM_ACCOUNT_ID || '17841446877896232';
  const contactId = event.recipient?.id;
  if (!contactId || contactId === botAccountId) return;

  const text = event.message?.text || (event.message?.attachments?.length ? '[Shared Media / Sticker]' : '');
  const mid = event.message?.mid || `echo_${Date.now()}`;

  const senderAccountId = accountId || event.sender?.id || process.env.INSTAGRAM_ACCOUNT_ID || '17841446877896232';

  // Save the reply and update the creator-scoped SocialGraph contact node
  (async () => {
    try {
      // Owner lookup starts now, so a takeover can cancel the bot's next bubble without a DB wait
      const ownerLookup = findOwnerByInstagramAccountId(senderAccountId);
      ownerLookup.catch(() => {}); // awaited below; never an unhandled rejection if we return early
      // Echo of a reply this app just sent: already saved, and it must not cancel the next AI reply.
      // (Waits for an in-flight send to finish, so the creator typing at the same moment still counts.)
      if (await instagramService.isAppEcho(contactId, event.message?.mid, event.message?.text, !!event.message?.attachments?.length)) return;
      console.log(`📱 [Creator Echo]: Creator manually replied to ${contactId} (${text.length} chars)`);

      const { user: ownerUser, ambiguous } = await ownerLookup;
      if (ambiguous) return;
      const key = contactKey(ownerUser?._id, contactId);

      // Cancel any active AI debounce queue so the bot doesn't reply over the creator
      cancelInFlightReply(key, { text, mid, at: Date.now() });
      if (userDebounceQueues.has(key)) {
        clearTimeout(userDebounceQueues.get(key).timer);
        userDebounceQueues.delete(key);
        console.log(`🛑 [Creator Intervened]: Cancelled pending AI auto-reply for ${contactId}`);
      }

      // Record outgoing message in DB (owned, so business stats count the human reply).
      // Meta can deliver the same echo twice: the unique mid makes the second insert fail, and then nothing is counted again
      const isNewEcho = await Message.create({
        ownerId: ownerUser?._id || null,
        senderId: senderAccountId,
        recipientId: contactId,
        role: 'assistant',
        text: text || '[Media]',
        mid,
        sentByAI: false,
        timestamp: new Date(),
      }).then(() => true, (e) => e?.code !== 11000);
      if (!isNewEcho) return;

      // Update contact's memory: fresh interaction reactivates the conversation & resets reminder cycle
      await UserMemory.updateOne({ ownerId: ownerUser?._id || null, senderId: contactId }, {
        lastInteraction: new Date(),
        lastReminderSentAt: null,
        $inc: { messageCount: 1 }
      }).catch(() => {});

      await SocialGraph.updateOne({ senderId: contactId, ...graphOwnerFilter(ownerUser) }, { $inc: { chatsCount: 1 } });
    } catch (_) {}
  })();
}

// POST /webhook: Incoming Instagram Events (DMs, echoes, reels, etc.)
app.post('/webhook', verifyMetaSignature, async (req, res) => {
  const body = req.body || {};
  // Only ids and counts are logged, never message text
  const entries = Array.isArray(body.entry) ? body.entry : [];
  console.log(`📥 [Webhook Event Received]: object=${body.object || '?'} entries=${entries.length} ids=${entries.map(e => e && e.id).filter(Boolean).join(',')}`);

  // Immediately respond 200 OK so Meta doesn't retry
  res.status(200).send('EVENT_RECEIVED');

  for (const entry of body.entry || []) {
    // Format 1: Classic entry.messaging format
    if (Array.isArray(entry.messaging)) {
      for (const event of entry.messaging) {
        if (event.message?.is_echo) {
          handleCreatorEcho(event, entry.id);
          continue;
        }

        const parsed = parseIncomingEventMessage(event.message);
        if (parsed) {
          event.message.text = parsed.text;
          event.message.audioUrl = parsed.audioUrl;
          event.message.attachmentList = parsed.attachments;
          event.isReelOrShare = parsed.isReelOrShare;
          event.reelTitle = parsed.reelTitle;
          handleIncomingInstagramMessage(event, entry.id).catch(err => {
            console.error('Error handling incoming Instagram message:', err);
          });
        }
      }
    }

    // Format 2: Instagram Login entry.changes format (version 26.0)
    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        if (change.field === 'messages' && change.value) {
          const val = change.value;
          if (val.message?.is_echo) {
            handleCreatorEcho({ sender: val.sender, recipient: val.recipient, message: val.message }, entry.id);
            continue;
          }

          const parsed = parseIncomingEventMessage(val.message);
          if (parsed) {
            val.message.text = parsed.text;
            val.message.audioUrl = parsed.audioUrl;
            val.message.attachmentList = parsed.attachments;
            handleIncomingInstagramMessage({
              sender: val.sender,
              recipient: val.recipient,
              timestamp: val.timestamp,
              message: val.message,
              isReelOrShare: parsed.isReelOrShare,
              reelTitle: parsed.reelTitle,
            }, entry.id).catch(err => {
              console.error('Error handling incoming Instagram change event:', err);
            });
          }
        }
      }
    }
  }
});


/**
 * Core processing logic for an incoming Instagram DM
 */
async function handleIncomingInstagramMessage(event, accountId = null) {
  const senderId = event.sender.id;
  const recipientId = event.recipient.id;
  // Voice notes: answer what they said (transcribed), not "[Sent a Voice message]"
  if (event.message.audioUrl) {
    const transcript = await transcribeService.transcribeUrl(event.message.audioUrl);
    event.message.text = transcribeService.withTranscript(event.message.text, transcript);
  }
  // Photos and videos: the AI looks at them (video: a few frames) and answers what it sees
  for (const att of (event.message.attachmentList || []).filter(a => a.type === 'image' || a.type === 'video').slice(0, 3)) {
    const kind = att.type === 'video' ? 'video' : 'photo';
    const description = await mediaService.describeUrl(att.url, kind);
    att.description = description || '';
    event.message.text = mediaService.withDescription(event.message.text, kind, description);
  }
  const messageText = event.message.text;
  const mid = event.message.mid;
  const isReelOrShare = event.isReelOrShare;

  const targetAccountId = accountId || recipientId;

  // 1. Locate the creator (tenant) that owns the receiving Instagram account
  const { user: ownerUser, ambiguous } = await findOwnerByInstagramAccountId(targetAccountId);
  if (ambiguous) return;
  const isLegacyAdminAccount = targetAccountId === (process.env.INSTAGRAM_ACCOUNT_ID || '17841446877896232');

  // Safe drop: never answer an unrecognized account with the admin's persona or token
  if (!ownerUser && !isLegacyAdminAccount) {
    console.warn(`⚠️ Unrecognized recipient account ${targetAccountId}. Dropping event safely.`);
    return;
  }
  if (ownerUser && ownerUser.isBanned) {
    console.warn(`⚠️ Account ${targetAccountId} belongs to a suspended tenant. Dropping event.`);
    return;
  }

  // 2. Fetch the creator's specific PersonaConfig (global config is only for the legacy admin bot)
  let config = null;
  if (ownerUser) {
    config = await PersonaConfig.findOne({ ownerId: ownerUser._id });
  }
  // Only the legacy admin bot (no owner, or the superadmin) may use the ownerless persona
  if (!config && isLegacyAdminAccount && (!ownerUser || ownerUser.role === 'superadmin')) {
    config = await PersonaConfig.findOne({ ownerId: null });
  }
  if (!config) {
    console.warn(`⚠️ No persona configured for account ${targetAccountId}. Dropping event safely.`);
    return;
  }

  // 3. Resolve active token for this creator: the encrypted OAuth token first, then legacy plaintext copies
  //    (env admin token only for the legacy admin account when it is not claimed by a tenant: a tenant
  //    that typed in the legacy id must never send with, or read the DMs of, the admin's account)
  const creatorAccessToken = getUserInstagramToken(ownerUser) ||
                             (config && config.instagramPageAccessToken) ||
                             (isLegacyAdminAccount && (!ownerUser || ownerUser.role === 'superadmin') ? process.env.INSTAGRAM_PAGE_ACCESS_TOKEN : '');

  // Prevent bot from replying to itself
  if (senderId === targetAccountId) {
    return;
  }

  if (!creatorAccessToken) {
    console.warn(`⚠️ [Webhook] No access token found for account ${targetAccountId}. Event received but cannot send reply.`);
    return;
  }

  // Deduplication check (bypass for test random_mid)
  if (mid && mid !== 'random_mid' && processedMids.has(mid)) {
    console.log(`⚠️ Duplicate mid detected: ${mid}, skipping.`);
    return;
  }
  if (mid && mid !== 'random_mid') {
    processedMids.add(mid);
    if (processedMids.size > 2000) {
      const firstKey = processedMids.keys().next().value;
      processedMids.delete(firstKey);
    }
  }

  console.log(`\n💬 [Incoming DM] Account: ${targetAccountId} | From: ${senderId} | ${String(messageText || '').length} chars`);

  // Safe timestamp parser
  let msgTime = new Date();
  if (event.timestamp) {
    const num = Number(event.timestamp);
    if (!isNaN(num)) {
      msgTime = new Date(num > 1e11 ? num : num * 1000);
    }
  }

  // 2. Fetch or create user memory. The profile lookup can take many seconds with retries, so one lookup
  // per contact is shared for 6 hours (30 minutes after a failure). Messages arriving while it runs wait for
  // that same lookup, in arrival order, so a burst still reaches the debounce queue in order; the cached
  // profile also fills in a contact that was deleted and messages again.
  const profileKey = `${ownerUser?._id || ''}:${senderId}`;
  let lookup = recentProfileLookups.get(profileKey);
  if (!lookup || Date.now() > lookup.expiresAt) {
    const promise = instagramService.getUserProfile(senderId, creatorAccessToken).catch(() => null);
    lookup = { promise, expiresAt: Infinity };
    recentProfileLookups.delete(profileKey);
    recentProfileLookups.set(profileKey, lookup);
    while (recentProfileLookups.size > 5000) recentProfileLookups.delete(recentProfileLookups.keys().next().value);
    const entry = lookup;
    promise.then(p => { entry.expiresAt = Date.now() + (p ? PROFILE_REFRESH_MS : 30 * 60 * 1000); });
  }
  const userProfile = await lookup.promise;
  const userMemory = await memoryService.getOrCreateUserMemory(senderId, userProfile, memOptsFor(ownerUser));
  if (ownerUser && !userMemory.ownerId) userMemory.ownerId = ownerUser._id;

  // Their memory needs an update (the indexer picks it up in the background)
  memoryIndexService.markDirty(userMemory.ownerId || null, senderId);

  // Keep links / files / photos they sent, and email the owner when the message needs them
  importantService.capture({
    ownerId: userMemory.ownerId || null, senderId, name: userMemory.name || userMemory.username || '',
    text: messageText, attachments: event.message.attachmentList || [], mid,
  }).catch(() => {});

  // If the AI asked them something it wasn't sure about, their answer closes that question
  require('./services/chatDoubts').checkAnswer(userMemory.ownerId || null, senderId, userMemory.name || userMemory.username || '', messageText).catch(() => {});

  // 3. Save incoming user message in DB
  await Message.create({
    ownerId: ownerUser?._id || null,
    senderId,
    recipientId,
    role: 'user',
    text: messageText,
    mid: mid === 'random_mid' ? `test_${Date.now()}` : mid,
    timestamp: msgTime,
  });

  // Re-activate conversation: update lastInteraction and clear lastReminderSentAt
  userMemory.lastInteraction = msgTime;
  userMemory.lastReminderSentAt = null;
  userMemory.messageCount = (userMemory.messageCount || 0) + 1;
  if (isReelOrShare) {
    userMemory.reelsCount = (userMemory.reelsCount || 0) + 1;
  }
  userMemory.recentChatBuffer = (userMemory.recentChatBuffer || []).slice(-9);
  userMemory.recentChatBuffer.push({
    role: 'user',
    text: messageText,
    timestamp: msgTime,
  });
  // One atomic update: UserMemory has no version key, so save() would $set the counter and buffer
  // read before this DM and two quick DMs would overwrite each other's count / buffer entry
  await UserMemory.updateOne({ _id: userMemory._id }, {
    $set: { lastInteraction: msgTime, lastReminderSentAt: null, ...(userMemory.isModified('ownerId') ? { ownerId: userMemory.ownerId } : {}) },
    $inc: { messageCount: 1, ...(isReelOrShare ? { reelsCount: 1 } : {}) },
    $push: {
      recentChatBuffer: {
        $each: [{ role: 'user', text: messageText, timestamp: msgTime }],
        $slice: -10
      }
    }
  }).catch(e => console.warn('UserMemory update notice:', e.message));
  await redisService.pushMessage(senderId, { role: 'user', text: messageText, timestamp: msgTime });

  // Atomically persist cumulative counts to SocialGraph node or auto-create for creator
  (async () => {
    try {
      const incPayload = {
        chatsCount: 1,
        ...(isReelOrShare ? { reelsCount: 1 } : {})
      };
      const creatorFilter = graphOwnerFilter(ownerUser);

      const res = await SocialGraph.updateOne({ senderId, ...creatorFilter }, { $inc: incPayload });
      if (res.matchedCount === 0) {
        const cleanU = (userMemory.username || '').replace(/^@/, '').trim();
        let matched = false;
        if (cleanU) {
          const res2 = await SocialGraph.updateOne(
            {
              ...creatorFilter,
              $or: [
                { instagramHandle: `@${cleanU}` },
                { instagramHandle: cleanU },
                { aliases: cleanU.toLowerCase() }
              ]
            },
            { $inc: incPayload }
          );
          matched = res2.matchedCount > 0;
        }
        if (!matched && ownerUser) {
          // Upsert by creator + sender: two first DMs arriving together make ONE card and both are counted
          await SocialGraph.updateOne({ ownerId: ownerUser._id, senderId }, {
            $setOnInsert: {
              ownerUsername: ownerUser.username,
              name: userMemory.name || userMemory.username || `User_${senderId.slice(-4)}`,
              instagramHandle: cleanU ? `@${cleanU}` : '',
              profilePic: userMemory.profilePic || '',
              category: 'online_friend',
              ...(isReelOrShare ? {} : { reelsCount: 0 })
            },
            $inc: incPayload
          }, { upsert: true });
        }
      }
    } catch (_) {}
  })();

  // ─────────────────────────────────────────────────────────────────────────
  // ALWAYS LEARN — regardless of AI being paused, enabled, or globally off.
  // This ensures the profile auto-fills even when you manually manage chats.
  // One background run per contact once the chat goes quiet (not one full AI analysis per DM).
  // ─────────────────────────────────────────────────────────────────────────
  memoryService.scheduleMemoryUpdate(senderId, memOptsFor(ownerUser));

  // 4. Global pause, chat mode lists and their own switch: the same rule every page shows
  const replyContact = { senderId, handle: userMemory.username, name: userMemory.name, aiEnabled: userMemory.aiEnabled, replyToMessages: userMemory.replyToMessages };
  if (!aiRepliesTo(replyContact, config, { includeGlobal: true })) {
    console.log(`⏸️ No auto-reply to ${userMemory.username || senderId}: ${whyQuiet(replyContact, config)}. Message learned.`);
    return;
  }

  // 5. Shared Reel/Post: never send an AI text reply. The AI only sees the caption, not the
  // video, so its replies were guesses. Only the optional emoji reaction is sent (personal accounts).
  if (isReelOrShare) {
    const isBusinessTenant = celRuleEngine.isBusinessAccount(ownerUser?.accountType || config?.accountType);
    const workspaceFeatures = await workspaceFeatureService.getFeaturesSafe(ownerUser);
    if (!isBusinessTenant && workspaceFeatures.enabledFeatures.reelEmojiReactions && mid && mid !== 'random_mid') {
      SocialGraph.findOne({ senderId, ...graphOwnerFilter(ownerUser) }, { roastiness: 1 }).lean()
        .catch(() => null)
        .then(node => instagramService.sendMessageReaction(senderId, mid, reelReactionEmoji(node?.roastiness), creatorAccessToken))
        .catch(() => {});
    }
  }

  if (!shouldSendAiTextReply({ aiEnabled: userMemory.aiEnabled, replyToMessages: userMemory.replyToMessages, isReelOrShare })) {
    console.log(isReelOrShare
      ? `⏭️ Reel/Post from @${userMemory.username}: no AI text reply.`
      : `⏸️ Message reply disabled for @${userMemory.username}. Skipping.`);
    return;
  }

  // 6. Anti-Spam / Debounce Logic:
  // If the user is rapid-firing messages or spamming, hold on until they stop typing!
  // This aggregates their messages, saves tokens, and replies once naturally like a human.
  const queueKey = contactKey(ownerUser?._id, senderId);
  if (userDebounceQueues.has(queueKey)) {
    const existing = userDebounceQueues.get(queueKey);
    clearTimeout(existing.timer);
    existing.messages.push({ text: messageText, mid });
    existing.lastMid = mid;

    console.log(`⏳ [Anti-Spam / Debounce]: User ${senderId} sent another message (${existing.messages.length} queued). Holding on for ${DEBOUNCE_WAIT_MS / 1000}s...`);

    existing.timer = setTimeout(() => {
      userDebounceQueues.delete(queueKey);
      dispatchDebouncedReply(existing).catch(err => {
        console.error('❌ Error dispatching debounced reply:', err);
      });
    }, DEBOUNCE_WAIT_MS);
    return;
  }

  // First message in a potential cluster: start debounce window
  const queueEntry = {
    key: queueKey,
    senderId,
    recipientId,
    targetAccountId,
    creatorAccessToken,
    ownerUser,
    userMemory,
    config,
    messages: [{ text: messageText, mid }],
    lastMid: mid,
    timer: null,
  };

  userDebounceQueues.set(queueKey, queueEntry);
  queueEntry.timer = setTimeout(() => {
    userDebounceQueues.delete(queueKey);
    dispatchDebouncedReply(queueEntry).catch(err => {
      console.error('❌ Error dispatching debounced reply:', err);
    });
  }, DEBOUNCE_WAIT_MS);
}

/**
 * Dispatches a single, smart AI reply after user finishes typing their message(s)
 */
async function dispatchDebouncedReply(queueEntry) {
  // This reply replaces any older one still being written for the same contact
  cancelInFlightReply(queueEntry.key);
  const flight = { cancelled: false };
  inFlightReplies.set(queueEntry.key, flight);
  try {
    await writeAndSendReply(queueEntry, flight);
  } finally {
    if (inFlightReplies.get(queueEntry.key) === flight) inFlightReplies.delete(queueEntry.key);
  }
}

async function writeAndSendReply(queueEntry, flight) {
  const { key: mediaKey, senderId, recipientId, targetAccountId, creatorAccessToken, ownerUser, userMemory, config, messages, lastMid } = queueEntry;

  // Combine multiple messages if user sent a cluster
  const combinedText = messages.map(m => m.text).join('\n');
  if (messages.length > 1) {
    console.log(`🧠 [Anti-Spam Batching]: Aggregated ${messages.length} messages from ${senderId}`);
  }

  // Send read receipt immediately (fire-and-forget so the Graph round-trip never delays the reply)
  instagramService.sendSenderAction(senderId, 'mark_seen', creatorAccessToken).catch(() => {});

  // Fetch recent conversation history
  // History and workspace features load together (one DB wait instead of two)
  const [recentHistory, { enabledFeatures, activeMode }] = await Promise.all([
    // last 40 messages: enough of the real chat for replies that follow the conversation, not just the last line
    Message.find(conversationMessages(ownerUser?._id, senderId)).sort({ createdAt: -1 }).limit(40),
    workspaceFeatureService.getFeaturesSafe(ownerUser),
  ]);
  let history = recentHistory;

  history.reverse();

  // If DB history is sparse or pruned, fallback to UserMemory.recentChatBuffer!
  if ((!history || history.length === 0) && userMemory.recentChatBuffer && userMemory.recentChatBuffer.length > 0) {
    history = userMemory.recentChatBuffer.map(m => ({
      role: m.role,
      text: m.text,
      timestamp: m.timestamp
    }));
  }

  let replyText = '';
  let stickerType = null;
  let sendResult = null;

  // Business tenants: no stickers or GIFs, professional fallbacks, escalations hand off to a human
  const isBusinessTenant = celRuleEngine.isBusinessAccount(ownerUser?.accountType || config?.accountType);
  const businessDecision = isBusinessTenant
    ? celRuleEngine.evaluateForTenant({
        accountType: 'business',
        userMemory,
        incomingText: combinedText,
        businessConfig: config,
        customRules: config?.businessPolicy?.customRules || [],
      })
    : null;
  const fallbackReply = isBusinessTenant
    ? 'Thanks for your message! Our team will get back to you shortly.'
    : 'yoo wassup!';

  // Runs once per batch, even when the reply was superseded or switched off, so escalations
  // and lead/booking capture are never lost
  let aiFailed = false;
  const afterTurn = async (deliveredText) => {
    if (ownerUser && (enabledFeatures.leadExtraction || enabledFeatures.bookingScheduler)) {
      analyticsService.processConversationTurn({
        ownerId: ownerUser._id,
        senderId,
        timeZone: config?.businessPolicy?.timezone || null,
        handle: userMemory.username || '',
        incomingText: combinedText,
        replyText: deliveredText || '',
        captureLeads: enabledFeatures.leadExtraction,
        captureBookings: enabledFeatures.bookingScheduler,
      }).catch(() => {});
    }
    // Business escalation: pause the bot for this customer and queue them for a human. Also when
    // the AI failed and the customer was told "our team will get back to you"
    const escalateForFailure = isBusinessTenant && aiFailed;
    if ((businessDecision?.shouldEscalate || escalateForFailure) && enabledFeatures.humanHandoffInbox) {
      const reason = businessDecision?.shouldEscalate
        ? (businessDecision.context.message.matchedEscalation || businessDecision.chatType)
        : 'ai_unavailable';
      await UserMemory.updateOne(
        { _id: userMemory._id },
        { $set: { aiEnabled: false, handoffRequestedAt: new Date(), handoffReason: reason } }
      ).catch(err => console.warn('⚠️ [Handoff] Could not flag customer:', err.message));
      await redisService.invalidateUserMemory(senderId).catch(() => {});
      console.log(`🙋 [Handoff]: Customer ${senderId} escalated (${reason}); bot paused for this chat.`);
    }
  };

  try {
    // Turn on typing indicator while generating (fire-and-forget so a slow Graph call never delays the reply)
    instagramService.sendSenderAction(senderId, 'typing_on', creatorAccessToken).catch(() => {});

    // Generate response mimicking creator persona
    console.log(`🤖 Generating ${config?.creatorName || 'Creator'}'s response via Azure OpenAI...`);
    try {
      replyText = await azureOpenAI.generateReply({
        userMemory,
        messageHistory: history,
        incomingText: combinedText,
        config,
        tenant: ownerUser,
        features: { ...enabledFeatures, activeMode },
      });
    } catch (aiErr) {
      console.error(`❌ [AI Generation Error]:`, aiErr.message);
      // Fallback reply so recipient is never left on read
      replyText = fallbackReply;
      aiFailed = true;
    }

    if (!replyText || replyText.trim().length === 0) {
      replyText = fallbackReply;
      aiFailed = true;
    }

    // Extract optional sticker or attachment tag (e.g. [ATTACHMENT: joy], [STICKER: lol])
    const stickerMatch = replyText.match(/\[(?:STICKER|ATTACHMENT):\s*([a-zA-Z0-9_-]+)\]/i);
    if (stickerMatch) {
      stickerType = stickerMatch[1].toLowerCase();
      replyText = replyText.replace(/\[(?:STICKER|ATTACHMENT):\s*[a-zA-Z0-9_-]+\]/gi, '').trim();
    }

    // Strip robotic clichés / bullets and apply casual texting punctuation (§15.6)
    if (replyText && enabledFeatures.antiAiHumanMimicry) replyText = humanizeReply(replyText, { isBusiness: isBusinessTenant }) || fallbackReply;

    const lowerIn = (combinedText || '').toLowerCase();
    const lowerReply = (replyText || '').toLowerCase();
    const isExplicitMediaRequest = /send (?:gif|meme|pic|image)|gif send|send a (?:gif|meme)|meme anupu|gif anupu/i.test(lowerIn);

    // 1. SAFETY FILTER: Block any invalid 'sad' tag if discussing Furina, Genshin, anime, laughing, or no genuine sorrow
    if (stickerType === 'sad') {
      const isFurinaOrAnime = /furina|genshin|fontaine|anime|archon|drama queen/.test(lowerIn);
      const isLaughing = /😂|💀|lol|lmao|rofl|haha|dead|dying/.test(lowerIn) || /😂|💀|lol|lmao/.test(lowerReply);
      const isGenuineSorrow = /heartbroken|depressed|so sad rn|crying inside|hurting|grief/.test(lowerIn);
      if (isFurinaOrAnime || isLaughing || !isGenuineSorrow) {
        console.log(`🛡️ [Media Governor]: Rejected false-positive 'sad' tag for Furina/casual context.`);
        stickerType = null;
      }
    }

    // 2. GOVERNOR RATE & PACING CHECK:
    // If AI appended an attachment, check if governor permits it (chat pacing: 2-3 text replies, and hourly limit < 60/hr)
    if (stickerType && !canSendMedia(mediaKey, isExplicitMediaRequest)) {
      console.log(`🛡️ [Media Governor]: Suppressed AI attachment [${stickerType}] to enforce 2-3 text pacing or hourly limit.`);
      stickerType = null;
    }

    // 3. SPORADIC MEDIA DISPATCH (Only when Governor permits):
    // Cadence: Reply 2 or 3 text messages in a row, then ~1 in 6 random chance ("bullet in trigger out of 6") or high-confidence reaction
    if (!isBusinessTenant && enabledFeatures.mediaStickerVault && !stickerType && canSendMedia(mediaKey, isExplicitMediaRequest)) {
      let detectedCat = null;
      if (isExplicitMediaRequest) {
        detectedCat = 'joy';
      } else if (lowerIn.includes('sus') || lowerIn.includes('are you a bot') || lowerIn.includes('ur a bot') || lowerIn.includes('fake ai') || lowerIn.includes('you are ai') || lowerIn.includes('doubt')) {
        detectedCat = 'side_eye';
      } else if (lowerIn.includes('lmao') || lowerIn.includes('rofl') || lowerIn.includes('dead af') || lowerIn.includes('dying rn')) {
        detectedCat = 'lol';
      } else if (lowerIn.includes('mind blown') || lowerIn.includes('shocking') || lowerIn.includes('no way bro')) {
        detectedCat = 'wonder';
      } else if (Math.random() < (1 / 6)) {
        // "Bullet in trigger out of 6" (~16.7% random chance when eligible after text messages):
        const pool = ['joy', 'lol', 'side_eye', 'cool'];
        detectedCat = pool[Math.floor(Math.random() * pool.length)];
      }

      if (detectedCat) {
        stickerType = detectedCat;
        console.log(`🎯 [Media Governor Triggered]: Auto-attached [${detectedCat}] (cadence satisfied & 1/6 bullet chance hit)`);
      }
    }

    // Stickers, GIFs and meme drops are never sent for business accounts or with the Media Vault feature off
    if (isBusinessTenant || !enabledFeatures.mediaStickerVault) stickerType = null;
    if (stickerType && !stickerService.hasSticker(stickerType)) stickerType = null;
    // A reply that was only a sticker tag, with the sticker then held back, must still say something
    if (!stickerType && !String(replyText || '').trim()) replyText = fallbackReply;

    // Fast replies (2026-11-05): the AI call is already the wait, so only a tiny typing pause is added.
    // - Emojis / reactions (<= 4 chars or pure emoji): 300ms
    // - Text: 300ms + 4ms per character, capped at 1200ms
    // - Human Mimicry off: no pause at all
    const trimmedReply = (replyText || '').trim();
    const charLength = trimmedReply.length;
    const isEmojiOnly = /^[\p{Emoji}\s\d\p{P}]+$/u.test(trimmedReply);
    const isUltraShort = charLength <= 4 || isEmojiOnly;

    let humanTypingDelayMs;
    if (!enabledFeatures.antiAiHumanMimicry) {
      humanTypingDelayMs = 0;
    } else if (isUltraShort) {
      humanTypingDelayMs = 300;
    } else {
      humanTypingDelayMs = Math.min(300 + charLength * 4, 1200);
    }

    console.log(`⏳ [Realistic Human Typing Delay]: ${humanTypingDelayMs}ms for ${charLength} characters (ultra-short: ${isUltraShort})...`);

    // Keep typing indicator actively pulsing on Instagram every 3.5 seconds so it NEVER drops while typing
    instagramService.sendSenderAction(senderId, 'typing_on', creatorAccessToken).catch(() => {});
    const typingPulseInterval = setInterval(() => {
      instagramService.sendSenderAction(senderId, 'typing_on', creatorAccessToken).catch(() => {});
    }, 3500);

    try {
      await new Promise(resolve => setTimeout(resolve, humanTypingDelayMs));
    } finally {
      clearInterval(typingPulseInterval);
    }

    console.log(`✨ [AI Reply]: ${String(replyText || "").length} chars to ${senderId} ${stickerType ? `[Media/Sticker: ${stickerType}]` : ""}`);

    // The wait above can be up to ~34s: drop this reply if it was replaced, or AI was switched off meanwhile
    if (flight.cancelled) {
      console.log(`🛑 [Reply Superseded]: A newer reply or the creator took over for ${senderId}; not sending.`);
      learnFromTakeover(flight, { ownerUser, senderId, userMemory, incoming: combinedText, draft: replyText });
      await afterTurn('');
      return;
    }
    // Same switches as at the start (global pause, chat mode lists, per-person toggles): any of them may
    // have been flipped while the reply was being written
    const [latestMemory, latestConfig] = await Promise.all([
      UserMemory.findById(userMemory._id, { aiEnabled: 1, replyToMessages: 1, username: 1, name: 1 }).lean(),
      config?._id ? PersonaConfig.findById(config._id, { globalBotActive: 1, chatMode: 1, excludedContactIds: 1, includedContactIds: 1 }).lean() : null,
    ]);
    const latest = latestMemory || userMemory;
    const switchedOff = !aiRepliesTo(
      { senderId, handle: latest.username, name: latest.name, aiEnabled: latest.aiEnabled, replyToMessages: latest.replyToMessages },
      latestConfig || config,
      { includeGlobal: true },
    );
    if (switchedOff) {
      console.log(`⏸️ AI was switched off for ${senderId} while typing; not sending.`);
      await afterTurn('');
      return;
    }

    // Never agree for the owner: if they just asked for something that needs the owner and the
    // reply says yes, a holding line goes out instead (the owner was emailed and decides)
    // Checked on their message itself (instant), not only on the AI's slower importance check
    if (replyText && !isBusinessTenant && commitsOwner(replyText) &&
        (asksForCommitment(combinedText) ||
         await importantService.recentNeedsYou(userMemory.ownerId || null, senderId).catch(() => false))) {
      console.log(`🛑 [No commitment] Reply "${replyText.slice(0, 60)}" would agree for the owner; sending a holding reply.`);
      replyText = holdingReply();
    }

    const hasText = !!(replyText && replyText.trim().length > 0);
    // Only the bubbles that really reached Instagram are saved to history
    const deliveredBubbles = [];
    if (hasText) {
      // Personal replies with two distinct thoughts go out as 2-3 bubbles, 1-2s apart (§15.6.5)
      const bubbles = (isBusinessTenant || !enabledFeatures.antiAiHumanMimicry) ? [replyText] : splitIntoBubbles(replyText);
      // The database checks above take time too: the creator may have taken over meanwhile
      if (flight.cancelled) {
        console.log(`🛑 [Reply Superseded]: The creator took over ${senderId} just before sending; not sending.`);
        learnFromTakeover(flight, { ownerUser, senderId, userMemory, incoming: combinedText, draft: replyText });
        await afterTurn('');
        return;
      }
      sendResult = await instagramService.sendTextMessage(senderId, bubbles[0], creatorAccessToken, lastMid);
      if (sendResult?.success === true) deliveredBubbles.push(bubbles[0]);
      for (const bubble of bubbles.slice(1)) {
        if (sendResult?.success !== true || flight.cancelled) break;
        instagramService.sendSenderAction(senderId, 'typing_on', creatorAccessToken).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, bubbleGapMs()));
        // The creator may have taken over during the gap (their echo is checked after our last send)
        if (flight.cancelled) break;
        const bubbleResult = await instagramService.sendTextMessage(senderId, bubble, creatorAccessToken);
        if (bubbleResult?.success !== true) break;
        deliveredBubbles.push(bubble);
      }
    }

    // If a sticker or media attachment was chosen, send the image/GIF directly to Instagram DM!
    let stickerSendResult = null;
    let mediaWasSent = false;
    if (stickerType && !flight.cancelled && stickerService.hasSticker(stickerType)) {
      // GIFs react to the HUMAN'S chat message, never our AI reply text
      const stickerUrl = await stickerService.getStickerUrl(stickerType, combinedText, config?.ownerId ? { _id: config.ownerId } : null);
      if (stickerUrl) {
        if (hasText) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        if (flight.cancelled) {
          console.log(`🛑 [Sticker Dispatch]: Creator took over ${senderId}; sticker not sent.`);
        } else if (hasText) {
          try {
            console.log(`🖼️ [Sticker Dispatch]: Sending accessory ${stickerType} sticker (${stickerUrl}) to ${senderId}...`);
            const accRes = await instagramService.sendImageMessage(senderId, stickerUrl, creatorAccessToken);
            if (accRes?.success) {
              mediaWasSent = true;
              recordMediaSent(mediaKey);
            } else {
              console.warn(`⚠️ [Sticker Dispatch]: Sticker accessory send unsuccessful:`, accRes?.error);
            }
          } catch (e) {
            console.error(`❌ [Sticker Error]: Failed to send sticker:`, e.message);
          }
        } else {
          try {
            console.log(`🖼️ [Sticker Dispatch]: Sending sticker-only ${stickerType} (${stickerUrl}) to ${senderId}...`);
            stickerSendResult = await instagramService.sendImageMessage(senderId, stickerUrl, creatorAccessToken);
            if (stickerSendResult?.success) {
              mediaWasSent = true;
              recordMediaSent(mediaKey);
            } else {
              console.warn(`⚠️ [Sticker Dispatch]: Sticker-only send unsuccessful:`, stickerSendResult?.error);
            }
          } catch (e) {
            console.error(`❌ [Sticker Error]: Failed to send sticker:`, e.message);
          }
        }
      }
    }

    // A sticker-only reply whose sticker could not be found or sent falls back to text, so nobody is left on read
    let fallbackSent = false;
    if (!hasText && stickerSendResult?.success !== true && !flight.cancelled) {
      sendResult = await instagramService.sendTextMessage(senderId, fallbackReply, creatorAccessToken, lastMid);
      if (sendResult?.success === true) { deliveredBubbles.push(fallbackReply); fallbackSent = true; }
    }

    // Only persist if text delivery succeeded, or if sticker-only dispatch succeeded
    const textDelivered = (hasText || fallbackSent) && sendResult?.success === true;
    const stickerDelivered = !hasText && !fallbackSent && stickerSendResult?.success === true;

    // Track conversational text count if text was delivered without media
    if (textDelivered && !mediaWasSent) {
      recordTextSent(mediaKey);
    }

    if (textDelivered || stickerDelivered) {
      const persistedText = textDelivered ? deliveredBubbles.join('\n') : `[Sent ${stickerType} sticker]`;

      // Save outgoing message in DB
      await Message.create({
        ownerId: ownerUser?._id || null,
        senderId: recipientId,
        recipientId: senderId,
        role: 'assistant',
        text: persistedText,
        mid: sendResult?.data?.message_id || stickerSendResult?.data?.message_id || `out_${Date.now()}`,
        sentByAI: true,
        timestamp: new Date(),
      });

      // Also append outgoing assistant reply to UserMemory recentChatBuffer
      // Atomic push: a read-modify-save here could wipe an incoming DM pushed in between
      try {
        const bufEntry = { role: 'assistant', text: persistedText, timestamp: new Date() };
        await UserMemory.updateOne(
          { _id: userMemory._id },
          { $push: { recentChatBuffer: { $each: [bufEntry], $slice: -10 } } }
        );
        await redisService.pushMessage(senderId, bufEntry);
        await redisService.invalidateUserMemory(senderId);
      } catch (bufErr) {}
    }

    await afterTurn(textDelivered ? deliveredBubbles.join('\n') : '');
  } finally {
    // Ensure typing indicator is always turned off
    await instagramService.sendSenderAction(senderId, 'typing_off', creatorAccessToken).catch(() => {});
  }

  // Memory update already triggered earlier (ALWAYS-LEARN block) — no duplicate needed here.
  // But re-trigger if the reply itself contained new info (e.g. we asked a curiosity question)
  // (merged with the run already queued by the incoming DM: no extra AI call)
  memoryService.scheduleMemoryUpdate(senderId, memOptsFor(ownerUser));
}

/**
 * ---------------------------------------------------------------------
 * 2. DASHBOARD & MANAGEMENT API ENDPOINTS
 * ---------------------------------------------------------------------
 */

// Status check endpoint
// Public callers only get { status: 'ok' }; a signed-in superadmin gets the details
app.get('/api/status', publicLimiter, (req, res, next) => {
  const auth = req.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return res.json({ status: 'ok' });
  requireAuth(req, res, next);
}, async (req, res) => {
  if (!isSuperUser(req)) return res.json({ status: 'ok' });
  try {
    const config = (await PersonaConfig.findOne({ ownerId: req.user._id })) || (await PersonaConfig.findOne({ ownerId: null })) || {};
    const totalUsers = await UserMemory.countDocuments();
    const totalMessages = await Message.countDocuments();
    const token = await instagramService.getAccessToken();

    res.json({
      status: 'ok',
      creatorName: config.creatorName || '',
      instagramHandle: config.instagramHandle || '',
      globalBotActive: config.globalBotActive ?? true,
      chatMode: config.chatMode || 'everyone',
      hasPageAccessToken: !!(token && token.length > 10),
      appId: process.env.META_APP_ID || '',
      totalUsers,
      totalMessages,
      azureModel: azureOpenAI.defaultDeployment,
    });
  } catch (err) {
    sendServerError(res, err, 'Status');
  }
});

// List all conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const users = await UserMemory.find(inMemories(req, {})).sort({ lastInteraction: -1 }).limit(50);
    // Last message of every contact, all lookups in parallel (was 50 lookups one after another)
    const lastMessages = await Promise.all(users.map(u =>
      Message.findOne(conversationMessages(u.ownerId, u.senderId)).sort({ createdAt: -1 }).select('text role timestamp createdAt').lean()));
    const conversations = users.map((u, i) => {
      const lastMessage = lastMessages[i];
      return {
        user: u,
        lastMessage: lastMessage ? {
          text: lastMessage.text,
          role: lastMessage.role,
          timestamp: lastMessage.timestamp || lastMessage.createdAt,
        } : null,
      };
    });

    res.json(conversations);
  } catch (err) {
    sendServerError(res, err);
  }
});

// Get messages for a specific conversation
app.get('/api/conversations/:senderId/messages', async (req, res) => {
  try {
    const { senderId } = req.params;
    const memory = await UserMemory.findOne(ownedMemoryQuery(req, senderId));
    if (!memory) return res.status(404).json({ error: 'User not found' });
    const messages = await Message.find(conversationMessages(memory.ownerId, senderId)).sort({ createdAt: 1 }).limit(100);

    res.json({ memory, messages });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Toggle AI for a specific user
app.post('/api/conversations/:senderId/toggle-ai', async (req, res) => {
  try {
    const { senderId } = req.params;
    const memory = await UserMemory.findOne(ownedMemoryQuery(req, senderId));
    if (!memory) return res.status(404).json({ error: 'User not found' });

    memory.aiEnabled = !memory.aiEnabled;
    if (memory.aiEnabled) memory.handoffRequestedAt = null;
    await memory.save();

    res.json({ success: true, aiEnabled: memory.aiEnabled });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Manually send message as Sam from the dashboard
app.post('/api/conversations/:senderId/send', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { text } = req.body;
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'Text required' });

    // Send with the contact owner's token; only legacy admin contacts use the admin token
    const memory = await UserMemory.findOne(ownedMemoryQuery(req, senderId));
    if (!memory) return res.status(404).json({ error: 'User not found' });
    const ownerToken = await getOwnerSendToken(memory.ownerId);
    if (ownerToken === '') {
      return res.status(409).json({ error: 'Instagram is not connected for this account.' });
    }
    // The creator is replying by hand: stop any AI reply for this person BEFORE sending, so it
    // cannot slip out while this send is still on its way to Instagram
    cancelInFlightReply(contactKey(memory.ownerId, senderId));
    const sendResult = await instagramService.sendTextMessage(senderId, text, ownerToken);
    if (!sendResult || sendResult.success !== true) {
      // Nothing reached Instagram: say so and do not store a message that was never delivered
      const e = sendResult?.error;
      const reason = sendResult?.reason || (typeof e === 'string' ? e : e?.error?.message) || 'Instagram rejected the message';
      return res.status(502).json({ error: `Message not sent: ${reason}` });
    }

    // Save in DB (same owner as the contact, so it shows in this conversation)
    const newMsg = await Message.create({
      ownerId: memory.ownerId || null,
      senderId: 'me',
      recipientId: senderId,
      role: 'assistant',
      text,
      mid: sendResult?.data?.message_id || `manual_${Date.now()}`,
      sentByAI: false,
      timestamp: new Date(),
    });

    // Cancel any active AI debounce queue so the bot doesn't reply over the creator
    const key = contactKey(memory.ownerId, senderId);
    cancelInFlightReply(key);
    if (userDebounceQueues.has(key)) {
      clearTimeout(userDebounceQueues.get(key).timer);
      userDebounceQueues.delete(key);
    }

    // Update memory interaction time & reset reminder cycle to reactivate conversation
    await UserMemory.updateOne({ _id: memory._id }, {
      lastInteraction: new Date(),
      lastReminderSentAt: null,
      $inc: { messageCount: 1 }
    });

    res.json({ success: true, message: newMsg, graphResult: sendResult });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Update custom per-person AI reply toggles and preferences
app.post('/api/conversations/:senderId/preferences', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { 
      aiEnabled, 
      replyToMessages, 
      replyToReelsAndPosts, 
      remindersEnabled, 
      nickname, 
      gender, 
      personalNotes,
      conversationStyle,
      relationshipType
    } = req.body;

    const memory = await UserMemory.findOne(ownedMemoryQuery(req, senderId));
    if (!memory) return res.status(404).json({ error: 'User not found' });

    if (typeof aiEnabled === 'boolean') memory.aiEnabled = aiEnabled;
    if (aiEnabled === true) memory.handoffRequestedAt = null;
    if (typeof replyToMessages === 'boolean') memory.replyToMessages = replyToMessages;
    if (typeof replyToReelsAndPosts === 'boolean') memory.replyToReelsAndPosts = replyToReelsAndPosts;
    if (typeof remindersEnabled === 'boolean') memory.remindersEnabled = remindersEnabled;
    if (typeof nickname === 'string') memory.nickname = nickname.trim();
    if (typeof gender === 'string') memory.gender = gender;
    if (typeof personalNotes === 'string') memory.personalNotes = personalNotes;
    if (typeof conversationStyle === 'string') memory.conversationStyle = conversationStyle;
    if (typeof relationshipType === 'string') memory.relationshipType = relationshipType;

    await memory.save();

    res.json({ success: true, memory });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Update user memory facts or style manually
app.put('/api/conversations/:senderId/memory', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { conversationStyle, relationshipType, facts, rollingSummary } = req.body;

    const memory = await UserMemory.findOne(ownedMemoryQuery(req, senderId));
    if (!memory) return res.status(404).json({ error: 'User not found' });

    if (conversationStyle) memory.conversationStyle = conversationStyle;
    if (relationshipType) memory.relationshipType = relationshipType;
    if (rollingSummary) memory.rollingSummary = rollingSummary;
    if (Array.isArray(facts)) {
      // a fact that was already there keeps its date and where it came from; a new one in this list is yours
      const before = new Map((memory.facts || []).map(f => [f.fact, f]));
      memory.facts = facts.map(f => {
        const text = typeof f === 'string' ? f : f?.fact;
        const known = before.get(text);
        return known ? { fact: known.fact, addedAt: known.addedAt, source: known.source } : { fact: text, source: 'you' };
      }).filter(f => f.fact);
    }

    await memory.save();
    res.json({ success: true, memory });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Force AI to analyze conversation history and learn/synthesize memory
app.post('/api/conversations/:senderId/learn', async (req, res) => {
  try {
    const { senderId } = req.params;

    // Run memory extraction from current messages
    await memoryService.updateMemoryAsync(senderId, await contactMemOpts(req, senderId));

    // Chat history is kept: the inbox and the AI's reply context both read it
    const updatedMemory = await UserMemory.findOne(ownedMemoryQuery(req, senderId));
    res.json({ success: true, memory: updatedMemory });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Batch Learn & Sync: process all 1-month chat history in MongoDB across all contacts
app.post('/api/memory/sync-all-history', async (req, res) => {
  try {
    if (!isSuperUser(req)) return res.status(403).json({ error: 'Superadmin only' });
    // Superadmin: its own contacts plus the legacy (ownerless) ones
    const results = [
      ...(await memoryService.batchSyncAllChatsFromMongo({ ownerId: null })),
      ...(await memoryService.batchSyncAllChatsFromMongo({ ownerId: req.user._id })),
    ];
    res.json({ success: true, count: results.length, contacts: results });
  } catch (err) {
    sendServerError(res, err);
  }
});


// Get live UserMemory for a person (used by frontend 15s auto-refresh poll)
app.get('/api/conversations/:senderId/memory', async (req, res) => {
  try {
    const { senderId } = req.params;
    const memory = await UserMemory.findOne(ownedMemoryQuery(req, senderId));
    if (!memory) return res.status(404).json({ error: 'Memory not found' });
    res.json({ memory });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Add custom fact/memory

app.post('/api/conversations/:senderId/fact', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { fact } = req.body;
    if (!fact) return res.status(400).json({ error: 'Fact is required' });

    const memory = await UserMemory.findOne(ownedMemoryQuery(req, senderId));
    if (!memory) return res.status(404).json({ error: 'User not found' });

    memory.facts.push({ fact: String(fact).trim(), source: 'you' });
    await memory.save();
    res.json({ success: true, memory });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Get Persona Configuration
// Secrets (Instagram token, GIPHY key) are never sent back: the browser gets hasInstagramToken / hasGiphyKey
const PERSONA_CHAT_MODES = PersonaConfig.schema.path('chatMode')?.enumValues || ['everyone', 'everyone_except', 'only_selected', 'paused'];

// The signed-in account's persona; the superadmin also owns the legacy ownerless one
async function findOwnPersona(req) {
  const config = await PersonaConfig.findOne({ ownerId: req.user._id });
  if (config || !isSuperUser(req)) return config;
  return PersonaConfig.findOne({ ownerId: null });
}

const personaForBrowser = (config, user) => {
  const view = serializePersona(config, { hasUserToken: Boolean(getUserInstagramToken(user)) });
  if (user) {
    if (!view.creatorName) {
      view.creatorName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.username;
    }
    if (!view.instagramHandle) {
      view.instagramHandle = user.instagramUsername ? `@${user.instagramUsername.replace(/^@/, '')}` : `@${user.username}`;
    }
    view.instagramAccountId = view.instagramAccountId || user.instagram?.accountId || user.instagramAccountId || user.instagramId || '';
  }
  return view;
};

app.get('/api/persona', async (req, res) => {
  try {
    let config = await findOwnPersona(req);
    if (!config) {
      const displayName = req.user.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : req.user.username;
      const handle = req.user.instagramUsername ? `@${req.user.instagramUsername.replace(/^@/, '')}` : `@${req.user.username}`;
      config = await PersonaConfig.create({
        ownerId: req.user._id,
        creatorName: displayName,
        instagramHandle: handle,
        personaBio: req.user.businessProfile?.description || `I am ${displayName}, creator of ${handle}.`,
        aboutMe: `I am ${displayName}, creator of ${handle}.`,
        characteristics: 'Friendly, helpful, approachable, authentic.',
        textingHabits: 'Casual lowercase, friendly, short messages.',
        replyRules: 'Default to natural friendly replies without sounding robotic.',
        toneGuidelines: '1. Talk naturally like a real human.\n2. Keep replies engaging and warm.\n3. Never sound like a robot.',
        customKnowledge: `Account: ${handle}\nCreator: ${displayName}`,
        instagramAccountId: req.user.instagram?.accountId || req.user.instagramAccountId || '',
      });
    }
    res.json(personaForBrowser(config, req.user));
  } catch (err) {
    sendServerError(res, err, 'Load persona');
  }
});

// Instagram account ids this user has already proven (OAuth / token flow), plus legacy linked ids
const verifiedAccountIds = (user) => [user.instagram?.accountId, user.instagramAccountId, user.instagramId]
  .map(v => String(v || '').trim())
  .filter(Boolean);

// Asks Instagram which account a pasted token belongs to; returns its ids (empty on failure)
async function accountIdsForToken(token) {
  const axios = require('axios');
  const ids = new Set();
  try {
    const ig = await axios.get('https://graph.instagram.com/v21.0/me', {
      params: { fields: 'id,user_id,username', access_token: token }, timeout: 8000,
    });
    [ig.data?.id, ig.data?.user_id].forEach(v => v && ids.add(String(v)));
  } catch (_) { /* not an Instagram Login token */ }
  if (!ids.size) {
    try {
      const fb = await axios.get('https://graph.facebook.com/v21.0/me', {
        params: { fields: 'id,instagram_business_account', access_token: token }, timeout: 8000,
      });
      const igb = fb.data?.instagram_business_account?.id;
      if (igb) ids.add(String(igb));
    } catch (_) { /* invalid token */ }
  }
  return [...ids];
}

// Update Persona Configuration
// The AI's memory of one person (read only): document, brain score, bond, indexing progress
app.get('/api/people/:senderId/memory', async (req, res) => {
  try {
    const senderId = String(req.params.senderId);
    const mem = await PersonMemory.findOne({ ownerId: req.user._id, senderId }, { notes: 0 }).lean();
    const position = mem ? await memoryIndexService.queuePosition(req.user._id, senderId) : 0;
    res.json({ memory: mem ? { ...mem, queuePosition: position } : null });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Re-read one person's whole chat now (rebuilds their moments and memory document)
app.post('/api/people/:senderId/memory/reindex', async (req, res) => {
  try {
    const senderId = String(req.params.senderId);
    if (!(await UserMemory.exists(ownedMemoryQuery(req, senderId)))) return res.status(404).json({ error: 'User not found' });
    // Handed to the background indexer (front of the queue): it finishes even if you close the page
    await PersonMemory.updateOne(
      { ownerId: req.user._id, senderId },
      { $set: { dirty: true, priority: Date.now(), forceRebuild: true, errorCount: 0, status: 'pending' }, $setOnInsert: { ownerId: req.user._id, senderId } },
      { upsert: true },
    );
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Your answer to one of the AI's doubts, or dismiss it; the document is rewritten right after
app.post('/api/people/:senderId/memory/doubts/:doubtId', async (req, res) => {
  try {
    const senderId = String(req.params.senderId);
    const mem = await PersonMemory.findOne({ ownerId: req.user._id, senderId });
    const d = mem?.doubts?.id(req.params.doubtId);
    if (!d) return res.status(404).json({ error: 'Question not found.' });
    const answer = String(req.body?.answer || '').trim().slice(0, 400);
    if (answer) {
      d.status = 'answered';
      d.answer = answer;
      mem.ownerFacts.push({ text: `${d.question} -> ${answer}` });
    } else {
      d.status = 'dismissed';
    }
    Object.assign(mem, { rebuildDoc: true, dirty: true, priority: Date.now() });
    await mem.save();
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// "Something's wrong? Tell the AI": a correction or fact from you, always true from now on
app.post('/api/people/:senderId/memory/correct', async (req, res) => {
  try {
    const senderId = String(req.params.senderId);
    const text = String(req.body?.text || '').trim().slice(0, 500);
    if (!text) return res.status(400).json({ error: 'Write what the AI should know.' });
    if (!(await UserMemory.exists(ownedMemoryQuery(req, senderId)))) return res.status(404).json({ error: 'User not found' });
    await PersonMemory.updateOne(
      { ownerId: req.user._id, senderId },
      { $push: { ownerFacts: { text, at: new Date() } }, $set: { rebuildDoc: true, dirty: true, priority: Date.now() }, $setOnInsert: { ownerId: req.user._id, senderId } },
      { upsert: true },
    );
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// "Fix with AI" on a person's page: chat about them; the assistant updates their records
app.post('/api/people/:senderId/fix-chat', async (req, res) => {
  try {
    const senderId = String(req.params.senderId);
    const out = await require('./services/fixChatService').chat({
      ownerId: req.user._id, senderId, mq: ownedMemoryQuery(req, senderId), gq: inGraph(req, { senderId }),
      messages: req.body?.messages,
    });
    res.json(out);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    sendServerError(res, err);
  }
});

// Every open question the AI has for you, across everyone (Home review list and bell)
app.get('/api/memory-index/questions', async (req, res) => {
  try {
    const people = await PersonMemory.find({ ownerId: req.user._id, 'doubts.status': 'open' }, { senderId: 1, name: 1, doubts: 1 }).lean();
    const items = people.flatMap(p => (p.doubts || []).filter(d => d.status === 'open')
      .map(d => ({ _id: d._id, senderId: p.senderId, name: p.name, question: d.question, about: d.about, askedAt: d.askedAt })))
      .sort((a, b) => new Date(b.askedAt) - new Date(a.askedAt));
    res.json({ items, total: items.length, people: people.length });
  } catch (err) {
    sendServerError(res, err);
  }
});

// What the memory agent fixed lately (Home > AI memory)
app.get('/api/memory-index/agent', async (req, res) => {
  try {
    const AgentAction = require('./models/AgentAction');
    const [items, reviewed] = await Promise.all([
      AgentAction.find({ $or: [{ ownerId: req.user._id }, { kind: 'cleanup' }] }).sort({ at: -1 }).limit(20).lean(),
      PersonMemory.countDocuments({ ownerId: req.user._id, lastReviewedAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } }),
    ]);
    res.json({ items, reviewedToday: reviewed });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Indexing progress for everyone (AI Memory page): like Spotlight's "Indexing..." status
app.get('/api/memory-index', async (req, res) => {
  try {
    const people = await PersonMemory.find({ ownerId: req.user._id },
      { senderId: 1, name: 1, brainScore: 1, bond: 1, status: 1, totalMessages: 1, indexedMessages: 1, chunkCount: 1, lastIndexedAt: 1, dirty: 1, error: 1 })
      .sort({ totalMessages: -1 }).lean();
    const total = people.reduce((n, p) => n + (p.totalMessages || 0), 0);
    const done = people.reduce((n, p) => n + Math.min(p.indexedMessages || 0, p.totalMessages || 0), 0);
    // Friendship score per person: the same closeness the replies use (labels, chats, the bond read from chats)
    const { computeCloseness } = require('./services/closeness');
    const [cards, mems] = await Promise.all([
      SocialGraph.find(inGraph(req, { senderId: { $in: people.map(p => p.senderId) } }), { senderId: 1, category: 1, relationshipToSam: 1, chatsCount: 1, closenessOverride: 1 }).lean(),
      UserMemory.find(inMemories(req, { senderId: { $in: people.map(p => p.senderId) } }), { senderId: 1, relationshipType: 1, messageCount: 1, createdAt: 1, lastInteraction: 1 }).lean(),
    ]);
    const cardBy = new Map(cards.map(c => [String(c.senderId), c]));
    const memBy = new Map(mems.map(m => [String(m.senderId), m]));
    for (const p of people) {
      const c = cardBy.get(String(p.senderId)) || {};
      const m = memBy.get(String(p.senderId)) || {};
      const f = computeCloseness({
        category: c.category, relationshipToSam: c.relationshipToSam, relationshipType: m.relationshipType,
        chatsCount: c.chatsCount || m.messageCount, firstSeen: m.createdAt, lastSeen: m.lastInteraction,
        override: c.closenessOverride || '', memoryBond: p.bond || '', familyRole: socialGraphService.familyRole,
      });
      p.friendship = { score: f.score, level: f.level, reasons: f.reasons.slice(0, 3) };
    }
    res.json({ people, total, done, overall: overallScore(people), ready: people.filter(p => p.status === 'ready').length });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Your people ranked by priority (asked after the quiz): top / normal / not important, ordered
app.get('/api/priorities', async (req, res) => {
  try {
    // Anyone not ranked yet (new contacts, or never ranked): rank from the AI's memory right away
    if (await SocialGraph.exists(inGraph(req, { senderId: { $nin: [null, ''] }, prioritySource: { $nin: ['auto', 'you'] } }))) {
      await require('./services/autoPriority').refresh(req.user._id).catch(err => console.warn('⚠️ [Priority]', err.message));
    }
    const nodes = await SocialGraph.find(inGraph(req, { senderId: { $exists: true, $nin: [null, ''] } }),
      { senderId: 1, name: 1, instagramHandle: 1, profilePic: 1, category: 1, relationshipToSam: 1, chatsCount: 1, priority: 1, priorityRank: 1, prioritySource: 1, priorityReason: 1, closenessOverride: 1 }).lean();
    // Not you: your own account shows up as a contact when you message yourself
    const me = new Set([req.user.username, req.user.instagramUsername].filter(Boolean).map(h => String(h).replace(/^@+/, '').toLowerCase()));
    const people = nodes.filter(n => !/^test_/.test(String(n.senderId)) && !me.has(String(n.instagramHandle || '').replace(/^@+/, '').toLowerCase()));
    const tierOrder = { top: 0, normal: 1, low: 2, '': 1 };
    people.sort((a, b) => (tierOrder[a.priority || ''] - tierOrder[b.priority || ''])
      || ((a.priorityRank ?? 1e9) - (b.priorityRank ?? 1e9)) || ((b.chatsCount || 0) - (a.chatsCount || 0)));
    res.json({ people, ranked: people.some(p => p.priority) });
  } catch (err) { sendServerError(res, err); }
});
app.put('/api/priorities', async (req, res) => {
  try {
    const list = Array.isArray(req.body?.people) ? req.body.people.slice(0, 2000) : [];
    const ops = list.filter(p => p && p.senderId && ['', 'top', 'normal', 'low'].includes(p.priority || '')).map((p, i) => ({
      // Only people you moved become yours (kept forever); the rest stay automatic
      updateOne: { filter: inGraph(req, { senderId: String(p.senderId) }), update: { $set: { priority: p.priority || '', priorityRank: Number.isFinite(p.rank) ? p.rank : i + 1, ...(p.mine ? { prioritySource: 'you', priorityReason: 'you ranked them' } : {}) } } },
    }));
    if (ops.length) await SocialGraph.bulkWrite(ops, { ordered: false });
    res.json({ ok: true, saved: ops.length });
  } catch (err) { sendServerError(res, err); }
});

// Back to automatic: forget your manual ranking and rank everyone from memory again
app.post('/api/priorities/auto', async (req, res) => {
  try {
    await SocialGraph.updateMany(inGraph(req, { prioritySource: 'you' }), { $set: { prioritySource: 'auto' } });
    const changed = await require('./services/autoPriority').refresh(req.user._id);
    res.json({ ok: true, changed });
  } catch (err) { sendServerError(res, err); }
});

// Reminders this person asked for (People page > Shared > Reminders); cancel one
app.get('/api/people/:senderId/reminders', async (req, res) => {
  try {
    const items = await Reminder.find({ ownerId: req.user._id, senderId: String(req.params.senderId) })
      .sort({ dueAt: -1 }).limit(100).lean();
    res.json({ items });
  } catch (err) {
    sendServerError(res, err);
  }
});

app.post('/api/reminders/:id/cancel', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Bad id.' });
    const r = await Reminder.updateOne({ _id: req.params.id, ownerId: req.user._id, status: 'pending' }, { $set: { status: 'cancelled', note: 'cancelled by you' } });
    res.json({ success: r.modifiedCount > 0 });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Things a contact shared (People page > Shared) and messages that need the owner
app.get('/api/people/:senderId/shared', async (req, res) => {
  try {
    const items = await SharedItem.find({ ownerId: req.user._id, senderId: String(req.params.senderId) })
      .sort({ createdAt: -1 }).limit(200).lean();
    res.json({ items });
  } catch (err) {
    sendServerError(res, err);
  }
});

app.get('/api/shared/needs-you', async (req, res) => {
  try {
    const items = await SharedItem.find({ ownerId: req.user._id, needsYou: true, status: { $ne: 'done' } })
      .sort({ createdAt: -1 }).limit(50).lean();
    res.json({ items });
  } catch (err) {
    sendServerError(res, err);
  }
});

app.patch('/api/shared/:id', async (req, res) => {
  try {
    const status = req.body?.status;
    if (!['new', 'seen', 'done'].includes(status)) return res.status(400).json({ error: 'status must be new, seen or done.' });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Bad id.' });
    await SharedItem.updateOne({ _id: req.params.id, ownerId: req.user._id }, { $set: { status } });
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

app.get('/api/shared/:id/file', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Bad id.' });
    const item = await SharedItem.findOne({ _id: req.params.id, ownerId: req.user._id }).lean();
    if (!item?.fileId) return res.status(404).json({ error: 'File not found.' });
    res.setHeader('Content-Type', item.contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    importantService.openFile(item.fileId).on('error', () => res.status(404).end()).pipe(res);
  } catch (err) {
    sendServerError(res, err);
  }
});

// Texting-style quiz (Persona & AI Studio > Take the quiz)
const quizService = require('./services/quizService');
const QuizSession = require('./models/QuizSession');
const quizView = s => ({ id: s._id, status: s.status, answered: s.answers.length, appliedAt: s.appliedAt,
  history: s.answers.map(a => ({ itemId: a.itemId, from: a.from, text: a.text, personName: a.personName, realReply: a.realReply, answer: a.answer, skipped: a.skipped, aiGuess: a.aiGuess, score: a.score, style: a.style, meaning: a.meaning, note: a.note })) });
// For the Home nudge: how many quiz messages are waiting and how close the AI is (never creates a quiz)
app.get('/api/quiz/status', async (req, res) => {
  try {
    const s = await QuizSession.findOne({ ownerId: req.user._id, status: 'active' }).sort({ createdAt: -1 }).lean();
    const all = await QuizSession.find({ ownerId: req.user._id }, { 'answers.score': 1, 'answers.at': 1 }).sort({ createdAt: -1 }).limit(5).lean();
    const scores = all.flatMap(x => (x.answers || []).map(a => a.score)).filter(Number.isFinite);
    const total = s ? (s.items?.length || 60) : 0;
    const answered = s ? (s.answers || []).length : 0;
    const lastAt = all.flatMap(x => (x.answers || []).map(a => a.at)).filter(Boolean).sort().pop() || null;
    res.json({ waiting: s ? Math.max(0, total - answered) : null, answered, total, match: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null, lastAt });
  } catch (err) { sendServerError(res, err); }
});
app.post('/api/quiz/start', async (req, res) => {
  try {
    const { session, next, total, cast, ranked, items } = await quizService.start(req.user._id);
    const withPerson = i => i && ({ ...i, person: i.personId ? { senderId: i.personId, name: i.personName, profilePic: i.profilePic || '' } : (cast[i.id] || null) });
    res.json({ session: quizView(session), next: withPerson(next), total, ranked, items: items.map(withPerson) });
  } catch (err) { sendServerError(res, err); }
});
app.post('/api/quiz/:id/answer', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Bad id.' });
    const { itemId, text, skip } = req.body || {};
    if (!skip && !String(text || '').trim()) return res.status(400).json({ error: 'Type your reply, or skip.' });
    const out = await quizService.answer(req.user._id, req.params.id, { itemId: String(itemId || ''), text, skip: !!skip });
    res.json({ result: out.result, next: out.next, session: quizView(out.session) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.post('/api/quiz/:id/finish', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Bad id.' });
    const out = await quizService.finish(req.user._id, req.params.id);
    res.json({ draft: out.draft, average: out.average, session: quizView(out.session) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.post('/api/quiz/:id/apply', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Bad id.' });
    res.json(await quizService.apply(req.user._id, req.params.id));
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.post('/api/quiz/restart', async (req, res) => {
  try {
    await QuizSession.updateMany({ ownerId: req.user._id, status: 'active' }, { $set: { status: 'done' } });
    const { session, next, total, cast, ranked, items } = await quizService.start(req.user._id);
    const withPerson = i => i && ({ ...i, person: i.personId ? { senderId: i.personId, name: i.personName, profilePic: i.profilePic || '' } : (cast[i.id] || null) });
    res.json({ session: quizView(session), next: withPerson(next), total, ranked, items: items.map(withPerson) });
  } catch (err) { sendServerError(res, err); }
});

// Check-ins the AI starts itself (Chat Rules page): on/off, who (friend or close), quiet time before one
app.get('/api/checkins', async (req, res) => {
  try {
    const c = await findOwnPersona(req);
    const recent = await Message.find({ ownerId: req.user._id, isCheckIn: true }).sort({ createdAt: -1 }).limit(10)
      .select('recipientId text createdAt').lean();
    // Everyone the AI is on for: the list to pick from when "Pick people" is chosen
    const contacts = (await UserMemory.find({ ownerId: req.user._id, aiEnabled: true, senderId: { $not: /^test_/ } },
      { senderId: 1, name: 1, username: 1, profilePic: 1, lastInteraction: 1 }).sort({ lastInteraction: -1 }).limit(500).lean())
      .map(m => ({ senderId: String(m.senderId), name: m.name || m.username || 'Someone', handle: m.username || '', profilePic: m.profilePic || '' }));
    res.json({
      enabled: c?.checkInsEnabled !== false,
      who: c?.checkInWho || 'all',
      people: (c?.checkInPeople || []).map(String),
      idleHours: c?.checkInIdleHours || 4,
      dailyLimit: c?.checkInDailyLimit || 6,
      contacts,
      recent,
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

app.put('/api/checkins', async (req, res) => {
  try {
    const b = req.body || {};
    const set = {};
    if (b.enabled !== undefined) set.checkInsEnabled = !!b.enabled;
    if (b.who !== undefined) {
      if (!['all', 'selected'].includes(b.who)) return res.status(400).json({ error: 'who must be all or selected.' });
      set.checkInWho = b.who;
    }
    if (b.people !== undefined) {
      if (!Array.isArray(b.people) || b.people.length > 500) return res.status(400).json({ error: 'people must be a list of up to 500 ids.' });
      set.checkInPeople = [...new Set(b.people.map(x => String(x).slice(0, 64)).filter(Boolean))];
    }
    if (b.idleHours !== undefined) set.checkInIdleHours = Math.min(20, Math.max(2, Math.round(Number(b.idleHours) || 4)));
    if (b.dailyLimit !== undefined) set.checkInDailyLimit = Math.min(30, Math.max(1, Math.round(Number(b.dailyLimit) || 6)));
    const c = await findOwnPersona(req);
    if (!c) return res.status(404).json({ error: 'Set up your persona first.' });
    await PersonaConfig.updateOne({ _id: c._id }, { $set: set });
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

app.put('/api/persona', async (req, res) => {
  try {
    const body = req.body || {};
    const invalid = validatePersonaUpdate(body, { chatModes: PERSONA_CHAT_MODES });
    if (invalid) return res.status(400).json({ error: invalid });

    let config = await findOwnPersona(req);
    // A new persona starts from this account, never the schema defaults (they describe the original owner)
    if (!config) config = new PersonaConfig({ ownerId: req.user._id, ...PersonaConfig.starterFields(req.user) });

    const {
      creatorName,
      instagramHandle,
      personaBio,
      aboutMe,
      characteristics,
      textingHabits,
      replyRules,
      toneGuidelines,
      sampleConversations,
      customKnowledge,
      forbiddenWords,
      globalBotActive,
      chatMode,
      excludedContactIds,
      includedContactIds,
      typingDelaySeconds,
      instagramPageAccessToken,
      instagramAccountId,
      giphyApiKey,
      clearGiphyApiKey,
    } = body;

    const pastedToken = (instagramPageAccessToken || '').trim();

    // One Instagram account belongs to one workspace, and only an account this user has proven:
    // either already linked by the Instagram login / token flow, or owned by the token pasted with it
    const cleanAccountId = instagramAccountId !== undefined ? String(instagramAccountId || '').trim() : undefined;
    if (cleanAccountId && !verifiedAccountIds(req.user).includes(cleanAccountId)) {
      const tokenIds = pastedToken ? await accountIdsForToken(pastedToken) : [];
      if (!tokenIds.includes(cleanAccountId)) {
        return res.status(400).json({
          error: 'This Instagram account id could not be verified. Connect Instagram with the Connect button, or paste a valid access token for this account.',
        });
      }
    }
    if (cleanAccountId) {
      const conflictingUser = await User.exists({
        _id: { $ne: req.user._id },
        // instagramId alone is an unproven sign-up claim; the token above proves this owner
        $or: [{ instagramAccountId: cleanAccountId }, { 'instagram.accountId': cleanAccountId }],
      });
      if (conflictingUser) {
        return res.status(409).json({ error: 'This Instagram account is already linked to another workspace.' });
      }
    }

    if (creatorName !== undefined) config.creatorName = creatorName;
    if (instagramHandle !== undefined) config.instagramHandle = instagramHandle;
    if (personaBio !== undefined) config.personaBio = personaBio;
    if (aboutMe !== undefined) config.aboutMe = aboutMe;
    if (characteristics !== undefined) config.characteristics = characteristics;
    if (textingHabits !== undefined) config.textingHabits = textingHabits;
    if (replyRules !== undefined) config.replyRules = replyRules;
    if (toneGuidelines !== undefined) config.toneGuidelines = toneGuidelines;
    if (sampleConversations !== undefined) config.sampleConversations = sampleConversations;
    if (customKnowledge !== undefined) config.customKnowledge = customKnowledge;
    if (forbiddenWords !== undefined) config.forbiddenWords = forbiddenWords;
    if (globalBotActive !== undefined) config.globalBotActive = globalBotActive;
    if (chatMode !== undefined) config.chatMode = chatMode;
    if (excludedContactIds !== undefined) config.excludedContactIds = excludedContactIds;
    if (includedContactIds !== undefined) config.includedContactIds = includedContactIds;
    if (typingDelaySeconds !== undefined && typingDelaySeconds !== null) config.typingDelaySeconds = Number(typingDelaySeconds);
    // A blank token field means "unchanged" (tokens are not sent back to the browser); disconnecting has its own route
    const tokenEncrypted = Boolean(pastedToken) && cryptoService.isConfigured();
    if (pastedToken) config.instagramPageAccessToken = tokenEncrypted ? '' : pastedToken;
    if (cleanAccountId !== undefined) config.instagramAccountId = cleanAccountId;
    // A blank GIPHY key also means "unchanged"; send clearGiphyApiKey: true to remove it
    const cleanGiphy = typeof giphyApiKey === 'string' ? giphyApiKey.trim() : '';
    if (cleanGiphy) config.giphyApiKey = cleanGiphy;
    else if (clearGiphyApiKey === true) config.giphyApiKey = '';
    if (body.businessPolicy && typeof body.businessPolicy === 'object') {
      const bp = body.businessPolicy;
      const hhmm = (v, fallback) => (/^\d{1,2}:\d{2}$/.test(v || '') ? v : fallback);
      const current = config.businessPolicy || {};
      config.businessPolicy = {
        timezone: String(bp.timezone || current.timezone || 'Asia/Kolkata').trim(),
        workingDays: Array.isArray(bp.workingDays) ? bp.workingDays.map(Number).filter(d => d >= 0 && d <= 6) : current.workingDays,
        openTime: hhmm(bp.openTime, current.openTime || '09:00'),
        closeTime: hhmm(bp.closeTime, current.closeTime || '18:00'),
        outOfHoursMessage: String(bp.outOfHoursMessage ?? current.outOfHoursMessage ?? '').slice(0, 500),
        escalationKeywords: Array.isArray(bp.escalationKeywords) ? bp.escalationKeywords.map(s => String(s).trim()).filter(Boolean).slice(0, 50) : current.escalationKeywords,
        refundPolicy: String(bp.refundPolicy ?? current.refundPolicy ?? '').slice(0, 2000),
        allowDiscounts: bp.allowDiscounts !== undefined ? Boolean(bp.allowDiscounts) : Boolean(current.allowDiscounts),
        discountPolicy: String(bp.discountPolicy ?? current.discountPolicy ?? '').slice(0, 2000),
        customRules: Array.isArray(bp.customRules)
          ? bp.customRules.filter(r => r && r.when && r.directive).slice(0, 20).map(r => ({ when: String(r.when).slice(0, 300), directive: String(r.directive).slice(0, 500) }))
          : current.customRules,
      };
    }

    await config.save();
    await redisService.invalidatePersonaConfig();

    if (cleanAccountId !== undefined) req.user.instagramAccountId = cleanAccountId;
    // creatorName is the full name; storing it all in firstName showed the surname twice
    const [firstName, ...rest] = String(creatorName || '').trim().split(/\s+/);
    if (firstName) {
      req.user.firstName = firstName;
      req.user.lastName = rest.join(' ');
    }
    if (instagramHandle !== undefined) req.user.instagramUsername = String(instagramHandle || '').trim().replace(/^@/, '');
    if (pastedToken) {
      setUserInstagram(req.user, {
        token: pastedToken,
        accountId: req.user.instagramAccountId,
        pageId: req.user.instagram?.pageId,
        username: req.user.instagramUsername,
      });
    }
    await req.user.save();

    res.json({ success: true, config: personaForBrowser(config, req.user) });
  } catch (err) {
    sendServerError(res, err, 'Save persona');
  }
});

// GIPHY API Proxy: lets frontend search & preview trending reaction GIFs securely
// GIPHY calls use the signed-in account's own key; limit and rating are cleaned before going into the URL
async function giphyParams(req, extra = {}) {
  const config = (await PersonaConfig.findOne({ ownerId: req.user._id }))
    || (isSuperUser(req) ? await PersonaConfig.findOne({ ownerId: null }) : null);
  const apiKey = (config && config.giphyApiKey) || process.env.GIPHY_API_KEY || '';
  if (!apiKey) return null;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const rating = ['g', 'pg', 'pg-13', 'r'].includes(String(req.query.rating)) ? String(req.query.rating) : 'pg-13';
  return new URLSearchParams({ api_key: apiKey, limit: String(limit), rating, ...extra });
}

app.get('/api/giphy/search', async (req, res) => {
  try {
    const params = await giphyParams(req, { q: String(req.query.q || '') || 'reaction' });
    if (!params) {
      return res.status(400).json({ error: 'GIPHY API Key not configured' });
    }

    const giphyUrl = `https://api.giphy.com/v1/gifs/search?${params}`;
    const response = await fetch(giphyUrl);
    const data = await response.json();
    res.json({ success: true, data: data.data || [] });
  } catch (err) {
    sendServerError(res, err);
  }
});

app.get('/api/giphy/trending', async (req, res) => {
  try {
    const params = await giphyParams(req);
    if (!params) {
      return res.status(400).json({ error: 'GIPHY API Key not configured' });
    }

    const giphyUrl = `https://api.giphy.com/v1/gifs/trending?${params}`;
    const response = await fetch(giphyUrl);
    const data = await response.json();
    res.json({ success: true, data: data.data || [] });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Unsplash banner artwork (home, profile and chat headers). The key stays on the server.
// Photo links are saved in MongoDB and reused for a week, so restarts don't spend the 50-calls-per-hour quota
// (see services/unsplashService.js for the fallback order).
const { createUnsplashCache, TOPICS: UNSPLASH_TOPICS } = require('./services/unsplashService');
const unsplashCache = createUnsplashCache();

app.get('/api/banners', async (req, res) => {
  const topic = Object.hasOwn(UNSPLASH_TOPICS, req.query.topic) ? req.query.topic : 'abstract';
  const photos = await unsplashCache.getPhotos(topic);
  // Never let browsers keep an empty list (missing key / Unsplash down), or banners stay plain for an hour
  res.set('Cache-Control', photos.length ? 'public, max-age=3600' : 'no-store');
  if (!photos.length && !process.env.UNSPLASH_ACCESS_KEY) console.warn('[unsplash] UNSPLASH_ACCESS_KEY is not set; banners use gradients');
  res.json({ success: true, topic, photos });
});

// Clears a test chat (Clear button / new thread), so the next test does not reply with the old test's context
app.delete('/api/simulator/chat', async (req, res) => {
  try {
    const raw = String(req.query?.testSenderId || '');
    if (!/^test_[A-Za-z0-9_-]{1,120}$/.test(raw)) return res.status(400).json({ error: 'Only test chats can be cleared.' });
    const testSenderId = `${raw}_${req.user._id}`;
    await Message.deleteMany(conversationMessages(req.user._id, testSenderId));
    await UserMemory.deleteOne({ ownerId: req.user._id, senderId: testSenderId });
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Interactive Simulator: lets Sam test his AI clone without needing live Instagram DMs first!
app.post('/api/simulator/chat', async (req, res) => {
  try {
    const { testUsername = 'alex_design', messageText } = req.body || {};
    if (typeof messageText !== 'string' || !messageText.trim()) return res.status(400).json({ error: 'messageText is required' });
    if (typeof testUsername !== 'string') return res.status(400).json({ error: 'testUsername must be text.' });
    // Test senders are kept per account; a real contact can only be simulated by its owner
    let testSenderId = String(req.body?.testSenderId || 'test_fan_01');
    if (/^test_/.test(testSenderId)) {
      testSenderId = `${testSenderId}_${req.user._id}`;
    } else if (!(await UserMemory.exists(ownedMemoryQuery(req, testSenderId)))) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 1. Get or create memory for test user
    const userMemory = await memoryService.getOrCreateUserMemory(testSenderId, {
      username: testUsername,
      name: testUsername,
    }, /^test_/.test(testSenderId) ? { ownerId: req.user._id } : await contactMemOpts(req, testSenderId));

    if (!userMemory.ownerId) {
      userMemory.ownerId = req.user._id;
      await userMemory.save();
    }

    // 2. Save user message
    await Message.create({
      ownerId: userMemory.ownerId,
      senderId: testSenderId,
      recipientId: 'me',
      role: 'user',
      text: messageText,
      timestamp: new Date(),
    });
    await redisService.pushMessage(testSenderId, { role: 'user', text: messageText, timestamp: new Date() });

    // 3. Get recent history
    const history = await Message.find(conversationMessages(userMemory.ownerId, testSenderId)).sort({ createdAt: -1 }).limit(10);
    history.reverse();

    // 4. Generate AI response with the signed-in creator's persona (personal or business rules)
    const simConfig = req.user ? await PersonaConfig.findOne({ ownerId: req.user._id }) : null;
    const simFeatures = req.user ? await workspaceFeatureService.getFeaturesSafe(req.user) : null;
    const replyText = await azureOpenAI.generateReply({
      userMemory,
      messageHistory: history,
      incomingText: messageText,
      ...(simConfig ? { config: simConfig } : {}),
      tenant: req.user || null,
      // Same feature switches and mode as live replies, so the sandbox matches production
      features: simFeatures ? { ...simFeatures.enabledFeatures, activeMode: simFeatures.activeMode } : null,
    });

    // 5. Save assistant reply
    await Message.create({
      ownerId: userMemory.ownerId,
      senderId: 'me',
      recipientId: testSenderId,
      role: 'assistant',
      text: replyText,
      sentByAI: true,
      timestamp: new Date(),
    });
    await redisService.pushMessage(testSenderId, { role: 'assistant', text: replyText, timestamp: new Date() });

    // 6. Asynchronously update memory
    await memoryService.updateMemoryAsync(testSenderId, { ownerId: userMemory.ownerId || null });
    const updatedMemory = await UserMemory.findById(userMemory._id);

    res.json({
      replyText,
      userMemory: updatedMemory,
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Remove fact from UserMemory
app.delete('/api/conversations/:senderId/facts', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { fact } = req.body;
    if (!fact) return res.status(400).json({ error: 'Fact is required' });

    await UserMemory.updateOne(
      ownedMemoryQuery(req, senderId),
      { $pull: { facts: { fact: String(fact) } } }
    );
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Test Instagram Token Validity
app.post('/api/test-token', requireAuth, async (req, res) => {
  try {
    if (!isSuperUser(req)) return res.status(403).json({ error: 'Superadmin only' });
    const token = req.body.token || await instagramService.getAccessToken();
    if (!token) return res.status(400).json({ error: 'No token provided or configured.' });

    const axios = require('axios');
    const response = await axios.get('https://graph.facebook.com/v21.0/me', {
      params: {
        fields: 'id,name,accounts',
        access_token: token,
      }
    });

    res.json({ success: true, data: response.data });
  } catch (err) {
    const errData = err.response ? err.response.data : err.message;
    res.status(400).json({ success: false, error: errData });
  }
});

// ==========================================
// MEDIA VAULT / REACTION MEDIA ATTACHMENTS API
// ==========================================

// Get all uploaded media and active categories
// Get all uploaded media and active categories
app.get('/api/media-vault', async (req, res) => {
  try {
    const { category } = req.query;
    const mediaOwner = ownedBy(req);
    const filter = category && category !== 'all'
      ? { ...mediaOwner, category: String(category).toLowerCase().trim() }
      : mediaOwner;
    const items = await MediaVault.find(filter).sort({ createdAt: -1 });
    const categories = await stickerService.getAllCategories(req.user);
    res.json({ success: true, items, categories });
  } catch (err) {
    sendServerError(res, err);
  }
});

// File upload endpoint (multi-part form for JPG, PNG, GIF, WebP)
app.post('/api/media-vault/upload', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      const error = req.uploadRejected ? 'Only GIF, PNG, JPG, WEBP or MP4 files can be uploaded.' : 'No media file was uploaded.';
      return res.status(400).json({ error });
    }
    if (!fileMatchesType(req.file.path, (req.file.mimetype || '').toLowerCase())) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'This file is not a real GIF, JPG, PNG, WebP or MP4.' });
    }
    const { category = 'joy', name, caption, keywords } = req.body;
    const cleanCat = (typeof category === 'string' && category ? category : 'joy').toLowerCase().trim().replace(/[^a-z0-9_]/g, '') || 'joy';

    const mime = (req.file.mimetype || '').toLowerCase();
    const ext = path.extname(req.file.originalname).toLowerCase();
    let mediaType = 'image';
    if (mime.includes('gif') || ext === '.gif') mediaType = 'gif';
    else if (mime.includes('video') || ext === '.mp4') mediaType = 'video';

    const baseUrl = (process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

    const parsedKeywords = Array.isArray(keywords)
      ? keywords.map(k => k.trim().toLowerCase()).filter(Boolean)
      : (keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

    const newMedia = await MediaVault.create({
      name: name && name.trim() ? name.trim() : req.file.originalname,
      category: cleanCat,
      url: fileUrl,
      mediaType,
      caption: caption || '',
      keywords: parsedKeywords,
      ownerId: req.user?._id || null,
      ownerUsername: req.user?.username || '',
      // Only files the server saved itself are ever deleted from disk
      storedFilename: req.file.filename,
    });

    console.log(`📸 [Media Vault Upload]: Saved ${mediaType} under category "${cleanCat}": ${fileUrl} for @${req.user?.username || 'user'}`);
    res.json({ success: true, item: newMedia });
  } catch (err) {
    console.error('❌ Media Vault upload error:', err);
    sendServerError(res, err);
  }
});

// URL-based add (for direct Tenor / Giphy / image URLs)
app.post('/api/media-vault', async (req, res) => {
  try {
    const { url, category = 'joy', name, caption, mediaType = 'gif', keywords } = req.body;
    if (typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'Media URL is required' });
    }
    if (!isHttpUrl(url)) {
      return res.status(400).json({ error: 'Media URL must be an http(s) link' });
    }
    const cleanCat = String(category || 'joy').toLowerCase().trim().replace(/[^a-z0-9_]/g, '');

    const parsedKeywords = Array.isArray(keywords)
      ? keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean)
      : String(keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

    const newMedia = await MediaVault.create({
      name: typeof name === 'string' && name.trim() ? name.trim() : 'Reaction Media',
      category: cleanCat,
      url: url.trim(),
      mediaType: mediaType || 'gif',
      caption: caption || '',
      keywords: parsedKeywords,
      ownerId: req.user?._id || null,
      ownerUsername: req.user?.username || '',
    });

    res.json({ success: true, item: newMedia });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Batch add multiple media items (e.g. multi-select from GIPHY search)
app.post('/api/media-vault/batch', async (req, res) => {
  try {
    const { items: itemsToInsert } = req.body;
    if (!Array.isArray(itemsToInsert) || itemsToInsert.length === 0) {
      return res.status(400).json({ error: 'Array of items is required' });
    }

    // Validate everything first, then check duplicates with ONE query and insert with ONE call
    const ownerFilter = req.user ? { ownerId: req.user._id } : {};
    const seen = new Set();
    const docs = [];
    for (const item of itemsToInsert.slice(0, 100)) {
      // Only http(s) links; anything else is skipped
      if (!item || typeof item.url !== 'string' || !isHttpUrl(item.url)) continue;
      const cleanCat = String(item.category || 'joy').toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
      const parsedKeywords = Array.isArray(item.keywords)
        ? item.keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean)
        : String(item.keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

      const url = item.url.trim();
      if (seen.has(url)) continue;
      seen.add(url);

      docs.push({
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Reaction GIF',
        category: cleanCat,
        url,
        mediaType: item.mediaType || 'gif',
        caption: item.caption || '',
        keywords: parsedKeywords,
        ownerId: req.user?._id || null,
        ownerUsername: req.user?.username || '',
      });
    }
    const already = new Set(docs.length ? await MediaVault.distinct('url', { ...ownerFilter, url: { $in: docs.map(d => d.url) } }) : []);
    const fresh = docs.filter(d => !already.has(d.url));
    const created = fresh.length ? await MediaVault.insertMany(fresh, { ordered: false }) : [];

    res.json({ success: true, count: created.length, items: created });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Update media item (title, category, keywords, caption)
app.put('/api/media-vault/:id', async (req, res) => {
  try {
    const { name, category, keywords, caption } = req.body;
    const query = { _id: req.params.id, ...ownedBy(req) };
    const update = {};
    if (name !== undefined) update.name = String(name ?? '').trim();
    if (category !== undefined) update.category = String(category ?? '').toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    if (caption !== undefined) update.caption = String(caption ?? '').trim();
    if (keywords !== undefined) {
      update.keywords = Array.isArray(keywords)
        ? keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean)
        : String(keywords || '').split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    }

    const updated = await MediaVault.findOneAndUpdate(query, update, { returnDocument: 'after' });
    if (!updated) return res.status(404).json({ error: 'Media not found or unauthorized' });
    res.json({ success: true, item: updated });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Delete media item
app.delete('/api/media-vault/:id', async (req, res) => {
  try {
    const item = await MediaVault.findOne({ _id: req.params.id, ...ownedBy(req) });
    if (!item) return res.status(404).json({ error: 'Media not found or unauthorized' });

    // Only a file this server saved for this item (recorded at upload) is removed from disk;
    // the URL is never trusted, so one account can't delete another's file
    if (item.storedFilename) {
      const filePath = resolveInsideDir(uploadsDir, item.storedFilename);
      const stillUsed = filePath && await MediaVault.exists({ _id: { $ne: item._id }, storedFilename: item.storedFilename });
      if (filePath && !stillUsed && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
    }

    await MediaVault.deleteOne({ _id: item._id });
    res.json({ success: true, deletedId: req.params.id });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Predefined GIF Library endpoints
app.get('/api/media-vault/predefined', (req, res) => {
  try {
    const predefined = stickerService.getPredefinedList();
    res.json({ success: true, predefined });
  } catch (err) {
    sendServerError(res, err);
  }
});

app.post('/api/media-vault/import-predefined', async (req, res) => {
  try {
    const { ids } = req.body || {};
    const results = await stickerService.seedPredefinedIntoVault(ids, req.user);
    res.json({ success: true, results });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Get all categories
app.get('/api/media-vault/categories', async (req, res) => {
  try {
    const categories = await stickerService.getAllCategories(req.user);
    res.json({ success: true, categories });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Add new custom category
app.post('/api/media-vault/categories', async (req, res) => {
  try {
    const { category } = req.body || {};
    if (typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({ error: 'Category identifier is required' });
    }
    const cleanCat = category.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    if (!cleanCat) return res.status(400).json({ error: 'Category must contain letters or numbers' });

    // Own persona (the superadmin's legacy one too); a new one starts from this account, never the
    // schema defaults, and never shadows the superadmin's legacy persona with an empty copy
    let config = await findOwnPersona(req);
    if (!config) config = await PersonaConfig.create({ ownerId: req.user._id, ...PersonaConfig.starterFields(req.user) });

    config.customReactionCategories = config.customReactionCategories || [];
    if (!config.customReactionCategories.includes(cleanCat)) {
      config.customReactionCategories.push(cleanCat);
      await config.save();
    }

    const categories = await stickerService.getAllCategories(req.user);
    res.json({ success: true, categories });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Rename / Edit existing category
app.put('/api/media-vault/categories/:name', async (req, res) => {
  try {
    const oldCat = req.params.name.toLowerCase().trim();
    const { newCategory } = req.body || {};
    if (typeof newCategory !== 'string' || !newCategory.trim()) {
      return res.status(400).json({ error: 'New category name is required' });
    }
    const cleanNew = newCategory.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    // "!!!" cleans to nothing, which would move every item into a nameless category
    if (!cleanNew) return res.status(400).json({ error: 'Category must contain letters or numbers' });

    // 1. Update in PersonaConfig (the same persona adding a category uses, legacy one included)
    const config = await findOwnPersona(req);
    if (config && config.customReactionCategories) {
      config.customReactionCategories = [...new Set(config.customReactionCategories.map(c => c === oldCat ? cleanNew : c))];
      await config.save();
    }

    // 2. Cascade update all MediaVault items belonging to this creator
    const ownerFilter = req.user ? { ownerId: req.user._id } : {};
    await MediaVault.updateMany({ category: oldCat, ...ownerFilter }, { category: cleanNew });

    const categories = await stickerService.getAllCategories(req.user);
    res.json({ success: true, categories });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Delete custom category
app.delete('/api/media-vault/categories/:name', async (req, res) => {
  try {
    const catName = req.params.name.toLowerCase().trim();
    const config = await findOwnPersona(req);
    if (config && config.customReactionCategories) {
      config.customReactionCategories = config.customReactionCategories.filter(c => c !== catName);
      await config.save();
    }
    res.json({ success: true });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Health check & status fallback
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Privacy Policy for Meta App Review & Live Mode
app.get('/privacy', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Privacy Policy - Chatter AI</title></head>
    <body style="font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6;">
      <h1>Privacy Policy for Chatter AI</h1>
      <p>Last updated: September 2026</p>
      <p>Chatter AI provides automated direct messaging capabilities for Instagram Creator accounts.</p>
      <h2>Data We Process</h2>
      <p>We receive incoming message text, sender IDs, and timestamps strictly to generate contextual conversational replies via AI.</p>
      <h2>Data Retention & Deletion</h2>
      <p>Conversations are stored securely to maintain user memory and can be deleted at any time upon request.</p>
      <p>Contact: support@chatter.ai</p>
    </body>
    </html>
  `);
});

// Finds the creator whose Instagram account Meta's signed_request refers to
async function findCreatorByMetaUserId(metaUserId) {
  const { user } = await findOwnerByInstagramAccountId(metaUserId);
  return user;
}

// Removes a creator's stored Instagram credentials: the plaintext legacy token, the encrypted
// OAuth token (instagram.accessTokenEncrypted / iv / authTag) and the persona copy
async function clearCreatorInstagramCredentials(creator) {
  await User.updateOne({ _id: creator._id }, {
    $set: {
      instagramPageAccessToken: '',
      igApprovalStatus: 'none',
      'instagram.connected': false,
      'instagram.accessTokenEncrypted': '',
      'instagram.iv': '',
      'instagram.authTag': '',
      'instagram.tokenExpiresAt': null,
    },
  });
  await PersonaConfig.updateMany({ ownerId: creator._id }, { $set: { instagramPageAccessToken: '' } });
}

// Deauthorize Callback for Meta: the creator removed the app, so stop using their token
app.post('/deauthorize', metaCallbackLimiter, async (req, res) => {
  const data = parseSignedRequest(req.body.signed_request);
  if (!data || !data.user_id) {
    return res.status(400).json({ error: 'Invalid or missing signed_request' });
  }
  try {
    const creator = await findCreatorByMetaUserId(String(data.user_id));
    if (creator) await clearCreatorInstagramCredentials(creator);
    console.log(`🔌 Deauthorized Instagram user ${data.user_id} (creator found: ${!!creator})`);
    res.json({ success: true });
  } catch (err) {
    console.error('Deauthorize error:', err.message);
    res.status(500).json({ error: 'Deauthorize failed, please retry' });
  }
});

// User Data Deletion Callback for Meta: deletes the Instagram data stored for that user
app.post('/data-deletion', metaCallbackLimiter, async (req, res) => {
  const data = parseSignedRequest(req.body.signed_request);
  if (!data || !data.user_id) {
    return res.status(400).json({ error: 'Invalid or missing signed_request' });
  }

  const metaUserId = String(data.user_id);
  try {
    const creator = await findCreatorByMetaUserId(metaUserId);
    const accountIds = [metaUserId, creator?.instagram?.accountId, creator?.instagramAccountId, creator?.instagramId].filter(Boolean);

    // Conversations to/from the account, plus the user's own contact data if they were a DM contact
    const creatorRows = creator ? [{ ownerId: creator._id }] : [];
    const [messages, memories, nodes] = await Promise.all([
      Message.deleteMany({ $or: [...creatorRows, { senderId: { $in: accountIds } }, { recipientId: { $in: accountIds } }] }),
      UserMemory.deleteMany({ $or: [...creatorRows, { senderId: { $in: accountIds } }] }),
      SocialGraph.deleteMany(creator ? { $or: [{ ownerId: creator._id }, { senderId: { $in: accountIds } }] } : { senderId: { $in: accountIds } })
    ]);
    if (creator) {
      await clearCreatorInstagramCredentials(creator);
      await User.updateOne({ _id: creator._id }, { $set: { instagramId: '', instagramAccountId: '', instagramUsername: '', 'instagram.accountId': '', 'instagram.pageId': '', 'instagram.username': '' } });
    }
    socialGraphService.clearCache();

    const confirmationCode = crypto.randomBytes(8).toString('hex');
    console.log(`🗑️ Data deletion ${confirmationCode}: ${messages.deletedCount} messages, ${memories.deletedCount} memories, ${nodes.deletedCount} graph nodes (creator found: ${!!creator})`);
    res.json({
      url: `https://${req.get('host')}/data-deletion/status?code=${confirmationCode}`,
      confirmation_code: confirmationCode
    });
  } catch (err) {
    console.error('Data deletion error:', err.message);
    res.status(500).json({ error: 'Deletion failed, please retry' });
  }
});

// Status page Meta links users to after a deletion request
app.get('/data-deletion/status', publicLimiter, (req, res) => {
  const code = String(req.query.code || '').replace(/[^a-f0-9]/gi, '');
  res.send(`
    <html><body style="font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 0 16px;">
      <h1>Data Deletion Status</h1>
      <p>Confirmation code: <strong>${code || 'unknown'}</strong></p>
      <p>All Instagram messages, memories and account data Chatter AI stored for you have been permanently deleted.</p>
    </body></html>
  `);
});

// Social Graph Tree Chain Endpoints (auto-discovers newly talked contacts & enriches with live DP & per-person AI settings)
// Graph training runs at most once every 5 minutes per account (not one global timer for everyone)
const lastTrainGraphTime = new Map();
app.get('/api/social-graph', async (req, res) => {
  try {
    // Only run trainGraphFromDB at most once every 5 minutes to prevent CPU blocking
    const now = Date.now();
    const trainKey = String(req.user._id);
    if (now - (lastTrainGraphTime.get(trainKey) || 0) > 5 * 60 * 1000) {
      lastTrainGraphTime.set(trainKey, now);
      const trainOwners = isSuperUser(req) ? [req.user._id, null] : [req.user._id];
      (async () => { for (const ownerId of trainOwners) await socialGraphService.trainGraphFromDB(UserMemory, Message, { ownerId }); })()
        .catch(e => console.warn('trainGraph error:', e.message));
    }

    // Only this account's contacts (the superadmin also sees legacy ownerless ones)
    const isSuper = isSuperUser(req);
    const query = ownedBy(req);

    // Auto-discover contacts for this creator from message history if missing
    if (req.user && !isSuper && req.user.instagramAccountId) {
      try {
        const creatorIgId = req.user.instagramAccountId;
        // Distinct ids only: loading every message on each 8s poll made the list take minutes
        const [fromIds, toIds] = await Promise.all([
          Message.distinct('senderId', { ownerId: req.user._id, recipientId: creatorIgId }),
          Message.distinct('recipientId', { ownerId: req.user._id, senderId: creatorIgId }),
        ]);
        const contactIds = new Set([...fromIds, ...toIds].filter(id => id && id !== creatorIgId));
        const known = new Set(await SocialGraph.distinct('senderId', {
          ownerId: req.user._id,
          senderId: { $in: [...contactIds] }
        }));

        for (const cid of contactIds) {
          if (!known.has(cid)) {
            const mem = await UserMemory.findOne(ownedMemoryQuery(req, cid));
            const chatsCount = await Message.countDocuments({
              ownerId: req.user._id,
              $or: [
                { senderId: cid, recipientId: creatorIgId },
                { senderId: creatorIgId, recipientId: cid }
              ]
            });
            const cleanU = (mem?.username || '').replace(/^@/, '').trim();
            await SocialGraph.create({
              ownerId: req.user._id,
              ownerUsername: req.user.username,
              senderId: cid,
              name: mem?.name && !mem.name.startsWith('User_') ? mem.name : (cleanU || `User_${cid.slice(-4)}`),
              instagramHandle: cleanU ? `@${cleanU}` : '',
              profilePic: mem?.profilePic || '',
              category: 'online_friend',
              chatsCount,
              reelsCount: 0,
              relationshipToSam: 'Friend',
              lore: mem?.personalNotes ? [mem.personalNotes] : []
            }).catch(() => {});
          }
        }
      } catch (syncErr) {
        console.warn('Auto contact sync error:', syncErr.message);
      }
    }

    const nodes = await SocialGraph.find(query).sort({ updatedAt: -1 });

    // One query for all linked memories instead of one per person
    const linkedIds = [...new Set(nodes.map(n => n.senderId).filter(Boolean))];
    const memoryById = new Map(
      (linkedIds.length ? await UserMemory.find(inMemories(req, { senderId: { $in: linkedIds } })) : []).map(m => [m.senderId, m])
    );

    // Attach UserMemory settings (aiEnabled, replyToMessages, replyToReelsAndPosts, profilePic, messageCount) to each node
    const enrichedNodes = await Promise.all(nodes.map(async (n) => {
      let effectiveSenderId = n.senderId || '';
      let memory = effectiveSenderId ? (memoryById.get(effectiveSenderId) || null) : null;

      if (!memory && n.instagramHandle) {
        const cleanU = n.instagramHandle.replace(/^@/, '').toLowerCase().trim();
        memory = await UserMemory.findOne(inMemories(req, { username: new RegExp(`^${escapeRegex(cleanU)}$`, 'i') }));
        if (memory && !effectiveSenderId) {
          effectiveSenderId = memory.senderId;
          // Persist the discovered senderId to social graph node
          SocialGraph.updateOne({ _id: n._id }, { senderId: effectiveSenderId }).catch(() => {});
        }
      }

      // Only a real birthday entry counts (the first important date can be an exam or event)
      const memoryDob = memory?.dob || (memory?.importantDates || []).find(d => /birth|bday/i.test(d?.title || ''))?.date || '';

      // Authoritative creator-scoped persistent chats & reels count (immune to cross-account pollution)
      const chatsCount = typeof n.chatsCount === 'number' ? n.chatsCount : 0;
      const reelsCount = typeof n.reelsCount === 'number' ? n.reelsCount : 0;

      return {
        ...n.toObject(),
        senderId: effectiveSenderId,
        category: n.category || (memory?.relationshipType ? (memory.relationshipType === 'collaborator' || memory.relationshipType === 'client' ? 'professional' : 'online_friend') : 'online_friend'),
        dob: n.dob || memoryDob || '',
        age: Number.isFinite(n.age) ? n.age : (Number.isFinite(memory?.age) ? memory.age : null),
        personalNotes: n.personalNotes || (n.lore || []).join('\n'),
        profilePic: memory?.profilePic || n.profilePic || '',
        aiEnabled: memory ? memory.aiEnabled !== false : true,
        replyToMessages: memory ? memory.replyToMessages !== false : true,
        replyToReelsAndPosts: memory ? memory.replyToReelsAndPosts !== false : true,
        messageCount: chatsCount,
        chatsCount,
        reelsCount,
        lastInteraction: memory?.lastInteraction || n.updatedAt,
        // newest things learned from the chat, with when (the person page shows these first)
        learned: (memory?.facts || []).slice(-8).reverse().map(f => ({ fact: f.fact, at: f.addedAt })),
        factsCount: memory?.facts?.length || 0,
        chatSummary: memory?.rollingSummary && memory.rollingSummary !== 'First time contacting.' ? memory.rollingSummary : ''
      };
    }));

    // Authoritative backend deduplication by senderId, instagramHandle, or normalized name
    // (Map lookups instead of a scan of every kept node per node: linear time on this 8s poll)
    const deduplicatedNodes = [];
    const seenSender = new Map(), seenHandle = new Map(), seenName = new Map();
    const remember = (n) => {
      const s = (n.senderId || '').trim();
      const h = (n.instagramHandle || '').replace(/^@/, '').toLowerCase().trim();
      const nm = (n.name || '').toLowerCase().trim();
      if (s && !seenSender.has(s)) seenSender.set(s, n);
      if (h && !seenHandle.has(h)) seenHandle.set(h, n);
      if (nm && !seenName.has(nm)) seenName.set(nm, n);
    };
    for (const node of enrichedNodes) {
      const cleanSenderId = (node.senderId || '').trim();
      const cleanHandle = (node.instagramHandle || '').replace(/^@/, '').toLowerCase().trim();
      const cleanName = (node.name || '').toLowerCase().trim();

      const existing = (cleanSenderId && seenSender.get(cleanSenderId)) ||
        (cleanHandle && seenHandle.get(cleanHandle)) ||
        (cleanName && seenName.get(cleanName)) || null;

      if (!existing) {
        deduplicatedNodes.push(node);
        remember(node);
      } else {
        if (!existing.instagramHandle && node.instagramHandle) existing.instagramHandle = node.instagramHandle;
        if (!existing.senderId && node.senderId) existing.senderId = node.senderId;
        remember(existing);
        if (!existing.profilePic && node.profilePic) existing.profilePic = node.profilePic;
        if (!existing.dob && node.dob) existing.dob = node.dob;
        if (!existing.personalNotes && node.personalNotes) existing.personalNotes = node.personalNotes;
        if ((!existing.chatsCount || existing.chatsCount === 0) && node.chatsCount) existing.chatsCount = node.chatsCount;
        if ((!existing.reelsCount || existing.reelsCount === 0) && node.reelsCount) existing.reelsCount = node.reelsCount;
      }
    }

    res.json({ success: true, nodes: deduplicatedNodes });
  } catch (err) {
    sendServerError(res, err);
  }
});


// Instagram photo links expire after a few days. When a card's photo fails to load, the browser
// sends that contact's id here; we ask Instagram for a fresh link and save it.
const photoRefreshAt = new Map(); // `${ownerId}:${senderId}` -> last attempt (ms)
const PHOTO_RETRY_MS = 30 * 60 * 1000;
app.post('/api/social-graph/refresh-photos', async (req, res) => {
  try {
    const ids = cleanPhotoIds(req.body?.senderIds);
    if (!ids.length) return res.json({ photos: {} });

    const token = (await getOwnerSendToken(req.user._id))
      || (isSuperUser(req) ? (process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || '').trim() : '');
    if (!token) return res.json({ photos: {} });

    const now = Date.now();
    if (photoRefreshAt.size > 20000) photoRefreshAt.clear();
    const owned = await UserMemory.find(inMemories(req, { senderId: { $in: ids } })).select('senderId');
    const due = owned.filter(m => now - (photoRefreshAt.get(`${req.user._id}:${m.senderId}`) || 0) > PHOTO_RETRY_MS);
    due.forEach(m => photoRefreshAt.set(`${req.user._id}:${m.senderId}`, now));

    const photos = {};
    await Promise.all(due.map(async m => {
      const profile = await instagramService.getUserProfile(m.senderId, token);
      const pic = profile?.profile_pic;
      if (typeof pic !== 'string' || !pic.startsWith('https://')) return;
      photos[m.senderId] = pic;
      await UserMemory.updateOne({ _id: m._id }, { profilePic: pic });
      await SocialGraph.updateMany({ ...ownedBy(req), senderId: m.senderId }, { profilePic: pic });
    }));
    res.json({ photos });
  } catch (err) {
    sendServerError(res, err);
  }
});

app.post('/api/social-graph/sync', async (req, res) => {
  try {
    if (!isSuperUser(req)) return res.status(403).json({ error: 'Superadmin only' });
    await socialGraphService.seedInitialGraph();
    await socialGraphService.trainGraphFromDB(UserMemory, Message);
    const nodes = await SocialGraph.find(ownedBy(req));
    res.json({ success: true, message: 'Social knowledge tree synced from DB', count: nodes.length, nodes });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Add or edit a friend node in the social knowledge tree
app.post('/api/social-graph/node', async (req, res) => {
  try {
    const {
      name,
      aliases,
      instagramHandle,
      senderId,
      gender,
      relationshipToSam,
      lore,
      roastStyle,
      connections,
      category,
      dob,
      personalNotes
    } = req.body || {};

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    // Text fields must be text: an object or array here used to crash with a 500
    const textFields = { instagramHandle, senderId, gender, relationshipToSam, lore, roastStyle, category, dob, personalNotes, relationship: req.body.relationship, handle: req.body.handle, dateOfBirth: req.body.dateOfBirth };
    const badField = Object.entries(textFields).find(([k, v]) => v !== undefined && v !== null && typeof v !== 'string' && !(k === 'lore' && Array.isArray(v)));
    if (badField) return res.status(400).json({ error: `${badField[0]} must be text.` });
    if ((aliases !== undefined && aliases !== null && !Array.isArray(aliases) && typeof aliases !== 'string') || (connections !== undefined && connections !== null && !Array.isArray(connections))) {
      return res.status(400).json({ error: 'aliases and connections must be lists.' });
    }

    const finalRelationship = relationshipToSam || req.body.relationship || 'Friend';
    const rawHandle = instagramHandle || req.body.handle || '';
    const finalHandle = rawHandle ? (rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`) : '';
    const finalCategory = allowedEnum(SocialGraph, 'category', category || req.body.category, 'online_friend');
    const finalDob = dob || req.body.dateOfBirth || '';
    const finalPersonalNotes = personalNotes || '';

    let parsedAliases = [];
    if (Array.isArray(aliases)) {
      parsedAliases = aliases;
    } else if (typeof aliases === 'string') {
      parsedAliases = aliases.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
    }

    let parsedLore = [];
    if (Array.isArray(lore)) {
      parsedLore = lore;
    } else if (typeof lore === 'string') {
      parsedLore = lore.split('\n').map(l => l.trim().replace(/^[•\-\*]\s*/, '')).filter(Boolean);
    }

    let parsedConnections = [];
    if (Array.isArray(connections)) {
      parsedConnections = connections.map(c => {
        if (typeof c === 'string') {
          return { targetName: c.trim(), relationship: 'connected', notes: '' };
        }
        return {
          targetName: c.targetName || c.name || '',
          relationship: c.relationship || c.rel || 'friend',
          notes: c.notes || ''
        };
      }).filter(c => c.targetName);
    } else if (typeof connections === 'string') {
      parsedConnections = connections.split(',').map(c => {
        const match = c.trim().match(/^([^(]+)(?:\(([^)]+)\))?/);
        if (match) {
          return {
            targetName: match[1].trim(),
            relationship: (match[2] || 'friend').trim(),
            notes: ''
          };
        }
        return null;
      }).filter(Boolean);
    }

    let finalSenderId = senderId || req.body.senderId || '';
    if (!(await canUseSenderId(req, finalSenderId))) {
      return res.status(403).json({ error: 'This Instagram chat belongs to another workspace.' });
    }
    let finalProfilePic = req.body.profilePic || '';
    if (!finalSenderId && finalHandle) {
      const cleanU = finalHandle.replace(/^@/, '').toLowerCase().trim();
      const matchedMem = await UserMemory.findOne(inMemories(req, { username: new RegExp(`^${escapeRegex(cleanU)}$`, 'i') }));
      if (matchedMem) {
        finalSenderId = matchedMem.senderId;
        if (!finalProfilePic) finalProfilePic = matchedMem.profilePic;
      }
    }

    const cleanName = name.trim();
    const cleanOldName = (req.body.oldName || req.body.previousName || '').trim();

    // Determine query to find existing document to update
    let findQuery = { name: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') };
    if (cleanOldName && cleanOldName.toLowerCase() !== cleanName.toLowerCase()) {
      findQuery = {
        $or: [
          { name: new RegExp(`^${escapeRegex(cleanOldName)}$`, 'i') },
          { name: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') },
          ...(finalSenderId ? [{ senderId: finalSenderId }] : [])
        ]
      };
    } else if (finalSenderId) {
      findQuery = {
        $or: [
          { name: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') },
          { senderId: finalSenderId }
        ]
      };
    }

    const updated = await SocialGraph.findOneAndUpdate(
      inGraph(req, findQuery),
      {
        $set: {
          name: cleanName,
          aliases: parsedAliases,
          instagramHandle: finalHandle,
          senderId: finalSenderId || '',
          gender: allowedEnum(SocialGraph, 'gender', gender, 'unknown'),
          relationshipToSam: finalRelationship,
          category: finalCategory,
          dob: finalDob,
          personalNotes: finalPersonalNotes,
          lore: parsedLore,
          roastStyle: roastStyle || 'Banter back naturally matching their energy.',
          connections: parsedConnections,
          ...(typeof req.body.chatsCount === 'number' ? { chatsCount: req.body.chatsCount } : {}),
          ...(typeof req.body.reelsCount === 'number' ? { reelsCount: req.body.reelsCount } : {}),
          ...(Number.isFinite(req.body.roastiness) ? { roastiness: Math.min(Math.max(Math.round(req.body.roastiness), 0), 100) } : {}),
          ...(typeof req.body.greetingStyle === 'string' ? { greetingStyle: req.body.greetingStyle.trim().slice(0, 120) } : {}),
          ...(Array.isArray(req.body.greetingOptions) ? { greetingOptions: req.body.greetingOptions.map(w => String(w).trim().slice(0, 40)).filter(Boolean).slice(0, 20) } : {}),
          ...(Array.isArray(req.body.avoidWords) ? { avoidWords: req.body.avoidWords.map(w => String(w).trim().slice(0, 40)).filter(Boolean).slice(0, 30) } : {}),
          ...(finalProfilePic ? { profilePic: finalProfilePic } : {}),
          ...(req.user ? { ownerId: req.user._id, ownerUsername: req.user.username } : {}),
          updatedAt: new Date()
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Keep UserMemory in sync with any custom counts
    if (finalSenderId) {
      const memUpdates = {};
      if (typeof req.body.chatsCount === 'number') memUpdates.messageCount = req.body.chatsCount;
      if (typeof req.body.reelsCount === 'number') memUpdates.reelsCount = req.body.reelsCount;
      if (Object.keys(memUpdates).length > 0) {
        UserMemory.updateOne(ownedMemoryQuery(req, finalSenderId), { $set: memUpdates }).catch(() => {});
      }
    }

    // If this node was renamed, clean up any old name documents in SocialGraph
    if (cleanOldName && cleanOldName.toLowerCase() !== cleanName.toLowerCase()) {
      // Everything the AI learned under the old name now says the new one (facts, notes, memory)
      if (updated?.senderId) {
        await require('./services/renameService').renameEverywhere({
          ownerId: req.user?._id || null, senderId: updated.senderId, oldName: cleanOldName, newName: cleanName,
        }).catch(err => console.warn('⚠️ [Rename]', err.message));
      }
      await SocialGraph.deleteMany(inGraph(req, {
        name: new RegExp(`^${escapeRegex(cleanOldName)}$`, 'i'),
        _id: { $ne: updated._id }
      }));
      // Also update any connection in other friend nodes that referenced the old name
      await SocialGraph.updateMany(
        inGraph(req, { 'connections.targetName': new RegExp(`^${escapeRegex(cleanOldName)}$`, 'i') }),
        { $set: { 'connections.$[elem].targetName': cleanName } },
        { arrayFilters: [{ 'elem.targetName': new RegExp(`^${escapeRegex(cleanOldName)}$`, 'i') }] }
      );
    }

    // Clean up any other duplicate names specified
    const dupsToDelete = Array.isArray(req.body.duplicateNamesToDelete) ? req.body.duplicateNamesToDelete : [];
    for (const dup of dupsToDelete) {
      if (dup && typeof dup === 'string' && dup.trim().toLowerCase() !== cleanName.toLowerCase()) {
        await SocialGraph.deleteMany(inGraph(req, {
          name: new RegExp(`^${escapeRegex(dup.trim())}$`, 'i'),
          _id: { $ne: updated._id }
        }));
      }
    }

    if (finalSenderId) {
      await UserMemory.findOneAndUpdate(
        ownedMemoryQuery(req, finalSenderId),
        {
          $set: {
            name: cleanName,
            nickname: cleanName,
            ...(finalDob ? { importantDates: [{ title: 'Birthday', date: finalDob }] } : {})
          }
        }
      );
    }

    socialGraphService.clearCache();
    res.json({ success: true, node: updated });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Quick lookup contact by handle or name to auto-resolve sender ID and avatar
app.get('/api/contacts/lookup', async (req, res) => {
  try {
    const rawQuery = String(req.query.handle || req.query.username || req.query.query || '').replace(/^@/, '').trim();
    if (!rawQuery) return res.json({ found: false });

    const memory = await UserMemory.findOne(inMemories(req, {
      $or: [
        { username: new RegExp(`^${escapeRegex(rawQuery)}$`, 'i') },
        { name: new RegExp(`^${escapeRegex(rawQuery)}$`, 'i') },
        { senderId: rawQuery }
      ]
    }));

    if (memory) {
      return res.json({
        found: true,
        senderId: memory.senderId,
        username: memory.username,
        name: memory.name,
        profilePic: memory.profilePic || '',
        category: memory.relationshipType,
        messageCount: memory.messageCount || 0
      });
    }

    res.json({ found: false });
  } catch (err) {
    sendServerError(res, err);
  }
});

// AI Extract Person Details from Raw Chat with Clarifying Questions
app.post('/api/social-graph/extract-from-chat', async (req, res) => {
  try {
    const { chatText, currentPerson, userClarifications } = req.body;
    if (!chatText || !chatText.trim()) {
      return res.status(400).json({ error: 'Chat text is required' });
    }

    const extraction = await azureOpenAI.extractPersonFromRawChat({
      chatText,
      currentPerson,
      userClarifications,
      ownerId: req.user._id,
    });

    res.json({ success: true, extraction });
  } catch (err) {
    console.error('Raw chat extraction error:', err.message);
    sendServerError(res, err);
  }
});

// Delete a person from the social knowledge tree & MongoDB
app.delete('/api/social-graph/node/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    // Express already decodes route params; decoding again broke on names containing '%'
    const clean = String(identifier || '').trim();

    // 1. Find matching node (an exact id always wins over a name)
    const isObjectId = mongoose.Types.ObjectId.isValid(clean);
    const node = (isObjectId ? await SocialGraph.findOne(inGraph(req, { _id: clean })) : null) || await SocialGraph.findOne(inGraph(req, {
      $or: [
        { name: new RegExp(`^${escapeRegex(clean)}$`, 'i') },
        { senderId: clean },
        { instagramHandle: new RegExp(`^@?${escapeRegex(clean.replace(/^@/, ''))}$`, 'i') }
      ]
    }));

    const targetName = node ? node.name : clean;
    const targetSenderId = node ? node.senderId : (clean.match(/^\d+$/) ? clean : '');

    // 2. Delete ONLY this person and its duplicate cards (same sender); others who share the name are different people
    if (node) await SocialGraph.deleteMany(inGraph(req, { $or: [{ _id: node._id }, ...(targetSenderId ? [{ senderId: targetSenderId }] : [])] }));

    // 3. Remove from other nodes' connections, unless someone else still has this name
    const sameNameLeft = await SocialGraph.exists(inGraph(req, { name: new RegExp(`^${escapeRegex(targetName)}$`, 'i') }));
    if (!sameNameLeft) {
      await SocialGraph.updateMany(
        inGraph(req, { 'connections.targetName': new RegExp(`^${escapeRegex(targetName)}$`, 'i') }),
        { $pull: { connections: { targetName: new RegExp(`^${escapeRegex(targetName)}$`, 'i') } } }
      );
    }

    // 4. Delete corresponding UserMemory if exists (safeguard: do not delete if another node still uses this senderId)
    if (targetSenderId && req.query.keepMemory !== 'true') {
      const remainingNode = await SocialGraph.findOne(inGraph(req, { senderId: targetSenderId }));
      if (!remainingNode) {
        await UserMemory.deleteMany(ownedMemoryQuery(req, targetSenderId));
      }
    }

    socialGraphService.clearCache();
    console.log(`🗑️ Successfully deleted person "${targetName}" from MongoDB`);
    res.json({ success: true, message: `Deleted ${targetName} from database` });
  } catch (err) {
    console.error('Delete node error:', err.message);
    sendServerError(res, err);
  }
});



// AI Autofill fields for a person based on chat history & existing memory
app.post('/api/social-graph/node/:name/ai-autofill', async (req, res) => {
  try {
    const { name } = req.params;
    const cleanName = name.trim();
    const node = await SocialGraph.findOne(inGraph(req, {
      $or: [
        { name: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') },
        { aliases: cleanName.toLowerCase() }
      ]
    }));
    if (!node) return res.status(404).json({ error: `Person "${cleanName}" not found` });

    let recentMessages = [];
    let memory = null;
    if (node?.senderId) {
      memory = await UserMemory.findOne(ownedMemoryQuery(req, node.senderId));
      if (memory) recentMessages = await Message.find(conversationMessages(memory.ownerId, node.senderId)).sort({ timestamp: -1 }).limit(40);
    } else if (node?.instagramHandle) {
      const u = node.instagramHandle.replace(/^@/, '').toLowerCase();
      memory = await UserMemory.findOne(inMemories(req, { username: new RegExp(`^${escapeRegex(u)}$`, 'i') }));
      if (memory?.senderId) {
        recentMessages = await Message.find(conversationMessages(memory.ownerId, memory.senderId)).sort({ timestamp: -1 }).limit(40);
      }
    }

    // The signed-in creator, never the original owner's name
    const creator = (await creatorIdentity(req.user._id)).name;
    const conversationText = recentMessages.reverse().map(m => `${m.role === 'user' ? (node?.name || cleanName) : creator}: ${m.text || '[reel/media]'}`).join('\n');

    const prompt = `Analyze this Instagram conversation and existing memory for a friend of ${creator} named "${node?.name || cleanName}".
Existing Lore: ${JSON.stringify(node?.lore || [])}
Existing Personal Notes: ${JSON.stringify(node?.personalNotes || '')}
Existing Memory: ${JSON.stringify(memory || {})}
Recent Messages:
${conversationText || '(No recent DM text found, extrapolate from existing lore)'}

Generate a JSON object with:
1. "category": Choose one of ["close_friend", "online_friend", "offline_friend", "family", "professional", "business"]
2. "relationshipToSam": Concise relationship title (e.g. "Closest Online Friend / Medicine Student", "Day-One Homie / Brother", "Sister", "Professional Collaborator")
3. "dob": Birthday or Date of Birth if known (e.g. "March 12, 2007"), or ""
4. "personalNotes": Multi-line rich summary of who they are, their family, habits, studies, inside jokes, and connection with ${creator}
5. "banterStyle": Recommended cussing/banter tone (e.g. "Gentle playful teasing", "Savage Hindi bro banter", "Tamil roast insults", "Sweet caring shortcuts")
6. "facts": Array of 3-6 concise factual strings

Return ONLY raw JSON.`;

    const completion = await aiTask('Autofill person profile', { userId: req.user?._id, sessionId: req.params.name, tags: ['people', 'autofill'] }, () => azureOpenAI.getClient().chat.completions.create({
      model: azureOpenAI.defaultDeployment,
      messages: [
        { role: 'system', content: 'You are an expert social intelligence analyzer. Output valid JSON only without markdown formatting.' },
        { role: 'user', content: prompt }
      ],
      // the top model is a reasoning model: no temperature, and room to think before the JSON
      ...completionParams(azureOpenAI.defaultDeployment, { maxTokens: 800, temperature: 0.3 }),
    }));

    const raw = completion.choices[0].message.content.trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      return res.status(502).json({ error: 'The AI returned an unreadable answer. Please try again.' });
    }

    res.json({ success: true, autofill: parsed });
  } catch (err) {
    console.error('AI autofill error:', err.message);
    sendServerError(res, err);
  }
});

// Link an Instagram ID / handle to an existing friend node and merge records
app.post('/api/social-graph/link-id', async (req, res) => {
  try {
    const { personName, instagramHandle, senderId } = req.body;
    if (!personName) return res.status(400).json({ error: 'Person name is required' });

    if (!(await canUseSenderId(req, senderId))) {
      return res.status(403).json({ error: 'This Instagram chat belongs to another workspace.' });
    }
    const cleanName = personName.trim();
    const cleanHandle = instagramHandle ? `@${instagramHandle.replace(/^@/, '').trim()}` : '';
    const cleanUsername = cleanHandle ? cleanHandle.replace(/^@/, '').toLowerCase() : '';

    // 1. Find the target SocialGraph node
    let node = await SocialGraph.findOne(inGraph(req, {
      $or: [
        { name: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') },
        { aliases: cleanName.toLowerCase() }
      ]
    }));

    if (!node) {
      return res.status(404).json({ error: `Person "${cleanName}" not found in Social Knowledge Tree.` });
    }

    // 2. Check if a UserMemory exists with this senderId or username
    let memory = null;
    if (senderId) {
      memory = await UserMemory.findOne(ownedMemoryQuery(req, senderId));
    }
    if (!memory && cleanUsername) {
      memory = await UserMemory.findOne(inMemories(req, { username: new RegExp(`^${escapeRegex(cleanUsername)}$`, 'i') }));
    }

    // 3. Check if there was another node created automatically from UserMemory for this handle/senderId that should be merged
    const otherMatches = [
      ...(senderId ? [{ senderId }] : []),
      ...(cleanHandle ? [{ instagramHandle: cleanHandle }] : []),
      ...(cleanUsername ? [{ aliases: cleanUsername }] : [])
    ];
    // An empty $or is a MongoDB error, so skip the merge lookup when there is nothing to match
    const otherNode = otherMatches.length
      ? await SocialGraph.findOne(inGraph(req, { _id: { $ne: node._id }, $or: otherMatches }))
      : null;

    if (otherNode) {
      console.log(`🔗 [Merge Nodes]: Merging node "${otherNode.name}" into "${node.name}"`);
      // Combine lore
      const combinedLore = new Set([...(node.lore || []), ...(otherNode.lore || [])]);
      node.lore = Array.from(combinedLore);

      // Combine aliases
      const combinedAliases = new Set([...(node.aliases || []), ...(otherNode.aliases || []), cleanUsername]);
      node.aliases = Array.from(combinedAliases);

      // Combine connections
      const targetSet = new Set((node.connections || []).map(c => c.targetName.toLowerCase()));
      (otherNode.connections || []).forEach(c => {
        if (!targetSet.has(c.targetName.toLowerCase())) {
          node.connections.push(c);
          targetSet.add(c.targetName.toLowerCase());
        }
      });

      // Delete the duplicate auto-discovered node
      await SocialGraph.deleteOne({ _id: otherNode._id });
    }

    // 4. Update the canonical node with handle, senderId, profilePic
    if (cleanHandle) node.instagramHandle = cleanHandle;
    if (senderId || memory?.senderId) node.senderId = senderId || memory?.senderId;
    if (memory?.profilePic && !node.profilePic) node.profilePic = memory.profilePic;

    if (cleanUsername && !node.aliases.includes(cleanUsername)) {
      node.aliases.push(cleanUsername);
    }
    node.updatedAt = new Date();
    await node.save();

    // 5. Update or link UserMemory so AI recognizes them in live DMs
    if (memory) {
      memory.nickname = node.name;
      if (!memory.name || memory.name.startsWith('User_')) memory.name = node.name;
      await memory.save();
    } else if (cleanUsername && node.senderId) {
      // Only create or update a contact record this account owns
      {
        await UserMemory.findOneAndUpdate(
          ownedMemoryQuery(req, node.senderId),
          {
            $set: {
              username: cleanUsername,
              name: node.name,
              nickname: node.name
            },
            $setOnInsert: { ownerId: req.user._id }
          },
          { upsert: true }
        );
      }
    }

    socialGraphService.clearCache();
    console.log(`✅ [Link ID Success]: Linked ${node.name} to ${cleanHandle} (senderId: ${node.senderId})`);

    res.json({
      success: true,
      message: `Linked ${node.name} with ${cleanHandle || node.senderId}`,
      node
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Get recent chatters from UserMemory to suggest when linking handles
app.get('/api/social-graph/unlinked-chatters', async (req, res) => {
  try {
    const memories = await UserMemory.find(inMemories(req, {
      username: { $not: /^(test_|ig_tester_|catovidz$|me$|user_\d+)/i },
      // Test sandbox senders carry a real contact's name as username, so the id is checked too
      senderId: { $nin: ['me'], $not: /^test_/ }
    })).sort({ lastInteraction: -1 }).limit(30);

    const chatters = memories.map(m => ({
      senderId: m.senderId,
      username: m.username ? `@${m.username.replace(/^@/, '')}` : '',
      name: m.name || m.nickname || m.username,
      profilePic: m.profilePic || '',
      lastInteraction: m.lastInteraction
    }));

    res.json({ success: true, chatters });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Delete a friend node from the tree and database
app.delete('/api/social-graph/node/:name', async (req, res) => {
  try {
    const rawName = (req.params.name || '').trim();
    if (!rawName) return res.status(400).json({ error: 'Name is required' });

    await SocialGraph.deleteMany(inGraph(req, {
      $or: [
        { name: new RegExp(`^${escapeRegex(rawName)}$`, 'i') },
        { name: rawName },
        { instagramHandle: `@${rawName.replace(/^@/, '')}` }
      ]
    }));
    socialGraphService.clearCache();
    res.json({ success: true, message: `Deleted ${rawName} from database` });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Update per-person AI reply policy (Full AI, Stop AI / Sam Manual)
app.post('/api/social-graph/node/:identifier/preferences', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { aiMode, aiEnabled, replyToMessages, replyToReelsAndPosts, autoSendReels, isFavourite } = req.body;

    let finalAiEnabled = aiEnabled;
    let finalReplyMessages = replyToMessages;
    let finalReplyReels = replyToReelsAndPosts;

    const modePrefs = preferencesForMode(aiMode);
    if (modePrefs) {
      finalAiEnabled = modePrefs.aiEnabled;
      finalReplyMessages = modePrefs.replyToMessages;
      finalReplyReels = modePrefs.replyToReelsAndPosts;
    }

    const cleanId = (identifier || '').trim();
    const cleanHandle = cleanId.replace(/^@/, '');

    // Only this workspace's contacts (a name match must never pause another account's chat)
    const memoryOwner = inMemories(req, {});
    const graphOwner = ownedBy(req);
    // Turning AI back on also closes an open handoff
    const handoffReset = finalAiEnabled === true ? { handoffRequestedAt: null, handoffReason: null } : {};

    // Update UserMemory if present
    await UserMemory.updateMany(
      {
        ...memoryOwner,
        $or: [
          { senderId: cleanId },
          { username: new RegExp(`^${escapeRegex(cleanHandle)}$`, 'i') },
          { name: new RegExp(`^${escapeRegex(cleanId)}$`, 'i') }
        ]
      },
      {
        $set: {
          ...(typeof finalAiEnabled === 'boolean' ? { aiEnabled: finalAiEnabled } : {}),
          ...(typeof finalReplyMessages === 'boolean' ? { replyToMessages: finalReplyMessages } : {}),
          ...(typeof finalReplyReels === 'boolean' ? { replyToReelsAndPosts: finalReplyReels } : {}),
          ...handoffReset
        }
      }
    );

    // Update SocialGraph if present
    await SocialGraph.updateMany(
      {
        $and: [graphOwner],
        $or: [
          { senderId: cleanId },
          { instagramHandle: new RegExp(`^@?${escapeRegex(cleanHandle)}$`, 'i') },
          { name: new RegExp(`^${escapeRegex(cleanId)}$`, 'i') },
          { aliases: cleanHandle.toLowerCase() }
        ]
      },
      {
        $set: {
          ...(typeof finalAiEnabled === 'boolean' ? { aiEnabled: finalAiEnabled } : {}),
          ...(typeof finalReplyMessages === 'boolean' ? { replyToMessages: finalReplyMessages } : {}),
          ...(typeof finalReplyReels === 'boolean' ? { replyToReelsAndPosts: finalReplyReels } : {}),
          ...(typeof autoSendReels === 'boolean' ? { autoSendReels } : {}),
          ...(typeof isFavourite === 'boolean' ? { isFavourite } : {})
        }
      }
    );

    // The chat rules follow the switch (so it works from the person page, Controls, anywhere): "only selected
    // people" needs them on the list, "everyone except" needs them off it
    let routing = null;
    if (modePrefs) {
      const [mems, people, config] = await Promise.all([
        UserMemory.find({ ...memoryOwner, $or: [{ senderId: cleanId }, { username: new RegExp(`^${escapeRegex(cleanHandle)}$`, 'i') }, { name: new RegExp(`^${escapeRegex(cleanId)}$`, 'i') }] }, { senderId: 1 }).lean(),
        SocialGraph.find({ $and: [graphOwner], $or: [{ senderId: cleanId }, { instagramHandle: new RegExp(`^@?${escapeRegex(cleanHandle)}$`, 'i') }, { name: new RegExp(`^${escapeRegex(cleanId)}$`, 'i') }, { aliases: cleanHandle.toLowerCase() }] }, { senderId: 1, name: 1, instagramHandle: 1 }).lean(),
        findOwnPersona(req),
      ]);
      const senderIds = [...mems.map(m => m.senderId), ...people.map(n => n.senderId)];
      const otherKeys = people.flatMap(n => [String(n._id), n.instagramHandle ? n.instagramHandle.replace(/^@/, '').toLowerCase() : '', n.name ? n.name.toLowerCase().replace(/[^a-z0-9]/g, '_') : '']);
      const change = routingAfterMode(config, { senderIds, otherKeys }, modePrefs.aiEnabled);
      if (change && config) {
        // Only the changed lists are written (no whole-document save): two quick toggles, or a mode
        // change at the same moment, used to collide on the document version and fail with a 500
        Object.assign(config, change);
        await PersonaConfig.updateOne({ _id: config._id }, { $set: change });
        await redisService.invalidatePersonaConfig();
      }
      if (config) routing = { chatMode: config.chatMode, includedContactIds: config.includedContactIds || [], excludedContactIds: config.excludedContactIds || [], globalBotActive: config.globalBotActive !== false };
    }

    socialGraphService.clearCache();
    res.json({
      success: true,
      preferences: {
        aiEnabled: finalAiEnabled,
        replyToMessages: finalReplyMessages,
        replyToReelsAndPosts: finalReplyReels,
        autoSendReels
      },
      // the chat rules after this change, so every open page shows the same state
      routing
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

// AI Conversational Interview to clarify friend details, relationships & lore
app.post('/api/social-graph/ai-interview', async (req, res) => {
  try {
    const { userInput, existingNode, autoSave } = req.body || {};
    if (userInput != null && typeof userInput !== 'string') return res.status(400).json({ error: 'userInput must be text.' });
    const conversationHistory = cleanInterviewHistory(req.body.conversationHistory);
    if (!conversationHistory) return res.status(400).json({ error: 'conversationHistory must be a list of messages.' });
    if (existingNode != null && (typeof existingNode !== 'object' || Array.isArray(existingNode))) {
      return res.status(400).json({ error: 'existingNode must be an object.' });
    }
    if (!userInput?.trim() && !conversationHistory?.length) return res.status(400).json({ error: 'Say something about the person first.' });
    const interviewResult = await azureOpenAI.interviewPersonForSocialTree({
      conversationHistory,
      userInput,
      existingNode,
      ownerId: req.user._id,
    });

    // Handle automated duplicate merging in DB
    if (Array.isArray(interviewResult.duplicateNamesToDelete) && interviewResult.duplicateNamesToDelete.length > 0) {
      console.log('🗑️ AI identified duplicate names to remove from DB:', interviewResult.duplicateNamesToDelete);
      const queryList = interviewResult.duplicateNamesToDelete.filter(n => typeof n === 'string').map(n => n.trim()).filter(Boolean);
      const regexList = queryList.map(n => new RegExp(`^${escapeRegex(n)}$`, 'i'));

      await SocialGraph.deleteMany(inGraph(req, {
        $or: [
          { name: { $in: regexList } },
          { name: { $in: queryList } }
        ]
      }));
      socialGraphService.clearCache();
    }

    if (interviewResult.isComplete && (autoSave || interviewResult.duplicateNamesToDelete?.length) && interviewResult.node?.name) {
      const node = interviewResult.node;
      await SocialGraph.findOneAndUpdate(
        inGraph(req, { name: new RegExp(`^${escapeRegex(node.name.trim())}$`, 'i') }),
        {
          $set: {
            ...(req.user ? { ownerId: req.user._id, ownerUsername: req.user.username } : {}),
            name: node.name.trim(),
            aliases: node.aliases || [],
            instagramHandle: node.instagramHandle || '',
            gender: allowedEnum(SocialGraph, 'gender', node.gender, 'unknown'),
            relationshipToSam: node.relationshipToSam || 'friend',
            lore: node.lore || [],
            roastStyle: node.roastStyle || '',
            connections: node.connections || [],
            updatedAt: new Date()
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      socialGraphService.clearCache();
    }

    res.json({ success: true, ...interviewResult });
  } catch (err) {
    sendServerError(res, err);
  }
});

// Last-resort error handler: bad JSON and similar client errors keep their 4xx; nothing else leaks details
app.use((err, req, res, next) => {
  const status = Number(err && (err.status || err.statusCode));
  if (status >= 400 && status < 500) {
    if (res.headersSent) return next(err);
    return res.status(status).json({ error: status === 413 ? 'Request is too large' : 'Invalid request' });
  }
  sendServerError(res, err, `${req.method} ${req.path}`);
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Instagram AI Automation Server Running!`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🔑 Webhook Verify Token configured: ${Boolean(VERIFY_TOKEN)}`);
  console.log(`======================================================\n`);

  // Seed & train social knowledge tree
  socialGraphService.seedInitialGraph().then(() => {
    return socialGraphService.trainGraphFromDB(UserMemory, Message);
  }).catch(e => console.error('❌ SocialGraph init error:', e.message));

  // Banner photos ready before anyone asks: each art style's list (dark and light) is fetched one at a time,
  // 20 s apart, after startup. Lists already saved in the database are reused without calling Unsplash,
  // so this spends at most one call per style per week. First visits get real photos, not the fallback art.
  if (process.env.NODE_ENV !== 'test') {
    const warm = Object.keys(UNSPLASH_TOPICS).filter(t => !t.startsWith('tone-'));
    warm.forEach((topic, i) => {
      setTimeout(() => {
        if (unsplashCache.isBlocked()) return;
        unsplashCache.getPhotos(topic).then(p => p.length && console.log(`🖼️ Banners ready: ${topic} (${p.length})`)).catch(() => {});
      }, 15_000 + i * 20_000).unref?.();
    });
  }

  // Seed predefined meme collection in MediaVault so DB always has relevant GIFs ready
  stickerService.seedPredefinedIntoVault().catch(e => console.warn('MediaVault seed warning:', e.message));

  // Render free servers sleep after 15 idle minutes and then take up to a minute to answer,
  // so the server calls its own public address every 10 minutes to stay awake
  if (process.env.RENDER_EXTERNAL_URL) {
    const pingUrl = `${process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '')}/api/status`;
    setInterval(() => {
      require('axios').get(pingUrl, { timeout: 20000 }).catch(e => console.warn('Keep-awake ping failed:', e.message));
    }, 10 * 60 * 1000).unref();
  }

  // Start 5-6 hr follow-up reminder scheduler
  reminderService.startScheduler(15);
  checkInService.startScheduler(20);
  memoryIndexService.startScheduler();
  require('./services/memoryAgent').startScheduler();
  require('./services/scheduledReminders').startScheduler();
  // Older saved photos/videos get described in the background (a few at a time)
  setTimeout(() => importantService.backfillDescriptions(30).catch(() => {}), 60 * 1000);

  // Safe chat retention & daily maintenance scheduler (keeps full 1-month chat history)
  if (memoryService && typeof memoryService.startDailyCleanup === 'function') {
    memoryService.startDailyCleanup();
  }
});
