const express = require('express');
const router = express.Router();
const cryptoService = require('../services/cryptoService');
const llmAdapter = require('../services/llmAdapter');

// Mounted behind requireAuth at /api/settings; the API key never leaves the server

const publicView = (cfg = {}) => ({
  provider: cfg.provider || 'azure',
  model: cfg.model || '',
  endpoint: cfg.endpoint || '',
  hasApiKey: Boolean(cfg.apiKeyEncrypted),
});

const clean = (v) => String(v || '').trim();

/**
 * GET /api/settings/ai-provider
 */
router.get('/ai-provider', (req, res) => {
  res.json({ success: true, config: publicView(req.user.aiProviderConfig), providers: llmAdapter.PROVIDERS });
});

/**
 * PUT /api/settings/ai-provider
 * Body: { provider, model, endpoint, apiKey?, clearApiKey? }. A blank apiKey keeps the saved one.
 */
router.put('/ai-provider', async (req, res) => {
  try {
    const { provider, model, endpoint, apiKey, clearApiKey } = req.body || {};
    if (!llmAdapter.PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: 'Unknown AI provider' });
    }

    const cfg = req.user.aiProviderConfig || {};
    cfg.provider = provider;
    cfg.model = clean(model);
    cfg.endpoint = clean(endpoint);

    const key = clean(apiKey);
    if (key) {
      if (!cryptoService.isConfigured()) {
        return res.status(500).json({ error: 'Server encryption is not configured; API keys cannot be stored' });
      }
      const { encryptedData, iv, authTag } = cryptoService.encrypt(key);
      Object.assign(cfg, { apiKeyEncrypted: encryptedData, iv, authTag });
    } else if (clearApiKey) {
      Object.assign(cfg, { apiKeyEncrypted: '', iv: '', authTag: '' });
    }

    req.user.aiProviderConfig = cfg;
    await req.user.save();
    res.json({ success: true, config: publicView(req.user.aiProviderConfig) });
  } catch (err) {
    console.error('❌ Save AI provider error:', err.message);
    res.status(500).json({ error: 'Could not save AI provider settings' });
  }
});

/**
 * POST /api/settings/test-llm
 * Body: { provider, model, endpoint, apiKey? }. Without apiKey, the saved key is used.
 */
router.post('/test-llm', async (req, res) => {
  const { provider, model, endpoint, apiKey } = req.body || {};
  if (!llmAdapter.PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: 'Unknown AI provider' });
  }
  if (provider === 'azure') {
    return res.json({ success: true, ok: true, reply: 'Platform Azure OpenAI is managed for you.', latencyMs: 0 });
  }

  const saved = req.user.aiProviderConfig || {};
  const cfg = { provider, model: clean(model), endpoint: clean(endpoint) };
  const key = clean(apiKey) || (saved.provider === provider ? llmAdapter.getApiKey(saved) : '');

  try {
    const result = await llmAdapter.testConnection(cfg, key);
    res.json({ success: true, ...result });
  } catch (err) {
    res.json({ success: false, ok: false, error: err.message });
  }
});

module.exports = router;
