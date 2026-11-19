/**
 * How fast the owner really answers, learned from their own chats, so the AI waits the same way.
 *
 * From each chat's timestamps: when the other person texted and the owner (typing, not the AI)
 * answered within 15 minutes, that wait is one sample. Longer gaps are the owner being away, not their
 * texting pace, and are left out. A reply waits a delay drawn from these samples (with this person if
 * there are enough, else across all the owner's chats), minus the time the AI needs to write. Slow
 * waits let several messages pile up and get answered together, the way the owner does. Learned per
 * account and refreshed every 6 hours; nothing about any one owner is written in code.
 */
const ACTIVE_GAP_S = 15 * 60;     // a reply within 15 min is "while chatting"; longer is "was away"
const MIN_PERSON = 20;            // samples needed to use this person's own pace
const MIN_OVERALL = 30;           // samples needed to use the owner's overall pace
const WRITE_MS = 6000;            // the AI writing + typing already takes about this long
const MAX_HOLD_MS = 45 * 1000;    // never hold longer than this, whatever the history says
const TYPICAL = 0.75;             // your typical pace: the slowest quarter of your replies is left out
const CACHE_MS = 6 * 3600 * 1000;
const cache = new Map();

/**
 * Pure: reply delays in seconds from messages (oldest first, any number of chats mixed is fine as
 * long as `chatOf` tells them apart). A sample starts at the first of their waiting messages and ends
 * at the owner's typed reply; an AI reply in between ends the wait without a sample.
 */
function delaySamples(msgs, chatOf = () => 'one') {
  const waiting = new Map();
  const out = [];
  for (const m of msgs || []) {
    if (!m || m.isCheckIn || m.isReminder) continue;
    const chat = chatOf(m);
    const at = new Date(m.timestamp || m.createdAt || 0).getTime();
    if (m.role === 'user') {
      if (!waiting.has(chat)) waiting.set(chat, at);
      continue;
    }
    const since = waiting.get(chat);
    waiting.delete(chat);
    if (since == null || m.sentByAI) continue;
    const s = (at - since) / 1000;
    if (s >= 0 && s <= ACTIVE_GAP_S) out.push(s);
  }
  return out;
}

/** Pure: the p-quantile of sorted numbers (nearest rank: the value at or below which p of them fall). */
const quantile = (sorted, p) => (sorted.length ? sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] : 0);

/**
 * Pure: how long to hold a reply, drawn from real delays. Only the typical pace is copied: the slowest
 * quarter is left out (and nothing over 45 s), so slow moments in the history never make it feel broken.
 * @returns {number|null} ms, or null when there are too few samples to know
 */
function pickHoldMs(samples, { random = Math.random, min = MIN_OVERALL } = {}) {
  if (!samples || samples.length < min) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const cap = Math.min(quantile(sorted, TYPICAL) * 1000, MAX_HOLD_MS);
  const s = sorted[Math.floor(random() * sorted.length)] * 1000;
  return Math.round(Math.max(0, Math.min(s, cap) - WRITE_MS));
}

/** Pure: a short summary for the Voice Check page. */
function summarize(samples) {
  if (!samples || !samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const share = f => Math.round(100 * sorted.filter(f).length / sorted.length);
  return { replies: sorted.length, medianSeconds: Math.round(quantile(sorted, 0.5)), within10s: share(s => s <= 10), withinMinute: share(s => s <= 60) };
}

// The promise is cached right away, so messages arriving during the first lookup share it and
// continue in the order they arrived (a burst reaches the reply queue in order)
function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

const FIELDS = 'role sentByAI isCheckIn isReminder senderId recipientId timestamp';
const contactOf = m => String(m.role === 'assistant' ? m.recipientId : m.senderId);

/** The owner's reply delays across all their chats (cached 6 h). */
function overallSamples(ownerId) {
  return cached(`all:${ownerId || 'legacy'}`, async () => {
    const Message = require('../models/Message');
    const docs = await Message.find({ ownerId: ownerId || null }).sort({ timestamp: -1 }).limit(30000).select(FIELDS).lean();
    return delaySamples(docs.reverse().filter(m => !/^test_/.test(contactOf(m))), contactOf);
  });
}

/** The owner's reply delays with one person (cached 6 h). */
function personSamples(ownerId, senderId) {
  return cached(`one:${ownerId || 'legacy'}:${senderId}`, async () => {
    const Message = require('../models/Message');
    const id = String(senderId);
    const docs = await Message.find({ ownerId: ownerId || null, $or: [{ senderId: id }, { recipientId: id }] })
      .sort({ timestamp: -1 }).limit(5000).select(FIELDS).lean();
    return delaySamples(docs.reverse());
  });
}

/**
 * How long to hold this reply, in ms: this person's pace if known, else the owner's overall pace,
 * else null (the caller then uses its default). Never throws.
 */
async function holdMs(ownerId, senderId, { random = Math.random } = {}) {
  try {
    if (/^test_/.test(String(senderId))) return null;
    const mine = await personSamples(ownerId, senderId);
    const fromPerson = pickHoldMs(mine, { random, min: MIN_PERSON });
    if (fromPerson != null) return fromPerson;
    return pickHoldMs(await overallSamples(ownerId), { random, min: MIN_OVERALL });
  } catch {
    return null;
  }
}

/** The owner's pace for the Voice Check page (null when there's nothing yet). */
async function paceFor(ownerId) {
  try {
    return summarize(await overallSamples(ownerId));
  } catch {
    return null;
  }
}

module.exports = { delaySamples, pickHoldMs, summarize, holdMs, paceFor, MAX_HOLD_MS, WRITE_MS, _cache: cache };
