const express = require('express');
const router = express.Router();
const workspaceFeatureService = require('../services/workspaceFeatureService');

// Mounted behind requireAuth at /api/workspace (PLAN.md §4)

/**
 * GET /api/workspace/features
 */
router.get('/features', async (req, res) => {
  try {
    const features = await workspaceFeatureService.getFeatures(req.user);
    res.json({ success: true, ...features, modes: workspaceFeatureService.MODES });
  } catch (err) {
    console.error('❌ [Feature Store] GET failed:', err.message);
    res.status(500).json({ error: 'Could not load workspace features' });
  }
});

/**
 * PUT /api/workspace/features
 * Body: { activeMode?, enabledFeatures?: { key: boolean }, customBranding? }
 */
router.put('/features', async (req, res) => {
  try {
    const { view, accountType } = await workspaceFeatureService.updateFeatures(req.user, req.body || {});
    // Keep the reply voice in step with the mode
    if (accountType) {
      req.user.accountType = accountType;
      await req.user.save();
    }
    res.json({ success: true, ...view, accountType: req.user.accountType });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('❌ [Feature Store] PUT failed:', err.message);
    res.status(500).json({ error: 'Could not save workspace features' });
  }
});

module.exports = router;
