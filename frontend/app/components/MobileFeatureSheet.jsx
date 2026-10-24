'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Sun,
  Moon,
  Fingerprint,
  LogOut,
  Play,
  Pause,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../lib/theme';
import WorkspaceModeSwitch from './WorkspaceModeSwitch';

/**
 * Mobile Bottom Sheet Drawer (PLAN.md §15.5.3)
 * Opened from the header avatar or the bottom bar "More" tab. Exposes every
 * route for the current workspace, the Personal / Business / Hybrid switch and the
 * Light / Dark theme switch.
 */
export default function MobileFeatureSheet({ open, onClose, items }) {
  const pathname = usePathname();
  const {
    user,
    routingConfig,
    toggleGlobalBot,
    logout,
    setIsPasskeyModalOpen,
    isImpersonating,
  } = useApp();
  const { theme, setTheme } = useTheme();

  const isPureSuperadmin = user?.role === 'superadmin' && !isImpersonating;

  // Close on route change and on Escape
  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : (user?.username || 'User');

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className="mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="All features"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose(); }}
          >
            <div className="sheet-grabber" />

            {/* Identity row */}
            <div className="sheet-identity">
              <Link href="/profile" className="sheet-avatar" onClick={onClose}>
                {user?.profilePicUrl
                  ? <img src={user.profilePicUrl} alt="" />
                  : <span>{displayName.charAt(0).toUpperCase()}</span>}
              </Link>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="sheet-name">{isPureSuperadmin ? 'Platform Superadmin' : displayName}</div>
                <div className="sheet-handle">@{user?.instagramUsername || user?.username || 'user'}</div>
              </div>
              <button type="button" className="sheet-icon-btn" onClick={onClose} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            {/* Workspace + theme switchers */}
            {!isPureSuperadmin && (
              <div className="sheet-section">
                <div className="sheet-label">Workspace</div>
                <WorkspaceModeSwitch />
              </div>
            )}

            <div className="sheet-section">
              <div className="sheet-label">Theme</div>
              <div className="sheet-segment">
                <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
                  <Moon size={16} /> Dark
                </button>
                <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
                  <Sun size={16} /> Light
                </button>
              </div>
            </div>

            {/* Every platform route */}
            <div className="sheet-section">
              <div className="sheet-label">All features</div>
              <div className="sheet-grid">
                {items.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} onClick={onClose} className={`sheet-tile${pathname === href ? ' active' : ''}`}>
                    <Icon size={20} />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Account actions */}
            <div className="sheet-section sheet-list">
              {!isPureSuperadmin && (
                <button type="button" onClick={toggleGlobalBot}>
                  {routingConfig?.globalBotActive ? <Pause size={18} /> : <Play size={18} />}
                  <span>{routingConfig?.globalBotActive ? 'Pause automation' : 'Resume automation'}</span>
                  <span className={`sheet-dot${routingConfig?.globalBotActive ? ' on' : ''}`} />
                </button>
              )}
              <button type="button" onClick={() => { onClose(); setIsPasskeyModalOpen(true); }}>
                <Fingerprint size={18} />
                <span>Passkeys & security</span>
                <ChevronRight size={16} className="sheet-chevron" />
              </button>
              <button type="button" className="danger" onClick={logout}>
                <LogOut size={18} />
                <span>Sign out</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
