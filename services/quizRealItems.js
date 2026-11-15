/**
 * Quiz questions from your real chats: each section is one of your people (top priority first),
 * with messages they really sent you, the two messages before it for context, and what you
 * really replied back then (hand-typed only, never the AI's). A last section uses first messages
 * from people you barely know. Messages used in earlier quizzes are not asked again.
 */
const Message = require('../models/Message');

const PER_PERSON = 6;
const MAX_PEOPLE = 9;
const MAX_ITEMS = 60;

// A message worth asking: real words, not a link, attachment, reaction or one emoji
function askable(text) {
  const t = String(text || '').trim();
  if (t.length < 3 || t.length > 220) return false;
  if (/https?:\/\/|www\.|^\[|attachment|sent an?\s|reacted|shared a|liked a message|^\W+$/i.test(t)) return false;
  return /\p{L}{2,}/u.test(t);
}
// A question needs something to answer: two or more words ("hru" alone is too thin, "how was ur day" is fine)
const meaty = t => askable(t) && String(t).trim().length >= 6 && String(t).trim().split(/\s+/).length >= 2;
const realOwner = m => m.role === 'assistant' && !m.sentByAI && !m.isCheckIn && !m.isReminder && askable(m.text);

/** Pure: picks up to `n` questions from one conversation (messages oldest first). */
function pickFromConversation(msgs, n = PER_PERSON, used = new Set()) {
  const cands = [];
  for (let i = 0; i < msgs.length; i += 1) {
    const m = msgs[i];
    if (m.role !== 'user' || !meaty(m.text) || used.has(m.text.trim().toLowerCase())) continue;
    // Only their last message before you answered (the one you were really replying to)
    if (msgs[i + 1]?.role === 'user') continue;
    const replies = [];
    for (let j = i + 1; j < msgs.length && msgs[j].role === 'assistant' && replies.length < 3; j += 1) {
      if (realOwner(msgs[j])) replies.push(msgs[j].text.trim());
    }
    if (!replies.length) continue;
    const before = msgs.slice(Math.max(0, i - 2), i).filter(x => askable(x.text))
      .map(x => ({ who: x.role === 'user' ? 'them' : 'you', text: x.text.trim().slice(0, 160) }));
    cands.push({ text: m.text.trim(), realReply: replies.join('\n').slice(0, 400), before, at: m.timestamp || m.createdAt });
  }
  // Spread over the whole history (old and new), not just the latest
  const out = [];
  const seen = new Set();
  const step = cands.length / n;
  for (let k = 0; k < n && k * step < cands.length; k += 1) {
    const c = cands[Math.min(cands.length - 1, Math.floor(k * step + Math.random() * step))];
    const key = c.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

async function conversation(ownerId, senderId, limit = 2000) {
  const docs = await Message.find({ ownerId, $or: [{ senderId }, { recipientId: senderId }] })
    .sort({ timestamp: -1 }).limit(limit).select('role text sentByAI isCheckIn isReminder timestamp createdAt').lean();
  return docs.reverse();
}

/** The question list for a new quiz. */
async function buildItems(ownerId, people, used = new Set()) {
  const items = [];
  const byTier = t => people.filter(p => p.priority === t);
  const chosen = [...byTier('top'), ...byTier('normal')].slice(0, MAX_PEOPLE);
  for (const p of chosen) {
    if (items.length >= MAX_ITEMS - PER_PERSON) break;
    const picked = pickFromConversation(await conversation(ownerId, p.senderId), PER_PERSON, used);
    picked.forEach((c, i) => items.push({
      id: `${p.senderId}-${Date.now().toString(36)}-${i}`, round: `p-${p.senderId}`, roundTitle: p.name,
      from: p.priority === 'top' ? 'close' : 'friend', personId: p.senderId, personName: p.name, profilePic: p.profilePic || '', ...c,
    }));
  }
  // Someone new: the first thing people you barely know said to you
  const strangers = byTier('low');
  const firsts = [];
  for (const p of strangers) {
    if (firsts.length >= PER_PERSON) break;
    const msgs = await conversation(ownerId, p.senderId, 60);
    const picked = pickFromConversation(msgs.slice(0, 20), 1, used);
    if (picked[0]) firsts.push({ ...picked[0], before: [], personId: p.senderId, personName: p.name, profilePic: p.profilePic || '' });
  }
  firsts.forEach((c, i) => items.push({ id: `new-${Date.now().toString(36)}-${i}`, round: 'new', roundTitle: 'Someone new', from: 'stranger', ...c }));
  return items.slice(0, MAX_ITEMS).map((it, i, all) => ({ ...it, roundIndex: [...new Set(all.map(x => x.round))].indexOf(it.round) }));
}

module.exports = { buildItems, pickFromConversation, askable };
