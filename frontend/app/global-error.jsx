'use client';

import './globals.css';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import StatusScreen from './components/StatusScreen';
import { themeBootScript } from './lib/themeBoot';

/** Last-resort screen when the root layout itself crashes (replaces the whole page). */
export default function GlobalError({ reset }) {
  return (
    <html lang="en" suppressHydrationWarning>
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
