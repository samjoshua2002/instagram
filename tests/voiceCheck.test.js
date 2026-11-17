const test = require('node:test');
const assert = require('node:assert');
const { ruleIssues, gate, PASS_SCORE, languageOf, modeFor, bucketOf, agreementStats } = require('../services/voiceCheck');

// Owner who texts short, lowercase, no full stops
const fp = { count: 200, avgWords: 4, medianWords: 3, periodEndShare: 2, capStartShare: 5 };
const fakeAi = score => ({ jsonWithFallback: async () => ({ score, issues: ['too formal'] }) });
const withEnv = async (vars, fn) => {
  const before = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try { return await fn(); } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
};

test('voice rules: bot phrases and paragraphs are caught, normal texting passes', () => {
  assert.deepEqual(ruleIssues('hola shorty\nhow was the exam', fp), []);
  assert.deepEqual(ruleIssues('heyy da enna panra', fp), []);
  assert.match(ruleIssues('Hey! Just checking in on you', fp).join(), /just checking in/);
  assert.match(ruleIssues('hope you\'re doing well', fp).join(), /doing well/);
  assert.match(ruleIssues('feel free to text me anytime', fp).join(), /feel free/);
  const para = 'that sounds like such a good plan honestly i think you should totally go for it and tell me everything after';
  assert.match(ruleIssues(para, fp).join(), /far too long/);
  assert.match(ruleIssues('Sure thing.\nSee you then.', fp).join(), /full stops/);
  assert.deepEqual(ruleIssues(para, null), []);
});

test('shadow (default): a low judge score is only logged, the draft goes out', async () => {
  let rewrites = 0;
  const out = await gate({ draft: 'Hello there, how are you today', style: 'you: oii', fp, ai: fakeAi(PASS_SCORE - 20), rewrite: async () => { rewrites++; return 'oii'; } });
  assert.equal(out.mode, 'shadow');
  assert.equal(out.status, 'would_rewrite');
  assert.equal(out.text, 'Hello there, how are you today');
  assert.equal(rewrites, 0);
});

test('shadow: bot phrases are still fixed (rules are safe to enforce)', async () => {
  const bot = await gate({ draft: 'just checking in on you', style: '', fp, ai: fakeAi(99), rewrite: async () => 'hii wat u doing' });
  assert.equal(bot.text, 'hii wat u doing');
  assert.equal(bot.status, 'rewritten');
});

test('enforce: a low judge score is rewritten once with the problems listed', async () => {
  await withEnv({ VOICE_CHECK: 'enforce' }, async () => {
    let note = '';
    const low = await gate({ draft: 'Hello there, how are you today', style: 'you: oii', fp, ai: fakeAi(PASS_SCORE - 20), rewrite: async n => { note = n; return 'oii how r u'; } });
    assert.equal(low.text, 'oii how r u');
    assert.equal(low.status, 'rewritten');
    assert.match(note, /too formal/);
    const good = await gate({ draft: 'hola shorty', style: 'you: hola', fp, ai: fakeAi(90), rewrite: async () => 'x' });
    assert.equal(good.status, 'pass');
    assert.equal(good.text, 'hola shorty');
  });
});

test('a failing or slow judge never blocks the reply; a worse rewrite is not used', async () => {
  const broken = { jsonWithFallback: async () => { throw new Error('azure down'); } };
  const out = await gate({ draft: 'hola', style: 'you: hola', fp, ai: broken, rewrite: async () => 'x' });
  assert.equal(out.text, 'hola');
  assert.equal(out.status, 'error');
  const worse = await gate({ draft: 'just checking in', style: '', fp, ai: fakeAi(99), rewrite: async () => 'just checking in, hope you\'re doing well' });
  assert.equal(worse.text, 'just checking in');
  assert.equal(worse.rewritten, false);
});

test('off: nothing runs', async () => {
  await withEnv({ VOICE_CHECK: 'off' }, async () => {
    const out = await gate({ draft: 'just checking in', fp, ai: fakeAi(0), rewrite: async () => 'x' });
    assert.equal(out.text, 'just checking in');
    assert.equal(out.status, 'off');
  });
});

test('rollout: a share of accounts is enforced, always the same accounts', async () => {
  await withEnv({ VOICE_CHECK: 'shadow', VOICE_CHECK_ENFORCE_PERCENT: '30' }, () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `owner${i}`);
    const enforced = ids.filter(id => modeFor(id) === 'enforce').length;
    assert.ok(enforced > 220 && enforced < 380, `about 30% enforced, got ${enforced}`);
    assert.equal(modeFor('owner7'), modeFor('owner7'));
    assert.equal(bucketOf('owner7'), bucketOf('owner7'));
  });
  await withEnv({ VOICE_CHECK_ENFORCE_PERCENT: '0' }, () => assert.equal(modeFor('anyone'), 'shadow'));
});

test('language tag: script first, then the Tanglish word list', () => {
  assert.equal(languageOf('எப்படி இருக்க'), 'tamil');
  assert.equal(languageOf('क्या कर रहे हो'), 'hindi');
  assert.equal(languageOf('enna da panra'), 'tanglish');
  assert.equal(languageOf('where are you now'), 'latin');
  assert.equal(languageOf('😂😂'), 'none');
  assert.equal(languageOf('ok'), 'short');
});

test('agreement: judge vs your labels, kappa and the best threshold', () => {
  // Judge perfectly separates: sends score 80, no-sends score 40
  const rows = [...Array(12).fill({ score: 80, label: 'send' }), ...Array(12).fill({ score: 40, label: 'nosend' })];
  const s = agreementStats(rows, 65);
  assert.equal(s.tpr, 1);
  assert.equal(s.tnr, 1);
  assert.equal(s.kappa, 1);
  assert.equal(s.enough, true);
  assert.ok(s.best.threshold > 40 && s.best.threshold <= 80);
  // Judge is noise: same scores for both labels -> kappa 0
  const noise = agreementStats([...Array(12).fill({ score: 70, label: 'send' }), ...Array(12).fill({ score: 70, label: 'nosend' })], 65);
  assert.equal(noise.kappa, 0);
  // Too few labels: no threshold advice
  assert.equal(agreementStats([{ score: 80, label: 'send' }]).best, null);
});
