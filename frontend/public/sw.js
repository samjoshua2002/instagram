// Minimal service worker so browsers offer "Install app". It does not cache anything:
// every request goes to the network as usual, so the app never shows stale data.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
