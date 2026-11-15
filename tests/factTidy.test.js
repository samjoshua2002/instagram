const test = require('node:test');
const assert = require('node:assert');
const { tidyCandidates, applyTidy } = require('../lib/factTidy');

const make = (n, mineAt = []) => Array.from({ length: n }, (_, i) => ({
  fact: `fact ${i}`, addedAt: new Date(2026, 0, 1 + i), source: mineAt.includes(i) ? 'you' : 'learned',
}));

test('short lists are left alone', () => {
  assert.deepStrictEqual(tidyCandidates(make(60)), []);
  assert.deepStrictEqual(tidyCandidates(null), []);
});

test('long lists offer only older learned facts, never the newest or your own', () => {
  const c = tidyCandidates(make(61, [3, 55]));
  assert.strictEqual(c.length, 40); // 41 older, minus your fact at index 3
  assert.ok(!c.some(f => f.source === 'you'));
  assert.ok(!c.some(f => f.fact === 'fact 41'));
});

test('applyTidy keeps your facts and the newest, retires the rest', () => {
  const facts = make(61, [3, 55]);
  const { facts: out, retired } = applyTidy(facts, ['likes cricket', 'fact 0']);
  assert.strictEqual(out.length, 2 + 1 + 20);
  assert.deepStrictEqual(out.slice(0, 2).map(f => f.fact), ['likes cricket', 'fact 0']);
  assert.strictEqual(out[2].fact, 'fact 3');
  assert.strictEqual(out[2].source, 'you');
  assert.deepStrictEqual(out.slice(3).map(f => f.fact), facts.slice(41).map(f => f.fact));
  assert.ok(out.some(f => f.fact === 'fact 55'));
  assert.strictEqual(retired.length, 39); // 40 condensed minus "fact 0" kept
  assert.ok(!retired.includes('fact 0') && !retired.includes('fact 3'));
});

test('an empty or not-shorter answer changes nothing', () => {
  const facts = make(61);
  assert.strictEqual(applyTidy(facts, []).facts, facts);
  assert.strictEqual(applyTidy(facts, Array.from({ length: 41 }, (_, i) => `x${i}`)).retired.length, 0);
});
