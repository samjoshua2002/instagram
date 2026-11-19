/**
 * "Does the AI text like you?" without anyone labelling anything.
 *
 * Every message records who wrote it, so the owner's own typed messages (with everyone, AI on or
 * off, including when they jump in between) are compared with the AI's messages over the last 30
 * days: length, Tanglish, emoji, lowercase, full stops, questions, and the words the owner uses
 * most. The AI's replies and its check-ins (when it texts first) are compared separately, because
 * they are written by different prompts and each gets its own fixes. The differences are
 *  - shown on the Voice Check page as a plain summary, and
 *  - added to replies / check-ins as rules ("keep it short, about 4 words, like you"),
 * so the AI corrects itself. Refreshed every 6 hours per account.
 *
 * The score is measured from the size of every gap (not from how many gaps were flagged), so it
 * only goes up when the AI's texting really gets closer to the owner's.
 */
const { fingerprint, isTanglish } = require('./voiceService');

const DAYS = 30;
const MIN_EACH = 30;          // fewer messages than this on either side: not enough to compare
const MIN_CHECKINS = 15;      // check-ins are rarer than replies
const MIN_OPENERS = 10;       // your own chat openers to compare check-ins with
const CACHE_MS = 6 * 3600 * 1000;
const FLAG_AT = 0.3;          // a gap of 30%+ of the larger value is shown and fixed
const FULL_PENALTY_AT = 0.5;  // a gap of 50%+ costs the whole weight of that measure
const WORDS_WEIGHT = 10;

// Ordinary English (incl. contractions): "you say X a lot" is only interesting for words that are yours
const COMMON = new Set(('i you u me my your ur the a an and or but so to of in on at for is are was were be been being am ' +
  'it its it\'s this that that\'s these those what what\'s wht wat how why when where who which there there\'s here ' +
  'do did does dont don\'t didn\'t doesn\'t im i\'m i\'ll i\'ve i\'d you\'re you\'ll you\'ve he\'s she\'s we\'re they\'re ' +
  'can can\'t cant will won\'t would wouldn\'t should could isn\'t wasn\'t aren\'t let let\'s ' +
  'ok okay yes yeah ya no not just like have has had get got go going went come with from up out off by as into about ' +
  'all one some any more much many also only even still really very too again back well then than now ' +
  'they them their he she him his her hers we our us if need want know think say said see make take give tell ' +
  'good time day today tomorrow yesterday thing things way because cause').split(' '));
const plainWord = w => String(w || '').replace(/[‘’]/g, '\'');

const pct = (list, f) => (list.length ? Math.round(100 * list.filter(f).length / list.length) : 0);

/** Pure: a style profile of a list of messages. */
function profile(texts) {
  const list = (texts || []).map(t => String(t || '').trim()).filter(Boolean);
  const fp = fingerprint(list);
  if (!fp) return null;
  return { ...fp, tanglishShare: pct(list, isTanglish) };
}

/** Pure: 0 (same) .. 1 (very different), relative to the larger value (never below `floor`). */
function gapOf(a, b, floor) {
  return Math.min(1, Math.abs(a - b) / Math.max(a, b, floor));
}

/**
 * The measures compared. `minAbs` keeps tiny absolute gaps (1% vs 2%) from being flagged.
 * `say` returns { text, fix } for a flagged gap, or null when that direction is not worth a rule.
 */
const MEASURES = [
  {
    key: 'length', weight: 25, floor: 1, minAbs: 1, of: p => p.avgWords,
    say: (y, a, you) => {
      const len = Math.max(1, you.medianWords || Math.round(you.avgWords) || 1);
      return a > y
        ? { text: `The AI writes longer messages than you (${a} words on average, you ${y}).`, fix: `Keep each message short, about ${len} words, like you.` }
        : { text: `The AI writes shorter messages than you (${a} words on average, you ${y}).`, fix: `Write a bit more, about ${len} words, like you.` };
    },
  },
  {
    key: 'tanglish', weight: 20, floor: 5, minAbs: 5, of: p => p.tanglishShare,
    say: (y, a) => (y > a
      ? { text: `You mix in Tanglish much more (${y}% of your messages, the AI ${a}%).`, fix: `Mix in Tanglish words the way you do (about ${y}% of your messages).` }
      : { text: `The AI uses Tanglish much more than you (${a}% of its messages, you ${y}%).`, fix: `Use Tanglish only with people you really text in Tanglish; overall you use it in only ${y}% of your messages.` }),
  },
  {
    key: 'case', weight: 15, floor: 10, minAbs: 10, of: p => p.lowerStartShare,
    say: (y, a) => (y > a
      ? { text: `You start messages in lowercase (${y}%), the AI much less (${a}%).`, fix: 'Start messages in lowercase like you.' }
      : { text: `The AI starts messages in lowercase (${a}%), you almost never do (${y}%).`, fix: 'Start messages with a capital letter like you.' }),
  },
  {
    key: 'emoji', weight: 10, floor: 10, minAbs: 5, of: p => p.emojiShare,
    say: (y, a, you) => (y > a
      ? { text: `You use emoji more (${y}% of your messages, the AI ${a}%).`, fix: `Use emoji about as often as you do (${y}% of messages${you.topEmoji?.length ? `, mostly ${you.topEmoji.slice(0, 3).join(' ')}` : ''}).` }
      : { text: `The AI uses emoji more than you (${a}% vs your ${y}%).`, fix: `Use fewer emoji; you put one in only ${y}% of messages.` }),
  },
  {
    key: 'period', weight: 10, floor: 10, minAbs: 10, of: p => p.periodEndShare,
    say: (y, a) => (a > y ? { text: `The AI ends messages with a full stop (${a}%), you rarely do (${y}%).`, fix: 'Do not end messages with a full stop.' } : null),
  },
  {
    key: 'questions', weight: 10, floor: 10, minAbs: 10, of: p => p.questionShare,
    say: (y, a) => (a > y ? { text: `The AI asks questions much more often than you (${a}% of messages vs your ${y}%).`, fix: 'Ask fewer questions; mostly just reply.' } : null),
  },
];

/**
 * Pure: how the AI's messages differ from the owner's.
 * match: 100 minus each measure's weight scaled by how big its gap is (a gap of 50%+ costs it all).
 * @returns {{ match: number, diffs: Array<{ key, text, fix }> }}
 */
function compare(you, ai) {
  if (!you || !ai) return { match: null, diffs: [] };
  const diffs = [];
  let penalty = 0;
  for (const m of MEASURES) {
    const y = m.of(you) || 0;
    const a = m.of(ai) || 0;
    const gap = gapOf(y, a, m.floor);
    penalty += m.weight * Math.min(1, gap / FULL_PENALTY_AT);
    if (gap >= FLAG_AT && Math.abs(y - a) >= m.minAbs) {
      const said = m.say(y, a, you);
      if (said) diffs.push({ key: m.key, ...said });
    }
  }
  const aiWords = new Set((ai.topWords || []).map(plainWord));
  const yours = (you.topWords || []).map(plainWord)
    .filter(w => w.length >= 2 && !COMMON.has(w) && !aiWords.has(w)).slice(0, 5);
  if (yours.length >= 2) {
    penalty += WORDS_WEIGHT;
    diffs.push({ key: 'words', text: `Words you use a lot that the AI rarely does: ${yours.join(', ')}.`, fix: `Use your own words where they fit: ${yours.join(', ')}.` });
  }
  return { match: Math.max(0, Math.round(100 - penalty)), diffs };
}

const tableRow = p => p && { avgWords: p.avgWords, tanglish: p.tanglishShare, emoji: p.emojiShare, lowercase: p.lowerStartShare, questions: p.questionShare };
const lowerFirst = s => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Pure: the whole summary. Replies are compared with all your typed messages; check-ins (the AI
 * texting first) with how YOU start chats (your openers), since openers and replies differ.
 * The headline score weighs replies and check-ins by how many of each the AI sent.
 */
function summarize(you, ai, checkIns, openers) {
  const enough = (you?.count || 0) >= MIN_EACH && (ai?.count || 0) >= MIN_EACH;
  const checkInsEnough = (openers?.count || 0) >= MIN_OPENERS && (checkIns?.count || 0) >= MIN_CHECKINS;
  const replies = enough ? compare(you, ai) : { match: null, diffs: [] };
  const ci = checkInsEnough ? compare(openers, checkIns) : { match: null, diffs: [] };
  const parts = [[replies.match, ai?.count || 0], [ci.match, checkIns?.count || 0]].filter(([m]) => m != null);
  const total = parts.reduce((n, [, c]) => n + c, 0);
  const match = total ? Math.round(parts.reduce((n, [m, c]) => n + m * c, 0) / total) : null;
  const checkInDiffs = ci.diffs
    .filter(d => d.key !== 'words')
    .map(d => ({ ...d, key: `checkin_${d.key}`, text: `In check-ins, compared with how you start chats: ${lowerFirst(d.text)}` }));
  return {
    enough: enough || checkInsEnough,
    match,
    replyMatch: replies.match,
    checkInMatch: ci.match,
    diffs: [...replies.diffs, ...checkInDiffs],
    replyFixes: replies.diffs.map(d => d.fix),
    checkInFixes: ci.diffs.map(d => d.fix),
  };
}

/** Pure: every line of every chat opener you typed, from messages of many chats (oldest first). */
function openerLines(msgs) {
  const { pickOpeners } = require('./checkInVoice');
  const byChat = new Map();
  for (const m of msgs || []) {
    const id = String((m.role === 'assistant' ? m.recipientId : m.senderId) || '');
    if (!id || /^test_/.test(id)) continue;
    if (!byChat.has(id)) byChat.set(id, []);
    byChat.get(id).push(m);
  }
  return [...byChat.values()].flatMap(chat => pickOpeners(chat, { limit: 50 })).flatMap(t => t.split('\n'));
}

const cache = new Map();

/** The owner's own messages vs the AI's replies and check-ins over the last 30 days (cached 6 h). */
async function summaryFor(ownerId, { fresh = false } = {}) {
  if (!ownerId) return null;
  const key = String(ownerId);
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const Message = require('../models/Message');
  const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);
  const base = { ownerId, role: 'assistant', createdAt: { $gte: since }, isReminder: { $ne: true } };
  const latest = q => Message.find(q).sort({ createdAt: -1 }).limit(2000).select('text').lean();
  const [mine, ais, checkInMsgs, takeovers, chats] = await Promise.all([
    latest({ ...base, sentByAI: { $ne: true }, isCheckIn: { $ne: true } }),
    latest({ ...base, sentByAI: true, isCheckIn: { $ne: true } }),
    latest({ ...base, sentByAI: true, isCheckIn: true }),
    Message.countDocuments({ ownerId, origin: 'human_after_draft', createdAt: { $gte: since } }),
    // Every message (both sides) to find where YOU started a chat after a quiet gap
    Message.find({ ownerId, createdAt: { $gte: since } }).sort({ timestamp: 1 }).limit(8000)
      .select('role text sentByAI isCheckIn isReminder timestamp createdAt senderId recipientId').lean(),
  ]);
  const you = profile(mine.map(m => m.text));
  const ai = profile(ais.map(m => m.text));
  const checkIns = profile(checkInMsgs.map(m => m.text));
  const openers = profile(openerLines(chats));
  const value = {
    days: DAYS, yourMessages: you?.count || 0, aiMessages: ai?.count || 0, checkInMessages: checkIns?.count || 0,
    openerMessages: openers?.count || 0, takeovers,
    // Reactions the AI picks for you, from the emoji you type most (most yours first)
    reactions: require('../lib/humanPacing').reactionHabits(you?.topEmoji || []).order,
    you: tableRow(you), ai: tableRow(ai), checkIns: tableRow(checkIns), openers: tableRow(openers),
    ...summarize(you, ai, checkIns, openers),
    at: new Date(),
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Prompt block with the automatic fixes for replies, or for check-ins ('' when none or not enough data). */
async function autoBlock(ownerId, { checkIn = false } = {}) {
  const s = await summaryFor(ownerId).catch(() => null);
  const fixes = (checkIn ? s?.checkInFixes : s?.replyFixes) || [];
  if (!fixes.length) return '';
  return `AUTOMATIC CHECK OF YOUR LAST ${s.days} DAYS (your own messages vs the AI's${checkIn ? ' check-ins' : ''}; fix these):\n${fixes.map(f => `- ${f}`).join('\n')}\n`;
}

module.exports = { profile, compare, summarize, openerLines, summaryFor, autoBlock, MIN_EACH, _cache: cache };
