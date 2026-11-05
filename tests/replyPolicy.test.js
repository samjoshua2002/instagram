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
