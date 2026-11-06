const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const UserMemory = require('../models/UserMemory');
const { healthOf } = require('../services/tokenHealthService');

// Mounted behind requireAuth at /api/home; every query is scoped to the signed-in account
const DAY_MS = 864e5;
const DAYS = 14; // this week + last week, one bucket per local day
const HANDOFF_LIMIT = 8;

// Browser's Date#getTimezoneOffset() (IST = -330). Bad values fall back to UTC.
function parseTzOffset(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= -840 && n <= 840 ? n : 0;
}
// -330 -> "+05:30", the form Mongo's $dateToString timezone accepts
function tzString(offset) {
  const mins = Math.abs(offset);
  return `${offset <= 0 ? '+' : '-'}${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
// Local calendar day (YYYY-MM-DD) of a moment, for a browser offset
const localDay = (ms, offset) => new Date(ms - offset * 60000).toISOString().slice(0, 10);

const sum = arr => arr.reduce((s, n) => s + n, 0);
const share = (ai, human) => (ai + human ? Math.round((ai / (ai + human)) * 100) : null);

/**
 * GET /api/home/summary?tzOffset=-330
 * Home dashboard: AI vs human replies (today, this week, last week, 14 daily buckets),
 * people who messaged, open handoffs with wait time, Instagram token health.
 * "This week" = the last 7 local days including today; "last week" = the 7 before that.
 */
router.get('/summary', async (req, res) => {
  try {
    const ownerId = req.user._id;
    const offset = parseTzOffset(req.query.tzOffset);
    const now = Date.now();
    const days = Array.from({ length: DAYS }, (_, i) => localDay(now - (DAYS - 1 - i) * DAY_MS, offset));
    // Local midnight at the start of the first bucket, as a real UTC moment
    const since = new Date(Date.parse(`${days[0]}T00:00:00Z`) + offset * 60000);
    const dayExpr = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tzString(offset) } };

    const [replyRows, senderRows, handoffTotal, handoffDocs] = await Promise.all([
      Message.aggregate([
        { $match: { ownerId, role: 'assistant', createdAt: { $gte: since } } },
        { $group: { _id: { day: dayExpr, ai: { $eq: ['$sentByAI', true] } }, n: { $sum: 1 } } },
      ]),
      Message.aggregate([
        { $match: { ownerId, role: 'user', createdAt: { $gte: since } } },
        { $group: { _id: '$senderId', days: { $addToSet: dayExpr } } },
      ]),
      UserMemory.countDocuments({ ownerId, handoffRequestedAt: { $ne: null } }),
      UserMemory.find({ ownerId, handoffRequestedAt: { $ne: null } })
        .sort({ handoffRequestedAt: 1 }).limit(HANDOFF_LIMIT)
        .select('senderId name username handoffRequestedAt handoffReason').lean(),
    ]);

    const index = new Map(days.map((d, i) => [d, i]));
    const ai = Array(DAYS).fill(0);
    const human = Array(DAYS).fill(0);
    for (const r of replyRows) {
      const i = index.get(r._id.day);
      if (i !== undefined) (r._id.ai ? ai : human)[i] += r.n;
    }

    const peopleDaily = Array(DAYS).fill(0);
    let peopleThisWeek = 0;
    let peopleLastWeek = 0;
    for (const s of senderRows) {
      const idx = s.days.map(d => index.get(d)).filter(i => i !== undefined);
      idx.forEach(i => { peopleDaily[i] += 1; });
      if (idx.some(i => i >= 7)) peopleThisWeek += 1;
      if (idx.some(i => i < 7)) peopleLastWeek += 1;
    }

    const week = arr => ({ thisWeek: sum(arr.slice(7)), lastWeek: sum(arr.slice(0, 7)) });
    const aiWeek = week(ai);
    const humanWeek = week(human);

    const ig = req.user.instagram || {};
    const connected = Boolean(ig.accessTokenEncrypted || req.user.instagramPageAccessToken) && ig.connected !== false;
    const expiresAt = ig.tokenExpiresAt || null;

    res.json({
      success: true,
      now: new Date(now),
      days,
      replies: {
        ai,
        human,
        today: { ai: ai[DAYS - 1], human: human[DAYS - 1] },
        thisWeek: { ai: aiWeek.thisWeek, human: humanWeek.thisWeek },
        lastWeek: { ai: aiWeek.lastWeek, human: humanWeek.lastWeek },
      },
      // Share of replies the AI sent (null when there were no replies)
      aiShare: { thisWeek: share(aiWeek.thisWeek, humanWeek.thisWeek), lastWeek: share(aiWeek.lastWeek, humanWeek.lastWeek) },
      people: { daily: peopleDaily, thisWeek: peopleThisWeek, lastWeek: peopleLastWeek },
      handoffs: {
        total: handoffTotal,
        items: handoffDocs.map(h => ({
          senderId: h.senderId,
          name: h.name || '',
          username: h.username || '',
          reason: h.handoffReason || '',
          requestedAt: h.handoffRequestedAt,
          waitingMinutes: Math.max(0, Math.floor((now - new Date(h.handoffRequestedAt).getTime()) / 60000)),
        })),
      },
      instagram: {
        connected,
        status: connected ? healthOf(expiresAt, true) : 'red',
        expiresAt,
        daysLeft: expiresAt ? Math.floor((new Date(expiresAt).getTime() - now) / DAY_MS) : null,
      },
    });
  } catch (err) {
    console.error('❌ [Home] summary failed:', err.message);
    res.status(500).json({ error: 'Could not load the home summary' });
  }
});

module.exports = router;
module.exports._test = { parseTzOffset, tzString, localDay };
