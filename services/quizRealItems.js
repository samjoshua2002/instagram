/**
 * Quiz questions from your real chats: each section is one of your people (top priority first),
 * with messages they really sent you, the two messages before it for context, and what you
 * really replied back then (hand-typed only, never the AI's). A last section uses first messages
 * from people you barely know. Messages used in earlier quizzes are not asked again.
 *
 * Only messages that mean something on their own are kept (the AI picks them from more candidates,
 * so no "Pakistani Christian" out of context), and the AI adds questions of its own: messages that
 * person could really send you now, written from what it knows about them. A "How you check in"
 * section asks how you'd text each person first after a quiet spell; those answers teach check-ins.
 */
const Message = require('../models/Message');

const PER_PERSON = 6;
const REAL_PER_PERSON = 4;    // the rest of each section is written by the AI
const CANDIDATES = 14;
const MAX_PEOPLE = 8;
const CHECKIN_PEOPLE = 6;
const REFINE_TIMEOUT_MS = 8000;
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

// Without the AI: questions and longer messages first (they invite a real reply)
const QWORD = /^(what|why|how|when|where|who|which|can|could|will|would|do|did|are|is|r u|wanna|shall|should)\b/i;
function heuristicScore(text) {
  const t = String(text || '').trim();
  return (/\?/.test(t) ? 3 : 0) + (QWORD.test(t) ? 2 : 0) + Math.min(3, Math.floor(t.split(/\s+/).length / 3));
}
function bestByHeuristic(cands, n) {
  return cands.map((c, i) => ({ c, i, s: heuristicScore(c.text) })).sort((a, b) => b.s - a.s).slice(0, n)
    .sort((a, b) => a.i - b.i).map(x => x.c);
}

/**
 * The AI keeps the real messages that make sense on their own and invite a real reply, and writes
 * two more this person could really send now. Falls back to the heuristic if the AI is unavailable.
 */
async function refineForPerson(ownerId, person, cands) {
  let memoryDoc = '';
  try {
    memoryDoc = (await require('../models/PersonMemory').findOne({ ownerId, senderId: person.senderId }, { doc: 1 }).lean())?.doc || '';
  } catch { /* memory is optional */ }
  try {
    const azureOpenAI = require('./azureOpenAI');
    const FAST = process.env.FAST_MODEL || 'gpt-5.4-mini';
    const list = cands.map((c, i) => `${i}. ${c.before?.length ? `[before: ${c.before.map(b => `${b.who}: ${b.text}`).join(' / ')}] ` : ''}${person.name}: ${c.text}`).join('\n');
    const out = await azureOpenAI.jsonWithFallback(FAST, [
      { role: 'system', content: `You build a texting quiz: the owner answers DMs from ${person.name} the way they really would, so the AI learns their style.
1) From the numbered real messages, pick up to ${REAL_PER_PERSON} that make sense ON THEIR OWN (with their "before" lines) and invite a real, personal reply: questions, plans, news, feelings, teasing, requests. Never pick fragments, one-word answers, or replies that only make sense mid-conversation (like "Pakistani Christian" or "yes that one").
2) Write ${PER_PERSON - REAL_PER_PERSON} NEW messages ${person.name} could realistically send the owner today, in ${person.name}'s own style (copy their language, slang, casing, emoji from the real messages), based on real things from their life below. Each must stand alone and need a personal answer. Never generic ("how are you").
JSON only: {"keep": [indexes], "write": ["...", "..."]}` },
      { role: 'user', content: `${memoryDoc ? `WHAT THE AI KNOWS ABOUT ${person.name}:\n${String(memoryDoc).slice(0, 2500)}\n\n` : ''}REAL MESSAGES:\n${list}` },
    ]);
    const keep = [...new Set((Array.isArray(out?.keep) ? out.keep : []).map(Number).filter(i => Number.isInteger(i) && cands[i]))].slice(0, REAL_PER_PERSON);
    const write = (Array.isArray(out?.write) ? out.write : []).map(t => String(t || '').trim()).filter(t => askable(t)).slice(0, PER_PERSON - REAL_PER_PERSON);
    const real = keep.length ? keep.sort((a, b) => a - b).map(i => cands[i]) : bestByHeuristic(cands, REAL_PER_PERSON);
    return [...real, ...write.map(text => ({ text, realReply: '', before: [], aiWritten: true }))];
  } catch (err) {
    console.warn(`⚠️ [Quiz] AI could not pick for ${person.name}:`, err.message);
    return bestByHeuristic(cands, PER_PERSON);
  }
}

/** Who the "How you check in" section asks about: your check-in people, else your top people. */
async function checkInPeople(ownerId, people) {
  const cfg = await require('../models/PersonaConfig').findOne({ ownerId }, { checkInWho: 1, checkInPeople: 1 }).lean().catch(() => null);
  const ranked = [...people.filter(p => p.priority === 'top'), ...people.filter(p => p.priority === 'normal')];
  if (cfg?.checkInWho === 'selected' && cfg.checkInPeople?.length) {
    const ids = new Set(cfg.checkInPeople.map(String));
    return ranked.filter(p => ids.has(p.senderId)).slice(0, CHECKIN_PEOPLE);
  }
  return ranked.slice(0, CHECKIN_PEOPLE);
}

/** The question list for a new quiz. */
async function buildItems(ownerId, people, used = new Set()) {
  const items = [];
  const byTier = t => people.filter(p => p.priority === t);
  const chosen = [...byTier('top'), ...byTier('normal')].slice(0, MAX_PEOPLE);
  const stamp = Date.now().toString(36);
  // Every person at once (each is one small AI call), kept in rank order
  // Each person's AI step is capped at 8 s so the quiz never takes long to open; then the quick pick
  const capped = (p, cands) => Promise.race([
    refineForPerson(ownerId, p, cands),
    new Promise(resolve => { const t = setTimeout(() => resolve(bestByHeuristic(cands, PER_PERSON)), REFINE_TIMEOUT_MS); t.unref?.(); }),
  ]);
  const sections = await Promise.all(chosen.map(async p => {
    const cands = pickFromConversation(await conversation(ownerId, p.senderId), CANDIDATES, used);
    if (!cands.length) return [];
    return capped(p, cands);
  }));
  chosen.forEach((p, k) => sections[k].forEach((c, i) => items.push({
    id: `${p.senderId}-${stamp}-${i}`, round: `p-${p.senderId}`, roundTitle: p.name,
    from: p.priority === 'top' ? 'close' : 'friend', personId: p.senderId, personName: p.name, profilePic: p.profilePic || '', ...c,
  })));

  // How you check in: you text them first after a quiet spell; your last real opener is shown after
  const { openersWith } = require('./checkInVoice');
  const ciPeople = await checkInPeople(ownerId, people);
  const ciOpeners = await Promise.all(ciPeople.map(p => openersWith(ownerId, p.senderId, 1).catch(() => [])));
  for (const [i, p] of ciPeople.entries()) {
    const real = ciOpeners[i];
    items.push({
      id: `checkin-${p.senderId}-${stamp}-${i}`, round: 'checkin', roundTitle: 'How you check in', kind: 'checkin',
      from: p.priority === 'top' ? 'close' : 'friend', personId: p.senderId, personName: p.name, profilePic: p.profilePic || '',
      text: `Your chat with ${p.name} has gone quiet. Text them first, the way you usually do.`, realReply: real[0] || '', before: [],
    });
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
  return items.slice(0, MAX_ITEMS + CHECKIN_PEOPLE).map((it, i, all) => ({ ...it, roundIndex: [...new Set(all.map(x => x.round))].indexOf(it.round) }));
}

module.exports = { buildItems, pickFromConversation, askable, heuristicScore, bestByHeuristic };
