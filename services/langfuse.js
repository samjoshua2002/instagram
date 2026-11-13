// Langfuse tracing over OpenTelemetry (@langfuse/* v6; the old `langfuse` package's API is refused by Langfuse Cloud).
// Off unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set. Every model call becomes a generation in Langfuse
// with its model, tokens, timing and (masked) messages. LANGFUSE_LOG_CONTENT=0 sends no message text at all.
const { LangfuseSpanProcessor } = require('@langfuse/otel');
const { setLangfuseTracerProvider, startActiveObservation, propagateAttributes, updateActiveObservation } = require('@langfuse/tracing');
const { context } = require('@opentelemetry/api');
const { AsyncLocalStorageContextManager } = require('@opentelemetry/context-async-hooks');
const { observeOpenAI } = require('@langfuse/openai');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');

const enabled = Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
const logContent = process.env.LANGFUSE_LOG_CONTENT !== '0';

/* ---------- masking: nothing secret leaves the server ---------- */

const SECRET_PATTERNS = [
  [/\b(sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,})/g, 'sk-••••'],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})/g, 'gh_••••'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA••••'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, 'xox-••••'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, 'AIza••••'],
  [/\b(?:rnd|vcp|pk|rk|sk)_(?:live_|test_)?[A-Za-z0-9]{16,}/g, 'key_••••'],
  [/\bEAA[A-Za-z0-9]{30,}/g, 'EAA••••'], // Meta / Instagram Graph tokens
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 'jwt••••'],
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+@/gi, '$1••••@'],
  [/([?&](?:access_token|_token|token|key|secret|password|sig)=)[^&\s"']+/gi, '$1••••'],
  [/\b([A-Z0-9_]*(?:PASSWORD|PASS|SECRET|TOKEN|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*)(\s*[=:]\s*)("?)[^\s"',;]+\3/g, '$1$2$3••••$3'],
  [/("(?:password|secret|token|access_token|api_?key|authorization)"\s*:\s*")[^"]+"/gi, '$1••••"'],
  [/\b(passw(?:or)?d|pwd|secret|token|api[_-]?key|access[_-]?key)(\s*[=:]\s*)(["']?)(?!••••)[^\s"',;]{3,}\3/gi, '$1$2$3••••$3'],
  [/(--(?:passw(?:or)?d|token|secret|api[_-]?key)\s+)(["']?)[^\s"']{3,}\2/gi, '$1$2••••$2'],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, '$1 ••••'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '-----PRIVATE KEY ••••-----'],
];

function scrub(text, max = 8000) {
  let out = String(text);
  for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
  return out.length > max ? `${out.slice(0, max)}… (${out.length - max} more chars)` : out;
}

/** Applied by Langfuse to every input, output and metadata value before it is sent. */
function mask({ data }) {
  if (!logContent) return '[not logged]';
  if (data == null) return data;
  if (typeof data === 'string') return scrub(data);
  try {
    return JSON.parse(scrub(JSON.stringify(data), 1_000_000));
  } catch {
    return '[masked]';
  }
}

/* ---------- setup ---------- */

let processor = null;
if (enabled) {
  processor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: (process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com').replace(/\/$/, ''),
    environment: (process.env.LANGFUSE_ENVIRONMENT || process.env.NODE_ENV || 'development').toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
    mask,
    // serverless hosts freeze right after a response: send each span as it ends there
    exportMode: process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME ? 'immediate' : 'batched',
  });
  // a private provider just for Langfuse: never clashes with any other OpenTelemetry setup
  setLangfuseTracerProvider(new NodeTracerProvider({ spanProcessors: [processor] }));
  // lets a task's model calls (retries, fallbacks) nest under that task's trace across awaits
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  const stop = () => processor.forceFlush().catch(() => {});
  process.once('beforeExit', stop);
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.once(sig, () => stop().finally(() => process.exit(0)));
  }
  console.log('[langfuse] tracing on');
}

/** Wrap an OpenAI / AzureOpenAI client so every call is traced. Returns the client unchanged when tracing is off. */
function traceOpenAI(client, config = {}) {
  return enabled ? observeOpenAI(client, config) : client;
}

/**
 * Trace any other model call (Anthropic, MCP agents…) as a generation.
 * `run(gen)` makes the call; use gen.update({ output, usageDetails }) inside it.
 */
async function traceGeneration(name, attributes, run) {
  if (!enabled) return run({ update() {} });
  return startActiveObservation(
    name,
    async (gen) => {
      gen.update(attributes);
      try {
        return await run(gen);
      } catch (err) {
        gen.update({ level: 'ERROR', statusMessage: String(err && err.message ? err.message : err).slice(0, 500) });
        throw err;
      }
    },
    { asType: 'generation' },
  );
}

const id200 = v => (v === undefined || v === null || v === '' ? undefined : String(v).slice(0, 200));

/**
 * Run fn as one named AI task: every model call inside (including retries and fallbacks) becomes a child of a
 * trace with this name, tied to the account (userId) and the person it is about (sessionId).
 */
async function aiTask(name, { userId, sessionId, tags, metadata, input } = {}, fn) {
  if (!enabled) return fn();
  return propagateAttributes({ traceName: name, userId: id200(userId) || 'admin', sessionId: id200(sessionId), tags }, () =>
    startActiveObservation(
      name,
      async span => {
        if (metadata || input !== undefined) span.update({ ...(metadata ? { metadata } : {}), ...(input !== undefined ? { input } : {}) });
        try {
          const result = await fn();
          // the task's answer (a reply, a summary…) as the trace output
          if (typeof result === 'string') span.update({ output: result });
          return result;
        } catch (err) {
          span.update({ level: 'ERROR', statusMessage: String(err && err.message ? err.message : err).slice(0, 500) });
          throw err;
        }
      },
      { asType: 'agent' },
    ),
  );
}

/**
 * Add details to the task being traced right now (which model was picked, how much history was used, why…).
 * Shows up as metadata on the trace in Langfuse. No-op when tracing is off or nothing is being traced.
 */
function annotate(metadata) {
  if (!enabled || !metadata) return;
  try {
    updateActiveObservation({ metadata });
  } catch {
    /* tracing must never break a reply */
  }
}

/** Wrap obj[method] so each call runs as aiTask(name, ctx(...args)). */
function instrument(obj, method, name, ctx = () => ({})) {
  const orig = obj && obj[method];
  if (!enabled || typeof orig !== 'function') return;
  obj[method] = function (...args) {
    let c = {};
    try {
      c = ctx(...args) || {};
    } catch {
      /* labels are best-effort */
    }
    return aiTask(name, c, () => orig.apply(this, args));
  };
}

async function flushLangfuse() {
  if (processor) await processor.forceFlush().catch(() => {});
}

module.exports = { traceOpenAI, traceGeneration, aiTask, instrument, annotate, flushLangfuse, scrub, langfuseEnabled: enabled };
