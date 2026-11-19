const test = require('node:test');
const assert = require('node:assert');
const pacing = require('../lib/humanPacing');

const seq = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

test('answer later: rare (about 1 in 12) and short (15 to 45 s); business never waits', () => {
  assert.equal(pacing.clusterHoldMs({ random: seq(0.5), chance: 0.2 }), pacing.QUICK_GROUP_MS);
  assert.equal(pacing.clusterHoldMs({ random: seq(0.1, 0), chance: 0.2 }), pacing.LATER_MIN_MS);
  assert.equal(pacing.clusterHoldMs({ random: seq(0.1, 1), chance: 0.2 }), pacing.LATER_MAX_MS);
  assert.equal(pacing.clusterHoldMs({ random: seq(0), chance: 0.2, isBusiness: true }), pacing.QUICK_GROUP_MS);
  assert.equal(pacing.clusterHoldMs({ random: seq(0), chance: 0 }), pacing.QUICK_GROUP_MS, 'chance 0 turns it off');
  // Over many chats the share that waits is close to the chance
  let later = 0;
  for (let i = 0; i < 5000; i += 1) if (pacing.clusterHoldMs({ chance: 0.2 }) > pacing.QUICK_GROUP_MS) later += 1;
  assert.ok(later > 800 && later < 1200, `~20% wait (got ${later / 50}%)`);
});

test('answer later: messages that arrive meanwhile join the same reply, without pushing it later', () => {
  const now = 1_000_000;
  assert.equal(pacing.joinWaitMs(now + 30_000, now), 30_000, 'keeps the original deadline');
  assert.equal(pacing.joinWaitMs(now + 200, now), pacing.QUICK_GROUP_MS, 'a quick burst still waits 1 s for the next line');
  assert.equal(pacing.joinWaitMs(undefined, now), pacing.QUICK_GROUP_MS);
});

test('BATCH_REPLY_CHANCE sets the share; bad values fall back to 8%', () => {
  assert.equal(pacing.laterChance({ BATCH_REPLY_CHANCE: '0.5' }), 0.5);
  assert.equal(pacing.laterChance({ BATCH_REPLY_CHANCE: '0' }), 0);
  assert.equal(pacing.laterChance({ BATCH_REPLY_CHANCE: 'lots' }), 0.08);
  assert.equal(pacing.laterChance({ BATCH_REPLY_CHANCE: '3' }), 0.08);
  assert.equal(pacing.laterChance({}), 0.08);
  assert.equal(pacing.LATER_MIN_MS, 15000);
  assert.equal(pacing.LATER_MAX_MS, 45000);
});

test('only a ❤️ is fine for "ok", "gn", laughs; not for questions, long messages, or twice in a row', () => {
  for (const t of ['ok', 'gn da', 'hahaha', 'thanks bro', '[Shared an Instagram Reel: "cat"]']) {
    assert.equal(pacing.mayReactOnly({ incomingText: t }), true, t);
  }
  for (const t of ['u coming tmrw', 'what time', 'enna panra', 'ok but why?', 'so today my manager called me in and said the whole team is being moved to another city next month']) {
    assert.equal(pacing.mayReactOnly({ incomingText: t }), false, t);
  }
  const reactedLast = [{ role: 'user', text: 'lol' }, { role: 'assistant', text: pacing.REACT_RECORD }];
  assert.equal(pacing.mayReactOnly({ incomingText: 'ok', history: reactedLast }), false);
  const wordsLast = [{ role: 'assistant', text: pacing.REACT_RECORD }, { role: 'user', text: 'x' }, { role: 'assistant', text: 'sure' }];
  assert.equal(pacing.mayReactOnly({ incomingText: 'ok', history: wordsLast }), true);
});

test('reaction plan: [REACT] alone is only a reaction, with words is both; a failed AI hearts instead of "yoo wassup!"', () => {
  assert.deepEqual(pacing.planReaction({ replyText: '[REACT]', lastMid: 'm1' }), { text: '', react: true, reactOnly: true, reaction: 'love' });
  assert.deepEqual(pacing.planReaction({ replyText: '[REACT: laugh] bro what', lastMid: 'm1' }), { text: 'bro what', react: true, reactOnly: false, reaction: 'laugh' });
  assert.deepEqual(pacing.planReaction({ replyText: '[REACT: 😮]', lastMid: 'm1' }), { text: '', react: true, reactOnly: true, reaction: 'wow' });
  assert.deepEqual(pacing.planReaction({ replyText: 'same da', lastMid: 'm1' }), { text: 'same da', react: false, reactOnly: false, reaction: null });
  assert.deepEqual(pacing.planReaction({ replyText: 'yoo wassup!', aiFailed: true, lastMid: 'm1' }), { text: '', react: true, reactOnly: true, reaction: 'love' });
  // The model copying the history note is treated as that reaction, never sent as text
  assert.deepEqual(pacing.planReaction({ replyText: '[Reacted 😂 to their message]', lastMid: 'm1' }), { text: '', react: true, reactOnly: true, reaction: 'laugh' });
  // Business: never reacts, the tag is just removed; no message id: nothing to react to
  assert.deepEqual(pacing.planReaction({ replyText: '[REACT: love] Thanks!', isBusiness: true, lastMid: 'm1' }), { text: 'Thanks!', react: false, reactOnly: false, reaction: null });
  assert.deepEqual(pacing.planReaction({ replyText: 'yoo wassup!', aiFailed: true, isBusiness: true, lastMid: 'm1' }), { text: 'yoo wassup!', react: false, reactOnly: false, reaction: null });
  assert.deepEqual(pacing.planReaction({ replyText: '[REACT]', lastMid: '' }), { text: '', react: false, reactOnly: false, reaction: null });
});

test('reactions: names and emoji map to Instagram\'s reactions; unknown ones become ❤️', () => {
  assert.equal(pacing.toReaction('laugh'), 'laugh');
  assert.equal(pacing.toReaction('💀'), 'laugh');
  assert.equal(pacing.toReaction('🥲'), 'sad');
  assert.equal(pacing.toReaction('🔥'), 'like');
  assert.equal(pacing.toReaction('❤'), 'love');
  assert.equal(pacing.toReaction('👍🏽'), 'like', 'skin tones are ignored');
  assert.equal(pacing.toReaction('🦄'), null);
  assert.equal(pacing.reactionOf('[REACT: 🦄]'), 'love');
  assert.equal(pacing.reactionOf('no tag'), null);
  assert.equal(pacing.reactRecord('laugh'), '[Reacted 😂 to their message]');
});

test('your reactions follow the emoji you type most', () => {
  const h = pacing.reactionHabits(['💀', '😂', '🥲', '❤️', '🦄']);
  assert.deepEqual(h.order.slice(0, 2), ['laugh', 'sad']);
  assert.ok(h.order.includes('love'));
  assert.match(h.line, /💀 😂 🥲 ❤️/);
  assert.match(h.line, /laugh 😂/);
  assert.deepEqual(pacing.reactionHabits([]), { order: [], line: '' });
});

test('the reaction request uses Meta\'s documented shape; a refused reaction falls back to ❤️ for good', async () => {
  const axios = require('axios');
  const svc = require('../services/instagramService');
  const sent = [];
  const realPost = axios.post;
  const refuse = name => async (url, body) => {
    sent.push(body);
    if (body.payload.reaction === name) { const e = new Error('bad'); e.response = { status: 400, data: { error: { message: 'Invalid reaction' } } }; throw e; }
    return { data: { recipient_id: 'r1' } };
  };
  try {
    axios.post = refuse('none');
    assert.equal(await svc.sendMessageReaction('r1', 'mid.1', '😂', 'IGQVJtest'), 'laugh');
    assert.deepEqual(sent[0], { recipient: { id: 'r1' }, sender_action: 'react', payload: { message_id: 'mid.1', reaction: 'laugh' } });
    sent.length = 0;
    axios.post = refuse('wow');
    assert.equal(await svc.sendMessageReaction('r1', 'mid.2', 'wow', 'IGQVJtest'), 'love', 'refused wow is sent as ❤️');
    assert.deepEqual(sent.map(b => b.payload.reaction), ['wow', 'love']);
    sent.length = 0;
    assert.equal(await svc.sendMessageReaction('r1', 'mid.3', 'wow', 'IGQVJtest'), 'love');
    assert.deepEqual(sent.map(b => b.payload.reaction), ['love'], 'wow is not tried again');
    axios.post = async () => { const e = new Error('down'); e.code = 'ECONNRESET'; throw e; };
    assert.equal(await svc.sendMessageReaction('r1', 'mid.4', 'love', 'IGQVJtest'), false);
    assert.equal(await svc.sendMessageReaction('r1', '', 'love', 'IGQVJtest'), false, 'no message id: nothing to react to');
  } finally {
    axios.post = realPost;
  }
});

test('answer later: if they keep texting while we wait (4+ messages), the reply goes out within 5 s', () => {
  const now = 1_000_000;
  assert.equal(pacing.joinWaitMs(now + 40_000, now, 2), 40_000, 'a couple of messages: keeps waiting');
  assert.equal(pacing.joinWaitMs(now + 40_000, now, 4), 5000, '4 waiting: answer soon');
  assert.equal(pacing.joinWaitMs(now + 2000, now, 6), 2000, 'never later than the original deadline');
  assert.equal(pacing.joinWaitMs(now + 200, now, 6), pacing.QUICK_GROUP_MS);
});
