const test = require('node:test');
const assert = require('node:assert');
const { antiRepeatBlock, findRepeat, overused, recentReplies } = require('../services/repeatGuard');

const history = [
  { role: 'user', text: 'yo whats up' },
  { role: 'assistant', text: 'bro nothing much just chilling at home' },
  { role: 'user', text: 'did u see the match' },
  { role: 'assistant', text: 'bro kohli was insane fr [ATTACHMENT: lol]' },
  { role: 'user', text: 'ya' },
  { role: 'assistant', text: 'bro nothing much just chilling tbh' },
];

test('recent replies are the AI turns only, without attachment tags', () => {
  assert.deepStrictEqual(recentReplies(history), ['bro nothing much just chilling at home', 'bro kohli was insane fr', 'bro nothing much just chilling tbh']);
});

test('overused openers and repeated phrases are found', () => {
  const o = overused(recentReplies(history));
  assert.ok(o.openers.includes('bro'));
  assert.ok(o.phrases.includes('nothing much just'));
});

test('the anti-repeat note lists past replies and what to avoid', () => {
  const block = antiRepeatBlock(history);
  assert.match(block, /DO NOT REPEAT YOURSELF/);
  assert.match(block, /"bro kohli was insane fr"/);
  assert.match(block, /Openers you keep using: "bro"/);
  assert.strictEqual(antiRepeatBlock([{ role: 'user', text: 'hi' }]), '');
});

test('a near copy of a recent reply is caught; fresh or tiny replies pass', () => {
  assert.ok(findRepeat('bro nothing much just chilling at home lol', history));
  assert.ok(findRepeat('bro nothing much honestly, wbu tho', history));
  assert.strictEqual(findRepeat('wait ur exam is on the 12th right, u ready?', history), null);
  assert.strictEqual(findRepeat('lol fr', history), null);
});
