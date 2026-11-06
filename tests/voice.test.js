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

// ── Content filter retry and Tanglish (no network: Azure is faked) ──────────
process.env.AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || 'test-key';
process.env.AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || 'https://example.openai.azure.com';
const { maskForFilter, isContentFilterError } = require('../services/promptSafety');
const { tanglishHabit, isTanglish } = require('../services/voiceService');

// Loading the AI service opens Redis; close it so the test process can exit
test.after(() => {
  const redis = require('../services/redisService');
  try { redis.client?.disconnect(); } catch (_) {}
});

const filterErr = () => Object.assign(new Error('400 The response was filtered due to the prompt triggering Azure OpenAI\'s content management policy.'), { status: 400, code: 'content_filter' });

test('maskForFilter: slurs at level 1, swearing and violence only at level 2', () => {
  assert.equal(maskForFilter('Im veg nigga'), 'Im veg n***a');
  assert.equal(maskForFilter('Got u niggas'), 'Got u n****s');
  assert.equal(maskForFilter('NIGGA ?'), 'N***A ?');
  assert.equal(maskForFilter('he trying to kill u, fuck'), 'he trying to kill u, fuck');
  assert.equal(maskForFilter('he trying to kill u, fuck', 2), 'he trying to k**l u, f**k');
  assert.equal(maskForFilter('night nigeria bigger'), 'night nigeria bigger'); // no false hits
  assert.equal(maskForFilter(undefined), '');
});

test('isContentFilterError spots Azure prompt blocks only', () => {
  assert.equal(isContentFilterError(filterErr()), true);
  assert.equal(isContentFilterError({ message: 'x', error: { code: 'content_filter' } }), true);
  assert.equal(isContentFilterError(new Error('429 rate limit')), false);
  assert.equal(isContentFilterError(null), false);
});

test('isTanglish: Tamil words in English letters, not plain English', () => {
  for (const t of ['Canva la integration pannalam', 'Enna pulla', 'Yoo thambi thappu', 'Seri normal ha pesalam']) assert.equal(isTanglish(t), true, t);
  for (const t of ['That is so bad', 'I am fine', 'Sybau 😂✌️', 'Send to higgfield', 'Iris and Diana']) assert.equal(isTanglish(t), false, t);
});

test('tanglishHabit: conditional rate when they write Tanglish, owner lines kept', () => {
  const chat = [
    them('enna da'), me('Enna pulla'),
    them('seri da'), me('Ok'),
    them('romba busy ah'), me('Konjam busy'),
    them('enna panra'), me('Nothing'),
    them('hi'), me('Yo'),
  ];
  const h = tanglishHabit(chat, extractExchanges(chat, Infinity));
  assert.equal(h.samples, 4);
  assert.equal(h.rate, 0.5);
  assert.deepEqual(h.lines, ['Enna pulla', 'Konjam busy']);
  // Owner who never answers in Tanglish -> 0, so English stays
  const never = [them('enna da'), me('What'), them('seri da'), me('Ok'), them('romba'), me('Hmm')];
  assert.equal(tanglishHabit(never, extractExchanges(never)).rate, 0);
});

test('humanChatRules: Tanglish replaces the English-only line, business default untouched', () => {
  const t = humanChatRules({ allowTanglish: true });
  assert.doesNotMatch(t, /ENGLISH ONLY/);
  assert.match(t, /Tanglish/);
  assert.match(humanChatRules(), /ENGLISH ONLY/);
});

test('completeWithFilterRetry: masks slurs, then swearing + short history, then gives up', async () => {
  const ai = require('../services/azureOpenAI');
  const orig = ai.completeWithFallback;
  const seen = [];
  const msgs = [
    { role: 'system', content: 'You are Sam' },
    ...Array.from({ length: 6 }, (_, i) => ({ role: 'user', content: `old ${i} fuck` })),
    { role: 'user', content: 'Im veg nigga' },
  ];
  try {
    // Blocks while any slur is left: passes on step 2
    ai.completeWithFallback = async (_m, m) => { seen.push(m); if (m.some(x => /nigga/i.test(x.content))) throw filterErr(); return 'Omg'; };
    assert.equal(await ai.completeWithFilterRetry('gpt-4o', msgs, {}), 'Omg');
    assert.equal(seen.length, 2);
    assert.equal(seen[1].at(-1).content, 'Im veg n***a');
    assert.equal(seen[1].length, msgs.length); // step 2 keeps the whole chat

    // Blocks while any swear word is left: passes on step 3 with only the last 4 messages
    seen.length = 0;
    ai.completeWithFallback = async (_m, m) => { seen.push(m); if (m.some(x => /fuck|nigga/i.test(x.content))) throw filterErr(); return 'ok'; };
    assert.equal(await ai.completeWithFilterRetry('gpt-4o', msgs, {}), 'ok');
    assert.equal(seen.length, 3);
    assert.equal(seen[2].length, 5);
    assert.equal(seen[2][0].content, 'You are Sam');

    // Always blocked: throws the filter error after 3 tries
    seen.length = 0;
    ai.completeWithFallback = async (_m, m) => { seen.push(m); throw filterErr(); };
    await assert.rejects(ai.completeWithFilterRetry('gpt-4o', msgs, {}), e => isContentFilterError(e));
    assert.equal(seen.length, 3);

    // Other errors are not retried
    seen.length = 0;
    ai.completeWithFallback = async () => { seen.push(1); throw new Error('timeout'); };
    await assert.rejects(ai.completeWithFilterRetry('gpt-4o', msgs, {}), /timeout/);
    assert.equal(seen.length, 1);
  } finally {
    ai.completeWithFallback = orig;
  }
});

test('completeWithFallback: a blocked prompt is not re-sent to gpt-4o', async () => {
  const ai = require('../services/azureOpenAI');
  const origGet = ai.getClient;
  const calls = [];
  ai.getClient = model => ({ chat: { completions: { create: async () => { calls.push(model); throw filterErr(); } } } });
  try {
    await assert.rejects(ai.completeWithFallback('gpt-5.1-chat', [{ role: 'user', content: 'x' }], { maxTokens: 10 }), e => isContentFilterError(e));
    assert.deepEqual(calls, ['gpt-5.1-chat']);
  } finally {
    ai.getClient = origGet;
  }
});
