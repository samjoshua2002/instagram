/**
 * How the owner really starts a chat: their own hand-typed messages that opened a conversation
 * after a quiet gap ("hola shorty", "hi how are you", "heyy machaa"), per person and across their
 * people, read from this account's own messages. Check-ins copy these so they sound like the owner,
 * not a bot. Works for every account: nothing here is about one user.
 */
const Message = require('../models/Message');

const GAP_HOURS = 6;            // a message after this much silence starts a new conversation
const FOLLOW_MS = 3 * 60 * 1000; // the owner's next lines within 3 minutes belong to the same opener

const ownerTyped = m => m && m.role === 'assistant' && !m.sentByAI && !m.isCheckIn && !m.isReminder;
const usable = t => {
  const s = String(t || '').trim();
  return s.length > 0 && s.length <= 160 && !/https?:\/\/|www\.|^\[|attachment|sent an?\s|reacted|shared a/i.test(s);
};
const at = m => new Date(m.timestamp || m.createdAt || 0).getTime();

/**
 * Pure: openers from one conversation (messages oldest first). An opener is the owner's own message
 * when the chat had been quiet for `gapHours` (or it is the first message), plus their next lines
 * sent right after it. Newest last.
 */
function pickOpeners(msgs, { gapHours = GAP_HOURS, limit = 8 } = {}) {
  const out = [];
  for (let i = 0; i < msgs.length; i += 1) {
    const m = msgs[i];
    if (!ownerTyped(m) || !usable(m.text)) continue;
    const prev = msgs[i - 1];
    if (prev && at(m) - at(prev) < gapHours * 3600 * 1000) continue;
    const lines = [String(m.text).trim()];
    for (let j = i + 1; j < msgs.length && lines.length < 3; j += 1) {
      const n = msgs[j];
      if (!ownerTyped(n) || at(n) - at(msgs[j - 1]) > FOLLOW_MS) break;
      if (usable(n.text)) lines.push(String(n.text).trim());
    }
    out.push(lines.join('\n'));
  }
  // Keep the newest, without repeats
  const seen = new Set();
  return out.reverse().filter(t => { const k = t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, limit).reverse();
}

async function conversation(ownerId, senderId, limit = 1500) {
  const docs = await Message.find({ ownerId: ownerId || null, $or: [{ senderId }, { recipientId: senderId }] })
    .sort({ timestamp: -1 }).limit(limit).select('role text sentByAI isCheckIn isReminder timestamp createdAt').lean();
  return docs.reverse();
}

/** The owner's real openers with this one person. */
async function openersWith(ownerId, senderId, limit = 8) {
  return pickOpeners(await conversation(ownerId, senderId), { limit });
}

// Openers across the owner's people change slowly: kept for 6 hours per account
const acrossCache = new Map();
/** The owner's real openers with their most recent other people (their general way of starting). */
async function openersAcross(ownerId, exceptId = '', limit = 10) {
  const key = String(ownerId || 'legacy');
  const hit = acrossCache.get(key);
  let list = hit && Date.now() - hit.at < 6 * 3600 * 1000 ? hit.list : null;
  if (!list) {
    const recent = await Message.aggregate([
      { $match: { ownerId: ownerId || null, role: 'assistant', sentByAI: { $ne: true } } },
      { $sort: { timestamp: -1 } },
      { $limit: 4000 },
      { $group: { _id: '$recipientId', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 8 },
    ]).catch(() => []);
    list = [];
    for (const r of recent) {
      if (!r._id || r._id === 'me' || /^test_/.test(String(r._id))) continue;
      for (const text of await openersWith(ownerId, r._id, 3)) list.push({ senderId: String(r._id), text });
    }
    acrossCache.set(key, { at: Date.now(), list });
  }
  return list.filter(x => x.senderId !== String(exceptId)).slice(-limit).map(x => x.text);
}

/**
 * Pure: what a check-in should say. A friend who texts first follows up on something real ("did u
 * finish the drawing?") before falling back to a plain greeting; the owner's openers decide only
 * HOW it is written (words, casing, language, length), not that it must be a bare "wassup".
 */
function checkInGuide({ askHint = '' } = {}) {
  return `WHAT TO SAY (like a friend who remembers what you talked about):
1. First look for something to follow up on: something from your last chat that was left open (a thing they were about to do, were doing, worried about or planned, like an exam, a drawing, a trip, an interview, a match), or something going on in their life from what you know below. If there is one, the message is about THAT: ask how it went or how it's going, the way you would ("did u finish the drawing?", "how was the exam da").
2. Only if there is nothing worth following up, open the way your openers do${askHint ? `, and if it fits ask one small casual thing (a good one: ${askHint})` : ''}.
- Follow up only on things that are really in the chat or in what you know. Never invent an event.
- Don't answer an old message as if they just sent it: follow up on it as something from before ("how did it go", not "all the best").
- Ask it like you would, never like a survey or an interview. One question at most.

HOW TO WRITE IT: exactly like your openers above. Same greeting words, same nickname for them, same casing, spelling, language, emoji (or none) and length. If your openers are short, yours is short too. No long friendly paragraph.
- Never sound like a customer-service bot or a therapist: no "just checking in", "hope you're doing well", "how have you been holding up", "I was thinking about you".
- Never needy or guilt-tripping, never "why didn't you reply".`;
}

module.exports = { pickOpeners, openersWith, openersAcross, checkInGuide, GAP_HOURS };
