const express = require('express');
const router = express.Router();
const DesktopDevice = require('../models/DesktopDevice');
const Lead = require('../models/Lead');
const Booking = require('../models/Booking');
const UserMemory = require('../models/UserMemory');
const workspaceFeatureService = require('../services/workspaceFeatureService');

// Mounted behind requireAuth at /api/desktop (PLAN.md §13 Phase 8).
// The desktop app polls /alerts and shows each item as a native notification.

const PLATFORMS = ['macos-arm64', 'macos-x64', 'windows-x64', 'windows-x86'];
const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/desktop/register  Body: { platform, deviceName }
 */
router.post('/register', async (req, res) => {
  try {
    const { platform, deviceName = '' } = req.body || {};
    if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'Unknown platform' });
    const device = await DesktopDevice.findOneAndUpdate(
      { userId: req.user._id, platform, deviceName: String(deviceName).slice(0, 80) },
      { $set: { lastActiveAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, deviceId: device._id });
  } catch (err) {
    console.error('❌ [Desktop] register failed:', err.message);
    res.status(500).json({ error: 'Could not register this device' });
  }
});

/**
 * GET /api/desktop/alerts?since=ISO
 * -> { alerts: [{ id, kind, title, body, at }], now, enabled }
 */
router.get('/alerts', async (req, res) => {
  try {
    const now = new Date();
    const features = await workspaceFeatureService.getFeaturesSafe(req.user);
    if (!features.enabledFeatures.desktopPushAlerts) return res.json({ success: true, alerts: [], now, enabled: false });

    const parsed = new Date(req.query.since);
    const since = Number.isNaN(parsed.getTime()) ? now : new Date(Math.max(parsed.getTime(), now - MAX_LOOKBACK_MS));
    const ownerId = req.user._id;
    const f = features.enabledFeatures;

    const [leads, bookings, handoffs] = await Promise.all([
      f.leadExtraction ? Lead.find({ ownerId, createdAt: { $gt: since } }).sort({ createdAt: 1 }).limit(20).lean() : [],
      f.bookingScheduler ? Booking.find({ ownerId, createdAt: { $gt: since } }).sort({ createdAt: 1 }).limit(20).lean() : [],
      f.humanHandoffInbox ? UserMemory.find({ ownerId, handoffRequestedAt: { $gt: since } }).sort({ handoffRequestedAt: 1 }).limit(20).lean() : [],
    ]);

    const who = d => (d.handle ? `@${String(d.handle).replace(/^@/, '')}` : d.name || d.username || 'A customer');
    const alerts = [
      ...leads.map(l => ({ id: `lead-${l._id}`, kind: 'lead', title: 'New lead', body: `${who(l)}${l.intentSummary ? `: ${l.intentSummary}` : ''}`, at: l.createdAt })),
      ...bookings.map(b => ({
        id: `booking-${b._id}`, kind: 'booking', title: 'New booking request',
        body: `${who(b)}${b.serviceName ? ` · ${b.serviceName}` : ''}${b.bookingTime ? ` · ${new Date(b.bookingTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}`,
        at: b.createdAt,
      })),
      ...handoffs.map(h => ({ id: `handoff-${h._id}-${+h.handoffRequestedAt}`, kind: 'handoff', title: 'Needs you', body: `${who(h)}${h.handoffReason ? `: ${h.handoffReason}` : ' asked for a person'}`, at: h.handoffRequestedAt })),
    ].sort((a, b) => new Date(a.at) - new Date(b.at));

    res.json({ success: true, alerts, now, enabled: true });
  } catch (err) {
    console.error('❌ [Desktop] alerts failed:', err.message);
    res.status(500).json({ error: 'Could not load alerts' });
  }
});

module.exports = router;
