const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { Client: McpClient } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { WebSocketClientTransport } = require('@modelcontextprotocol/sdk/client/websocket.js');
const cryptoService = require('./cryptoService');

/**
 * BYO-LLM adapter. A tenant's user.aiProviderConfig picks the provider; 'azure' (the default)
 * means the platform's own Azure OpenAI in services/azureOpenAI.js handles the request.
 * Messages use the OpenAI shape: [{ role: 'system' | 'user' | 'assistant', content }].
 */

const PROVIDERS = ['azure', 'openai', 'anthropic', 'groq', 'openrouter', 'ollama', 'mcp'];

// OpenAI-compatible providers: default base URL and model
const OPENAI_COMPATIBLE = {
  openai: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  groq: { baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  openrouter: { baseURL: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  ollama: { baseURL: 'http://localhost:11434/v1', model: 'llama3.1' },
};
const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';
// Models that accept server-side refusal fallbacks
const ANTHROPIC_FALLBACK_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];

const LOCAL_PING_TIMEOUT_MS = 3000;
const REQUEST_TIMEOUT_MS = 30000;

const NEEDS_API_KEY = ['openai', 'anthropic', 'groq', 'openrouter'];

function isCustomProvider(cfg) {
  return Boolean(cfg && cfg.provider && cfg.provider !== 'azure' && PROVIDERS.includes(cfg.provider));
}

/** Decrypts the stored API key (empty string when none is saved). */
function getApiKey(cfg) {
  if (!cfg || !cfg.apiKeyEncrypted) return '';
  return cryptoService.decrypt({ encryptedData: cfg.apiKeyEncrypted, iv: cfg.iv, authTag: cfg.authTag });
}

/** Rejects endpoints that point at cloud metadata services (the server would fetch them on the user's behalf). */
function assertSafeEndpoint(endpoint) {
  if (!endpoint) return;
  let url;
  try {
    url = new URL(endpoint);
  } catch (e) {
    throw new Error('Endpoint URL is not valid');
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) throw new Error('Endpoint must use http(s) or ws(s)');
  const host = url.hostname.toLowerCase();
  if (/^169\.254\./.test(host) || host === 'metadata.google.internal' || host === '[fd00:ec2::254]') {
    throw new Error('Endpoint host is not allowed');
  }
}

async function completeOpenAICompatible(messages, cfg, apiKey, { maxTokens, temperature }) {
  const defaults = OPENAI_COMPATIBLE[cfg.provider];
  const baseURL = (cfg.endpoint || defaults.baseURL).replace(/\/+$/, '');
  assertSafeEndpoint(baseURL);

  // Local servers: quick reachability check so a sleeping laptop doesn't stall the DM
  if (cfg.provider === 'ollama') {
    const ping = await fetch(`${baseURL}/models`, { signal: AbortSignal.timeout(LOCAL_PING_TIMEOUT_MS) })
      .catch(() => { throw new Error(`Cannot reach the local model server at ${baseURL}`); });
    if (!ping.ok) throw new Error(`Local model server answered ${ping.status}`);
  }

  const client = new OpenAI({ apiKey: apiKey || 'not-needed', baseURL, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
  const response = await client.chat.completions.create({
    model: cfg.model || defaults.model,
    messages,
    max_tokens: maxTokens,
    ...(temperature !== undefined ? { temperature } : {}),
  });
  return response.choices?.[0]?.message?.content || '';
}

async function completeAnthropic(messages, cfg, apiKey, { maxTokens }) {
  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
  const model = cfg.model || ANTHROPIC_DEFAULT_MODEL;
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const turns = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
  while (turns.length && turns[0].role !== 'user') turns.shift(); // first turn must be the user's

  const params = {
    model,
    // Thinking is always on for current models; leave room for it beyond the short DM reply
    max_tokens: Math.max(maxTokens, 4096),
    output_config: { effort: 'low' },
    ...(system ? { system } : {}),
    messages: turns,
  };
  const response = ANTHROPIC_FALLBACK_MODELS.includes(model)
    ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await client.messages.create(params);

  if (response.stop_reason === 'refusal') throw new Error('Anthropic model declined the request');
  return response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

/**
 * A2A over MCP: connects to the tenant's agent, calls its reply tool with the conversation
 * and returns the text it sends back. The tool is cfg.model if set, else 'reply'/'chat', else the first tool.
 */
async function completeMcp(messages, cfg, apiKey) {
  if (!cfg.endpoint) throw new Error('MCP endpoint URL is required');
  assertSafeEndpoint(cfg.endpoint);
  const url = new URL(cfg.endpoint);
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const transport = /^wss?:$/.test(url.protocol)
    ? new WebSocketClientTransport(url)
    : /\/sse\/?$/.test(url.pathname)
      ? new SSEClientTransport(url, { requestInit: { headers } })
      : new StreamableHTTPClientTransport(url, { requestInit: { headers } });

  const client = new McpClient({ name: 'chatter-ai', version: '1.0.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const tool = tools.find(t => t.name === cfg.model)
      || tools.find(t => ['reply', 'chat'].includes(t.name))
      || tools[0];
    if (!tool) throw new Error('MCP agent exposes no tools');

    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const result = await client.callTool(
      { name: tool.name, arguments: { messages, text: lastUser ? lastUser.content : '' } },
      undefined,
      { timeout: REQUEST_TIMEOUT_MS }
    );
    if (result.isError) throw new Error('MCP agent returned an error');
    return (result.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  } finally {
    await client.close().catch(() => {});
  }
}

/** Runs one chat completion on the configured provider. Throws on any failure. */
async function completeChat(messages, tenantConfig, { maxTokens = 300, temperature } = {}, apiKeyOverride) {
  const cfg = tenantConfig || {};
  if (!isCustomProvider(cfg)) throw new Error('No custom AI provider configured');
  const apiKey = apiKeyOverride !== undefined ? apiKeyOverride : getApiKey(cfg);
  if (NEEDS_API_KEY.includes(cfg.provider) && !apiKey) throw new Error('API key is required for this provider');

  if (cfg.provider === 'anthropic') return completeAnthropic(messages, cfg, apiKey, { maxTokens });
  if (cfg.provider === 'mcp') return completeMcp(messages, cfg, apiKey);
  return completeOpenAICompatible(messages, cfg, apiKey, { maxTokens, temperature });
}

/**
 * Tenant hook for the reply generators: returns the custom provider's reply, or null when the
 * tenant uses the platform Azure model or their provider failed (the caller then uses Azure).
 */
async function completeForTenant(tenant, messages, options) {
  const cfg = tenant && tenant.aiProviderConfig;
  if (!isCustomProvider(cfg)) return null;
  try {
    const reply = await completeChat(messages, cfg, options);
    return reply && reply.trim() ? reply : null;
  } catch (err) {
    console.warn(`⚠️ [LLM Adapter]: ${cfg.provider} failed (${err.message}). Falling back to platform Azure.`);
    return null;
  }
}

/** Settings "Test Connection": one short round trip, reporting latency and a sample reply. */
async function testConnection(cfg, apiKeyOverride) {
  const started = Date.now();
  const reply = await completeChat(
    [
      { role: 'system', content: 'You are a connectivity check. Answer in at most five words.' },
      { role: 'user', content: 'Say hello.' },
    ],
    cfg,
    { maxTokens: 20 },
    apiKeyOverride
  );
  return { ok: true, latencyMs: Date.now() - started, reply: String(reply || '').slice(0, 200) };
}

module.exports = { PROVIDERS, isCustomProvider, getApiKey, completeChat, completeForTenant, testConnection };
