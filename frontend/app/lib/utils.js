import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-style class joiner for the `components/ui` primitives. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** True when a window message came from our API server (the Instagram OAuth popup page). */
export function isFromApi(event, apiBase) {
  try {
    return event.origin === new URL(apiBase, window.location.href).origin;
  } catch {
    return false;
  }
}

/**
 * Calls onClosed once the user closes a popup, so "Connecting..." never stays stuck.
 * Returns a cancel function: call it on unmount (or before opening another popup).
 */
export function onPopupClosed(popup, onClosed) {
  if (!popup) return () => {};
  const timer = setInterval(() => {
    if (popup.closed) {
      clearInterval(timer);
      onClosed();
    }
  }, 800);
  return () => clearInterval(timer);
}

/**
 * Opens the Instagram connect popup without putting the login token in the URL.
 * The window opens right away (inside the click, so it isn't blocked), then gets a
 * 2-minute single-use ticket from the API and goes to the connect page with it.
 * Returns the popup window (or null if the browser blocked it).
 */
export function openInstagramConnect(apiBase, token) {
  const base = String(apiBase || '').replace(/\/+$/, '');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const popup = window.open('', 'instagram_oauth', 'width=620,height=720,left=250,top=100');
  if (!popup) return null;
  try { popup.document.title = 'Connecting to Instagram…'; } catch { }
  fetch(`${base}/api/auth/instagram/connect-ticket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token || ''}` },
  })
    .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
    .then(({ ticket }) => {
      if (popup.closed) return;
      popup.location.href = `${base}/api/auth/instagram/connect?origin=${encodeURIComponent(origin)}&ticket=${encodeURIComponent(ticket)}`;
    })
    .catch(() => { try { popup.close(); } catch { } });
  return popup;
}

/** The contact's saved photo link, or null. */
export function savedPhotoUrl(person) {
  const pic = person?.profilePic;
  return typeof pic === 'string' && pic.startsWith('http') ? pic : null;
}

// unavatar.io allows only 25 free lookups a day. Once it answers 429 we stop asking until its reset
// time, so pages show initials/artwork at once instead of a console full of 429 errors.
const UNAVATAR_BLOCK_KEY = 'unavatar_blocked_until';
let unavatarBlockedUntil = 0;
let unavatarChecking = false;
let unavatarChecks = 0;

function unavatarBlocked() {
  if (!unavatarBlockedUntil) {
    try { unavatarBlockedUntil = Number(localStorage.getItem(UNAVATAR_BLOCK_KEY)) || 0; } catch { }
  }
  return Date.now() < unavatarBlockedUntil;
}

/** unavatar.io link for an Instagram handle, or null while its daily limit is used up. */
export function unavatarUrl(handle) {
  const clean = String(handle || '').replace(/^@/, '').trim();
  if (!clean || unavatarBlocked()) return null;
  return `https://unavatar.io/instagram/${clean}?fallback=false`;
}

/** An unavatar image failed: check once whether it was the daily limit (429) and if so pause lookups. */
export function noteUnavatarFailed(url) {
  if (!url || !url.startsWith('https://unavatar.io/') || unavatarChecking || unavatarChecks >= 3 || unavatarBlocked()) return;
  unavatarChecking = true;
  unavatarChecks++;
  fetch(url, { method: 'GET', referrerPolicy: 'no-referrer' })
    .then(res => {
      if (res.status !== 429) return;
      const reset = Number(res.headers.get('x-rate-limit-reset'));
      const retry = Number(res.headers.get('retry-after'));
      unavatarBlockedUntil = reset > Date.now() ? reset : Date.now() + (retry > 0 ? retry * 1000 : 6 * 3600 * 1000);
      try { localStorage.setItem(UNAVATAR_BLOCK_KEY, String(unavatarBlockedUntil)); } catch { }
    })
    .catch(() => { })
    .finally(() => { unavatarChecking = false; });
}

/** The photo used to tint a contact's page: saved photo, else their Instagram avatar. */
export function personArtUrl(person) {
  if (!person) return null;
  if (savedPhotoUrl(person)) return person.profilePic;
  return unavatarUrl(person.handle || person.instagramHandle);
}
