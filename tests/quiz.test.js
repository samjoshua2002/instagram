const test = require('node:test');
const assert = require('node:assert');
const { styleScore, matchScore, charSimilarity } = require('../services/quizRules');
const { allItems } = require('../services/quizBank');

test('quiz bank: 60 questions in 10 rounds, from strangers, friends and close friends', () => {
  const items = allItems();
  assert.equal(items.length, 60);
  assert.ok(['stranger', 'friend', 'close'].every(f => items.some(i => i.from === f)));
  assert.equal(new Set(items.map(i => i.id)).size, 60);
});

test('style score: same style scores high, very different style scores low', () => {
  assert.ok(styleScore('nothing much wbu', 'nothing much rn wbu') > 70);
  assert.ok(styleScore('nothing much wbu', 'Hello! I am currently working on a few exciting projects. How about you?') < 45);
  assert.equal(charSimilarity('', 'x'), 0);
  assert.equal(matchScore(80, 60), 70);
  assert.equal(matchScore(80, NaN), 80);
});
