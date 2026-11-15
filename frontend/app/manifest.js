// Web app manifest (Next.js serves it at /manifest.webmanifest): lets phones and desktops install
// Chatter OS as an app with its own icon and window.
export default function manifest() {
  return {
    name: 'Chatter OS',
    short_name: 'Chatter OS',
    description: 'Your AI Instagram DM workspace',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b0b0d',
    theme_color: '#0b0b0d',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
