import './globals.css';
import { AppProvider } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Toast from './components/Toast';
import AiInterviewModal from './components/AiInterviewModal';
import InspectorDrawer from './components/InspectorDrawer';
import LinkIdModal from './components/LinkIdModal';

export const metadata = {
  title: 'Chatter OS // Sam Joshua',
  description: 'AI Instagram DM automation & intelligence dashboard with pure monochrome Shadcn UI',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ background: '#ffffff', color: '#09090b', margin: 0, padding: 0 }}>
        <AppProvider>
          <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: '#ffffff' }}>
            <Sidebar />
            <main className="app-main-content">
              {children}
            </main>
          </div>
          <Toast />
          <AiInterviewModal />
          <LinkIdModal />
        </AppProvider>
      </body>
    </html>
  );
}
