'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Instagram, Facebook, RefreshCw, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';

// Guided 30-second fix shown when Meta login finds no Professional Instagram account (PLAN.md §2.3)
const STEPS = [
  {
    Icon: Instagram,
    title: 'Switch to a Professional account',
    path: ['Instagram app', 'Settings', 'Account type and tools', 'Switch to professional account'],
    note: 'Pick Creator or Business. It is free and your followers will not notice.',
  },
  {
    Icon: Facebook,
    title: 'Link it to your Facebook Page',
    path: ['Facebook Page', 'Settings', 'Linked accounts', 'Instagram', 'Connect account'],
    note: 'Use the same Instagram account you want Chatter OS to reply from.',
  },
  {
    Icon: RefreshCw,
    title: 'Refresh the connection',
    path: ['Tap "Refresh Connection" below'],
    note: 'We will pick up your Professional account automatically.',
  },
];

export default function InstagramSetupModal() {
  const { API_BASE, token } = useApp();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Opens from the OAuth popup message, or from ?error=no_instagram_linked after a full-page redirect
  useEffect(() => {
    const onMessage = (event) => {
      if (event.data?.type === 'INSTAGRAM_OAUTH_ERROR' && event.data?.code === 'no_instagram_linked') {
        setStep(0);
        setOpen(true);
      }
    };
    window.addEventListener('message', onMessage);

    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'no_instagram_linked') {
      setOpen(true);
      params.delete('error');
      const qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const refreshConnection = () => {
    const currentToken = token || localStorage.getItem('chatter_jwt_token') || '';
    const url = `${API_BASE}/api/auth/instagram/connect?origin=${encodeURIComponent(window.location.origin)}&token=${encodeURIComponent(currentToken)}`;
    setOpen(false);
    window.open(url, 'instagram_oauth', 'width=620,height=720,left=250,top=100');
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="ig-setup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ig-setup-title"
            className="ig-setup-modal"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="ig-setup-close" onClick={() => setOpen(false)} aria-label="Close">
              <X size={18} />
            </button>

            <div className="person-card-eyebrow">30-SECOND FIX</div>
            <h2 id="ig-setup-title" className="ig-setup-heading">Finish connecting Instagram</h2>
            <p className="person-card-sub">Chatter OS can only reply from an Instagram Professional account linked to a Facebook Page.</p>

            <div className="ig-setup-progress" aria-hidden="true">
              {STEPS.map((_, i) => <span key={i} className={i <= step ? 'is-on' : ''} />)}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                className="ig-setup-step"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22 }}
              >
                <div className="ig-setup-icon"><current.Icon size={22} /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="ig-setup-step-label">Step {step + 1} of {STEPS.length}</div>
                  <div className="ig-setup-step-title">{current.title}</div>
                  <div className="ig-setup-path">
                    {current.path.map((p, i) => (
                      <React.Fragment key={p}>
                        {i > 0 && <ChevronRight size={12} />}
                        <span>{p}</span>
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="person-card-sub">{current.note}</div>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="ig-setup-actions">
              <button type="button" className="btn" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
                <ChevronLeft size={15} /> Back
              </button>
              {isLast ? (
                <button type="button" className="btn btn-primary" onClick={refreshConnection}>
                  <RefreshCw size={15} /> Refresh Connection
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => setStep(s => s + 1)}>
                  Next <ChevronRight size={15} />
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
