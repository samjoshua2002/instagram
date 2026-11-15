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

module.exports = { applyReview };
