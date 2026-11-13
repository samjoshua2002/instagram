// End-to-end test of the REAL reply pipeline code from server.js (dispatch, cancel, echo handling)
// with fake Instagram / AI / database. Timers run 1000x faster.
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync((process.argv[2] || require('path').join(__dirname, '..', 'server.js')), 'utf8');

function cut(startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  assert(a !== -1, 'missing ' + startMarker);
  const b = src.indexOf(endMarker, a);
  assert(b !== -1, 'missing end for ' + startMarker);
  return src.slice(a, b);
}
const code = [
  cut('function queueKey(', '\n}\n') + '\n}\n',
  cut('const inFlightReplies = new Map();', '\nconst DEBOUNCE_WAIT_MS'),
  cut('async function handleCreatorEchoAsync(', '\n// POST /webhook'),
  cut('async function dispatchDebouncedReply(', '\n/**\n * ---------------------------------------------------------------------\n * 2. DASHBOARD'),
].join('\n');
// The helpers block ends where the next unrelated code starts; make sure we got what we need
for (const fn of ['noteAiSend', 'takeRecentAiSend', 'cancelAiReply', 'aiReplyBlockedReason', 'replyStillWanted', 'writeAndSendReply'])
  assert(code.includes('function ' + fn), 'extracted code lacks ' + fn);

const FAST = 1000;
function makeWorld() {
  const w = {
    persona: { globalBotActive: true, chatMode: 'everyone', excludedContactIds: [], includedContactIds: [] },
    memory: { username: 'fan1', aiEnabled: true, replyToMessages: true, replyToReelsAndPosts: true },
    sent: [], records: [], memoryUpdates: 0, dbFails: false,
    aiText: 'x'.repeat(200), // long reply -> long typing delay (21-34s, i.e. 21-34ms here)
  };
  const chain = (val) => ({ select() { return this; }, lean() { return w.dbFails ? Promise.reject(new Error('db down')) : Promise.resolve(val()); }, sort() { return this; }, limit() { return Promise.resolve([]); }, then(r) { r(null); } });
  const deps = {
    userDebounceQueues: new Map(),
    PersonaConfig: { findOne: () => chain(() => ({ ...w.persona })) },
    UserMemory: { findOne: () => chain(() => ({ ...w.memory })), updateOne: async () => { w.memoryUpdates++; } },
    SocialGraph: { updateOne: async () => {} },
    Message: { find: () => chain(() => []), exists: async () => false, record: async (doc) => { w.records.push(doc); return { inserted: true }; } },
    instagramService: {
      sendSenderAction: async () => {},
      sendTextMessage: async (to, text) => { w.sent.push({ type: 'text', to, text }); return { success: true, data: { message_id: 'mid_' + w.sent.length } }; },
      sendImageMessage: async (to, url) => { w.sent.push({ type: 'image', to, url }); return { success: true, data: { message_id: 'img_' + w.sent.length } }; },
    },
    azureOpenAI: { generateReply: async () => w.aiText },
    stickerService: { hasSticker: () => true, getStickerUrl: async () => 'https://x/s.gif' },
    redisService: { pushMessage: async () => {}, cacheUserMemory: async () => {} },
    memoryService: { updateMemoryAsync: async () => true, scheduleMemoryUpdate: () => {} },
    canSendMedia: () => Boolean(w.allowMedia), recordMediaSent: () => {}, recordTextSent: () => {},
    resolveCreatorForAccount: async () => ({ _id: 'owner1' }),
    setTimeout: (fn, ms) => setTimeout(fn, (ms || 0) / FAST),
    setInterval: (fn, ms) => setInterval(fn, ms / FAST),
    clearInterval, process: { env: {} }, console: { log() {}, warn() {}, error() {} },
  };
  const names = Object.keys(deps);
  const api = new Function(...names, code + '\nreturn { dispatchDebouncedReply, handleCreatorEchoAsync, cancelAiReply, aiReplyBlockedReason, replyStillWanted, noteAiSend, takeRecentAiSend, inFlightReplies };')(...names.map(n => deps[n]));
  return { w, deps, api };
}
const entry = (over = {}) => ({ senderId: 'fan1', recipientId: 'creatorIG', ownerId: 'owner1', creatorAccessToken: 't', ownerUser: { _id: 'owner1' }, userMemory: { username: 'fan1', recentChatBuffer: [] }, config: { creatorName: 'C' }, messages: [{ text: 'hey', mid: 'in1' }], lastMid: 'in1', isReelOrShare: false, ...over });
const echo = (text, extra = {}) => ({ recipient: { id: 'fan1' }, sender: { id: 'creatorIG' }, message: { mid: 'echo_' + Math.random(), text, ...extra } });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const texts = (w) => w.sent.filter(s => s.type === 'text');

const tests = [];
const t = (name, fn) => tests.push([name, fn]);

t('normal reply is sent exactly once', async () => {
  const { w, api } = makeWorld();
  await api.dispatchDebouncedReply(entry());
  assert.strictEqual(texts(w).length, 1);
  assert.strictEqual(api.inFlightReplies.size, 0, 'in-flight entry cleaned up');
});

t('creator replying from phone while AI is typing -> AI reply NOT sent', async () => {
  const { w, api } = makeWorld();
  const p = api.dispatchDebouncedReply(entry());
  await sleep(8);
  await api.handleCreatorEchoAsync(echo('brb, answering this myself'), 'creatorIG');
  await p;
  assert.strictEqual(texts(w).length, 0);
  assert.strictEqual(w.memoryUpdates, 1, 'manual reply still counted');
});

t('AI paused for this person while typing -> NOT sent', async () => {
  const { w, api } = makeWorld();
  const p = api.dispatchDebouncedReply(entry());
  await sleep(8); w.memory.aiEnabled = false;
  await p;
  assert.strictEqual(texts(w).length, 0);
});

t('global bot paused while typing -> NOT sent', async () => {
  const { w, api } = makeWorld();
  const p = api.dispatchDebouncedReply(entry());
  await sleep(8); w.persona.globalBotActive = false;
  await p;
  assert.strictEqual(texts(w).length, 0);
});

t('chat mode switched to paused while typing -> NOT sent', async () => {
  const { w, api } = makeWorld();
  const p = api.dispatchDebouncedReply(entry());
  await sleep(8); w.persona.chatMode = 'paused';
  await p;
  assert.strictEqual(texts(w).length, 0);
});

t('person removed from "only selected" list while typing -> NOT sent', async () => {
  const { w, api } = makeWorld();
  w.persona.chatMode = 'only_selected'; w.persona.includedContactIds = ['fan1'];
  const p = api.dispatchDebouncedReply(entry());
  await sleep(8); w.persona.includedContactIds = [];
  await p;
  assert.strictEqual(texts(w).length, 0);
});

t('newer messages during typing -> one reply total, not two', async () => {
  const { w, api } = makeWorld();
  const p1 = api.dispatchDebouncedReply(entry());
  await sleep(8);
  w.aiText = 'y'.repeat(200);
  const p2 = api.dispatchDebouncedReply(entry({ messages: [{ text: 'hello??', mid: 'in2' }], lastMid: 'in2' }));
  await Promise.all([p1, p2]);
  assert.strictEqual(texts(w).length, 1);
  assert.strictEqual(texts(w)[0].text, 'y'.repeat(200), 'the newer reply is the one sent');
});

t("echo of the AI's own text (no app_id) is NOT treated as the creator taking over", async () => {
  const { w, api } = makeWorld();
  w.aiText = 'short one [ATTACHMENT: joy]';
  await api.dispatchDebouncedReply(entry());
  const before = w.memoryUpdates;
  await api.handleCreatorEchoAsync(echo('short one'), 'creatorIG');
  assert.strictEqual(w.memoryUpdates, before, 'no manual-reply counting for our own echo');
  assert.strictEqual(w.records.at(-1).sentByAI, true);
});

t("echo of the AI's own text arriving BEFORE the sticker does not cancel the sticker", async () => {
  const { w, api, deps } = makeWorld();
  w.allowMedia = true;
  w.aiText = 'lol same [ATTACHMENT: joy]';
  const realSend = deps.instagramService.sendTextMessage;
  deps.instagramService.sendTextMessage = async (to, text) => {
    const r = await realSend(to, text);
    await api.handleCreatorEchoAsync(echo(text), 'creatorIG'); // Meta echoes immediately
    return r;
  };
  await api.dispatchDebouncedReply(entry());
  assert.strictEqual(texts(w).length, 1);
  assert.strictEqual(w.sent.filter(x => x.type === 'image').length, 1, 'sticker still sent after own text echo');
  assert.strictEqual(w.memoryUpdates, 0, 'own echo not counted as a manual reply');
});

t('settings re-check failing (database down) still sends (no silent drop)', async () => {
  const { w, api } = makeWorld();
  const p = api.dispatchDebouncedReply(entry());
  await sleep(5); w.dbFails = true;
  await p;
  assert.strictEqual(texts(w).length, 1);
});

t('cancelAiReply clears a waiting (debounced) reply', async () => {
  const { api, deps } = makeWorld();
  let fired = false;
  deps.userDebounceQueues.set('owner1:fan1', { timer: setTimeout(() => { fired = true; }, 20) });
  assert.strictEqual(api.cancelAiReply('owner1', 'fan1', 'test'), true);
  await sleep(30);
  assert.strictEqual(fired, false); assert.strictEqual(deps.userDebounceQueues.size, 0);
});

t('a manual reply to ANOTHER contact does not cancel this one', async () => {
  const { w, api } = makeWorld();
  const p = api.dispatchDebouncedReply(entry());
  await sleep(8);
  await api.handleCreatorEchoAsync({ ...echo('hi other'), recipient: { id: 'fan2' } }, 'creatorIG');
  await p;
  assert.strictEqual(texts(w).length, 1);
});

t('rules table matches the old checks (incl. missing fields = defaults on)', async () => {
  const { api } = makeWorld();
  const R = api.aiReplyBlockedReason;
  assert.strictEqual(R({}, {}, 's', false), null, 'missing fields = allowed');
  assert.match(R({ globalBotActive: false }, {}, 's', false), /paused/);
  assert.match(R({ chatMode: 'paused' }, {}, 's', false), /paused/);
  assert.match(R({ chatMode: 'everyone_except', excludedContactIds: ['s'] }, {}, 's', false), /excluded/);
  assert.strictEqual(R({ chatMode: 'everyone_except', excludedContactIds: ['x'] }, {}, 's', false), null);
  assert.match(R({ chatMode: 'only_selected', includedContactIds: [] }, {}, 's', false), /whitelist/);
  assert.strictEqual(R({ chatMode: 'only_selected', includedContactIds: ['s'] }, {}, 's', false), null);
  assert.match(R({}, { aiEnabled: false }, 's', false), /AI paused/);
  assert.match(R({}, { replyToReelsAndPosts: false }, 's', true), /Reel/);
  assert.strictEqual(R({}, { replyToReelsAndPosts: false }, 's', false), null);
  assert.match(R({}, { replyToMessages: false }, 's', false), /Message reply/);
  assert.strictEqual(R({}, { replyToMessages: false }, 's', true), null);
});

t('recent-send matching: by mid, by text, media once, and expires after 60s', async () => {
  const { api } = makeWorld();
  const n = api.noteAiSend('k', { text: 'abc' }); n.mid = 'm1';
  assert.strictEqual(api.takeRecentAiSend('k', { mid: 'm1' }), true);
  assert.strictEqual(api.takeRecentAiSend('k', { mid: 'm1' }), false, 'consumed');
  api.noteAiSend('k', { media: true });
  assert.strictEqual(api.takeRecentAiSend('k', { hasMedia: true, text: '' }), true);
  assert.strictEqual(api.takeRecentAiSend('k', { hasMedia: true, text: '' }), false, 'one media echo per send');
  const old = api.noteAiSend('k', { text: 'old' }); old.at -= 61000;
  assert.strictEqual(api.takeRecentAiSend('k', { text: 'old' }), false, 'expired');
  assert.strictEqual(api.takeRecentAiSend('k', { text: 'manual text' }), false);
});

(async () => {
  let pass = 0;
  for (const [name, fn] of tests) {
    try { await fn(); pass++; console.log('  ok -', name); }
    catch (e) { console.log('  FAIL -', name, '\n     ', e.message); }
  }
  console.log(`reply pipeline: ${pass}/${tests.length} passed`);
  process.exit(pass === tests.length ? 0 : 1);
})();
