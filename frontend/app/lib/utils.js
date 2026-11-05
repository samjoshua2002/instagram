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

/** Calls onClosed once the user closes a popup, so "Connecting..." never stays stuck. */
export function onPopupClosed(popup, onClosed) {
  if (!popup) return;
  const timer = setInterval(() => {
    if (popup.closed) {
      clearInterval(timer);
      onClosed();
    }
  }, 800);
}

/** The photo used to tint a contact's page: saved photo, else their Instagram avatar. */
export function personArtUrl(person) {
  if (!person) return null;
  if (typeof person.profilePic === 'string' && person.profilePic.startsWith('http')) return person.profilePic;
  const handle = String(person.handle || person.instagramHandle || '').replace(/^@/, '').trim();
  return handle ? `https://unavatar.io/instagram/${handle}?fallback=false` : null;
}
