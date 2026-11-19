/**
 * Voice Check page API (signed-in owner only; every query is scoped to req.user._id):
 *   GET    /api/voice/overview          mode, how the judge agrees with your labels, last 7 days
 *   GET    /api/voice/review            AI drafts waiting for your label (judge score hidden: blind)
 *   POST   /api/voice/logs/:id/label    { label: 'send' | 'nosend', note? }
 *   GET    /api/voice/learned           rules learned from your takeovers
 *   DELETE /api/voice/learned/:id       forget a learned rule
 */
const express = require('express');
const mongoose = require('mongoose');
const VoiceCheckLog = require('../models/VoiceCheckLog');
const StylePreference = require('../models/StylePreference');
const voiceCheck = require('../services/voiceCheck');

const router = express.Router();
const fail = (res, err) => {
  console.error('❌ [Voice API]', err.message);
  res.status(500).json({ error: 'Something went wrong. Try again.' });
};

router.get('/overview', async (req, res) => {
  try {
    const ownerId = req.user._id;
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [labelled, byStatus, byLanguage, latency] = await Promise.all([
      VoiceCheckLog.find({ ownerId, label: { $in: ['send', 'nosend'] } }, { score: 1, label: 1 }).lean(),
      VoiceCheckLog.aggregate([{ $match: { ownerId: new mongoose.Types.ObjectId(String(ownerId)), createdAt: { $gte: since } } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      VoiceCheckLog.aggregate([{ $match: { ownerId: new mongoose.Types.ObjectId(String(ownerId)), createdAt: { $gte: since } } }, { $group: { _id: '$language', n: { $sum: 1 } } }]),
      VoiceCheckLog.find({ ownerId, createdAt: { $gte: since }, judgeMs: { $ne: null } }, { judgeMs: 1 }).sort({ createdAt: -1 }).limit(500).lean(),
    ]);
    const ms = latency.map(l => l.judgeMs).sort((a, b) => a - b);
    const pct = p => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] : null);
    res.json({
      mode: voiceCheck.modeFor(ownerId),
      threshold: voiceCheck.PASS_SCORE,
      stats: voiceCheck.agreementStats(labelled),
      wouldSendRate: labelled.length ? Math.round(100 * labelled.filter(l => l.label === 'send').length / labelled.length) : null,
      week: Object.fromEntries(byStatus.map(s => [s._id, s.n])),
      languages: Object.fromEntries(byLanguage.map(s => [s._id || 'unknown', s.n])),
      judgeMs: { p50: pct(0.5), p95: pct(0.95) },
    });
  } catch (err) { fail(res, err); }
});

// The automatic summary: your own messages vs the AI's (no labels needed) and the checker's self-test
router.get('/summary', async (req, res) => {
  try {
    const voiceAudit = require('../services/voiceAudit');
    const [style, audit, trusted, pace] = await Promise.all([
      require('../services/styleCompare').summaryFor(req.user._id, { fresh: req.query.fresh === '1' }),
      voiceAudit.latest(req.user._id),
      voiceAudit.trusted(req.user._id),
      require('../services/replyTiming').paceFor(req.user._id),
    ]);
    const forced = (process.env.VOICE_CHECK || '').toLowerCase();
    res.json({
      style,
      pace,
      audit: audit && { at: audit.createdAt, realPass: audit.realPass, realAvg: audit.realAvg, aiPass: audit.aiPass, aiAvg: audit.aiAvg, trusted: audit.trusted, reason: audit.reason },
      // What the checker does for this account right now
      mode: forced === 'off' ? 'off' : forced === 'enforce' ? 'enforce' : forced === 'shadow' ? 'shadow' : (trusted ? 'enforce' : 'shadow'),
    });
  } catch (err) { fail(res, err); }
});

// Run the checker's self-test now (otherwise it runs once a day by itself)
router.post('/audit', async (req, res) => {
  try {
    const a = await require('../services/voiceAudit').audit(req.user._id);
    res.json({ success: true, audit: { at: a.createdAt, realPass: a.realPass, realAvg: a.realAvg, aiPass: a.aiPass, aiAvg: a.aiAvg, trusted: a.trusted, reason: a.reason } });
  } catch (err) { fail(res, err); }
});

router.get('/review', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const items = await VoiceCheckLog.find({ ownerId: req.user._id, label: null, draft: { $ne: '' } })
      .sort({ createdAt: -1 }).limit(limit)
      .select('contactName kind incoming draft final status createdAt').lean();
    const waiting = await VoiceCheckLog.countDocuments({ ownerId: req.user._id, label: null, draft: { $ne: '' } });
    res.json({ items, waiting });
  } catch (err) { fail(res, err); }
});

router.post('/logs/:id/label', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id.' });
    const label = req.body?.label;
    if (!['send', 'nosend'].includes(label)) return res.status(400).json({ error: 'label must be send or nosend.' });
    // "Not me" comes with how you would really reply (one message per line, as you send them)
    const mine = label === 'nosend'
      ? String(req.body?.mine || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 5).join('\n').slice(0, 600)
      : '';
    const doc = await VoiceCheckLog.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.user._id },
      { $set: { label, mine, labelNote: String(req.body?.note || '').slice(0, 300), labelledAt: new Date() } },
      { returnDocument: 'after' },
    ).select('score status issues label senderId contactName incoming draft').lean();
    if (!doc) return res.status(404).json({ error: 'Not found.' });
    // Your version teaches it like a takeover: the difference becomes a rule once 3 agree
    let rule = null;
    if (mine) {
      const out = await require('../services/correctionLearning').record({
        ownerId: req.user._id, senderId: doc.senderId, contactName: doc.contactName,
        incoming: doc.incoming, draft: doc.draft, human: mine,
      });
      rule = out?.rule ? { text: out.rule.text, status: out.rule.status, support: out.rule.support, contradictions: out.rule.contradictions || 0 } : null;
    }
    // The judge's score is shown only now, after you decided (so it can't sway you)
    res.json({ success: true, score: doc.score, status: doc.status, issues: doc.issues, rule });
  } catch (err) { fail(res, err); }
});

router.get('/learned', async (req, res) => {
  try {
    await require('../services/correctionLearning').refreshStatuses(req.user._id).catch(() => 0);
    const rules = await StylePreference.find({ ownerId: req.user._id, status: { $ne: 'retired' } })
      .sort({ status: 1, support: -1, updatedAt: -1 }).limit(100).lean();
    res.json({ rules, promoteAt: require('../services/correctionLearning').PROMOTE_AT });
  } catch (err) { fail(res, err); }
});

router.delete('/learned/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id.' });
    const out = await StylePreference.deleteOne({ _id: req.params.id, ownerId: req.user._id });
    if (!out.deletedCount) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) { fail(res, err); }
});

module.exports = router;
