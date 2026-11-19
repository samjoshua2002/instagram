const test = require('node:test');
const assert = require('node:assert');
const { foreignWords, countsOf, vocabularyOf, avoidBlock, MIN_OWNER_WORDS } = require('../services/ownWords');

// An owner with a big enough vocabulary: filler words w0..w499 plus their real habits
const filler = Array.from({ length: MIN_OWNER_WORDS + 100 }, (_, i) => `w${i}x`);
const ownerMessages = [
  ...Array.from({ length: 2000 }, (_, i) => `${filler[i % filler.length]} ${filler[(i + 7) % filler.length]}`),
  ...Array(40).fill('bro im good'), ...Array(30).fill('ya ik'), ...Array(5).fill('busy rn'),
  ...Array(4).fill('chill da'),    // a word typed a few times in years (or saved from old untracked messages)
];
const overall = countsOf(ownerMessages);

test('words you use a lot are yours with everyone; a word typed a handful of times is not', () => {
  const someoneNew = { overall };
  assert.deepEqual(foreignWords('bro im good', someoneNew), []);
  assert.deepEqual(foreignWords('chill da', someoneNew), [], 'someone new: 4 of 2,079 messages is enough');
  assert.deepEqual(foreignWords("you've gone turbo mode", someoneNew), ["you've", 'gone', 'turbo', 'mode']);
});

test('with someone you talk to a lot, only words used in that chat (by either of you) or very common for you', () => {
  const mine = new Set([...vocabularyOf(['bro im good wbu', 'ya ik its been long']), ...filler.slice(0, 300)]);
  const theirs = countsOf([...Array(500).fill('hii how r u'), ...Array(5).fill('omg lichess'), 'da', 'da']);
  const chat = { overall, mine, theirs };
  assert.deepEqual(foreignWords('bro im good wbu', chat), []);
  assert.deepEqual(foreignWords('omg lichess later?', chat), ['later'], 'their regular words are fine to use back');
  assert.deepEqual(foreignWords('chill da', chat), ['chill', 'da'], 'never used with them; they typed "da" only twice');
  assert.deepEqual(foreignWords('how r u', chat), []);
  assert.deepEqual(foreignWords('turbo da', { ...chat, chatTexts: ['turbo da is my game'] }), [], 'words from the current chat are fine');
});

test('curly apostrophes are the same word; numbers and emoji are never flagged', () => {
  const mine = vocabularyOf(["don't", "you're", ...filler.slice(0, 300)]);
  const chat = { overall, mine };
  assert.deepEqual(foreignWords('don’t you’re', chat), []);
  assert.deepEqual(foreignWords('2026 🥹 100', chat), []);
});

test('not enough of your messages yet: nothing is judged', () => {
  assert.deepEqual(foreignWords('turbo mode', { overall: countsOf(['hi', 'ok']) }), []);
  assert.deepEqual(foreignWords('turbo mode', {}), []);
});

test('the words-to-avoid note names them; nothing when there are none', () => {
  assert.match(avoidBlock(['fam', 'rn']), /"fam", "rn"/);
  assert.equal(avoidBlock([]), '');
});
