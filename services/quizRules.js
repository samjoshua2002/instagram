/**
 * Pure scoring for the quiz (no DB, no network): how close the AI's guess is to your real reply,
 * by texting style (length, casing, emoji, punctuation, the letters you use).
 */
const EMOJI = /\p{Extended_Pictographic}/u;
const words = t => String(t || '').trim().split(/\s+/).filter(Boolean);

function features(text) {
  const t = String(text || '').trim();
  const w = words(t);
  return {
    words: w.length,
    lower: t ? (t === t.toLowerCase() ? 1 : 0) : 0,
    emoji: EMOJI.test(t) ? 1 : 0,
    period: /[^.]\.$/.test(t) ? 1 : 0,
    question: /\?\s*$/.test(t) ? 1 : 0,
    lines: t.split('\n').filter(Boolean).length,
  };
}

/** Character 3-grams overlap (0..1): catches your spellings and slang ("da", "rn", "heyyy"). */
function charSimilarity(a, b) {
  const grams = s => {
    const t = ` ${String(s || '').toLowerCase().replace(/\s+/g, ' ')} `;
    const set = new Set();
    for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
    return set;
  };
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const g of A) if (B.has(g)) common++;
  return (2 * common) / (A.size + B.size);
}

/** Style match 0..100 between your reply and the AI's guess. */
function styleScore(real, guess) {
  const a = features(real), b = features(guess);
  const len = Math.min(a.words, b.words) / Math.max(1, a.words, b.words);
  const flags = ['lower', 'emoji', 'period', 'question'].reduce((n, k) => n + (a[k] === b[k] ? 1 : 0), 0) / 4;
  const lines = Math.min(a.lines, b.lines) / Math.max(1, a.lines, b.lines);
  return Math.round(100 * (0.35 * len + 0.3 * flags + 0.1 * lines + 0.25 * charSimilarity(real, guess)));
}

/** Overall match: style and meaning (meaning from the AI judge, 0..100). */
function matchScore(style, meaning) {
  const m = Number.isFinite(meaning) ? meaning : style;
  return Math.round(0.5 * style + 0.5 * m);
}

module.exports = { features, charSimilarity, styleScore, matchScore };
