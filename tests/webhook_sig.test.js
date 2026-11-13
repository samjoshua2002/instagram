// Pulls verifyMetaSignature out of the real server.js and tests it with fake requests
const fs = require('fs'), crypto = require('crypto'), assert = require('assert');
const src = fs.readFileSync((process.argv[2] || require('path').join(__dirname, '..', 'server.js')), 'utf8');
const m = src.match(/function verifyMetaSignature\(req\) \{[\s\S]*?\n\}\n/);
assert(m, 'function not found');
const load = () => new Function('crypto', 'process', m[0] + '; return verifyMetaSignature;');
const body = Buffer.from('{"entry":[]}');
const req = (sig) => ({ rawBody: body, get: (h) => (h === 'x-hub-signature-256' ? sig : undefined) });
const sign = (secret) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
const quiet = console.warn; console.warn = () => {};
let n = 0; const t = (name, env, r, expected) => {
  const fn = load()(crypto, { env });
  assert.strictEqual(fn(r), expected, name); n++; quiet('  ok -', name);
};
t('dev, no secret, unsigned -> accepted', {}, req(''), true);
t('production, no secret, unsigned -> refused', { NODE_ENV: 'production' }, req(''), false);
t('Render, no secret, unsigned -> refused', { RENDER: 'true' }, req(''), false);
t('Render, no secret, override -> accepted', { RENDER: 'true', ALLOW_UNSIGNED_WEBHOOKS: 'true' }, req(''), true);
t('secret set, correct signature -> accepted', { META_APP_SECRET: 's1' }, req(sign('s1')), true);
t('secret set, wrong secret -> refused', { META_APP_SECRET: 's1' }, req(sign('evil')), false);
t('secret set, missing header -> refused', { META_APP_SECRET: 's1' }, req(''), false);
t('secret set, garbage header -> refused', { META_APP_SECRET: 's1' }, req('sha256=zz'), false);
t('second secret (Instagram app) works', { META_APP_SECRET: 'a', INSTAGRAM_APP_SECRET: 'b' }, req(sign('b')), true);
t('override does not bypass a set secret', { META_APP_SECRET: 's1', ALLOW_UNSIGNED_WEBHOOKS: 'true' }, req(''), false);
console.warn = quiet; console.log(`webhook signature: ${n} passed`);
