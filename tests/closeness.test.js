const test = require('node:test');
const assert = require('node:assert');
const { computeCloseness, redactContactDetails, hasContactDetails, privacyRules, PERSONAL_ASK_RE } = require('../services/closeness');
const { familyRole } = require('../services/socialGraphService');

const NOW = Date.parse('2026-11-15T12:00:00Z');
const daysAgo = d => new Date(NOW - d * 86400000);

test('a new person or a test chat is a stranger', () => {
  assert.equal(computeCloseness({}, NOW).level, 'stranger');
  assert.equal(computeCloseness({ isTest: true, category: 'close_friend' }, NOW).level, 'stranger');
  assert.equal(computeCloseness({ category: 'online_friend', chatsCount: 3, firstSeen: daysAgo(2) }, NOW).level, 'stranger');
});

test('your own labels count most: family and close friends are close from day one', () => {
  assert.equal(computeCloseness({ relationshipToSam: 'Mother', familyRole }, NOW).level, 'close');
  assert.equal(computeCloseness({ category: 'close_friend' }, NOW).level, 'close');
  assert.equal(computeCloseness({ circle: 'family' }, NOW).level, 'close');
  assert.equal(computeCloseness({ relationshipToSam: 'Online Sister', familyRole, category: 'online_friend' }, NOW).level, 'stranger');
});

test('talking a lot over months earns trust; work contacts never get close', () => {
  const regular = computeCloseness({ category: 'online_friend', chatsCount: 4000, firstSeen: daysAgo(300), lastSeen: daysAgo(1), relationshipType: 'friend' }, NOW);
  assert.equal(regular.level, 'close');
  const some = computeCloseness({ category: 'online_friend', chatsCount: 150, firstSeen: daysAgo(60), lastSeen: daysAgo(3) }, NOW);
  assert.ok(['acquaintance', 'friend'].includes(some.level), some.level);
  const client = computeCloseness({ category: 'professional', chatsCount: 9000, firstSeen: daysAgo(700), lastSeen: daysAgo(1) }, NOW);
  assert.equal(client.level, 'acquaintance');
  const gone = computeCloseness({ category: 'online_friend', chatsCount: 200, firstSeen: daysAgo(400), lastSeen: daysAgo(300) }, NOW);
  assert.ok(gone.score < some.score + 20);
});

test('a level you set by hand wins', () => {
  assert.equal(computeCloseness({ category: 'close_friend', override: 'stranger' }, NOW).level, 'stranger');
  assert.equal(computeCloseness({ override: 'close' }, NOW).level, 'close');
});

test('contact details are removed for anyone not close', () => {
  const t = 'Call me on +91 98765 43210 or sam@example.com, 12 Gandhi street, Chennai 600001. I like piano.';
  const r = redactContactDetails(t);
  assert.ok(!/98765|sam@example|Gandhi street|600001/.test(r), r);
  assert.ok(r.includes('I like piano'));
  assert.ok(hasContactDetails(t));
  assert.ok(!hasContactDetails('see you at 5, 2 hours left'));
});

test('privacy rules: strangers get nothing personal, close people can have your number', () => {
  assert.match(privacyRules({ score: 5, level: 'stranger', reasons: [] }), /share NOTHING personal/);
  assert.match(privacyRules({ score: 60, level: 'friend', reasons: [] }), /NEVER share your phone number/);
  assert.match(privacyRules({ score: 90, level: 'close', reasons: [] }), /contact details/);
  assert.ok(PERSONAL_ASK_RE.test('whats ur number'));
  assert.ok(PERSONAL_ASK_RE.test('who is your mom'));
  assert.ok(!PERSONAL_ASK_RE.test('did you watch the match'));
});
