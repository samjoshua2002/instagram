'use client';

import React from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Shield, ExternalLink } from 'lucide-react';

export default function WorkspaceImpersonationBanner() {
  const { isImpersonating, user, exitWorkspace } = useApp();

  if (!isImpersonating) return null;

  const handle = user?.instagramUsername || user?.username || 'creator';
  const name = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.username;

  return (
    <div
      style={{
        background: '#09090b',
        color: '#ffffff',
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #27272a',
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        fontSize: '0.78rem',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            background: '#22c55e',
            color: '#09090b',
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: '800',
            fontSize: '0.64rem',
            padding: '2px 6px',
            borderRadius: '4px',
            letterSpacing: '0.4px'
          }}
        >
          MANAGED WORKSPACE
        </span>
        <span style={{ color: '#d4d4d8' }}>
          Configuring creator: <strong style={{ color: '#ffffff' }}>@{handle}</strong> {name ? `(${name})` : ''}
        </span>
      </div>

      <button
        type="button"
        onClick={exitWorkspace}
        style={{
          background: '#ffffff',
          color: '#09090b',
          border: 'none',
          borderRadius: '6px',
          padding: '5px 12px',
          fontSize: '0.74rem',
          fontWeight: '700',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#f4f4f5'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; }}
      >
        <ArrowLeft size={13} />
        <span>Exit to Superadmin Console</span>
      </button>
    </div>
  );
}
