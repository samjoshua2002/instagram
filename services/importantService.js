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
const UserMemory = require('../models/UserMemory');
const { extractLinks, kindOf, isTrivial, validDue } = require('./importantRules');

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
    return await storeBuffer(buf, filename, contentType, meta);
  } catch (err) {
    console.warn('⚠️ [Shared] Could not keep a file:', err.message);
    return null;
  }
}

/** Saves bytes we already have into GridFS. Returns { fileId, contentType, bytes }; throws on failure. */
async function storeBuffer(buf, filename, contentType, meta) {
  if (await storedBytes() >= MAX_TOTAL_BYTES) throw new Error('storage cap reached (200 MB)');
  const id = await new Promise((resolve, reject) => {
    const up = bucket().openUploadStream(filename, { contentType, metadata: meta });
    up.on('error', reject);
    up.on('finish', () => resolve(up.id));
    up.end(buf);
  });
  usage.bytes += buf.length;
  return { fileId: id, contentType, bytes: buf.length };
}

/** The page title of a link (og:title, then <title>), or ''. Small and quick: 5 s, first 300 KB. */
async function linkTitle(url) {
  try {
    const res = await fetch(/^https?:/i.test(url) ? url : `https://${url}`, {
      redirect: 'follow', signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (link preview)', Accept: 'text/html' },
    });
    if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') || '')) return '';
    const html = (await res.text()).slice(0, 300000);
    const pick = re => (html.match(re) || [])[1] || '';
    const raw = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
      || pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
      || pick(/<title[^>]*>([^<]+)<\/title>/i);
    return raw.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, 160);
  } catch {
    return '';
  }
}

/** Streams a stored file (only to its owner). */
function openFile(fileId) {
  return bucket().openDownloadStream(new mongoose.Types.ObjectId(String(fileId)));
}

async function judge(text, name) {
  try {
    const azureOpenAI = require('./azureOpenAI');
    const model = process.env.FAST_MODEL || 'gpt-5.4-mini';
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const out = await azureOpenAI.jsonWithFallback(model, [
      { role: 'system', content: `You read Instagram DMs sent to the owner and catch what matters. Now: ${now} India time (+05:30).
1) needsYou: true if the message needs the owner personally: an invite or challenge (game, call, meet, party, trip, "can we play chess now"), a plan with a time, a question or request only the owner can answer or decide, money, a deadline, something urgent or emotional (bad news, they need help). false for small talk, jokes, reactions, memes, greetings.
3) away: if they say they are leaving or getting busy ("gtg", "going to study", "going out", "sleeping", "brb", "in class"), give the reason in 1-3 words and when they'll be back if they said (ISO, India time) else null. back: true if they say they're back / free now.
2) reminders: EVERY reminder in the message, as a list (one message can hold several: "remind me at 5 to call mom and at 8 to study" -> two). A reminder is when they ask to be reminded or pinged ("remind me at 5", "ping me tomorrow morning", "tell me in 20 mins", "every day at 7" -> just the next one), or ask the owner to remember to do something at a time ("remind sam to send notes tonight"). Work out each exact date-time in India time. forWhom "them" when the reminder goes to them, "owner" when the owner must do it. Cancel: if they say a reminder is not needed any more, add {"cancel": "<what>"}.
Return JSON only: {"needsYou": bool, "category": "invite"|"request"|"money"|"urgent"|"plan"|"info", "summary": "<one short line for the owner, e.g. 'Fami wants to play chess now (chess.com link)'>", "reminders": [{"dueAt": "<ISO 8601 with +05:30>", "what": "<what to remind, short>", "forWhom": "them"|"owner"} or {"cancel": "<what>"}], "away": null or {"reason": "<1-3 words>", "until": "<ISO or null>"}, "back": bool}` },
      { role: 'user', content: `From ${name || 'a contact'}: ${String(text || '').slice(0, 1500)}` },
    ]);
    const list = Array.isArray(out?.reminders) ? out.reminders : (out?.reminder ? [out.reminder] : []);
    const away = out?.away && out.away.reason ? { reason: String(out.away.reason).slice(0, 40), until: out.away.until || null } : null;
    return {
      away,
      back: !!out?.back,
      needsYou: !!out?.needsYou,
      category: ['invite', 'request', 'money', 'urgent', 'plan', 'info'].includes(out?.category) ? out.category : 'info',
      summary: String(out?.summary || '').slice(0, 200),
      reminders: list.slice(0, 10).map(r => (r && r.cancel
        ? { cancel: String(r.cancel).slice(0, 200) }
        : r && r.dueAt && r.what ? { dueAt: r.dueAt, what: String(r.what).slice(0, 200), forWhom: r.forWhom === 'owner' ? 'owner' : 'them' } : null)).filter(Boolean),
    };
  } catch (err) {
    console.warn('⚠️ [Shared] Importance check failed:', err.message);
    return null;
  }
}

async function emailOwner(ownerId, senderId, name, item) {
  if (!ownerId) return;
  // Your ranking: no emails for people you marked not important; top people skip the 5-minute gap
  const SocialGraph = require('../models/SocialGraph');
  const node = await SocialGraph.findOne({ ownerId, senderId: String(senderId) }, { priority: 1 }).lean().catch(() => null);
  if (node?.priority === 'low') return;
  const recent = node?.priority !== 'top' && await SharedItem.exists({ ownerId, senderId, emailedAt: { $gte: new Date(Date.now() - EMAIL_GAP_MS) } });
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
      // A sticker / meme / reaction GIF they sent may be worth reusing: offered to the vault (pending)
      if (kind === 'photo' && doc.fileId && doc.description) {
        require('./chatMediaVault').consider({
          ownerId, senderId, name, fileId: doc.fileId, contentType: doc.contentType || '', description: doc.description,
        }).catch(() => {});
      }
    }
    // Words right after a photo / video / file belong to it ("this is my cat", "rate my drawing")
    if (clean && !(attachments || []).length) {
      await SharedItem.updateOne(
        { ownerId, senderId, kind: { $in: ['photo', 'video', 'voice', 'file'] }, createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) } },
        { $push: { saidAfter: { $each: [clean.slice(0, 300)], $slice: -5 } } },
        { sort: { createdAt: -1 } },
      ).catch(() => {});
    }

    // Reels and posts (Instagram links) are their own kind, not "links"; the attachment above already
    // saved a shared reel, so a reel URL in the same message is not saved twice
    const attachedUrls = new Set((attachments || []).map(a => a.url));
    for (const url of extractLinks(clean)) {
      if (attachedUrls.has(url)) continue;
      const kind = /instagram\.com\/(reels?|p|tv)\//i.test(url) ? (/\/p\//i.test(url) ? 'post' : 'reel') : 'link';
      const seen = await SharedItem.exists({ ownerId, senderId, kind, url });
      if (!seen) {
        const summary = kind === 'link' ? await linkTitle(url) : '';
        await SharedItem.create({ ownerId, senderId, name, kind, url, summary, text: clean.slice(0, 1000), mid });
      }
    }
    // Every real message is checked (a laugh or an emoji is not); links/files always are
    const hasAttachment = (attachments || []).length > 0;
    if (!clean || (isTrivial(clean) && !hasAttachment)) return null;
    const verdict = await judge(clean, name);
    // Busy / back: check-ins wait while they're away; the reply knows they said they'd be busy
    if (verdict?.away) {
      const until = validDue(verdict.away.until) || null;
      await UserMemory.updateOne({ ownerId, senderId }, { $set: { away: { reason: verdict.away.reason, since: new Date(), until, endedAt: null } } }).catch(() => {});
    } else if (verdict?.back) {
      await UserMemory.updateOne({ ownerId, senderId, 'away.since': { $ne: null }, 'away.endedAt': null }, { $set: { 'away.endedAt': new Date() } }).catch(() => {});
    }
    if (verdict?.reminders?.length) {
      const Reminder = require('../models/Reminder');
      for (const r of verdict.reminders) {
        if (r.cancel) {
          // "no need to remind me" -> cancel their pending reminder that matches best (by words)
          const pending = await Reminder.find({ ownerId, senderId, status: 'pending' }).lean();
          const words = new Set(String(r.cancel).toLowerCase().split(/\W+/).filter(w => w.length > 2));
          const best = pending.map(p => ({ p, n: String(p.what).toLowerCase().split(/\W+/).filter(w => words.has(w)).length }))
            .sort((a, b) => b.n - a.n)[0];
          if (best && (best.n > 0 || pending.length === 1)) {
            await Reminder.updateOne({ _id: best.p._id }, { $set: { status: 'cancelled', note: 'they said no need' } });
            console.log(`⏰ [Reminder] Cancelled for ${name || senderId}: ${best.p.what}`);
          }
          continue;
        }
        const dueAt = validDue(r.dueAt);
        if (!dueAt) continue;
        // The same reminder said twice (they repeat themselves) is kept once
        const dup = await Reminder.exists({ ownerId, senderId, status: 'pending', what: r.what, dueAt: { $gte: new Date(dueAt - 5 * 60000), $lte: new Date(+dueAt + 5 * 60000) } });
        if (dup) continue;
        await Reminder.create({ ownerId, senderId, name, what: r.what, forWhom: r.forWhom, dueAt, sourceText: clean.slice(0, 500) });
        console.log(`⏰ [Reminder] Set for ${name || senderId} at ${dueAt.toISOString()}: ${r.what}`);
      }
    }
    if (!verdict?.needsYou) return verdict;
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
  // Links saved before titles were fetched
  const links = await SharedItem.find({ kind: 'link', summary: { $in: ['', null] } }).sort({ createdAt: -1 }).limit(limit);
  for (const l of links) {
    const title = await linkTitle(l.url);
    if (title) { l.summary = title; await l.save().catch(() => {}); done++; }
  }
  if (done) console.log(`🖼️ [Shared] Described ${done} saved item(s)`);
  return done;
}

module.exports = { capture, openFile, storeFile, storeBuffer, recentNeedsYou, recentSharedForPrompt, backfillDescriptions };
