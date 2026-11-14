// Run: node --test tests/replyPolicy.test.js  (no database or network needed)
const test = require('node:test');
const assert = require('node:assert');
const { shouldSendAiTextReply, preferencesForMode } = require('../lib/replyPolicy');

test('shared reel/post never gets an AI text reply', () => {
  assert.strictEqual(shouldSendAiTextReply({ aiEnabled: true, replyToMessages: true, isReelOrShare: true }), false);
  assert.strictEqual(shouldSendAiTextReply({ aiEnabled: true, replyToMessages: false, isReelOrShare: true }), false);
});

test('normal message gets a reply only when AI and message replies are on', () => {
  assert.strictEqual(shouldSendAiTextReply({ aiEnabled: true, replyToMessages: true, isReelOrShare: false }), true);
  assert.strictEqual(shouldSendAiTextReply({ aiEnabled: true, isReelOrShare: false }), true);
  assert.strictEqual(shouldSendAiTextReply({ aiEnabled: false, replyToMessages: true, isReelOrShare: false }), false);
  assert.strictEqual(shouldSendAiTextReply({ aiEnabled: true, replyToMessages: false, isReelOrShare: false }), false);
});

test('AI modes: full AI replies to messages only; old reels_only now means off', () => {
  assert.deepStrictEqual(preferencesForMode('full_ai'), { aiEnabled: true, replyToMessages: true, replyToReelsAndPosts: false });
  assert.deepStrictEqual(preferencesForMode('reels_only'), { aiEnabled: false, replyToMessages: false, replyToReelsAndPosts: false });
  assert.deepStrictEqual(preferencesForMode('paused'), preferencesForMode('reels_only'));
  assert.strictEqual(preferencesForMode(undefined), null);
});

const { routingAfterMode } = require('../lib/replyPolicy');

test('turning a person on in "only selected" mode adds their sender id; off removes it and old keys', () => {
  const cfg = { chatMode: 'only_selected', includedContactIds: ['111', 'fami'] };
  assert.deepStrictEqual(routingAfterMode(cfg, { senderIds: ['222'], otherKeys: ['bob'] }, true), { includedContactIds: ['111', 'fami', '222'] });
  assert.deepStrictEqual(routingAfterMode(cfg, { senderIds: ['999'], otherKeys: ['fami'] }, false), { includedContactIds: ['111'] });
});

test('"everyone except" lists the people who are off', () => {
  const cfg = { chatMode: 'everyone_except', excludedContactIds: ['111'] };
  assert.deepStrictEqual(routingAfterMode(cfg, { senderIds: ['222'] }, false), { excludedContactIds: ['111', '222'] });
  assert.deepStrictEqual(routingAfterMode(cfg, { senderIds: ['111'] }, true), { excludedContactIds: [] });
});

test('no change when the lists already agree, the mode is "everyone", or the person has no sender id', () => {
  assert.strictEqual(routingAfterMode({ chatMode: 'only_selected', includedContactIds: ['222'] }, { senderIds: ['222'] }, true), null);
  assert.strictEqual(routingAfterMode({ chatMode: 'everyone' }, { senderIds: ['222'] }, false), null);
  assert.strictEqual(routingAfterMode({ chatMode: 'only_selected', includedContactIds: [] }, { senderIds: [] }, true), null);
});
