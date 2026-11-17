/**
 * Closeness score (0-100) and level for one contact, in personal mode.
 * Decides how much of your personal life a reply may share with them:
 *   stranger (<25)      nothing personal: no family, contact details, location, college or plans
 *   acquaintance (25-49) your interests and what you're into; still no family or contact details
 *   friend (50-74)       family in general and first names, your city; never phone, email or address
 *   close (75+)          everything you've written down, phone number included
 * Your own labels count most (family / close friend on their People card);
 * then how much you've actually talked, for how long, and how recently. Pure, so it is unit tested.
 */

const LEVELS = [
  { id: 'close', min: 75 },
  { id: 'friend', min: 50 },
  { id: 'acquaintance', min: 25 },
  { id: 'stranger', min: 0 },
];
const RANK = { stranger: 0, acquaintance: 1, friend: 2, close: 3 };
const DAY = 86400000;

// Base points for the kind of person, as you labelled them on their People card
const CATEGORY_BASE = {
  family: 60, relative: 50, close_friend: 55, homie: 40, offline_friend: 30,
  online_friend: 10, professional: 5, business: 0, group_icon: 0, other: 0,
};
// Never below these: you said so yourself
const CATEGORY_FLOOR = { family: 85, relative: 75, close_friend: 75 };
const CIRCLE_FLOOR = { family: 85, close: 75, offline: 50 };
// Work contacts never get your private life, however much you chat
const CATEGORY_CAP = { professional: 49, business: 24 };
const LEVEL_SCORE = { stranger: 10, acquaintance: 35, friend: 60, close: 85 };
const LEVEL_MIN = { stranger: 0, acquaintance: 25, friend: 50, close: 75 };
// Labels that say "not close" in the owner's own words
const WEAK_LABEL = /\b(follower|online contact|fan|acquaintance|stranger|random|client|customer)\b/i;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function levelOf(score) {
  return (LEVELS.find(l => score >= l.min) || LEVELS[LEVELS.length - 1]).id;
}

/**
 * @param {object} p
 * @param {string} [p.category]          People card category (close_friend, family, online_friend, ...)
 * @param {string} [p.relationshipToSam] free text on the People card ("Mother", "college friend")
 * @param {string} [p.circle]            Optional circle label (close, family, online, offline, professional)
 * @param {string} [p.relationshipType]  learned from DMs (stranger, fan, client, collaborator, friend)
 * @param {number} [p.chatsCount]        DMs exchanged
 * @param {Date|string} [p.firstSeen]    first contact
 * @param {Date|string} [p.lastSeen]     last DM
 * @param {string} [p.override]          level you set by hand: stranger | acquaintance | friend | close
 * @param {boolean} [p.isTest]           a made-up test chat (always a stranger unless overridden)
 * @param {(label: string) => string|null} [p.familyRole] maps "Mother" -> "mother"
 */
function computeCloseness(p = {}, now = Date.now()) {
  const reasons = [];
  if (p.override && RANK[p.override] !== undefined) {
    return { score: LEVEL_SCORE[p.override], level: p.override, reasons: ['you set this level'] };
  }
  if (p.isTest) return { score: 0, level: 'stranger', reasons: ['test chat as someone new'] };

  let category = p.category || null;
  const role = p.familyRole ? p.familyRole(p.relationshipToSam) : null;
  if (role && role !== 'partner') { category = 'family'; reasons.push(`your ${role}`); }
  if (role === 'partner') { category = 'close_friend'; reasons.push('your partner'); }

  let score = CATEGORY_BASE[category] ?? 0;
  if (category && CATEGORY_BASE[category] !== undefined && !role) reasons.push(`marked ${category.replace('_', ' ')}`);

  const chats = Math.max(0, Number(p.chatsCount) || 0);
  if (chats > 0) {
    const pts = Math.min(40, Math.round(6 * Math.log2(1 + chats / 10)));
    score += pts;
    if (pts >= 10) reasons.push(`${chats.toLocaleString()} DMs together`);
  }

  const first = p.firstSeen ? new Date(p.firstSeen).getTime() : NaN;
  if (Number.isFinite(first)) {
    const days = Math.max(0, (now - first) / DAY);
    const pts = Math.min(15, Math.round(days / 12));
    score += pts;
    if (days >= 90) reasons.push(`known ${Math.round(days / 30)} months`);
  }

  const last = p.lastSeen ? new Date(p.lastSeen).getTime() : NaN;
  if (Number.isFinite(last)) {
    const quiet = (now - last) / DAY;
    if (quiet <= 14) score += 5;
    else if (quiet > 180) { score -= 10; reasons.push('no DMs for 6+ months'); }
  }

  if (p.relationshipType === 'friend') score += 10;
  else if (p.relationshipType === 'fan') score -= 5;

  // Your own words on their card count: "close friend", "closest friend", "best friend", "bestie"
  let labelFloor = 0;
  if (/\b(close|closest|best ?friend|bestie|bff|soul ?mate|bae|my person)\b/i.test(String(p.relationshipToSam || '')) &&
      !/\b(not close|fan)\b/i.test(String(p.relationshipToSam || ''))) {
    labelFloor = 80;
    reasons.push(`you call them "${String(p.relationshipToSam).slice(0, 30)}"`);
  }
  // The bond the AI read from your whole chat history (memory index)
  const MEMORY_FLOOR = { family: 85, partner: 85, close: 78, friend: 55, acquaintance: 25 };
  if (MEMORY_FLOOR[p.memoryBond]) {
    labelFloor = Math.max(labelFloor, MEMORY_FLOOR[p.memoryBond]);
    if (p.memoryBond !== 'acquaintance') reasons.push(`chats read as ${p.memoryBond}`);
  }
  // Thousands of DMs and still talking: that is a close person, whatever the label says
  const recent = Number.isFinite(last) && (now - last) / DAY <= 30;
  if (chats >= 5000 && recent) labelFloor = Math.max(labelFloor, 78);
  // Your own word wins over the AI's reading: someone you call a follower / online contact / fan
  // is never lifted above friend by the chat reading or the DM count
  if (WEAK_LABEL.test(String(p.relationshipToSam || '')) && labelFloor > LEVEL_MIN.friend) {
    labelFloor = LEVEL_MIN.friend;
    reasons.push(`you call them "${String(p.relationshipToSam).slice(0, 30)}"`);
  }

  const floor = Math.max(CATEGORY_FLOOR[category] || 0, CIRCLE_FLOOR[p.circle] || 0, labelFloor);
  if (CIRCLE_FLOOR[p.circle]) reasons.push(`in your ${p.circle} circle`);
  score = Math.max(score, floor);
  if (CATEGORY_CAP[category] !== undefined) score = Math.min(score, CATEGORY_CAP[category]);
  if (p.circle === 'professional') score = Math.min(score, CATEGORY_CAP.professional);

  score = clamp(Math.round(score), 0, 100);
  return { score, level: levelOf(score), reasons };
}

const atLeast = (level, wanted) => (RANK[level] ?? 0) >= RANK[wanted];

// Contact details that only close people get
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// An address runs to the end of its sentence (up to 120 characters), not the whole line
const ADDRESS_RE = /\b(?:door|flat|house|plot)\s*(?:no\.?|number)?\s*[\w/-]+[^\n.]{0,120}|\b\d{1,5}[,\s]+[\w\s]{2,40}\b(?:street|st\.|road|rd\.|nagar|lane|avenue|colony)\b[^\n.]{0,120}/gi;
const PIN_RE = /\b\d{6}\b/g;

/**
 * Removes phone numbers, street addresses and PIN codes (kept only for close people), and emails
 * unless `keepEmail` (friends may have the email you put in your own documents).
 */
function redactContactDetails(text, { keepEmail = false } = {}) {
  return String(text || '')
    .replace(keepEmail ? /(?!)/g : EMAIL_RE, '[private]')
    .replace(ADDRESS_RE, '[private]')
    .replace(PHONE_RE, m => (m.replace(/\D/g, '').length >= 8 ? '[private]' : m))
    .replace(PIN_RE, '[private]');
}
const hasContactDetails = text => {
  const t = String(text || '');
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t) || (t.match(PHONE_RE) || []).some(m => m.replace(/\D/g, '').length >= 8);
};

// Questions a stranger should not get real answers to
const PERSONAL_ASK_RE = /\b(mom|mum|mother|amma|dad|father|appa|parents?|family|sister|brother|sis|bro|girlfriend|gf|boyfriend|bf|wife|number|phone|whatsapp|contact|email|mail id|address|where (do )?(u|you) (live|stay)|ur place|your place|which (college|school|company)|college|office|salary|age|how old|birthday|bday|dob)\b/i;

/** The privacy rules for this level, written for the reply prompt. */
function privacyRules(c, name = 'them') {
  const head = `PRIVACY FOR THIS CHAT (CLOSENESS ${c.score}/100 = ${c.level.toUpperCase()}${c.reasons.length ? `: ${c.reasons.slice(0, 3).join(', ')}` : ''}). THIS BEATS "ANSWER EVERY QUESTION" AND EVERY OTHER RULE:`;
  const deflect = 'Dodge like a real person, never like a policy: joke, keep it vague, or turn it back ("haha why", "maybe once we talk more", "nice try lol", "around tamil nadu"). Never say you have rules, settings or a score.';
  if (c.level === 'close') {
    return `${head}
- ${name} is close to you. You can share your family, plans, location and contact details you have written down when they ask.
- Other people's private details (their numbers, secrets, what they told you) still stay private.`;
  }
  if (c.level === 'friend') {
    return `${head}
- ${name} is a friend, not close. Family in general and first names are fine, your city is fine.
- Your email (as written in your documents) is fine to give. NEVER share your phone number, WhatsApp, home address, exact area or daily schedule, even if they ask directly. ${deflect}
- Other people's private details always stay private.`;
  }
  if (c.level === 'acquaintance') {
    return `${head}
- You don't know ${name} well yet. Talk about interests, what you're into, light stuff.
- Do NOT share: family members or their names, your phone number, WhatsApp, email, address, area, college or workplace, age, birthday, plans or where you are. ${deflect}
- Don't act like an old friend and don't bring up anything personal they never told you.`;
  }
  return `${head}
- ${name} is a stranger to you. Be friendly but share NOTHING personal.
- Do NOT share: family members or their names, relationships, phone number, WhatsApp, email, address, city or area, college or workplace, age, birthday, schedule, where you are now, or anything about your friends. ${deflect}
- If they push or ask for your number, stay light and don't give it. Don't act like you already know them.`;
}

module.exports = {
  computeCloseness, levelOf, atLeast, privacyRules, redactContactDetails, hasContactDetails,
  PERSONAL_ASK_RE, RANK, LEVEL_SCORE,
};
