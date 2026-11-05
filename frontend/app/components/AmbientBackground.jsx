'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Spotify-style Dynamic Ambient Background (PLAN.md §15.2)
 *
 * Pages call `useAmbientImage(url)` with the active artwork / contact avatar.
 * The image is sampled on a 64x64 offscreen canvas, clustered into a palette,
 * and written straight to CSS variables on :root, so the whole page re-tints
 * without re-rendering React. With no image, the Spotify green fallback applies.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://instagram-ai-bot-64tf.onrender.com';
const AMBIENT_EVENT = 'chatter:ambient-image';
const FALLBACK = {
  dominant: '#1db954',
  secondary: '#1ed760',
  accent: '#1db954',
  background: '#0d140e',
  // Contact without a photo still gets a calm wash on their page
  washLight: 'hsl(141 40% 87%)',
  washDark: 'hsl(141 40% 15%)',
};

let currentImage = null;

// ── Palette cache ───────────────────────────────────────────────
// Palettes are computed ahead of time (prefetchAmbientImages) and saved to
// localStorage, so opening a contact tints the page on the very first frame.
const STORE_KEY = 'chatter_palettes_v1';
const STORE_MAX = 400;
const paletteCache = new Map(); // key -> palette | null
const pending = new Map(); // key -> Promise<palette | null>
let storeLoaded = false;
let saveTimer = null;

// Instagram CDN URLs carry expiring signatures; the path alone identifies the image.
function cacheKey(url) {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://x');
    if (/(^|\.)(cdninstagram\.com|fbcdn\.net)$/i.test(u.hostname)) return u.origin + u.pathname;
    return u.href;
  } catch {
    return String(url);
  }
}

function loadStore() {
  if (storeLoaded || typeof window === 'undefined') return;
  storeLoaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    if (Array.isArray(saved)) saved.forEach(([k, p]) => p && paletteCache.set(k, p));
  } catch { /* storage blocked or corrupt */ }
}

function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const entries = [...paletteCache].filter(([, p]) => p).slice(-STORE_MAX);
      localStorage.setItem(STORE_KEY, JSON.stringify(entries));
    } catch { /* quota / private mode */ }
  }, 400);
}

/** The cached palette for `url`, or undefined when it has not been computed yet. */
export function getCachedPalette(url) {
  if (!url) return undefined;
  loadStore();
  return paletteCache.get(cacheKey(url));
}

/** Compute (once) and cache the palette for `url`. */
export function ensurePalette(url) {
  if (!url || typeof window === 'undefined') return Promise.resolve(null);
  loadStore();
  const key = cacheKey(url);
  if (paletteCache.has(key)) return Promise.resolve(paletteCache.get(key));
  if (pending.has(key)) return pending.get(key);
  const job = loadPalette(url).then(p => {
    pending.delete(key);
    // Failed loads are remembered for this session only, so they retry next visit
    paletteCache.set(key, p);
    if (p) saveStore();
    return p;
  });
  pending.set(key, job);
  return job;
}

/** Warm the cache for a list of images, a few at a time, without blocking the UI. */
export function prefetchAmbientImages(urls, concurrency = 4) {
  if (typeof window === 'undefined') return;
  loadStore();
  const queue = [...new Set((urls || []).filter(Boolean))].filter(u => !paletteCache.has(cacheKey(u)));
  if (!queue.length) return;
  const worker = async () => {
    while (queue.length) await ensurePalette(queue.shift());
  };
  const start = () => Array.from({ length: Math.min(concurrency, queue.length) }, worker);
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 800 });
  else setTimeout(start, 50);
}

export function setAmbientImage(url) {
  currentImage = url || null;
  if (typeof window === 'undefined') return;
  // Cache hit: paint the new colours right now instead of waiting for the listener
  const cached = currentImage ? getCachedPalette(currentImage) : null;
  if (!currentImage || cached) applyPalette(cached || null, currentImage);
  window.dispatchEvent(new CustomEvent(AMBIENT_EVENT, { detail: currentImage }));
}

// Runs before the browser paints, so a cached palette never shows the old colours first
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Tint the page from `url` while the calling component is mounted.
 * `strong` washes the whole screen in the image's colour (Apple Music style).
 */
export function useAmbientImage(url, { strong = false } = {}) {
  useIsoLayoutEffect(() => {
    setAmbientImage(url);
    return () => {
      if (currentImage === (url || null)) setAmbientImage(null);
    };
  }, [url]);

  useIsoLayoutEffect(() => {
    if (!strong) return undefined;
    const root = document.documentElement;
    root.setAttribute('data-ambient-strong', '');
    return () => root.removeAttribute('data-ambient-strong');
  }, [strong]);
}

// ── Colour helpers ──────────────────────────────────────────────
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hsl(h, s, l) {
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Cluster pixels into 12 hue buckets, weighted by saturation, and build the palette. */
export function extractPalette(pixels) {
  const buckets = Array.from({ length: 12 }, () => ({ weight: 0, h: 0, s: 0, l: 0 }));
  let opaque = 0;
  let lumSum = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const [h, s, l] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    opaque += 1;
    lumSum += l;
    // Skip near-whites, near-blacks and muddy greys
    if (l > 0.92 || l < 0.06 || s < 0.15) continue;
    const b = buckets[Math.floor(h / 30) % 12];
    const w = s * (1 - Math.abs(l - 0.5));
    b.weight += w;
    b.h += h * w;
    b.s += s * w;
    b.l += l * w;
  }

  const ranked = buckets
    .filter(b => b.weight > 0)
    .map(b => ({ weight: b.weight, h: b.h / b.weight, s: b.s / b.weight, l: b.l / b.weight }))
    .sort((a, b) => b.weight - a.weight);

  if (!opaque) return null;

  // Black-and-white photo: a calm neutral palette instead of the green fallback
  if (!ranked.length) {
    const l = lumSum / opaque;
    return {
      dominant: hsl(220, 0.08, clamp(l, 0.42, 0.58)),
      secondary: hsl(220, 0.06, 0.5),
      accent: hsl(220, 0.1, 0.62),
      background: hsl(220, 0.08, 0.08),
      washLight: hsl(220, 0.1, 0.9),
      washDark: hsl(220, 0.08, 0.16),
    };
  }

  const dom = ranked[0];
  const hueGap = c => Math.min(Math.abs(c.h - dom.h), 360 - Math.abs(c.h - dom.h));
  const sec = ranked.find(c => hueGap(c) >= 30 && c.weight > dom.weight * 0.15)
    || { h: (dom.h + 25) % 360, s: dom.s, l: dom.l };

  // Calibrate luminance / saturation so colours glow on a dark base
  return {
    dominant: hsl(dom.h, clamp(dom.s, 0.45, 0.85), clamp(dom.l, 0.42, 0.58)),
    secondary: hsl(sec.h, clamp(sec.s, 0.4, 0.8), clamp(sec.l, 0.4, 0.6)),
    accent: hsl(dom.h, clamp(dom.s + 0.15, 0.6, 0.95), 0.62),
    background: hsl(dom.h, clamp(dom.s, 0.2, 0.5), 0.08),
    // Full-screen wash behind a contact page (Apple Music style): pastel / deep
    washLight: hsl(dom.h, clamp(dom.s, 0.35, 0.6), 0.86),
    washDark: hsl(dom.h, clamp(dom.s, 0.3, 0.55), 0.17),
  };
}

// Instagram CDN images have no CORS headers, so route them through the backend proxy
function proxiedUrl(url) {
  try {
    const u = new URL(url, window.location.href);
    if (/(^|\.)(cdninstagram\.com|fbcdn\.net)$/i.test(u.hostname)) {
      return `${API_BASE}/api/image-proxy?url=${encodeURIComponent(u.href)}`;
    }
  } catch { /* fall through */ }
  return null;
}

const SAMPLE = 48;
const LOAD_TIMEOUT_MS = 8000;

function sampleImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      img.onload = img.onerror = null;
      resolve(value);
    };
    const timer = setTimeout(() => finish(undefined), LOAD_TIMEOUT_MS);
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE;
        canvas.height = SAMPLE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
        finish(extractPalette(ctx.getImageData(0, 0, SAMPLE, SAMPLE).data));
      } catch {
        finish(undefined); // tainted canvas (no CORS)
      }
    };
    img.onerror = () => finish(undefined);
    img.src = src;
  });
}

/** Try the image directly first (fast when it allows CORS), then via the backend proxy. */
async function loadPalette(url) {
  const direct = await sampleImage(url);
  if (direct !== undefined) return direct;
  const proxy = proxiedUrl(url);
  if (!proxy) return null;
  const viaProxy = await sampleImage(proxy);
  return viaProxy === undefined ? null : viaProxy;
}

function applyPalette(palette, imageUrl) {
  const root = document.documentElement.style;
  const p = palette || FALLBACK;
  root.setProperty('--ambient-dominant', p.dominant);
  root.setProperty('--ambient-secondary', p.secondary);
  root.setProperty('--ambient-accent', p.accent);
  root.setProperty('--ambient-background', p.background);
  root.setProperty('--ambient-wash-light', p.washLight || 'transparent');
  root.setProperty('--ambient-wash-dark', p.washDark || 'transparent');
  root.setProperty('--ambient-image', imageUrl && palette ? `url("${imageUrl.replace(/"/g, '%22')}")` : 'none');
}

// Generative contour field (PLAN.md §13 Phase 5): stacked sine waves with drifting
// phase, built once at import so server and client markup match.
const CONTOUR_PATHS = Array.from({ length: 14 }, (_, i) => {
  const baseY = 60 + i * 68;
  const amp = 18 + (i % 5) * 9;
  const freq = 0.0042 + (i % 3) * 0.0011;
  const phase = i * 0.9;
  let d = '';
  for (let x = -40; x <= 1480; x += 40) {
    const y = baseY + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.35;
    d += `${d ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
  }
  return d;
});

function AmbientContours() {
  return (
    <svg className="ambient-layer ambient-contours" viewBox="0 0 1440 1000" preserveAspectRatio="xMidYMid slice">
      {CONTOUR_PATHS.map((d, i) => (
        <path key={i} d={d} className={i % 4 === 0 ? 'strong' : ''} />
      ))}
    </svg>
  );
}

export default function AmbientBackground() {
  const requestId = useRef(0);

  useEffect(() => {
    const update = async url => {
      const id = ++requestId.current;
      if (!url) return applyPalette(null, null);
      const palette = await ensurePalette(url);
      if (id === requestId.current) applyPalette(palette, url);
    };

    const onChange = e => update(e.detail);
    window.addEventListener(AMBIENT_EVENT, onChange);
    update(currentImage);
    return () => window.removeEventListener(AMBIENT_EVENT, onChange);
  }, []);

  return (
    <div className="ambient-background" aria-hidden="true">
      <div className="ambient-layer ambient-artwork" />
      <div className="ambient-layer ambient-mesh" />
      <div className="ambient-layer ambient-wash" />
      <AmbientContours />
      <div className="ambient-layer ambient-vignette" />
    </div>
  );
}
