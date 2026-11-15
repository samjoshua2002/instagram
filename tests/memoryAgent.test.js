const test = require('node:test');
const assert = require('node:assert');
const { applyReview } = require('../services/memoryAgentRules');

const facts = [
  { fact: 'Rajveer is his dad', source: 'learned' },
  { fact: 'Studies commerce', source: 'learned' },
  { fact: 'Is studying commerce', source: 'learned' },
  { fact: 'Loves surfing', source: 'you' },
  { fact: 'Has a laptop', source: 'learned' },
  { fact: 'Quit Roblox', source: 'learned' },
];

test('agent review: drops wrong facts, merges duplicates, never touches your facts', () => {
  const r = applyReview(facts, { drop: [{ index: 0, reason: 'owner said Rajveer is a friend' }, { index: 3, reason: 'x' }], merge: [{ indices: [1, 2], text: 'Studies commerce' }] });
  assert.equal(r.skipped, false);
  assert.ok(!r.facts.some(f => f.fact === 'Rajveer is his dad'));
  assert.ok(r.facts.some(f => f.fact === 'Loves surfing' && f.source === 'you'));
  assert.equal(r.facts.filter(f => /commerce/i.test(f.fact)).length, 1);
  assert.equal(r.changes.length, 2);
});

test('agent review: a review that would remove too much is not applied', () => {
  const r = applyReview(facts, { drop: [0, 1, 2, 4, 5].map(index => ({ index })) });
  assert.equal(r.skipped, true);
  assert.equal(r.facts.length, facts.length);
});
