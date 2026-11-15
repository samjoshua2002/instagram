/**
 * Pure helpers for the per-person memory index (no DB, no network), used by memoryIndexService.
 */

const isPlaceholder = t => /^\s*\[(Sent a|Shared an|Reacted)[^\]]*\]\s*$/i.test(String(t || ''));

/** Text that is safe to send as JSON: a cut emoji (lone surrogate) is dropped. */
function wellFormed(text) {
  const s = String(text || '');
  return typeof s.toWellFormed === 'function'
    ? s.toWellFormed().replace(/\uFFFD/g, '')
    : s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

/**
 * Real messages (oldest first) -> chat "moments": consecutive messages until a 30-minute gap or
 * `max` messages. The AI's own replies are left out, so memory only learns from real people.
 * Each line is tagged with who wrote it: "them" or "me" (the owner).
 */
function buildChunks(messages, { gapMinutes = 30, max = 8, maxChars = 1200 } = {}) {
  const out = [];
  let cur = null;
  const flush = () => { if (cur && cur.lines.length) out.push({ startAt: cur.startAt, endAt: cur.endAt, text: cur.lines.join('\n'), messages: cur.lines.length }); cur = null; };
  for (const m of messages || []) {
    if (!m || !m.text || m.sentByAI) continue;
    const at = new Date(m.timestamp || m.createdAt || 0);
    const who = m.role === 'assistant' ? 'me' : 'them';
    const text = wellFormed(String(m.text).replace(/\s+/g, ' ').trim().slice(0, 400));
    if (!text) continue;
    const gap = cur ? (at - cur.endAt) / 60000 : Infinity;
    if (!cur || gap > gapMinutes || cur.lines.length >= max || cur.chars + text.length > maxChars) {
      flush();
      cur = { startAt: at, endAt: at, lines: [], chars: 0 };
    }
    cur.lines.push(`${who}: ${text}`);
    cur.chars += text.length;
    cur.endAt = at;
  }
  flush();
  return out;
}

/** Chunks -> batches of roughly `maxChars` for one note-taking call each. */
function batchChunks(chunks, maxChars = 24000) {
  const batches = [];
  let cur = [];
  let size = 0;
  for (const c of chunks) {
    const day = new Date(c.startAt).toISOString().slice(0, 10);
    const block = `[${day}]\n${c.text}`;
    if (cur.length && size + block.length > maxChars) { batches.push(cur.join('\n\n')); cur = []; size = 0; }
    cur.push(block);
    size += block.length;
  }
  if (cur.length) batches.push(cur.join('\n\n'));
  return batches;
}

// What a friend's memory of someone is made of, and how much each part counts (sums to 100)
const SLOTS = {
  identity: 8,       // name, nickname, age, where they're from
  bond: 12,          // how we know each other, how close we are
  howWeTalk: 15,     // tone, language, jokes, what we call each other
  interests: 10,
  workStudy: 8,
  people: 9,         // family, friends, partner in their life
  places: 5,
  timeline: 12,      // dated events
  routines: 5,
  insideJokes: 6,
  preferences: 5,    // likes, dislikes, food, music
  openThreads: 5,    // plans, things to follow up
};

/**
 * Brain score 0-100 from how well each slot is known (0 nothing, 1 a little, 2 well, 3 very well).
 * Little chat history caps it: the AI cannot know someone well from 10 messages.
 */
function brainScore(slots = {}, totalMessages = 0) {
  let score = 0;
  for (const [slot, weight] of Object.entries(SLOTS)) {
    const v = Math.max(0, Math.min(3, Number(slots?.[slot]) || 0));
    score += weight * (v / 3);
  }
  const cap = totalMessages < 20 ? 25 : totalMessages < 100 ? 55 : totalMessages < 500 ? 80 : 100;
  return Math.round(Math.min(score, cap));
}

/** Words worth searching for in old chats (no stop words, no tiny words). */
const STOP = new Set('the a an and or but is are was were be to of in on at for with you u ur your my me i im it its this that what wat how who why when where do does did have has had will would can could just like ok okay so da bro lol haha hmm yes no ya ye not'.split(' '));
function searchTerms(text, max = 8) {
  const seen = new Set();
  for (const w of String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 3 || STOP.has(w) || seen.has(w)) continue;
    seen.add(w);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** Overall index score for the account: how much is read, and how well the AI knows people (weighted by chat size). */
function overallScore(people = []) {
  const total = people.reduce((n, p) => n + (p.totalMessages || 0), 0);
  const read = people.reduce((n, p) => n + Math.min(p.indexedMessages || 0, p.totalMessages || 0), 0);
  const weight = people.reduce((n, p) => n + Math.max(1, p.totalMessages || 0), 0);
  const brain = weight ? people.reduce((n, p) => n + (p.brainScore || 0) * Math.max(1, p.totalMessages || 0), 0) / weight : 0;
  return { indexedPct: total ? Math.round((100 * read) / total) : 0, brain: Math.round(brain), people: people.length, ready: people.filter(p => p.status === 'ready').length };
}

module.exports = { buildChunks, batchChunks, brainScore, searchTerms, overallScore, wellFormed, SLOTS, isPlaceholder };
