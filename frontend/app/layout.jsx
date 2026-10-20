import './globals.css';
import { AppProvider } from './context/AppContext';
import AuthGate from './components/AuthGate';

export const metadata = {
  title: 'Chatter OS // Workspace',
  description: 'AI Instagram DM automation & intelligence dashboard with pure monochrome Shadcn UI',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ background: '#ffffff', color: '#09090b', margin: 0, padding: 0 }}>
        <AppProvider>
          <AuthGate>
            {children}
          </AuthGate>
        </AppProvider>
      </body>
    </html>
  );
}
