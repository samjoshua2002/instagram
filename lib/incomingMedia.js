/**
 * Incoming attachments the webhook parser doesn't know (stickers, hearts, new Instagram types).
 * Before, a message with no text and an unknown attachment was dropped silently: the AI never saw
 * it and the chat history had a hole. Now it is kept with a plain placeholder, and its shape (type
 * and field names only, never the content or links) is logged so new types can be supported.
 */
const KNOWN_TYPES = new Set(['image', 'video', 'audio', 'file', 'share', 'ig_reel', 'reel', 'ig_post', 'post', 'story_mention', 'story']);

/** Pure: does this attachment look like a sticker (by type or by Instagram's sticker fields)? */
function isSticker(att) {
  const p = att?.payload || {};
  return /sticker/i.test(String(att?.type || '')) || p.sticker_id != null || p.render_as_sticker === true;
}

/** Pure: what to log about an attachment: its type and field names, never values or links. */
function shapeOf(att) {
  const p = att && typeof att.payload === 'object' && att.payload ? att.payload : {};
  return { type: String(att?.type || ''), payloadKeys: Object.keys(p).sort(), hasUrl: typeof p.url === 'string' && p.url.length > 0 };
}

/** Pure: the attachments in a message that the parser has no rule for. */
function unknownAttachments(msg) {
  const list = Array.isArray(msg?.attachments) ? msg.attachments : [];
  return list.filter(a => a && (!KNOWN_TYPES.has(String(a.type || '').toLowerCase()) || isSticker(a)));
}

/**
 * Pure: placeholder text for a message that has attachments but nothing else to show, or '' when
 * there are none. "[Sent a Sticker]" lets the AI react like a person would.
 */
function placeholderFor(msg) {
  const list = Array.isArray(msg?.attachments) ? msg.attachments.filter(Boolean) : [];
  if (!list.length) return '';
  if (list.some(a => /like_heart/i.test(String(a.type || '')))) return '[Sent a ❤️]';
  if (list.some(isSticker)) return '[Sent a Sticker]';
  return '[Sent an attachment]';
}

module.exports = { isSticker, shapeOf, unknownAttachments, placeholderFor, KNOWN_TYPES };
