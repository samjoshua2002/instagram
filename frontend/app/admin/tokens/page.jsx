'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Activity, RefreshCw, Lock, AlertCircle } from 'lucide-react';

const BADGE = {
  green: { bg: '#dcfce7', fg: '#15803d', label: 'Healthy' },
  amber: { bg: '#fef3c7', fg: '#b45309', label: 'Expiring' },
  red: { bg: '#fee2e2', fg: '#b91c1c', label: 'Expired / Revoked' },
};

function expiryText(row) {
  if (row.status === 'red' && (row.daysLeft === null || row.daysLeft > 0)) return 'Needs reconnect';
  if (!row.expiresAt) return 'Never expires';
  if (row.daysLeft <= 0) return 'Expired';
  return `${row.daysLeft} day${row.daysLeft === 1 ? '' : 's'} left`;
}

export default function TokenRadarPage() {
  const { user, API_BASE, token, showToast } = useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshingId, setRefreshingId] = useState(null);

  const isSuperadmin = user?.role === 'superadmin';
  const authToken = () => token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);

  const load = async () => {
    const t = authToken();
    if (!t) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/tokens`, { headers: { Authorization: `Bearer ${t}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load tokens');
      setRows(data.tokens || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const forceRefresh = async (row) => {
    const t = authToken();
    if (!t || refreshingId) return;
    setRefreshingId(row.userId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/tokens/${row.userId}/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refresh failed');
      showToast?.(data.refreshed ? `Token for @${row.instagramUsername || row.username} refreshed.` : 'Token re-checked with Meta.', 'success');
      await load();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setRefreshingId(null);
    }
  };

  useEffect(() => {
    if (isSuperadmin) load();
  }, [isSuperadmin, token]);

  if (!isSuperadmin) {
    return (
      <div className="page-container" style={{ textAlign: 'center', paddingTop: '80px' }}>
        <Lock size={28} />
        <h2 style={{ marginTop: '12px' }}>Superadmin only</h2>
      </div>
    );
  }

  const counts = rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});

  return (
    <div className="page-container" style={{ maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <div className="mono" style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 'bold' }}>// TOKEN HEALTH RADAR</div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', margin: '4px 0 0' }}>Meta Tokens</h1>
        </div>
        <button type="button" className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Reload
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {Object.entries(BADGE).map(([key, b]) => (
          <span key={key} style={{ background: b.bg, color: b.fg, fontWeight: 700, fontSize: '0.75rem', padding: '4px 10px', borderRadius: '999px' }}>
            {b.label}: {counts[key] || 0}
          </span>
        ))}
      </div>

      {error && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#b91c1c', border: '1px solid #fee2e2', borderRadius: '12px', padding: '12px', marginBottom: '16px' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {loading && !rows.length ? (
        <div className="skeleton" style={{ height: '160px', borderRadius: '12px' }} />
      ) : rows.length === 0 ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Activity size={22} />
          <div style={{ marginTop: '8px' }}>No connected Instagram accounts yet.</div>
        </div>
      ) : (
        <div className="table-wrapper" style={{ border: '1px solid var(--border)', borderRadius: '12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '640px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)', textAlign: 'left' }}>
                {['Tenant', 'Instagram', 'Storage', 'Expires', 'Health', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const badge = BADGE[row.status] || BADGE.red;
                return (
                  <tr key={row.userId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700 }}>{row.username}{row.isBanned ? ' (banned)' : ''}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.accountType}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div>@{row.instagramUsername || '—'}</div>
                      <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{row.instagramAccountId}</div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '0.78rem' }}>
                      {row.encrypted ? 'Encrypted' : <span style={{ color: '#b45309', fontWeight: 600 }}>Plaintext (legacy)</span>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{expiryText(row)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: badge.bg, color: badge.fg, fontWeight: 700, fontSize: '0.72rem', padding: '3px 9px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button type="button" className="btn" onClick={() => forceRefresh(row)} disabled={refreshingId === row.userId} style={{ whiteSpace: 'nowrap' }}>
                        <RefreshCw size={13} className={refreshingId === row.userId ? 'animate-spin' : ''} />
                        {refreshingId === row.userId ? 'Refreshing…' : 'Force Immediate Refresh'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
