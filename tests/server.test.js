// Run: node --test tests/server.test.js  (no database or network needed)
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const path = require('path');
const os = require('os');

const {
  checkMetaSignature, resolveInsideDir, isHttpUrl, randomFilename, serializePersona,
  parseDateParam, validatePersonaUpdate, ownerFilter, contactKey, safeEqual, cleanPhotoIds, cleanInterviewHistory,
} = require('../lib/serverSecurity');

test('AI interview history: junk and empty AI turns skipped, capped, non-list refused', () => {
  assert.deepStrictEqual(cleanInterviewHistory(undefined), []);
  assert.strictEqual(cleanInterviewHistory('hi'), null);
  assert.strictEqual(cleanInterviewHistory({ role: 'user' }), null);
  const kept = cleanInterviewHistory([null, 5, { role: 'assistant' }, { role: 'assistant', content: '  ' }, { role: 'user', content: { $gt: '' } }, { role: 'user', content: 'Mia is my sister' }]);
  assert.deepStrictEqual(kept, [{ role: 'user', content: 'Mia is my sister' }]);
  const long = Array.from({ length: 150 }, (_, i) => ({ role: 'user', content: 'm' + i }));
  assert.deepStrictEqual(cleanInterviewHistory(long).map(m => m.content), long.slice(-100).map(m => m.content));
});

const sign = (body, secret) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

test('webhook signature: valid signature passes', () => {
  const body = Buffer.from('{"entry":[]}');
  const r = checkMetaSignature({ rawBody: body, signature: sign(body, 's3cret'), secrets: ['s3cret'], env: { NODE_ENV: 'production' } });
  assert.deepStrictEqual(r.ok, true);
});

test('webhook signature: second configured secret also accepted', () => {
  const body = Buffer.from('x');
  const r = checkMetaSignature({ rawBody: body, signature: sign(body, 'b'), secrets: ['a', 'b'], env: { NODE_ENV: 'production' } });
  assert.strictEqual(r.ok, true);
});

test('webhook signature: wrong or missing signature is 401', () => {
  const body = Buffer.from('x');
  const bad = checkMetaSignature({ rawBody: body, signature: sign(body, 'other'), secrets: ['s3cret'], env: {} });
  assert.deepStrictEqual([bad.ok, bad.status], [false, 401]);
  const missing = checkMetaSignature({ rawBody: body, signature: '', secrets: ['s3cret'], env: {} });
  assert.deepStrictEqual([missing.ok, missing.status], [false, 401]);
});

test('webhook signature: production without a secret is rejected (503)', () => {
  const r = checkMetaSignature({ rawBody: Buffer.from('x'), signature: '', secrets: [], env: { NODE_ENV: 'production' } });
  assert.deepStrictEqual([r.ok, r.status], [false, 503]);
  const blank = checkMetaSignature({ rawBody: Buffer.from('x'), signature: '', secrets: ['  ', ''], env: { NODE_ENV: 'production' } });
  assert.strictEqual(blank.ok, false);
});

test('webhook signature: bypass flag is ignored in production', () => {
  const env = { NODE_ENV: 'production', BYPASS_WEBHOOK_VERIFY: 'true' };
  assert.strictEqual(checkMetaSignature({ rawBody: Buffer.from('x'), signature: '', secrets: ['s'], env }).ok, false);
  assert.strictEqual(checkMetaSignature({ rawBody: Buffer.from('x'), signature: '', secrets: [], env }).status, 503);
});

test('webhook signature: bypass and missing secret allowed only outside production', () => {
  assert.strictEqual(checkMetaSignature({ rawBody: Buffer.from('x'), signature: '', secrets: ['s'], env: { NODE_ENV: 'development', BYPASS_WEBHOOK_VERIFY: 'true' } }).ok, true);
  assert.strictEqual(checkMetaSignature({ rawBody: Buffer.from('x'), signature: '', secrets: [], env: {} }).ok, true);
});

test('safeEqual compares exactly', () => {
  assert.strictEqual(safeEqual('abc', 'abc'), true);
  assert.strictEqual(safeEqual('abc', 'abd'), false);
  assert.strictEqual(safeEqual('abc', 'abcd'), false);
});

test('upload path: plain names resolve inside the folder', () => {
  const dir = path.join(os.tmpdir(), 'uploads-test');
  assert.strictEqual(resolveInsideDir(dir, 'media-abc.gif'), path.join(path.resolve(dir), 'media-abc.gif'));
});

test('upload path: traversal and odd names are refused', () => {
  const dir = path.join(os.tmpdir(), 'uploads-test');
  for (const bad of ['../secret.txt', '..', '.', '', 'a/b.gif', 'a\\b.gif', '/etc/passwd', 'C:\\x.gif', 'x\0.gif', null, undefined]) {
    assert.strictEqual(resolveInsideDir(dir, bad), null, `should refuse ${JSON.stringify(bad)}`);
  }
});

test('isHttpUrl accepts http(s) only', () => {
  assert.strictEqual(isHttpUrl('https://media.giphy.com/a.gif'), true);
  assert.strictEqual(isHttpUrl('http://example.com/x.png'), true);
  for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAA', 'file:///etc/passwd', 'ftp://x/y', '/uploads/a.gif', '', 'not a url']) {
    assert.strictEqual(isHttpUrl(bad), false, bad);
  }
});

test('randomFilename uses 32 hex chars of randomness', () => {
  const a = randomFilename('doc-', '.PDF');
  assert.match(a, /^doc-[a-f0-9]{32}\.pdf$/);
  assert.notStrictEqual(a, randomFilename('doc-', '.pdf'));
});

test('persona serialization hides the Instagram token and GIPHY key', () => {
  const view = serializePersona({ creatorName: 'A', instagramPageAccessToken: 'IGQ-secret', giphyApiKey: 'gk' });
  assert.strictEqual(view.instagramPageAccessToken, undefined);
  assert.strictEqual(view.giphyApiKey, undefined);
  assert.strictEqual(view.hasInstagramToken, true);
  assert.strictEqual(view.hasGiphyKey, true);
  assert.strictEqual(view.creatorName, 'A');
  assert.ok(!JSON.stringify(view).includes('secret'));
});

test('persona serialization: booleans false when empty, user token counts', () => {
  const empty = serializePersona({ instagramPageAccessToken: '', giphyApiKey: '' });
  assert.deepStrictEqual([empty.hasInstagramToken, empty.hasGiphyKey], [false, false]);
  assert.strictEqual(serializePersona({}, { hasUserToken: true }).hasInstagramToken, true);
  // Mongoose documents are converted with toObject()
  const doc = { toObject: () => ({ instagramPageAccessToken: 't', x: 1 }) };
  assert.deepStrictEqual(serializePersona(doc), { x: 1, hasInstagramToken: true, hasGiphyKey: false });
});

test('date params: missing uses fallback, invalid is rejected', () => {
  const fb = new Date(0);
  assert.deepStrictEqual(parseDateParam(undefined, fb), { ok: true, date: fb });
  assert.deepStrictEqual(parseDateParam('', fb), { ok: true, date: fb });
  assert.strictEqual(parseDateParam('2026-11-05', fb).date.toISOString(), '2026-11-05T00:00:00.000Z');
  assert.deepStrictEqual(parseDateParam('not-a-date', fb), { ok: false });
  assert.deepStrictEqual(parseDateParam(['a', 'b'], fb), { ok: false });
});

test('persona update validation', () => {
  const opts = { chatModes: ['everyone', 'paused'] };
  assert.strictEqual(validatePersonaUpdate({ chatMode: 'paused', globalBotActive: true }, opts), null);
  assert.match(validatePersonaUpdate({ chatMode: 'evil' }, opts), /chatMode/);
  assert.match(validatePersonaUpdate({ globalBotActive: 'yes' }, opts), /globalBotActive/);
  assert.match(validatePersonaUpdate({ typingDelaySeconds: 'abc' }, opts), /typingDelaySeconds/);
  assert.match(validatePersonaUpdate({ excludedContactIds: [1, 2] }, opts), /excludedContactIds/);
  assert.match(validatePersonaUpdate({ instagramAccountId: { $ne: '' } }, opts), /instagramAccountId/);
  assert.strictEqual(validatePersonaUpdate({}, opts), null);
});

test('owner filter: tenant sees only its own rows, superadmin also legacy ownerless ones', () => {
  assert.deepStrictEqual(ownerFilter({ _id: 'u1', role: 'user' }), { ownerId: 'u1' });
  assert.deepStrictEqual(ownerFilter({ _id: 'a1', role: 'superadmin' }), { ownerId: { $in: ['a1', null] } });
  assert.deepStrictEqual(ownerFilter(null), { _id: null });
});

test('contact keys keep two workspaces apart', () => {
  assert.notStrictEqual(contactKey('o1', 's1'), contactKey('o2', 's1'));
  assert.strictEqual(contactKey(null, 's1'), 'legacy:s1');
});

test('UserMemory: senderId is not globally unique, { ownerId, senderId } is', () => {
  const UserMemory = require('../models/UserMemory');
  assert.notStrictEqual(UserMemory.schema.path('senderId').options.unique, true);
  const compound = UserMemory.schema.indexes().find(([keys]) => keys.ownerId === 1 && keys.senderId === 1);
  assert.ok(compound, 'compound index exists');
  assert.strictEqual(compound[1].unique, true);
  assert.strictEqual(compound[1].partialFilterExpression, undefined);
});

test('MediaVault records the stored upload filename', () => {
  const MediaVault = require('../models/MediaVault');
  assert.ok(MediaVault.schema.path('storedFilename'));
});

test('cleanPhotoIds keeps real ids only, once each, at most 25', () => {
  assert.deepStrictEqual(cleanPhotoIds(['17841400000000001', '17841400000000001', 12345, '', '../x', { $gt: '' }, 'a b']), ['17841400000000001', '12345']);
  assert.deepStrictEqual(cleanPhotoIds('17841400000000001'), []);
  assert.deepStrictEqual(cleanPhotoIds(undefined), []);
  assert.strictEqual(cleanPhotoIds(Array.from({ length: 40 }, (_, i) => `id${1000 + i}`)).length, 25);
});
