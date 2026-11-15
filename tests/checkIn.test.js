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
  assert.equal(checkInDecision({ ...base, lastCheckInAt: hAgo(10) }).ok, false);
  assert.equal(checkInDecision({ ...base, quiet: true }).ok, false);
  assert.equal(checkInDecision({ ...base, enabled: false }).ok, false);
  assert.equal(checkInDecision({ ...base, sentToday: 6, dailyLimit: 6 }).ok, false);
});

test('check-in asks about the biggest gap first', () => {
  assert.equal(nextQuestionTopic({ lifeEvents: [{ title: 'TCS NQT exam', details: 'next week' }] }).topic, 'life event follow-up');
  assert.equal(nextQuestionTopic({}).topic, 'what they are up to');
});

test('counting goes out one number per message', () => {
  assert.deepEqual(splitIntoBubbles('1 2 3 4 5'), ['1', '2', '3', '4', '5']);
  assert.deepEqual(splitIntoBubbles('1\n2\n3\n4\n5'), ['1', '2', '3', '4', '5']);
  assert.deepEqual(splitIntoBubbles('one, two, three, four, five'), ['one', 'two', 'three', 'four', 'five']);
  assert.deepEqual(splitIntoBubbles('ok wait'), ['ok wait']);
});
