/**
 * The per-person memory index. For every contact:
 *  1. their real messages (yours and theirs, never the AI's) are grouped into chat "moments"
 *     (MemoryChunk) and word-indexed in MongoDB, so any old moment can be found again;
 *  2. a small model writes notes from each batch of new moments;
 *  3. the notes are folded into one organised, read-only memory document (PersonMemory.doc),
 *     with a brain score (how well the AI knows them) and the bond read from the chats.
 * Runs in the background, one person at a time, and again when new messages arrive.
 */
const Message = require('../models/Message');
const UserMemory = require('../models/UserMemory');
const SocialGraph = require('../models/SocialGraph');
const PersonMemory = require('../models/PersonMemory');
const MemoryChunk = require('../models/MemoryChunk');
const { buildChunks, batchChunks, brainScore, searchTerms, slotsFromDoc, wellFormed, SLOTS } = require('./memoryIndexRules');

const FAST = () => process.env.FAST_MODEL || 'gpt-5.4-mini';
// Bump when the memory-writing rules change: older memories are rebuilt automatically
const RULES_VERSION = 2;
const MAX_NOTES = 60;
const REINDEX_AFTER_MS = 15 * 60 * 1000;

const convo = (ownerId, senderId) => ({ ownerId: ownerId || null, $or: [{ senderId }, { recipientId: senderId }] });

async function ai() { return require('./azureOpenAI'); }

async function writeNotes(name, batch, ownerName) {
  try {
    return await writeNotesOnce(name, batch, ownerName);
  } catch (err) {
    // Swearing in real chats trips Azure's content filter: retry with the rude words masked
    const { isContentFilterError, maskForFilter } = require('./promptSafety');
    if (!isContentFilterError(err) && !/filter|content_filter/i.test(err.message)) throw err;
    return writeNotesOnce(name, maskForFilter(batch, 2), ownerName);
  }
}

async function writeNotesOnce(name, batch, ownerName) {
  const azureOpenAI = await ai();
  const text = await azureOpenAI.completeWithFallback(FAST(), [
    { role: 'system', content: `You read real Instagram chats between ${ownerName} ("me") and ${name} ("them"), with dates. Write short factual notes about ${name} and our friendship, ONLY from what is in the text (never guess):
- facts about them (age, city, study/work, family, pets, likes/dislikes) with the date you learned it
- people in their life and who they are to them
- events with dates (exams, trips, fights, birthdays, plans)
- how we talk (language, Tanglish, nicknames, inside jokes, tone, emoji)
- open threads (plans, promises, things to follow up)
Plain lines starting with "- ". Skip small talk.` },
    { role: 'user', content: batch },
  ], { maxTokens: 2500, temperature: 0.2 });
  return String(text || '').trim();
}

async function compressNotes(name, notes) {
  const azureOpenAI = await ai();
  const text = await azureOpenAI.completeWithFallback(FAST(), [
    { role: 'system', content: `Merge these notes about ${name} into one shorter list. Keep every distinct fact, date and name; drop repeats; newer facts win when they conflict. Plain lines starting with "- ".` },
    { role: 'user', content: notes.join('\n') },
  ], { maxTokens: 1800, temperature: 0.1 });
  return String(text || '').trim();
}

async function writeDoc({ name, ownerName, notes, card, totalMessages, ownerFacts = [], answered = [] }) {
  const azureOpenAI = await ai();
  const { TOP_MODEL } = require('./models');
  const out = await azureOpenAI.jsonWithFallback(TOP_MODEL, [
    { role: 'system', content: `You keep ${ownerName}'s memory of one person, ${name}, written ONLY from notes taken from their real chats, plus what ${ownerName} told you directly (which is always true and beats the notes). Never invent anything, never fill gaps with guesses.
- ${ownerName} is the owner (me): never list ${ownerName} under "People in their life".
- If something is unclear or the notes conflict (who someone is to them, a name, a date), do NOT write a guess: leave it out and add a short question for ${ownerName} to "doubts" instead (max 5, only real doubts, never one already answered below).
Write "doc" in Markdown with exactly these sections (leave a section out if nothing is known):
## Who they are
## Our bond
## How we talk
## People in their life
## Timeline
(dated bullet points, oldest first, e.g. "- 2026-03 Started college at ...")
## Interests and likes
## Inside jokes
## Open threads
(plans, promises, things to ask about next time)
Then rate how well each part is known: 0 nothing, 1 a little, 2 well, 3 very well, for: ${Object.keys(SLOTS).join(', ')}.
And judge the bond from the chats: "stranger", "acquaintance", "friend", "close", "family" or "partner", with one short reason.
Also give their gender only if the chats make it clear (how they talk about themselves, how others address them): "female", "male", or "unknown".
Return JSON only: {"doc": "...", "slots": {...}, "bond": "...", "bondReason": "...", "gender": "female"|"male"|"unknown", "doubts": [{"question": "...", "about": "<short topic>"}]}` },
    { role: 'user', content: `${ownerName}'s own labels for ${name}: ${card || 'none'}
Messages in our chat: ${totalMessages}
${ownerFacts.length ? `\nWHAT ${ownerName.toUpperCase()} TOLD YOU (always true):\n${ownerFacts.map(f => `- ${f}`).join('\n')}\n` : ''}${answered.length ? `\nQUESTIONS ALREADY ANSWERED OR DISMISSED (never ask again):\n${answered.map(a => `- ${a}`).join('\n')}\n` : ''}
NOTES FROM THE CHATS:\n${notes.join('\n\n')}` },
  ]);
  return out || null;
}

/** (Re)builds one person's memory. Only new messages are read; the document is rewritten from notes. */
async function indexOne(ownerId, senderId, { ownerName = 'me', force = false } = {}) {
  const mem = await PersonMemory.findOneAndUpdate(
    { ownerId: ownerId || null, senderId },
    { $setOnInsert: { ownerId: ownerId || null, senderId } },
    { upsert: true, returnDocument: 'after' },
  );
  if (force) {
    await MemoryChunk.deleteMany({ ownerId: ownerId || null, senderId });
    Object.assign(mem, { notes: [], lastIndexedMessageAt: null, indexedMessages: 0, chunkCount: 0 });
  }
  const [contact, card, totalMessages] = await Promise.all([
    UserMemory.findOne({ ownerId: ownerId || null, senderId }, { name: 1, username: 1 }).lean(),
    SocialGraph.findOne({ ownerId: ownerId || null, senderId }, { name: 1, relationshipToSam: 1, category: 1, personalNotes: 1, connections: 1 }).lean(),
    Message.countDocuments(convo(ownerId, senderId)),
  ]);
  const name = card?.name || contact?.name || contact?.username || 'them';
  mem.name = name;
  mem.status = 'indexing';
  mem.totalMessages = totalMessages;
  mem.error = '';
  await mem.save();

  try {
    const since = mem.lastIndexedMessageAt;
    const q = { ...convo(ownerId, senderId), ...(since ? { timestamp: { $gt: since } } : {}) };
    const messages = await Message.find(q).sort({ timestamp: 1 }).select('role text sentByAI timestamp createdAt').lean();
    const chunks = buildChunks(messages);
    if (chunks.length) {
      await MemoryChunk.insertMany(chunks.map(c => ({ ...c, ownerId: ownerId || null, senderId })), { ordered: false });
      for (const batch of batchChunks(chunks)) {
        // One bad batch (blocked by the content filter, a timeout) never stops the rest
        const note = await writeNotes(name, wellFormed(batch), ownerName).catch(err => {
          console.warn(`⚠️ [Memory] ${name}: skipped one batch (${err.message.slice(0, 80)})`);
          return '';
        });
        if (note) mem.notes.push(note);
        mem.indexedMessages += Math.round(messages.length / Math.max(1, batchChunks(chunks).length));
        await PersonMemory.updateOne({ _id: mem._id }, { $set: { notes: mem.notes, indexedMessages: Math.min(mem.indexedMessages, totalMessages) } });
        if (mem.notes.length > MAX_NOTES) mem.notes = [await compressNotes(name, mem.notes)];
      }
      mem.lastIndexedMessageAt = new Date(messages[messages.length - 1].timestamp || messages[messages.length - 1].createdAt);
      mem.chunkCount = await MemoryChunk.countDocuments({ ownerId: ownerId || null, senderId });
    }
    mem.indexedMessages = totalMessages;

    if (chunks.length || force || !mem.doc || mem.rebuildDoc) {
      // Only your own labels from the card: its older learned "connections" and notes were guesses
      const cardText = card ? [card.relationshipToSam && `relationship: ${card.relationshipToSam}`, card.category && `category: ${card.category}`].filter(Boolean).join('; ') : '';
      const ownerFacts = (mem.ownerFacts || []).map(f => f.text);
      const answered = (mem.doubts || []).filter(d => d.status !== 'open').map(d => `${d.question}${d.answer ? ` -> ${d.answer}` : ' (dismissed)'}`);
      const out = mem.notes.length || ownerFacts.length ? await writeDoc({ name, ownerName, notes: mem.notes, card: cardText, totalMessages, ownerFacts, answered }) : null;
      if (Array.isArray(out?.doubts)) {
        const known = new Set((mem.doubts || []).map(d => d.question.toLowerCase()));
        const fresh = out.doubts.filter(d => d && d.question && !known.has(String(d.question).toLowerCase())).slice(0, 5);
        mem.doubts = [...(mem.doubts || []).filter(d => d.status !== 'open'), ...fresh.map(d => ({ question: String(d.question).slice(0, 200), about: String(d.about || '').slice(0, 60) }))].slice(-40);
      }
      mem.rebuildDoc = false;
      // Gender read from the chats updates their card (and the AI's record), logged so you can see it
      if (['female', 'male'].includes(out?.gender) && !(mem.ownerFacts || []).some(f => /\b(he|she|him|her|boy|girl|male|female|gender)\b/i.test(f.text))) {
        const node = await SocialGraph.findOne({ ownerId: ownerId || null, senderId }, { gender: 1 });
        if (node && node.gender !== out.gender) {
          const before = node.gender || 'unknown';
          await SocialGraph.updateOne({ _id: node._id }, { $set: { gender: out.gender } });
          await UserMemory.updateOne({ ownerId: ownerId || null, senderId }, { $set: { gender: out.gender } });
          await require('../models/AgentAction').create({ ownerId: ownerId || null, senderId, name, kind: 'review', summary: `Gender set to ${out.gender} from the chats (was ${before})` }).catch(() => {});
        }
      }
      if (out?.doc) {
        mem.doc = String(out.doc).slice(0, 20000);
        // The model's own ratings, or (if it left them out) the ratings read from the document
        const docSlots = slotsFromDoc(mem.doc);
        const given = out.slots && typeof out.slots === 'object' ? out.slots : {};
        mem.slots = Object.fromEntries(Object.keys(SLOTS).map(k => [k, Math.max(Number(given[k]) || 0, docSlots[k] || 0)]));
        mem.brainScore = brainScore(mem.slots, totalMessages);
        mem.bond = ['stranger', 'acquaintance', 'friend', 'close', 'family', 'partner'].includes(out.bond) ? out.bond : '';
        mem.bondReason = String(out.bondReason || '').slice(0, 200);
      }
    }
    mem.status = 'ready';
    mem.dirty = false;
    if (mem.doc) mem.rulesVersion = RULES_VERSION;
    mem.errorCount = 0;
    mem.lastIndexedAt = new Date();
    await mem.save();
    console.log(`🧠 [Memory] ${name}: ${totalMessages} messages, ${mem.chunkCount} moments, brain ${mem.brainScore}, bond ${mem.bond || '-'}`);
    return mem;
  } catch (err) {
    // Back off this person (lastIndexedAt = now) so the indexer moves on to everyone else
    await PersonMemory.updateOne({ _id: mem._id }, { $set: { status: 'error', error: err.message.slice(0, 300), lastIndexedAt: new Date() }, $inc: { errorCount: 1 } });
    console.warn(`⚠️ [Memory] ${name}: ${err.message}`);
    return null;
  }
}

/** Marks a person's memory as needing an update (called for every new message). */
function markDirty(ownerId, senderId) {
  if (!senderId || /^test_/.test(String(senderId))) return Promise.resolve();
  return PersonMemory.updateOne(
    { ownerId: ownerId || null, senderId },
    { $set: { dirty: true }, $setOnInsert: { ownerId: ownerId || null, senderId, status: 'pending' } },
    { upsert: true },
  ).catch(() => {});
}

/** Everyone with messages gets a memory entry (first run). */
async function ensureEntries() {
  const contacts = await UserMemory.find({ senderId: { $not: /^test_/ } }, { ownerId: 1, senderId: 1, name: 1 }).lean();
  const ops = contacts.map(c => ({
    updateOne: {
      filter: { ownerId: c.ownerId || null, senderId: c.senderId },
      update: { $setOnInsert: { ownerId: c.ownerId || null, senderId: c.senderId, name: c.name || '', status: 'pending', dirty: true } },
      upsert: true,
    },
  }));
  if (ops.length) await PersonMemory.bulkWrite(ops, { ordered: false }).catch(() => {});
}

let running = false;
/** One pass: the next person whose memory is missing or out of date. Busiest chats first. */
async function tick() {
  if (running) return;
  running = true;
  try {
    const next = await PersonMemory.findOne({
      dirty: true,
      $or: [{ lastIndexedAt: null }, { lastIndexedAt: { $lte: new Date(Date.now() - REINDEX_AFTER_MS) } }, { priority: { $gt: 0 } }],
      status: { $ne: 'indexing' },
      // a person that keeps failing is retried at most every 15 min, and parked after 5 failures
      errorCount: { $not: { $gte: 5 } },
    }).sort({ priority: -1, lastIndexedAt: 1, totalMessages: 1 });
    if (!next) return;
    const User = require('../models/User');
    const owner = next.ownerId ? await User.findById(next.ownerId, { firstName: 1, name: 1 }).lean() : null;
    await indexOne(next.ownerId, next.senderId, { ownerName: owner?.firstName || owner?.name || 'me', force: !!next.forceRebuild });
    await PersonMemory.updateOne({ _id: next._id }, { $set: { priority: 0, forceRebuild: false } }).catch(() => {});
  } catch (err) {
    console.warn('⚠️ [Memory] tick failed:', err.message);
  } finally {
    running = false;
  }
}

function startScheduler() {
  // A server restart in the middle of indexing leaves "indexing": pick those up again
  PersonMemory.updateMany({ status: 'indexing' }, { $set: { status: 'pending', dirty: true } }).catch(() => {});
  setTimeout(() => ensureEntries().catch(() => {}), 30 * 1000);
  // Keeps going: one person after another; any error is logged and the next tick carries on
  const t = setInterval(() => { tick().catch(err => console.warn('⚠️ [Memory] tick error:', err.message)); }, 10 * 1000);
  if (t.unref) t.unref();
  console.log('🧠 [Memory] Indexer running');
}

/** The person's memory for a reply: the document and the old chat moments that match their message. */
async function contextFor(ownerId, senderId, incomingText) {
  const [mem, moments] = await Promise.all([
    PersonMemory.findOne({ ownerId: ownerId || null, senderId }, { doc: 1, brainScore: 1, bond: 1, name: 1 }).lean(),
    (async () => {
      const terms = searchTerms(incomingText);
      if (!terms.length) return [];
      return MemoryChunk.find(
        { ownerId: ownerId || null, senderId, $text: { $search: terms.join(' ') } },
        { score: { $meta: 'textScore' }, text: 1, startAt: 1 },
      ).sort({ score: { $meta: 'textScore' } }).limit(4).lean().catch(() => []);
    })(),
  ]);
  return { mem, moments };
}

/** Where this person is in the indexer's queue (0 = next or reading now). */
async function queuePosition(ownerId, senderId) {
  const me = await PersonMemory.findOne({ ownerId: ownerId || null, senderId }, { priority: 1, lastIndexedAt: 1, totalMessages: 1, dirty: 1, status: 1 }).lean();
  if (!me || !me.dirty || me.status === 'indexing') return 0;
  const waiting = await PersonMemory.find({ dirty: true, status: { $ne: 'indexing' }, errorCount: { $not: { $gte: 5 } } },
    { priority: 1, lastIndexedAt: 1, totalMessages: 1 }).sort({ priority: -1, lastIndexedAt: 1, totalMessages: 1 }).lean();
  const i = waiting.findIndex(w => String(w._id) === String(me._id));
  return i < 0 ? 0 : i;
}

module.exports = { RULES_VERSION, indexOne, markDirty, ensureEntries, tick, startScheduler, contextFor, queuePosition };
