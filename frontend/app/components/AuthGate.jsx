'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useApp } from '../context/AppContext';
import LoginPage from './LoginPage';
import PasskeyManagerModal from './PasskeyManagerModal';
import Sidebar from './Sidebar';
import Toast from './Toast';
import AiInterviewModal from './AiInterviewModal';
import LinkIdModal from './LinkIdModal';
import OnboardingWizard from './OnboardingWizard';
import WorkspaceImpersonationBanner from './WorkspaceImpersonationBanner';
import { ShieldCheck, RefreshCw } from 'lucide-react';

export default function AuthGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    user,
    token,
    authLoading,
    login,
    isPasskeyModalOpen,
    setIsPasskeyModalOpen
  } = useApp();

  const [wizardDismissed, setWizardDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        if (sessionStorage.getItem('chatter_onboarding_dismissed') === 'true') {
          setWizardDismissed(true);
        }
      } catch (e) {}
    }
  }, []);

  // Fresh launch detector: when user closes tab/window and opens fresh,
  // sessionStorage is cleared. We automatically redirect them to start on Dashboard (/)!
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const isSessionActive = sessionStorage.getItem('chatter_session_active');
      if (!isSessionActive) {
        sessionStorage.setItem('chatter_session_active', 'true');
        if (pathname && pathname !== '/') {
          router.replace('/');
        }
      }
    } catch (e) {}
  }, [pathname, router]);

  // Handler for login from LoginPage to ensure immediate navigation to dashboard
  const handleLogin = (jwtToken, userData) => {
    login(jwtToken, userData);
    try {
      sessionStorage.setItem('chatter_session_active', 'true');
    } catch (e) {}
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.location.href = '/';
    }
  };

  // Only block the screen with full loader if there is no cached token or user
  if (authLoading && (!token || !user)) {
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
          CHATTER OS
        </div>
        <RefreshCw size={16} className="animate-spin" color="#71717a" />
      </div>
    );
  }

  if (!token || !user) {
    return <LoginPage onLoginSuccess={handleLogin} />;
  }

  return (
    <>
      <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: '#ffffff' }}>
        <Sidebar />
        <main className="app-main-content">
          <WorkspaceImpersonationBanner />
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
      <OnboardingWizard
        isOpen={!!user && user.isOnboarded === false && user.role !== 'superadmin' && !wizardDismissed}
        onClose={() => setWizardDismissed(true)}
      />
    </>
  );
}
