'use client';

import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { THEME_KEY, THEME_COLORS } from './themeBoot';
import { bannersReady } from './banners';
import { getTrigger, prefersReducedMotion } from './motion';

// Light / Dark theme (PLAN.md §15.5.3). Stored per device; applied as :root[data-theme].

function readTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Colour change as a mask reveal: the new theme grows as a circle out of the
 * button that was pressed (View Transitions API). Browsers without it, and
 * reduced-motion users, get an instant switch.
 */
function revealTheme(apply) {
  const root = document.documentElement;
  if (!document.startViewTransition || prefersReducedMotion()) return apply();
  const tr = getTrigger(3000);
  const x = tr ? tr.x : window.innerWidth / 2;
  const y = tr ? tr.y : 0;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  root.classList.add('theme-vt');
  // Hold the new snapshot until the banners have their new-theme photos (no swap mid-reveal)
  const vt = document.startViewTransition(() => { apply(); return bannersReady(700); });
  vt.ready
    .then(() => root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 480, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' }
    ).finished)
    .catch(() => {})
    .finally(() => root.classList.remove('theme-vt'));
}

export function useTheme() {
  const [theme, setThemeState] = useState('dark');

  useEffect(() => {
    setThemeState(readTheme());
    const sync = () => setThemeState(readTheme());
    window.addEventListener('chatter:theme', sync);
    return () => window.removeEventListener('chatter:theme', sync);
  }, []);

  const setTheme = useCallback(next => {
    const apply = () => {
      document.documentElement.dataset.theme = next;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[next === 'light' ? 'light' : 'dark']);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      // Sync render, so the banner hooks ask for the new lists before bannersReady() looks
      flushSync(() => window.dispatchEvent(new Event('chatter:theme')));
    };
    if (readTheme() === next) return apply();
    revealTheme(apply);
  }, []);

  const toggleTheme = useCallback(() => setTheme(readTheme() === 'light' ? 'dark' : 'light'), [setTheme]);

  return { theme, setTheme, toggleTheme };
}
