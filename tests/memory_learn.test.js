// Background memory learning: a burst of DMs leads to ONE learning run per contact once the chat goes quiet,
// never two runs at once for the same contact. Loads the real services/memoryService.js with the database,
// Redis and AI stubbed out (no network): run with `node --test tests/memory_learn.test.js`
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Stub modules memoryService pulls in, before it is required
const stub = (rel, exports) => {
  const file = require.resolve(path.join(__dirname, '..', rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub('services/redisService.js', { cacheUserMemory: async () => {}, getUserMemory: async () => null, pushMessage: async () => {} });
stub('models/UserMemory.js', { findOne: async () => null, updateOne: async () => ({}), findById: async () => null });
stub('models/Message.js', { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) });
process.env.AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || 'test-key';
process.env.AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || 'http://127.0.0.1:9/';
const memoryService = require('../services/memoryService');
const { changedFields } = require('../services/memoryService');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const FAST = { quietMs: 40, maxWaitMs: 400 };

// Replaces the slow AI run with a recorder; restores it afterwards
function recordRuns(t, runMs = 0) {
  const runs = [];
  let active = 0, maxActive = 0;
  const orig = memoryService._updateMemoryOnce;
  memoryService._updateMemoryOnce = async (senderId, options) => {
    active++; maxActive = Math.max(maxActive, active);
    runs.push({ senderId, ownerId: options.ownerId, at: Date.now() });
    await sleep(runMs);
    active--;
  };
  t.after(() => { memoryService._updateMemoryOnce = orig; });
  return { runs, maxActive: () => maxActive };
}

test('burst of 10 DMs -> ONE learning run', async (t) => {
  const rec = recordRuns(t);
  for (let i = 0; i < 10; i++) { memoryService.scheduleMemoryUpdate('fan1', { ownerId: 'o1' }, FAST); await sleep(5); }
  await sleep(150);
  assert.equal(rec.runs.length, 1);
});

test('run starts only after the chat goes quiet', async (t) => {
  const rec = recordRuns(t);
  const start = Date.now();
  memoryService.scheduleMemoryUpdate('fan2', { ownerId: 'o1' }, FAST);
  await sleep(20);
  assert.equal(rec.runs.length, 0, 'not before the quiet window');
  await sleep(100);
  assert.equal(rec.runs.length, 1);
  assert.ok(rec.runs[0].at - start >= FAST.quietMs - 5);
});

test('non-stop chat still learns by the max wait', async (t) => {
  const rec = recordRuns(t);
  const end = Date.now() + 600;
  while (Date.now() < end) { memoryService.scheduleMemoryUpdate('fan3', { ownerId: 'o1' }, FAST); await sleep(10); }
  assert.ok(rec.runs.length >= 1, 'learned at least once while the chat never paused');
  await sleep(150); // let the last queued run finish before the next test
});

test('never two runs at once for the same contact; DMs during a run queue exactly one more', async (t) => {
  const rec = recordRuns(t, 80);
  const a = memoryService.updateMemoryAsync('fan4', { ownerId: 'o1' });
  await sleep(10);
  memoryService.updateMemoryAsync('fan4', { ownerId: 'o1' });
  memoryService.updateMemoryAsync('fan4', { ownerId: 'o1' });
  await a; await sleep(120);
  assert.equal(rec.maxActive(), 1);
  assert.equal(rec.runs.length, 2);
});

test('different contacts and different accounts learn independently', async (t) => {
  const rec = recordRuns(t);
  memoryService.scheduleMemoryUpdate('fanA', { ownerId: 'o1' }, FAST);
  memoryService.scheduleMemoryUpdate('fanB', { ownerId: 'o1' }, FAST);
  memoryService.scheduleMemoryUpdate('fanA', { ownerId: 'o2' }, FAST);
  await sleep(150);
  assert.equal(rec.runs.length, 3);
});

test('a failing run does not wedge the queue', async (t) => {
  const orig = memoryService._updateMemoryOnce;
  let calls = 0;
  memoryService._updateMemoryOnce = async () => { calls++; if (calls === 1) throw new Error('AI down'); };
  t.after(() => { memoryService._updateMemoryOnce = orig; });
  const quiet = console.error; console.error = () => {};
  t.after(() => { console.error = quiet; });
  memoryService.scheduleMemoryUpdate('fan5', { ownerId: 'o1' }, FAST);
  await sleep(120);
  memoryService.scheduleMemoryUpdate('fan5', { ownerId: 'o1' }, FAST);
  await sleep(120);
  assert.equal(calls, 2);
});

test('queue is empty after runs finish (no leak)', async (t) => {
  recordRuns(t);
  for (let i = 0; i < 20; i++) memoryService.scheduleMemoryUpdate('leak' + i, { ownerId: 'o1' }, FAST);
  await sleep(150);
  assert.equal(memoryService._learnQueue.size, 0);
  assert.equal(memoryService._runs.size, 0);
});

test('changedFields reports only learned fields that changed', () => {
  // The snapshot holds JSON text of each learned field, taken before the AI call
  const snap = { facts: JSON.stringify(['a']), nickname: JSON.stringify('x') };
  const doc = { facts: ['a', 'b'], nickname: 'x', aiEnabled: false, messageCount: 99 };
  const ch = changedFields(snap, doc);
  assert.ok('facts' in ch);
  assert.ok(!('nickname' in ch));
  assert.ok(!('aiEnabled' in ch) && !('messageCount' in ch), 'toggles and counters are never written by learning');
});
