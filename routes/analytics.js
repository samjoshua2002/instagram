const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const UserMemory = require('../models/UserMemory');
const Lead = require('../models/Lead');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { parseDateParam } = require('../lib/serverSecurity');
const { parseTzOffset, tzString, localDay } = require('../lib/tzOffset');

// Mounted behind requireAuth; every query is scoped to the signed-in tenant
const ownerOf = (req) => req.user._id;
// Chats from the in-app test sandbox (test_… senders) are not real conversations
const REAL_CHATS = { $nor: [{ senderId: /^test_/ }, { recipientId: /^test_/ }] };
const REAL_CONTACT = { senderId: { $not: /^test_/ } };

const TREND_DAYS = 14;

// Daily counts for the last TREND_DAYS days (oldest first) for the dashboard sparklines
async function dailyTrend(Model, match, distinctField) {
  const since = new Date(Date.now() - (TREND_DAYS - 1) * 864e5);
  since.setUTCHours(0, 0, 0, 0);
  const day = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
  const pipeline = [{ $match: { ...match, createdAt: { $gte: since } } }];
  if (distinctField) {
    pipeline.push({ $group: { _id: { day, key: `$${distinctField}` } } }, { $group: { _id: '$_id.day', n: { $sum: 1 } } });
  } else {
    pipeline.push({ $group: { _id: day, n: { $sum: 1 } } });
  }
  const rows = await Model.aggregate(pipeline);
  const byDay = Object.fromEntries(rows.map(r => [r._id, r.n]));
  return Array.from({ length: TREND_DAYS }, (_, i) => byDay[new Date(since.getTime() + i * 864e5).toISOString().slice(0, 10)] || 0);
}

/**
 * GET /api/analytics/overview
 * Total conversations, active leads, confirmed bookings, resolution and automation rates
 */
router.get('/overview', async (req, res) => {
  try {
    const ownerId = ownerOf(req);
    const since30d = new Date(Date.now() - 30 * 864e5);

    const [totalConversations, leads, leadsLast30d, confirmedBookings, upcomingBookings, handoffsOpen, aiReplies, humanReplies] = await Promise.all([
      // Same contacts the inbox lists, so the card matches what the owner sees
      UserMemory.countDocuments({ ownerId, ...REAL_CONTACT }),
      Lead.countDocuments({ ownerId }),
      Lead.countDocuments({ ownerId, createdAt: { $gte: since30d } }),
      Booking.countDocuments({ ownerId, status: 'confirmed' }),
      Booking.countDocuments({ ownerId, status: { $in: ['pending', 'confirmed'] }, bookingTime: { $gte: new Date() } }),
      UserMemory.countDocuments({ ownerId, handoffRequestedAt: { $ne: null }, ...REAL_CONTACT }),
      Message.countDocuments({ ownerId, role: 'assistant', sentByAI: true, ...REAL_CHATS }),
      Message.countDocuments({ ownerId, role: 'assistant', sentByAI: { $ne: true }, ...REAL_CHATS }),
    ]);

    const [conversationTrend, leadTrend, bookingTrend, aiReplyTrend] = await Promise.all([
      dailyTrend(Message, { ownerId, role: 'user' }, 'senderId'),
      dailyTrend(Lead, { ownerId }),
      dailyTrend(Booking, { ownerId, status: 'confirmed' }),
      dailyTrend(Message, { ownerId, role: 'assistant', sentByAI: true }),
    ]);

    const totalReplies = aiReplies + humanReplies;
    res.json({
      totalConversations,
      activeLeads: leads,
      leadsLast30d,
      confirmedBookings,
      upcomingBookings,
      openHandoffs: handoffsOpen,
      // Share of conversations the bot handled without a human handoff
      resolutionRate: totalConversations ? Math.round(((totalConversations - handoffsOpen) / totalConversations) * 100) : 0,
      // Share of outgoing replies sent by the AI
      automationRate: totalReplies ? Math.round((aiReplies / totalReplies) * 100) : 0,
      // Daily counts, oldest first, for the dashboard sparklines
      trends: { conversations: conversationTrend, leads: leadTrend, bookings: bookingTrend, aiReplies: aiReplyTrend },
    });
  } catch (err) {
    console.error('Analytics overview error:', err.message);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

/**
 * GET /api/analytics/leads?page=1&limit=25  (add &format=csv to export)
 */
router.get('/leads', async (req, res) => {
  try {
    const ownerId = ownerOf(req);

    if (req.query.format === 'csv') {
      const all = await Lead.find({ ownerId }).sort({ createdAt: -1 }).lean();
      // Cells starting with = + - @ are formulas in Excel/Sheets; DM text must never run as one
      const esc = (v) => {
        let s = String(v ?? '');
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return `"${s.replace(/"/g, '""')}"`;
      };
      const rows = [['Handle', 'Phone', 'Email', 'Intent', 'Captured'].join(',')]
        .concat(all.map(l => [l.handle, l.phone, l.email, l.intentSummary, new Date(l.capturedAt || l.createdAt).toISOString()].map(esc).join(',')));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
      return res.send(rows.join('\n'));
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const [items, total] = await Promise.all([
      Lead.find({ ownerId }).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Lead.countDocuments({ ownerId }),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load leads' });
  }
});

/**
 * GET /api/analytics/bookings?from=ISO&to=ISO&status=confirmed
 * Calendar feed of bookings (defaults to the next 60 days plus undated ones)
 */
router.get('/bookings', async (req, res) => {
  try {
    const ownerId = ownerOf(req);
    const from = parseDateParam(req.query.from, new Date(Date.now() - 864e5));
    const to = parseDateParam(req.query.to, new Date(Date.now() + 60 * 864e5));
    if (!from.ok || !to.ok) return res.status(400).json({ error: 'from and to must be valid dates' });
    const statuses = Booking.schema.path('status')?.enumValues || [];
    if (req.query.status !== undefined && (typeof req.query.status !== 'string' || (statuses.length && !statuses.includes(req.query.status)))) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const filter = {
      ownerId,
      $or: [{ bookingTime: { $gte: from.date, $lte: to.date } }, { bookingTime: null }],
      ...(req.query.status ? { status: req.query.status } : { status: { $ne: 'cancelled' } }),
    };
    const items = await Booking.find(filter).sort({ bookingTime: 1, createdAt: -1 }).limit(500).lean();
    res.json({
      items,
      events: items.filter(b => b.bookingTime).map(b => ({
        id: b._id,
        title: `${b.serviceName || 'Booking'} · @${b.handle || b.senderId}`,
        start: b.bookingTime,
        status: b.status,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load bookings' });
  }
});

// Range tabs on the analytics page. 0 = all time (chart shows the last 52 weeks).
const RANGES = { '7d': 7, '30d': 30, '90d': 90, all: 0 };
const ALL_CHART_DAYS = 52 * 7;

// received = a person wrote to you; ai = the bot replied; human = you replied yourself
const KIND = {
  $cond: [{ $eq: ['$role', 'user'] }, 'received', { $cond: [{ $eq: ['$sentByAI', true] }, 'ai', 'human'] }],
};

// Daily rows -> chart buckets. Up to 30 days: one bar per day; longer: one bar per 7 days,
// counted back from today (the oldest bar may be shorter). Leading empty weeks of "all" are dropped.
function buildSeries(days, rows, trimLeading) {
  const byDay = {};
  rows.forEach(r => {
    const d = (byDay[r._id.day] = byDay[r._id.day] || { received: 0, ai: 0, human: 0 });
    d[r._id.kind] = r.n;
  });
  const point = list => ({
    start: list[0],
    end: list[list.length - 1],
    received: list.reduce((s, day) => s + (byDay[day]?.received || 0), 0),
    ai: list.reduce((s, day) => s + (byDay[day]?.ai || 0), 0),
    human: list.reduce((s, day) => s + (byDay[day]?.human || 0), 0),
  });
  if (days.length <= 30) return { bucket: 'day', series: days.map(day => point([day])) };
  const series = [];
  for (let end = days.length; end > 0; end -= 7) series.unshift(point(days.slice(Math.max(0, end - 7), end)));
  if (trimLeading) {
    const first = series.findIndex(p => p.received + p.ai + p.human > 0);
    if (first > 0) series.splice(0, Math.min(first, series.length - 4));
  }
  return { bucket: 'week', series };
}

// Mongo $dayOfWeek (1 = Sunday) rows -> 7 x 24 grid, Monday first
function buildHeatmap(rows) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  rows.forEach(r => { grid[(r._id.dow + 5) % 7][r._id.hour] = r.n; });
  return grid;
}

/**
 * GET /api/analytics/activity?range=30d&tzOffset=-330[&scope=platform]
 * Real message counts for the analytics charts: received / AI / you, per day (or per week),
 * plus a weekday x hour grid of incoming messages in the viewer's time zone.
 * scope=platform (superadmin only) counts every workspace and lists the busiest ones.
 */
router.get('/activity', async (req, res) => {
  try {
    const range = Object.prototype.hasOwnProperty.call(RANGES, req.query.range) ? req.query.range : '30d';
    const platform = req.query.scope === 'platform';
    if (platform && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Superadmin only' });
    }
    const offset = parseTzOffset(req.query.tzOffset);
    const tz = tzString(offset);
    const span = RANGES[range];
    const chartDays = span || ALL_CHART_DAYS;
    const now = Date.now();
    const days = Array.from({ length: chartDays }, (_, i) => localDay(now - (chartDays - 1 - i) * 864e5, offset));
    // Local midnight of the first chart day, as a real UTC moment
    const chartSince = new Date(Date.parse(`${days[0]}T00:00:00Z`) + offset * 60000);
    const inRange = span ? { createdAt: { $gte: chartSince } } : {};

    const facets = {
      totals: [{ $group: { _id: KIND, n: { $sum: 1 } } }],
      daily: [
        { $match: { createdAt: { $gte: chartSince } } },
        { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } }, kind: KIND }, n: { $sum: 1 } } },
      ],
      hours: [
        { $match: { role: 'user' } },
        { $group: { _id: { dow: { $dayOfWeek: { date: '$createdAt', timezone: tz } }, hour: { $hour: { date: '$createdAt', timezone: tz } } }, n: { $sum: 1 } } },
      ],
    };
    if (platform) {
      facets.owners = [
        { $match: { ownerId: { $ne: null } } },
        {
          $group: {
            _id: '$ownerId',
            total: { $sum: 1 },
            received: { $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] } },
            ai: { $sum: { $cond: [{ $and: [{ $eq: ['$role', 'assistant'] }, { $eq: ['$sentByAI', true] }] }, 1, 0] } },
          },
        },
        { $sort: { total: -1 } },
      ];
    }

    const match = { ...(platform ? {} : { ownerId: ownerOf(req) }), ...inRange, ...REAL_CHATS };
    const [out = {}] = await Message.aggregate([{ $match: match }, { $facet: facets }]);

    const totals = { received: 0, ai: 0, human: 0 };
    (out.totals || []).forEach(r => { totals[r._id] = r.n; });
    totals.total = totals.received + totals.ai + totals.human;

    const body = {
      range,
      ...buildSeries(days, out.daily || [], !span),
      totals,
      heatmap: buildHeatmap(out.hours || []),
    };

    if (platform) {
      const owners = out.owners || [];
      const top = owners.slice(0, 8);
      const users = await User.find({ _id: { $in: top.map(o => o._id) } })
        .select('username instagramUsername accountType businessProfile.businessName')
        .lean();
      const byId = Object.fromEntries(users.map(u => [String(u._id), u]));
      body.activeWorkspaces = owners.length;
      body.owners = top.map(o => {
        const u = byId[String(o._id)] || {};
        return {
          id: o._id,
          username: u.instagramUsername || u.username || 'deleted account',
          name: u.businessProfile?.businessName || '',
          accountType: u.accountType || 'personal',
          total: o.total,
          received: o.received,
          ai: o.ai,
        };
      });
    }

    res.json(body);
  } catch (err) {
    console.error('Analytics activity error:', err.message);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

module.exports = router;
module.exports._test = { buildSeries, buildHeatmap, RANGES };
