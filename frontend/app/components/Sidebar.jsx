'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  Users,
  Sliders,
  Sparkles,
  Play,
  Pause,
  Bot,
  UserCheck,
  Image as ImageIcon,
  Fingerprint,
  LogOut,
  ChevronRight,
  Shield,
  Layers,
  Settings,
  Plus,
  ArrowLeftRight,
  Zap,
  Activity,
  Download,
  FileText,
  Inbox,
  Sun,
  Moon,
  LayoutGrid
} from 'lucide-react';
import { motion } from 'framer-motion';
import MobileFeatureSheet from './MobileFeatureSheet';
import { useTheme } from '../lib/theme';

// Framer Motion Variants for Staggered Fade-in Animation
const navContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.12
    }
  }
};

const navItemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1]
    }
  }
};

const footerContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.55
    }
  }
};

const footerItemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1]
    }
  }
};

const mobileTabsContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1
    }
  }
};

const mobileTabVariant = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: [0.16, 1, 0.3, 1]
    }
  }
};

export default function Sidebar() {
  const pathname = usePathname();
  const {
    routingConfig,
    toggleGlobalBot,
    startAiInterview,
    user,
    logout,
    switchAccount,
    setIsPasskeyModalOpen,
    isImpersonating,
    exitWorkspace,
    openOnboardingWizard
  } = useApp();

  const isSuperadmin = user?.role === 'superadmin' || isImpersonating;
  const isPureSuperadmin = user?.role === 'superadmin' && !isImpersonating;

  const isInstagramLinked = Boolean(
    user?.hasInstagramToken ||
    user?.isInstagramConnected ||
    (user?.instagramPageAccessToken && user.instagramPageAccessToken.length > 5) ||
    (user?.instagramUsername === 'catovidz') ||
    (user?.username === 'samjoshua')
  );

  // 'business' and 'agency' workspaces get the business menu; 'personal' and 'creator' the personal one
  const isBusiness = ['business', 'agency'].includes(user?.accountType);

  const navItems = isPureSuperadmin
    ? [
      { href: '/', label: 'Platform Console', icon: LayoutDashboard, code: '01' },
      { href: '/admin', label: 'User Workspaces', icon: Users, code: '02' },
      { href: '/admin/tokens', label: 'Token Health Radar', icon: Activity, code: '03' },
      { href: '/download', label: 'Desktop Releases', icon: Download, code: '04' },
    ]
    : isBusiness
      ? [
        { href: '/', label: 'Business Dashboard', icon: LayoutDashboard, code: '01' },
        { href: '/documents', label: 'Document & Service Vault', icon: FileText, code: '02' },
        { href: '/controls', label: 'Business Policy & Hours', icon: Sliders, code: '03' },
        { href: '/settings', label: 'Brand Voice & AI Model', icon: UserCheck, code: '04' },
        { href: '/relationships', label: 'Customer Inbox & Handoff', icon: Inbox, code: '05' },
        { href: '/download', label: 'Desktop App', icon: Download, code: '06' },
        ...(isSuperadmin ? [{ href: '/admin', label: 'Superadmin', icon: Shield, code: '07' }] : [])
      ]
      : [
        { href: '/', label: 'Dashboard', icon: LayoutDashboard, code: '01' },
        { href: '/relationships', label: 'People Directory', icon: Users, code: '02' },
        { href: '/controls', label: 'Chat Rules', icon: Sliders, code: '03' },
        { href: '/settings', label: 'Persona & AI Model', icon: UserCheck, code: '04' },
        { href: '/documents', label: 'Document Vault (RAG)', icon: FileText, code: '05' },
        { href: '/vault', label: 'Media Vault', icon: ImageIcon, code: '06' },
        { href: '/download', label: 'Desktop App', icon: Download, code: '07' },
        ...(isSuperadmin ? [{ href: '/admin', label: 'Superadmin', icon: Shield, code: '08' }] : [])
      ];

  const displayName = isPureSuperadmin
    ? 'Platform Superadmin'
    : (user?.firstName
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : (user?.username || 'User'));

  const displayHandle = isPureSuperadmin
    ? (user?.email || 'admin@platform')
    : (user?.instagramUsername || user?.username || 'user');

  // Mobile: bottom tabs cover the top routes; the sheet exposes every route
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const { theme, toggleTheme } = useTheme();

  const mobileTabs = isPureSuperadmin
    ? [
      { href: '/', label: 'Platform', icon: LayoutDashboard },
      { href: '/admin', label: 'Workspaces', icon: Users },
      { href: '/admin/tokens', label: 'Tokens', icon: Activity },
      { label: 'More', icon: LayoutGrid },
    ]
    : [
      { href: '/', label: 'Home', icon: LayoutDashboard },
      { href: '/relationships', label: isBusiness ? 'Inbox' : 'People', icon: isBusiness ? Inbox : Users },
      { action: 'add' },
      { href: '/controls', label: isBusiness ? 'Policy' : 'Rules', icon: Sliders },
      { label: 'More', icon: LayoutGrid },
    ];

  const sheetItems = [
    ...navItems,
    { href: '/profile', label: 'Profile & Passkeys', icon: Fingerprint },
    ...(isSuperadmin && !navItems.some(i => i.href === '/admin/tokens')
      ? [{ href: '/admin/tokens', label: 'Token Health Radar', icon: Activity }]
      : []),
  ];

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          MOBILE STICKY TOP HEADER (screens <= 768px, PLAN.md §15.5.2)
          ═══════════════════════════════════════════════════════════ */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mobile-header"
      >
        <Link href="/" className="mobile-brand" aria-label="Dashboard">
          <span className="mobile-brand-mark">C</span>
          <span className="mobile-brand-text">CHATTER OS</span>
        </Link>

        <div className="mobile-header-actions">
          {isPureSuperadmin ? (
            <span className="mobile-workspace-chip">
              <span className="sheet-dot on" />
              ADMIN
            </span>
          ) : (
            <button
              type="button"
              onClick={toggleGlobalBot}
              className="mobile-workspace-chip"
              aria-label={routingConfig.globalBotActive ? 'Pause automation' : 'Resume automation'}
            >
              <span className={`sheet-dot${routingConfig.globalBotActive ? ' on' : ''}`} />
              {isBusiness ? 'BUSINESS' : 'PERSONAL'}
            </button>
          )}

          <button type="button" onClick={toggleTheme} className="mobile-icon-btn" aria-label="Toggle light or dark theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <button type="button" onClick={() => setSheetOpen(true)} className="mobile-icon-btn" aria-label="Open all features">
            <span className="mobile-avatar">
              {user?.profilePicUrl
                ? <img src={user.profilePicUrl} alt="" />
                : displayName.charAt(0).toUpperCase()}
            </span>
          </button>
        </div>
      </motion.header>

      {/* ═══════════════════════════════════════════════════════════
          MOBILE STICKY BOTTOM TAB BAR (screens <= 768px)
          ═══════════════════════════════════════════════════════════ */}
      <motion.nav
        variants={mobileTabsContainer}
        initial="hidden"
        animate="visible"
        className="mobile-bottom-tabs"
      >
        {mobileTabs.map(tab => {
          if (tab.action === 'add') {
            return (
              <motion.div key="add" variants={mobileTabVariant} className="mobile-tab-slot">
                <button type="button" onClick={() => startAiInterview(null)} className="mobile-add-btn" aria-label="Add Person">
                  <Plus size={22} strokeWidth={2.5} />
                </button>
              </motion.div>
            );
          }
          const Icon = tab.icon;
          const isActive = tab.href ? pathname === tab.href : sheetOpen;
          const content = (
            <>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              <span>{tab.label}</span>
            </>
          );
          return (
            <motion.div key={tab.label} variants={mobileTabVariant} className="mobile-tab-slot">
              {tab.href ? (
                <Link href={tab.href} className={`mobile-tab${isActive ? ' active' : ''}`}>{content}</Link>
              ) : (
                <button type="button" onClick={() => setSheetOpen(true)} className={`mobile-tab${isActive ? ' active' : ''}`}>{content}</button>
              )}
            </motion.div>
          );
        })}
      </motion.nav>

      <MobileFeatureSheet open={sheetOpen} onClose={closeSheet} items={sheetItems} />

      {/* ═══════════════════════════════════════════════════════════
          DESKTOP FLOATING SIDEBAR (screens > 768px)
          ═══════════════════════════════════════════════════════════ */}
      <motion.aside
        initial={{ opacity: 0, x: -14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="floating-sidebar"
      >
        <div>
          {/* Brand Header */}
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--color-border)'
            }}
          >
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'var(--color-text-primary)',
                color: 'var(--color-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '800',
                fontSize: '1rem',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)'
              }}>
                C
              </div>
              <div>
                <div style={{ fontWeight: '800', fontSize: '0.92rem', letterSpacing: '-0.4px', color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
                  CHATTER OS
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace" }}>
                  v2.6 // WORKSPACE
                </div>
              </div>
            </Link>

            {/* Live Bot Pulse Dot */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: routingConfig.globalBotActive ? 'color-mix(in srgb, #22c55e 12%, transparent)' : 'var(--color-surface-hover)',
                border: routingConfig.globalBotActive ? '1px solid color-mix(in srgb, #22c55e 35%, transparent)' : '1px solid var(--color-border)',
                borderRadius: '999px',
                padding: '3px 8px',
                cursor: 'pointer'
              }}
              onClick={toggleGlobalBot}
              title={routingConfig.globalBotActive ? 'Bot is Active. Click to pause.' : 'Bot is Paused. Click to resume.'}
            >
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: routingConfig.globalBotActive ? '#16a34a' : 'var(--color-text-muted)'
              }} />
              <span style={{
                fontSize: '0.62rem',
                fontWeight: '700',
                fontFamily: "'JetBrains Mono', monospace",
                color: routingConfig.globalBotActive ? '#4ade80' : 'var(--color-text-secondary)'
              }}>
                {routingConfig.globalBotActive ? 'LIVE' : 'OFF'}
              </span>
            </div>
          </motion.div>

          {/* Navigation Section */}
          <div style={{ marginTop: '20px' }}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, delay: 0.1 }}
              style={{
                fontSize: '0.68rem',
                fontWeight: '700',
                color: 'var(--color-text-muted)',
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                marginBottom: '8px',
                paddingLeft: '6px'
              }}
            >
              Workspace
            </motion.div>

            {/* STAGGERED FADE-IN NAVIGATION ITEMS */}
            <motion.nav
              variants={navContainerVariants}
              initial="hidden"
              animate="visible"
              style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <motion.div key={item.href} variants={navItemVariants}>
                    <Link
                      href={item.href}
                      style={{
                        background: isActive ? 'var(--color-text-primary)' : 'transparent',
                        color: isActive ? 'var(--color-surface)' : 'var(--color-text-secondary)',
                        border: '1px solid',
                        borderColor: isActive ? 'var(--color-text-primary)' : 'transparent',
                        borderRadius: '9px',
                        padding: '9px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        textDecoration: 'none',
                        transition: 'all 0.15s ease',
                        fontWeight: isActive ? '700' : '500',
                        fontSize: '0.82rem',
                        boxShadow: isActive ? '0 3px 10px rgba(9, 9, 11, 0.1)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
                        <span>{item.label}</span>
                      </div>
                      <span style={{
                        fontSize: '0.65rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        opacity: isActive ? 0.8 : 0.4
                      }}>
                        [{item.code}]
                      </span>
                    </Link>
                  </motion.div>
                );
              })}
            </motion.nav>
          </div>
        </div>

        {/* Footer Actions & Profile Card with Staggered Fade-in */}
        <motion.div
          variants={footerContainerVariants}
          initial="hidden"
          animate="visible"
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}
        >
          {/* Automate Button: ONLY show if Instagram is NOT linked */}
          {!isPureSuperadmin && !isInstagramLinked && (
            <motion.button
              variants={footerItemVariants}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={openOnboardingWizard}
              style={{
                width: '100%',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                border: '1.5px solid var(--color-text-primary)',
                padding: '9px 12px',
                borderRadius: '9px',
                fontWeight: '700',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
            >
              <span>Automate</span>
            </motion.button>
          )}

          {/* Quick Add Person Action (For regular user relationships) */}
          {!isPureSuperadmin && (
            <motion.button
              variants={footerItemVariants}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => startAiInterview(null)}
              style={{
                width: '100%',
                background: 'var(--color-text-primary)',
                color: 'var(--color-surface)',
                border: 'none',
                padding: '10px 14px',
                borderRadius: '9px',
                fontWeight: '700',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                cursor: 'pointer',
                boxShadow: '0 3px 10px rgba(9, 9, 11, 0.1)'
              }}
            >
              <Sparkles size={14} color="var(--color-surface)" />
              <span>+ Add Person</span>
            </motion.button>
          )}

          {/* Bot State Switcher Button (Only for creator account or impersonating workspace) */}
          {!isPureSuperadmin && (
            <motion.button
              variants={footerItemVariants}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={toggleGlobalBot}
              style={{
                width: '100%',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)',
                padding: '8px 12px',
                borderRadius: '9px',
                fontWeight: '600',
                fontSize: '0.76rem',
                fontFamily: "'JetBrains Mono', monospace",
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {routingConfig.globalBotActive ? (
                <>
                  <Pause size={12} />
                  <span>PAUSE AUTOMATION</span>
                </>
              ) : (
                <>
                  <Play size={12} />
                  <span>RESUME AUTOMATION</span>
                </>
              )}
            </motion.button>
          )}

          {/* UPGRADED MODERN PROFILE CARD */}
          <motion.div
            variants={footerItemVariants}
            style={{
              marginTop: '6px',
              padding: '10px 12px',
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              transition: 'all 0.15s ease'
            }}
          >
            <Link
              href="/profile"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                minWidth: 0,
                textDecoration: 'none',
                color: 'inherit'
              }}
              title="Click to view profile & security settings"
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {isPureSuperadmin ? (
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    background: 'var(--color-text-primary)',
                    border: '1.5px solid var(--color-text-secondary)',
                    color: 'var(--color-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                  }}>
                    <Shield size={17} color="#22c55e" strokeWidth={2.2} />
                  </div>
                ) : user?.profilePicUrl ? (
                  <img
                    src={user.profilePicUrl}
                    alt=""
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '9px',
                      objectFit: 'cover',
                      border: '1.5px solid var(--color-text-primary)',
                      display: 'block'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    background: 'var(--color-text-primary)',
                    color: 'var(--color-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.88rem',
                    fontWeight: '800'
                  }}>
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                {/* Online Indicator */}
                <span style={{
                  position: 'absolute',
                  right: '-2px',
                  bottom: '-2px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#16a34a',
                  border: '1.5px solid var(--color-surface)'
                }} />
              </div>

              <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    color: 'var(--color-text-primary)',
                    lineHeight: 1.25,
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden'
                  }}>
                    {displayName}
                  </span>
                  {isPureSuperadmin ? (
                    <span style={{
                      fontSize: '0.58rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: '800',
                      background: 'var(--color-text-primary)',
                      color: '#22c55e',
                      border: '1px solid var(--color-text-secondary)',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      flexShrink: 0
                    }}>
                      SUPERADMIN
                    </span>
                  ) : isImpersonating ? (
                    <span style={{
                      fontSize: '0.58rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: '800',
                      background: 'color-mix(in srgb, #f59e0b 35%, transparent)',
                      color: '#fbbf24',
                      border: '1px solid #fde047',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      flexShrink: 0
                    }}>
                      WORKSPACE
                    </span>
                  ) : isSuperadmin ? (
                    <span style={{
                      fontSize: '0.58rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: '800',
                      background: 'var(--color-text-primary)',
                      color: 'var(--color-surface)',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      flexShrink: 0
                    }}>
                      ADMIN
                    </span>
                  ) : null}
                </div>
                <div style={{
                  fontSize: '0.7rem',
                  color: 'var(--color-text-secondary)',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden'
                }}>
                  {isPureSuperadmin ? displayHandle : `@${displayHandle}`}
                </div>
              </div>

              <ChevronRight size={14} color="var(--color-text-muted)" />
            </Link>

            {/* Impersonation Exit Quick Action */}
            {isImpersonating && (
              <button
                type="button"
                onClick={exitWorkspace}
                style={{
                  width: '100%',
                  background: 'var(--color-text-primary)',
                  color: 'var(--color-surface)',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '6px 8px',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  cursor: 'pointer'
                }}
              >
                <ArrowLeftRight size={12} />
                <span>Exit to Superadmin Console</span>
              </button>
            )}

            {/* Profile Action Row */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <Link
                href="/profile"
                style={{
                  flex: 1,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '7px',
                  padding: '6px 8px',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  color: 'var(--color-text-primary)',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px'
                }}
              >
                <Fingerprint size={13} />
                <span>Profile &amp; Security</span>
              </Link>

              <button
                type="button"
                onClick={switchAccount}
                title="Switch account"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '7px',
                  padding: '6px 9px',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  color: 'var(--color-text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  cursor: 'pointer'
                }}
              >
                <ArrowLeftRight size={12} />
                <span>Switch</span>
              </button>

              <button
                type="button"
                onClick={logout}
                title="Sign out of workspace"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '7px',
                  padding: '6px 9px',
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <LogOut size={13} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      </motion.aside>
    </>
  );
}
