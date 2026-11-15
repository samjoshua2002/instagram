const test = require('node:test');
const assert = require('node:assert');
const { checkInDecision, nextQuestionTopic } = require('../services/checkInRules');
const { splitIntoBubbles } = require('../services/humanizeService');

const NOW = Date.parse('2026-11-15T14:00:00Z');
const hAgo = h => new Date(NOW - h * 3600 * 1000);
const base = { level: 'close', lastTheirsAt: hAgo(6), lastAnyAt: hAgo(5), lastAnyRole: 'assistant', now: NOW };

test('check-in: quiet chat with someone close, inside the 24h window', () => {
  assert.equal(checkInDecision(base).ok, true);
});

test('check-in: never for strangers, outside the window, when active, unanswered or double-texting', () => {
  assert.equal(checkInDecision({ ...base, level: 'acquaintance' }).ok, false);
  assert.equal(checkInDecision({ ...base, level: 'friend' }).ok, false);
  assert.equal(checkInDecision({ ...base, level: 'friend', minLevel: 'friend' }).ok, true);
  assert.equal(checkInDecision({ ...base, lastTheirsAt: hAgo(23), lastAnyAt: hAgo(22) }).ok, false);
  assert.equal(checkInDecision({ ...base, lastAnyAt: hAgo(1) }).ok, false);
  assert.equal(checkInDecision({ ...base, lastAnyRole: 'user' }).ok, false);
  assert.equal(checkInDecision({ ...base, lastAnyWasCheckIn: true }).ok, false);
  assert.equal(checkInDecision({ ...base, lastCheckInAt: hAgo(10) }).ok, true);
  assert.equal(checkInDecision({ ...base, quiet: true }).ok, true);
  assert.equal(checkInDecision({ ...base, enabled: false }).ok, false);
  assert.equal(checkInDecision({ ...base, sentToday: 6, dailyLimit: 6 }).ok, false);
});

test('check-in asks about the biggest gap first', () => {
  assert.equal(nextQuestionTopic({ lifeEvents: [{ title: 'TCS NQT exam', details: 'next week' }] }).topic, 'life event follow-up');
  assert.equal(nextQuestionTopic({}).topic, 'what they are up to');
});

test('every line the AI writes is its own message (the AI decides how to send)', () => {
  assert.deepEqual(splitIntoBubbles('1\n2\n3\n4\n5'), ['1', '2', '3', '4', '5']);
  const c = splitIntoBubbles(Array.from({ length: 15 }, (_, i) => i + 53).join('\n'));
  assert.equal(c.length, 15);
  assert.deepEqual(splitIntoBubbles('53 54 55 56 57'), ['53 54 55 56 57']);
  assert.deepEqual(splitIntoBubbles('ok wait'), ['ok wait']);
  assert.deepEqual(splitIntoBubbles('I have 2 cats'), ['I have 2 cats']);
  assert.equal(splitIntoBubbles(Array.from({ length: 400 }, (_, i) => `${i}`).join('\n')).length, 300);
});

test('[REPEAT n] and [COUNT a-b] expand into separate messages, capped at 300', () => {
  const { expandDirectives } = require('../services/humanizeService');
  assert.deepEqual(splitIntoBubbles('10000 is crazy, here is 3\n[REPEAT 3] i love you'), ['10000 is crazy, here is 3', 'i love you', 'i love you', 'i love you']);
  assert.equal(splitIntoBubbles('[REPEAT 10000] hi').length, 300);
  assert.deepEqual(splitIntoBubbles('[COUNT 53-56]'), ['53', '54', '55', '56']);
  assert.deepEqual(splitIntoBubbles('[COUNT 5 to 3]'), ['5', '4', '3']);
  assert.equal(splitIntoBubbles('[COUNT 1-1000]').length, 300);
  assert.deepEqual(expandDirectives(['hello']), ['hello']);
});

test('photo and video descriptions replace the placeholder', () => {
  const { withDescription } = require('../services/mediaService');
  assert.match(withDescription('[Sent a Photo]', 'photo', 'a snow leopard'), /Sent a photo: a snow leopard/);
  assert.match(withDescription('[Sent a Video]', 'video', null), /can't open right now/);
});
