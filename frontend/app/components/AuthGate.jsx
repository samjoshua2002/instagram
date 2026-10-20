'use client';

import React from 'react';
import { useApp } from '../context/AppContext';
import LoginPage from './LoginPage';
import PasskeyManagerModal from './PasskeyManagerModal';
import Sidebar from './Sidebar';
import Toast from './Toast';
import AiInterviewModal from './AiInterviewModal';
import LinkIdModal from './LinkIdModal';
import { ShieldCheck, RefreshCw } from 'lucide-react';

export default function AuthGate({ children }) {
  const {
    user,
    token,
    authLoading,
    login,
    isPasskeyModalOpen,
    setIsPasskeyModalOpen
  } = useApp();

  if (authLoading) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#ffffff',
        color: '#09090b',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '11px', background: '#09090b', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck size={22} />
        </div>
        <div style={{ fontSize: '0.86rem', fontWeight: '700', letterSpacing: '-0.3px', color: '#09090b' }}>
          CHATTER OS // AUTHENTICATING
        </div>
        <RefreshCw size={16} className="animate-spin" color="#71717a" />
      </div>
    );
  }

  if (!token || !user) {
    return <LoginPage onLoginSuccess={login} />;
  }

  return (
    <>
      <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: '#ffffff' }}>
        <Sidebar />
        <main className="app-main-content">
          {children}
        </main>
      </div>
      <Toast />
      <AiInterviewModal />
      <LinkIdModal />
      <PasskeyManagerModal
        isOpen={isPasskeyModalOpen}
        onClose={() => setIsPasskeyModalOpen(false)}
      />
    </>
  );
}
