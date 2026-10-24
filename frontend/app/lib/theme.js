'use client';

import { useCallback, useEffect, useState } from 'react';
import { THEME_KEY } from './themeBoot';

// Light / Dark theme (PLAN.md §15.5.3). Stored per device; applied as :root[data-theme].

function readTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
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
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    window.dispatchEvent(new Event('chatter:theme'));
  }, []);

  const toggleTheme = useCallback(() => setTheme(readTheme() === 'light' ? 'dark' : 'light'), [setTheme]);

  return { theme, setTheme, toggleTheme };
}
