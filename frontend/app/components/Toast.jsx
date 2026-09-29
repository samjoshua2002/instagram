'use client';

import React from 'react';
import { useApp } from '../context/AppContext';
import { Sparkles } from 'lucide-react';

export default function Toast() {
  const { toastMessage } = useApp();
  if (!toastMessage) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '24px',
        right: '28px',
        background: '#09090b',
        border: '1px solid #10b981',
        color: '#10b981',
        padding: '12px 20px',
        borderRadius: '10px',
        fontSize: '0.85rem',
        fontWeight: '600',
        fontFamily: "'JetBrains Mono', monospace",
        zIndex: 9999,
        boxShadow: '0 10px 40px rgba(16, 185, 129, 0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}
    >
      <Sparkles size={16} />
      <span>{toastMessage}</span>
    </div>
  );
}
