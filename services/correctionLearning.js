/**
 * Learning from the owner's takeovers: the AI had a reply ready, the owner typed their own instead.
 * That (their message, AI draft, owner's real reply) is the strongest evidence of how the owner
 * really texts (PRELUDE/CIPHER, NeurIPS 2024: learning a short preference from user edits cut
 * later edits sharply, without fine-tuning).
 *
 * - Small differences are ignored (content-only or near-identical: weak evidence).
 * - A bigger one is explained by a fast model as one short style rule, matched against the rules
 *   already seen, so repeats count up instead of piling up.
 * - A rule becomes active (used in replies and check-ins) once agreeing takeovers outnumber
 *   contradicting ones by 3; rules contradicted as often as they are confirmed are retired.
 * Only the owner's own typed messages are learned from, never the AI's.
 */
const StylePreference = require('../models/StylePreference');

const MIN_EDIT_RATIO = 0.35;   // below this the owner's reply was basically the AI's
const PROMOTE_AT = 3;
const FAST = () => process.env.FAST_MODEL || 'gpt-5.4-mini';

const norm = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 400);

/** Pure: Levenshtein distance divided by the longer length (0 = same, 1 = nothing in common). */
function editRatio(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x && !y) return 0;
  if (!x || !y) return 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= y.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length] / Math.max(x.length, y.length);
}

/** Pure: the new state of a rule after one more agreeing or contradicting takeover. */
function nextStatus({ support = 0, contradictions = 0, status = 'candidate' }) {
  if (contradictions > 0 && contradictions >= support) return 'retired';
  // Active once agreeing takeovers outnumber contradicting ones by PROMOTE_AT (3-0, 4-1, 7-1...):
  // one odd takeover can't block a rule you keep confirming, and can't push in a new one either
  if (support - contradictions >= PROMOTE_AT) return 'active';
  return status === 'retired' ? 'retired' : 'candidate';
}

/** Re-applies nextStatus to the owner's saved rules (rules saved under an older promotion rule). */
async function refreshStatuses(ownerId) {
  const rules = await StylePreference.find({ ownerId, status: { $ne: 'retired' } })
    .select('support contradictions status').lean();
  const changed = rules.filter(r => nextStatus(r) !== r.status);
  await Promise.all(changed.map(r => StylePreference.updateOne({ _id: r._id }, { $set: { status: nextStatus(r) } })));
  return changed.length;
}

async function bump(id, field, example) {
  const doc = await StylePreference.findByIdAndUpdate(id, {
    $inc: { [field]: 1 },
    ...(example ? { $push: { examples: { $each: [example], $slice: -6 } } } : {}),
  }, { returnDocument: 'after' });
  if (!doc) return null;
  const status = nextStatus(doc);
  if (status !== doc.status) await StylePreference.updateOne({ _id: doc._id }, { $set: { status } });
  return { ...doc.toObject(), status };
}

/**
 * Records one takeover and updates the learned rules. Never throws.
 * @returns {Promise<{ignored?: string, rule?: object}>}
 */
async function record({ ownerId, senderId = '', contactName = '', incoming = '', draft = '', human = '', ai = null }) {
  try {
    if (!ownerId || !draft || !human) return { ignored: 'missing' };
    if (/^\[(?:STICKER|ATTACHMENT|Shared Media|Media)/i.test(human)) return { ignored: 'media' };
    const ratio = editRatio(draft, human);
    if (ratio < MIN_EDIT_RATIO) return { ignored: 'small edit' };

    const existing = await StylePreference.find({ ownerId, status: { $ne: 'retired' }, senderId: { $in: ['', String(senderId)] } })
      .sort({ support: -1 }).limit(30).lean();
    const azureOpenAI = ai || require('./azureOpenAI');
    const out = await azureOpenAI.jsonWithFallback(FAST(), [
      { role: 'system', content: `The owner of an Instagram account had an AI reply ready, but typed their own reply instead. Find what the difference says about HOW the owner texts (style only: length, language mix like Tanglish, slang, nicknames, greetings, casing, emoji, tone, directness).
Ignore differences in facts or plans: those are not style.
Write at most one short rule in second person, e.g. "Reply in Tanglish with 'da', not formal English" or "Keep it to 2-4 words".
Say if it applies to everyone or only to this contact, and if it is the same as, or the opposite of, a rule already known.
JSON only: {"rule": "<rule or empty if the difference is not about style>", "scope": "everyone"|"contact", "same_as": "<id or empty>", "contradicts": "<id or empty>"}` },
      { role: 'user', content: `KNOWN RULES:\n${existing.map(r => `${r._id}: ${r.text}${r.senderId ? ` (only ${r.contactName || 'this contact'})` : ''}`).join('\n') || '(none)'}\n\n${contactName ? `CONTACT: ${contactName}\n` : ''}THEY SENT: ${String(incoming).slice(0, 400)}\nAI DRAFT: ${String(draft).slice(0, 400)}\nOWNER ACTUALLY SENT: ${String(human).slice(0, 400)}` },
    ]);
    const rule = String(out?.rule || '').trim().slice(0, 200);
    const example = { incoming: String(incoming).slice(0, 300), draft: String(draft).slice(0, 300), human: String(human).slice(0, 300), at: new Date() };
    const ids = new Set(existing.map(r => String(r._id)));
    if (out?.contradicts && ids.has(String(out.contradicts))) await bump(out.contradicts, 'contradictions', null);
    if (!rule) return { ignored: 'not style' };
    if (out?.same_as && ids.has(String(out.same_as))) return { rule: await bump(out.same_as, 'support', example) };
    const doc = await StylePreference.create({
      ownerId, senderId: out?.scope === 'contact' ? String(senderId) : '', contactName: out?.scope === 'contact' ? contactName : '',
      text: rule, status: 'candidate', support: 1, examples: [example],
    });
    return { rule: doc.toObject() };
  } catch (err) {
    console.warn('⚠️ [Learning] takeover not learned:', err.message);
    return { ignored: 'error' };
  }
}

/** Prompt block with the active rules for this contact (theirs first, then everyone's). */
async function activeBlock(ownerId, senderId = '') {
  if (!ownerId) return '';
  const rules = await StylePreference.find({ ownerId, status: 'active', senderId: { $in: ['', String(senderId)] } })
    .sort({ senderId: -1, support: -1 }).limit(12).lean().catch(() => []);
  if (!rules.length) return '';
  return `YOUR CONFIRMED TEXTING RULES (learned from times you replied yourself instead of the AI; follow them):\n${rules.map(r => `- ${r.text}`).join('\n')}\n`;
}

module.exports = { record, activeBlock, editRatio, nextStatus, refreshStatuses, MIN_EDIT_RATIO, PROMOTE_AT };
