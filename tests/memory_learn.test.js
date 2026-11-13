// Tests the REAL memoryService.scheduleMemoryUpdate and learnedChanges (real Mongoose UserMemory model,
// no database needed: documents are hydrated in memory). The AI learning run itself is faked.
const assert = require('assert');
const path = require('path');
const repo = (process.argv[2] || require('path').join(__dirname, '..'));
const quiet = { log: console.log, warn: console.warn, error: console.error };
console.warn = () => {}; console.error = () => {};
const memoryService = require(path.join(repo, 'services/memoryService.js'));
const UserMemory = require(path.join(repo, 'models/UserMemory.js'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const tests = [];
const t = (name, fn) => tests.push([name, fn]);

function fakeRuns(durationMs = 0) {
  const runs = [];
  let active = 0, maxActive = 0;
  memoryService.updateMemoryAsync = async (senderId, ownerId) => {
    active++; maxActive = Math.max(maxActive, active);
    runs.push({ senderId, ownerId, at: Date.now() });
    await sleep(durationMs);
    active--;
    return true;
  };
  return { runs, max: () => maxActive };
}

t('burst of 10 DMs -> ONE learning run (was 10+)', async () => {
  const f = fakeRuns();
  for (let i = 0; i < 10; i++) { memoryService.scheduleMemoryUpdate('fan1', 'o1', { quietMs: 40, maxWaitMs: 1000 }); await sleep(5); }
  await sleep(80);
  assert.strictEqual(f.runs.length, 1);
});

t('run starts only after the chat goes quiet', async () => {
  const f = fakeRuns();
  const start = Date.now();
  memoryService.scheduleMemoryUpdate('fan2', 'o1', { quietMs: 40, maxWaitMs: 1000 });
  await sleep(20);
  memoryService.scheduleMemoryUpdate('fan2', 'o1', { quietMs: 40, maxWaitMs: 1000 });
  await sleep(80);
  assert.strictEqual(f.runs.length, 1);
  assert(f.runs[0].at - start >= 55, 'waited for quiet after the 2nd DM');
});

t('non-stop chat still learns by the max wait', async () => {
  const f = fakeRuns();
  const start = Date.now();
  for (let i = 0; i < 20; i++) { memoryService.scheduleMemoryUpdate('fan3', 'o1', { quietMs: 30, maxWaitMs: 100 }); await sleep(10); }
  assert(f.runs.length >= 1, 'learned during the burst');
  assert(f.runs[0].at - start <= 140, 'no later than max wait (+ timer slack)');
  await sleep(60);
});

t('never two runs at once for the same contact; DMs during a run queue exactly one more', async () => {
  const f = fakeRuns(60);
  memoryService.scheduleMemoryUpdate('fan4', 'o1', { quietMs: 5, maxWaitMs: 1000 });
  await sleep(20); // run in progress
  for (let i = 0; i < 5; i++) memoryService.scheduleMemoryUpdate('fan4', 'o1', { quietMs: 5, maxWaitMs: 1000 });
  await sleep(200);
  assert.strictEqual(f.max(), 1, 'no overlap');
  assert.strictEqual(f.runs.length, 2, 'one run + one follow-up for the messages that came in meanwhile');
});

t('different contacts learn independently', async () => {
  const f = fakeRuns();
  memoryService.scheduleMemoryUpdate('a', 'o1', { quietMs: 10, maxWaitMs: 1000 });
  memoryService.scheduleMemoryUpdate('b', 'o1', { quietMs: 10, maxWaitMs: 1000 });
  memoryService.scheduleMemoryUpdate('a', 'o2', { quietMs: 10, maxWaitMs: 1000 });
  await sleep(50);
  assert.strictEqual(f.runs.length, 3);
});

t('a failing run does not wedge the queue', async () => {
  memoryService.updateMemoryAsync = async () => { throw new Error('azure down'); };
  memoryService.scheduleMemoryUpdate('fan5', 'o1', { quietMs: 5, maxWaitMs: 1000 });
  await sleep(30);
  const f = fakeRuns();
  memoryService.scheduleMemoryUpdate('fan5', 'o1', { quietMs: 5, maxWaitMs: 1000 });
  await sleep(30);
  assert.strictEqual(f.runs.length, 1);
});

t('queue is empty after runs finish (no leak)', async () => {
  await sleep(20);
  assert.strictEqual(memoryService._learnQueue.size, 0);
});

t('conflict fallback writes ONLY what learning changed, never toggles/counters', async () => {
  // A document as loaded from the database (not new), then changed by the learning run
  const doc = UserMemory.hydrate({
    _id: '64b000000000000000000001', ownerId: '64b000000000000000000009', senderId: 's1', username: 'fan',
    name: 'User_1234', nickname: '', aiEnabled: true, messageCount: 7, facts: [{ fact: 'old fact' }], recentChatBuffer: [],
  });
  doc.name = 'Priya';
  doc.nickname = 'pri';
  doc.facts.push({ fact: 'loves cricket' });
  // Even if learning had touched protected fields, they must not be written back
  doc.aiEnabled = true; doc.messageCount = 7;
  doc.markModified('aiEnabled'); doc.markModified('messageCount');
  const set = memoryService.learnedChanges(doc);
  assert.deepStrictEqual(Object.keys(set).sort(), ['facts', 'name', 'nickname']);
  assert.deepStrictEqual(set.facts.map(f => f.fact), ['old fact', 'loves cricket']);
  assert(!('aiEnabled' in set) && !('messageCount' in set) && !('_id' in set));
});

t('conflict fallback with nothing learned writes nothing', async () => {
  const doc = UserMemory.hydrate({ _id: '64b000000000000000000002', senderId: 's2', username: 'x' });
  assert.deepStrictEqual(memoryService.learnedChanges(doc), {});
});

(async () => {
  let pass = 0;
  for (const [name, fn] of tests) {
    try { await fn(); pass++; quiet.log('  ok -', name); }
    catch (e) { quiet.log('  FAIL -', name, '\n     ', e.message); }
  }
  quiet.log(`memory learning: ${pass}/${tests.length} passed`);
  process.exit(pass === tests.length ? 0 : 1);
})();
