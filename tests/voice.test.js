// Owner voice learned from MongoDB messages (pure helpers, no database): node --test tests/voice.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { fingerprint, extractExchanges, describeFingerprint } = require('../services/voiceService');
const { humanChatRules, toHumanText, HUMAN_CHAT_RULES } = require('../services/replyStyle');

const me = (text, sentByAI = false) => ({ role: 'assistant', text, sentByAI });
const them = text => ({ role: 'user', text });

test('fingerprint measures length, emoji, capitals and skips media placeholders', () => {
  const fp = fingerprint(['Sybau 😂✌️', 'Whyyy', 'It\'s ok tell', 'u need to learn ctem tool', '[Shared Media / Sticker]', '💔']);
  assert.equal(fp.count, 5);
  assert.equal(fp.emojiShare, 40);
  assert.equal(fp.emojiOnlyShare, 20);
  assert.equal(fp.capStartShare, 60);
  assert.equal(fp.shortShare, 80);
  assert.ok(fp.topEmoji.includes('💔'));
  assert.ok(fp.topWords.includes('u'));
  assert.equal(fingerprint([]), null);
});

test('exchanges use only real owner replies, never AI-sent ones', () => {
  const chat = [
    them('hey'), me('Yo'),
    them('wru'), me('long witty ai line here', true),
    them('Ur so bad'), them('fr'), me('But u need to invite me'), me('Then only I come'),
  ];
  const ex = extractExchanges(chat);
  assert.equal(ex.length, 2);
  assert.deepEqual(ex[0], { them: ['hey'], me: ['Yo'] });
  assert.deepEqual(ex[1], { them: ['Ur so bad', 'fr'], me: ['But u need to invite me', 'Then only I come'] });
});

test('fingerprint description gives concrete targets', () => {
  const text = describeFingerprint(fingerprint(['Ok', 'Sleep', 'Why 💔', 'Yes', 'Come']), 'Sam');
  assert.match(text, /MEASURED FROM 5 MESSAGES SAM REALLY TYPED/);
  assert.match(text, /4 words or fewer/);
  assert.match(text, /💔/);
});

test('emoji allowed only for personal voice replies; business rules unchanged', () => {
  assert.equal(humanChatRules(), HUMAN_CHAT_RULES);
  assert.doesNotMatch(humanChatRules({ allowEmoji: true }), /NO EMOJI/);
  assert.equal(toHumanText('Sybau 😂✌️'), 'Sybau');
  assert.equal(toHumanText('Sybau 😂✌️', { keepEmoji: true }), 'Sybau 😂✌️');
});
