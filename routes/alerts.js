const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Booking = require('../models/Booking');
const UserMemory = require('../models/UserMemory');
const Message = require('../models/Message');
const workspaceFeatureService = require('../services/workspaceFeatureService');

// Mounted behind requireAuth at /api/alerts.
// The web app polls /alerts and shows each item as a browser notification.

const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/alerts?since=ISO
 * -> { alerts: [{ id, kind, title, body, at }], now, enabled }
 */
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const features = await workspaceFeatureService.getFeaturesSafe(req.user);
    if (!features.enabledFeatures.desktopPushAlerts) return res.json({ success: true, alerts: [], now, enabled: false });

    const parsed = new Date(req.query.since);
    const since = Number.isNaN(parsed.getTime()) ? now : new Date(Math.max(parsed.getTime(), now - MAX_LOOKBACK_MS));
    const ownerId = req.user._id;
    const f = features.enabledFeatures;

    const [leads, bookings, handoffs, messages] = await Promise.all([
      f.leadExtraction ? Lead.find({ ownerId, createdAt: { $gt: since } }).sort({ createdAt: 1 }).limit(20).lean() : [],
      f.bookingScheduler ? Booking.find({ ownerId, createdAt: { $gt: since } }).sort({ createdAt: 1 }).limit(20).lean() : [],
      f.humanHandoffInbox ? UserMemory.find({ ownerId, handoffRequestedAt: { $gt: since } }).sort({ handoffRequestedAt: 1 }).limit(20).lean() : [],
      // Test sandbox chats (test_… senders) never raise "people messaged you" alerts
      Message.find({ ownerId, role: 'user', createdAt: { $gt: since }, senderId: { $not: /^test_/ } }).sort({ createdAt: 1 }).limit(100).lean(),
    ]);

    // New DMs: one alert per person (latest text + count), flagged when it is their first ever message
    const bySender = new Map();
    for (const m of messages) {
      const g = bySender.get(m.senderId) || { count: 0, first: m };
      g.count += 1; g.last = m;
      bySender.set(m.senderId, g);
    }
    const senderIds = [...bySender.keys()];
    const [memories, olderSenders] = senderIds.length ? await Promise.all([
      UserMemory.find({ ownerId, senderId: { $in: senderIds } }).select('senderId name username').lean(),
      Message.distinct('senderId', { ownerId, role: 'user', senderId: { $in: senderIds }, createdAt: { $lte: since } }),
    ]) : [[], []];
    const nameOf = new Map(memories.map(m => [m.senderId, m]));
    const seenBefore = new Set(olderSenders);
    const clip = t => (String(t || '').length > 120 ? `${String(t).slice(0, 117)}...` : String(t || ''));

    const who = d => (d.handle ? `@${String(d.handle).replace(/^@/, '')}` : d.name || d.username || 'A customer');
    const alerts = [
      ...leads.map(l => ({ id: `lead-${l._id}`, kind: 'lead', title: 'New lead', body: `${who(l)}${l.intentSummary ? `: ${l.intentSummary}` : ''}`, at: l.createdAt })),
      ...bookings.map(b => ({
        id: `booking-${b._id}`, kind: 'booking', title: 'New booking request',
        body: `${who(b)}${b.serviceName ? ` · ${b.serviceName}` : ''}${b.bookingTime ? ` · ${new Date(b.bookingTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}`,
        at: b.createdAt,
      })),
      ...handoffs.map(h => ({ id: `handoff-${h._id}-${+h.handoffRequestedAt}`, kind: 'handoff', title: 'Needs you', body: `${who(h)}${h.handoffReason ? `: ${h.handoffReason}` : ' asked for a person'}`, at: h.handoffRequestedAt })),
      ...[...bySender].map(([senderId, g]) => {
        const mem = nameOf.get(senderId);
        const name = mem?.username ? `@${String(mem.username).replace(/^@/, '')}` : mem?.name || 'Someone';
        const isNew = !seenBefore.has(senderId);
        return {
          id: `msg-${g.last._id}`, kind: isNew ? 'new_contact' : 'message', senderId,
          title: isNew ? `New person: ${name}` : `New message from ${name}`,
          body: g.count > 1 ? `${g.count} new messages · ${clip(g.last.text)}` : clip(g.last.text),
          at: g.last.createdAt,
        };
      }),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));

    res.json({ success: true, alerts, now, enabled: true });
  } catch (err) {
    console.error('❌ [Alerts] alerts failed:', err.message);
    res.status(500).json({ error: 'Could not load alerts' });
  }
});

module.exports = router;
