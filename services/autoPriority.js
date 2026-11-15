/**
 * Priority ranking worked out from what the AI knows: friendship score (labels, bond read from your
 * chats, how much and how long you've talked), brain score, and how recently you talked.
 * Anyone you ranked yourself keeps your tier and place; everyone else is re-ranked by the memory
 * agent's health check (every 30 min), so the list keeps up as friendships change.
 */
const DAY = 86400000;
const MAX_TOP = 10;

function activity(lastSeen, now = Date.now()) {
  const t = lastSeen ? new Date(lastSeen).getTime() : NaN;
  if (!Number.isFinite(t)) return 0;
  const days = (now - t) / DAY;
  return days <= 7 ? 100 : days <= 30 ? 70 : days <= 90 ? 40 : days <= 180 ? 15 : 0;
}

/** Pure: people [{id, closeness, brain, bond, lastSeen, category}] -> {id: {priority, score, reason}} */
function autoTiers(people, now = Date.now()) {
  const scored = people.map(p => {
    const act = activity(p.lastSeen, now);
    const score = Math.round(0.55 * (p.closeness || 0) + 0.15 * (p.brain || 0) + 0.30 * act);
    let priority = 'normal';
    let reason = 'friend you talk to';
    if (p.family || ['family', 'partner'].includes(p.bond)) { priority = 'top'; reason = p.bond === 'partner' ? 'partner' : 'family'; }
    else if ((p.closeness || 0) >= 75 && act >= 40) { priority = 'top'; reason = 'close and talking lately'; }
    else if (['business', 'professional'].includes(p.category) && (p.closeness || 0) < 50) { priority = 'low'; reason = 'work contact'; }
    else if ((p.closeness || 0) < 25 && act < 40) { priority = 'low'; reason = 'barely know them'; }
    else if (act === 0 && (p.closeness || 0) < 50) { priority = 'low'; reason = 'no chats in 6 months'; }
    return { id: p.id, priority, score, reason };
  }).sort((a, b) => b.score - a.score);
  // Top stays a short list: the best-scored ones (family always stays)
  let tops = 0;
  for (const s of scored) {
    if (s.priority !== 'top') continue;
    tops += 1;
    if (tops > MAX_TOP && !['family', 'partner'].includes(s.reason)) { s.priority = 'normal'; s.reason = 'close (top list full)'; }
  }
  return Object.fromEntries(scored.map(s => [s.id, s]));
}

/** Pure: places manual people at their own rank, auto people fill the free places by score. */
function mergeRanks(manual, auto) {
  const out = [];
  const taken = new Set();
  manual.filter(m => Number.isFinite(m.rank) && m.rank > 0).sort((a, b) => a.rank - b.rank)
    .forEach(m => { let r = m.rank; while (taken.has(r)) r += 1; taken.add(r); out.push({ id: m.id, rank: r }); });
  let r = 1;
  for (const a of auto) { while (taken.has(r)) r += 1; taken.add(r); out.push({ id: a.id, rank: r }); }
  manual.filter(m => !(Number.isFinite(m.rank) && m.rank > 0)).forEach(m => { while (taken.has(r)) r += 1; taken.add(r); out.push({ id: m.id, rank: r }); });
  return out;
}

/** Re-ranks one owner's people (skips anyone you ranked yourself). Returns how many changed. */
async function refresh(ownerId) {
  const SocialGraph = require('../models/SocialGraph');
  const UserMemory = require('../models/UserMemory');
  const PersonMemory = require('../models/PersonMemory');
  const User = require('../models/User');
  const { computeCloseness } = require('./closeness');
  const socialGraphService = require('./socialGraphService');
  const owner = await User.findById(ownerId, { username: 1, instagramUsername: 1 }).lean();
  const me = new Set([owner?.username, owner?.instagramUsername].filter(Boolean).map(h => String(h).replace(/^@+/, '').toLowerCase()));
  const nodes = (await SocialGraph.find({ ownerId, senderId: { $nin: [null, ''] } },
    { senderId: 1, name: 1, instagramHandle: 1, category: 1, relationshipToSam: 1, chatsCount: 1, closenessOverride: 1, priority: 1, priorityRank: 1, prioritySource: 1 }).lean())
    .filter(n => !/^test_/.test(String(n.senderId)) && !me.has(String(n.instagramHandle || '').replace(/^@+/, '').toLowerCase()));
  if (!nodes.length) return 0;
  const ids = nodes.map(n => String(n.senderId));
  const [mems, pms] = await Promise.all([
    UserMemory.find({ ownerId, senderId: { $in: ids } }, { senderId: 1, relationshipType: 1, messageCount: 1, createdAt: 1, lastInteraction: 1 }).lean(),
    PersonMemory.find({ ownerId, senderId: { $in: ids } }, { senderId: 1, bond: 1, brainScore: 1 }).lean(),
  ]);
  const memBy = new Map(mems.map(m => [String(m.senderId), m]));
  const pmBy = new Map(pms.map(p => [String(p.senderId), p]));
  const autoNodes = nodes.filter(n => n.prioritySource !== 'you');
  const tiers = autoTiers(autoNodes.map(n => {
    const m = memBy.get(String(n.senderId)) || {};
    const p = pmBy.get(String(n.senderId)) || {};
    const c = computeCloseness({
      category: n.category, relationshipToSam: n.relationshipToSam, relationshipType: m.relationshipType,
      chatsCount: n.chatsCount || m.messageCount, firstSeen: m.createdAt, lastSeen: m.lastInteraction,
      override: n.closenessOverride || '', memoryBond: p.bond || '', familyRole: socialGraphService.familyRole,
    });
    const role = socialGraphService.familyRole(n.relationshipToSam);
    return { id: String(n.senderId), closeness: c.score, brain: p.brainScore || 0, bond: p.bond || (role === 'partner' ? 'partner' : ''), family: (!!role && role !== 'partner') || ['family', 'relative'].includes(n.category), lastSeen: m.lastInteraction, category: n.category };
  }));
  const ops = [];
  for (const tier of ['top', 'normal', 'low']) {
    const manual = nodes.filter(n => n.prioritySource === 'you' && n.priority === tier).map(n => ({ id: String(n.senderId), rank: n.priorityRank }));
    const auto = Object.values(tiers).filter(t => t.priority === tier);
    for (const { id, rank } of mergeRanks(manual, auto)) {
      const n = nodes.find(x => String(x.senderId) === id);
      const t = tiers[id];
      if (n.priorityRank === rank && (!t || (n.priority === t.priority && n.prioritySource === 'auto'))) continue;
      ops.push({ updateOne: { filter: { _id: n._id }, update: { $set: t ? { priority: t.priority, priorityRank: rank, prioritySource: 'auto', priorityReason: t.reason } : { priorityRank: rank } } } });
    }
  }
  if (ops.length) await SocialGraph.bulkWrite(ops, { ordered: false });
  return ops.length;
}

module.exports = { autoTiers, mergeRanks, activity, refresh };
