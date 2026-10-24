import { clsx } from 'clsx';

/** shadcn-style class joiner for the `components/ui` primitives. */
export function cn(...inputs) {
  return clsx(inputs);
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
