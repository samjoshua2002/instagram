// AccountLockout: wrong tries lock only the address they come from, with a per-account backstop.
// No database or network: run with `node --test tests/lockout.test.js`
const test = require('node:test');
const assert = require('node:assert/strict');

const { AccountLockout, MINUTE } = require('../services/rateLimiter');

const make = () => {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms) => { t += ms; } };
  const lock = new AccountLockout({ perIp: 5, perAccount: 30, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE, now: clock.now });
  return { lock, clock };
};

test('a stranger guessing from one address cannot lock the owner out', () => {
  const { lock } = make();
  for (let i = 0; i < 5; i++) lock.recordFailure('pw:owner', '6.6.6.6');
  assert.equal(lock.status('pw:owner', '6.6.6.6').locked, true);
  assert.equal(lock.status('pw:owner', '1.2.3.4').locked, false);
});

test('the per-address lock lasts 15 minutes, then clears', () => {
  const { lock, clock } = make();
  for (let i = 0; i < 5; i++) lock.recordFailure('pw:a', '6.6.6.6');
  clock.advance(15 * MINUTE - 1);
  assert.equal(lock.status('pw:a', '6.6.6.6').locked, true);
  clock.advance(2);
  assert.equal(lock.status('pw:a', '6.6.6.6').locked, false);
});

test('guessing spread over many addresses still hits the per-account cap', () => {
  const { lock } = make();
  for (let i = 0; i < 30; i++) lock.recordFailure('code:b', `10.0.0.${i}`);
  assert.equal(lock.status('code:b', '99.99.99.99').locked, true);
});

test('below both limits nothing is locked', () => {
  const { lock } = make();
  for (let i = 0; i < 4; i++) lock.recordFailure('pw:c', '6.6.6.6');
  assert.equal(lock.status('pw:c', '6.6.6.6').locked, false);
});

test('a successful sign-in clears the count for that address', () => {
  const { lock } = make();
  for (let i = 0; i < 4; i++) lock.recordFailure('pw:d', '1.2.3.4');
  lock.recordSuccess('pw:d', '1.2.3.4');
  for (let i = 0; i < 4; i++) lock.recordFailure('pw:d', '1.2.3.4');
  assert.equal(lock.status('pw:d', '1.2.3.4').locked, false);
});

test('accounts are independent', () => {
  const { lock } = make();
  for (let i = 0; i < 5; i++) lock.recordFailure('pw:e', '6.6.6.6');
  assert.equal(lock.status('pw:f', '6.6.6.6').locked, false);
});

test('recordFailure reports the lock and a retry time', () => {
  const { lock } = make();
  let after;
  for (let i = 0; i < 5; i++) after = lock.recordFailure('pw:g', '6.6.6.6');
  assert.equal(after.locked, true);
  assert.ok(after.retryAfterMs > 0);
});

test('a missing address still works (counted as unknown)', () => {
  const { lock } = make();
  for (let i = 0; i < 5; i++) lock.recordFailure('pw:h', '');
  assert.equal(lock.status('pw:h', undefined).locked, true);
});

test('rotating IPv6 addresses inside one /64 counts as one address', () => {
  const { lock } = make();
  for (let i = 0; i < 5; i++) lock.recordFailure('pw:i', `2001:db8:1:2::${i + 1}`);
  assert.equal(lock.status('pw:i', '2001:db8:1:2::ffff').locked, true);
  assert.equal(lock.status('pw:i', '2001:db8:9:9::1').locked, false);
});

test('account-wide locks double on each repeat, and a success resets them', () => {
  const { lock, clock } = make();
  const lockAccount = () => { for (let i = 0; i < 30; i++) lock.recordFailure('code:j', `10.1.${i}.1`); };
  lockAccount();
  assert.ok(Math.abs(lock.status('code:j', '9.9.9.9').retryAfterMs - 15 * MINUTE) < 1000);
  clock.advance(15 * MINUTE + 1);
  lockAccount();
  assert.ok(Math.abs(lock.status('code:j', '9.9.9.9').retryAfterMs - 30 * MINUTE) < 1000);
  clock.advance(30 * MINUTE + 1);
  lockAccount();
  assert.ok(Math.abs(lock.status('code:j', '9.9.9.9').retryAfterMs - 60 * MINUTE) < 1000);
  clock.advance(60 * MINUTE + 1);
  lock.recordSuccess('code:j', '9.9.9.9');
  lockAccount();
  assert.ok(Math.abs(lock.status('code:j', '8.8.8.8').retryAfterMs - 15 * MINUTE) < 1000);
});

test('per-address locks do not escalate (a typo-prone owner is never locked for hours)', () => {
  const { lock, clock } = make();
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 5; i++) lock.recordFailure('pw:k', '1.2.3.4');
    assert.ok(lock.status('pw:k', '1.2.3.4').retryAfterMs <= 15 * MINUTE);
    clock.advance(15 * MINUTE + 1);
  }
});

test('a network the owner signed in from skips the account-wide lock, but keeps its own', () => {
  const { lock, clock } = make();
  lock.recordSuccess('code:k', '5.5.5.5'); // owner signs in at home
  for (let i = 0; i < 30; i++) lock.recordFailure('code:k', `10.2.${i}.1`); // stranger spreads guesses
  assert.equal(lock.status('code:k', '8.8.8.8').locked, true); // strangers stay locked
  assert.equal(lock.status('code:k', '5.5.5.5').locked, false); // owner at home is not
  for (let i = 0; i < 5; i++) lock.recordFailure('code:k', '5.5.5.5');
  assert.equal(lock.status('code:k', '5.5.5.5').locked, true); // own per-address lock still applies
  clock.advance(31 * 24 * 60 * MINUTE); // trust expires after 30 days
  for (let i = 0; i < 30; i++) lock.recordFailure('code:k', `10.3.${i}.1`);
  assert.equal(lock.status('code:k', '5.5.5.5').locked, true);
});

test('the account lock stays at 24h once capped instead of dropping back to 15 minutes', () => {
  const { lock, clock } = make();
  let r = 0;
  const lockAccount = () => {
    for (let i = 0; i < 30; i++) lock.recordFailure('code:z', `10.${r}.${i}.1`);
    r++;
    return lock.status('code:z', '9.9.9.9').retryAfterMs;
  };
  let ms;
  for (let k = 0; k < 8; k++) { ms = lockAccount(); clock.advance(ms + 1); }
  assert.equal(ms, 24 * 60 * MINUTE);
  assert.equal(lockAccount(), 24 * 60 * MINUTE);
});

test('strikes fade after a quiet day', () => {
  const { lock, clock } = make();
  const lockAccount = (p) => { for (let i = 0; i < 30; i++) lock.recordFailure('code:q', `10.${p}.${i}.1`); };
  lockAccount(1);
  clock.advance(15 * MINUTE + 24 * 60 * MINUTE + 1);
  lockAccount(2);
  assert.ok(Math.abs(lock.status('code:q', '9.9.9.9').retryAfterMs - 15 * MINUTE) < 1000);
});

test('address forms of one client share one bucket', () => {
  const { networkOf } = require('../services/rateLimiter');
  for (const ip of ['1.2.3.4', '1.2.3.4:5555', '::ffff:1.2.3.4', '::FFFF:0102:0304', '0:0:0:0:0:ffff:102:304']) {
    assert.equal(networkOf(ip), '1.2.3.4', ip);
  }
  assert.equal(networkOf('[2001:db8:1:2::1]:443'), networkOf('2001:0DB8:0001:0002:ffff::'));
  assert.equal(networkOf('2001:db8:1:2::5%eth0'), '2001:db8:1:2::/64');
});
