'use client';

import { useEffect, useRef } from 'react';

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
};

let currentImage = null;

export function setAmbientImage(url) {
  currentImage = url || null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AMBIENT_EVENT, { detail: currentImage }));
  }
}

/** Tint the page from `url` while the calling component is mounted. */
export function useAmbientImage(url) {
  useEffect(() => {
    setAmbientImage(url);
    return () => {
      if (currentImage === (url || null)) setAmbientImage(null);
    };
  }, [url]);
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
function extractPalette(pixels) {
  const buckets = Array.from({ length: 12 }, () => ({ weight: 0, h: 0, s: 0, l: 0 }));

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const [h, s, l] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
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

  if (!ranked.length) return null;

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
  };
}

// Instagram CDN images have no CORS headers, so route them through the backend proxy
function sampleableUrl(url) {
  try {
    const u = new URL(url, window.location.href);
    if (/(^|\.)(cdninstagram\.com|fbcdn\.net)$/i.test(u.hostname)) {
      return `${API_BASE}/api/image-proxy?url=${encodeURIComponent(u.href)}`;
    }
    return u.href;
  } catch {
    return url;
  }
}

function loadPalette(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 64, 64);
        resolve(extractPalette(ctx.getImageData(0, 0, 64, 64).data));
      } catch {
        resolve(null); // tainted canvas
      }
    };
    img.onerror = () => resolve(null);
    img.src = sampleableUrl(url);
  });
}

function applyPalette(palette, imageUrl) {
  const root = document.documentElement.style;
  const p = palette || FALLBACK;
  root.setProperty('--ambient-dominant', p.dominant);
  root.setProperty('--ambient-secondary', p.secondary);
  root.setProperty('--ambient-accent', p.accent);
  root.setProperty('--ambient-background', p.background);
  root.setProperty('--ambient-image', imageUrl ? `url("${imageUrl.replace(/"/g, '%22')}")` : 'none');
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
    const cache = new Map();

    const update = async url => {
      const id = ++requestId.current;
      if (!url) return applyPalette(null, null);
      const palette = cache.has(url) ? cache.get(url) : await loadPalette(url);
      cache.set(url, palette);
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
      <AmbientContours />
      <div className="ambient-layer ambient-vignette" />
    </div>
  );
}
