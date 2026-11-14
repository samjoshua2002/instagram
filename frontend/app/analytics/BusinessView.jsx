'use client';

// Business analytics: chats -> leads -> bookings, who is waiting, and when customers write
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { chatRuleLabel } from './PersonalView';
import {
  fmt, pct, plural, rangeWords, timeAgo, heatPeak,
  Card, Action, StoryCard, AttentionCards, StatStrip, VolumeChart, Heatmap, Highlights,
} from './kit';

const formatWhen = date => (date
  ? new Date(date).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : 'Time not set');

// Newest leads and upcoming bookings, refreshed whenever the overview numbers change
function useConversions(refreshKey) {
  const { API_BASE, token, showToast } = useApp();
  const [leads, setLeads] = useState([]);
  const [bookings, setBookings] = useState([]);
  const headers = () => {
    const t = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    return t ? { Authorization: `Bearer ${t}` } : {};
  };
  useEffect(() => {
    fetch(`${API_BASE}/api/analytics/leads?limit=5`, { headers: headers() })
      .then(r => (r.ok ? r.json() : null)).then(d => d && setLeads(d.items || [])).catch(() => {});
    fetch(`${API_BASE}/api/analytics/bookings`, { headers: headers() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setBookings((d.items || []).filter(b => !b.bookingTime || new Date(b.bookingTime) >= new Date()).slice(0, 5)))
      .catch(() => {});
  }, [API_BASE, token, refreshKey]);
  const exportCsv = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analytics/leads?format=csv`, { headers: headers() });
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
  return { leads, bookings, exportCsv };
}

/* Conversations -> leads -> bookings, each bar relative to conversations */
function FunnelCard({ biz }) {
  const steps = [
    { label: 'Conversations', value: biz.totalConversations || 0 },
    { label: 'Leads', value: biz.activeLeads || 0 },
    { label: 'Bookings', value: biz.confirmedBookings || 0 },
  ];
  const top = Math.max(1, steps[0].value);
  return (
    <Card title="From chat to booking" sub="All time">
      <ul className="an-split">
        {steps.map((st, i) => (
          <li key={st.label} style={{ display: 'block' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{st.label}</span>
              <b>{fmt(st.value)}{i > 0 && <span style={{ color: 'var(--sp-text-2)', fontWeight: 600 }}> · {Math.min(100, pct(st.value, steps[i - 1].value))}%</span>}</b>
            </div>
            <div className="an-lb-track"><div style={{ width: `${(st.value / top) * 100}%`, opacity: 1 - i * 0.22 }} /></div>
          </li>
        ))}
      </ul>
      <div className="an-card-sub" style={{ marginTop: 10 }}>The % is how many made it from the step above.</div>
    </Card>
  );
}

function LeadsCard({ leads, exportCsv }) {
  return (
    <Card title="Newest leads" sub="People who shared a phone, email or buying intent" aside={<button type="button" className="an-btn ghost" onClick={exportCsv} disabled={!leads.length}>Export CSV</button>}>
      {leads.length ? (
        <ul className="an-leads">
          {leads.map(l => (
            <li key={l._id}>
              <b>@{(l.handle || 'unknown').replace(/^@/, '')}</b>
              <time dateTime={l.updatedAt || l.createdAt}>{timeAgo(l.updatedAt || l.createdAt)}</time>
              <p>{[l.intentSummary || 'Shared contact details', l.phone, l.email].filter(Boolean).join(' · ')}</p>
            </li>
          ))}
        </ul>
      ) : <div className="an-empty">Leads appear here when a customer shares a phone number, email or wants to buy.</div>}
    </Card>
  );
}

function BookingsCard({ bookings }) {
  return (
    <Card title="Upcoming bookings">
      {bookings.length ? (
        <ul className="an-leads">
          {bookings.map(b => (
            <li key={b._id}>
              <b>{b.serviceName || 'Booking'}</b>
              <time style={{ color: b.status === 'confirmed' ? 'var(--an-ok)' : 'var(--an-warn)', fontWeight: 700 }}>{b.status}</time>
              <p>{formatWhen(b.bookingTime)} · @{(b.handle || b.senderId || '').replace(/^@/, '')}</p>
            </li>
          ))}
        </ul>
      ) : <div className="an-empty">No upcoming bookings. They show up when customers book inside a chat.</div>}
    </Card>
  );
}

/* Leads + funnel row, also shown inside the Hybrid layout */
export function BusinessStrip({ biz }) {
  const { leads, exportCsv } = useConversions(biz);
  return (
    <div className="an-row">
      <LeadsCard leads={leads} exportCsv={exportCsv} />
      <FunnelCard biz={biz || {}} />
    </div>
  );
}

export default function BusinessView({ biz, routingConfig, range, activity }) {
  const b = biz || {};
  const { data, loading } = activity;
  const { leads, bookings, exportCsv } = useConversions(biz);
  const chats = b.totalConversations || 0;
  const leadsN = b.activeLeads || 0;
  const booked = b.confirmedBookings || 0;
  const waiting = b.openHandoffs || 0;
  const botOnline = routingConfig?.globalBotActive !== false;

  const story = chats ? {
    headline: <><em>{pct(leadsN, chats)}%</em> of your conversations turned into leads.</>,
    sub: `${plural(leadsN, 'lead')} from ${plural(chats, 'conversation')} · ${plural(booked, 'confirmed booking')} · ${fmt(b.leadsLast30d)} new in the last 30 days.`,
    action: leadsN ? { label: 'Export leads', onClick: exportCsv } : { label: 'Open inbox', href: '/relationships' },
    segments: [
      { label: 'Booked', value: Math.min(booked, chats), color: 'var(--an-accent)' },
      { label: 'Leads not booked yet', value: Math.max(0, Math.min(leadsN, chats) - booked), color: 'var(--an-accent-2)' },
      { label: 'Other chats', value: Math.max(0, chats - Math.max(leadsN, booked)), color: 'color-mix(in srgb, var(--sp-text) 22%, transparent)' },
    ],
    total: chats,
  } : {
    headline: 'Your business numbers fill in as customers message you.',
    sub: 'Leads, bookings and reply speed all come from your Instagram chats.',
    action: { label: 'Set up business tools', href: '/settings/features' },
    segments: [],
  };

  const nextBooking = bookings.find(x => x.bookingTime);
  const attention = [
    waiting > 0
      ? { tone: 'warn', title: `${plural(waiting, 'chat')} waiting for your team`, text: 'The bot paused these and asked for a person.', action: { label: 'Open', href: '/relationships' } }
      : { tone: 'ok', title: 'No chats waiting', text: 'Every customer chat has an answer.' },
    (b.upcomingBookings || 0) > 0
      ? { tone: 'info', title: `${plural(b.upcomingBookings, 'upcoming booking')}`, text: nextBooking ? `Next: ${formatWhen(nextBooking.bookingTime)}` : 'Some have no time set yet.' }
      : { tone: 'info', title: 'No upcoming bookings', text: 'Turn on the booking scheduler to take them in chat.', action: { label: 'Features', href: '/settings/features' } },
    botOnline
      ? { tone: 'ok', title: 'Bot is online', text: `Replying to ${chatRuleLabel(routingConfig).toLowerCase()} · AI sent ${b.automationRate || 0}% of replies.` }
      : { tone: 'warn', title: 'Bot is paused', text: 'Customers get no automatic replies.', action: { label: 'Turn on', href: '/controls' } },
  ];

  const rangeTotal = data?.totals?.received;
  const stats = [
    { label: 'Conversations', value: chats, sub: rangeTotal == null ? `${waiting} waiting for your team` : `${fmt(rangeTotal)} customer messages · ${rangeWords(range)}` },
    { label: 'Leads', value: leadsN, sub: `${fmt(b.leadsLast30d)} in the last 30 days` },
    { label: 'Bookings', value: booked, sub: `${fmt(b.upcomingBookings)} upcoming` },
    { label: 'Automation', value: `${b.automationRate || 0}%`, sub: `of replies by AI · ${b.resolutionRate || 0}% need no team` },
  ];

  const highlights = [];
  const peak = heatPeak(data?.heatmap);
  if (peak) highlights.push({ badge: peak.day[0], title: `Staff up on ${peak.dayName}s`, text: `${peak.windowShare}% of customer messages arrive ${peak.window}.` });
  if (chats) highlights.push({ badge: '%', title: `${pct(leadsN, chats)}% lead rate`, text: `${plural(leadsN, 'lead')} from ${plural(chats, 'conversation')}${leadsN ? `, ${Math.min(100, pct(booked, leadsN))}% of them booked` : ''}.` });
  if (data?.totals && data.totals.ai + data.totals.human > 0) {
    highlights.push({ badge: 'AI', title: `AI sent ${pct(data.totals.ai, data.totals.ai + data.totals.human)}% of replies`, text: `${fmt(data.totals.ai)} by AI and ${fmt(data.totals.human)} by your team in the ${rangeWords(range)}.` });
  }

  return (
    <>
      <StoryCard eyebrow={chats ? 'Your business so far' : 'Getting started'} {...story} />
      <AttentionCards items={attention} />
      <StatStrip items={stats} />

      <div className="an-row">
        <VolumeChart
          title="Customer messages"
          data={data}
          loading={loading}
          range={range}
          keys={[
            { key: 'received', label: 'From customers', color: 'var(--an-accent)' },
            { key: 'ai', label: 'AI replies', color: 'var(--an-accent-2)' },
            { key: 'human', label: 'Your team', color: 'var(--an-orange)' },
          ]}
          totalLabel={`messages · ${rangeWords(range)}`}
          emptyText="No customer messages in this range yet."
        />
        <FunnelCard biz={b} />
      </div>

      <div className="an-row">
        <LeadsCard leads={leads} exportCsv={exportCsv} />
        <BookingsCard bookings={bookings} />
      </div>

      <div className="an-row">
        <Heatmap title="When customers message you" grid={data?.heatmap} loading={loading} range={range} emptyText="No customer messages in this range yet." />
        <Highlights items={highlights} />
      </div>
    </>
  );
}
