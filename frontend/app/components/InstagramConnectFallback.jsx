'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Instagram,
  Sparkles,
  Sliders,
  ShieldAlert,
  ArrowRight,
  Zap,
  Settings,
  MessageSquare,
  Bot
} from 'lucide-react';

export default function InstagramConnectFallback({ onConnect, user }) {
  const username = user?.instagramUsername || user?.username || 'user';

  return (
    <div style={{
      width: '100%',
      minHeight: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      background: 'radial-gradient(ellipse at top, #fafafa 0%, #f4f4f5 100%)',
      boxSizing: 'border-box'
    }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{
          maxWidth: '560px',
          width: '100%',
          background: '#ffffff',
          border: '1px solid #e4e4e7',
          borderRadius: '20px',
          padding: '40px 36px',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0,0,0,0.02)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxSizing: 'border-box'
        }}
      >
        {/* Sleek Grey Icon Container */}
        <div style={{ position: 'relative', marginBottom: '22px' }}>
          <div style={{
            width: '76px',
            height: '76px',
            borderRadius: '22px',
            background: 'linear-gradient(135deg, #f4f4f5 0%, #e4e4e7 100%)',
            border: '1.5px solid #d4d4d8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#52525b',
            boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.8), 0 8px 20px rgba(0,0,0,0.04)'
          }}>
            <Instagram size={38} strokeWidth={1.75} />
          </div>
          <div style={{
            position: 'absolute',
            bottom: '-4px',
            right: '-4px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: '#ffffff',
            border: '1.5px solid #e4e4e7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
          }}>
            <span style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#f59e0b'
            }} />
          </div>
        </div>

        {/* Monospace Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: '#f4f4f5',
          border: '1px solid #e4e4e7',
          borderRadius: '999px',
          padding: '3px 12px',
          fontSize: '0.68rem',
          fontWeight: '700',
          fontFamily: "'JetBrains Mono', monospace",
          color: '#52525b',
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          marginBottom: '14px'
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#71717a' }} />
          INSTAGRAM NOT CONNECTED
        </div>

        {/* Heading & Subtitle */}
        <h1 style={{
          fontSize: '1.45rem',
          fontWeight: '800',
          color: '#09090b',
          letterSpacing: '-0.5px',
          margin: '0 0 10px 0',
          lineHeight: 1.25
        }}>
          Connect your Instagram handle to activate chat automation
        </h1>
        <p style={{
          fontSize: '0.86rem',
          color: '#71717a',
          lineHeight: 1.55,
          margin: '0 0 26px 0',
          maxWidth: '460px'
        }}>
          Link your Instagram account to unlock live contact relationship graphs, AI-powered direct message replies, memory tracking, and custom automation rules.
        </p>

        {/* Account Info Pill */}
        <div style={{
          width: '100%',
          background: '#fafafa',
          border: '1px solid #e4e4e7',
          borderRadius: '12px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '9px',
              background: '#e4e4e7',
              color: '#3f3f46',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '800',
              fontSize: '0.82rem'
            }}>
              {username[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#09090b' }}>
                @{username}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#71717a' }}>
                {user?.accountType ? `${user.accountType.charAt(0).toUpperCase() + user.accountType.slice(1)} Tier` : 'Workspace Account'}
              </div>
            </div>
          </div>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: '700',
            fontFamily: "'JetBrains Mono', monospace",
            background: '#fef3c7',
            color: '#b45309',
            padding: '3px 8px',
            borderRadius: '6px'
          }}>
            SETUP REQUIRED
          </span>
        </div>

        {/* Feature Previews */}
        <div style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '10px',
          marginBottom: '28px',
          textAlign: 'left'
        }}>
          <div style={{
            background: '#fafafa',
            border: '1px solid #f4f4f5',
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <Bot size={16} color="#71717a" />
            <div style={{ fontSize: '0.74rem', fontWeight: '700', color: '#09090b' }}>AI DM Replies</div>
            <div style={{ fontSize: '0.68rem', color: '#71717a', lineHeight: 1.35 }}>Automate responses that sound like you.</div>
          </div>

          <div style={{
            background: '#fafafa',
            border: '1px solid #f4f4f5',
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <Sparkles size={16} color="#71717a" />
            <div style={{ fontSize: '0.74rem', fontWeight: '700', color: '#09090b' }}>Social Graph</div>
            <div style={{ fontSize: '0.68rem', color: '#71717a', lineHeight: 1.35 }}>Track relationships and shared memories.</div>
          </div>

          <div style={{
            background: '#fafafa',
            border: '1px solid #f4f4f5',
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <Sliders size={16} color="#71717a" />
            <div style={{ fontSize: '0.74rem', fontWeight: '700', color: '#09090b' }}>Chat Rules</div>
            <div style={{ fontSize: '0.68rem', color: '#71717a', lineHeight: 1.35 }}>Full control over who the bot replies to.</div>
          </div>
        </div>

        {/* Call to Action Buttons */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            onClick={onConnect}
            style={{
              width: '100%',
              background: '#09090b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 18px',
              fontSize: '0.86rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(9, 9, 11, 0.15)',
              transition: 'all 0.15s ease'
            }}
          >
            <Zap size={16} />
            <span>Connect Instagram &amp; Configure Setup</span>
            <ArrowRight size={15} />
          </button>

          <Link
            href="/settings"
            style={{
              width: '100%',
              background: '#ffffff',
              color: '#52525b',
              border: '1px solid #e4e4e7',
              borderRadius: '10px',
              padding: '10px 18px',
              fontSize: '0.8rem',
              fontWeight: '600',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              boxSizing: 'border-box',
              transition: 'all 0.15s ease'
            }}
          >
            <Settings size={14} />
            <span>Or Enter Credentials in Settings</span>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
