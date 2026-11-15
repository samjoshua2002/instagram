/**
 * The memory agent: runs inside the app, on its own, one person per pass.
 *  - reviews what the AI learned about them (facts) against their memory document and what you
 *    told it: merges duplicates, removes facts the chats or your corrections contradict, fixes
 *    old names, and turns real doubts into questions for you on their page;
 *  - cleans up index data left by deleted contacts;
 *  - logs everything it changed (AgentAction), shown on Home.
 * Facts you added yourself are never touched.
 */
const UserMemory = require('../models/UserMemory');
const PersonMemory = require('../models/PersonMemory');
const MemoryChunk = require('../models/MemoryChunk');
const AgentAction = require('../models/AgentAction');
const { applyReview } = require('./memoryAgentRules');

const REVIEW_EVERY_MS = 24 * 3600 * 1000;

async function reviewPerson(pm) {
  const mem = await UserMemory.findOne({ ownerId: pm.ownerId || null, senderId: pm.senderId });
  if (!mem || (mem.facts || []).length < 4) {
    await PersonMemory.updateOne({ _id: pm._id }, { $set: { lastReviewedAt: new Date() } });
    return null;
  }
  const azureOpenAI = require('./azureOpenAI');
  const model = process.env.FAST_MODEL || 'gpt-5.4-mini';
  const name = pm.name || mem.name || 'them';
  const factsText = mem.facts.map((f, i) => `${i}. ${f.source === 'you' ? '[owner] ' : ''}${f.fact}`).join('\n');
  const review = await azureOpenAI.jsonWithFallback(model, [
    { role: 'system', content: `You check an AI's remembered facts about ${name} for its owner. Compare the numbered facts with the memory document (from their real chats) and with what the owner said (always true).
- drop: facts that are wrong (contradicted by the owner or the document), about the wrong person, or junk. Not facts that are merely missing from the document.
- merge: groups of facts saying the same thing, with one clear combined sentence.
- doubts: questions for the owner where facts conflict and you can't tell which is right (max 3).
Never touch facts marked [owner]. Be conservative: when unsure, keep the fact.
Return JSON only: {"drop": [{"index": n, "reason": "..."}], "merge": [{"indices": [n, m], "text": "..."}], "doubts": [{"question": "...", "about": "..."}]}` },
    { role: 'user', content: `Current name: ${name}\nOWNER SAID (always true):\n${(pm.ownerFacts || []).map(f => `- ${f.text}`).join('\n') || '- nothing'}\n\nMEMORY DOCUMENT:\n${String(pm.doc || '').slice(0, 6000) || '(not written yet)'}\n\nFACTS:\n${factsText.slice(0, 12000)}` },
  ]);
  const { facts, changes, skipped } = applyReview(mem.facts.map(f => f.toObject ? f.toObject() : f), review);
  if (!skipped && changes.length) {
    mem.facts = facts;
    await mem.save();
  }
  const doubts = (review?.doubts || []).filter(d => d && d.question).slice(0, 3);
  if (doubts.length) {
    const known = new Set((pm.doubts || []).map(d => d.question.toLowerCase()));
    const fresh = doubts.filter(d => !known.has(String(d.question).toLowerCase()))
      .map(d => ({ question: String(d.question).slice(0, 200), about: String(d.about || '').slice(0, 60) }));
    if (fresh.length) await PersonMemory.updateOne({ _id: pm._id }, { $push: { doubts: { $each: fresh } } });
  }
  await PersonMemory.updateOne({ _id: pm._id }, { $set: { lastReviewedAt: new Date(), ...(changes.length ? { rebuildDoc: true, dirty: true } : {}) } });
  if (changes.length || doubts.length || skipped) {
    await AgentAction.create({
      ownerId: pm.ownerId || null, senderId: pm.senderId, name, kind: 'review',
      summary: skipped ? 'Review too big to apply safely; nothing changed'
        : [changes.length && `${changes.length} fix${changes.length === 1 ? '' : 'es'}`, doubts.length && `${doubts.length} question${doubts.length === 1 ? '' : 's'} for you`].filter(Boolean).join(', '),
      details: changes.slice(0, 30),
    });
  }
  console.log(`🧹 [Memory agent] ${name}: ${changes.length} fixes, ${doubts.length} questions${skipped ? ' (skipped: too big)' : ''}`);
  return { changes, doubts };
}

/** Index data for contacts that no longer exist. */
async function cleanup() {
  const ids = new Set((await UserMemory.find({}, { senderId: 1 }).lean()).map(m => m.senderId));
  const orphans = (await PersonMemory.find({}, { senderId: 1, ownerId: 1 }).lean()).filter(p => !ids.has(p.senderId));
  for (const o of orphans) {
    await MemoryChunk.deleteMany({ ownerId: o.ownerId || null, senderId: o.senderId });
    await PersonMemory.deleteOne({ _id: o._id });
  }
  if (orphans.length) {
    await AgentAction.create({ kind: 'cleanup', summary: `Removed memory of ${orphans.length} deleted contact(s)` });
    console.log(`🧹 [Memory agent] Cleaned ${orphans.length} deleted contact(s)`);
  }
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const pm = await PersonMemory.findOne({
      status: 'ready', doc: { $ne: '' },
      $or: [{ lastReviewedAt: null }, { lastReviewedAt: { $lte: new Date(Date.now() - REVIEW_EVERY_MS) } }],
    }).sort({ lastReviewedAt: 1, totalMessages: -1 });
    if (pm) await reviewPerson(pm);
  } catch (err) {
    console.warn('⚠️ [Memory agent]', err.message);
  } finally {
    running = false;
  }
}

function startScheduler() {
  const t = setInterval(() => { tick().catch(() => {}); }, 3 * 60 * 1000);
  if (t.unref) t.unref();
  const c = setInterval(() => { cleanup().catch(() => {}); }, 6 * 3600 * 1000);
  if (c.unref) c.unref();
  setTimeout(() => { cleanup().catch(() => {}); }, 5 * 60 * 1000);
  console.log('🧹 [Memory agent] Reviewing one person every 3 min');
}

module.exports = { reviewPerson, cleanup, tick, startScheduler };
