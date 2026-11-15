/**
 * Pure rules for the memory agent (no DB, no network): applying its review of one person's facts
 * safely. Facts you added yourself (source "you") are never touched, and one review never removes
 * more than a third of the facts.
 */
function applyReview(facts, review, { maxDropShare = 1 / 3 } = {}) {
  const list = Array.isArray(facts) ? facts : [];
  const learned = i => list[i] && list[i].source !== 'you';
  const drop = new Set();
  const reasons = [];
  for (const d of review?.drop || []) {
    const i = Number(d?.index);
    if (Number.isInteger(i) && learned(i)) { drop.add(i); reasons.push(`removed "${list[i].fact}" (${String(d.reason || 'wrong').slice(0, 80)})`); }
  }
  const merged = [];
  for (const m of review?.merge || []) {
    const idx = (m?.indices || []).map(Number).filter(i => Number.isInteger(i) && learned(i) && !drop.has(i));
    const text = String(m?.text || '').trim();
    if (idx.length < 2 || !text) continue;
    idx.forEach(i => drop.add(i));
    merged.push({ fact: text.slice(0, 300), date: list[idx[0]].date, source: 'learned' });
    reasons.push(`merged ${idx.length} facts into "${text.slice(0, 80)}"`);
  }
  // Safety: a review that would remove too much is not applied at all
  const removed = drop.size - merged.length;
  if (removed > Math.ceil(list.length * maxDropShare)) return { facts: list, changes: [], skipped: true };
  const out = list.filter((_, i) => !drop.has(i)).concat(merged);
  return { facts: out, changes: reasons, skipped: false };
}

/**
 * The name most facts are about, when it is not the person's current name: a sign they were
 * renamed (or merged) and the facts still use the old name. Needs at least 3 facts and over 40%
 * of them starting with that name. Returns the old name or null.
 */
function detectNameDrift(facts, currentName, { minFacts = 3, share = 0.4 } = {}) {
  const list = (facts || []).map(f => String(f?.fact || f || '')).filter(Boolean);
  if (list.length < minFacts) return null;
  const counts = new Map();
  for (const t of list) {
    // "Laptop upgrade: Rajveer's laptop ..." or "Rajveer is studying ..." -> the subject name
    const body = t.includes(':') ? t.slice(t.indexOf(':') + 1).trim() : t;
    const m = body.match(/^([A-Z][\p{L}]{2,20})(?:'s|\s)/u);
    if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  // The card name in plain letters ("✩𝑆𝒶𝓊𝓂𝓎𝒶✩" -> "saumya"), so a fancy font is not a different name
  const cur = plainName(currentName);
  const skip = new Set(['she', 'he', 'they', 'the', 'their', 'his', 'her', 'shared', 'wanted', 'mentioned', 'said', 'sent', 'likes', 'loves', 'has', 'is', 'was',
    'user', 'users', 'contact', 'person', 'friend', 'sender', 'someone', 'owner', 'sam', 'samjoshua']);
  const [name, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if (!name || skip.has(name.toLowerCase())) return null;
  const plain = plainName(name);
  if (!cur || plain === cur || cur.includes(plain) || plain.includes(cur)) return null;
  return n >= minFacts && n / list.length > share ? name : null;
}

/** Letters only, lower case, fancy fonts folded to plain ("𝑆𝒶𝓊𝓂𝓎𝒶" -> "saumya", "ليو" stays). */
function plainName(name) {
  return String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}]/gu, '');
}

module.exports = { applyReview, detectNameDrift, plainName };
