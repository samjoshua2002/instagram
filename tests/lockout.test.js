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
