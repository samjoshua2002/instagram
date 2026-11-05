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

/** The photo used to tint a contact's page: saved photo, else their Instagram avatar. */
export function personArtUrl(person) {
  if (!person) return null;
  if (typeof person.profilePic === 'string' && person.profilePic.startsWith('http')) return person.profilePic;
  const handle = String(person.handle || person.instagramHandle || '').replace(/^@/, '').trim();
  return handle ? `https://unavatar.io/instagram/${handle}?fallback=false` : null;
}
