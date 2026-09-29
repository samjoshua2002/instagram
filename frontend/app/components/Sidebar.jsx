'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard, Users, Brain, Sliders, MessageSquare,
  Sparkles, Terminal, Menu, X, Play, Pause
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const { routingConfig, toggleGlobalBot, startAiInterview, nodes } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: '/', label: 'Analytics Dashboard', icon: LayoutDashboard, code: '01' },
    { href: '/relationships', label: 'Relationship Menu', icon: Users, code: '02' },
    { href: '/memories', label: 'Learned Memories', icon: Brain, code: '03' },
    { href: '/controls', label: 'Chat Control Rules', icon: Sliders, code: '04' },
    { href: '/simulator', label: 'DM Simulator', icon: MessageSquare, code: '05' }
  ];

  const activeModeCount = routingConfig.chatMode === 'everyone_except'
    ? (routingConfig.excludedContactIds || []).length
    : (routingConfig.chatMode === 'only_selected' ? (routingConfig.includedContactIds || []).length : 0);

  return (
    <>
      {/* Mobile Top Header (only on screens < 768px) */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#ffffff', color: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '0.85rem' }}>
            ⚡
          </div>
          <span style={{ fontWeight: '800', fontSize: '0.9rem', color: '#ffffff', letterSpacing: '-0.3px' }}>
            CHATTER<span style={{ color: '#10b981' }}>_OS</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => startAiInterview(null)}
            style={{ background: '#ffffff', color: '#000000', border: 'none', padding: '6px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Sparkles size={12} />
            <span>+ Add</span>
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ background: '#18181b', border: '1px solid #27272a', color: '#ffffff', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* Floating Retro Desktop Sidebar (hidden on mobile, drawer toggled on mobile) */}
      <aside className={`floating-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        {/* Brand / Header */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid #18181b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#ffffff', color: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '1rem' }}>
                ⚡
              </div>
              <div>
                <div style={{ fontWeight: '800', fontSize: '0.9rem', letterSpacing: '-0.3px', color: '#ffffff' }}>
                  CHATTER<span style={{ color: '#10b981' }}>_OS</span>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                  v2.6 // SAM JOSHUA
                </div>
              </div>
            </div>

            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: routingConfig.globalBotActive ? '#10b981' : '#ef4444', boxShadow: routingConfig.globalBotActive ? '0 0 8px #10b981' : '0 0 8px #ef4444' }} />
          </div>

          {/* Status Chip */}
          <div style={{ marginTop: '14px', background: '#121214', border: '1px solid #27272a', borderRadius: '8px', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
              <Terminal size={12} color="#10b981" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.68rem', color: '#a1a1aa', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                MODE: {routingConfig.chatMode.toUpperCase()}
              </span>
            </div>
            <span style={{ fontSize: '0.65rem', background: '#27272a', color: '#ffffff', padding: '2px 6px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
              {activeModeCount}
            </span>
          </div>

          {/* Navigation Items */}
          <nav style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    background: isActive ? '#ffffff' : 'transparent',
                    color: isActive ? '#000000' : '#a1a1aa',
                    border: '1px solid',
                    borderColor: isActive ? '#ffffff' : 'transparent',
                    borderRadius: '10px',
                    padding: '10px 12px',
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
                  <span style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono', monospace", opacity: isActive ? 0.7 : 0.4 }}>
                    [{item.code}]
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer in Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '14px', borderTop: '1px solid #18181b' }}>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              startAiInterview(null);
            }}
            style={{
              background: '#ffffff',
              color: '#000000',
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
            <span>+ Add Person (AI)</span>
          </button>

          <button
            onClick={toggleGlobalBot}
            style={{
              background: routingConfig.globalBotActive ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              border: `1px solid ${routingConfig.globalBotActive ? '#ef4444' : '#10b981'}`,
              color: routingConfig.globalBotActive ? '#ef4444' : '#10b981',
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
            {routingConfig.globalBotActive ? '⏸️ PAUSE BOT' : '▶️ RESUME BOT'}
          </button>
        </div>
      </aside>

      <style jsx>{`
        .mobile-header {
          display: none;
        }

        .floating-sidebar {
          position: fixed;
          top: 20px;
          left: 20px;
          bottom: 20px;
          width: 270px;
          background: rgba(9, 9, 11, 0.94);
          backdrop-filter: blur(20px);
          border: 1px solid #27272a;
          border-radius: 18px;
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          z-index: 50;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.9), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
        }

        @media (max-width: 768px) {
          .mobile-header {
            display: flex;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 56px;
            background: rgba(9, 9, 11, 0.96);
            backdrop-filter: blur(16px);
            border-bottom: 1px solid #27272a;
            align-items: center;
            justify-content: space-between;
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
