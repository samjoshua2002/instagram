// Echo detection: the app's own sends vs the creator typing on the phone at the same moment.
// No database or network: run with `node --test tests/echo.test.js`
const test = require('node:test');
const assert = require('node:assert/strict');

const instagramService = require('../services/instagramService');

// A fake send that finishes when we say so and returns the given message id
function controlledSend(mid) {
  let finish;
  const done = new Promise(resolve => { finish = () => resolve({ success: true, data: { message_id: mid } }); });
  return { send: () => done, finish };
}

test('echo of a message the app already sent is recognised at once', async () => {
  await instagramService.trackSend('c1', async () => ({ success: true, data: { message_id: 'mid_app_1' } }));
  assert.equal(await instagramService.isAppEcho('c1', 'mid_app_1'), true);
});

test('no send in flight: an unknown echo is the creator', async () => {
  assert.equal(await instagramService.isAppEcho('c2', 'mid_phone_1'), false);
});

test('echo arriving before our own send returns is still recognised as ours', async () => {
  const s = controlledSend('mid_app_2');
  const sending = instagramService.trackSend('c3', s.send);
  const check = instagramService.isAppEcho('c3', 'mid_app_2');
  s.finish();
  await sending;
  assert.equal(await check, true);
});

test('creator typing on the phone while the app is sending is NOT treated as an app echo', async () => {
  const s = controlledSend('mid_app_3');
  const sending = instagramService.trackSend('c4', s.send);
  const check = instagramService.isAppEcho('c4', 'mid_phone_2');
  s.finish();
  await sending;
  assert.equal(await check, false);
});

test('overlapping sends: waits for all of them before deciding', async () => {
  const a = controlledSend('mid_app_4');
  const b = controlledSend('mid_app_5');
  const sa = instagramService.trackSend('c5', a.send);
  const sb = instagramService.trackSend('c5', b.send);
  const check = instagramService.isAppEcho('c5', 'mid_app_5');
  a.finish();
  await sa;
  b.finish();
  await sb;
  assert.equal(await check, true);
  assert.equal(instagramService.sendingTo.has('c5'), false);
  assert.equal(instagramService.sendWaiters.has('c5'), false);
});

test('a send to another contact does not delay or change the answer', async () => {
  const s = controlledSend('mid_app_6');
  const sending = instagramService.trackSend('c6', s.send);
  assert.equal(await instagramService.isAppEcho('c7', 'mid_phone_3'), false);
  s.finish();
  await sending;
});

test('a failed send still releases waiting echo checks', async () => {
  const sending = instagramService.trackSend('c8', async () => { throw new Error('network'); }).catch(() => {});
  const check = instagramService.isAppEcho('c8', 'mid_phone_4');
  await sending;
  assert.equal(await check, false);
  assert.equal(instagramService.sendingTo.has('c8'), false);
});

test('waitForSends gives up after the time limit', async () => {
  const s = controlledSend('mid_app_7');
  const sending = instagramService.trackSend('c9', s.send);
  // The limit timer is unref'd (it must never keep the server alive), so hold the test process open
  const keepAlive = setTimeout(() => {}, 5000);
  const t0 = Date.now();
  await instagramService.waitForSends('c9', 50);
  clearTimeout(keepAlive);
  assert.ok(Date.now() - t0 < 1000);
  s.finish();
  await sending;
});

test('a send that timed out on our side but was delivered: its echo is matched by text', async () => {
  await instagramService.trackSend('c10', async () => ({ success: false, error: 'timeout' }), 'see you at 6');
  assert.equal(await instagramService.isAppEcho('c10', 'mid_unknown_1', 'see you at 6'), true);
  // only once: the same text typed again by the creator later is theirs
  assert.equal(await instagramService.isAppEcho('c10', 'mid_unknown_2', 'see you at 6'), false);
});

test('text fallback never swallows a different message from the creator', async () => {
  await instagramService.trackSend('c11', async () => ({ success: false }), 'bot text');
  assert.equal(await instagramService.isAppEcho('c11', 'mid_phone_5', 'creator text'), false);
});

test('a send with a confirmed id leaves nothing for the text fallback', async () => {
  await instagramService.trackSend('c12', async () => ({ success: true, data: { message_id: 'mid_app_8' } }), 'hello');
  assert.equal(await instagramService.isAppEcho('c12', 'mid_phone_6', 'hello'), false);
});
