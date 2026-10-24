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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && (user?._id || user?.id)) {
      try {
        const userDismissKey = `chatter_onboarding_dismissed_${user._id || user.id}`;
        if (sessionStorage.getItem(userDismissKey) === 'true') {
          setWizardDismissed(true);
        } else {
          setWizardDismissed(false);
        }
      } catch (e) {}
    }
  }, [user?._id, user?.id]);

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

  // Prevent SSR hydration mismatch: render loader until client mounts
  if (!mounted || (authLoading && (!token || !user))) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: 'transparent',
        color: 'var(--color-text-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '11px', background: 'var(--ambient-dominant)', color: 'var(--color-background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldCheck size={22} />
        </div>
        <div style={{ fontSize: '0.86rem', fontWeight: '700', letterSpacing: '-0.3px', color: 'var(--color-text-primary)' }}>
          CHATTER OS
        </div>
        <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--color-text-secondary)' }} />
      </div>
    );
  }

  if (!token || !user) {
    return <LoginPage onLoginSuccess={handleLogin} />;
  }

  return (
    <>
      <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: 'transparent' }}>
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
          if (user?._id || user?.id) {
            try { sessionStorage.setItem(`chatter_onboarding_dismissed_${user._id || user.id}`, 'true'); } catch (e) {}
          }
        }}
      />
    </>
  );
}
