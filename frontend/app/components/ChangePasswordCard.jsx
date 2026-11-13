'use client';

import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { IconSwap } from './ui/motion';

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-elevated)',
  color: 'var(--color-text-primary)',
  fontSize: '0.88rem',
  boxSizing: 'border-box',
};
const labelStyle = { fontSize: '0.76rem', fontWeight: 700, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' };

/** Profile card: the signed-in user changes their own password (needs the current one). */
export default function ChangePasswordCard() {
  const { token, API_BASE, showToast, setSessionToken } = useApp();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = key => e => { setForm(f => ({ ...f, [key]: e.target.value })); setError(''); };

  const submit = async e => {
    e.preventDefault();
    if (form.next.length < 8) return setError('New password must be at least 8 characters.');
    if (form.next !== form.confirm) return setError('The two new passwords do not match.');
    if (form.next === form.current) return setError('New password must be different from the current one.');
    setSaving(true);
    try {
      const activeToken = token || localStorage.getItem('chatter_jwt_token');
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not change password.');
      // The server signs out old sessions on a password change and sends a fresh token for this one
      // Swap the token in place; the full sign-in flow would reload onto Home and lose the toast
      if (data.token) setSessionToken?.(data.token);
      setForm({ current: '', next: '', confirm: '' });
      showToast?.('Password changed.', 'success');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const type = show ? 'text' : 'password';

  return (
    <form
      onSubmit={submit}
      style={{
        background: 'var(--bg-card, var(--color-surface))',
        border: '1px solid var(--border, var(--color-border))',
        borderRadius: '18px',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '8px',
            background: 'var(--color-text-primary)', color: 'var(--color-surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={15} />
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.3px' }}>
            Change Password
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setShow(v => !v)}
          aria-label={show ? 'Hide passwords' : 'Show passwords'}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: 0, width: '40px', height: '40px', display: 'grid', placeItems: 'center', flexShrink: 0 }}
        >
          <IconSwap k={show ? 'eyeoff' : 'eye'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</IconSwap>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label>
          <span style={labelStyle}>Current password</span>
          <input type={type} autoComplete="current-password" value={form.current} onChange={set('current')} required style={inputStyle} />
        </label>
        <label>
          <span style={labelStyle}>New password (8+ characters)</span>
          <input type={type} autoComplete="new-password" value={form.next} onChange={set('next')} required minLength={8} style={inputStyle} />
        </label>
        <label>
          <span style={labelStyle}>Confirm new password</span>
          <input type={type} autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required style={inputStyle} />
        </label>
        {error && <div role="alert" style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>{error}</div>}
        <button
          type="submit"
          disabled={saving}
          style={{
            alignSelf: 'flex-start',
            background: 'var(--color-text-primary)', color: 'var(--color-surface)',
            border: 'none', borderRadius: '8px', padding: '9px 16px',
            fontSize: '0.8rem', fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Update password'}
        </button>
      </div>
    </form>
  );
}
