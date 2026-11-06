// Unsplash banner cache: memory -> database -> Unsplash, with fallbacks. No real network or database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createUnsplashCache, REFRESH_MS } = require('../services/unsplashService');

const HOUR = 60 * 60 * 1000;
const START = 100 * REFRESH_MS; // fake clock: 'at: 0' is then very old
const apiPhoto = id => ({
  id, urls: { raw: `https://images.unsplash.com/photo-${id}` }, color: '#123456',
  user: { name: 'Ann', links: { html: 'https://unsplash.com/@ann' } }, links: { html: `https://unsplash.com/photos/${id}` },
});
const saved = id => ({ id, raw: `https://images.unsplash.com/photo-${id}`, author: 'Ann' });

function setup({ db = {}, responses = [], key = 'k', dbBroken = false } = {}) {
  let t = START;
  const calls = [];
  const writes = [];
  const store = {
    async get(topic) { if (dbBroken) throw new Error('db down'); return db[topic] || null; },
    async set(topic, photos, at) { if (dbBroken) throw new Error('db down'); writes.push(topic); db[topic] = { photos, at }; },
  };
  const fetchImpl = async url => {
    calls.push(url);
    const r = responses.shift() || { status: 200, results: [apiPhoto('x')] };
    if (r.throw) throw new Error('offline');
    return {
      status: r.status, ok: r.status >= 200 && r.status < 300,
      headers: { get: h => (h === 'x-ratelimit-remaining' && r.remaining !== undefined ? String(r.remaining) : null) },
      json: async () => ({ results: r.results || [] }),
    };
  };
  const cache = createUnsplashCache({ store, fetchImpl, now: () => t, getKey: () => key, log: () => {} });
  return { cache, calls, writes, db, tick: ms => { t += ms; }, now: () => t };
}

test('first load calls Unsplash once and saves the links in the database', async () => {
  const s = setup({ responses: [{ status: 200, results: [apiPhoto('a'), apiPhoto('b')] }] });
  const photos = await s.cache.getPhotos('abstract');
  assert.deepEqual(photos.map(p => p.id), ['a', 'b']);
  assert.equal(s.calls.length, 1);
  assert.deepEqual(s.writes, ['abstract']);
  // Second call is served from memory
  await s.cache.getPhotos('abstract');
  assert.equal(s.calls.length, 1);
});

test('after a restart, a fresh database list is reused without calling Unsplash', async () => {
  const s = setup({ db: { fluid: { photos: [saved('d1')], at: START - 2 * 24 * HOUR } } });
  const photos = await s.cache.getPhotos('fluid');
  assert.deepEqual(photos.map(p => p.id), ['d1']);
  assert.equal(s.calls.length, 0);
});

test('a list older than a week is refreshed from Unsplash and saved', async () => {
  const s = setup({ db: { abstract: { photos: [saved('old')], at: START - REFRESH_MS - 1 } } });
  const photos = await s.cache.getPhotos('abstract');
  assert.deepEqual(photos.map(p => p.id), ['x']);
  assert.equal(s.calls.length, 1);
  assert.equal(s.db.abstract.photos[0].id, 'x');
});

test('rate limited (429): serves the old saved list and stops calling Unsplash for an hour', async () => {
  const s = setup({
    db: { abstract: { photos: [saved('old')], at: 0 } },
    responses: [{ status: 429 }],
  });
  assert.deepEqual((await s.cache.getPhotos('abstract')).map(p => p.id), ['old']);
  assert.equal(s.cache.isBlocked(), true);
  s.tick(30 * 60 * 1000);
  assert.deepEqual((await s.cache.getPhotos('colorful')), []); // blocked: no call, nothing saved
  assert.equal(s.calls.length, 1);
  s.tick(31 * 60 * 1000);
  await s.cache.getPhotos('abstract');
  assert.equal(s.calls.length, 2); // tries again after the hour
});

test('nearly out of quota: keeps the new photos but pauses further calls', async () => {
  const s = setup({ responses: [{ status: 200, results: [apiPhoto('a')], remaining: 2 }] });
  assert.deepEqual((await s.cache.getPhotos('abstract')).map(p => p.id), ['a']);
  assert.equal(s.cache.isBlocked(), true);
  await s.cache.getPhotos('fluid');
  assert.equal(s.calls.length, 1);
});

test('network error: old list is served and retried later, not on every request', async () => {
  const s = setup({ db: { abstract: { photos: [saved('old')], at: 0 } }, responses: [{ throw: true }] });
  assert.deepEqual((await s.cache.getPhotos('abstract')).map(p => p.id), ['old']);
  await s.cache.getPhotos('abstract');
  await s.cache.getPhotos('abstract');
  assert.equal(s.calls.length, 1);
  s.tick(11 * 60 * 1000);
  assert.deepEqual((await s.cache.getPhotos('abstract')).map(p => p.id), ['x']);
  assert.equal(s.calls.length, 2);
});

test('no API key: uses the database list, or [] when there is none', async () => {
  const s = setup({ key: '', db: { abstract: { photos: [saved('old')], at: 0 } } });
  assert.deepEqual((await s.cache.getPhotos('abstract')).map(p => p.id), ['old']);
  assert.deepEqual(await s.cache.getPhotos('fluid'), []);
  assert.equal(s.calls.length, 0);
});

test('database down: still works straight from Unsplash and memory', async () => {
  const s = setup({ dbBroken: true });
  assert.deepEqual((await s.cache.getPhotos('abstract')).map(p => p.id), ['x']);
  await s.cache.getPhotos('abstract');
  assert.equal(s.calls.length, 1);
});

test('many requests at once share one Unsplash call', async () => {
  const s = setup();
  await Promise.all(Array.from({ length: 10 }, () => s.cache.getPhotos('abstract')));
  assert.equal(s.calls.length, 1);
});

test('unknown topic falls back to abstract; bad image hosts are dropped', async () => {
  const bad = { ...apiPhoto('evil'), urls: { raw: 'https://evil.example/x.jpg' } };
  const s = setup({ responses: [{ status: 200, results: [bad, apiPhoto('ok')] }] });
  const photos = await s.cache.getPhotos('nope');
  assert.deepEqual(photos.map(p => p.id), ['ok']);
  assert.match(s.calls[0], /query=smooth\+abstract\+waves/);
});

test('empty Unsplash result keeps the old list instead of wiping it', async () => {
  const s = setup({ db: { abstract: { photos: [saved('old')], at: 0 } }, responses: [{ status: 200, results: [] }] });
  assert.deepEqual((await s.cache.getPhotos('abstract')).map(p => p.id), ['old']);
  assert.equal(s.db.abstract.photos[0].id, 'old');
});

test('colour topics ask Unsplash for that colour only', async () => {
  const s = setup({ responses: [{ status: 200, results: [apiPhoto('y')] }] });
  const photos = await s.cache.getPhotos('tone-yellow');
  assert.deepEqual(photos.map(p => p.id), ['y']);
  const url = new URL(s.calls[0]);
  assert.equal(url.searchParams.get('color'), 'yellow');
  assert.equal(url.searchParams.get('query'), 'smooth abstract waves');
  // Normal topics send no colour filter
  await s.cache.getPhotos('fluid');
  assert.equal(new URL(s.calls[1]).searchParams.get('color'), null);
});

// Frontend colour matching (frontend/app/lib/banners.js): the banner follows the profile photo colour
test('profile colour picks the matching Unsplash colour list and nearest photo', async () => {
  const b = await import('../frontend/app/lib/banners.js');
  // Palettes from the page tint look like "hsl(45 70% 50%)"
  assert.equal(b.toneFor('hsl(45 70% 50%)'), 'yellow'); // Aradhana: gold page
  assert.equal(b.toneFor('hsl(285 60% 50%)'), 'magenta');
  assert.equal(b.toneFor('hsl(270 60% 50%)'), 'purple'); // mikasa: purple page
  assert.equal(b.toneFor('hsl(220 70% 50%)'), 'blue');
  assert.equal(b.toneFor('hsl(141 55% 50%)'), 'green');
  assert.equal(b.toneFor('hsl(220 8% 50%)'), 'black_and_white');
  assert.equal(b.toneFor('#ffffff'), 'white');
  assert.equal(b.toneFor(null), null);

  const photos = [
    { id: 'blue', raw: 'x', color: '#0c2a73' },
    { id: 'gold', raw: 'x', color: '#d9a640' },
    { id: 'pink', raw: 'x', color: '#d0407a' },
    { id: 'grey', raw: 'x', color: '#777777' },
  ];
  for (const seed of ['Aradhana', 'mikasa', 'x', 'y', 'z']) {
    assert.equal(b.pickBannerByColor(photos, 'hsl(42 65% 50%)', seed).id, 'gold');
    assert.equal(b.pickBannerByColor(photos, 'hsl(330 70% 55%)', seed).id, 'pink');
    assert.equal(b.pickBannerByColor(photos, 'hsl(220 8% 50%)', seed).id, 'grey');
  }
  // No colour: the old pick by name still works
  assert.ok(b.pickBannerByColor(photos, null, 'Aradhana'));
  assert.deepEqual(b.parseColor('#ff0000'), { h: 0, s: 1, l: 0.5 });
});

test('plain gradient / blur photos are dropped, wave textures kept', () => {
  const { toPhotos, isPlain } = require('../services/unsplashService');
  const mk = (id, alt) => ({ id, alt_description: alt, urls: { raw: `https://images.unsplash.com/${id}` }, user: {}, links: {} });
  assert.equal(isPlain({ alt_description: 'a blurry purple gradient background' }), true);
  assert.equal(isPlain({ alt_description: 'blue and pink gradient waves' }), false);
  assert.equal(isPlain({ alt_description: 'red and black wavy lines' }), false);
  assert.equal(isPlain({ alt_description: 'sea wave during daytime' }), true);
  const list = [mk('a', 'purple gradient'), ...['b', 'c', 'd', 'e', 'f'].map(i => mk(i, 'two tone wave pattern'))];
  assert.deepEqual(toPhotos(list).map(p => p.id), ['b', 'c', 'd', 'e', 'f']);
  // Too few textured photos: keep them all rather than an almost empty list
  assert.equal(toPhotos([mk('a', 'gradient'), mk('b', 'waves')]).length, 2);
});

test('grey one-colour textures are dropped unless a real colour is named', () => {
  const { isPlain } = require('../services/unsplashService');
  assert.equal(isPlain({ color: '#737373', alt_description: 'Abstract clear wavy textured background' }), true);
  assert.equal(isPlain({ color: '#262626', alt_description: 'a black and white photo of a pattern' }), true);
  assert.equal(isPlain({ color: '#f3f3f3', alt_description: 'Dynamic blue and white abstract wave pattern' }), false);
  assert.equal(isPlain({ color: '#0c2626', alt_description: 'Abstract teal and black wavy background' }), false);
});

test('light theme asks for light photo lists and keeps only bright photos (dark theme: dark ones)', async () => {
  const { TOPICS } = require('../services/unsplashService');
  const b = await import('../frontend/app/lib/banners.js');
  for (const t of ['abstract', 'colorful', 'fluid']) {
    assert.equal(b.themedTopic(t, 'light'), `${t}-light`);
    assert.equal(b.themedTopic(t, 'dark'), t);
    assert.ok(Object.hasOwn(TOPICS, `${t}-light`), `server knows ${t}-light`);
  }
  assert.equal(b.themedTopic('tone-blue', 'light'), 'tone-blue'); // colour lists are sorted, not swapped

  const photos = [
    { id: 'night', color: '#0d1426' },
    { id: 'navy', color: '#1f3a73' },
    { id: 'wine', color: '#592633' },
    { id: 'mid', color: '#8c8c40' },
    { id: 'peach', color: '#f2cbb3' },
    { id: 'mint', color: '#c9f2e0' },
    { id: 'snow', color: '#f5f5f5' },
  ];
  const ids = list => list.map(p => p.id).sort();
  assert.deepEqual(ids(b.forTheme(photos, 'light')), ['mint', 'peach', 'snow']);
  assert.deepEqual(ids(b.forTheme(photos, 'dark')), ['navy', 'night', 'wine']);
  // Too few fit: the brighter / darker half, never an empty list
  const mostlyDark = [{ id: 'a', color: '#101010' }, { id: 'b', color: '#202020' }, { id: 'c', color: '#808080' }, { id: 'd', color: '#303030' }];
  assert.deepEqual(ids(b.forTheme(mostlyDark, 'light')), ['c', 'd']);
  assert.equal(b.forTheme(null, 'light'), null);
  assert.deepEqual(b.forTheme([], 'dark'), []);
  // A pick from the themed list is always one that fits
  for (const seed of ['x', 'y', 'z', 'Aradhana']) assert.ok(['mint', 'peach', 'snow'].includes(b.pickBanner(b.forTheme(photos, 'light'), seed).id));

  // Placeholder waves: dark wash in dark theme, white wash in light theme
  const dark = decodeURIComponent(b.abstractArt('x'));
  const light = decodeURIComponent(b.abstractArt('x', 'light'));
  assert.match(dark, /fill="#000" fill-opacity="0.35"/);
  assert.match(light, /fill="#fff" fill-opacity="0.55"/);
  assert.match(decodeURIComponent(b.toneArt('hsl(220 70% 50%)', 'x', 'light')), /hsl\(220 70% 72%\)/);
  assert.equal(b.currentTheme(), 'dark'); // no document in Node
});

test('theme switch waits for banners: resolves at once with no page, and gives up after the time limit', async () => {
  const b = await import('../frontend/app/lib/banners.js');
  await b.bannersReady(50); // no document (server / tests): resolves straight away

  // A page whose banner image never finishes loading: the switch still goes ahead after maxMs
  const stuck = { complete: false, naturalWidth: 0, classList: { add() {} } };
  global.document = { querySelectorAll: () => [stuck] };
  try {
    const t0 = Date.now();
    await b.bannersReady(120);
    assert.ok(Date.now() - t0 >= 110, 'waited for the photo');
    assert.ok(Date.now() - t0 < 1000, 'but not forever');
    // Loaded image: marked shown straight away (no wait for React's onLoad render)
    const added = [];
    const done = { complete: true, naturalWidth: 10, classList: { add: c => added.push(c) }, parentElement: null };
    global.document = { querySelectorAll: () => [done] };
    await b.bannersReady(500);
    assert.deepEqual(added, ['in']);
  } finally {
    delete global.document;
  }
});
