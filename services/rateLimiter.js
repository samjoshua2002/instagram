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
  // escalate: each repeat lock within 24h lasts twice as long (up to maxLockMs); a success resets it
  constructor({ maxFailures = 5, windowMs = 15 * MINUTE, lockMs = 15 * MINUTE, now = Date.now, escalate = false, maxLockMs = 24 * 60 * MINUTE } = {}) {
    this.maxFailures = maxFailures;
    this.lockMs = lockMs;
    this.now = now;
    this.escalate = escalate;
    this.maxLockMs = maxLockMs;
    this.failures = new SlidingWindowLimiter({ windowMs, max: Number.MAX_SAFE_INTEGER, now });
    this.lockedUntil = new Map();
    this.strikes = new Map(); // key -> { count, at } (escalate only)
  }

  nextLockMs(key) {
    if (!this.escalate) return this.lockMs;
    const prev = this.strikes.get(key);
    const count = prev && this.now() - prev.at < 24 * 60 * MINUTE ? prev.count + 1 : 1;
    const ms = Math.min(this.maxLockMs, this.lockMs * 2 ** (count - 1));
    // Counted from the end of the lock, so the strike outlives even a full 24h lock
    this.strikes.set(key, { count, at: this.now() + ms });
    return ms;
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
      this.lockedUntil.set(key, this.now() + this.nextLockMs(key));
      this.failures.reset(key);
    }
    return this.status(key);
  }

  recordSuccess(key) {
    this.failures.reset(key);
    this.lockedUntil.delete(key);
    this.strikes.delete(key);
  }

  prune() {
    this.failures.prune();
    for (const key of [...this.lockedUntil.keys()]) this.status(key);
    for (const [key, s] of this.strikes) if (this.now() - s.at >= 24 * 60 * MINUTE) this.strikes.delete(key);
  }
}

/**
 * The address group used for lockouts: an IPv4 address as is, an IPv6 address by its /64 network
 * (one home or phone line gets a whole /64, so single IPv6 addresses are free to rotate).
 */
function networkOf(ip) {
  let s = String(ip || '').trim().toLowerCase();
  if (!s) return 'unknown';
  // Some proxies add a port: "1.2.3.4:5555" or "[2001:db8::1]:5555"
  const bracketed = s.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) s = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.split(':')[0];
  s = s.split('%')[0];
  if (s.startsWith('::ffff:') && s.includes('.')) return s.slice(7); // IPv4 written as IPv6
  const hexMapped = s.match(/^(?:(?:0{1,4}:){5}|::)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) { // ::ffff:0102:0304 is 1.2.3.4
    const [a, b] = [parseInt(hexMapped[1], 16), parseInt(hexMapped[2], 16)];
    return [a >> 8, a & 255, b >> 8, b & 255].join('.');
  }
  if (!s.includes(':')) return s;
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail ? tail.split(':') : [];
  const groups = tail !== undefined ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return groups.slice(0, 4).map(g => (g || '0').replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

/**
 * Account lockout that a stranger cannot use against the owner. Wrong tries are counted per
 * account AND network address (strict), so they lock only the place they come from; a much higher
 * per-account cap still stops guessing spread over many addresses. Networks the owner signed in
 * from before skip that account-wide cap (they keep their own per-address lock), so spread-out
 * guessing by a stranger cannot lock the owner out at home. Success clears both.
 */
class AccountLockout {
  constructor({ perIp = 5, perAccount = 30, windowMs = 15 * MINUTE, lockMs = 15 * MINUTE, now = Date.now, knownForMs = 30 * 24 * 60 * MINUTE, maxKnown = 10, known = new Map() } = {}) {
    this.now = now;
    this.ipLock = new FailureLockout({ maxFailures: perIp, windowMs, lockMs, now });
    // Account-wide locks double on each repeat, so spread-out guessing slows to a crawl
    this.accountLock = new FailureLockout({ maxFailures: perAccount, windowMs, lockMs, now, escalate: true });
    this.knownForMs = knownForMs;
    this.maxKnown = maxKnown;
    // account -> Map(network -> time of the last correct password/code from it). Pass one Map to several
    // lockouts so a network proven by password also counts as known for codes (and the other way round)
    this.known = known;
  }

  // 'pw:<id>' and 'code:<id>' share the same known networks
  static accountOf(key) {
    return String(key).replace(/^[a-z]+:/i, '');
  }

  static ipKey(key, ip) {
    return `${key}|${networkOf(ip)}`;
  }

  // True when this account had a correct password/code from this network recently
  isKnown(key, ip) {
    const net = networkOf(ip);
    if (net === 'unknown') return false;
    const at = this.known.get(AccountLockout.accountOf(key))?.get(net);
    return at !== undefined && this.now() - at < this.knownForMs;
  }

  status(key, ip) {
    const here = this.ipLock.status(AccountLockout.ipKey(key, ip));
    if (here.locked || this.isKnown(key, ip)) return here;
    return this.accountLock.status(key);
  }

  // Records one failure; returns the lock status after it
  recordFailure(key, ip) {
    const here = this.ipLock.recordFailure(AccountLockout.ipKey(key, ip));
    const account = this.accountLock.recordFailure(key);
    if (here.locked || this.isKnown(key, ip)) return here;
    return account;
  }

  recordSuccess(key, ip) {
    this.ipLock.recordSuccess(AccountLockout.ipKey(key, ip));
    this.accountLock.recordSuccess(key);
    const net = networkOf(ip);
    if (net === 'unknown') return;
    const nets = this.known.get(AccountLockout.accountOf(key)) || new Map();
    nets.delete(net); // re-insert so the newest is last
    nets.set(net, this.now());
    while (nets.size > this.maxKnown) nets.delete(nets.keys().next().value);
    this.known.set(AccountLockout.accountOf(key), nets);
  }

  prune() {
    this.ipLock.prune();
    this.accountLock.prune();
    for (const [key, nets] of this.known) {
      for (const [net, at] of nets) if (this.now() - at >= this.knownForMs) nets.delete(net);
      if (!nets.size) this.known.delete(key);
    }
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
  AccountLockout,
  networkOf,
  rateLimit,
  clientIp,
  track,
};
