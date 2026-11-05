// Unit tests for the auth hardening helpers. No database or network: run with `node --test tests/`.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { SlidingWindowLimiter, FailureLockout, rateLimit, clientIp } = require('../services/rateLimiter');
const authService = require('../services/authService');

const makeClock = (start = 1_000_000) => {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
};

// ---------------------------------------------------------------- rate limiter
test('sliding window allows up to max hits, then blocks', () => {
  const now = makeClock();
  const l = new SlidingWindowLimiter({ windowMs: 1000, max: 3, now });
  assert.equal(l.hit('a').allowed, true);
  assert.equal(l.hit('a').allowed, true);
  assert.equal(l.hit('a').allowed, true);
  const blocked = l.hit('a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 1000);
  assert.equal(l.hit('b').allowed, true, 'keys are independent');
});

test('sliding window frees slots as old hits leave the window', () => {
  const now = makeClock();
  const l = new SlidingWindowLimiter({ windowMs: 1000, max: 2, now });
  l.hit('a');
  now.advance(600);
  l.hit('a');
  assert.equal(l.hit('a').allowed, false);
  now.advance(401); // first hit is now older than the window
  assert.equal(l.hit('a').allowed, true);
  assert.equal(l.hit('a').allowed, false);
  now.advance(1001);
  assert.equal(l.count('a'), 0);
  l.prune();
  assert.equal(l.hits.size, 0, 'prune drops idle keys');
});

test('lockout after N failures, lifts after lock time, success resets', () => {
  const now = makeClock();
  const lock = new FailureLockout({ maxFailures: 5, windowMs: 15 * 60e3, lockMs: 15 * 60e3, now });
  for (let i = 0; i < 4; i++) assert.equal(lock.recordFailure('u1').locked, false);
  const st = lock.recordFailure('u1');
  assert.equal(st.locked, true);
  assert.equal(st.retryAfterMs, 15 * 60e3);
  assert.equal(lock.isLocked('u2'), false, 'other accounts unaffected');
  now.advance(15 * 60e3 - 1);
  assert.equal(lock.isLocked('u1'), true);
  now.advance(1);
  assert.equal(lock.isLocked('u1'), false);
  // counter starts again from zero after a lock
  assert.equal(lock.recordFailure('u1').locked, false);
  lock.recordSuccess('u1');
  for (let i = 0; i < 4; i++) lock.recordFailure('u1');
  assert.equal(lock.isLocked('u1'), false);
});

test('failures older than the window do not count toward lockout', () => {
  const now = makeClock();
  const lock = new FailureLockout({ maxFailures: 3, windowMs: 1000, lockMs: 5000, now });
  lock.recordFailure('u');
  lock.recordFailure('u');
  now.advance(1500);
  assert.equal(lock.recordFailure('u').locked, false);
  assert.equal(lock.recordFailure('u').locked, false);
  assert.equal(lock.recordFailure('u').locked, true);
});

function fakeReqRes(ip = '1.2.3.4', xff) {
  const req = { headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress: ip } };
  const res = {
    statusCode: 200, body: null, headers: {},
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  return { req, res };
}

test('rateLimit middleware returns 429 with Retry-After once over the limit', () => {
  const now = makeClock();
  const mw = rateLimit({ name: 't', windowMs: 60e3, max: 2, now });
  let passed = 0;
  for (let i = 0; i < 3; i++) {
    const { req, res } = fakeReqRes();
    mw(req, res, () => { passed++; });
    if (i === 2) {
      assert.equal(res.statusCode, 429);
      assert.equal(res.headers['Retry-After'], '60');
      assert.match(res.body.error, /Too many/);
    }
  }
  assert.equal(passed, 2);
  now.advance(60e3);
  const { req, res } = fakeReqRes();
  mw(req, res, () => { passed++; });
  assert.equal(passed, 3, 'resets after the window');
});

test('clientIp ignores a spoofed left-most X-Forwarded-For entry', () => {
  const { req } = fakeReqRes('10.0.0.1', '6.6.6.6, 203.0.113.9');
  assert.equal(clientIp(req, 1), '203.0.113.9');
  const { req: direct } = fakeReqRes('198.51.100.7');
  assert.equal(clientIp(direct, 1), '198.51.100.7');
  const { req: single } = fakeReqRes('10.0.0.1', '203.0.113.9');
  assert.equal(clientIp(single, 1), '203.0.113.9');
});

// ---------------------------------------------------------------- escaping
test('escapeHtml neutralises markup and quotes', () => {
  assert.equal(authService.escapeHtml(`<img src=x onerror="alert('1')">&`),
    '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;');
  assert.equal(authService.escapeHtml(null), '');
  assert.equal(authService.escapeHtml(42), '42');
});

test('safeJsonForScript cannot break out of an inline script', () => {
  const evil = '</script><script>alert(1)</script><!-- &   ';
  const out = authService.safeJsonForScript({ error: evil });
  assert.ok(!out.includes('<'));
  assert.ok(!out.includes('>'));
  assert.ok(!out.includes('&'));
  assert.ok(!out.includes(' ') && !out.includes(' '));
  assert.deepEqual(JSON.parse(out), { error: evil }, 'still valid JSON with the same value');
  // eslint-disable-next-line no-eval
  assert.deepEqual(eval(`(${out})`), { error: evil }, 'and a valid JS literal');
  assert.equal(authService.safeJsonForScript(undefined), 'null');
});

// ---------------------------------------------------------------- TOTP replay guard
test('isTotpStepFresh only accepts a newer time-step', () => {
  const { isTotpStepFresh } = authService;
  assert.equal(isTotpStepFresh(0, 100), true);
  assert.equal(isTotpStepFresh(undefined, 100), true);
  assert.equal(isTotpStepFresh(100, 100), false, 'same code twice is a replay');
  assert.equal(isTotpStepFresh(101, 100), false, 'older code after a newer one');
  assert.equal(isTotpStepFresh(100, 101), true);
  assert.equal(isTotpStepFresh(0, 0), false);
  assert.equal(isTotpStepFresh(0, NaN), false);
});

test('checkTotp accepts the current code, rejects junk and returns the time-step', () => {
  const { generateSecret, generateSync } = require('otplib');
  const secret = generateSecret();
  const user = { twoFactor: { secret } };
  const code = generateSync({ secret });
  const ok = authService.checkTotp(user, code);
  assert.equal(ok.valid, true);
  assert.ok(Math.abs(ok.timeStep - Math.floor(Date.now() / 1000 / 30)) <= 1);
  assert.equal(authService.checkTotp(user, '12345').valid, false);
  assert.equal(authService.checkTotp(user, { $gt: '' }).valid, false);
  assert.equal(authService.checkTotp({ twoFactor: {} }, code).valid, false);
  // a code from 5 minutes ago is outside the tolerance
  const old = generateSync({ secret, epoch: Math.floor(Date.now() / 1000) - 300 });
  assert.equal(authService.checkTotp(user, old).valid, false);
});

// ---------------------------------------------------------------- input guards / tokens
test('asString rejects non-strings instead of crashing on .trim()', () => {
  const { asString } = authService;
  assert.equal(asString('  a@b.c '), 'a@b.c');
  assert.equal(asString(undefined), '');
  assert.equal(asString(null), '');
  assert.equal(asString(['a']), null);
  assert.equal(asString({ $ne: 1 }), null);
  assert.equal(asString(5), null);
});

test('tokenVersion check treats missing values as 0', () => {
  const { isTokenVersionCurrent } = authService;
  assert.equal(isTokenVersionCurrent({}, {}), true);
  assert.equal(isTokenVersionCurrent({ tokenVersion: 0 }, { tokenVersion: 0 }), true);
  assert.equal(isTokenVersionCurrent({}, { tokenVersion: 1 }), false);
  assert.equal(isTokenVersionCurrent({ tokenVersion: 1 }, { tokenVersion: 2 }), false);
  assert.equal(isTokenVersionCurrent(null, {}), false);
});

test('generateToken embeds tokenVersion and impersonation claims', () => {
  const user = { _id: 'u1', username: 'a', email: 'a@b.c', role: 'user', tokenVersion: 3 };
  const admin = { _id: 'adm', tokenVersion: 7 };
  const plain = authService.verifyToken(authService.generateToken(user));
  assert.equal(plain.tokenVersion, 3);
  assert.equal(plain.impersonatedBy, undefined);
  const imp = authService.verifyToken(authService.generateToken(user, { impersonatedBy: admin }));
  assert.equal(imp.impersonatedBy, 'adm');
  assert.equal(imp.impersonatorTokenVersion, 7);
  assert.ok(imp.exp - imp.iat <= 12 * 3600);
});

test('resolveUploadPath stays inside the uploads folder', () => {
  const dir = path.resolve('/srv/app/public/uploads');
  assert.equal(authService.resolveUploadPath('https://x.com/uploads/abc.png', dir), path.join(dir, 'abc.png'));
  assert.equal(authService.resolveUploadPath('https://x.com/uploads/abc.png?v=1', dir), path.join(dir, 'abc.png'));
  assert.equal(authService.resolveUploadPath('https://x.com/uploads/..%2F..%2Fserver.js', dir), null);
  assert.equal(authService.resolveUploadPath('https://x.com/uploads/a/b.png', dir), null);
  assert.equal(authService.resolveUploadPath('https://x.com/uploads/..', dir), null);
  assert.equal(authService.resolveUploadPath('https://cdn.example.com/img.png', dir), null);
  assert.equal(authService.resolveUploadPath(undefined, dir), null);
});

// ---------------------------------------------------------------- passkey challenges
test('challenge store is single-use and expires after its TTL', () => {
  const now = makeClock();
  const store = new authService.ChallengeStore({ ttlMs: 5 * 60e3, now });
  store.put('c1', { userId: null });
  assert.deepEqual(store.take('c1'), { userId: null });
  assert.equal(store.take('c1'), null, 'second use rejected');
  store.put('c2', { userId: 'u' });
  now.advance(5 * 60e3);
  assert.equal(store.take('c2'), null, 'expired');
});

test('challengeFromClientData reads the challenge from base64url JSON', () => {
  const cd = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: 'abc123' })).toString('base64url');
  assert.equal(authService.challengeFromClientData(cd), 'abc123');
  assert.equal(authService.challengeFromClientData('not-json'), null);
  assert.equal(authService.challengeFromClientData(undefined), null);
});

test('passkey origins and RP IDs come from env when set', () => {
  const req = { get: (h) => ({ origin: 'https://app.example.com' })[h] };
  const saved = { id: process.env.PASSKEY_RP_ID, o: process.env.PASSKEY_ORIGIN };
  try {
    delete process.env.PASSKEY_RP_ID;
    delete process.env.PASSKEY_ORIGIN;
    assert.equal(authService.getRpID(req), 'app.example.com');
    assert.equal(authService.getExpectedOrigins(req), 'https://app.example.com');
    process.env.PASSKEY_RP_ID = 'example.com, other.dev';
    process.env.PASSKEY_ORIGIN = 'https://app.example.com/, https://other.dev';
    assert.equal(authService.getRpID(req), 'example.com');
    assert.deepEqual(authService.getExpectedRpIDs(req), ['example.com', 'other.dev']);
    assert.deepEqual(authService.getExpectedOrigins(req), ['https://app.example.com', 'https://other.dev']);
  } finally {
    if (saved.id === undefined) delete process.env.PASSKEY_RP_ID; else process.env.PASSKEY_RP_ID = saved.id;
    if (saved.o === undefined) delete process.env.PASSKEY_ORIGIN; else process.env.PASSKEY_ORIGIN = saved.o;
  }
});
