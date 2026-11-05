// In-memory sliding-window rate limiting and per-account lockout (no dependencies).
// State lives in this process only: with several server instances each one counts separately.

const MINUTE = 60 * 1000;

/**
 * Counts hits per key inside a sliding time window.
 * hit(key) records one hit and says whether it is still within the limit.
 */
class SlidingWindowLimiter {
  constructor({ windowMs = 15 * MINUTE, max = 10, now = Date.now } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.now = now;
    this.hits = new Map(); // key -> array of timestamps (oldest first)
  }

  _recent(key) {
    const cutoff = this.now() - this.windowMs;
    const list = (this.hits.get(key) || []).filter((t) => t > cutoff);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  count(key) {
    return this._recent(key).length;
  }

  hit(key) {
    const list = this._recent(key);
    if (list.length >= this.max) {
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, list[0] + this.windowMs - this.now()) };
    }
    list.push(this.now());
    this.hits.set(key, list);
    return { allowed: true, remaining: this.max - list.length, retryAfterMs: 0 };
  }

  reset(key) {
    this.hits.delete(key);
  }

  prune() {
    for (const key of [...this.hits.keys()]) this._recent(key);
  }
}

/**
 * Locks an account after too many failed attempts inside a window.
 * Keys are account ids (or any identifier); a success clears the failures.
 */
class FailureLockout {
  constructor({ maxFailures = 5, windowMs = 15 * MINUTE, lockMs = 15 * MINUTE, now = Date.now } = {}) {
    this.maxFailures = maxFailures;
    this.lockMs = lockMs;
    this.now = now;
    this.failures = new SlidingWindowLimiter({ windowMs, max: Number.MAX_SAFE_INTEGER, now });
    this.lockedUntil = new Map();
  }

  status(key) {
    const until = this.lockedUntil.get(key);
    if (until && until > this.now()) return { locked: true, retryAfterMs: until - this.now() };
    if (until) this.lockedUntil.delete(key);
    return { locked: false, retryAfterMs: 0 };
  }

  isLocked(key) {
    return this.status(key).locked;
  }

  // Records one failure; returns the lock status after it
  recordFailure(key) {
    this.failures.hit(key);
    if (this.failures.count(key) >= this.maxFailures) {
      this.lockedUntil.set(key, this.now() + this.lockMs);
      this.failures.reset(key);
    }
    return this.status(key);
  }

  recordSuccess(key) {
    this.failures.reset(key);
    this.lockedUntil.delete(key);
  }

  prune() {
    this.failures.prune();
    for (const key of [...this.lockedUntil.keys()]) this.status(key);
  }
}

/**
 * The real client IP. server.js trusts every proxy hop, so req.ip is the left-most
 * X-Forwarded-For entry, which the client can fake. Instead take the entry added by
 * our own proxy: TRUST_PROXY_HOPS (default 1, e.g. Render) entries from the right.
 */
function clientIp(req, hops = Number(process.env.TRUST_PROXY_HOPS ?? 1)) {
  const socketIp = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  const xff = String(req.headers?.['x-forwarded-for'] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!xff.length || !(hops > 0)) return socketIp || req.ip || 'unknown';
  const chain = [...xff, socketIp].filter(Boolean);
  const idx = Math.max(0, chain.length - 1 - hops);
  return chain[idx] || 'unknown';
}

/**
 * Express middleware: limits requests per client IP (or per keyFn(req)).
 */
function rateLimit({
  windowMs = 15 * MINUTE,
  max = 20,
  name = 'default',
  keyFn = (req) => clientIp(req),
  message = 'Too many attempts. Please wait a few minutes and try again.',
  now = Date.now,
} = {}) {
  const limiter = new SlidingWindowLimiter({ windowMs, max, now });
  registry.add(limiter);
  const middleware = (req, res, next) => {
    const key = `${name}:${keyFn(req)}`;
    const result = limiter.hit(key);
    if (!result.allowed) {
      const retryAfter = Math.ceil(result.retryAfterMs / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message, retryAfterSeconds: retryAfter });
    }
    next();
  };
  middleware.limiter = limiter;
  return middleware;
}

// Periodic cleanup so idle keys do not pile up in memory
const registry = new Set();
function track(instance) {
  registry.add(instance);
  return instance;
}
const sweeper = setInterval(() => {
  for (const item of registry) {
    try { item.prune(); } catch { /* ignore */ }
  }
}, 5 * MINUTE);
if (typeof sweeper.unref === 'function') sweeper.unref();

module.exports = {
  MINUTE,
  SlidingWindowLimiter,
  FailureLockout,
  rateLimit,
  clientIp,
  track,
};
