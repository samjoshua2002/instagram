/**
 * Keeps what people send you and tells you when a message needs you.
 * - Links, files, photos, videos and voice notes are saved per person (People page > Shared);
 *   files are copied into MongoDB GridFS because Instagram's attachment links expire.
 * - Messages that look important (invite, money, urgent, a request) are checked by the AI and,
 *   if they need you, emailed to you (at most one email per person every 20 minutes).
 */
const mongoose = require('mongoose');
const SharedItem = require('../models/SharedItem');
const User = require('../models/User');
const { extractLinks, looksImportant, kindOf } = require('./importantRules');

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const EMAIL_GAP_MS = 5 * 60 * 1000; // one alert email per person per 5 minutes
const STORED_KINDS = new Set(['photo', 'video', 'voice', 'file']);

function bucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'shared' });
}

/** Copies a file from Instagram's CDN into GridFS. Returns { fileId, contentType, bytes } or null. */
// Files share the database with everything else: stop keeping new ones past this total
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
let usage = { at: 0, bytes: 0 };
async function storedBytes() {
  if (Date.now() - usage.at < 10 * 60 * 1000) return usage.bytes;
  const [row] = await mongoose.connection.db.collection('shared.files')
    .aggregate([{ $group: { _id: null, total: { $sum: '$length' } } }]).toArray();
  usage = { at: Date.now(), bytes: row?.total || 0 };
  return usage.bytes;
}

async function storeFile(url, filename, meta) {
  try {
    if (await storedBytes() >= MAX_TOTAL_BYTES) throw new Error('storage cap reached (200 MB)');
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_FILE_BYTES) throw new Error(`size ${buf.length}`);
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const id = await new Promise((resolve, reject) => {
      const up = bucket().openUploadStream(filename, { contentType, metadata: meta });
      up.on('error', reject);
      up.on('finish', () => resolve(up.id));
      up.end(buf);
    });
    usage.bytes += buf.length;
    return { fileId: id, contentType, bytes: buf.length };
  } catch (err) {
    console.warn('⚠️ [Shared] Could not keep a file:', err.message);
    return null;
  }
}

/** Streams a stored file (only to its owner). */
function openFile(fileId) {
  return bucket().openDownloadStream(new mongoose.Types.ObjectId(String(fileId)));
}

async function judge(text, name) {
  try {
    const azureOpenAI = require('./azureOpenAI');
    const { TOP_MODEL } = require('./models');
    const out = await azureOpenAI.jsonWithFallback(TOP_MODEL, [
      { role: 'system', content: `You sort Instagram DMs for their owner. Decide if this message from ${name || 'a contact'} needs the owner personally: an invite or challenge (game, call, meet, party, trip), a plan with a time, a request for something only the owner can give or decide, money, or something urgent. Small talk, jokes, reactions and memes do not.
Return JSON only: {"needsYou": true|false, "category": "invite"|"request"|"money"|"urgent"|"plan"|"info", "summary": "<one short line for the owner, e.g. 'Arun wants to play chess now (lichess link)'>"}` },
      { role: 'user', content: String(text || '').slice(0, 1500) },
    ]);
    return {
      needsYou: !!out?.needsYou,
      category: ['invite', 'request', 'money', 'urgent', 'plan', 'info'].includes(out?.category) ? out.category : 'info',
      summary: String(out?.summary || '').slice(0, 200),
    };
  } catch (err) {
    console.warn('⚠️ [Shared] Importance check failed:', err.message);
    return null;
  }
}

async function emailOwner(ownerId, senderId, name, item) {
  if (!ownerId) return;
  const recent = await SharedItem.exists({ ownerId, senderId, emailedAt: { $gte: new Date(Date.now() - EMAIL_GAP_MS) } });
  if (recent) return;
  const owner = await User.findById(ownerId, { email: 1, firstName: 1 }).lean();
  if (!owner?.email) return;
  const app = process.env.FRONTEND_URL || 'https://instagram-ebon-zeta.vercel.app';
  const link = `${app}/relationships?person=${encodeURIComponent(senderId)}`;
  const esc = s => String(s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const subject = `${name || 'Someone'} needs you: ${item.summary || item.category}`;
  const text = `${item.summary}\n\nThey wrote: "${item.text}"\n\nThe AI did not say yes for you. Open the chat: ${link}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px">
    <p style="margin:0 0 6px;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:.08em">${esc(item.category)}</p>
    <h2 style="margin:0 0 12px;font-size:20px">${esc(item.summary)}</h2>
    <p style="margin:0 0 16px;padding:12px 14px;background:#f4f4f5;border-radius:10px">"${esc(item.text)}"</p>
    <p style="margin:0 0 20px;color:#52525b;font-size:14px">The AI didn't agree to anything for you.</p>
    <a href="${link}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#111;color:#fff;text-decoration:none">Open ${esc(name || 'chat')}</a></div>`;
  try {
    const authService = require('./authService');
    await authService.deliverEmail(owner.email, subject, text, html);
    await SharedItem.updateOne({ _id: item._id }, { $set: { emailedAt: new Date() } });
  } catch (err) {
    console.warn('⚠️ [Shared] Could not email the owner:', err.message);
  }
}

/**
 * Called for every incoming DM (fire and forget). Returns { needsYou, category, summary } when the
 * message needs the owner, so the reply can avoid committing on their behalf.
 */
async function capture({ ownerId = null, senderId, name = '', text = '', attachments = [], mid = '' }) {
  if (!senderId || /^test_/.test(String(senderId))) return null;
  const clean = String(text || '').replace(/\[(Sent a|Shared an|Voice message)[^\]]*\]/g, '').trim();
  try {
    for (const [i, att] of (attachments || []).entries()) {
      const kind = kindOf(att.type, att.url);
      const doc = {
        ownerId, senderId, name, kind, text: clean.slice(0, 1000), url: att.url || '', mid,
        summary: att.description ? att.description.slice(0, 200) : (att.title || ''), description: att.description || '',
      };
      if (STORED_KINDS.has(kind) && att.url) {
        const ext = { photo: 'jpg', video: 'mp4', voice: 'm4a', file: 'bin' }[kind];
        Object.assign(doc, await storeFile(att.url, `${senderId}-${mid || Date.now()}-${i}.${ext}`, { ownerId: String(ownerId || ''), senderId }) || {});
      }
      await SharedItem.create(doc);
    }
    // Words right after a photo / video / file belong to it ("this is my cat", "rate my drawing")
    if (clean && !(attachments || []).length) {
      await SharedItem.updateOne(
        { ownerId, senderId, kind: { $in: ['photo', 'video', 'voice', 'file'] }, createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) } },
        { $push: { saidAfter: { $each: [clean.slice(0, 300)], $slice: -5 } } },
        { sort: { createdAt: -1 } },
      ).catch(() => {});
    }

    for (const url of extractLinks(clean)) {
      const seen = await SharedItem.exists({ ownerId, senderId, kind: 'link', url });
      if (!seen) await SharedItem.create({ ownerId, senderId, name, kind: 'link', url, text: clean.slice(0, 1000), mid });
    }
    if (!clean || !looksImportant(clean, { hasAttachment: (attachments || []).length > 0 })) return null;
    const verdict = await judge(clean, name);
    if (!verdict?.needsYou) return null;
    const item = await SharedItem.create({
      ownerId, senderId, name, kind: 'message', category: verdict.category, needsYou: true,
      summary: verdict.summary || clean.slice(0, 120), text: clean.slice(0, 1000), mid,
    });
    emailOwner(ownerId, senderId, name, item).catch(() => {});
    return verdict;
  } catch (err) {
    console.warn('⚠️ [Shared] Capture failed:', err.message);
    return null;
  }
}

/** Did this person just send something that needs the owner (invite, plan, request, money)? */
async function recentNeedsYou(ownerId, senderId, minutes = 15) {
  return SharedItem.exists({
    ownerId, senderId, needsYou: true, category: { $in: ['invite', 'plan', 'request', 'money'] },
    createdAt: { $gte: new Date(Date.now() - minutes * 60 * 1000) },
  });
}

/** Prompt lines about the photos, videos and links this person sent (newest first), for the reply. */
async function recentSharedForPrompt(ownerId, senderId, limit = 8) {
  const items = await SharedItem.find({ ownerId, senderId, kind: { $in: ['photo', 'video', 'voice', 'file', 'link', 'reel', 'post'] } })
    .sort({ createdAt: -1 }).limit(limit).lean();
  if (!items.length) return '';
  const day = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const lines = items.map(i => {
    const what = i.description || i.summary || (i.kind === 'link' ? i.url : '') || i.kind;
    const said = [i.text, ...(i.saidAfter || [])].filter(Boolean).join(' / ');
    return `- ${day(i.createdAt)} ${i.kind}: ${String(what).slice(0, 200)}${said ? ` (they said: "${said.slice(0, 200)}")` : ''}`;
  });
  return `THINGS ${'THEY'} SENT YOU (you saw these; bring one up naturally when it fits, e.g. "that leopard pic you sent"):\n${lines.join('\n')}`;
}

/** Describes saved photos/videos that have no description yet (older items). A few per run. */
async function backfillDescriptions(limit = 20) {
  const items = await SharedItem.find({ kind: { $in: ['photo', 'video'] }, fileId: { $ne: null }, description: { $in: ['', null] } })
    .sort({ createdAt: -1 }).limit(limit);
  const { describeBuffer } = require('./mediaService');
  let done = 0;
  for (const item of items) {
    try {
      const chunks = [];
      await new Promise((resolve, reject) => openFile(item.fileId).on('data', c => chunks.push(c)).on('end', resolve).on('error', reject));
      const description = await describeBuffer(Buffer.concat(chunks), item.contentType, item.kind);
      if (!description) continue;
      item.description = description;
      if (!item.summary) item.summary = description.slice(0, 200);
      await item.save();
      done++;
    } catch (err) {
      console.warn('⚠️ [Shared] Catch-up description failed:', err.message);
    }
  }
  if (done) console.log(`🖼️ [Shared] Described ${done} saved photo(s)/video(s)`);
  return done;
}

module.exports = { capture, openFile, storeFile, recentNeedsYou, recentSharedForPrompt, backfillDescriptions };
