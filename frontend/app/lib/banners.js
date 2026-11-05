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
const tried = new Set(); // topics asked for this session (loaded or failed)

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
    .finally(() => { jobs.delete(topic); tried.add(topic); });
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

// ── Colour matching ─────────────────────────────────────────────
// A contact's banner follows the main colour of their profile photo (the same colour
// that tints the page), so the top of the page and the photo never clash.

/** "#rrggbb", "#rgb" or "hsl(h s% l%)" -> { h, s, l } (s and l from 0 to 1), or null. */
export function parseColor(color) {
  const c = String(color || '').trim();
  const m = c.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i);
  if (m) return { h: Number(m[1]) % 360, s: Number(m[2]) / 100, l: Number(m[3]) / 100 };
  let hex = c.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = [...hex].map(x => x + x).join('');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** The Unsplash colour filter nearest to a colour (server topic "tone-<name>"). */
export function toneFor(color) {
  const c = typeof color === 'object' && color ? color : parseColor(color);
  if (!c) return null;
  if (c.s < 0.12) return c.l > 0.8 ? 'white' : c.l < 0.15 ? 'black' : 'black_and_white';
  const h = c.h;
  if (h < 15 || h >= 345) return 'red';
  if (h < 40) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 160) return 'green';
  if (h < 195) return 'teal';
  if (h < 255) return 'blue';
  if (h < 285) return 'purple';
  return 'magenta';
}

const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** How far a photo's colour is from the target (0 = same). Greys only match greys. */
export function colorDistance(target, photoColor) {
  const p = parseColor(photoColor);
  if (!target || !p) return 1;
  const grey = t => t.s < 0.12 || t.l < 0.06;
  if (grey(target)) return Math.min(1, p.s);
  if (grey(p)) return 0.9;
  return hueGap(target.h, p.h) / 180 * 0.8 + Math.abs(target.s - p.s) * 0.2;
}

/**
 * Pick the photo nearest to `color`; among the few closest, `seed` decides,
 * so two contacts with the same colour don't always get the same photo.
 */
export function pickBannerByColor(photos, color, seed) {
  if (!photos || !photos.length) return null;
  const target = typeof color === 'object' && color ? color : parseColor(color);
  if (!target) return pickBanner(photos, seed);
  const ranked = photos
    .map(p => ({ p, d: colorDistance(target, p.color) }))
    .sort((a, b) => a.d - b.d);
  const best = ranked[0].d;
  const close = ranked.filter(r => r.d <= best + 0.08).slice(0, 5);
  return close[hashSeed(seed) % close.length].p;
}

/**
 * The banner for `seed` that matches `color` (e.g. the contact photo's main colour).
 * Uses the matching Unsplash colour list; if that list is empty (no key / rate limited),
 * falls back to the best match in `topic`'s list. With no colour it is useBanner().
 */
export function useMatchedBanner(seed, color, topic = 'abstract') {
  const tone = color ? toneFor(color) : null;
  const toneTopic = tone ? `tone-${tone}` : null;
  const [, setTick] = useState(0); // re-render when a list arrives
  useEffect(() => {
    let alive = true;
    const bump = () => alive && setTick(t => t + 1);
    loadBanners(topic).then(bump);
    if (toneTopic) loadBanners(toneTopic).then(bump);
    return () => { alive = false; };
  }, [topic, toneTopic]);
  if (seed === null || seed === undefined || typeof window === 'undefined') return null;
  const base = cachedBanners(topic);
  if (!toneTopic) return pickBanner(base, seed);
  const toned = cachedBanners(toneTopic);
  if (toned && toned.length) return pickBannerByColor(toned, color, seed);
  // Colour list still loading: wait, so a wrong-colour photo never flashes in.
  // It failed (no key / rate limited): best colour match from the normal list.
  if (!tried.has(toneTopic)) return null;
  return pickBannerByColor(base, color, seed);
}

/** Soft gradient in one colour family, shown while a matched photo loads. */
export function toneArt(color, seed) {
  const c = parseColor(color);
  if (!c) return abstractArt(seed);
  const h = Math.round(c.h);
  const s = Math.round(Math.min(Math.max(c.s, 0.35), 0.85) * 100);
  const x = 20 + (hashSeed(seed) % 50);
  return [
    `radial-gradient(circle at ${x}% 30%, hsl(${h} ${s}% 60%) 0%, transparent 55%)`,
    `radial-gradient(circle at ${100 - x}% 70%, hsl(${(h + 25) % 360} ${s}% 45%) 0%, transparent 60%)`,
    `linear-gradient(135deg, hsl(${h} ${s}% 22%), hsl(${(h + 340) % 360} ${s}% 12%))`,
  ].join(', ');
}
