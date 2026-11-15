/**
 * Pure checks for messages that matter (no DB, no network), used by importantService.
 * A cheap first pass: only messages that look important are sent to the AI to confirm.
 */
const URL_RE = /\bhttps?:\/\/[^\s<>"')]+|\b(?:www\.)[^\s<>"')]+|\b(?:lichess\.org|chess\.com|meet\.google\.com|zoom\.us|discord\.gg|t\.me|wa\.me|forms\.gle|bit\.ly)\/[^\s<>"')]*/gi;

const CUES = [
  ['invite', /\b(let'?s|lets|wanna|want to|shall we|can we|come|join|play|invite|party|hang ?out|meet ?up|call me|vc|video call|game|match|chess|movie|trip|treat)\b/i],
  ['money', /(₹|\brs\.?\s?\d|\binr\b|\bgpay\b|\bupi\b|\bpaytm\b|\bphonepe\b|\bpay\b|\bpayment\b|\bsend money\b|\bloan\b|\bborrow\b|\bowe\b)/i],
  ['urgent', /\b(urgent|asap|emergency|help me|please reply|pls reply|important|hospital|accident|call me now)\b/i],
  ['request', /\b(can you|could you|pls|please|need (you|ur|your)|send me|share (the|ur|your)|do me a favou?r)\b/i],
  ['plan', /\b(tomorrow|tonight|today|this (weekend|evening|week)|at \d{1,2}(:\d{2})?\s?(am|pm)?|on (mon|tue|wed|thu|fri|sat|sun))/i],
];

function extractLinks(text) {
  return [...new Set((String(text || '').match(URL_RE) || []).map(u => u.replace(/[.,!?]+$/, '')))].slice(0, 10);
}

/** Categories the message looks like (first pass). */
function cues(text) {
  const t = String(text || '');
  return CUES.filter(([, re]) => re.test(t)).map(([k]) => k);
}

/** Worth asking the AI whether it needs the owner? */
function looksImportant(text, { hasAttachment = false } = {}) {
  const c = cues(text);
  if (c.includes('urgent') || c.includes('money')) return true;
  if (c.includes('invite') && (c.includes('plan') || /\?/.test(text) || extractLinks(text).length)) return true;
  if (c.includes('request') && /\?/.test(text)) return true;
  return hasAttachment || extractLinks(text).length > 0;
}

/** Attachment type from Instagram -> our kind. */
function kindOf(type, url = '') {
  const t = String(type || '').toLowerCase();
  if (t === 'image' || t === 'sticker' || t === 'animated_image') return 'photo';
  if (t === 'video') return 'video';
  if (t === 'audio') return 'voice';
  if (t === 'file') return 'file';
  if (t === 'ig_reel' || t === 'reel' || /\/reels?\//.test(url)) return 'reel';
  if (t === 'ig_post' || t === 'share' || t === 'post') return 'post';
  return 'file';
}

// A reply that says yes on the owner's behalf ("sure", "let's play", "send the link", "I'll pay")
const COMMIT_RE = /(^|[\s,.!])(sure|ok(ay)?|okk+|yes+|yeah|ya+|yep|yup|bet|deal|done|i'?m in|im in|count me in|why not|let'?s (go|do it|play|start|meet)|lets (go|do it|play|start|meet)|send (the |me the |me |)link|i'?ll (come|join|be there|pay|send|transfer)|coming|on my way|omw|start the game|accept(ed)?)(?=$|[\s,.!?])/i;
const HOLDING = ['wait lemme see', 'hmm lemme check and tell u', 'maybe, will tell u in a bit', 'ooh lemme see if i can', 'lemme check rn'];

/** True when a reply commits the owner to something. */
function commitsOwner(reply) {
  return COMMIT_RE.test(String(reply || '').toLowerCase());
}

/** A natural "not yet" reply that keeps it open without agreeing. */
function holdingReply(seed = Math.random()) {
  return HOLDING[Math.floor(seed * HOLDING.length) % HOLDING.length];
}

module.exports = { extractLinks, cues, looksImportant, kindOf, commitsOwner, holdingReply };
