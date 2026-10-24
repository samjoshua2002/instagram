const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const UserMemory = require('../models/UserMemory');
const Lead = require('../models/Lead');
const Booking = require('../models/Booking');

// Mounted behind requireAuth; every query is scoped to the signed-in tenant
const ownerOf = (req) => req.user._id;

/**
 * GET /api/analytics/overview
 * Total conversations, active leads, confirmed bookings, resolution and automation rates
 */
router.get('/overview', async (req, res) => {
  try {
    const ownerId = ownerOf(req);
    const since30d = new Date(Date.now() - 30 * 864e5);

    const [conversationIds, leads, leadsLast30d, confirmedBookings, upcomingBookings, handoffsOpen, aiReplies, humanReplies] = await Promise.all([
      Message.distinct('senderId', { ownerId, role: 'user' }),
      Lead.countDocuments({ ownerId }),
      Lead.countDocuments({ ownerId, createdAt: { $gte: since30d } }),
      Booking.countDocuments({ ownerId, status: 'confirmed' }),
      Booking.countDocuments({ ownerId, status: { $in: ['pending', 'confirmed'] }, bookingTime: { $gte: new Date() } }),
      UserMemory.countDocuments({ ownerId, handoffRequestedAt: { $ne: null } }),
      Message.countDocuments({ ownerId, role: 'assistant', sentByAI: true }),
      Message.countDocuments({ ownerId, role: 'assistant', sentByAI: { $ne: true } }),
    ]);

    const totalConversations = conversationIds.length;
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
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
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
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 864e5);
    const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 60 * 864e5);
    const filter = {
      ownerId,
      $or: [{ bookingTime: { $gte: from, $lte: to } }, { bookingTime: null }],
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

module.exports = router;
