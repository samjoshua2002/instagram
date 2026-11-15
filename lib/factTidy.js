// Keeping a person's remembered facts tidy. Pure functions (no database, no AI), so they can be tested.
//
// Past FACTS_BEFORE_TIDY facts, the older learned ones are condensed by the AI into a few lasting facts and the
// passing details are dropped. The newest FACTS_KEPT_FRESH stay word for word, and facts the owner typed in
// themselves (source "you") are never merged or dropped.
const FACTS_BEFORE_TIDY = 60;
const FACTS_KEPT_FRESH = 20;

/** Does this list need tidying, and which facts may be condensed? */
function tidyCandidates(facts, { before = FACTS_BEFORE_TIDY, fresh = FACTS_KEPT_FRESH } = {}) {
  const list = Array.isArray(facts) ? facts : [];
  if (list.length <= before) return [];
  return list.slice(0, Math.max(0, list.length - fresh)).filter(f => f && f.source !== 'you');
}

/**
 * The list after condensing: lasting facts first (dated like the oldest they replace), then the owner's own facts
 * from the older part, then the newest facts unchanged. Also returns the texts that were dropped, so the same
 * lines can leave the person's card. A condensing answer that isn't shorter changes nothing.
 */
function applyTidy(facts, lasting, { fresh = FACTS_KEPT_FRESH } = {}) {
  const list = Array.isArray(facts) ? facts : [];
  const cut = Math.max(0, list.length - fresh);
  const older = list.slice(0, cut);
  const newest = list.slice(cut);
  const learnedOld = older.filter(f => f && f.source !== 'you');
  const mine = older.filter(f => f && f.source === 'you');
  const clean = (Array.isArray(lasting) ? lasting : []).map(x => String(x || '').trim()).filter(Boolean);
  if (!clean.length || clean.length >= learnedOld.length) return { facts: list, retired: [] };
  const keep = new Set(clean.map(x => x.toLowerCase()));
  const retired = learnedOld.filter(f => !keep.has(String(f.fact).toLowerCase())).map(f => f.fact);
  const at = learnedOld[0]?.addedAt || new Date();
  return { facts: [...clean.map(fact => ({ fact, addedAt: at })), ...mine, ...newest], retired };
}

module.exports = { FACTS_BEFORE_TIDY, FACTS_KEPT_FRESH, tidyCandidates, applyTidy };
