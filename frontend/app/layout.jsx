import './globals.css';
import { AppProvider } from './context/AppContext';
import AuthGate from './components/AuthGate';
import AmbientBackground from './components/AmbientBackground';

export const metadata = {
  title: 'Chatter OS // Workspace',
  description: 'AI Instagram DM automation & intelligence dashboard with Spotify-style ambient glass UI',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ color: 'var(--color-text-primary)', margin: 0, padding: 0 }}>
        <AmbientBackground />
        <AppProvider>
          <AuthGate>
            {children}
          </AuthGate>
        </AppProvider>
      </body>
    </html>
  );
}
