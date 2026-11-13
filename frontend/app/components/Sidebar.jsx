'use client';

import React from 'react';
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
  Zap
} from 'lucide-react';
import { motion } from 'framer-motion';

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
    (user?.instagramPageAccessToken && user.instagramPageAccessToken.length > 5)
  );

  const navItems = isPureSuperadmin
    ? [
        { href: '/', label: 'Platform Console', icon: LayoutDashboard, code: '01' },
        { href: '/admin', label: 'User Workspaces', icon: Users, code: '02' },
      ]
    : [
        { href: '/', label: 'Dashboard', icon: LayoutDashboard, code: '01' },
        { href: '/relationships', label: 'People Directory', icon: Users, code: '02' },
        { href: '/controls', label: 'Chat Rules', icon: Sliders, code: '03' },
        { href: '/settings', label: 'Persona & Style', icon: UserCheck, code: '04' },
        { href: '/vault', label: 'Media Vault', icon: ImageIcon, code: '05' },
        ...(isSuperadmin ? [{ href: '/admin', label: 'Superadmin', icon: Shield, code: '06' }] : [])
      ];

  const displayName = isPureSuperadmin
    ? 'Platform Superadmin'
    : (user?.firstName
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : (user?.username || 'User'));

  const displayHandle = isPureSuperadmin
    ? (user?.email || 'admin@platform')
    : (user?.instagramUsername || user?.username || 'user');

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          MOBILE TOP HEADER (screens <= 768px)
          ═══════════════════════════════════════════════════════════ */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mobile-header"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            background: 'var(--primary)',
            color: 'var(--primary-fg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '800',
            fontSize: '0.85rem'
          }}>
            C
          </div>
          <span style={{ fontWeight: '800', fontSize: '0.88rem', color: 'var(--text)', letterSpacing: '-0.3px' }}>
            CHATTER OS
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Bot status chip */}
          {!isPureSuperadmin ? (
            <button
              type="button"
              onClick={toggleGlobalBot}
              style={{
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: '999px',
                padding: '4px 10px',
                fontSize: '0.7rem',
                fontWeight: '700',
                fontFamily: "'JetBrains Mono', monospace",
                color: routingConfig.globalBotActive ? 'var(--text)' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
            >
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: routingConfig.globalBotActive ? 'var(--success)' : 'var(--text-dim)'
              }} />
              <span>{routingConfig.globalBotActive ? 'BOT ACTIVE' : 'PAUSED'}</span>
            </button>
          ) : (
            <div
              style={{
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: '999px',
                padding: '4px 10px',
                fontSize: '0.7rem',
                fontWeight: '700',
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--success)'
              }} />
              <span>SUPERADMIN LIVE</span>
            </div>
          )}

          {/* Logout */}
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </motion.header>

      {/* ═══════════════════════════════════════════════════════════
          MOBILE BOTTOM NAVIGATION TABS (screens <= 768px)
          ═══════════════════════════════════════════════════════════ */}
      <motion.nav
        variants={mobileTabsContainer}
        initial="hidden"
        animate="visible"
        className="mobile-bottom-tabs"
      >
        {isPureSuperadmin ? (
          <>
            {/* Tab 1: Platform Console */}
            <motion.div variants={mobileTabVariant} style={{ flex: 1, display: 'flex' }}>
              <Link
                href="/"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                  textDecoration: 'none',
                  color: pathname === '/' ? 'var(--text)' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                  padding: '6px 0'
                }}
              >
                <LayoutDashboard size={19} strokeWidth={pathname === '/' ? 2.5 : 1.8} />
                <span style={{ fontSize: '0.66rem', fontWeight: pathname === '/' ? '700' : '500' }}>Platform</span>
              </Link>
            </motion.div>

            {/* Tab 2: Workspaces Directory */}
            <motion.div variants={mobileTabVariant} style={{ flex: 1, display: 'flex' }}>
              <Link
                href="/admin"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                  textDecoration: 'none',
                  color: pathname === '/admin' ? 'var(--text)' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                  padding: '6px 0'
                }}
              >
                <Users size={19} strokeWidth={pathname === '/admin' ? 2.5 : 1.8} />
                <span style={{ fontSize: '0.66rem', fontWeight: pathname === '/admin' ? '700' : '500' }}>Workspaces</span>
              </Link>
            </motion.div>

            {/* Tab 3: Security & Passkeys */}
            <motion.div variants={mobileTabVariant} style={{ flex: 1, display: 'flex' }}>
              <button
                type="button"
                onClick={() => setIsPasskeyModalOpen(true)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text)',
                  padding: '6px 0'
                }}
              >
                <Shield size={19} strokeWidth={2.2} color="#15803d" />
                <span style={{ fontSize: '0.66rem', fontWeight: '700', color: 'var(--text)' }}>Security</span>
              </button>
            </motion.div>
          </>
        ) : (
          <>
            {/* Tab 1: Dashboard (Default view) */}
            <motion.div variants={mobileTabVariant} style={{ flex: 1, display: 'flex' }}>
              <Link
                href="/"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                  textDecoration: 'none',
                  color: pathname === '/' ? 'var(--text)' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                  padding: '6px 0'
                }}
              >
                <LayoutDashboard size={19} strokeWidth={pathname === '/' ? 2.5 : 1.8} />
                <span style={{ fontSize: '0.66rem', fontWeight: pathname === '/' ? '700' : '500' }}>Dashboard</span>
              </Link>
            </motion.div>

            {/* Tab 2: People Directory */}
            <motion.div variants={mobileTabVariant} style={{ flex: 1, display: 'flex' }}>
              <Link
                href="/relationships"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                  textDecoration: 'none',
                  color: pathname === '/relationships' ? 'var(--text)' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                  padding: '6px 0'
                }}
              >
                <Users size={19} strokeWidth={pathname === '/relationships' ? 2.5 : 1.8} />
                <span style={{ fontSize: '0.66rem', fontWeight: pathname === '/relationships' ? '700' : '500' }}>People</span>
              </Link>
            </motion.div>

            {/* Center Quick Action (+ Add Person) */}
            <motion.div variants={mobileTabVariant} style={{ display: 'flex', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => startAiInterview(null)}
                title="Add Person"
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  color: 'var(--primary-fg)',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(9, 9, 11, 0.25)',
                  cursor: 'pointer',
                  margin: '0 4px',
                  flexShrink: 0,
                  transform: 'translateY(-4px)',
                  transition: 'transform 0.15s ease'
                }}
              >
                <Plus size={22} strokeWidth={2.5} />
              </button>
            </motion.div>

            {/* Tab 4: Rules */}
            <motion.div variants={mobileTabVariant} style={{ flex: 1, display: 'flex' }}>
              <Link
                href="/controls"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                  textDecoration: 'none',
                  color: pathname === '/controls' ? 'var(--text)' : 'var(--text-muted)',
                  transition: 'all 0.15s ease',
                  padding: '6px 0'
                }}
              >
                <Sliders size={19} strokeWidth={pathname === '/controls' ? 2.5 : 1.8} />
                <span style={{ fontSize: '0.66rem', fontWeight: pathname === '/controls' ? '700' : '500' }}>Rules</span>
              </Link>
            </motion.div>

            {/* Tab 5: Profile & Security */}
            <motion.div variants={mobileTabVariant} style={{ flex: 1, display: 'flex' }}>
              <Link
                href="/profile"
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '3px',
                  textDecoration: 'none',
                  color: pathname === '/profile' ? 'var(--text)' : 'var(--text-muted)',
                  padding: '6px 0'
                }}
              >
                {user?.profilePicUrl ? (
                  <img
                    src={user.profilePicUrl}
                    alt=""
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '1.5px solid var(--primary)'
                    }}
                  />
                ) : (
                  <UserCheck size={19} strokeWidth={pathname === '/profile' ? 2.5 : 1.8} color={pathname === '/profile' ? '#09090b' : '#71717a'} />
                )}
                <span style={{ fontSize: '0.66rem', fontWeight: pathname === '/profile' ? '700' : '600', color: pathname === '/profile' ? 'var(--text)' : 'var(--text-muted)' }}>Profile</span>
              </Link>
            </motion.div>
          </>
        )}
      </motion.nav>

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
              borderBottom: '1px solid var(--border)'
            }}
          >
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--r-lg)',
                background: 'var(--primary)',
                color: 'var(--primary-fg)',
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
                <div style={{ fontWeight: '800', fontSize: '0.92rem', letterSpacing: '-0.4px', color: 'var(--text)', lineHeight: 1.2 }}>
                  CHATTER OS
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
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
                background: routingConfig.globalBotActive ? 'var(--success-bg)' : 'var(--bg-hover)',
                border: routingConfig.globalBotActive ? '1px solid var(--success-border)' : '1px solid var(--border)',
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
                background: routingConfig.globalBotActive ? 'var(--success)' : 'var(--text-dim)'
              }} />
              <span style={{
                fontSize: '0.62rem',
                fontWeight: '700',
                fontFamily: "'JetBrains Mono', monospace",
                color: routingConfig.globalBotActive ? 'var(--success)' : 'var(--text-muted)'
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
                color: 'var(--text-muted)',
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
                        background: isActive ? 'var(--primary)' : 'transparent',
                        color: isActive ? 'var(--primary-fg)' : '#52525b',
                        border: '1px solid',
                        borderColor: isActive ? 'var(--primary)' : 'transparent',
                        borderRadius: 'var(--r-md)',
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
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}
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
                background: 'var(--bg)',
                color: 'var(--text)',
                border: '1.5px solid var(--primary)',
                padding: '9px 12px',
                borderRadius: 'var(--r-md)',
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
                background: 'var(--primary)',
                color: 'var(--primary-fg)',
                border: 'none',
                padding: '10px 14px',
                borderRadius: 'var(--r-md)',
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
              <Sparkles size={14} color="#ffffff" />
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
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                padding: '8px 12px',
                borderRadius: 'var(--r-md)',
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
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
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
                    borderRadius: 'var(--r-md)',
                    background: 'var(--primary)',
                    border: '1.5px solid #27272a',
                    color: 'var(--primary-fg)',
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
                      borderRadius: 'var(--r-md)',
                      objectFit: 'cover',
                      border: '1.5px solid var(--primary)',
                      display: 'block'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--primary)',
                    color: 'var(--primary-fg)',
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
                  background: 'var(--success)',
                  border: '1.5px solid var(--bg)'
                }} />
              </div>

              <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    color: 'var(--text)',
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
                      background: 'var(--primary)',
                      color: '#22c55e',
                      border: '1px solid #27272a',
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
                      background: 'var(--warning-bg)',
                      color: 'var(--warning)',
                      border: '1px solid var(--warning-border)',
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
                      background: 'var(--primary)',
                      color: 'var(--primary-fg)',
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
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden'
                }}>
                  {isPureSuperadmin ? displayHandle : `@${displayHandle}`}
                </div>
              </div>

              <ChevronRight size={14} color="#71717a" />
            </Link>

            {/* Impersonation Exit Quick Action */}
            {isImpersonating && (
              <button
                type="button"
                onClick={exitWorkspace}
                style={{
                  width: '100%',
                  background: 'var(--primary)',
                  color: 'var(--primary-fg)',
                  border: 'none',
                  borderRadius: 'var(--r-md)',
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
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  padding: '6px 8px',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  color: 'var(--text)',
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
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  padding: '6px 9px',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  color: 'var(--text)',
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
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  padding: '6px 9px',
                  color: 'var(--text-muted)',
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
