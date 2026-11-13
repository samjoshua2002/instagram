// Pulls chatText() out of the real azureOpenAI.js and runs it against a fake Azure client
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync((process.argv[2] || require('path').join(__dirname, '..', 'services', 'azureOpenAI.js')), 'utf8');
const m = src.match(/  async chatText\(deployment, messages, [\s\S]*?\n  \}\n/);
assert(m, 'chatText not found');
const chatText = new Function('return (async function ' + m[0].trim().replace(/^async chatText/, 'chatText') + ')')();

function fakeService(behaviour) {
  const calls = [];
  return { calls, defaultDeployment: 'gpt-5-default', getClient: (model) => ({ chat: { completions: { create: async (p) => {
    calls.push({ model, params: p });
    return behaviour(model, p);
  } } } }), chatText };
}
// Azure-like: gpt-5 rejects sampling params / max_tokens
const azureLike = (text) => (model, p) => {
  if (model.startsWith('gpt-5') && ('temperature' in p || 'max_tokens' in p || 'frequency_penalty' in p))
    throw new Error("Unsupported parameter: 'temperature'");
  return { choices: [{ message: { content: text(model) } }] };
};
const warn = console.warn; console.warn = () => {};
(async () => {
  let n = 0; const ok = (name) => { n++; console.log('  ok -', name); };
  const msgs = [{ role: 'user', content: 'hi' }];

  let s = fakeService(azureLike(m => `  reply from ${m} `));
  let r = await s.chatText('gpt-5.1-chat', msgs, { maxTokens: 150, temperature: 0.8, penalty: 0.5 });
  assert.strictEqual(r, 'reply from gpt-5.1-chat'); assert.strictEqual(s.calls.length, 1);
  assert.deepStrictEqual(Object.keys(s.calls[0].params).sort(), ['max_completion_tokens', 'messages']);
  assert.strictEqual(s.calls[0].params.max_completion_tokens, 150);
  ok('reminder on gpt-5.1-chat: accepted first try, only max_completion_tokens sent, text trimmed');

  s = fakeService(azureLike(m => '{"question":"q","isComplete":false}'));
  r = await s.chatText('gpt-5.6-luna', msgs, { temperature: 0.4, json: true });
  assert.deepStrictEqual(JSON.parse(r), { question: 'q', isComplete: false });
  assert.deepStrictEqual(s.calls[0].params.response_format, { type: 'json_object' });
  assert(!('temperature' in s.calls[0].params));
  ok('interview on gpt-5.6-luna: JSON mode kept, temperature dropped');

  s = fakeService(azureLike(m => 'x'));
  await s.chatText('gpt-4o', msgs, { maxTokens: 220, temperature: 0.9, penalty: 0.35 });
  assert.deepStrictEqual(s.calls[0].params, { messages: msgs, max_tokens: 220, temperature: 0.9, frequency_penalty: 0.35, presence_penalty: 0.35 });
  ok('gpt-4o keeps all its settings');

  s = fakeService((model) => { if (model !== 'gpt-4o') throw new Error('DeploymentNotFound'); return { choices: [{ message: { content: 'fallback ok' } }] }; });
  r = await s.chatText('gpt-5.1-chat', msgs, { maxTokens: 150, temperature: 0.8, penalty: 0.5 });
  assert.strictEqual(r, 'fallback ok'); assert.deepStrictEqual(s.calls.map(c => c.model), ['gpt-5.1-chat', 'gpt-4o']);
  assert.strictEqual(s.calls[1].params.temperature, 0.8);
  ok('missing gpt-5 deployment falls back to gpt-4o with full settings');

  s = fakeService((model) => ({ choices: [{ message: { content: model === 'gpt-4o' ? 'filled' : '' } }] }));
  r = await s.chatText('gpt-5.1-chat', msgs, { maxTokens: 150 });
  assert.strictEqual(r, 'filled');
  ok('empty gpt-5 answer (all tokens spent on reasoning) falls back instead of sending blank');

  s = fakeService(() => { throw new Error('Azure down'); });
  await assert.rejects(s.chatText('gpt-5.1-chat', msgs, {}), /Azure down/); assert.strictEqual(s.calls.length, 2);
  ok('both models failing throws (callers already catch and return null / 500)');

  s = fakeService(() => { throw new Error('boom'); });
  await assert.rejects(s.chatText('gpt-4o', msgs, {}), /boom/); assert.strictEqual(s.calls.length, 1);
  ok('gpt-4o failing is not retried on itself');

  s = fakeService(azureLike(m => 'default'));
  r = await s.chatText(undefined, msgs, { maxTokens: 10, temperature: 1 });
  assert.strictEqual(r, 'default'); assert.deepStrictEqual(s.calls.map(c => c.model), ['gpt-5-default']);
  ok('no model chosen by the rules: uses the default deployment without crashing');

  console.warn = warn; console.log(`chatText: ${n} passed`);
})().catch(e => { console.warn = warn; console.error('FAIL:', e.message); process.exit(1); });
