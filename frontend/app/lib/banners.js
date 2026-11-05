'use client';

import { useEffect, useState } from 'react';

/**
 * Unsplash banner artwork for home, profile, chat and page headers.
 * The server (/api/banners) holds the Unsplash key and caches each topic for 6 hours;
 * here the list is kept in memory + localStorage, and a seed (a name or a page path)
 * always picks the same photo, so a person's banner never jumps around.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';
const STORE_KEY = 'chatter_banners_v1';
const TTL = 6 * 60 * 60 * 1000;
export const UTM = 'utm_source=chatter_box&utm_medium=referral';

const lists = new Map(); // topic -> photos[]
const jobs = new Map(); // topic -> Promise<photos[]>

export const hashSeed = s => [...String(s || '?')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

// `anyAge` returns an old list too: used as the fallback when the server has no photos to give
function readStore(topic, anyAge = false) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')[topic];
    if (saved && Array.isArray(saved.photos) && saved.photos.length && (anyAge || Date.now() - saved.at < TTL)) return saved.photos;
  } catch { /* storage blocked or corrupt */ }
  return null;
}

function writeStore(topic, photos) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    all[topic] = { at: Date.now(), photos };
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch { /* quota / private mode */ }
}

/** Photos already on hand for `topic` (no network), or null. */
export function cachedBanners(topic = 'abstract') {
  if (lists.has(topic)) return lists.get(topic);
  if (typeof window === 'undefined') return null;
  const saved = readStore(topic);
  if (saved) lists.set(topic, saved);
  return saved;
}

/** Load the photo list for `topic` once per session (empty list when Unsplash is unavailable). */
export function loadBanners(topic = 'abstract') {
  const ready = cachedBanners(topic);
  if (ready) return Promise.resolve(ready);
  if (typeof window === 'undefined') return Promise.resolve([]);
  if (jobs.has(topic)) return jobs.get(topic);
  const job = fetch(`${API_BASE}/api/banners?topic=${encodeURIComponent(topic)}`)
    .then(r => (r.ok ? r.json() : { photos: [] }))
    .then(d => {
      const photos = Array.isArray(d.photos) ? d.photos.filter(p => p && p.raw) : [];
      if (photos.length) {
        lists.set(topic, photos);
        writeStore(topic, photos);
        return photos;
      }
      return readStore(topic, true) || [];
    })
    .catch(() => readStore(topic, true) || [])
    .finally(() => jobs.delete(topic));
  jobs.set(topic, job);
  return job;
}

export function pickBanner(photos, seed) {
  if (!photos || !photos.length) return null;
  return photos[hashSeed(seed) % photos.length];
}

/** Sized image link for a photo (Unsplash resizes on its CDN). */
export function bannerSrc(photo, width = 1600) {
  if (!photo?.raw) return null;
  return `${photo.raw}${photo.raw.includes('?') ? '&' : '?'}w=${width}&q=80&fm=jpg&fit=crop`;
}

/** The banner photo for `seed`, or null until the list has loaded. */
export function useBanner(seed, topic = 'abstract') {
  const [photos, setPhotos] = useState(() => (typeof window === 'undefined' ? null : cachedBanners(topic)));
  useEffect(() => {
    let alive = true;
    loadBanners(topic).then(p => alive && setPhotos(p));
    return () => { alive = false; };
  }, [topic]);
  return seed === null || seed === undefined ? null : pickBanner(photos, seed);
}

// Colour sets for the abstract artwork shown while a photo loads (or when Unsplash is unavailable)
const PALETTES = [
  ['#ff3d5a', '#ff9a8b', '#6a8dff'],
  ['#ff5e3a', '#ffcf6b', '#e8115b'],
  ['#2f80ed', '#56ccf2', '#ff6b8b'],
  ['#8e2de2', '#ff6fd8', '#ff9966'],
  ['#ff4e50', '#f9d423', '#c31432'],
  ['#ff758c', '#ff7eb3', '#3a1c71'],
  ['#00c6ff', '#ff3a6e', '#fbd786'],
];

/** Deterministic abstract "blurred light" artwork for a name. */
export function abstractArt(seed) {
  const h = hashSeed(seed);
  const [a, b, c] = PALETTES[h % PALETTES.length];
  const x1 = 15 + (h % 50), y1 = 10 + ((h >> 3) % 50), x2 = 55 + ((h >> 5) % 40), y2 = 45 + ((h >> 7) % 50);
  return [
    `radial-gradient(circle at ${x1}% ${y1}%, ${a} 0%, transparent 55%)`,
    `radial-gradient(circle at ${x2}% ${y2}%, ${b} 0%, transparent 50%)`,
    `radial-gradient(circle at ${100 - x1}% ${100 - y2 / 2}%, ${c} 0%, transparent 60%)`,
    `linear-gradient(${(h % 360)}deg, ${c}, ${a})`,
  ].join(', ');
}

/** The main colour of the fallback artwork for a seed (used before a photo's palette is known). */
export function abstractColor(seed) {
  return PALETTES[hashSeed(seed) % PALETTES.length][0];
}
