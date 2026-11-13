'use client';

import React from 'react';
import { useToast } from '../context/AppContext';
import { Check, AlertCircle } from 'lucide-react';

export default function Toast() {
  const { message: toastMessage, type } = useToast();
  if (!toastMessage) return null;
  const isError = type === 'error';

  // Clean away any emojis in toast message
  const cleanMsg = toastMessage.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '24px',
        background: '#09090b',
        border: '1px solid #27272a',
        color: '#ffffff',
        padding: '10px 18px',
        borderRadius: '8px',
        fontSize: '0.82rem',
        fontWeight: '600',
        zIndex: 100000,
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}
    >
      {isError ? <AlertCircle size={14} color="#f87171" /> : <Check size={14} />}
      <span>{cleanMsg}</span>
    </div>
  );
}
