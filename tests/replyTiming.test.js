const test = require('node:test');
const assert = require('node:assert');
const timing = require('../services/replyTiming');

const t = s => new Date(Date.UTC(2026, 10, 1) + s * 1000);

test('reply delays: from their first waiting message to your typed reply; AI replies and long breaks are not your pace', () => {
  const msgs = [
    { role: 'user', timestamp: t(0) }, { role: 'user', timestamp: t(5) }, { role: 'assistant', timestamp: t(12) },        // 12 s
    { role: 'user', timestamp: t(100) }, { role: 'assistant', sentByAI: true, timestamp: t(103) },                        // AI: no sample
    { role: 'assistant', timestamp: t(110) },                                                                             // nothing waiting
    { role: 'user', timestamp: t(200) }, { role: 'assistant', timestamp: t(200 + 3600) },                                  // away an hour
    { role: 'user', timestamp: t(9000) }, { role: 'assistant', isCheckIn: true, timestamp: t(9001) }, { role: 'assistant', timestamp: t(9040) }, // 40 s
  ];
  assert.deepEqual(timing.delaySamples(msgs), [12, 40]);
});

test('reply delays: several chats mixed together are kept apart', () => {
  const msgs = [
    { role: 'user', senderId: 'a', timestamp: t(0) },
    { role: 'user', senderId: 'b', timestamp: t(10) },
    { role: 'assistant', recipientId: 'b', timestamp: t(15) },
    { role: 'assistant', recipientId: 'a', timestamp: t(30) },
  ];
  const chatOf = m => (m.role === 'assistant' ? m.recipientId : m.senderId);
  assert.deepEqual(timing.delaySamples(msgs, chatOf).sort((x, y) => x - y), [5, 30]);
});

test('hold: drawn from your real delays, minus the time the AI needs to write; slowest quarter and over 45 s left out', () => {
  const samples = [...Array(75).fill(10), ...Array(25).fill(600)];
  assert.equal(timing.pickHoldMs(samples, { random: () => 0 }), 10000 - timing.WRITE_MS);
  assert.equal(timing.pickHoldMs(samples, { random: () => 0.99 }), 10000 - timing.WRITE_MS, 'slow moments are capped at your typical pace');
  const slow = Array(100).fill(300);
  assert.equal(timing.pickHoldMs(slow, { random: () => 0.5 }), timing.MAX_HOLD_MS - timing.WRITE_MS, 'never more than 45 s');
  assert.equal(timing.pickHoldMs([2, 3, 4, ...Array(40).fill(3)], { random: () => 0.5 }), 0, 'faster than the AI can write: no extra wait');
  assert.equal(timing.pickHoldMs([10, 12], { random: () => 0.5 }), null, 'too few replies to know');
});

test('pace summary for the Voice Check page', () => {
  assert.deepEqual(timing.summarize([4, 8, 12, 30, 120]), { replies: 5, medianSeconds: 12, within10s: 40, withinMinute: 80 });
  assert.equal(timing.summarize([]), null);
});
