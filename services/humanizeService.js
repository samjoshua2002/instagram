/**
 * Human Mimicry Post-Processor (PLAN.md §15.6)
 * Cleans AI replies so personal DMs read like real texting:
 * strips robotic clichés and bullet lists, drops terminal periods on
 * single-sentence replies, and splits two-thought replies into 2-3 bubbles.
 */

// Robotic openers / closers that give the AI away (§15.6.3)
const BANNED_PATTERNS = [
  /\bas an ai(?: language model)?\b[^.!?\n]*[.!?]?/gi,
  /\bi(?:'m| am) (?:just )?an ai\b[^.!?\n]*[.!?]?/gi,
  /\bi hope (?:this|that) helps!?\.?/gi,
  /\bhope (?:this|that) helps!?\.?/gi,
  /^\s*(?:certainly|absolutely|of course|great question|sure thing)[!.,]\s*/gim,
  /\bfeel free to (?:ask|reach out|let me know)[^.!?\n]*[.!?]?/gi,
  /\b(?:is there )?anything else i can help (?:you )?with\??/gi,
  /\blet me know if you (?:have any|need any)[^.!?\n]*[.!?]?/gi,
];

const BULLET_LINE = /^\s*(?:[-*•]|\d+[.)])\s+/;

function stripBullets(text) {
  const lines = text.split('\n');
  if (!lines.some(l => BULLET_LINE.test(l))) return text;
  // Collapse a bulleted list into casual comma-joined text
  const out = [];
  let list = [];
  for (const line of lines) {
    if (BULLET_LINE.test(line)) {
      list.push(line.replace(BULLET_LINE, '').replace(/[.;]\s*$/, '').trim());
    } else {
      if (list.length) { out.push(list.join(', ')); list = []; }
      out.push(line);
    }
  }
  if (list.length) out.push(list.join(', '));
  return out.join('\n');
}

function countSentences(text) {
  return (text.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || []).filter(s => s.trim()).length;
}

// Single-sentence lines lose their terminal period (keeps "..." and "!" / "?")
function dropTerminalPeriod(line) {
  if (/\.\.\.$/.test(line)) return line;
  if (countSentences(line) > 1) return line;
  return line.replace(/\.\s*$/, '');
}

// Lowercase a casual opener ("Hey", "Haha", "Yo") but keep names / "I"
const CASUAL_OPENERS = /^(Hey|Hi|Hello|Haha+|Hahaha+|Lol|Lmao+|Omg|Yo+|Nah|Yeah|Yea|Yep|Ok|Okay|Bro|Wait|Damn|Oh|Ohh+|Wow|Sure|Fr|Ngl|Tbh|Same|True|Bruh)\b/;

function lowercaseOpener(line) {
  return line.replace(CASUAL_OPENERS, m => m.toLowerCase());
}

/**
 * Clean a raw AI reply. Business tenants only get cliché/bullet removal;
 * personal tenants also get casual punctuation and casing.
 */
function humanizeReply(text, { isBusiness = false } = {}) {
  if (!text) return text;
  let out = String(text);

  for (const re of BANNED_PATTERNS) out = out.replace(re, '');
  if (!isBusiness) out = stripBullets(out);

  out = out
    .split('\n')
    .map(l => l.replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .map(l => (isBusiness ? l : lowercaseOpener(dropTerminalPeriod(l))))
    .join('\n')
    .trim();

  // Never return an empty reply if the cleanup ate everything
  return out || String(text).trim();
}

/**
 * Split a reply holding two or more distinct thoughts into 2-3 short bubbles.
 * Explicit line breaks win; otherwise split on sentence boundaries when long enough.
 */
function splitIntoBubbles(text, { maxBubbles = 3, minLength = 60 } = {}) {
  const clean = (text || '').trim();
  if (!clean) return [];

  let parts = clean.split(/\n+/).map(s => s.trim()).filter(Boolean);

  if (parts.length === 1 && clean.length >= minLength) {
    const sentences = (clean.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [clean])
      .map(s => s.trim())
      .filter(Boolean);
    if (sentences.length >= 2) parts = sentences.map(dropTerminalPeriod);
  }

  if (parts.length <= maxBubbles) return parts;
  // Merge the overflow into the last bubble
  return [...parts.slice(0, maxBubbles - 1), parts.slice(maxBubbles - 1).join(' ')];
}

// Gap between bubbles: 1-2 seconds (§15.6.5)
function bubbleGapMs() {
  return 1000 + Math.floor(Math.random() * 1000);
}

module.exports = { humanizeReply, splitIntoBubbles, bubbleGapMs };
