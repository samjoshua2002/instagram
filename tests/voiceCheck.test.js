const test = require('node:test');
const assert = require('node:assert');
const { ruleIssues, gate, PASS_SCORE } = require('../services/voiceCheck');

// Owner who texts short, lowercase, no full stops
const fp = { count: 200, avgWords: 4, medianWords: 3, periodEndShare: 2, capStartShare: 5 };
const fakeAi = score => ({ jsonWithFallback: async () => ({ score, issues: ['too formal'] }) });

test('voice rules: bot phrases and paragraphs are caught, normal texting passes', () => {
  assert.deepEqual(ruleIssues('hola shorty\nhow was the exam', fp), []);
  assert.deepEqual(ruleIssues('heyy da enna panra', fp), []);
  assert.match(ruleIssues('Hey! Just checking in on you', fp).join(), /just checking in/);
  assert.match(ruleIssues('hope you\'re doing well', fp).join(), /doing well/);
  assert.match(ruleIssues('feel free to text me anytime', fp).join(), /feel free/);
  const para = 'that sounds like such a good plan honestly i think you should totally go for it and tell me everything after';
  assert.match(ruleIssues(para, fp).join(), /far too long/);
  assert.match(ruleIssues('Sure thing.\nSee you then.', fp).join(), /full stops/);
  // No fingerprint yet: only the phrase rules apply
  assert.deepEqual(ruleIssues(para, null), []);
});

test('voice gate: a good draft goes out unchanged', async () => {
  let rewrites = 0;
  const out = await gate({ draft: 'hola shorty', style: 'you: hola', fp, ai: fakeAi(90), rewrite: async () => { rewrites++; return 'x'; } });
  assert.equal(out.text, 'hola shorty');
  assert.equal(out.rewritten, false);
  assert.equal(out.score, 90);
  assert.equal(rewrites, 0);
});

test('voice gate: a low score or a bot phrase is rewritten once, with the problems listed', async () => {
  let note = '';
  const low = await gate({ draft: 'Hello there, how are you today', style: 'you: oii', fp, ai: fakeAi(PASS_SCORE - 20), rewrite: async n => { note = n; return 'oii how r u'; } });
  assert.equal(low.text, 'oii how r u');
  assert.equal(low.rewritten, true);
  assert.match(note, /too formal/);

  const bot = await gate({ draft: 'just checking in on you', style: '', fp, ai: fakeAi(99), rewrite: async () => 'hii wat u doing' });
  assert.equal(bot.text, 'hii wat u doing');
  assert.equal(bot.rewritten, true);
});

test('voice gate: a failing judge never blocks the reply; a worse rewrite is not used', async () => {
  const broken = { jsonWithFallback: async () => { throw new Error('azure down'); } };
  const out = await gate({ draft: 'hola', style: 'you: hola', fp, ai: broken, rewrite: async () => 'x' });
  assert.equal(out.text, 'hola');
  assert.equal(out.rewritten, false);

  const worse = await gate({ draft: 'just checking in', style: '', fp, ai: fakeAi(99), rewrite: async () => 'just checking in, hope you\'re doing well' });
  assert.equal(worse.text, 'just checking in');
  assert.equal(worse.rewritten, false);
});

test('voice gate: can be switched off with VOICE_CHECK=off', async () => {
  process.env.VOICE_CHECK = 'off';
  try {
    const out = await gate({ draft: 'just checking in', fp, ai: fakeAi(0), rewrite: async () => 'x' });
    assert.equal(out.text, 'just checking in');
  } finally {
    delete process.env.VOICE_CHECK;
  }
});
