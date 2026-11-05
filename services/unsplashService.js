// Unsplash banner photos with a three-layer cache, because the demo key allows only 50 calls per hour:
//   1. memory (this process)  2. MongoDB (survives restarts)  3. Unsplash API (only when both are stale)
// If Unsplash fails, is rate limited or has no key, the last saved list is served whatever its age;
// with nothing saved anywhere the route returns [] and the frontend shows its gradient artwork.

// Two-colour wave / pattern textures only: plain one-colour gradient photos look empty
// behind a page (asked 2026-11-06), so the queries ask for waves and toPhotos() drops plain ones.
const TOPICS = {
  abstract: 'abstract wave pattern',
  colorful: 'colorful abstract waves',
  fluid: 'fluid wave texture',
};

// One list per Unsplash colour filter ("tone-yellow", ...), so a contact's banner can match
// the main colour of their profile photo. Each costs one call a week, like the topics above.
const TONES = ['black_and_white', 'black', 'white', 'yellow', 'orange', 'red', 'purple', 'magenta', 'green', 'teal', 'blue'];
for (const tone of TONES) TOPICS[`tone-${tone}`] = { query: 'wavy lines', color: tone };

const STORE_VERSION = 'waves2';
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000; // ask Unsplash for a new list at most once a week per topic
const RETRY_MS = 10 * 60 * 1000; // after a network/server error
const LIMIT_MS = 60 * 60 * 1000; // after 429/403 or when the hourly quota is nearly used up
const MIN_REMAINING = 3; // keep a few calls spare for other topics

const isPhotoUrl = u => typeof u === 'string' && /^https:\/\/images\.unsplash\.com\//.test(u);

// A photo described only as a gradient / blur / bokeh is a plain colour wash: skip it
// (unless it also has waves, lines or a pattern in it).
const PLAIN = /\b(gradients?|blur|blurred|blurry|bokeh|plain|solid colou?r)\b/i;
const TEXTURED = /\b(waves?|wavy|patterns?|textures?|lines?|stripes?|swirls?|curves?|ripples?|folds?|silk)\b/i;
// Real-world scenes the colour searches sometimes return (a beach is not a wave texture)
const SCENE = /\b(sand|beach|sea|ocean|shore|water|fur|trees?|forest|mountains?|sky|person|woman|man)\b/i;
// Grey / black-and-white textures (sand, metal fins) are one colour and give the page a dull
// grey accent: drop them unless the text names a real colour.
const HUE = /\b(red|orange|yellow|gold(en)?|green|teal|turquoise|cyan|blue|navy|purple|violet|pink|magenta|multicolou?red|colou?rful|vibrant)\b/i;
const isGrey = hex => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return false;
  const [r, g, b] = m.slice(1).map(x => parseInt(x, 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 24;
};
const isPlain = p => {
  const text = `${p.alt_description || ''} ${p.description || ''}`;
  if (SCENE.test(text) || /black and white|monochrome|grayscale|greyscale/i.test(text)) return true;
  if (isGrey(p.color) && !HUE.test(text)) return true;
  return PLAIN.test(text) && !TEXTURED.test(text);
};

function toPhotos(results) {
  const valid = (Array.isArray(results) ? results : []).filter(p => p && p.id && isPhotoUrl(p.urls?.raw));
  const textured = valid.filter(p => !isPlain(p));
  return (textured.length >= 5 ? textured : valid) // never leave a topic with almost no photos
    .map(p => ({
      id: String(p.id),
      raw: p.urls.raw,
      color: p.color || null,
      alt: p.alt_description || '',
      author: p.user?.name || 'Unsplash',
      authorUrl: p.user?.links?.html || 'https://unsplash.com',
      link: p.links?.html || 'https://unsplash.com',
    }));
}

/** Default store: MongoDB, skipped quietly when the database is not connected. */
function mongoStore() {
  const mongoose = require('mongoose');
  const Model = require('../models/BannerPhotoCache');
  const up = () => mongoose.connection.readyState === 1;
  // Bump when the queries change, so lists saved with the old queries are not reused
  const key = topic => `${STORE_VERSION}:${topic}`;
  return {
    async get(topic) {
      if (!up()) return null;
      const doc = await Model.findOne({ topic: key(topic) }).lean().maxTimeMS(3000);
      return doc ? { photos: doc.photos || [], at: new Date(doc.fetchedAt).getTime() } : null;
    },
    async set(topic, photos, at) {
      if (!up()) return;
      await Model.updateOne({ topic: key(topic) }, { $set: { photos, fetchedAt: new Date(at) } }, { upsert: true });
    },
  };
}

function createUnsplashCache({
  store = mongoStore(),
  fetchImpl = (...a) => fetch(...a),
  now = () => Date.now(),
  getKey = () => process.env.UNSPLASH_ACCESS_KEY,
  log = (...a) => console.warn('[unsplash]', ...a),
} = {}) {
  const memory = new Map(); // topic -> { at, photos }
  const jobs = new Map(); // topic -> Promise<photos[]>
  let blockedUntil = 0; // shared by all topics: the quota is per key

  const fresh = e => e && e.photos.length && now() - e.at < REFRESH_MS;

  async function fromStore(topic) {
    try {
      const saved = await store.get(topic);
      if (saved && Array.isArray(saved.photos) && saved.photos.length) {
        const entry = { at: saved.at || 0, photos: saved.photos.filter(p => p && isPhotoUrl(p.raw)) };
        if (entry.photos.length) return entry;
      }
    } catch (err) { log('db read failed:', err.message); }
    return null;
  }

  async function fromUnsplash(topic) {
    const key = getKey();
    if (!key) return null;
    if (now() < blockedUntil) return null;
    const spec = typeof TOPICS[topic] === 'string' ? { query: TOPICS[topic] } : TOPICS[topic];
    const params = new URLSearchParams({
      query: spec.query, per_page: '30', orientation: 'landscape', content_filter: 'high',
    });
    if (spec.color) params.set('color', spec.color);
    let res;
    try {
      res = await fetchImpl(`https://api.unsplash.com/search/photos?${params}`, {
        headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      blockedUntil = now() + RETRY_MS;
      log('request failed:', err.message);
      return null;
    }
    const left = res.headers?.get?.('x-ratelimit-remaining');
    const remaining = left === null || left === undefined || left === '' ? NaN : Number(left); // missing header is not "0 left"
    if (res.status === 429 || res.status === 403) {
      blockedUntil = now() + LIMIT_MS;
      log(`rate limited (${res.status}); using saved photos for the next hour`);
      return null;
    }
    if (!res.ok) {
      blockedUntil = now() + RETRY_MS;
      log(`Unsplash ${res.status}`);
      return null;
    }
    if (Number.isFinite(remaining) && remaining <= MIN_REMAINING) {
      blockedUntil = now() + LIMIT_MS;
      log(`only ${remaining} calls left this hour; pausing Unsplash calls`);
    }
    let photos;
    try { photos = toPhotos((await res.json()).results); } catch { photos = []; }
    return photos.length ? photos : null;
  }

  async function refresh(topic) {
    // Another server instance may have refreshed the database already
    const saved = await fromStore(topic);
    const current = memory.get(topic);
    const best = saved && (!current || saved.at >= current.at) ? saved : current;
    if (fresh(best)) { memory.set(topic, best); return best.photos; }

    const photos = await fromUnsplash(topic);
    if (photos) {
      const entry = { at: now(), photos };
      memory.set(topic, entry);
      try { await store.set(topic, photos, entry.at); } catch (err) { log('db write failed:', err.message); }
      return photos;
    }
    // Fallback: the newest list we ever had, however old
    // (checked again in RETRY_MS, not on every request)
    if (best?.photos.length) { memory.set(topic, { ...best, retryAt: now() + RETRY_MS }); return best.photos; }
    return [];
  }

  /** Photo list for a topic; never throws, never calls Unsplash while a saved list is fresh. */
  function getPhotos(topic) {
    if (!Object.hasOwn(TOPICS, topic)) topic = 'abstract';
    const hit = memory.get(topic);
    if (fresh(hit) || (hit?.photos.length && now() < (hit.retryAt || 0))) return Promise.resolve(hit.photos);
    if (jobs.has(topic)) return jobs.get(topic);
    const job = refresh(topic).catch(err => { log(err.message); return memory.get(topic)?.photos || []; })
      .finally(() => jobs.delete(topic));
    jobs.set(topic, job);
    return job;
  }

  return { getPhotos, isBlocked: () => now() < blockedUntil };
}

module.exports = { createUnsplashCache, TOPICS, TONES, REFRESH_MS, toPhotos, isPlain };
