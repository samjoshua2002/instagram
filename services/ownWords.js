/**
 * "Would we say that word in our chat?" learned from each account's own DMs. No word lists in code:
 * it works the same for every owner and every person they talk to, and keeps learning as they chat.
 *
 * A word in a reply sounds natural when it is already part of THIS chat:
 *  - the owner has typed it to this person, or
 *  - this person uses it regularly with the owner (using their words back is natural), or
 *  - it was said in the current conversation (their name, a game they just mentioned), or
 *  - the owner uses it a lot in general.
 * "A lot" depends on how well they know each other: with someone the owner talks to a lot, a word
 * the owner never used with them must be really common for the owner overall; with someone new, the
 * owner's general habits decide. Otherwise the reply is written again once in their own words.
 * Vocabularies refresh every 6 hours, so new words either of them start using are picked up.
 * Nothing is checked until there are enough of the owner's own messages to know.
 */
const repeatGuard = require('./repeatGuard');

// Curly apostrophes (don’t, you’re) are the same word as straight ones, not "don" + "t"
const words = text => repeatGuard.words(String(text || '').replace(/[\u2018\u2019\u02BC]/g, "'"));

const MIN_OWNER_WORDS = 400;    // fewer distinct words than this: too little to judge, check nothing
const REGULAR_SHARE = 1 / 2000; // someone new: a word in 1 of every 2,000 of the owner's messages is theirs
const COMMON_SHARE = 1 / 200;   // someone they talk to a lot: a word new to that chat must be in 0.5%+
const THEIR_SHARE = 1 / 500;   // their word: in 1 of every 500 of their messages (a word they typed twice isn't theirs)
const RICH_WITH = 300;          // distinct words the owner has used with someone: "they talk a lot"
const MIN_REGULAR = 3;
const CACHE_MS = 6 * 3600 * 1000;
const cache = new Map();

/** Pure: the set of words in these messages (same tokenizer as the repeat check). */
function vocabularyOf(texts) {
  const vocab = new Set();
  for (const t of texts || []) for (const w of words(t)) vocab.add(w);
  return vocab;
}

/** Pure: in how many of these messages each word appears. */
function countsOf(texts) {
  const counts = new Map();
  let total = 0;
  for (const t of texts || []) {
    if (!String(t || '').trim()) continue;
    total += 1;
    for (const w of new Set(words(t))) counts.set(w, (counts.get(w) || 0) + 1);
  }
  return { counts, total };
}

/**
 * Pure: the words in a reply that aren't part of this chat (letters only; numbers and emoji are fine).
 * @param {object} v
 * @param {{counts: Map, total: number}} v.overall the owner's words across all their chats
 * @param {Set} [v.mine] words the owner has typed to this person
 * @param {{counts: Map, total: number}} [v.theirs] this person's words to the owner, counted
 * @param {string[]} [v.chatTexts] the current conversation (always allowed)
 */
function foreignWords(reply, { overall, mine = new Set(), theirs = { counts: new Map(), total: 0 }, chatTexts = [] } = {}) {
  if (!overall || overall.counts.size < MIN_OWNER_WORDS) return [];
  const share = mine.size >= RICH_WITH ? COMMON_SHARE : REGULAR_SHARE;
  const floor = Math.max(MIN_REGULAR, Math.ceil(overall.total * share));
  const theirFloor = Math.max(MIN_REGULAR, Math.ceil((theirs.total || 0) * THEIR_SHARE));
  const now = vocabularyOf(chatTexts);
  const ok = w => mine.has(w) || now.has(w) || (theirs.counts.get(w) || 0) >= theirFloor
    || (overall.counts.get(w) || 0) >= floor;
  const out = [];
  for (const w of words(reply)) {
    if (/\d/.test(w) || !/\p{L}/u.test(w)) continue;
    if (ok(w) || ok(w.replace(/'s$/, ''))) continue;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

const ownerTyped = { role: 'assistant', sentByAI: { $ne: true }, isCheckIn: { $ne: true } };
const realText = t => !/^\s*\[/.test(String(t || ''));

async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** The owner's words across all their chats, counted (cached 6 h per account). */
function ownerVocabulary(ownerId) {
  return cached(`all:${ownerId || 'legacy'}`, async () => {
    const Message = require('../models/Message');
    const docs = await Message.find({ ...ownerTyped, ownerId: ownerId || null }).sort({ timestamp: -1 }).limit(30000).select('text').lean();
    return countsOf(docs.map(m => m.text).filter(realText));
  });
}

/** The words of one chat: { mine, theirs } (cached 6 h). */
function chatVocabulary(ownerId, senderId) {
  if (!senderId) return Promise.resolve({ mine: new Set(), theirs: { counts: new Map(), total: 0 } });
  return cached(`chat:${ownerId || 'legacy'}:${senderId}`, async () => {
    const Message = require('../models/Message');
    const id = String(senderId);
    const [mine, theirs] = await Promise.all([
      Message.find({ ...ownerTyped, ownerId: ownerId || null, recipientId: id }).sort({ timestamp: -1 }).limit(5000).select('text').lean(),
      Message.find({ ownerId: ownerId || null, senderId: id, role: 'user' }).sort({ timestamp: -1 }).limit(5000).select('text').lean(),
    ]);
    return {
      mine: vocabularyOf(mine.map(m => m.text).filter(realText)),
      theirs: countsOf(theirs.map(m => m.text).filter(realText)),
    };
  });
}

/** Everything foreignWords needs for one person: { overall, mine, theirs }, or null (= don't check). */
async function forPerson(ownerId, senderId) {
  try {
    const [overall, chat] = await Promise.all([ownerVocabulary(ownerId), chatVocabulary(ownerId, senderId)]);
    return { overall, ...chat };
  } catch {
    return null;
  }
}

/**
 * The words the AI keeps using with this person that aren't part of their chat ("fam", "vibes", "rn"),
 * most frequent first, from its recent replies to them. Told to the AI up front, so it avoids them
 * instead of needing a rewrite afterwards (cached 6 h).
 */
function aiHabitsToAvoid(ownerId, senderId, vocab, limit = 15) {
  if (!senderId || !vocab) return Promise.resolve([]);
  return cached(`habits:${ownerId || 'legacy'}:${senderId}`, async () => {
    const Message = require('../models/Message');
    const ai = await Message.find({ ownerId: ownerId || null, recipientId: String(senderId), role: 'assistant', sentByAI: true })
      .sort({ timestamp: -1 }).limit(300).select('text').lean();
    const tally = new Map();
    for (const m of ai) {
      if (!realText(m.text)) continue;
      for (const w of foreignWords(m.text, vocab)) tally.set(w, (tally.get(w) || 0) + 1);
    }
    return [...tally].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([w]) => w);
  });
}

/** Prompt block naming the words to avoid with this person ('' when none). */
const avoidBlock = list => (list && list.length
  ? `WORDS THAT AREN'T HOW YOU TWO TALK (the AI kept using these with them; you and they don't): ${list.map(w => `"${w}"`).join(', ')}. Don't use them; use the words from your real messages with them.`
  : '');

/** System note asking for the reply again without those words. */
const rewriteNote = (draft, foreign) =>
  `Your draft "${String(draft).slice(0, 200)}" uses words that aren't part of how you two talk: ${foreign.map(w => `"${w}"`).join(', ')}. Write it again using the words you and they really use with each other. Same meaning, same length or shorter.`;

module.exports = { foreignWords, vocabularyOf, countsOf, ownerVocabulary, chatVocabulary, forPerson, aiHabitsToAvoid, avoidBlock, rewriteNote, MIN_OWNER_WORDS, _cache: cache };
