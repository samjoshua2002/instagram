/**
 * The voice checker tests itself, so nobody has to label replies by hand.
 *
 * The owner's own typed messages are ground truth: they ARE the owner, so a good checker passes
 * almost all of them. It also scores the AI's messages. If it passes the owner's real messages
 * reliably (85%+) and scores the AI clearly lower, it is trusted and may rewrite replies for this
 * account by itself; otherwise it only watches. Runs once a day per active account (and on demand
 * from the Voice Check page). Owners can still rate replies by hand; that is optional.
 */
const VoiceAudit = require('../models/VoiceAudit');

const SAMPLE = 12;
const TRUST_REAL_PASS = 85;  // % of the owner's own messages it must pass
const TRUST_GAP = 10;        // average score gap between the owner's messages and the AI's
const STALE_MS = 24 * 3600 * 1000;

/** Pure: is the checker trustworthy from one self-test? */
function verdictOf({ realCount, realPass, realAvg, aiCount, aiAvg }) {
  if (realCount < 8 || aiCount < 8) return { trusted: false, reason: 'not enough messages yet' };
  if (realPass < TRUST_REAL_PASS) return { trusted: false, reason: `it failed ${100 - realPass}% of your own real messages, so it would wrongly rewrite you` };
  if (realAvg - aiAvg < TRUST_GAP) return { trusted: false, reason: 'it scores the AI about the same as you, so it cannot tell the difference' };
  return { trusted: true, reason: `it passes ${realPass}% of your real messages and scores the AI lower` };
}

const pick = (list, n) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
};

/** Runs one self-test for this account and saves it. */
async function audit(ownerId) {
  const Message = require('../models/Message');
  const voiceCheck = require('./voiceCheck');
  const ai = require('./azureOpenAI');
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const words = t => String(t || '').trim().split(/\s+/).length;
  const ok = t => t && words(t) >= 2 && !/^\[|https?:\/\//.test(t);
  const base = { ownerId, role: 'assistant', createdAt: { $gte: since }, isReminder: { $ne: true } };
  const [mine, ais] = await Promise.all([
    Message.find({ ...base, sentByAI: { $ne: true }, isCheckIn: { $ne: true } }).sort({ createdAt: -1 }).limit(600).select('text').lean(),
    Message.find({ ...base, sentByAI: true }).sort({ createdAt: -1 }).limit(300).select('text').lean(),
  ]);
  const real = pick(mine.map(m => m.text).filter(ok), 60);
  // The checker compares against your messages: a style sample that never includes the one being scored
  const testReal = real.slice(0, SAMPLE);
  const style = real.slice(SAMPLE).map(t => `you: ${t}`).join('\n');
  const testAi = pick(ais.map(m => m.text).filter(ok), SAMPLE);
  const score = async t => (await voiceCheck.judge({ draft: t, style, ai }))?.score;
  const realScores = (await Promise.all(testReal.map(score))).filter(Number.isFinite);
  const aiScores = (await Promise.all(testAi.map(score))).filter(Number.isFinite);
  const th = voiceCheck.PASS_SCORE;
  const avg = l => (l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : 0);
  const share = l => (l.length ? Math.round(100 * l.filter(s => s >= th).length / l.length) : 0);
  const row = {
    ownerId, threshold: th,
    realCount: realScores.length, realPass: share(realScores), realAvg: avg(realScores),
    aiCount: aiScores.length, aiPass: share(aiScores), aiAvg: avg(aiScores),
  };
  const v = verdictOf(row);
  const doc = await VoiceAudit.create({ ...row, ...v });
  modeCache.delete(String(ownerId));
  console.log(`🧪 [Voice audit] ${ownerId}: real ${row.realPass}% pass (avg ${row.realAvg}), AI avg ${row.aiAvg}: ${v.trusted ? 'trusted' : 'watch only'} (${v.reason})`);
  return doc.toObject();
}

async function latest(ownerId) {
  return VoiceAudit.findOne({ ownerId }).sort({ createdAt: -1 }).lean();
}

// Whether the checker is trusted for an account (from its latest self-test), cached 1 hour
const modeCache = new Map();
async function trusted(ownerId) {
  if (!ownerId) return false;
  const key = String(ownerId);
  const hit = modeCache.get(key);
  if (hit && Date.now() - hit.at < 3600 * 1000) return hit.value;
  const a = await latest(ownerId).catch(() => null);
  const value = !!(a?.trusted && Date.now() - new Date(a.createdAt).getTime() < 7 * 24 * 3600 * 1000);
  modeCache.set(key, { at: Date.now(), value });
  return value;
}

/** Once a day for every account the AI replied for lately. */
function startScheduler(hours = 6) {
  const run = async () => {
    const Message = require('../models/Message');
    const owners = await Message.distinct('ownerId', { sentByAI: true, createdAt: { $gte: new Date(Date.now() - 2 * 24 * 3600 * 1000) } }).catch(() => []);
    for (const ownerId of owners.filter(Boolean).slice(0, 30)) {
      const a = await latest(ownerId).catch(() => null);
      if (a && Date.now() - new Date(a.createdAt).getTime() < STALE_MS) continue;
      await audit(ownerId).catch(err => console.warn('⚠️ [Voice audit]', err.message));
    }
  };
  const t = setInterval(() => { run().catch(() => {}); }, hours * 3600 * 1000);
  t.unref?.();
  const first = setTimeout(() => { run().catch(() => {}); }, 5 * 60 * 1000);
  first.unref?.();
  console.log(`🧪 [Voice audit] Self-test every ${hours} h (once a day per account)`);
}

module.exports = { audit, latest, trusted, verdictOf, startScheduler, TRUST_REAL_PASS, TRUST_GAP };
