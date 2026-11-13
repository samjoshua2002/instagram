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
import InstagramConnectFallback from './InstagramConnectFallback';
import WorkspaceImpersonationBanner from './WorkspaceImpersonationBanner';
import { ShieldCheck, RefreshCw } from 'lucide-react';

export default function AuthGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    mounted,
    user,
    token,
    authLoading,
    login,
    isPasskeyModalOpen,
    setIsPasskeyModalOpen,
    isOnboardingModalOpen,
    setIsOnboardingModalOpen,
  } = useApp();

  const isSuperadmin = user?.role === 'superadmin';
  const isInstagramLinked = isSuperadmin || Boolean(user?.hasInstagramToken || user?.isInstagramConnected || user?.instagramPageAccessToken);

  const [wizardDismissed, setWizardDismissed] = useState(false);
  const userId = user?.id || user?._id;

  useEffect(() => {
    if (typeof window !== 'undefined' && userId) {
      try {
        const userDismissKey = `chatter_onboarding_dismissed_${userId}`;
        if (sessionStorage.getItem(userDismissKey) === 'true') {
          setWizardDismissed(true);
        } else {
          setWizardDismissed(false);
        }
      } catch (e) {}
    }
  }, [userId]);

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

  // Until mounted, render the same neutral shell on server and client (no hydration mismatch).
  // Only block the screen with full loader if there is no cached token or user
  if (!mounted || (authLoading && (!token || !user))) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '11px', background: 'var(--primary)', color: 'var(--primary-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck size={22} />
        </div>
        <div style={{ fontSize: '0.86rem', fontWeight: '700', letterSpacing: '-0.3px', color: 'var(--text)' }}>
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
      <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
        <Sidebar />
        <main className="app-main-content">
          <WorkspaceImpersonationBanner />
          {!isInstagramLinked && pathname !== '/settings' && pathname !== '/profile' ? (
            <InstagramConnectFallback
              onConnect={() => setIsOnboardingModalOpen(true)}
              user={user}
            />
          ) : (
            children
          )}
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
        isOpen={isOnboardingModalOpen}
        onClose={() => {
          setWizardDismissed(true);
          setIsOnboardingModalOpen(false);
          if (userId) {
            try { sessionStorage.setItem(`chatter_onboarding_dismissed_${userId}`, 'true'); } catch (e) {}
          }
        }}
      />
    </>
  );
}
