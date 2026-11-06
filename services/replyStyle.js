/**
 * Shared DM reply style: English only, no emoji, no tables or markdown, and a natural human tone.
 * HUMAN_CHAT_RULES goes into every reply prompt; toHumanText() cleans the model output so a slip
 * (an emoji, a markdown table, **bold**) never reaches the customer.
 */

const HUMAN_CHAT_RULES = `HOW TO WRITE EVERY MESSAGE (STRICT, OVERRIDES ANY OTHER STYLE NOTE):
- ENGLISH ONLY: always reply in simple, natural English, even if they write in Tamil, Hindi, Tanglish or any other language.
- NO EMOJI: never use emoji, emoticons or symbols like :) or <3. Plain words only.
- NO TABLES OR FORMATTING: never use tables, markdown, bullet points, headings, bold or asterisks. If you list a few things, write them in a normal sentence, or one per line in plain words.
- SOUND LIKE A REAL PERSON TEXTING, NOT A BOT: short, warm, relaxed, with contractions (I'm, you're, it's). Talk the way a friendly person on their phone would.
- NEVER USE BOT PHRASES: "Certainly", "Absolutely", "Great question", "I'd be happy to help", "I understand your concern", "Thank you for reaching out", "Feel free to", "Is there anything else I can help you with", "As an AI", "Hope this helps", "Let me know if you have any other questions".
- Do not repeat their question back, do not over-explain, and do not end every message with an offer or a question.`;

/**
 * Personal replies that have the owner's real texting data: the owner's measured style wins,
 * so emoji are allowed (at the owner's own rate) and no forced lowercase.
 */
function humanChatRules({ allowEmoji = false, allowTanglish = false } = {}) {
  let rules = HUMAN_CHAT_RULES;
  if (allowTanglish) {
    rules = rules.replace(/- ENGLISH ONLY:.*\n/, `- LANGUAGE: they wrote in Tanglish, so answer the way you really do with them: mostly English with a few Tamil words typed in English letters. Never Tamil script.\n`);
  }
  if (!allowEmoji) return rules;
  return rules
    .replace(/- NO EMOJI:.*\n/, '- EMOJI: only the way you really use them (see your measured texting style), never more often.\n')
    .replace(/ short, warm, relaxed, with contractions.*\n/, ' exactly like your real messages shown above: same length, same words, same energy.\n');
}

// Emoji and their glue characters (skin tones, variation selectors, joiners, keycaps, flags)
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}️︎‍⃣]/gu;
// Text emoticons that sit on their own as a word
const EMOTICON_RE = /(^|\s)(?::-?\)|:-?\(|:-?D|;-?\)|:-?P|:'\(|<3|xD|XD|\^_\^)(?=\s|$|[.,!?])/g;

function tableRowToText(line) {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()).filter(Boolean);
  return cells.join(', ');
}

/**
 * Turns a model reply into plain, human DM text.
 */
function toHumanText(text, { keepEmoji = false } = {}) {
  if (!text) return '';
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (let line of lines) {
    // Markdown table: drop the |---|---| divider, flatten rows to "a, b, c"
    if (/^[\s|:-]+$/.test(line) && /-{2,}/.test(line)) continue; // table divider or --- rule
    if (/^\s*\|.*\|\s*$/.test(line)) line = tableRowToText(line);
    line = line
      .replace(/^\s{0,3}#{1,6}\s+/, '')          // headings
      .replace(/^\s*[-*•●▪]\s+/, '')               // bullet markers
      .replace(/^\s*>\s?/, '')                     // block quotes
      .replace(/\*\*(.+?)\*\*/g, '$1')            // bold
      .replace(/__(.+?)__/g, '$1')
      .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,!?])/g, '$1$2') // italics
      .replace(/`([^`]+)`/g, '$1')                 // inline code
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 $2'); // [text](link) -> text link
    out.push(line);
  }
  return out.join('\n')
    .replace(keepEmoji ? /(?!)/g : EMOJI_RE, '')
    .replace(keepEmoji ? /(?!)/g : EMOTICON_RE, '$1')
    .replace(/\s+—\s+|\s+–\s+/g, ', ')           // spaced dashes read as bot writing
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(l => l.trim()).join('\n')
    .trim();
}

module.exports = { HUMAN_CHAT_RULES, humanChatRules, toHumanText };
