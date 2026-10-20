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
  Plus
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const { routingConfig, toggleGlobalBot, startAiInterview, user, logout, setIsPasskeyModalOpen } = useApp();

  const navItems = [
    { href: '/', label: 'Analytics', icon: LayoutDashboard, code: '01' },
    { href: '/relationships', label: 'People Directory', icon: Users, code: '02' },
    { href: '/controls', label: 'Chat Rules', icon: Sliders, code: '03' },
    { href: '/settings', label: 'Persona & Style', icon: UserCheck, code: '04' },
    { href: '/vault', label: 'Media Vault', icon: ImageIcon, code: '05' },
  ];

  const activeModeCount = routingConfig.chatMode === 'everyone_except'
    ? (routingConfig.excludedContactIds || []).length
    : (routingConfig.chatMode === 'only_selected' ? (routingConfig.includedContactIds || []).length : 0);

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName || ''}`.trim()
    : (user?.username || 'Sam Joshua');

  const displayHandle = user?.instagramUsername || user?.username || 'catovidz';

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════
          MOBILE TOP HEADER (screens <= 768px)
          ═══════════════════════════════════════════════════════════ */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '30px',
            height: '30px',
            borderRadius: '8px',
            background: '#09090b',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '800',
            fontSize: '0.85rem'
          }}>
            C
          </div>
          <span style={{ fontWeight: '800', fontSize: '0.88rem', color: '#09090b', letterSpacing: '-0.3px' }}>
            CHATTER OS
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Bot status chip */}
          <button
            type="button"
            onClick={toggleGlobalBot}
            style={{
              background: '#f4f4f5',
              border: '1px solid #e4e4e7',
              borderRadius: '999px',
              padding: '4px 10px',
              fontSize: '0.7rem',
              fontWeight: '700',
              fontFamily: "'JetBrains Mono', monospace",
              color: routingConfig.globalBotActive ? '#09090b' : '#71717a',
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
              background: routingConfig.globalBotActive ? '#16a34a' : '#a1a1aa'
            }} />
            <span>{routingConfig.globalBotActive ? 'BOT ACTIVE' : 'PAUSED'}</span>
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            style={{
              background: 'none',
              border: 'none',
              color: '#71717a',
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
      </header>

      {/* ═══════════════════════════════════════════════════════════
          MOBILE BOTTOM NAVIGATION TABS (screens <= 768px)
          ═══════════════════════════════════════════════════════════ */}
      <nav className="mobile-bottom-tabs">
        {/* Tab 1: Dashboard */}
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
            color: pathname === '/' ? '#09090b' : '#a1a1aa',
            transition: 'all 0.15s ease',
            padding: '6px 0'
          }}
        >
          <LayoutDashboard size={19} strokeWidth={pathname === '/' ? 2.5 : 1.8} />
          <span style={{ fontSize: '0.66rem', fontWeight: pathname === '/' ? '700' : '500' }}>Dashboard</span>
        </Link>

        {/* Tab 2: People Directory */}
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
            color: pathname === '/relationships' ? '#09090b' : '#a1a1aa',
            transition: 'all 0.15s ease',
            padding: '6px 0'
          }}
        >
          <Users size={19} strokeWidth={pathname === '/relationships' ? 2.5 : 1.8} />
          <span style={{ fontSize: '0.66rem', fontWeight: pathname === '/relationships' ? '700' : '500' }}>People</span>
        </Link>

        {/* Center Quick Action (+ Add Person) */}
        <button
          type="button"
          onClick={() => startAiInterview(null)}
          title="Add Person"
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: '#09090b',
            color: '#ffffff',
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

        {/* Tab 4: Rules */}
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
            color: pathname === '/controls' ? '#09090b' : '#a1a1aa',
            transition: 'all 0.15s ease',
            padding: '6px 0'
          }}
        >
          <Sliders size={19} strokeWidth={pathname === '/controls' ? 2.5 : 1.8} />
          <span style={{ fontSize: '0.66rem', fontWeight: pathname === '/controls' ? '700' : '500' }}>Rules</span>
        </Link>

        {/* Tab 5: Profile & Security Modal */}
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
            color: '#a1a1aa',
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
                border: '1.5px solid #09090b'
              }}
            />
          ) : (
            <UserCheck size={19} strokeWidth={1.8} color="#09090b" />
          )}
          <span style={{ fontSize: '0.66rem', fontWeight: '600', color: '#09090b' }}>Profile</span>
        </button>
      </nav>

      {/* ═══════════════════════════════════════════════════════════
          DESKTOP FLOATING SIDEBAR (screens > 768px)
          ═══════════════════════════════════════════════════════════ */}
      <aside className="floating-sidebar">
        <div>
          {/* Brand Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '16px',
            borderBottom: '1px solid #e4e4e7'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#09090b',
                color: '#ffffff',
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
                <div style={{ fontWeight: '800', fontSize: '0.92rem', letterSpacing: '-0.4px', color: '#09090b', lineHeight: 1.2 }}>
                  CHATTER OS
                </div>
                <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                  v2.6 // WORKSPACE
                </div>
              </div>
            </div>

            {/* Live Bot Pulse Dot */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: routingConfig.globalBotActive ? '#f0fdf4' : '#f4f4f5',
                border: routingConfig.globalBotActive ? '1px solid #bbf7d0' : '1px solid #e4e4e7',
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
                background: routingConfig.globalBotActive ? '#16a34a' : '#a1a1aa'
              }} />
              <span style={{
                fontSize: '0.62rem',
                fontWeight: '700',
                fontFamily: "'JetBrains Mono', monospace",
                color: routingConfig.globalBotActive ? '#15803d' : '#71717a'
              }}>
                {routingConfig.globalBotActive ? 'LIVE' : 'OFF'}
              </span>
            </div>
          </div>

          {/* Navigation Section */}
          <div style={{ marginTop: '20px' }}>
            <div style={{
              fontSize: '0.68rem',
              fontWeight: '700',
              color: '#a1a1aa',
              letterSpacing: '0.8px',
              textTransform: 'uppercase',
              marginBottom: '8px',
              paddingLeft: '6px'
            }}>
              Workspace
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      background: isActive ? '#09090b' : 'transparent',
                      color: isActive ? '#ffffff' : '#52525b',
                      border: '1px solid',
                      borderColor: isActive ? '#09090b' : 'transparent',
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
                );
              })}
            </nav>
          </div>
        </div>

        {/* Footer Actions & Profile Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '16px', borderTop: '1px solid #e4e4e7' }}>
          {/* Quick Add Person Action */}
          <button
            type="button"
            onClick={() => startAiInterview(null)}
            style={{
              width: '100%',
              background: '#09090b',
              color: '#ffffff',
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
            <Sparkles size={14} color="#ffffff" />
            <span>+ Add Person</span>
          </button>

          {/* Bot State Switcher Button */}
          <button
            type="button"
            onClick={toggleGlobalBot}
            style={{
              width: '100%',
              background: '#ffffff',
              border: '1px solid #e4e4e7',
              color: '#09090b',
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
          </button>

          {/* UPGRADED MODERN PROFILE CARD */}
          <div style={{
            marginTop: '6px',
            padding: '10px 12px',
            background: '#fafafa',
            border: '1px solid #e4e4e7',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            transition: 'all 0.15s ease'
          }}>
            <div
              onClick={() => setIsPasskeyModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                minWidth: 0
              }}
              title="Click to edit profile & security"
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {user?.profilePicUrl ? (
                  <img
                    src={user.profilePicUrl}
                    alt=""
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '9px',
                      objectFit: 'cover',
                      border: '1.5px solid #09090b',
                      display: 'block'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    background: '#09090b',
                    color: '#ffffff',
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
                  border: '1.5px solid #ffffff'
                }} />
              </div>

              <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <div style={{
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  color: '#09090b',
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden'
                }}>
                  {displayName}
                </div>
                <div style={{
                  fontSize: '0.7rem',
                  color: '#71717a',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden'
                }}>
                  @{displayHandle}
                </div>
              </div>

              <ChevronRight size={14} color="#a1a1aa" />
            </div>

            {/* Profile Action Row */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => setIsPasskeyModalOpen(true)}
                style={{
                  flex: 1,
                  background: '#ffffff',
                  border: '1px solid #e4e4e7',
                  borderRadius: '7px',
                  padding: '6px 8px',
                  fontSize: '0.72rem',
                  fontWeight: '600',
                  color: '#09090b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  cursor: 'pointer'
                }}
              >
                <Fingerprint size={13} />
                <span>Passkeys & 2FA</span>
              </button>

              <button
                type="button"
                onClick={logout}
                title="Sign out of workspace"
                style={{
                  background: '#ffffff',
                  border: '1px solid #e4e4e7',
                  borderRadius: '7px',
                  padding: '6px 9px',
                  color: '#71717a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
