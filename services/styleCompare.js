/**
 * "Does the AI text like you?" without anyone labelling anything.
 *
 * Every message records who wrote it, so the owner's own typed messages (with everyone, AI on or
 * off, including when they jump in between) are compared with the AI's replies over the last 30
 * days: length, Tanglish, emoji, lowercase, full stops, questions, and the words the owner uses
 * most. The differences are
 *  - shown on the Voice Check page as a plain summary, and
 *  - added to every reply and check-in as rules ("keep it short, about 4 words, like you"),
 * so the AI corrects itself. Refreshed every 6 hours per account.
 */
const { fingerprint, isTanglish } = require('./voiceService');

const DAYS = 30;
const MIN_EACH = 30;          // fewer messages than this on either side: not enough to compare
const CACHE_MS = 6 * 3600 * 1000;
// Common English words: "you say X a lot" is only interesting for words that are yours
const COMMON = new Set(('i you u me my your ur the a an and or but so to of in on at for is are was were be been it its this that ' +
  'what wht wat how why when where who do did does dont don\'t im i\'m ok okay yes yeah ya no not just like can will would ' +
  'have has had get got go going with from up out all one there they them he she we our if then than now too very').split(' '));

const pct = (list, f) => (list.length ? Math.round(100 * list.filter(f).length / list.length) : 0);

/** Pure: a style profile of a list of messages. */
function profile(texts) {
  const list = (texts || []).map(t => String(t || '').trim()).filter(Boolean);
  const fp = fingerprint(list);
  if (!fp) return null;
  return { ...fp, tanglishShare: pct(list, isTanglish) };
}

/**
 * Pure: how the AI's messages differ from the owner's.
 * @returns {{ match: number, diffs: Array<{ key, text, fix }> }}
 */
function compare(you, ai) {
  if (!you || !ai) return { match: null, diffs: [] };
  const diffs = [];
  const youLen = Math.max(1, you.medianWords || you.avgWords || 1);
  if (ai.avgWords >= you.avgWords * 1.5 && ai.avgWords - you.avgWords >= 2) {
    diffs.push({ key: 'longer', text: `The AI writes longer messages than you (${ai.avgWords} words on average, you ${you.avgWords}).`, fix: `Keep each message short, about ${youLen} words, like you.` });
  } else if (ai.avgWords <= you.avgWords * 0.5 && you.avgWords - ai.avgWords >= 2) {
    diffs.push({ key: 'shorter', text: `The AI writes shorter messages than you (${ai.avgWords} words on average, you ${you.avgWords}).`, fix: `Write a bit more, about ${youLen} words, like you.` });
  }
  if (you.tanglishShare - ai.tanglishShare >= 15) {
    diffs.push({ key: 'tanglish', text: `You mix in Tanglish much more (${you.tanglishShare}% of your messages, the AI ${ai.tanglishShare}%).`, fix: `Mix in Tanglish words the way you do (about ${you.tanglishShare}% of your messages).` });
  } else if (ai.tanglishShare - you.tanglishShare >= 15) {
    diffs.push({ key: 'tanglish', text: `The AI uses Tanglish more than you (${ai.tanglishShare}% vs your ${you.tanglishShare}%).`, fix: 'Use less Tanglish; you mostly text in English.' });
  }
  if (you.emojiShare - ai.emojiShare >= 10) {
    diffs.push({ key: 'emoji', text: `You use emoji more (${you.emojiShare}% of your messages, the AI ${ai.emojiShare}%).`, fix: `Use emoji about as often as you do (${you.emojiShare}% of messages${you.topEmoji?.length ? `, mostly ${you.topEmoji.slice(0, 3).join(' ')}` : ''}).` });
  } else if (ai.emojiShare - you.emojiShare >= 10) {
    diffs.push({ key: 'emoji', text: `The AI uses emoji more than you (${ai.emojiShare}% vs your ${you.emojiShare}%).`, fix: `Use fewer emoji; you put one in only ${you.emojiShare}% of messages.` });
  }
  if (you.lowerStartShare - ai.lowerStartShare >= 20) {
    diffs.push({ key: 'case', text: `You start messages in lowercase (${you.lowerStartShare}%), the AI much less (${ai.lowerStartShare}%).`, fix: 'Start messages in lowercase like you.' });
  } else if (you.capStartShare - ai.capStartShare >= 20) {
    diffs.push({ key: 'case', text: `You start messages with a capital (${you.capStartShare}%), the AI much less (${ai.capStartShare}%).`, fix: 'Start messages with a capital letter like you.' });
  }
  if (ai.periodEndShare - you.periodEndShare >= 15) {
    diffs.push({ key: 'period', text: `The AI ends messages with a full stop (${ai.periodEndShare}%), you rarely do (${you.periodEndShare}%).`, fix: 'Do not end messages with a full stop.' });
  }
  if (ai.questionShare - you.questionShare >= 20) {
    diffs.push({ key: 'questions', text: `The AI asks questions much more often than you (${ai.questionShare}% of messages vs your ${you.questionShare}%).`, fix: 'Ask fewer questions; mostly just reply.' });
  }
  const aiWords = new Set(ai.topWords || []);
  const yours = (you.topWords || []).filter(w => w.length >= 2 && !COMMON.has(w) && !aiWords.has(w)).slice(0, 5);
  if (yours.length >= 2) {
    diffs.push({ key: 'words', text: `Words you use a lot that the AI rarely does: ${yours.join(', ')}.`, fix: `Use your own words where they fit: ${yours.join(', ')}.` });
  }
  const penalty = { longer: 20, shorter: 10, tanglish: 20, emoji: 10, case: 10, period: 10, questions: 10, words: 10 };
  const match = Math.max(0, 100 - diffs.reduce((n, d) => n + (penalty[d.key] || 10), 0));
  return { match, diffs };
}

const cache = new Map();

/** The owner's own messages vs the AI's over the last 30 days, compared (cached 6 h). */
async function summaryFor(ownerId, { fresh = false } = {}) {
  if (!ownerId) return null;
  const key = String(ownerId);
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const Message = require('../models/Message');
  const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);
  const base = { ownerId, role: 'assistant', createdAt: { $gte: since }, isReminder: { $ne: true } };
  const [mine, ais, takeovers] = await Promise.all([
    Message.find({ ...base, sentByAI: { $ne: true }, isCheckIn: { $ne: true } }).sort({ createdAt: -1 }).limit(2000).select('text').lean(),
    Message.find({ ...base, sentByAI: true }).sort({ createdAt: -1 }).limit(2000).select('text').lean(),
    Message.countDocuments({ ownerId, origin: 'human_after_draft', createdAt: { $gte: since } }),
  ]);
  const you = profile(mine.map(m => m.text));
  const ai = profile(ais.map(m => m.text));
  const enough = (you?.count || 0) >= MIN_EACH && (ai?.count || 0) >= MIN_EACH;
  const value = {
    days: DAYS, yourMessages: you?.count || 0, aiMessages: ai?.count || 0, takeovers, enough,
    you: you && { avgWords: you.avgWords, tanglish: you.tanglishShare, emoji: you.emojiShare, lowercase: you.lowerStartShare, questions: you.questionShare },
    ai: ai && { avgWords: ai.avgWords, tanglish: ai.tanglishShare, emoji: ai.emojiShare, lowercase: ai.lowerStartShare, questions: ai.questionShare },
    ...(enough ? compare(you, ai) : { match: null, diffs: [] }),
    at: new Date(),
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Prompt block with the automatic fixes for this account ('' when none or not enough data). */
async function autoBlock(ownerId) {
  const s = await summaryFor(ownerId).catch(() => null);
  if (!s?.enough || !s.diffs.length) return '';
  return `AUTOMATIC CHECK OF YOUR LAST ${s.days} DAYS (your own messages vs the AI's; fix these):\n${s.diffs.map(d => `- ${d.fix}`).join('\n')}\n`;
}

module.exports = { profile, compare, summaryFor, autoBlock, MIN_EACH, _cache: cache };
