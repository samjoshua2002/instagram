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
        background: '#09090b',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#ffffff', color: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck size={24} />
        </div>
        <div style={{ fontSize: '0.9rem', fontWeight: '700', letterSpacing: '-0.3px', color: '#f4f4f5' }}>
          CHATTER OS // AUTHENTICATING
        </div>
        <RefreshCw size={18} className="animate-spin" color="#71717a" />
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
