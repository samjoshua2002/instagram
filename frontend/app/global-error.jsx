'use client';

import './globals.css';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import StatusScreen from './components/StatusScreen';
import { themeBootScript } from './lib/themeBoot';
import { Figtree } from 'next/font/google';

// Renders without layout.jsx, so it loads the app font itself
const figtree = Figtree({ subsets: ['latin'], weight: ['400', '600', '700', '800'], display: 'swap', variable: '--font-figtree' });

/** Last-resort screen when the root layout itself crashes (replaces the whole page). */
export default function GlobalError({ reset }) {
  return (
    <html lang="en" className={figtree.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body style={{ margin: 0, background: 'var(--color-background)', color: 'var(--color-text-primary)' }}>
        <StatusScreen
          icon={AlertTriangle}
          title="Chatter OS couldn't load"
          message="Something broke while starting the app. Reload to try again. If it keeps happening, sign out and back in."
          actions={[
            { label: 'Try again', onClick: () => reset(), icon: RefreshCw },
            { label: 'Reload page', variant: 'ghost', onClick: () => window.location.reload() },
          ]}
        />
      </body>
    </html>
  );
}
