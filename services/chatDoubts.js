/**
 * Doubts the AI has about a person (the "Needs your review" questions) can be asked to the person
 * themselves while chatting, casually and one at a time. When their next messages answer it, the
 * doubt is closed with their answer and the memory document is rewritten. Questions only the owner
 * can answer stay on the review list.
 */
const PersonMemory = require('../models/PersonMemory');

const HOUR = 3600 * 1000;
const PERSON_GAP = 12 * HOUR; // at most one such question per person every 12 hours
const RETRY_GAP = 7 * 24 * HOUR; // the same question is not asked again for a week
const MAX_TRIES = 2;
const ANSWER_WINDOW = 48 * HOUR;

/** One open doubt to maybe ask them now, or null. */
async function pick(ownerId, senderId) {
  if (!senderId || /^test_/.test(String(senderId))) return null;
  const pm = await PersonMemory.findOne({ ownerId: ownerId || null, senderId: String(senderId) }, { doubts: 1 }).lean();
  const open = (pm?.doubts || []).filter(d => d.status === 'open');
  const now = Date.now();
  if (open.some(d => d.askedInChatAt && now - new Date(d.askedInChatAt).getTime() < PERSON_GAP)) return null;
  const d = open.find(x => x.askableInChat !== false && (x.chatTries || 0) < MAX_TRIES
    && (!x.askedInChatAt || now - new Date(x.askedInChatAt).getTime() > RETRY_GAP));
  return d ? { id: String(d._id), question: d.question } : null;
}

async function markAsked(ownerId, senderId, doubtId) {
  await PersonMemory.updateOne({ ownerId: ownerId || null, senderId: String(senderId), 'doubts._id': doubtId },
    { $set: { 'doubts.$.askedInChatAt': new Date() }, $inc: { 'doubts.$.chatTries': 1 } }).catch(() => {});
}

/** Their new message: does it answer a doubt we asked them recently? Closes it with their answer. */
async function checkAnswer(ownerId, senderId, name, text) {
  if (!text || !senderId) return null;
  const pm = await PersonMemory.findOne({ ownerId: ownerId || null, senderId: String(senderId) });
  const now = Date.now();
  const asked = (pm?.doubts || []).filter(d => d.status === 'open' && d.askedInChatAt && now - new Date(d.askedInChatAt).getTime() < ANSWER_WINDOW);
  if (!asked.length) return null;
  const azureOpenAI = require('./azureOpenAI');
  const out = await azureOpenAI.jsonWithFallback(process.env.FAST_MODEL || 'gpt-5.4-mini', [
    { role: 'system', content: `The owner's AI asked ${name || 'a contact'} these questions in a DM. Decide if their new message answers any of them.
Questions:
${asked.map((d, i) => `${i}. ${d.question}`).join('\n')}
Return JSON only: {"answers": [{"index": n, "answer": "<what they said, short, third person, e.g. 'Yes, she got a new phone'>"}]} (empty list if none is answered).` },
    { role: 'user', content: String(text).slice(0, 1200) },
  ]).catch(() => null);
  const found = (Array.isArray(out?.answers) ? out.answers : []).filter(a => asked[a?.index] && a.answer);
  if (!found.length) return null;
  for (const a of found) {
    const d = asked[a.index];
    d.status = 'answered';
    d.answer = `${String(a.answer).slice(0, 300)} (they told me in chat)`;
    pm.ownerFacts.push({ text: `${d.question} -> ${String(a.answer).slice(0, 300)} (${name || 'they'} said in chat)` });
  }
  Object.assign(pm, { rebuildDoc: true, dirty: true });
  await pm.save();
  console.log(`💬 [Doubts] ${name || senderId} answered ${found.length} question(s) in chat`);
  return found.length;
}

module.exports = { pick, markAsked, checkAnswer };
