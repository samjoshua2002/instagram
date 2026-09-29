'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard, Users, Sliders, MessageSquare,
  Sparkles, Terminal, Menu, X, Play, Pause, Bot
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const { routingConfig, toggleGlobalBot, startAiInterview } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: '/', label: 'Analytics Dashboard', icon: LayoutDashboard, code: '01' },
    { href: '/relationships', label: 'People Directory', icon: Users, code: '02' },
    { href: '/controls', label: 'Chat Control Rules', icon: Sliders, code: '03' },
    { href: '/simulator', label: 'DM Simulator', icon: MessageSquare, code: '04' }
  ];

  const activeModeCount = routingConfig.chatMode === 'everyone_except'
    ? (routingConfig.excludedContactIds || []).length
    : (routingConfig.chatMode === 'only_selected' ? (routingConfig.includedContactIds || []).length : 0);

  return (
    <>
      {/* Mobile Top Header (screens < 768px) */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#09090b', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={16} />
          </div>
          <span style={{ fontWeight: '800', fontSize: '0.9rem', color: '#09090b', letterSpacing: '-0.3px' }}>
            CHATTER_OS
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => startAiInterview(null)}
            style={{ background: '#09090b', color: '#ffffff', border: 'none', padding: '6px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Sparkles size={12} />
            <span>+ Add</span>
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ background: '#ffffff', border: '1px solid #e4e4e7', color: '#09090b', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* Floating Light Desktop Sidebar */}
      <aside className={`floating-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        {/* Brand / Header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid #e4e4e7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#09090b', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bot size={18} />
              </div>
              <div>
                <div style={{ fontWeight: '800', fontSize: '0.9rem', letterSpacing: '-0.3px', color: '#09090b' }}>
                  CHATTER_OS
                </div>
                <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                  v2.6 // SAM JOSHUA
                </div>
              </div>
            </div>

            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: routingConfig.globalBotActive ? '#09090b' : '#a1a1aa',
                boxShadow: routingConfig.globalBotActive ? '0 0 0 2px #e4e4e7' : 'none'
              }}
              title={routingConfig.globalBotActive ? 'Bot Active' : 'Bot Paused'}
            />
          </div>

          {/* Status Chip */}
          <div style={{ marginTop: '14px', background: '#f4f4f5', border: '1px solid #e4e4e7', borderRadius: '8px', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
              <Terminal size={12} style={{ color: '#09090b', flexShrink: 0 }} />
              <span style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                MODE: {routingConfig.chatMode.toUpperCase()}
              </span>
            </div>
            <span style={{ fontSize: '0.65rem', background: '#ffffff', border: '1px solid #e4e4e7', color: '#09090b', padding: '1px 6px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, fontWeight: '700' }}>
              {activeModeCount}
            </span>
          </div>

          {/* Navigation Items */}
          <nav style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    background: isActive ? '#09090b' : 'transparent',
                    color: isActive ? '#ffffff' : '#71717a',
                    border: '1px solid',
                    borderColor: isActive ? '#09090b' : 'transparent',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                    fontWeight: isActive ? '700' : '500',
                    fontSize: '0.82rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </div>
                  <span style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", opacity: isActive ? 0.8 : 0.4 }}>
                    [{item.code}]
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer in Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '14px', borderTop: '1px solid #e4e4e7' }}>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              startAiInterview(null);
            }}
            style={{
              background: '#09090b',
              color: '#ffffff',
              border: 'none',
              padding: '10px',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Sparkles size={14} />
            <span>+ Add Person</span>
          </button>

          <button
            onClick={toggleGlobalBot}
            style={{
              background: '#ffffff',
              border: '1px solid #e4e4e7',
              color: '#09090b',
              padding: '8px',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.75rem',
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
                <span>PAUSE BOT</span>
              </>
            ) : (
              <>
                <Play size={12} />
                <span>RESUME BOT</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <style jsx>{`
        .mobile-header {
          display: none;
        }

        .floating-sidebar {
          position: fixed;
          top: 16px;
          left: 16px;
          bottom: 16px;
          width: 250px;
          background: #ffffff;
          border: 1px solid #e4e4e7;
          border-radius: 12px;
          padding: 18px 14px;
          display: flex;
          flex-direction: column;
          justifyContent: space-between;
          z-index: 50;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
        }

        @media (max-width: 768px) {
          .mobile-header {
            display: flex;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 56px;
            background: #ffffff;
            border-bottom: 1px solid #e4e4e7;
            align-items: center;
            justifyContent: space-between;
            padding: 0 16px;
            z-index: 60;
          }

          .floating-sidebar {
            top: 56px;
            left: 0;
            bottom: 0;
            width: 100%;
            border-radius: 0;
            border-left: none;
            border-right: none;
            border-bottom: none;
            transform: translateY(-100%);
            opacity: 0;
            pointer-events: none;
            transition: all 0.25s ease;
          }

          .floating-sidebar.mobile-open {
            transform: translateY(0);
            opacity: 1;
            pointer-events: auto;
          }
        }
      `}</style>
    </>
  );
}
