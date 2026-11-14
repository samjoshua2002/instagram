const dns = require('dns').promises;
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { Client: McpClient } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
const { WebSocketClientTransport } = require('@modelcontextprotocol/sdk/client/websocket.js');
const cryptoService = require('./cryptoService');
const { traceOpenAI, traceGeneration } = require('./langfuse');

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

// ── SSRF guard ─────────────────────────────────────────────────────────────
// Tenant endpoints are fetched by this server, so they must not reach loopback, private networks,
// link-local (cloud metadata) or other internal addresses. Set ALLOW_PRIVATE_LLM_ENDPOINTS=true
// only for self-hosted single-tenant setups (e.g. Ollama on the same machine).

function ipv4ToInt(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

const V4_BLOCKED = [
  ['0.0.0.0', 8],        // "this network" incl. 0.0.0.0
  ['10.0.0.0', 8],       // private
  ['100.64.0.0', 10],    // CGNAT
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local / cloud metadata
  ['172.16.0.0', 12],    // private
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.168.0.0', 16],   // private
  ['198.18.0.0', 15],    // benchmarking
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4],      // reserved + broadcast
].map(([base, bits]) => [ipv4ToInt(base), bits]);

function isBlockedIPv4(ip) {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable: refuse
  return V4_BLOCKED.some(([base, bits]) => ((n >>> (32 - bits)) === (base >>> (32 - bits))));
}

/** Expands an IPv6 string (any compressed / embedded-IPv4 form) to 8 hextets, or null. */
function expandIPv6(ip) {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const v4 = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const n = ipv4ToInt(v4[1]);
    if (n === null) return null;
    s = s.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const parts = [...head, ...Array(fill).fill('0'), ...tail];
  if (parts.length !== 8 || parts.some(h => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return parts.map(h => parseInt(h, 16));
}

function isBlockedIPv6(ip) {
  const h = expandIPv6(ip);
  if (!h) return true; // unparseable: refuse
  const embeddedV4 = () => `${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`;
  if (h.slice(0, 7).every(x => x === 0) && (h[7] === 0 || h[7] === 1)) return true; // :: and ::1
  if (h.slice(0, 5).every(x => x === 0) && h[5] === 0xffff) return isBlockedIPv4(embeddedV4()); // ::ffff:a.b.c.d
  if (h.slice(0, 6).every(x => x === 0)) return isBlockedIPv4(embeddedV4()); // ::a.b.c.d (deprecated compatible)
  if (h[0] === 0x64 && h[1] === 0xff9b && h.slice(2, 6).every(x => x === 0)) return isBlockedIPv4(embeddedV4()); // NAT64
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** True when an IP literal is loopback, private, link-local, CGNAT, unspecified or otherwise internal. */
function isPrivateAddress(ip) {
  const s = String(ip || '').trim();
  if (!s) return true;
  return s.includes(':') ? isBlockedIPv6(s) : isBlockedIPv4(s);
}

const allowPrivateEndpoints = () => String(process.env.ALLOW_PRIVATE_LLM_ENDPOINTS || '').toLowerCase() === 'true';

/**
 * Rejects endpoints that are not http(s)/ws(s) or that resolve to an internal address
 * (every resolved address is checked). `lookup` is injectable for tests.
 */
// The address check runs once, so a redirect must not lead the request (and the API key) somewhere else
const noRedirectFetch = (url, init = {}) => fetch(url, { ...init, redirect: 'error' });

async function assertSafeEndpoint(endpoint, { lookup = dns.lookup } = {}) {
  if (!endpoint) return;
  let url;
  try {
    url = new URL(endpoint);
  } catch (e) {
    throw new Error('Endpoint URL is not valid');
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) throw new Error('Endpoint must use http(s) or ws(s)');
  if (allowPrivateEndpoints()) return;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') {
    throw new Error('Endpoint host is not allowed');
  }
  let addresses;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch (err) {
    throw new Error(`Endpoint host could not be resolved (${err.code || err.message})`);
  }
  if (!addresses || !addresses.length || addresses.some(a => isPrivateAddress(a.address))) {
    throw new Error('Endpoint host is not allowed (resolves to a private or internal address)');
  }
}

// ── Request params ─────────────────────────────────────────────────────────
// Reasoning models (gpt-5.x, o1/o3/o4...) reject max_tokens/temperature and spend tokens thinking
const REASONING_MODEL_RE = /^(gpt-5|o\d)/i;
const REASONING_MIN_COMPLETION_TOKENS = 1200;

function isReasoningModel(model) {
  return REASONING_MODEL_RE.test(String(model || '').split('/').pop()); // "openai/gpt-5" on OpenRouter
}

/** Chat-completions params for an OpenAI-compatible provider. */
function buildOpenAIParams(model, messages, { maxTokens = 300, temperature } = {}) {
  if (isReasoningModel(model)) {
    return { model, messages, max_completion_tokens: Math.max(maxTokens, REASONING_MIN_COMPLETION_TOKENS) };
  }
  return { model, messages, max_tokens: maxTokens, ...(temperature !== undefined ? { temperature } : {}) };
}

// output_config.effort is only accepted by newer Claude families: Opus/Sonnet 4.6+ and the 5.x
// families (incl. Fable 5). Haiku and older models (e.g. claude-haiku-4-5, claude-sonnet-4-5) reject it.
const EFFORT_MODEL_RE = /^claude-(?:opus|sonnet|fable)-(?:4-(?:[6-9]|\d{2,})|[5-9]|\d{2,})(?:[-.@]|$)/i;

function supportsEffort(model) {
  return EFFORT_MODEL_RE.test(String(model || ''));
}

/** Messages API params for Anthropic. */
function buildAnthropicParams(model, system, turns, maxTokens) {
  return {
    model,
    // Thinking is on for current models; leave room for it beyond the short DM reply
    max_tokens: Math.max(maxTokens, 4096),
    ...(supportsEffort(model) ? { output_config: { effort: 'low' } } : {}),
    ...(system ? { system } : {}),
    messages: turns,
  };
}

async function completeOpenAICompatible(messages, cfg, apiKey, { maxTokens, temperature }) {
  const defaults = OPENAI_COMPATIBLE[cfg.provider];
  const baseURL = (cfg.endpoint || defaults.baseURL).replace(/\/+$/, '');
  await assertSafeEndpoint(baseURL);

  // Local servers: quick reachability check so a sleeping laptop doesn't stall the DM
  if (cfg.provider === 'ollama') {
    const ping = await fetch(`${baseURL}/models`, { signal: AbortSignal.timeout(LOCAL_PING_TIMEOUT_MS), redirect: 'error' })
      .catch(() => { throw new Error(`Cannot reach the local model server at ${baseURL}`); });
    if (!ping.ok) throw new Error(`Local model server answered ${ping.status}`);
  }

  const client = traceOpenAI(new OpenAI({ apiKey: apiKey || 'not-needed', baseURL, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0, fetch: noRedirectFetch }), { generationName: `${cfg.provider}-chat`, tags: [cfg.provider] });
  const response = await client.chat.completions.create(
    buildOpenAIParams(cfg.model || defaults.model, messages, { maxTokens, temperature })
  );
  const choice = response.choices?.[0];
  const text = String(choice?.message?.content ?? '').trim();
  if (!text) throw new Error(`${cfg.provider} returned an empty reply (finish_reason: ${choice?.finish_reason || 'unknown'})`);
  return text;
}

async function completeAnthropic(messages, cfg, apiKey, { maxTokens }) {
  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
  const model = cfg.model || ANTHROPIC_DEFAULT_MODEL;
  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const turns = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
  while (turns.length && turns[0].role !== 'user') turns.shift(); // first turn must be the user's

  const params = buildAnthropicParams(model, system, turns, maxTokens);
  const response = await traceGeneration('anthropic-chat', { model, input: messages, modelParameters: { max_tokens: params.max_tokens } }, async (gen) => {
    const res = ANTHROPIC_FALLBACK_MODELS.includes(model)
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);
    gen.update({
      model: res.model || model,
      output: res.content,
      usageDetails: res.usage ? { input: res.usage.input_tokens || 0, output: res.usage.output_tokens || 0 } : undefined,
    });
    return res;
  });

  if (response.stop_reason === 'refusal') throw new Error('Anthropic model declined the request');
  return response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

/**
 * A2A over MCP: connects to the tenant's agent, calls its reply tool with the conversation
 * and returns the text it sends back. The tool is cfg.model if set, else 'reply'/'chat', else the first tool.
 */
async function completeMcp(messages, cfg, apiKey) {
  if (!cfg.endpoint) throw new Error('MCP endpoint URL is required');
  await assertSafeEndpoint(cfg.endpoint);
  const url = new URL(cfg.endpoint);
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const transport = /^wss?:$/.test(url.protocol)
    ? new WebSocketClientTransport(url)
    : /\/sse\/?$/.test(url.pathname)
      ? new SSEClientTransport(url, { requestInit: { headers, redirect: 'error' } })
      : new StreamableHTTPClientTransport(url, { requestInit: { headers, redirect: 'error' } });

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
  const who = `${cfg.provider}${cfg.model ? ` / ${cfg.model}` : ''} (tenant ${tenant?._id || 'unknown'})`;
  try {
    const reply = await completeChat(messages, cfg, options);
    if (reply && reply.trim()) return reply;
    console.error(`❌ [LLM Adapter]: ${who} returned an empty reply. Falling back to platform Azure.`);
    return null;
  } catch (err) {
    const status = err.status || err.response?.status;
    console.error(`❌ [LLM Adapter]: ${who} failed${status ? ` (HTTP ${status})` : ''}: ${err.message}. Falling back to platform Azure.`);
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

module.exports = {
  PROVIDERS, isCustomProvider, getApiKey, completeChat, completeForTenant, testConnection,
  // exported for tests / route-level validation
  assertSafeEndpoint, isPrivateAddress, buildOpenAIParams, buildAnthropicParams, supportsEffort, isReasoningModel,
};
