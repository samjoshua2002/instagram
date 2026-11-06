'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useHeaderScrollAway } from '../lib/scrollMotion';
import { usePathname } from 'next/navigation';
import { useApp } from '../context/AppContext';
import dynamic from 'next/dynamic';
import Sidebar from './Sidebar';

// Big screens and pop-ups load on demand, so signed-in pages do not download the
// 3,000-line login page or the onboarding wizard before they can paint.
const LoginPage = dynamic(() => import('./LoginPage'), { ssr: false, loading: () => <GateSpinner /> });
const PasskeyManagerModal = dynamic(() => import('./PasskeyManagerModal'), { ssr: false });
const AiInterviewModal = dynamic(() => import('./AiInterviewModal'), { ssr: false });
const LinkIdModal = dynamic(() => import('./LinkIdModal'), { ssr: false });
const OnboardingWizard = dynamic(() => import('./OnboardingWizard'), { ssr: false });
const InstagramConnectFallback = dynamic(() => import('./InstagramConnectFallback'), { ssr: false });
import WorkspaceImpersonationBanner from './WorkspaceImpersonationBanner';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

function GateSpinner() {
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--color-text-secondary)' }} />
    </div>
  );
}

export default function AuthGate({ children }) {
  const pathname = usePathname();
  const {
    user,
    token,
    authLoading,
    login,
    isPasskeyModalOpen,
    isAiModalOpen,
    linkingTargetPerson,
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

  // Phones: the top header slides away on scroll and the page's sticky band takes its place.
  const mainRef = useRef(null);
  const appShown = mounted && Boolean(token && user);
  useHeaderScrollAway(mainRef, [appShown]);

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

  // Mark this tab's session as active. No redirect: a new tab or a shared deep link
  // (e.g. /vault) must open the page that was asked for, not bounce to the Dashboard.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!sessionStorage.getItem('chatter_session_active')) {
        sessionStorage.setItem('chatter_session_active', 'true');
      }
    } catch (e) {}
  }, []);

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
        fontFamily: 'var(--font-sans)',
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
        <main ref={mainRef} className="app-main-content">
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
      {/* AnimatePresence lets each popup play its close animation before unmounting */}
      <AnimatePresence>{isAiModalOpen && <AiInterviewModal key="ai-interview" />}</AnimatePresence>
      <AnimatePresence>{linkingTargetPerson && <LinkIdModal key="link-id" />}</AnimatePresence>
      <AnimatePresence>
      {isPasskeyModalOpen && <PasskeyManagerModal
        key="passkeys"
        isOpen={isPasskeyModalOpen}
        onClose={() => setIsPasskeyModalOpen(false)}
      />}
      </AnimatePresence>
      <AnimatePresence>
      {isOnboardingModalOpen && <OnboardingWizard
        key="onboarding"
        isOpen={isOnboardingModalOpen}
        onClose={() => {
          setWizardDismissed(true);
          setIsOnboardingModalOpen(false);
          if (user?._id || user?.id) {
            try { sessionStorage.setItem(`chatter_onboarding_dismissed_${user._id || user.id}`, 'true'); } catch (e) {}
          }
        }}
      />}
      </AnimatePresence>
    </>
  );
}
