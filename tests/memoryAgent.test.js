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

test('name drift: most facts about another name means they were renamed', () => {
  const { detectNameDrift } = require('../services/memoryAgentRules');
  const facts = ["Laptop: Rajveer's laptop is lagging", 'Commerce: Rajveer is studying commerce', 'Roblox: Rajveer quit Roblox', 'Leg pain: mentioned leg pain', 'Likes surfing reels'];
  assert.equal(detectNameDrift(facts, 'mochi'), 'Rajveer');
  assert.equal(detectNameDrift(facts, 'Rajveer'), null);
  assert.equal(detectNameDrift(['She likes cats', 'She is in college', 'She quit gym'], 'Asha'), null);
  assert.equal(detectNameDrift(['Fami likes cats', 'Moksha visited', 'Arun called'], 'Sam'), null);
});

test('name drift ignores "User", fancy fonts of the same name, and the owner', () => {
  const { detectNameDrift, plainName } = require('../services/memoryAgentRules');
  assert.equal(detectNameDrift(['User likes cats', 'User is in college', 'User quit gym'], 'Asra'), null);
  assert.equal(detectNameDrift(['Saumya likes cats', 'Saumya is in college', 'Saumya quit gym'], '✩⃛ 𝑆𝒶𝓊𝓂𝓎𝒶✩⃛'), null);
  assert.equal(detectNameDrift(['Ankith likes cats', 'Ankith is in college', 'Ankith quit gym'], 'Ankush'), 'Ankith');
  assert.equal(plainName('✩⃛ 𝑆𝒶𝓊𝓂𝓎𝒶✩⃛'), 'saumya');
});

test("people in their life never includes the owner or the owner's own people", () => {
  const { isOwnerOrOwnersPerson } = require('../services/memoryAgentRules');
  const owner = ['Sam Joshua', 'Sam', 'catovidz'];
  for (const c of [
    { targetName: 'Sam Joshua', relationship: 'friend' }, { targetName: 'Sam', relationship: 'friend' },
    { targetName: "Sam's mom", relationship: 'mother' }, { targetName: 'Wife', relationship: "Sam's wife" },
    { targetName: 'Annie', relationship: "Sam's sister" }, { targetName: "Sam's office colleague", relationship: 'Akka' },
  ]) assert.ok(isOwnerOrOwnersPerson(c, owner), JSON.stringify(c));
  for (const c of [
    { targetName: 'Mom', relationship: 'mother' }, { targetName: 'Jennifer', relationship: 'neighbor' },
    { targetName: 'Fami', relationship: 'friend' }, { targetName: 'Samantha', relationship: 'cousin' },
  ]) assert.ok(!isOwnerOrOwnersPerson(c, owner), JSON.stringify(c));
});
