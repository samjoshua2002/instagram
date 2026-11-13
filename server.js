require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const connectDB = require('./config/db');
const { creatorIdentity, personalize } = require('./services/creatorIdentity');

// Models
const User = require('./models/User');
const UserMemory = require('./models/UserMemory');
const Message = require('./models/Message');
const PersonaConfig = require('./models/PersonaConfig');
const MediaVault = require('./models/MediaVault');

// Services
const instagramService = require('./services/instagramService');
const azureOpenAI = require('./services/azureOpenAI');
const memoryService = require('./services/memoryService');
const reminderService = require('./services/reminderService');
const stickerService = require('./services/stickerService');
const socialGraphService = require('./services/socialGraphService');
const SocialGraph = require('./models/SocialGraph');
const redisService = require('./services/redisService');
const { router: authRouter, requireAuth } = require('./routes/auth');
const authService = require('./services/authService');

// Enum and type rules also apply to updates, so bad values are refused instead of stored
mongoose.set('runValidators', true);

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB & Initialize owner account
connectDB()
  .then(() => authService.ensureOwnerUser())
  .then(() => migrateOwnership())
  .catch(err => console.error('❌ Startup data setup error:', err.message));

/**
 * One-time, idempotent ownership migration. Older data had no creator on messages/contacts,
 * so every creator could see everyone's DMs. Each record is assigned to its creator:
 * contacts follow the creator whose People list already holds them, everything else
 * belongs to the original owner account (the single-tenant data this app started with).
 */
async function migrateOwnership() {
  const owner = await User.findOne({ role: 'superadmin' }).sort({ createdAt: 1 });
  if (!owner) return;

  // Old rule allowed one memory per contact for the whole app; now it is one per contact per creator
  try {
    const idx = await UserMemory.collection.indexes();
    if (idx.some(i => i.name === 'senderId_1' && i.unique)) {
      await UserMemory.collection.dropIndex('senderId_1');
      console.log('🔧 [Migration] Dropped legacy unique index usermemories.senderId_1');
    }
  } catch (e) { /* collection may not exist yet */ }
  await UserMemory.createIndexes().catch(e => console.warn('UserMemory index note:', e.message));
  await dedupePersonas();
  // Message ids used to be unique across ALL creators; now they are unique per creator
  try {
    const midx = await Message.collection.indexes();
    if (midx.some(i => i.name === 'mid_1')) {
      await Message.collection.dropIndex('mid_1');
      console.log('🔧 [Migration] Dropped legacy global unique index messages.mid_1');
    }
  } catch (e) { /* collection may not exist yet */ }
  await Message.createIndexes().catch(e => console.warn('Message index note:', e.message));

  // Legacy global persona belongs to the original owner (only if they have none yet)
  if (!(await PersonaConfig.exists({ ownerId: owner._id }))) {
    await PersonaConfig.updateOne({ ownerId: null }, { $set: { ownerId: owner._id } });
  }

  // A GIPHY key used to be written into the code and copied into every creator's settings.
  // It is matched by fingerprint (the key itself is no longer in the code) and cleared, so the
  // server setting GIPHY_API_KEY is used instead and the key is never sent to browsers.
  try {
    const LEGACY_GIPHY_SHA256 = 'b9f46622315b13b312c8749a6b2efda7fd2fbc744c3d8dc1270de6073e8be0a7';
    const withKey = await PersonaConfig.find({ giphyApiKey: { $nin: [null, ''] } }).select('giphyApiKey').lean();
    const legacyIds = withKey.filter(c => crypto.createHash('sha256').update(c.giphyApiKey).digest('hex') === LEGACY_GIPHY_SHA256).map(c => c._id);
    if (legacyIds.length) {
      await PersonaConfig.updateMany({ _id: { $in: legacyIds } }, { $set: { giphyApiKey: '' } });
      console.log(`🔧 [Migration] Cleared the old built-in GIPHY key from ${legacyIds.length} creator settings.`);
    }
  } catch (e) { console.warn('GIPHY key cleanup note:', e.message); }

  // Built-in GIFs that GIPHY has taken down (they show as broken images)
  const deadGifs = [
    'https://media.giphy.com/media/j9mqKgQvkNOziGICfd/giphy.gif',
    'https://media.giphy.com/media/26BRv0ThflsDTjDUs/giphy.gif',
  ];
  const deadRemoved = await MediaVault.deleteMany({ url: { $in: deadGifs } }).catch(() => ({ deletedCount: 0 }));
  if (deadRemoved.deletedCount) console.log(`🔧 [Migration] Removed ${deadRemoved.deletedCount} broken built-in GIFs from vaults.`);

  // Media: legacy items owned only by a username get the account id once (usernames can change and be reused)
  const legacyMediaNames = await MediaVault.distinct('ownerUsername', { ownerId: null, ownerUsername: { $nin: [null, ''] } });
  for (const uname of legacyMediaNames) {
    const u = await User.findOne({ username: uname });
    if (u) await MediaVault.updateMany({ ownerId: null, ownerUsername: uname }, { $set: { ownerId: u._id } });
  }

  // People entries: ownerUsername -> ownerId, leftovers -> original owner
  const legacyUsernames = await SocialGraph.distinct('ownerUsername', { ownerId: null, ownerUsername: { $nin: [null, ''] } });
  for (const uname of legacyUsernames) {
    const u = await User.findOne({ username: uname });
    if (u) await SocialGraph.updateMany({ ownerId: null, ownerUsername: uname }, { $set: { ownerId: u._id } });
  }
  const sgLeft = await SocialGraph.updateMany({ ownerId: null }, { $set: { ownerId: owner._id, ownerUsername: owner.username } });

  // Contacts: owner of the People entry that holds this sender, else original owner
  const orphanMems = await UserMemory.find({ ownerId: null }, { senderId: 1 });
  let memMoved = 0;
  if (orphanMems.length) {
    const nodes = await SocialGraph.find({ senderId: { $in: orphanMems.map(m => m.senderId) } }, { senderId: 1, ownerId: 1 });
    const ownersBySender = new Map();
    for (const n of nodes) {
      const set = ownersBySender.get(n.senderId) || new Set();
      set.add(String(n.ownerId));
      ownersBySender.set(n.senderId, set);
    }
    const ops = orphanMems.map(m => {
      const set = ownersBySender.get(m.senderId);
      const target = set && set.size === 1 ? new mongoose.Types.ObjectId([...set][0]) : owner._id;
      return { updateOne: { filter: { _id: m._id }, update: { $set: { ownerId: target } } } };
    });
    for (let i = 0; i < ops.length; i += 500) {
      const r = await UserMemory.bulkWrite(ops.slice(i, i + 500), { ordered: false });
      memMoved += r.modifiedCount || 0;
    }
  }

  // Messages follow their contact's creator
  let msgMoved = 0;
  if (await Message.exists({ ownerId: null })) {
    const mems = await UserMemory.find({}, { senderId: 1, ownerId: 1 });
    const byOwner = new Map();
    for (const m of mems) {
      const k = String(m.ownerId);
      if (!byOwner.has(k)) byOwner.set(k, []);
      byOwner.get(k).push(m.senderId);
    }
    for (const [ownerKey, senderIds] of byOwner) {
      if (ownerKey === 'null' || ownerKey === String(owner._id)) continue;
      for (let i = 0; i < senderIds.length; i += 500) {
        const chunk = senderIds.slice(i, i + 500);
        const r = await Message.updateMany(
          { ownerId: null, $or: [{ senderId: { $in: chunk } }, { recipientId: { $in: chunk } }] },
          { $set: { ownerId: new mongoose.Types.ObjectId(ownerKey) } }
        );
        msgMoved += r.modifiedCount || 0;
      }
    }
    const r = await Message.updateMany({ ownerId: null }, { $set: { ownerId: owner._id } });
    msgMoved += r.modifiedCount || 0;
  }

  if (memMoved || msgMoved || sgLeft.modifiedCount) {
    console.log(`🔧 [Migration] Assigned owners: ${memMoved} contacts, ${msgMoved} messages, ${sgLeft.modifiedCount} People entries.`);
  }
}

// Older code could create several settings records for one creator; keep the most recently edited one
async function dedupePersonas() {
  try {
    const dups = await PersonaConfig.aggregate([
      { $match: { ownerId: { $type: 'objectId' } } },
      { $sort: { updatedAt: -1 } },
      { $group: { _id: '$ownerId', ids: { $push: '$_id' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } }
    ]);
    let removed = 0;
    for (const d of dups) {
      const r = await PersonaConfig.deleteMany({ _id: { $in: d.ids.slice(1) } });
      removed += r.deletedCount || 0;
    }
    if (removed) console.log(`🔧 [Migration] Removed ${removed} duplicate persona records.`);
    const idx = await PersonaConfig.collection.indexes().catch(() => []);
    const old = idx.find(i => i.name === 'ownerId_1' && !i.unique);
    if (old) await PersonaConfig.collection.dropIndex('ownerId_1');
    await PersonaConfig.createIndexes();
  } catch (e) {
    console.warn('Persona dedupe note:', e.message);
  }
}

function escapeRegex(string) {
  return (string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const crypto = require('crypto');

// Every creator only ever sees their own contacts and messages
function ownerOf(req) {
  return req.user ? req.user._id : null;
}

// Strings only: rejects objects/arrays sent where text is expected
function isStr(v) {
  return typeof v === 'string';
}

// Keywords may arrive as "a, b" or ["a","b"]; anything else is ignored
function parseKeywords(keywords) {
  if (Array.isArray(keywords)) return keywords.filter(isStr).map(k => k.trim().toLowerCase()).filter(Boolean);
  if (isStr(keywords)) return keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
  return [];
}

// Errors caused by bad input are the caller's fault (4xx); everything else is a real server error
function sendError(res, err) {
  const name = err && err.name;
  if (name === 'ValidationError' || name === 'CastError' || name === 'StrictModeError' || name === 'StrictPopulateError') {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.code === 11000) return res.status(409).json({ error: 'This item already exists.' });
  console.error('❌ [Server]', err && err.stack ? err.stack.split(String.fromCharCode(10)).slice(0, 3).join(' | ') : err);
  return res.status(500).json({ error: (err && err.message) || 'Server error' });
}

// Keeps a value only if the schema allows it (used for values that come from users or the AI)
function allowedEnum(model, path, value, fallback) {
  const allowed = model.schema.path(path)?.enumValues || [];
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowed.includes(v) ? v : fallback;
}

// Starting persona for a creator, built from their own account (never another person's details)
function personaSeedFor(user) {
  if (!user) return {};
  const displayName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.username;
  const handle = user.instagramUsername ? `@${String(user.instagramUsername).replace(/^@/, '')}` : `@${user.username}`;
  return {
    creatorName: displayName,
    instagramHandle: handle,
    personaBio: user.businessProfile?.description || `I am ${displayName}, creator of ${handle}.`,
    aboutMe: `I am ${displayName}, creator of ${handle}.`,
    customKnowledge: `Account: ${handle}
Creator: ${displayName}`,
    instagramPageAccessToken: user.instagramPageAccessToken || '',
    instagramAccountId: user.instagramAccountId || '',
  };
}

// The creator's own settings, created once on first use
function personaFor(user) {
  return PersonaConfig.forOwner(user ? user._id : null, personaSeedFor(user));
}

function requireSuperadmin(req, res, next) {
  if (req.user?.role !== 'superadmin') return res.status(403).json({ error: 'Superadmin access required' });
  next();
}

// Resolve which creator an Instagram account (webhook entry id) belongs to.
// Unknown accounts resolve to null and are DROPPED (never answered with someone else's credentials).
const creatorCache = new Map(); // accountId -> { time, owner }
async function resolveCreatorForAccount(accountId) {
  const key = String(accountId || '');
  if (!key) return null;
  const hit = creatorCache.get(key);
  if (hit && Date.now() - hit.time < 60000) return hit.owner;
  // Oldest claim wins if legacy data still has duplicates (new claims are refused)
  let owner = await User.findOne({
    $or: [
      { instagramAccountId: key },
      { 'businessProfile.instagramId': key },
      { instagramId: key }
    ]
  }).sort({ createdAt: 1 });
  if (!owner) {
    const cfg = await PersonaConfig.findOne({ instagramAccountId: key, ownerId: { $ne: null } });
    if (cfg) owner = await User.findById(cfg.ownerId);
  }
  // Legacy single-tenant account from .env belongs to the original owner (superadmin)
  if (!owner && process.env.INSTAGRAM_ACCOUNT_ID && key === String(process.env.INSTAGRAM_ACCOUNT_ID)) {
    owner = await User.findOne({ role: 'superadmin' }).sort({ createdAt: 1 });
  }
  creatorCache.set(key, { time: Date.now(), owner: owner || null });
  return owner || null;
}

// Token for a creator: their persona token, then their account token; the .env token only for the legacy owner account
function creatorToken(owner, config, accountId) {
  const t = (config && config.instagramPageAccessToken) || (owner && owner.instagramPageAccessToken) || '';
  if (t) return t.trim();
  if (owner && owner.role === 'superadmin' && process.env.INSTAGRAM_ACCOUNT_ID && String(accountId) === String(process.env.INSTAGRAM_ACCOUNT_ID)) {
    return (process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || '').trim();
  }
  return '';
}

function queueKey(ownerId, senderId) {
  return `${ownerId}:${senderId}`;
}

// =========================================================================
// MEDIA ATTACHMENT GOVERNOR (CONVERSATION PACING & HOURLY RATE-LIMITER)
// Rules:
// 1. Hourly rate cap: Safely protect against 100/hr limit (max 60/hr globally).
// 2. Chat pacing: Must reply with at least 2 plain text messages before next GIF.
// 3. Randomness: ~1 in 6 chance ("bullet in trigger out of 6") when eligible.
// =========================================================================
const userMediaTracker = new Map(); // senderId -> { textCountSinceMedia: number, lastMediaTime: number }
const globalMediaTimestamps = []; // sliding 1-hour window timestamps of media sent

function canSendMedia(senderId, isExplicitRequest = false) {
  const now = Date.now();
  // Prune timestamps older than 1 hour (3600000ms)
  while (globalMediaTimestamps.length > 0 && globalMediaTimestamps[0] < now - 3600000) {
    globalMediaTimestamps.shift();
  }
  // Hard cap to safeguard API quota
  if (globalMediaTimestamps.length >= 60) {
    console.log(`🛡️ [Media Governor]: Global hourly limit reached (${globalMediaTimestamps.length}/60 per hour). Suppressing media attachment.`);
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
  globalMediaTimestamps.push(now);
  const tracker = userMediaTracker.get(senderId) || { textCountSinceMedia: 0, lastMediaTime: 0 };
  tracker.textCountSinceMedia = 0;
  tracker.lastMediaTime = now;
  userMediaTracker.set(senderId, tracker);
}

function recordTextSent(senderId) {
  const tracker = userMediaTracker.get(senderId) || { textCountSinceMedia: 0, lastMediaTime: 0 };
  tracker.textCountSinceMedia = (tracker.textCountSinceMedia || 0) + 1;
  userMediaTracker.set(senderId, tracker);
}

// Ensure public/uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Disk Storage Configuration for file uploads
// Only real images / GIFs / MP4 are accepted; the saved extension comes from the checked type, never the user's filename
const ALLOWED_UPLOADS = {
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
};
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = ALLOWED_UPLOADS[(file.mimetype || '').toLowerCase()] || '.bin';
    cb(null, `${unique}${ext}`);
  }
});
// Checks the file's real first bytes, not the type the browser claimed
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

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    const okType = Boolean(ALLOWED_UPLOADS[(file.mimetype || '').toLowerCase()]);
    const okExt = ['.gif', '.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(path.extname(file.originalname || '').toLowerCase());
    if (okType && okExt) return cb(null, true);
    const err = new Error('Only GIF, JPG, PNG, WebP images or MP4 videos can be uploaded.');
    err.status = 400;
    cb(err);
  }
});

// Middleware
// Exactly one proxy (Render) in front: req.ip is the real client IP and cannot be spoofed via X-Forwarded-For
app.set('trust proxy', 1);
app.use(cors());
// Keep the raw body so Meta webhook signatures (X-Hub-Signature-256) can be verified
app.use(express.json({ limit: '25mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
// Uploaded files are mounted FIRST so their safety headers always apply
// (public/ also contains uploads/, and the general static handler would otherwise serve them bare)
app.use('/uploads', express.static(uploadsDir, {
  fallthrough: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'");
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

// The old static dashboard (public/index.html) was retired: it had no login and every call failed.
// The backend's home page sends people to the real dashboard (the Next.js app) instead.
app.get('/', (req, res) => {
  const first = (process.env.FRONTEND_ORIGINS || '').split(',').map(s => s.trim()).find(Boolean);
  res.redirect(302, first || 'https://instagram-ebon-zeta.vercel.app');
});

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
app.use('/api/giphy', requireAuth);
app.use('/api/status', requireAuth);
app.use('/api/cleanup', requireAuth, requireSuperadmin);
app.use('/api/test-token', requireAuth);

// Webhook Verification Token
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'chatter_instagram_secret_2025';

// Cache for recent message IDs to prevent duplicate processing
const processedMids = new Set();

// Anti-spam debounce queue: aggregates rapid-fire/spam messages and replies once
const userDebounceQueues = new Map();
const DEBOUNCE_WAIT_MS = 3500; // Hold on for 3.5s to see if user is typing multiple quick messages / spamming

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

  console.log(`📡 Webhook challenge received. Mode: ${mode}, Token: ${token}`);

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
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

  if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    for (const att of msg.attachments) {
      const type = (att.type || '').toLowerCase();
      const url = att.payload?.url || '';
      const title = att.payload?.title || att.payload?.caption || att.payload?.name || '';

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

  return { text, isReelOrShare, reelTitle: mediaTitle, isStoryReply, isNoteReply };
}

// Helper to record messages sent manually by the creator from the Instagram phone app
function handleCreatorEcho(event, accountId) {
  handleCreatorEchoAsync(event, accountId).catch(err => console.error('Creator echo error:', err.message));
}

async function handleCreatorEchoAsync(event, accountId) {
  const senderAccountId = accountId || event.sender?.id;
  const contactId = event.recipient?.id;
  if (!contactId || contactId === senderAccountId) return;
  const ownerUser = await resolveCreatorForAccount(senderAccountId);
  if (!ownerUser) {
    console.warn(`🚫 [Creator Echo] Unknown account ${senderAccountId}; event dropped.`);
    return;
  }
  const ownerId = ownerUser._id;

  const text = event.message?.text || (event.message?.attachments?.length ? '[Shared Media / Sticker]' : '');
  const mid = event.message?.mid || `echo_${Date.now()}`;

  // Echo of a message THIS app sent (AI reply, reminder, dashboard send): store it once, nothing else
  const appIds = [process.env.META_APP_ID, process.env.INSTAGRAM_APP_ID].filter(Boolean).map(String);
  const sentByThisApp = event.message?.app_id && appIds.includes(String(event.message.app_id));
  if (sentByThisApp || (event.message?.mid && await Message.exists({ ownerId, mid: event.message.mid }))) {
    await Message.record({ ownerId, senderId: senderAccountId, recipientId: contactId, role: 'assistant', text: text || '[Media]', mid, sentByAI: true, timestamp: new Date() }).catch(() => {});
    return;
  }
  console.log(`📱 [Creator Echo]: Creator manually replied to ${contactId}: "${text}"`);

  // Cancel any active AI debounce queue so the bot doesn't reply over the creator
  const qKey = queueKey(ownerId, contactId);
  if (userDebounceQueues.has(qKey)) {
    clearTimeout(userDebounceQueues.get(qKey).timer);
    userDebounceQueues.delete(qKey);
    console.log(`🛑 [Creator Intervened]: Cancelled pending AI auto-reply for ${contactId}`);
  }

  // Record outgoing message in DB
  Message.record({
    ownerId,
    senderId: senderAccountId,
    recipientId: contactId,
    role: 'assistant',
    text: text || '[Media]',
    mid,
    sentByAI: false,
    timestamp: new Date(),
  }).catch(() => {});

  // Update contact's memory: fresh interaction reactivates the conversation & resets reminder cycle
  UserMemory.updateOne({ ownerId, senderId: contactId }, {
    lastInteraction: new Date(),
    lastReminderSentAt: null,
    $inc: { messageCount: 1 }
  }).catch(() => {});

  // Update this creator's SocialGraph contact node
  SocialGraph.updateOne({ ownerId, senderId: contactId }, { $inc: { chatsCount: 1 } }).catch(() => {});
}

// POST /webhook: Incoming Instagram Events (DMs, echoes, reels, etc.)
// Verifies Meta's X-Hub-Signature-256 against the app secret(s). Without any secret configured
// verification cannot run (logged loudly) so existing deployments keep working.
function verifyMetaSignature(req) {
  const secrets = [process.env.META_APP_SECRET, process.env.INSTAGRAM_APP_SECRET].filter(Boolean);
  if (secrets.length === 0) {
    if (!verifyMetaSignature.warned) {
      console.warn('⚠️ [Webhook] META_APP_SECRET is not set: webhook signatures are NOT verified. Set it to block forged events.');
      verifyMetaSignature.warned = true;
    }
    return true;
  }
  const header = req.get('x-hub-signature-256') || '';
  if (!header.startsWith('sha256=') || !req.rawBody) return false;
  const given = Buffer.from(header.slice(7), 'hex');
  return secrets.some(secret => {
    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest();
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  });
}

app.post('/webhook', async (req, res) => {
  if (!verifyMetaSignature(req)) {
    console.warn('🚫 [Webhook] Rejected event with missing/invalid signature.');
    return res.sendStatus(403);
  }
  const body = req.body || {};
  console.log(`📥 [Webhook Event Received]:`, JSON.stringify(body).slice(0, 2000));

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
  const messageText = event.message.text;
  const mid = event.message.mid;
  const isReelOrShare = event.isReelOrShare;

  const targetAccountId = accountId || recipientId;

  // 1. Locate the creator account. Unknown accounts are dropped (fail safe on foreign accounts).
  const ownerUser = await resolveCreatorForAccount(targetAccountId);
  if (!ownerUser) {
    console.warn(`🚫 [Webhook] Event for unknown Instagram account ${targetAccountId} dropped.`);
    return;
  }
  const ownerId = ownerUser._id;

  // 2. Fetch the creator's own PersonaConfig (created with defaults if missing)
  const config = await personaFor(ownerUser);

  // 3. Resolve the active token for THIS creator only
  const creatorAccessToken = creatorToken(ownerUser, config, targetAccountId);
  instagramService.registerAccount(creatorAccessToken, config.instagramAccountId || ownerUser.instagramAccountId || targetAccountId);

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

  console.log(`\n💬 [Incoming DM] Creator: ${config?.creatorName || 'Bot'} (${targetAccountId}) | From: ${senderId} | Text: "${messageText}"`);

  // Safe timestamp parser
  let msgTime = new Date();
  if (event.timestamp) {
    const num = Number(event.timestamp);
    if (!isNaN(num)) {
      msgTime = new Date(num > 1e11 ? num : num * 1000);
    }
  }

  // 2. Fetch or create user memory
  let userProfile = null;
  try {
    userProfile = await instagramService.getUserProfile(senderId, creatorAccessToken);
  } catch (e) {
    // ignore
  }
  const userMemory = await memoryService.getOrCreateUserMemory(senderId, userProfile, ownerId);

  // 3. Save incoming user message in DB (Meta may deliver the same event twice)
  const saved = await Message.record({
    ownerId,
    senderId,
    recipientId,
    role: 'user',
    text: messageText,
    mid: mid === 'random_mid' ? `test_${Date.now()}` : mid,
    timestamp: msgTime,
  });
  if (!saved.inserted) {
    console.log(`↩️ [Webhook] Duplicate delivery of ${mid} ignored.`);
    return;
  }

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
  // One atomic update: quick bursts of DMs can never overwrite each other's counts or hit a version conflict
  await UserMemory.updateOne({ _id: userMemory._id }, {
    $set: { lastInteraction: msgTime, lastReminderSentAt: null },
    $inc: { messageCount: 1, ...(isReelOrShare ? { reelsCount: 1 } : {}) },
    $push: { recentChatBuffer: { $each: [{ role: 'user', text: messageText, timestamp: msgTime }], $slice: -10 } },
  });
  await redisService.pushMessage(queueKey(ownerId, senderId), { role: 'user', text: messageText, timestamp: msgTime });

  // Atomically persist cumulative counts to this creator's SocialGraph node or auto-create it
  (async () => {
    try {
      const incPayload = {
        chatsCount: 1,
        ...(isReelOrShare ? { reelsCount: 1 } : {})
      };
      const creatorFilter = { ownerId };

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
          // Upsert by sender: two first DMs arriving together create ONE person, and both are counted
          await SocialGraph.updateOne({ ownerId: ownerUser._id, senderId }, {
            $setOnInsert: {
              ownerId: ownerUser._id,
              ownerUsername: ownerUser.username,
              senderId,
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
  // Memory extraction runs in background on EVERY incoming DM.
  // This ensures the profile auto-fills even when you manually manage chats.
  // ─────────────────────────────────────────────────────────────────────────
  memoryService.updateMemoryAsync(senderId, ownerId).catch(err => {
    console.error('Background memory update failed (non-critical):', err.message);
  });

  // 4. Check if Bot is enabled globally or paused
  if (!config.globalBotActive || config.chatMode === 'paused') {
    console.log(`⏸️ Global Bot is paused. Message learned, skipping auto-reply.`);
    return;
  }

  // Check chat routing mode
  if (config.chatMode === 'everyone_except') {
    if ((config.excludedContactIds || []).includes(senderId) || userMemory.aiEnabled === false) {
      console.log(`⏸️ ${userMemory.username} is excluded. Message learned, skipping auto-reply.`);
      return;
    }
  } else if (config.chatMode === 'only_selected') {
    if (!(config.includedContactIds || []).includes(senderId)) {
      console.log(`⏸️ ${userMemory.username} not in whitelist. Message learned, skipping auto-reply.`);
      return;
    }
  }

  // Check if AI is enabled for this specific user
  if (!userMemory.aiEnabled) {
    console.log(`⏸️ AI paused for ${userMemory.username}. Message learned, skipping auto-reply.`);
    return;
  }

  // Check per-person reply toggles
  if (isReelOrShare && userMemory.replyToReelsAndPosts === false) {
    console.log(`⏸️ Reel/Post reply disabled for @${userMemory.username}. Skipping.`);
    return;
  }
  if (!isReelOrShare && userMemory.replyToMessages === false) {
    console.log(`⏸️ Message reply disabled for @${userMemory.username}. Skipping.`);
    return;
  }

  // 5. If user shared a Reel/Post or media, react with an emoji first!
  if (isReelOrShare && mid && mid !== 'random_mid') {
    instagramService.sendMessageReaction(senderId, mid, '😂', creatorAccessToken).catch(() => {});
  }

  // 6. Anti-Spam / Debounce Logic:
  // If the user is rapid-firing messages or spamming, hold on until they stop typing!
  // This aggregates their messages, saves tokens, and replies once naturally like a human.
  const qKey = queueKey(ownerId, senderId);
  if (userDebounceQueues.has(qKey)) {
    const existing = userDebounceQueues.get(qKey);
    clearTimeout(existing.timer);
    existing.messages.push({ text: messageText, mid });
    existing.lastMid = mid;
    existing.isReelOrShare = existing.isReelOrShare || isReelOrShare;

    console.log(`⏳ [Anti-Spam / Debounce]: User ${senderId} sent another message (${existing.messages.length} queued). Holding on for ${DEBOUNCE_WAIT_MS / 1000}s...`);

    existing.timer = setTimeout(() => {
      userDebounceQueues.delete(qKey);
      dispatchDebouncedReply(existing).catch(err => {
        console.error('❌ Error dispatching debounced reply:', err);
      });
    }, DEBOUNCE_WAIT_MS);
    return;
  }

  // First message in a potential cluster: start debounce window
  const queueEntry = {
    senderId,
    recipientId,
    targetAccountId,
    creatorAccessToken,
    ownerUser,
    ownerId,
    userMemory,
    config,
    messages: [{ text: messageText, mid }],
    lastMid: mid,
    isReelOrShare,
    timer: null,
  };

  userDebounceQueues.set(qKey, queueEntry);
  queueEntry.timer = setTimeout(() => {
    userDebounceQueues.delete(qKey);
    dispatchDebouncedReply(queueEntry).catch(err => {
      console.error('❌ Error dispatching debounced reply:', err);
    });
  }, DEBOUNCE_WAIT_MS);
}

/**
 * Dispatches a single, smart AI reply after user finishes typing their message(s)
 */
async function dispatchDebouncedReply(queueEntry) {
  const { senderId, recipientId, targetAccountId, creatorAccessToken, ownerUser, ownerId, userMemory, config, messages, lastMid, isReelOrShare = false } = queueEntry;

  // Combine multiple messages if user sent a cluster
  const combinedText = messages.map(m => m.text).join('\n');
  if (messages.length > 1) {
    console.log(`🧠 [Anti-Spam Batching]: Aggregated ${messages.length} messages from ${senderId}:\n"${combinedText}"`);
  }

  // Send read receipt immediately
  await instagramService.sendSenderAction(senderId, 'mark_seen', creatorAccessToken);

  // Fetch recent conversation history
  let history = await Message.find({
    ownerId,
    $or: [
      { senderId },
      { recipientId: senderId }
    ]
  })
  .sort({ createdAt: -1 })
  .limit(10);

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

  try {
    // Turn on typing indicator while generating
    await instagramService.sendSenderAction(senderId, 'typing_on', creatorAccessToken);

    // Generate response mimicking creator persona
    console.log(`🤖 Generating ${config?.creatorName || 'Creator'}'s response via Azure OpenAI...`);
    try {
      replyText = await azureOpenAI.generateReply({
        userMemory,
        messageHistory: history,
        incomingText: combinedText,
        config,
      });
    } catch (aiErr) {
      console.error(`❌ [AI Generation Error]:`, aiErr.message);
      // Fallback to natural short reply so recipient is never left on read
      replyText = isReelOrShare ? '😂😂' : 'yoo wassup!';
    }

    if (!replyText || replyText.trim().length === 0) {
      replyText = isReelOrShare ? '😂😂' : 'yoo wassup!';
    }

    // Extract optional sticker or attachment tag (e.g. [ATTACHMENT: joy], [STICKER: lol])
    const stickerMatch = replyText.match(/\[(?:STICKER|ATTACHMENT):\s*([a-zA-Z0-9_-]+)\]/i);
    if (stickerMatch) {
      stickerType = stickerMatch[1].toLowerCase();
      replyText = replyText.replace(/\[(?:STICKER|ATTACHMENT):\s*[a-zA-Z0-9_-]+\]/gi, '').trim();
    }

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
    if (stickerType && !canSendMedia(senderId, isExplicitMediaRequest)) {
      console.log(`🛡️ [Media Governor]: Suppressed AI attachment [${stickerType}] to enforce 2-3 text pacing or hourly limit.`);
      stickerType = null;
    }

    // 3. SPORADIC MEDIA DISPATCH (Only when Governor permits):
    // Cadence: Reply 2 or 3 text messages in a row, then ~1 in 6 random chance ("bullet in trigger out of 6") or high-confidence reaction
    if (!stickerType && canSendMedia(senderId, isExplicitMediaRequest)) {
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

    // Calculate dynamic human-realistic typing latency:
    // - Emojis / reactions (<= 4 chars or pure emoji): quick tap (1800ms - 3000ms)
    // - 1 short line (5 - 35 chars): 3500ms - 6500ms
    // - 1-2 medium lines (36 - 90 chars): 7000ms - 12000ms
    // - 2-3 lines (91 - 180 chars): 13000ms - 20000ms
    // - Multi-line paragraph / 4+ lines (> 180 chars): 21000ms - 34000ms (authentic phone typing pacing)
    const trimmedReply = (replyText || '').trim();
    const charLength = trimmedReply.length;
    const isEmojiOnly = /^[\p{Emoji}\s\d\p{P}]+$/u.test(trimmedReply);
    const isUltraShort = charLength <= 4 || isEmojiOnly;

    let humanTypingDelayMs;
    if (isUltraShort || (isReelOrShare && charLength <= 8)) {
      humanTypingDelayMs = Math.min(Math.max(charLength * 40 + 1500, 1800), 3000);
    } else if (charLength <= 35) {
      humanTypingDelayMs = Math.min(Math.max(charLength * 90 + 2000, 3500), 6500);
    } else if (charLength <= 90) {
      humanTypingDelayMs = Math.min(Math.max(charLength * 100 + 2500, 7000), 12000);
    } else if (charLength <= 180) {
      humanTypingDelayMs = Math.min(Math.max(charLength * 95 + 3000, 13000), 20000);
    } else {
      humanTypingDelayMs = Math.min(Math.max(charLength * 90 + 4000, 21000), 34000);
    }

    console.log(`⏳ [Realistic Human Typing Delay]: ${humanTypingDelayMs}ms for ${charLength} characters (ultra-short: ${isUltraShort}, reel: ${isReelOrShare})...`);

    // Keep typing indicator actively pulsing on Instagram every 3.5 seconds so it NEVER drops while typing
    await instagramService.sendSenderAction(senderId, 'typing_on', creatorAccessToken);
    const typingPulseInterval = setInterval(() => {
      instagramService.sendSenderAction(senderId, 'typing_on', creatorAccessToken).catch(() => {});
    }, 3500);

    try {
      await new Promise(resolve => setTimeout(resolve, humanTypingDelayMs));
    } finally {
      clearInterval(typingPulseInterval);
    }

    console.log(`✨ [${config?.creatorName || 'AI'}'s Reply]: "${replyText}" ${stickerType ? `[Media/Sticker: ${stickerType}]` : ''}`);

    const hasText = !!(replyText && replyText.trim().length > 0);
    if (hasText) {
      sendResult = await instagramService.sendTextMessage(senderId, replyText, creatorAccessToken, lastMid);
    }

    // If a sticker or media attachment was chosen, send the image/GIF directly to Instagram DM!
    let stickerSendResult = null;
    let mediaWasSent = false;
    if (stickerType && stickerService.hasSticker(stickerType)) {
      // GIFs react to the HUMAN'S chat message, never our AI reply text
      const stickerUrl = await stickerService.getStickerUrl(stickerType, combinedText, config?.ownerId ? { _id: config.ownerId } : null);
      if (stickerUrl) {
        if (hasText) {
          await new Promise(resolve => setTimeout(resolve, 600));
          try {
            console.log(`🖼️ [Sticker Dispatch]: Sending accessory ${stickerType} sticker (${stickerUrl}) to ${senderId}...`);
            const accRes = await instagramService.sendImageMessage(senderId, stickerUrl, creatorAccessToken);
            if (accRes?.success) {
              mediaWasSent = true;
              recordMediaSent(senderId);
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
              recordMediaSent(senderId);
            } else {
              console.warn(`⚠️ [Sticker Dispatch]: Sticker-only send unsuccessful:`, stickerSendResult?.error);
            }
          } catch (e) {
            console.error(`❌ [Sticker Error]: Failed to send sticker:`, e.message);
          }
        }
      }
    }

    // Only persist if text delivery succeeded, or if sticker-only dispatch succeeded
    const textDelivered = hasText && sendResult?.success === true;
    const stickerDelivered = !hasText && stickerSendResult?.success === true;

    // Track conversational text count if text was delivered without media
    if (textDelivered && !mediaWasSent) {
      recordTextSent(senderId);
    }

    if (textDelivered || stickerDelivered) {
      const persistedText = textDelivered ? replyText : `[Sent ${stickerType} sticker]`;

      // Save outgoing message in DB (the echo may already have stored it: mark it as the AI's)
      await Message.record({
        ownerId,
        senderId: recipientId,
        recipientId: senderId,
        role: 'assistant',
        text: persistedText,
        mid: sendResult?.data?.message_id || stickerSendResult?.data?.message_id || `out_${Date.now()}`,
        sentByAI: true,
        timestamp: new Date(),
      }, { update: { sentByAI: true, text: persistedText } });

      // Also append outgoing assistant reply to UserMemory recentChatBuffer
      try {
        const memToUpdate = await UserMemory.findOne({ ownerId, senderId });
        if (memToUpdate) {
          memToUpdate.recentChatBuffer = (memToUpdate.recentChatBuffer || []).slice(-9);
          memToUpdate.recentChatBuffer.push({
            role: 'assistant',
            text: persistedText,
            timestamp: new Date()
          });
          await memToUpdate.save();
          await redisService.pushMessage(queueKey(ownerId, senderId), { role: 'assistant', text: persistedText, timestamp: new Date() });
          await redisService.cacheUserMemory(queueKey(ownerId, senderId), memToUpdate.toObject ? memToUpdate.toObject() : memToUpdate, 3600);
        }
      } catch (bufErr) {}
    }
  } finally {
    // Ensure typing indicator is always turned off
    await instagramService.sendSenderAction(senderId, 'typing_off', creatorAccessToken).catch(() => {});
  }

  // Memory update already triggered earlier (ALWAYS-LEARN block) — no duplicate needed here.
  // But re-trigger if the reply itself contained new info (e.g. we asked a curiosity question)
  setTimeout(() => {
    memoryService.updateMemoryAsync(senderId, ownerId).catch(() => {});
  }, 3000); // slight delay so the outgoing message is saved first
}

/**
 * ---------------------------------------------------------------------
 * 2. DASHBOARD & MANAGEMENT API ENDPOINTS
 * ---------------------------------------------------------------------
 */

// Status check endpoint
app.get('/api/status', async (req, res) => {
  try {
    const ownerId = ownerOf(req);
    const config = await PersonaConfig.findOne({ ownerId }) || {};
    const totalUsers = await UserMemory.countDocuments({ ownerId });
    const totalMessages = await Message.countDocuments({ ownerId });
    const token = creatorToken(req.user, config, config.instagramAccountId || req.user.instagramAccountId);

    res.json({
      status: 'online',
      creatorName: config.creatorName || req.user?.firstName || req.user?.username || '',
      instagramHandle: config.instagramHandle || '@chipichappa.daily',
      globalBotActive: config.globalBotActive ?? true,
      chatMode: config.chatMode || 'everyone',
      excludedContactIds: config.excludedContactIds || [],
      includedContactIds: config.includedContactIds || [],
      hasPageAccessToken: !!(token && token.length > 10),
      appId: process.env.META_APP_ID || '1037131122693653',
      totalUsers,
      totalMessages,
      azureModel: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
    });
  } catch (err) {
    sendError(res, err);
  }
});

// List all conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const ownerId = ownerOf(req);
    const users = await UserMemory.find({ ownerId }).sort({ lastInteraction: -1 }).limit(50);
    const ids = users.map(u => u.senderId);

    // Last message per conversation: one tiny indexed lookup each, all in parallel
    // (the old aggregate sorted EVERY message of 50 contacts in memory first)
    const lastMsgs = await Promise.all(ids.map(id => Message.findOne({ ownerId, $or: [{ senderId: id }, { recipientId: id }] })
      .sort({ createdAt: -1 }).select('text role timestamp createdAt').lean()));
    const lastByContact = new Map(ids.map((id, i) => [id, lastMsgs[i]]));

    const conversations = users.map(u => {
      const lastMessage = lastByContact.get(u.senderId);
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
    sendError(res, err);
  }
});

// Get messages for a specific conversation
app.get('/api/conversations/:senderId/messages', async (req, res) => {
  try {
    const { senderId } = req.params;
    const ownerId = ownerOf(req);
    const memory = await UserMemory.findOne({ ownerId, senderId });
    if (!memory) return res.status(404).json({ error: 'Conversation not found' });
    // Latest 100 messages, shown oldest-first
    const messages = (await Message.find({
      ownerId,
      $or: [{ senderId }, { recipientId: senderId }]
    }).sort({ createdAt: -1 }).limit(100)).reverse();

    res.json({ memory, messages });
  } catch (err) {
    sendError(res, err);
  }
});

// Toggle AI for a specific user
app.post('/api/conversations/:senderId/toggle-ai', async (req, res) => {
  try {
    const { senderId } = req.params;
    const memory = await UserMemory.findOne({ ownerId: ownerOf(req), senderId });
    if (!memory) return res.status(404).json({ error: 'User not found' });

    memory.aiEnabled = !memory.aiEnabled;
    await memory.save();

    res.json({ success: true, aiEnabled: memory.aiEnabled });
  } catch (err) {
    sendError(res, err);
  }
});

// Manually send a message as the creator from the dashboard
app.post('/api/conversations/:senderId/send', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { text } = req.body || {};
    if (!isStr(text) || !text.trim()) return res.status(400).json({ error: 'Text required' });
    const ownerId = ownerOf(req);
    const memory = await UserMemory.findOne({ ownerId, senderId });
    if (!memory) return res.status(404).json({ error: 'Conversation not found' });

    // Send via Instagram from THIS creator's account only
    const config = await PersonaConfig.findOne({ ownerId });
    const token = creatorToken(req.user, config, config?.instagramAccountId || req.user.instagramAccountId);
    instagramService.registerAccount(token, config?.instagramAccountId || req.user.instagramAccountId);
    const sendResult = await instagramService.sendTextMessage(senderId, text, token);
    if (!sendResult || sendResult.success !== true) {
      // Nothing reached Instagram: say so and do not store a message that was never delivered
      const reason = !token ? 'Instagram is not connected for this account' : (sendResult?.reason || sendResult?.error || 'Instagram rejected the message');
      return res.status(502).json({ error: `Message not sent: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}` });
    }

    // Save in DB. Meta's echo of this message can arrive first and store the same mid:
    // merge into it (it is a manual send, not an AI one) instead of failing with a duplicate
    const newMsg = {
      ownerId,
      senderId: 'me',
      recipientId: senderId,
      role: 'assistant',
      text,
      mid: sendResult?.data?.message_id || `manual_${Date.now()}`,
      sentByAI: false,
      timestamp: new Date(),
    };
    await Message.record(newMsg, { update: { senderId: 'me', sentByAI: false } });

    // Cancel any active AI debounce queue so the bot doesn't reply over the creator
    const qKey = queueKey(ownerId, senderId);
    if (userDebounceQueues.has(qKey)) {
      clearTimeout(userDebounceQueues.get(qKey).timer);
      userDebounceQueues.delete(qKey);
    }

    // Update memory interaction time & reset reminder cycle to reactivate conversation
    await UserMemory.updateOne({ ownerId, senderId }, { 
      lastInteraction: new Date(),
      lastReminderSentAt: null,
      $inc: { messageCount: 1 }
    });

    res.json({ success: true, message: newMsg, graphResult: sendResult });
  } catch (err) {
    sendError(res, err);
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
    } = req.body || {};

    const memory = await UserMemory.findOne({ ownerId: ownerOf(req), senderId });
    if (!memory) return res.status(404).json({ error: 'User not found' });

    if (typeof aiEnabled === 'boolean') memory.aiEnabled = aiEnabled;
    if (typeof replyToMessages === 'boolean') memory.replyToMessages = replyToMessages;
    if (typeof replyToReelsAndPosts === 'boolean') memory.replyToReelsAndPosts = replyToReelsAndPosts;
    if (typeof remindersEnabled === 'boolean') memory.remindersEnabled = remindersEnabled;
    if (typeof nickname === 'string') memory.nickname = nickname.trim();
    if (typeof gender === 'string') {
      const g = allowedEnum(UserMemory, 'gender', gender, null);
      if (!g) return res.status(400).json({ error: `gender must be one of: ${UserMemory.schema.path('gender').enumValues.join(', ')}` });
      memory.gender = g;
    }
    if (typeof personalNotes === 'string') memory.personalNotes = personalNotes;
    if (typeof conversationStyle === 'string') memory.conversationStyle = conversationStyle;
    if (typeof relationshipType === 'string') memory.relationshipType = relationshipType;

    await memory.save();

    res.json({ success: true, memory });
  } catch (err) {
    sendError(res, err);
  }
});

// Update user memory facts or style manually
app.put('/api/conversations/:senderId/memory', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { conversationStyle, relationshipType, facts, rollingSummary } = req.body || {};

    const memory = await UserMemory.findOne({ ownerId: ownerOf(req), senderId });
    if (!memory) return res.status(404).json({ error: 'User not found' });

    if (isStr(conversationStyle) && conversationStyle) memory.conversationStyle = conversationStyle;
    if (isStr(relationshipType) && relationshipType) memory.relationshipType = relationshipType;
    if (isStr(rollingSummary) && rollingSummary) memory.rollingSummary = rollingSummary;
    if (Array.isArray(facts)) {
      memory.facts = facts
        .map(f => isStr(f) ? { fact: f } : (f && isStr(f.fact) ? { fact: f.fact } : null))
        .filter(Boolean);
    }

    await memory.save();
    res.json({ success: true, memory });
  } catch (err) {
    sendError(res, err);
  }
});

// Force AI to analyze conversation history and learn/synthesize memory
app.post('/api/conversations/:senderId/learn', async (req, res) => {
  try {
    const { senderId } = req.params;
    const ownerId = ownerOf(req);
    const existing = await UserMemory.findOne({ ownerId, senderId });
    if (!existing) return res.status(404).json({ error: 'Conversation not found' });

    // 1. Run memory extraction from current messages
    const learned = await memoryService.updateMemoryAsync(senderId, ownerId);
    if (!learned) {
      // Never delete the only copy of the chat when nothing was learned from it
      return res.status(502).json({ error: 'Could not learn from this chat right now. Nothing was deleted, please try again.' });
    }

    // 2. After learning, delete raw message TEXT from DB for this contact (this creator only)
    //    but do NOT touch messageCount / reelsCount (those are on UserMemory, not Message docs)
    const deleted = await Message.deleteMany({
      ownerId,
      $or: [{ senderId }, { recipientId: senderId }]
    });
    console.log(`🧹 [Post-Learn Cleanup] Deleted ${deleted.deletedCount} raw messages for ${senderId} — intel preserved in UserMemory.`);

    const updatedMemory = await UserMemory.findOne({ ownerId, senderId });
    res.json({ success: true, memory: updatedMemory, deletedMessages: deleted.deletedCount });
  } catch (err) {
    sendError(res, err);
  }
});

// Batch Learn & Sync: process all 1-month chat history in MongoDB across all contacts
// Re-learning every contact calls the AI once per contact: it runs in the background, never inside the request
const historySyncRunning = new Set();
app.post('/api/memory/sync-all-history', async (req, res) => {
  const key = String(ownerOf(req));
  if (historySyncRunning.has(key)) {
    return res.status(409).json({ error: 'A full memory sync is already running for this account.' });
  }
  historySyncRunning.add(key);
  res.status(202).json({ success: true, started: true, message: 'Memory sync started in the background.' });
  memoryService.batchSyncAllChatsFromMongo(ownerOf(req), [req.user?.instagramAccountId])
    .then(results => console.log(`🧠 [Memory Sync] Creator ${key}: ${results.length} contacts re-learned.`))
    .catch(err => console.error(`❌ [Memory Sync] Creator ${key}:`, err.message))
    .finally(() => historySyncRunning.delete(key));
});


// Get live UserMemory for a person (used by frontend 15s auto-refresh poll)
app.get('/api/conversations/:senderId/memory', async (req, res) => {
  try {
    const { senderId } = req.params;
    const memory = await UserMemory.findOne({ ownerId: ownerOf(req), senderId });
    if (!memory) return res.status(404).json({ error: 'Memory not found' });
    res.json({ memory });
  } catch (err) {
    sendError(res, err);
  }
});

// Add custom fact/memory

app.post('/api/conversations/:senderId/fact', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { fact } = req.body || {};
    if (!isStr(fact) || !fact.trim()) return res.status(400).json({ error: 'Fact is required' });

    const memory = await UserMemory.findOne({ ownerId: ownerOf(req), senderId });
    if (!memory) return res.status(404).json({ error: 'User not found' });

    memory.facts.push({ fact: fact.trim() });
    await memory.save();
    res.json({ success: true, memory });
  } catch (err) {
    sendError(res, err);
  }
});

// Get Persona Configuration
app.get('/api/persona', async (req, res) => {
  try {
    let query = {};
    if (req.user) {
      query = { ownerId: req.user._id };
    }

    const config = req.user ? await personaFor(req.user) : await PersonaConfig.findOne(query);

    if (config) {
      const userConfig = config.toObject();
      if (req.user) {
        if (!userConfig.creatorName) {
          userConfig.creatorName = req.user.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : req.user.username;
        }
        if (!userConfig.instagramHandle) {
          userConfig.instagramHandle = req.user.instagramUsername ? `@${req.user.instagramUsername.replace(/^@/, '')}` : `@${req.user.username}`;
        }
        userConfig.instagramPageAccessToken = config.instagramPageAccessToken || req.user.instagramPageAccessToken || '';
        userConfig.instagramAccountId = config.instagramAccountId || req.user.instagramAccountId || req.user.instagramId || '';
      }
      return res.json(publicPersona(userConfig));
    }

    res.json(config || {});
  } catch (err) {
    sendError(res, err);
  }
});

// Update Persona Configuration
app.put('/api/persona', async (req, res) => {
  try {
    let query = {};
    if (req.user) {
      query = { ownerId: req.user._id };
    }

    const config = req.user ? await personaFor(req.user) : (await PersonaConfig.findOne(query) || new PersonaConfig({ ...query }));
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const textFields = ['creatorName', 'instagramHandle', 'personaBio', 'aboutMe', 'characteristics', 'textingHabits', 'replyRules',
      'toneGuidelines', 'customKnowledge', 'chatMode', 'instagramPageAccessToken', 'instagramAccountId', 'giphyApiKey'];
    for (const f of textFields) {
      if (body[f] !== undefined && body[f] !== null && !isStr(body[f])) {
        return res.status(400).json({ error: `${f} must be text` });
      }
    }
    for (const f of ['excludedContactIds', 'includedContactIds']) {
      if (body[f] !== undefined && !(Array.isArray(body[f]) && body[f].every(isStr))) {
        return res.status(400).json({ error: `${f} must be a list of ids` });
      }
    }
    if (body.globalBotActive !== undefined && typeof body.globalBotActive !== 'boolean') {
      return res.status(400).json({ error: 'globalBotActive must be true or false' });
    }

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
      autoShareReelsEnabled,
      autoShareReelsFrequencyHours,
      autoShareReelsTopics,
      giphyApiKey,
    } = body;

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
    if (typingDelaySeconds !== undefined) config.typingDelaySeconds = typingDelaySeconds;
    if (instagramPageAccessToken !== undefined) config.instagramPageAccessToken = instagramPageAccessToken;
    if (instagramAccountId !== undefined) {
      if (isStr(instagramAccountId) && instagramAccountId.trim() && await User.accountIdHolder(instagramAccountId, req.user?._id)) {
        return res.status(409).json({ error: 'This Instagram account is already connected to another Chatter account.' });
      }
      config.instagramAccountId = instagramAccountId;
    }
    if (autoShareReelsEnabled !== undefined) config.autoShareReelsEnabled = autoShareReelsEnabled;
    if (autoShareReelsFrequencyHours !== undefined) config.autoShareReelsFrequencyHours = autoShareReelsFrequencyHours;
    if (autoShareReelsTopics !== undefined) config.autoShareReelsTopics = autoShareReelsTopics;
    if (giphyApiKey !== undefined) config.giphyApiKey = (giphyApiKey || '').trim();

    await config.save();
    await redisService.invalidatePersonaConfig(req.user?._id);
    creatorCache.clear();

    if (req.user) {
      if (isStr(instagramPageAccessToken)) req.user.instagramPageAccessToken = instagramPageAccessToken.trim();
      if (isStr(instagramAccountId)) req.user.instagramAccountId = instagramAccountId.trim();
      if (isStr(instagramHandle)) req.user.instagramUsername = instagramHandle.trim().replace(/^@/, '');
      req.user.hasInstagramToken = Boolean(req.user.instagramPageAccessToken);
      req.user.isInstagramConnected = Boolean(req.user.instagramPageAccessToken);
      await req.user.save();
    }

    res.json({ success: true, config: publicPersona(config.toObject()) });
  } catch (err) {
    sendError(res, err);
  }
});

// Persona as sent to the browser: secrets stay on the server, only whether they are set
function publicPersona(obj) {
  const { instagramPageAccessToken, giphyApiKey, ...rest } = obj || {};
  return { ...rest, hasInstagramToken: Boolean(instagramPageAccessToken), hasGiphyKey: Boolean(giphyApiKey) };
}

// GIPHY API Proxy: lets frontend search & preview trending reaction GIFs securely
app.get('/api/giphy/search', async (req, res) => {
  try {
    const { q, limit = 20, rating = 'pg-13' } = req.query;
    const config = await PersonaConfig.findOne({ ownerId: ownerOf(req) });
    const apiKey = (config && config.giphyApiKey) || process.env.GIPHY_API_KEY || '';

    if (!apiKey) {
      return res.status(400).json({ error: 'GIPHY API Key not configured' });
    }

    const params = new URLSearchParams({
      api_key: apiKey,
      q: isStr(q) && q.trim() ? q.trim().slice(0, 100) : 'reaction',
      limit: String(Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50)),
      rating: ['g', 'pg', 'pg-13', 'r'].includes(rating) ? rating : 'pg-13',
    });
    const giphyUrl = `https://api.giphy.com/v1/gifs/search?${params}`;
    const response = await fetch(giphyUrl);
    const data = await response.json();
    res.json({ success: true, data: data.data || [] });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/giphy/trending', async (req, res) => {
  try {
    const { limit = 20, rating = 'pg-13' } = req.query;
    const config = await PersonaConfig.findOne({ ownerId: ownerOf(req) });
    const apiKey = (config && config.giphyApiKey) || process.env.GIPHY_API_KEY || '';

    if (!apiKey) {
      return res.status(400).json({ error: 'GIPHY API Key not configured' });
    }

    const params = new URLSearchParams({
      api_key: apiKey,
      limit: String(Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50)),
      rating: ['g', 'pg', 'pg-13', 'r'].includes(rating) ? rating : 'pg-13',
    });
    const giphyUrl = `https://api.giphy.com/v1/gifs/trending?${params}`;
    const response = await fetch(giphyUrl);
    const data = await response.json();
    res.json({ success: true, data: data.data || [] });
  } catch (err) {
    sendError(res, err);
  }
});

// Interactive Simulator: lets a creator test their AI clone without needing live Instagram DMs first!
app.post('/api/simulator/chat', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { testSenderId = 'test_fan_01', testUsername = 'alex_design', messageText } = body;
    if (!isStr(messageText) || !messageText.trim()) return res.status(400).json({ error: 'messageText is required' });
    if (!isStr(testSenderId) || !isStr(testUsername)) return res.status(400).json({ error: 'testSenderId and testUsername must be text' });
    const ownerId = ownerOf(req);
    const config = await PersonaConfig.findOne({ ownerId });

    // 1. Get or create memory for test user (inside this creator's own data)
    const userMemory = await memoryService.getOrCreateUserMemory(testSenderId, {
      username: testUsername,
      name: testUsername,
    }, ownerId);

    // 2. Save user message
    await Message.create({
      ownerId,
      senderId: testSenderId,
      recipientId: 'me',
      role: 'user',
      text: messageText,
      timestamp: new Date(),
    });
    await redisService.pushMessage(queueKey(ownerId, testSenderId), { role: 'user', text: messageText, timestamp: new Date() });

    // 3. Get recent history
    const history = await Message.find({
      ownerId,
      $or: [
        { senderId: testSenderId },
        { recipientId: testSenderId }
      ]
    }).sort({ createdAt: -1 }).limit(10);
    history.reverse();

    // 4. Generate AI response
    let replyText;
    try {
      replyText = await azureOpenAI.generateReply({
        userMemory,
        messageHistory: history,
        incomingText: messageText,
        config: config || undefined,
      });
    } catch (aiErr) {
      return res.status(502).json({ error: 'The AI service is unavailable right now: ' + aiErr.message });
    }

    // 5. Save assistant reply
    await Message.create({
      ownerId,
      senderId: 'me',
      recipientId: testSenderId,
      role: 'assistant',
      text: replyText,
      sentByAI: true,
      timestamp: new Date(),
    });
    await redisService.pushMessage(queueKey(ownerId, testSenderId), { role: 'assistant', text: replyText, timestamp: new Date() });

    // 6. Asynchronously update memory
    await memoryService.updateMemoryAsync(testSenderId, ownerId);
    const updatedMemory = await UserMemory.findOne({ ownerId, senderId: testSenderId });

    res.json({
      replyText,
      userMemory: updatedMemory,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Remove fact from UserMemory
app.delete('/api/conversations/:senderId/facts', async (req, res) => {
  try {
    const { senderId } = req.params;
    const { fact } = req.body || {};
    if (!isStr(fact) || !fact) return res.status(400).json({ error: 'Fact is required' });

    const result = await UserMemory.updateOne(
      { ownerId: ownerOf(req), senderId },
      { $pull: { facts: { fact } } },
      { runValidators: false } // removing items cannot create invalid data
    );
    if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// Test Instagram Token Validity
app.post('/api/test-token', async (req, res) => {
  try {
    const bodyToken = req.body && isStr(req.body.token) ? req.body.token.trim() : '';
    const config = await PersonaConfig.findOne({ ownerId: ownerOf(req) });
    const token = bodyToken || creatorToken(req.user, config, config?.instagramAccountId || req.user.instagramAccountId);
    if (!token) return res.status(400).json({ error: 'No token provided or configured.' });

    const axios = require('axios');
    const isInstagramToken = token.startsWith('IG');
    const response = await axios.get(isInstagramToken ? 'https://graph.instagram.com/v21.0/me' : 'https://graph.facebook.com/v21.0/me', {
      params: {
        fields: isInstagramToken ? 'id,username' : 'id,name',
        access_token: token,
      },
      timeout: 10000,
    });

    // Only identity fields are returned (never page access tokens)
    res.json({ success: true, data: { id: response.data.id, name: response.data.name || response.data.username || '' } });
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
    const isSuper = req.user?.role === 'superadmin';
    const ownerFilter = req.user
      ? (isSuper
          ? { $or: [{ ownerId: req.user._id }, { ownerId: null }] }
          : { ownerId: req.user._id })
      : {};
    const filter = isStr(category) && category && category !== 'all'
      ? { ...ownerFilter, category: category.toLowerCase().trim() }
      : ownerFilter;
    const items = await MediaVault.find(filter).sort({ createdAt: -1 });
    const categories = await stickerService.getAllCategories(req.user);
    res.json({ success: true, items, categories });
  } catch (err) {
    sendError(res, err);
  }
});

// File upload endpoint (multi-part form for JPG, PNG, GIF, WebP)
app.post('/api/media-vault/upload', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No media file was uploaded.' });
    }
    if (!fileMatchesType(req.file.path, (req.file.mimetype || '').toLowerCase())) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'This file is not a real GIF, JPG, PNG, WebP or MP4.' });
    }
    const { category = 'joy', name, caption, keywords } = req.body || {};
    const cleanCat = (isStr(category) && category ? category : 'joy').toLowerCase().trim().replace(/[^a-z0-9_]/g, '') || 'joy';

    const mime = (req.file.mimetype || '').toLowerCase();
    const ext = path.extname(req.file.originalname).toLowerCase();
    let mediaType = 'image';
    if (mime.includes('gif') || ext === '.gif') mediaType = 'gif';
    else if (mime.includes('video') || ext === '.mp4') mediaType = 'video';

    const baseUrl = (process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
    const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

    const parsedKeywords = parseKeywords(keywords);

    const newMedia = await MediaVault.create({
      name: isStr(name) && name.trim() ? name.trim() : req.file.originalname,
      category: cleanCat,
      url: fileUrl,
      mediaType,
      caption: isStr(caption) ? caption : '',
      keywords: parsedKeywords,
      ownerId: req.user?._id || null,
      ownerUsername: req.user?.username || '',
    });

    console.log(`📸 [Media Vault Upload]: Saved ${mediaType} under category "${cleanCat}": ${fileUrl} for @${req.user?.username || 'user'}`);
    res.json({ success: true, item: newMedia });
  } catch (err) {
    console.error('❌ Media Vault upload error:', err);
    sendError(res, err);
  }
});

// URL-based add (for direct Tenor / Giphy / image URLs)
app.post('/api/media-vault', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const { url, category = 'joy', name, caption, mediaType = 'gif', keywords } = body;
    if (!isStr(url) || !url.trim()) {
      return res.status(400).json({ error: 'Media URL is required' });
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      return res.status(400).json({ error: 'Media URL must start with http:// or https://' });
    }
    const cleanCat = (isStr(category) && category ? category : 'joy').toLowerCase().trim().replace(/[^a-z0-9_]/g, '') || 'joy';

    const parsedKeywords = parseKeywords(keywords);

    const newMedia = await MediaVault.create({
      name: isStr(name) && name.trim() ? name.trim().slice(0, 200) : 'Reaction Media',
      category: cleanCat,
      url: url.trim(),
      mediaType: allowedEnum(MediaVault, 'mediaType', mediaType, 'gif'),
      caption: isStr(caption) ? caption : '',
      keywords: parsedKeywords,
      ownerId: req.user?._id || null,
      ownerUsername: req.user?.username || '',
    });

    res.json({ success: true, item: newMedia });
  } catch (err) {
    sendError(res, err);
  }
});

// Batch add multiple media items (e.g. multi-select from GIPHY search)
app.post('/api/media-vault/batch', async (req, res) => {
  try {
    const { items: itemsToInsert } = req.body || {};
    if (!Array.isArray(itemsToInsert) || itemsToInsert.length === 0) {
      return res.status(400).json({ error: 'Array of items is required' });
    }

    // Validate everything first, then check duplicates with ONE query and insert with ONE call
    const ownerId = req.user?._id || null;
    const seen = new Set();
    const docs = [];
    for (const item of itemsToInsert.slice(0, 100)) {
      if (!item || !isStr(item.url) || !/^https?:\/\//i.test(item.url.trim())) continue;
      const url = item.url.trim();
      if (seen.has(url)) continue;
      seen.add(url);
      docs.push({
        name: isStr(item.name) && item.name.trim() ? item.name.trim().slice(0, 200) : 'Reaction GIF',
        category: (isStr(item.category) && item.category ? item.category : 'joy').toLowerCase().trim().replace(/[^a-z0-9_]/g, '') || 'joy',
        url,
        mediaType: allowedEnum(MediaVault, 'mediaType', item.mediaType, 'gif'),
        caption: isStr(item.caption) ? item.caption : '',
        keywords: parseKeywords(item.keywords),
        ownerId,
        ownerUsername: req.user?.username || '',
      });
    }
    const already = new Set(docs.length ? await MediaVault.distinct('url', { ownerId, url: { $in: docs.map(d => d.url) } }) : []);
    const fresh = docs.filter(d => !already.has(d.url));
    const created = fresh.length ? await MediaVault.insertMany(fresh, { ordered: false }) : [];

    res.json({ success: true, count: created.length, items: created });
  } catch (err) {
    sendError(res, err);
  }
});

// Update media item (title, category, keywords, caption)
app.put('/api/media-vault/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid media id' });
    const { name, category, keywords, caption } = req.body || {};
    for (const [k, v] of Object.entries({ name, category, caption })) {
      if (v !== undefined && !isStr(v)) return res.status(400).json({ error: `${k} must be text` });
    }
    const isSuper = req.user?.role === 'superadmin';
    const query = { _id: req.params.id };
    if (!isSuper && req.user) {
      query.ownerId = req.user._id;
    }
    const update = {};
    if (name !== undefined) update.name = name.trim();
    if (category !== undefined) {
      const cleanCat = category.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
      if (!cleanCat) return res.status(400).json({ error: 'Category must contain letters or numbers' });
      update.category = cleanCat;
    }
    if (caption !== undefined) update.caption = caption.trim();
    if (keywords !== undefined) {
      update.keywords = parseKeywords(keywords);
    }

    const updated = await MediaVault.findOneAndUpdate(query, update, { returnDocument: 'after' });
    if (!updated) return res.status(404).json({ error: 'Media not found or unauthorized' });
    res.json({ success: true, item: updated });
  } catch (err) {
    sendError(res, err);
  }
});

// Delete media item
app.delete('/api/media-vault/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid media id' });
    const isSuper = req.user?.role === 'superadmin';
    const query = { _id: req.params.id };
    if (!isSuper && req.user) {
      query.ownerId = req.user._id;
    }
    const item = await MediaVault.findOne(query);
    if (!item) return res.status(404).json({ error: 'Media not found or unauthorized' });

    // If locally uploaded file, delete from disk — but only when no other vault item
    // (possibly another creator's) still points at the same file
    if (item.url && item.url.includes('/uploads/')) {
      const otherRefs = await MediaVault.countDocuments({ _id: { $ne: item._id }, url: item.url });
      const filename = path.basename(item.url);
      const filePath = path.join(uploadsDir, filename);
      if (otherRefs === 0 && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
    }

    await MediaVault.findByIdAndDelete(req.params.id);
    res.json({ success: true, deletedId: req.params.id });
  } catch (err) {
    sendError(res, err);
  }
});

// Predefined GIF Library endpoints
app.get('/api/media-vault/predefined', (req, res) => {
  try {
    const predefined = stickerService.getPredefinedList();
    res.json({ success: true, predefined });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/media-vault/import-predefined', async (req, res) => {
  try {
    const { ids } = req.body || {};
    const results = await stickerService.seedPredefinedIntoVault(ids, req.user);
    res.json({ success: true, results });
  } catch (err) {
    sendError(res, err);
  }
});

// Get all categories
app.get('/api/media-vault/categories', async (req, res) => {
  try {
    const categories = await stickerService.getAllCategories(req.user);
    res.json({ success: true, categories });
  } catch (err) {
    sendError(res, err);
  }
});

// Add new custom category
app.post('/api/media-vault/categories', async (req, res) => {
  try {
    const { category } = req.body || {};
    if (!isStr(category) || !category.trim()) {
      return res.status(400).json({ error: 'Category identifier is required' });
    }
    const cleanCat = category.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    if (!cleanCat) return res.status(400).json({ error: 'Category must contain letters or numbers' });

    const personaQuery = req.user ? { ownerId: req.user._id } : {};
    const config = await personaFor(req.user);

    config.customReactionCategories = config.customReactionCategories || [];
    if (!config.customReactionCategories.includes(cleanCat)) {
      config.customReactionCategories.push(cleanCat);
      await config.save();
    }

    const categories = await stickerService.getAllCategories(req.user);
    res.json({ success: true, categories });
  } catch (err) {
    sendError(res, err);
  }
});

// Rename / Edit existing category
app.put('/api/media-vault/categories/:name', async (req, res) => {
  try {
    const oldCat = req.params.name.toLowerCase().trim();
    const { newCategory } = req.body || {};
    if (!isStr(newCategory) || !newCategory.trim()) {
      return res.status(400).json({ error: 'New category name is required' });
    }
    const cleanNew = newCategory.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');
    if (!cleanNew) return res.status(400).json({ error: 'Category must contain letters or numbers' });

    // 1. Update in PersonaConfig
    const personaQuery = req.user ? { ownerId: req.user._id } : {};
    let config = await PersonaConfig.findOne(personaQuery);
    if (config && config.customReactionCategories) {
      config.customReactionCategories = config.customReactionCategories.map(c => c === oldCat ? cleanNew : c);
      await config.save();
    }

    // 2. Cascade update all MediaVault items belonging to this creator
    const ownerFilter = req.user ? { ownerId: req.user._id } : {};
    await MediaVault.updateMany({ category: oldCat, ...ownerFilter }, { category: cleanNew });

    const categories = await stickerService.getAllCategories(req.user);
    res.json({ success: true, categories });
  } catch (err) {
    sendError(res, err);
  }
});

// Delete custom category
app.delete('/api/media-vault/categories/:name', async (req, res) => {
  try {
    const catName = req.params.name.toLowerCase().trim();
    const personaQuery = req.user ? { ownerId: req.user._id } : {};
    let config = await PersonaConfig.findOne(personaQuery);
    if (config && config.customReactionCategories) {
      config.customReactionCategories = config.customReactionCategories.filter(c => c !== catName);
      await config.save();
    }
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
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

// Deauthorize Callback for Meta
app.all('/deauthorize', (req, res) => {
  res.json({ success: true, message: 'Account deauthorized successfully' });
});

// User Data Deletion Callback for Meta
app.all('/data-deletion', (req, res) => {
  res.json({
    url: 'https://instagram-ai-bot-64tf.onrender.com/privacy',
    confirmation_code: 'chatter_deletion_success'
  });
});


// Endpoint to manually trigger 3-day message cleanup and view freed space
app.post('/api/cleanup', async (req, res) => {
  try {
    const days = Math.max(1, parseInt(req.body?.days, 10) || 3);
    const deletedCount = await memoryService.cleanOldMessages(days);
    res.json({ success: true, deletedCount, message: `Deleted ${deletedCount} messages older than ${days} days` });
  } catch (err) {
    sendError(res, err);
  }
});

// Social Graph Tree Chain Endpoints (auto-discovers newly talked contacts & enriches with live DP & per-person AI settings)
const trainGraphTimes = new Map(); // creatorId -> last background training time
const contactDiscoveryTimes = new Map(); // ownerId -> last auto-discovery time
app.get('/api/social-graph', async (req, res) => {
  try {
    // Train this creator's graph at most once every 5 minutes, in the background (this endpoint is polled)
    const now = Date.now();
    const trainKey = String(ownerOf(req));
    if (now - (trainGraphTimes.get(trainKey) || 0) > 5 * 60 * 1000) {
      trainGraphTimes.set(trainKey, now);
      socialGraphService.trainGraphFromDB(UserMemory, Message, ownerOf(req)).catch(e => console.warn('trainGraph error:', e.message));
    }

    // Every creator (superadmin included) sees only their own People list
    const ownerId = ownerOf(req);
    const query = { ownerId };

    // Auto-discover contacts from this creator's chats (at most every 5 minutes per creator; this endpoint is polled)
    const lastDiscover = contactDiscoveryTimes.get(String(ownerId)) || 0;
    if (ownerId && now - lastDiscover > 5 * 60 * 1000) {
      contactDiscoveryTimes.set(String(ownerId), now);
      try {
        const known = new Set((await SocialGraph.find({ ownerId, senderId: { $nin: [null, ''] } }, { senderId: 1 })).map(n => n.senderId));
        const mems = await UserMemory.find({ ownerId, senderId: { $nin: [...known, 'me'] } })
          .select('senderId username name profilePic messageCount personalNotes').limit(200).lean();
        // One bulk upsert instead of one insert per contact; upsert by sender never makes duplicates
        const ops = mems.filter(m => !/^(test_|ig_tester_|sim_)/i.test(m.senderId)).map(mem => {
          const cid = mem.senderId;
          const cleanU = (mem.username || '').replace(/^@/, '').trim();
          return { updateOne: { filter: { ownerId, senderId: cid }, upsert: true, update: { $setOnInsert: {
            ownerId: req.user._id,
            ownerUsername: req.user.username,
            senderId: cid,
            name: mem.name && !mem.name.startsWith('User_') ? mem.name : (cleanU || `User_${cid.slice(-4)}`),
            instagramHandle: cleanU ? `@${cleanU}` : '',
            profilePic: mem.profilePic || '',
            category: 'online_friend',
            chatsCount: mem.messageCount || 0,
            reelsCount: 0,
            relationshipToSam: 'Friend',
            lore: mem.personalNotes ? [mem.personalNotes] : [],
            createdAt: new Date(),
            updatedAt: new Date()
          } } } };
        });
        if (ops.length) await SocialGraph.bulkWrite(ops, { ordered: false });
      } catch (syncErr) {
        console.warn('Auto contact sync error:', syncErr.message);
      }
    }

    const nodes = await SocialGraph.find(query).sort({ updatedAt: -1 }).lean();

    // Load this creator's memories for all nodes in ONE query (was one or two queries per node)
    const nodeSenderIds = nodes.map(n => n.senderId).filter(Boolean);
    const nodeHandles = nodes.filter(n => !n.senderId && n.instagramHandle).map(n => n.instagramHandle.replace(/^@/, '').toLowerCase().trim());
    const memDocs = (nodeSenderIds.length || nodeHandles.length) ? await UserMemory.find({
      ownerId,
      $or: [{ senderId: { $in: nodeSenderIds } }, { username: { $in: nodeHandles } }]
    }).select('senderId username profilePic aiEnabled replyToMessages replyToReelsAndPosts importantDates relationshipType lastInteraction').lean() : [];
    const memBySender = new Map(memDocs.map(m => [m.senderId, m]));
    const memByUsername = new Map(memDocs.map(m => [(m.username || '').toLowerCase(), m]));

    // Attach UserMemory settings (aiEnabled, replyToMessages, replyToReelsAndPosts, profilePic, messageCount) to each node
    const enrichedNodes = nodes.map((n) => {
      let memory = null;
      let effectiveSenderId = n.senderId || '';

      if (effectiveSenderId) {
        memory = memBySender.get(effectiveSenderId) || null;
      }
      if (!memory && n.instagramHandle) {
        const cleanU = n.instagramHandle.replace(/^@/, '').toLowerCase().trim();
        memory = memByUsername.get(cleanU) || null;
        if (memory && !effectiveSenderId) {
          effectiveSenderId = memory.senderId;
          // Persist the discovered senderId to social graph node
          SocialGraph.updateOne({ _id: n._id }, { senderId: effectiveSenderId }).catch(() => {});
        }
      }

      const memoryDob = memory?.importantDates && memory.importantDates.length > 0 ? memory.importantDates[0].date : '';

      // Authoritative creator-scoped persistent chats & reels count (immune to cross-account pollution)
      const chatsCount = typeof n.chatsCount === 'number' ? n.chatsCount : 0;
      const reelsCount = typeof n.reelsCount === 'number' ? n.reelsCount : 0;

      return {
        ...n,
        senderId: effectiveSenderId,
        category: n.category || (memory?.relationshipType ? (memory.relationshipType === 'collaborator' || memory.relationshipType === 'client' ? 'professional' : 'online_friend') : 'online_friend'),
        dob: n.dob || memoryDob || '',
        personalNotes: n.personalNotes || (n.lore || []).join('\n'),
        profilePic: memory?.profilePic || n.profilePic || '',
        aiEnabled: memory ? memory.aiEnabled !== false : n.aiEnabled !== false,
        replyToMessages: memory ? memory.replyToMessages !== false : n.replyToMessages !== false,
        replyToReelsAndPosts: memory ? memory.replyToReelsAndPosts !== false : n.replyToReelsAndPosts !== false,
        messageCount: chatsCount,
        chatsCount,
        reelsCount,
        lastInteraction: memory?.lastInteraction || n.updatedAt
      };
    });

    // Authoritative backend deduplication by senderId, instagramHandle, or normalized name
    // (Map lookups: linear time. Same name alone only merges when one entry has no id/handle,
    // because two real people can share a name.)
    const deduplicatedNodes = [];
    const seenSender = new Map(), seenHandle = new Map(), seenBareName = new Map(), seenName = new Map();
    for (const node of enrichedNodes) {
      const cleanSenderId = (node.senderId || '').trim();
      const cleanHandle = (node.instagramHandle || '').replace(/^@/, '').toLowerCase().trim();
      const cleanName = (node.name || '').toLowerCase().trim();
      const bare = !cleanSenderId && !cleanHandle;

      const existing = (cleanSenderId && seenSender.get(cleanSenderId)) ||
        (cleanHandle && seenHandle.get(cleanHandle)) ||
        (cleanName && (bare ? seenName.get(cleanName) : seenBareName.get(cleanName))) || null;

      if (!existing) {
        deduplicatedNodes.push(node);
        if (cleanSenderId) seenSender.set(cleanSenderId, node);
        if (cleanHandle) seenHandle.set(cleanHandle, node);
        if (cleanName) {
          if (!seenName.has(cleanName)) seenName.set(cleanName, node);
          if (bare && !seenBareName.has(cleanName)) seenBareName.set(cleanName, node);
        }
      } else {
        if (!existing.instagramHandle && node.instagramHandle) existing.instagramHandle = node.instagramHandle;
        if (!existing.senderId && node.senderId) existing.senderId = node.senderId;
        if (!existing.profilePic && node.profilePic) existing.profilePic = node.profilePic;
        if (!existing.dob && node.dob) existing.dob = node.dob;
        if (!existing.personalNotes && node.personalNotes) existing.personalNotes = node.personalNotes;
        if ((!existing.chatsCount || existing.chatsCount === 0) && node.chatsCount) existing.chatsCount = node.chatsCount;
        if ((!existing.reelsCount || existing.reelsCount === 0) && node.reelsCount) existing.reelsCount = node.reelsCount;
      }
    }

    res.json({ success: true, nodes: deduplicatedNodes });
  } catch (err) {
    sendError(res, err);
  }
});


app.post('/api/social-graph/sync', async (req, res) => {
  try {
    await socialGraphService.trainGraphFromDB(UserMemory, Message, ownerOf(req));
    socialGraphService.clearCache(ownerOf(req));
    const nodes = await SocialGraph.find({ ownerId: ownerOf(req) });
    res.json({ success: true, message: 'Social knowledge tree synced from DB', count: nodes.length, nodes });
  } catch (err) {
    sendError(res, err);
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

    if (!isStr(name) || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (name.trim().length > 100) {
      return res.status(400).json({ error: 'Name must be 100 characters or fewer' });
    }
    for (const [k, v] of Object.entries({ instagramHandle, senderId, gender, relationshipToSam, category, dob, personalNotes, roastStyle })) {
      if (v !== undefined && v !== null && !isStr(v)) return res.status(400).json({ error: `${k} must be text` });
    }
    const ownerId = ownerOf(req);

    const finalRelationship = relationshipToSam || req.body.relationship || 'Friend';
    const rawHandle = instagramHandle || (isStr(req.body.handle) ? req.body.handle : '') || '';
    const finalHandle = rawHandle ? (rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`) : '';
    const finalCategory = allowedEnum(SocialGraph, 'category', category || req.body.category, 'online_friend');
    const finalDob = dob || (isStr(req.body.dateOfBirth) ? req.body.dateOfBirth : '') || '';
    const finalPersonalNotes = personalNotes || '';

    let parsedAliases = [];
    if (Array.isArray(aliases)) {
      parsedAliases = aliases.filter(isStr);
    } else if (typeof aliases === 'string') {
      parsedAliases = aliases.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
    }

    let parsedLore = [];
    if (Array.isArray(lore)) {
      parsedLore = lore.filter(isStr);
    } else if (typeof lore === 'string') {
      parsedLore = lore.split('\n').map(l => l.trim().replace(/^[•\-\*]\s*/, '')).filter(Boolean);
    }

    let parsedConnections = [];
    if (Array.isArray(connections)) {
      parsedConnections = connections.filter(c => isStr(c) || (c && typeof c === 'object')).map(c => {
        if (typeof c === 'string') {
          return { targetName: c.trim(), relationship: 'connected', notes: '' };
        }
        const txt = (v) => (isStr(v) ? v.trim() : '');
        return {
          targetName: txt(c.targetName) || txt(c.name),
          relationship: txt(c.relationship) || txt(c.rel) || 'friend',
          notes: txt(c.notes)
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
    let finalProfilePic = isStr(req.body.profilePic) ? req.body.profilePic : '';
    if (!finalSenderId && finalHandle) {
      const cleanU = finalHandle.replace(/^@/, '').toLowerCase().trim();
      const matchedMem = await UserMemory.findOne({ ownerId, username: new RegExp(`^${escapeRegex(cleanU)}$`, 'i') });
      if (matchedMem) {
        finalSenderId = matchedMem.senderId;
        if (!finalProfilePic) finalProfilePic = matchedMem.profilePic;
      }
    }

    const cleanName = name.trim();
    const rawOld = req.body.oldName || req.body.previousName || '';
    const cleanOldName = (isStr(rawOld) ? rawOld : '').trim();

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

    // Only ever match this creator's own contacts
    findQuery = { ownerId, ...findQuery };

    const updated = await SocialGraph.findOneAndUpdate(
      findQuery,
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
          ...(finalProfilePic ? { profilePic: finalProfilePic } : {}),
          ...(req.user ? { ownerId: req.user._id, ownerUsername: req.user.username } : {}),
          updatedAt: new Date()
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Chat and reel counts are counted by the server from real DMs; the client never overwrites them

    // If this node was renamed, clean up any old name documents in SocialGraph
    if (cleanOldName && cleanOldName.toLowerCase() !== cleanName.toLowerCase()) {
      await SocialGraph.deleteMany({
        ownerId,
        name: new RegExp(`^${escapeRegex(cleanOldName)}$`, 'i'),
        _id: { $ne: updated._id }
      });
      // Also update any connection in other friend nodes that referenced the old name
      await SocialGraph.updateMany(
        { ownerId, 'connections.targetName': new RegExp(`^${escapeRegex(cleanOldName)}$`, 'i') },
        { $set: { 'connections.$[elem].targetName': cleanName } },
        { arrayFilters: [{ 'elem.targetName': new RegExp(`^${escapeRegex(cleanOldName)}$`, 'i') }] }
      );
    }

    // Clean up any other duplicate names specified
    const dupsToDelete = Array.isArray(req.body.duplicateNamesToDelete) ? req.body.duplicateNamesToDelete : [];
    for (const dup of dupsToDelete) {
      if (dup && typeof dup === 'string' && dup.trim().toLowerCase() !== cleanName.toLowerCase()) {
        await SocialGraph.deleteMany({
          ownerId,
          name: new RegExp(`^${escapeRegex(dup.trim())}$`, 'i'),
          _id: { $ne: updated._id }
        });
      }
    }

    if (finalSenderId) {
      await UserMemory.findOneAndUpdate(
        { ownerId, senderId: finalSenderId },
        {
          $set: {
            name: cleanName,
            nickname: cleanName,
            ...(finalDob ? { importantDates: [{ title: 'Birthday', date: finalDob }] } : {})
          }
        }
      );
    }

    socialGraphService.clearCache(ownerId);
    res.json({ success: true, node: updated });
  } catch (err) {
    sendError(res, err);
  }
});

// Quick lookup contact by handle or name to auto-resolve sender ID and avatar
app.get('/api/contacts/lookup', async (req, res) => {
  try {
    const rawParam = req.query.handle || req.query.username || req.query.query || req.query.q || '';
    const rawQuery = (isStr(rawParam) ? rawParam : '').replace(/^@/, '').trim().slice(0, 100);
    if (!rawQuery) return res.json({ found: false });

    const memory = await UserMemory.findOne({
      ownerId: ownerOf(req),
      $or: [
        { username: new RegExp(`^${escapeRegex(rawQuery)}$`, 'i') },
        { name: new RegExp(`^${escapeRegex(rawQuery)}$`, 'i') },
        { senderId: rawQuery }
      ]
    });

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
    sendError(res, err);
  }
});

// AI Extract Person Details from Raw Chat with Clarifying Questions
app.post('/api/social-graph/extract-from-chat', async (req, res) => {
  try {
    const { chatText, currentPerson, userClarifications } = req.body || {};
    if (!isStr(chatText) || !chatText.trim()) {
      return res.status(400).json({ error: 'Chat text is required' });
    }

    const extraction = await azureOpenAI.extractPersonFromRawChat({
      chatText,
      currentPerson,
      userClarifications,
      ownerId: ownerOf(req)
    });

    res.json({ success: true, extraction });
  } catch (err) {
    console.error('Raw chat extraction error:', err.message);
    sendError(res, err);
  }
});

// Delete a person from the social knowledge tree & MongoDB
app.delete('/api/social-graph/node/:identifier', async (req, res) => {
  try {
    // Express already decoded the path; decoding again breaks names containing "%"
    const clean = String(req.params.identifier || '').trim();

    // 1. Find matching node (an exact id always wins over a name)
    const ownerId = ownerOf(req);
    const isObjectId = mongoose.Types.ObjectId.isValid(clean);
    const node = (isObjectId ? await SocialGraph.findOne({ ownerId, _id: clean }) : null) || await SocialGraph.findOne({
      ownerId,
      $or: [
        { name: new RegExp(`^${escapeRegex(clean)}$`, 'i') },
        { senderId: clean },
        { instagramHandle: new RegExp(`^@?${escapeRegex(clean.replace(/^@/, ''))}$`, 'i') }
      ]
    });

    if (!node) return res.status(404).json({ error: `Person "${clean}" not found` });
    const targetName = node.name;
    const targetSenderId = node.senderId || '';

    // 2. Delete ONLY this person (others who share the name are different people)
    await SocialGraph.deleteOne({ ownerId, _id: node._id });

    // 3. Remove from other nodes' connections, unless someone else still has this name
    const sameNameLeft = await SocialGraph.exists({ ownerId, name: new RegExp(`^${escapeRegex(targetName)}$`, 'i') });
    if (!sameNameLeft) {
      await SocialGraph.updateMany(
        { ownerId, 'connections.targetName': new RegExp(`^${escapeRegex(targetName)}$`, 'i') },
        { $pull: { connections: { targetName: new RegExp(`^${escapeRegex(targetName)}$`, 'i') } } },
        { runValidators: false } // removing items cannot create invalid data
      );
    }

    // 4. Delete corresponding UserMemory if exists (safeguard: do not delete if another node still uses this senderId)
    if (targetSenderId && req.query.keepMemory !== 'true') {
      const remainingNode = await SocialGraph.findOne({ ownerId, senderId: targetSenderId });
      if (!remainingNode) {
        await UserMemory.deleteMany({ ownerId, senderId: targetSenderId });
      }
    }

    socialGraphService.clearCache(ownerId);
    console.log(`🗑️ Successfully deleted person "${targetName}" from MongoDB`);
    res.json({ success: true, message: `Deleted ${targetName} from database` });
  } catch (err) {
    console.error('Delete node error:', err.message);
    sendError(res, err);
  }
});



// AI Autofill fields for a person based on chat history & existing memory
app.post('/api/social-graph/node/:name/ai-autofill', async (req, res) => {
  try {
    const { name } = req.params;
    const cleanName = name.trim();
    const ownerId = ownerOf(req);
    const node = await SocialGraph.findOne({
      ownerId,
      $or: [
        { name: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') },
        { aliases: cleanName.toLowerCase() }
      ]
    });
    if (!node) return res.status(404).json({ error: `Person "${cleanName}" not found` });

    let recentMessages = [];
    let memory = null;
    const convo = (sid) => ({ ownerId, $or: [{ senderId: sid }, { recipientId: sid }] });
    if (node.senderId) {
      recentMessages = await Message.find(convo(node.senderId)).sort({ createdAt: -1 }).limit(40);
      memory = await UserMemory.findOne({ ownerId, senderId: node.senderId });
    } else if (node.instagramHandle) {
      const u = node.instagramHandle.replace(/^@/, '').toLowerCase();
      memory = await UserMemory.findOne({ ownerId, username: new RegExp(`^${escapeRegex(u)}$`, 'i') });
      if (memory?.senderId) {
        recentMessages = await Message.find(convo(memory.senderId)).sort({ createdAt: -1 }).limit(40);
      }
    }

    const creatorLabel = (await creatorIdentity(ownerId)).name;
    const conversationText = recentMessages.reverse().map(m => `${m.role === 'user' ? (node?.name || cleanName) : creatorLabel}: ${m.text || '[reel/media]'}`).join('\n');

    const prompt = `Analyze this Instagram conversation and existing memory for a friend of Sam Joshua named "${node?.name || cleanName}".
Existing Lore: ${JSON.stringify(node?.lore || [])}
Existing Personal Notes: ${JSON.stringify(node?.personalNotes || '')}
Existing Memory: ${JSON.stringify(memory || {})}
Recent Messages:
${conversationText || '(No recent DM text found, extrapolate from existing lore)'}

Generate a JSON object with:
1. "category": Choose one of ["close_friend", "online_friend", "offline_friend", "family", "professional", "business"]
2. "relationshipToSam": Concise relationship title (e.g. "Closest Online Friend / Medicine Student", "Day-One Homie / Brother", "Sister", "Professional Collaborator")
3. "dob": Birthday or Date of Birth if known (e.g. "March 12, 2007"), or ""
4. "personalNotes": Multi-line rich summary of who they are, their family, habits, studies, inside jokes, and connection with Sam
5. "banterStyle": Recommended cussing/banter tone (e.g. "Gentle playful teasing", "Savage Hindi bro banter", "Tamil roast insults", "Sweet caring shortcuts")
6. "facts": Array of 3-6 concise factual strings

Return ONLY raw JSON.`;

    const completion = await azureOpenAI.getClient().chat.completions.create({
      model: azureOpenAI.defaultDeployment,
      messages: [
        { role: 'system', content: 'You are an expert social intelligence analyzer. Output valid JSON only without markdown formatting.' },
        { role: 'user', content: personalize(prompt, creatorLabel) }
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

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
    sendError(res, err);
  }
});

// Link an Instagram ID / handle to an existing friend node and merge records
app.post('/api/social-graph/link-id', async (req, res) => {
  try {
    const { personName, instagramHandle, senderId } = req.body || {};
    if (!isStr(personName) || !personName.trim()) return res.status(400).json({ error: 'Person name is required' });
    if ((instagramHandle !== undefined && instagramHandle !== null && !isStr(instagramHandle)) || (senderId !== undefined && senderId !== null && !isStr(senderId))) {
      return res.status(400).json({ error: 'instagramHandle and senderId must be text' });
    }
    const ownerId = ownerOf(req);

    const cleanName = personName.trim();
    const cleanHandle = instagramHandle ? `@${instagramHandle.replace(/^@/, '').trim()}` : '';
    const cleanUsername = cleanHandle ? cleanHandle.replace(/^@/, '').toLowerCase() : '';

    // 1. Find the target SocialGraph node
    let node = await SocialGraph.findOne({
      ownerId,
      $or: [
        { name: new RegExp(`^${escapeRegex(cleanName)}$`, 'i') },
        { aliases: cleanName.toLowerCase() }
      ]
    });

    if (!node) {
      return res.status(404).json({ error: `Person "${cleanName}" not found in Social Knowledge Tree.` });
    }

    // 2. Check if a UserMemory exists with this senderId or username
    let memory = null;
    if (senderId) {
      memory = await UserMemory.findOne({ ownerId, senderId });
    }
    if (!memory && cleanUsername) {
      memory = await UserMemory.findOne({ ownerId, username: new RegExp(`^${escapeRegex(cleanUsername)}$`, 'i') });
    }

    // 3. Check if there was another node created automatically from UserMemory for this handle/senderId that should be merged
    const hasLinkKey = Boolean(senderId || cleanHandle || cleanUsername);
    const otherNode = !hasLinkKey ? null : await SocialGraph.findOne({
      ownerId,
      _id: { $ne: node._id },
      $or: [
        ...(senderId ? [{ senderId }] : []),
        ...(cleanHandle ? [{ instagramHandle: cleanHandle }] : []),
        ...(cleanUsername ? [{ aliases: cleanUsername }] : [])
      ]
    });

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
      await UserMemory.findOneAndUpdate(
        { ownerId, senderId: node.senderId },
        {
          $set: {
            username: cleanUsername,
            name: node.name,
            nickname: node.name
          }
        },
        { upsert: true }
      );
    }

    socialGraphService.clearCache(ownerId);
    console.log(`✅ [Link ID Success]: Linked ${node.name} to ${cleanHandle} (senderId: ${node.senderId})`);

    res.json({
      success: true,
      message: `Linked ${node.name} with ${cleanHandle || node.senderId}`,
      node
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Get recent chatters from UserMemory to suggest when linking handles
app.get('/api/social-graph/unlinked-chatters', async (req, res) => {
  try {
    const memories = await UserMemory.find({
      ownerId: ownerOf(req),
      username: { $not: /^(test_|ig_tester_|catovidz$|me$|user_\d+)/i },
      senderId: { $ne: 'me' }
    }).sort({ lastInteraction: -1 }).limit(30);

    const chatters = memories.map(m => ({
      senderId: m.senderId,
      username: m.username ? `@${m.username.replace(/^@/, '')}` : '',
      name: m.name || m.nickname || m.username,
      profilePic: m.profilePic || '',
      lastInteraction: m.lastInteraction
    }));

    res.json({ success: true, chatters });
  } catch (err) {
    sendError(res, err);
  }
});

// Update per-person AI reply policy (Full AI, Only Reels, Stop AI / Sam Manual)
app.post('/api/social-graph/node/:identifier/preferences', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { aiMode, aiEnabled, replyToMessages, replyToReelsAndPosts, autoSendReels } = req.body || {};
    const ownerId = ownerOf(req);

    let finalAiEnabled = aiEnabled;
    let finalReplyMessages = replyToMessages;
    let finalReplyReels = replyToReelsAndPosts;

    if (aiMode === 'full_ai') {
      finalAiEnabled = true;
      finalReplyMessages = true;
      finalReplyReels = true;
    } else if (aiMode === 'reels_only') {
      finalAiEnabled = true;
      finalReplyMessages = false;
      finalReplyReels = true;
    } else if (aiMode === 'messages_only') {
      finalAiEnabled = true;
      finalReplyMessages = true;
      finalReplyReels = false;
    } else if (aiMode === 'paused' || aiMode === 'manual') {
      finalAiEnabled = false;
      finalReplyMessages = false;
      finalReplyReels = false;
    }

    const cleanId = (identifier || '').trim();
    const cleanHandle = cleanId.replace(/^@/, '');

    // Find the exact contact first (this creator only)
    const targetNode = await SocialGraph.findOne({
      ownerId,
      $or: [
        { senderId: cleanId },
        { instagramHandle: new RegExp(`^@?${escapeRegex(cleanHandle)}$`, 'i') },
        { name: new RegExp(`^${escapeRegex(cleanId)}$`, 'i') },
        { aliases: cleanHandle.toLowerCase() }
      ]
    });
    const targetMemory = await UserMemory.findOne({
      ownerId,
      $or: [
        { senderId: cleanId },
        ...(targetNode?.senderId ? [{ senderId: targetNode.senderId }] : []),
        { username: new RegExp(`^${escapeRegex(cleanHandle)}$`, 'i') }
      ]
    });
    if (!targetNode && !targetMemory) {
      return res.status(404).json({ error: `Contact "${cleanId}" not found` });
    }

    // Update UserMemory if present
    await UserMemory.updateMany(
      {
        ownerId,
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
          ...(typeof finalReplyReels === 'boolean' ? { replyToReelsAndPosts: finalReplyReels } : {})
        }
      }
    );

    // Update SocialGraph if present
    await SocialGraph.updateMany(
      {
        ownerId,
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
          ...(typeof autoSendReels === 'boolean' ? { autoSendReels } : {})
        }
      }
    );

    socialGraphService.clearCache(ownerId);
    res.json({
      success: true,
      preferences: {
        aiEnabled: finalAiEnabled,
        replyToMessages: finalReplyMessages,
        replyToReelsAndPosts: finalReplyReels,
        autoSendReels
      }
    });
  } catch (err) {
    sendError(res, err);
  }
});

// AI Conversational Interview to clarify friend details, relationships & lore
app.post('/api/social-graph/ai-interview', async (req, res) => {
  try {
    const { conversationHistory, userInput, existingNode, autoSave } = req.body || {};
    const ownerId = ownerOf(req);
    const interviewResult = await azureOpenAI.interviewPersonForSocialTree({
      conversationHistory: Array.isArray(conversationHistory) ? conversationHistory : [],
      userInput: isStr(userInput) ? userInput : '',
      existingNode,
      ownerId
    });

    // Handle automated duplicate merging in DB
    if (Array.isArray(interviewResult.duplicateNamesToDelete) && interviewResult.duplicateNamesToDelete.length > 0) {
      console.log('🗑️ AI identified duplicate names to remove from DB:', interviewResult.duplicateNamesToDelete);
      const queryList = interviewResult.duplicateNamesToDelete.filter(isStr).map(n => n.trim()).filter(Boolean);
      const regexList = queryList.map(n => new RegExp(`^${escapeRegex(n)}$`, 'i'));

      await SocialGraph.deleteMany({
        ownerId,
        $or: [
          { name: { $in: regexList } },
          { name: { $in: queryList } }
        ]
      });
      socialGraphService.clearCache(ownerId);
    }

    if (interviewResult.isComplete && (autoSave || interviewResult.duplicateNamesToDelete?.length) && isStr(interviewResult.node?.name) && interviewResult.node.name.trim()) {
      const node = interviewResult.node;
      await SocialGraph.findOneAndUpdate(
        { ownerId, name: new RegExp(`^${escapeRegex(node.name.trim())}$`, 'i') },
        {
          $set: {
            ownerId,
            ownerUsername: req.user?.username || '',
            name: node.name.trim(),
            aliases: node.aliases || [],
            instagramHandle: node.instagramHandle || '',
            gender: allowedEnum(SocialGraph, 'gender', node.gender, 'unknown'),
            relationshipToSam: isStr(node.relationshipToSam) && node.relationshipToSam ? node.relationshipToSam : 'friend',
            lore: node.lore || [],
            roastStyle: node.roastStyle || '',
            connections: node.connections || [],
            updatedAt: new Date()
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      socialGraphService.clearCache(ownerId);
    }

    res.json({ success: true, ...interviewResult });
  } catch (err) {
    sendError(res, err);
  }
});

// Final error handler: clean JSON for bad JSON bodies, rejected uploads, etc. — never a stack trace
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error('❌ Unhandled request error:', err.message);
  const message = err.type === 'entity.parse.failed' ? 'Request body is not valid JSON'
    : err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 15MB)'
    : status >= 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Instagram AI Automation Server Running!`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🔑 Webhook Verify Token: ${VERIFY_TOKEN}`);
  console.log(`======================================================\n`);

  // Seed & train social knowledge tree
  socialGraphService.seedInitialGraph().then(() => {
    return socialGraphService.trainGraphFromDB(UserMemory, Message);
  }).catch(e => console.error('❌ SocialGraph init error:', e.message));

  // Seed predefined meme collection in MediaVault so DB always has relevant GIFs ready
  stickerService.seedPredefinedIntoVault().catch(e => console.warn('MediaVault seed warning:', e.message));

  // Start 5-6 hr follow-up reminder scheduler
  reminderService.startScheduler(15);

  // Safe chat retention & daily maintenance scheduler (keeps full 1-month chat history)
  if (memoryService && typeof memoryService.startDailyCleanup === 'function') {
    memoryService.startDailyCleanup();
  }
});
