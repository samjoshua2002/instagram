'use client';

import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Target, Calendar, Download, Phone, Mail } from 'lucide-react';

const cardStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '20px', minWidth: 0 };
const kicker = { fontSize: '0.65rem', color: 'var(--color-text-secondary)', fontFamily: "'JetBrains Mono', monospace", fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' };
const STATUS = {
  confirmed: { bg: 'color-mix(in srgb, #22c55e 14%, transparent)', fg: '#4ade80' },
  pending: { bg: 'color-mix(in srgb, #f59e0b 14%, transparent)', fg: '#fbbf24' },
};

function formatWhen(date) {
  if (!date) return 'Time not set';
  return new Date(date).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/**
 * Recent leads and upcoming bookings for business dashboards
 */
export default function BusinessConversionPanel({ refreshKey }) {
  const { API_BASE, token, showToast } = useApp();
  const [leads, setLeads] = useState([]);
  const [bookings, setBookings] = useState([]);

  const authHeader = () => {
    const t = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/analytics/leads?limit=6`, { headers: authHeader() })
      .then(r => (r.ok ? r.json() : null)).then(d => d && setLeads(d.items || [])).catch(() => { });
    fetch(`${API_BASE}/api/analytics/bookings`, { headers: authHeader() })
      .then(r => (r.ok ? r.json() : null)).then(d => d && setBookings((d.items || []).slice(0, 6))).catch(() => { });
  }, [API_BASE, token, refreshKey]);

  const exportCsv = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analytics/leads?format=csv`, { headers: authHeader() });
      if (!res.ok) throw new Error('Export failed');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '16px', margin: '16px 0 24px' }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '14px' }}>
          <div>
            <div style={kicker}>LEADS</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, marginTop: '2px' }}>Recent leads</div>
          </div>
          <button type="button" className="btn" onClick={exportCsv} disabled={!leads.length} title="Download all leads as CSV">
            <Download size={13} /> CSV
          </button>
        </div>
        {leads.length === 0 ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Target size={15} /> Leads appear here when customers share contact details or ask about prices.
          </div>
        ) : leads.map(l => (
          <div key={l._id} style={{ padding: '10px 0', borderTop: '1px solid var(--color-surface-hover)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>@{l.handle || l.senderId}</div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '3px' }}>
              {l.phone && <a href={`tel:${l.phone.replace(/\s/g, '')}`} style={{ color: 'inherit', display: 'inline-flex', gap: '4px', alignItems: 'center' }}><Phone size={12} />{l.phone}</a>}
              {l.email && <a href={`mailto:${l.email}`} style={{ color: 'inherit', display: 'inline-flex', gap: '4px', alignItems: 'center', wordBreak: 'break-all' }}><Mail size={12} />{l.email}</a>}
            </div>
            {l.intentSummary && <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', marginTop: '3px' }}>{l.intentSummary}</div>}
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ marginBottom: '14px' }}>
          <div style={kicker}>BOOKINGS</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, marginTop: '2px' }}>Upcoming bookings</div>
        </div>
        {bookings.length === 0 ? (
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Calendar size={15} /> Bookings appear here when customers agree a time in DMs.
          </div>
        ) : bookings.map(b => {
          const s = STATUS[b.status] || STATUS.pending;
          return (
            <div key={b._id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--color-surface-hover)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{b.serviceName || 'Booking'}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>@{b.handle || b.senderId} · {formatWhen(b.bookingTime)}</div>
              </div>
              <span style={{ background: s.bg, color: s.fg, fontWeight: 700, fontSize: '0.7rem', padding: '3px 9px', borderRadius: '999px', textTransform: 'capitalize', flexShrink: 0 }}>{b.status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
