'use client';

// Superadmin analytics: account health across the platform, above the user directory table
import React from 'react';
import {
  fmt, pct, plural, rangeWords, timeAgo,
  Card, StoryCard, AttentionCards, StatStrip, VolumeChart, KeyValues, Leaderboard, SplitList,
} from './kit';

const WEEK_MS = 7 * 864e5;
const TYPE_LABEL = { business: 'Business', creator: 'Creator', agency: 'Agency', personal: 'Personal' };

export default function PlatformView({ accounts, kpi, range, activity, onFilter }) {
  const { data, loading } = activity;
  const live = kpi.activeInstagram;
  const waiting = kpi.pendingApproval;
  const unconnected = Math.max(0, kpi.notConnected - waiting);
  const newThisWeek = accounts.filter(a => a.createdAt && Date.now() - new Date(a.createdAt).getTime() < WEEK_MS).length;
  const newest = [...accounts].filter(a => a.createdAt).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const banned = accounts.filter(a => a.isBanned).length;
  const totals = data?.totals;
  const aiShare = totals ? pct(totals.ai, totals.ai + totals.human) : 0;
  const show = id => { onFilter(id); document.getElementById('platform-directory')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const story = kpi.total ? {
    headline: <><em>{pct(live, kpi.total)}%</em> of accounts are live on Instagram.</>,
    sub: `${fmt(live)} of ${plural(kpi.total, 'account')} have a working Instagram connection · ${fmt(waiting)} waiting for whitelist · ${fmt(unconnected)} not connected.`,
    action: waiting ? { label: `Review ${fmt(waiting)} pending`, onClick: () => show('pendingApproval') } : { label: 'Open directory', onClick: () => show('all') },
    segments: [
      { label: 'Live', value: live, color: 'var(--an-accent)' },
      { label: 'Waiting for whitelist', value: waiting, color: 'var(--an-warn)' },
      { label: 'Not connected', value: unconnected, color: 'color-mix(in srgb, var(--sp-text) 22%, transparent)' },
    ],
    total: live + waiting + unconnected,
  } : { headline: 'No accounts yet.', sub: 'Sign-ups show up here.', segments: [] };

  const attention = [
    waiting
      ? { tone: 'warn', title: `${plural(waiting, 'creator')} waiting for whitelist`, text: 'Add them as Instagram Testers in Meta, then approve.', action: { label: 'View', onClick: () => show('pendingApproval') } }
      : { tone: 'ok', title: 'Whitelist is clear', text: 'Nobody is waiting for Meta approval.' },
    kpi.pending
      ? { tone: 'info', title: `${plural(kpi.pending, 'account')} never finished setup`, text: 'They signed up but did not complete onboarding.', action: { label: 'View', onClick: () => show('pending') } }
      : { tone: 'ok', title: 'Everyone finished setup', text: 'All accounts completed onboarding.' },
    { tone: newThisWeek ? 'info' : 'ok', title: `${plural(newThisWeek, 'new sign-up')} this week`, text: newest[0] ? `Latest: @${newest[0].username} · ${timeAgo(newest[0].createdAt)}` : 'No sign-ups yet.' },
  ];

  const stats = [
    { label: 'Accounts', value: kpi.total, sub: `${kpi.admins} superadmin · ${kpi.regular} users` },
    { label: 'Live on Instagram', value: live, sub: `${fmt(kpi.notConnected)} not connected` },
    { label: 'Messages', value: totals ? totals.total : '–', sub: `All workspaces · ${rangeWords(range)}` },
    { label: 'AI reply share', value: totals ? `${aiShare}%` : '–', sub: data ? `${fmt(data.activeWorkspaces)} workspaces had messages` : 'Loading…' },
  ];

  const busiest = (data?.owners || []).map(o => ({
    id: o.id,
    name: o.name || `@${o.username}`,
    handle: o.name ? `@${o.username}` : TYPE_LABEL[o.accountType] || '',
    value: o.total,
  }));

  return (
    <>
      <StoryCard eyebrow="Platform health" {...story} />
      <AttentionCards items={attention} />
      <StatStrip items={stats} />

      <div className="an-row">
        <VolumeChart
          title="Messages across all workspaces"
          data={data}
          loading={loading}
          range={range}
          keys={[
            { key: 'received', label: 'Received', color: 'var(--an-accent)' },
            { key: 'ai', label: 'AI replies', color: 'var(--an-accent-2)' },
            { key: 'human', label: 'Owner replies', color: 'var(--an-orange)' },
          ]}
          totalLabel={`messages · ${rangeWords(range)}`}
          emptyText="No messages on the platform in this range."
        />
        <Card title="Account mix">
          <div className="an-huge"><strong>{fmt(kpi.total)}</strong><span>accounts</span></div>
          <SplitList parts={[
            { label: 'Business, creator & agency', value: kpi.business, color: 'var(--an-accent)' },
            { label: 'Personal', value: kpi.personal, color: 'var(--an-accent-2)' },
          ]} />
          <div style={{ marginTop: 12 }}>
            <KeyValues rows={[
              { label: 'Superadmins', value: fmt(kpi.admins) },
              { label: 'Using passkeys', value: `${fmt(kpi.passkeys)} (${pct(kpi.passkeys, kpi.total)}%)` },
              { label: 'Banned', value: fmt(banned) },
            ]} />
          </div>
        </Card>
      </div>

      <div className="an-row">
        <Card title="Busiest workspaces" sub={`By messages · ${rangeWords(range)}`}>
          <Leaderboard rows={busiest} emptyText={loading ? 'Loading…' : 'No workspace had messages in this range.'} />
        </Card>
        <Card title="Newest accounts">
          {newest.length ? (
            <ul className="an-leads">
              {newest.map(a => (
                <li key={a.id}>
                  <b>@{a.username}</b>
                  <time dateTime={a.createdAt}>{timeAgo(a.createdAt)}</time>
                  <p>{[TYPE_LABEL[a.accountType] || 'Personal', a.hasInstagramToken ? 'Instagram live' : a.igApprovalStatus === 'pending' ? 'Waiting for whitelist' : 'Not connected', a.isOnboarded ? null : 'Setup unfinished'].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
            </ul>
          ) : <div className="an-empty">No accounts yet.</div>}
        </Card>
      </div>
    </>
  );
}
