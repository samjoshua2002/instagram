// Keeps replies from sounding like a bot on repeat: shows the model what it already said to this person
// (its recent replies, the openers and phrases it keeps reusing) and spots a new reply that is a near copy.

const STRIP_TAGS = /\[(?:STICKER|ATTACHMENT):\s*[a-zA-Z0-9_-]+\]/gi;

/** Lowercase words only (no punctuation, emoji or attachment tags). */
function words(text) {
  return String(text || '')
    .replace(STRIP_TAGS, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** The AI's own recent replies in this chat, newest last. */
function recentReplies(history, limit = 15) {
  return (history || [])
    .filter(m => m && m.role === 'assistant' && String(m.text || '').trim())
    .map(m => String(m.text).replace(STRIP_TAGS, '').trim())
    .filter(Boolean)
    .slice(-limit);
}

/** Openers (first one or two words) and 3-word phrases used in two or more of the replies. */
function overused(replies) {
  const openers = new Map();
  const phrases = new Map();
  for (const r of replies) {
    const w = words(r);
    if (!w.length) continue;
    // the first word and the first two words: "bro …" and "bro nothing …" are both habits worth naming
    for (const opener of new Set([w[0], w.slice(0, 2).join(' ')])) openers.set(opener, (openers.get(opener) || 0) + 1);
    const seen = new Set();
    for (let i = 0; i + 2 < w.length; i++) {
      const p = `${w[i]} ${w[i + 1]} ${w[i + 2]}`;
      if (seen.has(p)) continue;
      seen.add(p);
      phrases.set(p, (phrases.get(p) || 0) + 1);
    }
  }
  const top = m => [...m.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { openers: top(openers).slice(0, 8), phrases: top(phrases).slice(0, 10) };
}

/** System note for the model: what it already said, and what to avoid this time. Empty when there is no history. */
function antiRepeatBlock(history) {
  const replies = recentReplies(history);
  if (!replies.length) return '';
  const { openers, phrases } = overused(replies);
  const clip = s => (s.length > 140 ? `${s.slice(0, 140)}…` : s);
  return [
    'WHAT YOU ALREADY SAID TO THIS PERSON RECENTLY (DO NOT REPEAT YOURSELF):',
    ...replies.slice(-10).map(r => `- "${clip(r)}"`),
    openers.length ? `Openers you keep using: ${openers.map(o => `"${o}"`).join(', ')}. Start this reply differently.` : '',
    phrases.length ? `Phrases you have already repeated: ${phrases.map(p => `"${p}"`).join(', ')}. Do not use them again.` : '',
    'Reply to THEIR exact latest words. Pick up a specific detail from this chat or from what you know about them, so the reply could only have been written to this person, right now. Never reuse a reply or a joke from the list above.',
  ].filter(Boolean).join('\n');
}

/** Word-set overlap (0..1) between two texts. */
function similarity(a, b) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / Math.max(A.size, B.size);
}

/**
 * Is this reply a near copy of one of the recent replies? Returns the copied reply, or null.
 * Very short replies ("lol", "fr") are allowed to recur; anything longer must not echo a recent one.
 */
function findRepeat(reply, history) {
  const w = words(reply);
  if (w.length < 4) return null;
  const opener = w.slice(0, 3).join(' ');
  for (const prev of recentReplies(history, 12)) {
    const pw = words(prev);
    if (pw.length < 4) continue;
    if (similarity(reply, prev) >= 0.7) return prev;
    if (pw.slice(0, 3).join(' ') === opener && w.length >= 6) return prev;
  }
  return null;
}

module.exports = { antiRepeatBlock, findRepeat, recentReplies, overused, similarity, words };
