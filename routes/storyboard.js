const express = require('express');
const router = express.Router();
const Storyboard = require('../models/Storyboard');
const storyboardService = require('../services/storyboardService');

// Mounted behind requireAuth at /api/storyboard (PLAN.md §13 Phase 4)

const KINDS = ['personal', 'business'];
const MAX_NODES = 200;
const MAX_EDGES = 400;
const CIRCLES = ['close', 'online', 'offline', 'family', 'professional'];

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = v => (Number.isFinite(v) ? Math.round(v) : 0);

// Keeps only known fields and drops edges that point at missing nodes
function sanitize({ nodes, edges }) {
  const cleanNodes = (Array.isArray(nodes) ? nodes : []).slice(0, MAX_NODES)
    .filter(n => n && typeof n.id === 'string' && n.id)
    .map(n => ({
      id: str(n.id, 64), type: str(n.type, 24) || 'note', label: str(n.label, 120),
      notes: str(n.notes, 2000), contactId: str(n.contactId, 64), senderId: str(n.senderId, 64),
      circle: CIRCLES.includes(n.circle) ? n.circle : '', x: num(n.x), y: num(n.y),
    }));
  const ids = new Set(cleanNodes.map(n => n.id));
  const cleanEdges = (Array.isArray(edges) ? edges : []).slice(0, MAX_EDGES)
    .filter(e => e && ids.has(e.from) && ids.has(e.to) && e.from !== e.to)
    .map(e => ({ id: str(e.id, 64) || `${e.from}-${e.to}`, from: e.from, to: e.to, label: str(e.label, 60) }));
  return { nodes: cleanNodes, edges: cleanEdges };
}

router.param('kind', (req, res, next, kind) => {
  if (!KINDS.includes(kind)) return res.status(404).json({ error: 'Unknown storyboard' });
  next();
});

/**
 * GET /api/storyboard/:kind  -> { nodes, edges, updatedAt } (empty when never saved)
 */
router.get('/:kind', async (req, res) => {
  try {
    const doc = await Storyboard.findOne({ ownerId: req.user._id, kind: req.params.kind }).lean();
    res.json({ success: true, nodes: doc?.nodes || [], edges: doc?.edges || [], updatedAt: doc?.updatedAt || null });
  } catch (err) {
    console.error('❌ [Storyboard] GET failed:', err.message);
    res.status(500).json({ error: 'Could not load storyboard' });
  }
});

/**
 * PUT /api/storyboard/:kind  Body: { nodes, edges } (replaces the whole canvas)
 */
router.put('/:kind', async (req, res) => {
  try {
    const clean = sanitize(req.body || {});
    const doc = await Storyboard.findOneAndUpdate(
      { ownerId: req.user._id, kind: req.params.kind },
      { $set: clean },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    storyboardService.clearCache(req.user._id, req.params.kind);
    res.json({ success: true, nodes: doc.nodes, edges: doc.edges, updatedAt: doc.updatedAt });
  } catch (err) {
    console.error('❌ [Storyboard] PUT failed:', err.message);
    res.status(500).json({ error: 'Could not save storyboard' });
  }
});

module.exports = router;
module.exports.sanitize = sanitize;
