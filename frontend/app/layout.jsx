import './globals.css';
import './spotify.css';
import './spotlight.css';
import { AppProvider } from './context/AppContext';
import AuthGate from './components/AuthGate';
import AmbientBackground from './components/AmbientBackground';
import InstagramSetupModal from './components/InstagramSetupModal';
import BrowserAlerts from './components/BrowserAlerts';
import Toaster from './components/Toast';
import NetworkStatus from './components/NetworkStatus';
import { DialogProvider } from './context/DialogContext';
import { themeBootScript } from './lib/themeBoot';
import MuiProvider from './components/MuiProvider';

export const metadata = {
  title: 'Chatter OS // Workspace',
  description: 'AI Instagram DM automation & intelligence dashboard with Spotify-style ambient glass UI',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

// viewport-fit=cover exposes env(safe-area-inset-*) for the sticky mobile bars
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#121212',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body style={{ color: 'var(--color-text-primary)', margin: 0, padding: 0 }}>
        <AmbientBackground />
        <MuiProvider>
          <AppProvider>
            <DialogProvider>
              <AuthGate>
                {children}
              </AuthGate>
              <InstagramSetupModal />
              <BrowserAlerts />
              <NetworkStatus />
              <Toaster />
            </DialogProvider>
          </AppProvider>
        </MuiProvider>
      </body>
    </html>
  );
}
