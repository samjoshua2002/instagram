/**
 * Replying like a person, not a bot that answers every message the second it lands:
 *  - Sometimes (a random share of chats) the reply waits a while, like someone who checks their
 *    phone later, so everything they sent in the meantime is answered together in one go.
 *  - When there's nothing to add (an "ok", "gn", a laugh), the AI can just ❤️ their message, like a
 *    double tap, instead of writing something. In personal chats that is also what happens when the
 *    AI fails, instead of a random "yoo wassup!" in the middle of a conversation.
 */
const QUICK_GROUP_MS = 1000;            // messages sent back to back are always answered together
const LATER_MIN_MS = 45 * 1000;         // "checks the phone later": 45 s ...
const LATER_MAX_MS = 150 * 1000;        // ... to 2.5 min
const DEFAULT_LATER_CHANCE = 0.2;       // about 1 in 5 conversations
// [REACT], [REACT: laugh] / [REACT: 😂], and the history note "[Reacted 😂 to their message]" in case
// the model copies it as text
const REACT_TAG = /\[REACT(?::\s*([^\]\n]{1,20}))?\]|\[Reacted\s*([^\]\n]{0,40})\]/i;
const REACT_TAGS = /\s*(?:\[REACT(?::\s*[^\]\n]{1,20})?\]|\[Reacted[^\]\n]{0,40}\])\s*/gi;

// Instagram's reaction names (the same set its webhooks report) and the emoji each one shows
const REACTIONS = { love: '❤️', laugh: '😂', wow: '😮', sad: '😢', angry: '😡', like: '👍' };
const EMOJI_TO_REACTION = new Map([
  ...['❤', '❤️', '♥', '♥️', '😍', '🥰', '😘', '💕', '💖', '💗', '💓', '💞', '🫶', '😊', '☺️', '🤍', '🖤', '💜', '💙', '💚', '💛', '🧡'].map(e => [e, 'love']),
  ...['😂', '🤣', '💀', '😆', '😹', '😁', '😄', '😅', '☠️'].map(e => [e, 'laugh']),
  ...['😮', '😯', '😲', '🤯', '😳', '😱', '👀', '🫢', '😧'].map(e => [e, 'wow']),
  ...['😢', '🥲', '😞', '😔', '☹️', '🙁', '💔', '🥺', '😥'].map(e => [e, 'sad']),
  ...['😡', '😠', '🤬', '😤', '👿'].map(e => [e, 'angry']),
  ...['👍', '👌', '🙌', '👏', '💯', '🔥', '🤝', '✅', '😎', '🫡'].map(e => [e, 'like']),
]);

/** Pure: an Instagram reaction name from a name or an emoji ("laugh", "😂"), or null. */
function toReaction(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  if (REACTIONS[lower]) return lower;
  if (lower === 'heart' || lower === 'haha' || lower === 'lol') return lower === 'heart' ? 'love' : 'laugh';
  if (EMOJI_TO_REACTION.has(v)) return EMOJI_TO_REACTION.get(v);
  const plain = v.replace(/[️‍]|\p{Emoji_Modifier}/gu, '');
  for (const [emoji, reaction] of EMOJI_TO_REACTION) if (emoji.replace(/️/g, '') === plain) return reaction;
  return null;
}

/** Pure: the reaction a [REACT...] tag asks for ('love' when it names none or an unknown one), or null without a tag. */
function reactionOf(text) {
  const m = String(text || '').match(REACT_TAG);
  if (!m) return null;
  // "[Reacted 😂 to their message]": the emoji is the first word
  return toReaction(m[1] || String(m[2] || '').trim().split(/\s+/)[0]) || 'love';
}

/**
 * Pure: which reactions fit YOU, from the emoji you type most (your own messages). Instagram never
 * tells the app which reactions you tap yourself, so your typed emoji are the closest real signal.
 * @returns {{ order: string[], line: string }} reaction names, most yours first, and a prompt line
 */
function reactionHabits(topEmoji = []) {
  const counts = new Map();
  (topEmoji || []).forEach((e, i) => {
    const r = toReaction(e);
    if (r) counts.set(r, (counts.get(r) || 0) + (topEmoji.length - i));
  });
  const order = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r);
  if (!order.length) return { order, line: '' };
  const shown = (topEmoji || []).filter(e => toReaction(e)).slice(0, 5).join(' ');
  return { order, line: `Your own emoji (most used first): ${shown}. Pick reactions the way you'd use those: ${order.map(r => `${r} ${REACTIONS[r]}`).join(', ')}.` };
}
const QUESTION_START = /^(what|wht|wat|when|where|why|how|who|which|whose|can|could|will|would|do|does|did|is|are|r|u\s+(?:coming|free|there|up)|enna|ena|yenna|epo|eppo|enga|yaaru|yaar|evlo|ethuku|en)\b/i;

/** Share of conversations answered "later", from BATCH_REPLY_CHANCE (0 turns it off). */
function laterChance(env = process.env) {
  const n = Number(env.BATCH_REPLY_CHANCE);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_LATER_CHANCE;
}

/**
 * Pure: how long to hold the first message of a new burst before answering.
 * Business chats always answer quickly; personal chats sometimes answer later, in one go.
 */
function clusterHoldMs({ random = Math.random, chance = DEFAULT_LATER_CHANCE, isBusiness = false } = {}) {
  if (isBusiness || !(random() < chance)) return QUICK_GROUP_MS;
  return Math.round(LATER_MIN_MS + random() * (LATER_MAX_MS - LATER_MIN_MS));
}

/** Pure: wait for a message that joins a burst: at least the quick gap, never past the burst's deadline. */
function joinWaitMs(holdUntil, now = Date.now()) {
  return Math.max(QUICK_GROUP_MS, (holdUntil || 0) - now);
}

const hasReactTag = text => REACT_TAG.test(String(text || ''));
const stripReactTag = text => String(text || '').replace(REACT_TAGS, ' ').replace(/[ \t]{2,}/g, ' ').trim();
const isReactRecord = text => /^\[Reacted/i.test(String(text || '').trim());

/**
 * Pure: may the AI answer with only a ❤️? Not when they asked something, wrote something long
 * (that deserves words), or when its own last turn was already only a reaction.
 */
function mayReactOnly({ incomingText = '', history = [] } = {}) {
  const lines = String(incomingText).split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.some(l => l.includes('?') || QUESTION_START.test(l))) return false;
  if (String(incomingText).split(/\s+/).filter(Boolean).length > 12) return false;
  const lastMine = [...(history || [])].reverse().find(m => m && m.role === 'assistant');
  return !isReactRecord(lastMine?.text);
}

/**
 * Pure: what to do with the AI's reply. A [REACT] / [REACT: laugh] tag means react to their latest
 * message; alone it means only the reaction. In personal chats a failed AI becomes a ❤️ instead of a
 * canned line. Business chats never react (and the tag is just removed).
 * @returns {{ text: string, react: boolean, reactOnly: boolean, reaction: string|null }}
 */
function planReaction({ replyText = '', aiFailed = false, isBusiness = false, lastMid = '' } = {}) {
  const text = stripReactTag(replyText);
  if (isBusiness || !lastMid) return { text, react: false, reactOnly: false, reaction: null };
  if (aiFailed) return { text: '', react: true, reactOnly: true, reaction: 'love' };
  const reaction = reactionOf(replyText);
  return { text, react: !!reaction, reactOnly: !!reaction && !text, reaction };
}

/** The history note saved for a reaction, so the AI knows it reacted (and with what). */
const reactRecord = (reaction = 'love') => `[Reacted ${REACTIONS[reaction] || REACTIONS.love} to their message]`;
const REACT_RECORD = reactRecord('love');

module.exports = {
  clusterHoldMs, joinWaitMs, laterChance, mayReactOnly, planReaction,
  hasReactTag, stripReactTag, isReactRecord, reactionOf, toReaction, reactionHabits, reactRecord,
  REACTIONS, REACT_RECORD, QUICK_GROUP_MS, LATER_MIN_MS, LATER_MAX_MS,
};
