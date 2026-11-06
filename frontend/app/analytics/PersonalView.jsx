'use client';

// Personal analytics: who you talk to, how much, when, and who gets AI replies
import React, { useMemo, useState } from 'react';
import ContactAvatar from '../components/ContactAvatar';
import { isAiOnFor } from '../lib/aiReply';
import {
  fmt, pct, countWord, plural, rangeWords, heatPeak,
  Card, Action, StoryCard, AttentionCards, StatStrip, VolumeChart, Progress, KeyValues,
  Leaderboard, SplitList, Heatmap, Highlights,
} from './kit';

const msgs = n => n.chatsCount || n.messageCount || 0;
const reels = n => n.reelsCount || 0;
const firstName = n => (n.name || n.handle || 'them').split(' ')[0];
const personHref = n => `/relationships?person=${encodeURIComponent(n.id)}`;
// Top five fade from the page accent; everyone else is grey
const SHADES = [100, 80, 64, 50, 38].map(p => `color-mix(in srgb, var(--an-accent) ${p}%, var(--sp-panel))`);
const OTHERS = 'color-mix(in srgb, var(--sp-text) 22%, transparent)';

export function chatRuleLabel(routingConfig) {
  const r = routingConfig || {};
  if (r.globalBotActive === false || r.chatMode === 'paused') return 'Nobody (paused)';
  if (r.chatMode === 'only_selected') return 'Only selected';
  if (r.chatMode === 'everyone_except') return `Everyone except ${(r.excludedContactIds || []).length}`;
  return 'Everyone';
}

export default function PersonalView({ friendNodes, routingConfig, bizStats, range, activity, children }) {
  const [board, setBoard] = useState('messages');
  const { data, loading } = activity;

  const s = useMemo(() => {
    const total = friendNodes.length;
    const byMsgs = [...friendNodes].filter(n => msgs(n) > 0).sort((a, b) => msgs(b) - msgs(a));
    const byReels = [...friendNodes].filter(n => reels(n) > 0).sort((a, b) => reels(b) - reels(a));
    const totalMsgs = friendNodes.reduce((t, n) => t + msgs(n), 0);
    const totalReels = friendNodes.reduce((t, n) => t + reels(n), 0);
    const top = byMsgs.slice(0, 5);
    const topMsgs = top.reduce((t, n) => t + msgs(n), 0);
    const topReelSum = byReels.slice(0, 5).reduce((t, n) => t + reels(n), 0);
    const cat = { close_friend: 0, online_friend: 0, offline_friend: 0, family: 0, professional: 0 };
    const aiOn = [];
    friendNodes.forEach(n => {
      const c = n.category || 'online_friend';
      if (c === 'relative' || c === 'family') cat.family++;
      else if (c in cat) cat[c]++;
      else cat.professional++;
      if (isAiOnFor(n, routingConfig)) aiOn.push(n);
    });
    return { total, byMsgs, byReels, totalMsgs, totalReels, top, topMsgs, topReelSum, cat, aiOn };
  }, [friendNodes, routingConfig]);

  const botOnline = routingConfig?.globalBotActive !== false;
  const aiCoverage = pct(s.aiOn.length, s.total);
  const lead = s.top[0];
  const waiting = bizStats?.openHandoffs || 0;

  // 1. Story: how concentrated your messages are
  const story = lead ? {
    headline: <>{countWord(s.top.length)} {s.top.length === 1 ? 'person makes' : 'people make'} up <em>{pct(s.topMsgs, s.totalMsgs)}%</em> of all your messages.</>,
    sub: s.top.length > 1
      ? `${firstName(lead)} alone is ${pct(msgs(lead), s.totalMsgs)}%. The other ${plural(s.total - s.top.length, 'person', 'people')} share what's left.`
      : `${firstName(lead)} is the only person with messages so far.`,
    action: { label: `Open ${firstName(lead)}'s profile`, href: personHref(lead) },
    segments: [
      ...s.top.map((n, i) => ({ label: firstName(n), value: msgs(n), color: SHADES[i] })),
      { label: `${plural(s.total - s.top.length, 'other')}`, value: s.totalMsgs - s.topMsgs, color: OTHERS },
    ],
  } : {
    headline: 'Your story fills in as people message you.',
    sub: 'Message counts come from your synced Instagram chats.',
    action: { label: 'Open people', href: '/relationships' },
    segments: [],
  };

  // 2. Needs a look
  const aiNames = s.aiOn.slice(0, 1).map(firstName);
  const attention = [
    s.total === 0
      ? { tone: 'info', title: 'No people yet', text: 'People appear here after your Instagram chats sync.', action: { label: 'Open people', href: '/relationships' } }
      : s.aiOn.length < s.total - s.aiOn.length
      ? {
        tone: 'warn',
        title: s.aiOn.length ? `AI is off for ${s.total - s.aiOn.length} of ${s.total} people` : 'AI is off for everyone',
        text: s.aiOn.length
          ? `Only ${aiNames[0]}${s.aiOn.length > 1 ? ` and ${plural(s.aiOn.length - 1, 'other')}` : ''} ${s.aiOn.length > 1 ? 'get' : 'gets'} AI replies.`
          : 'Nobody gets automatic replies right now.',
        action: { label: 'Review', href: '/controls' },
      }
      : { tone: 'ok', title: `AI replies to ${s.aiOn.length} of ${s.total} people`, text: `${aiCoverage}% of your circle is covered.`, action: { label: 'Review', href: '/controls' } },
    s.cat.close_friend === 0
      ? { tone: 'info', title: 'Close circle is empty', text: s.total ? `${s.cat.online_friend} of ${s.total} people are filed as Online friends.` : 'Sort people into circles once they sync.', action: { label: 'Sort people', href: '/relationships' } }
      : { tone: 'ok', title: `${plural(s.cat.close_friend, 'person', 'people')} in your close circle`, text: 'They get your warmest replies.', action: { label: 'View', href: '/relationships' } },
    waiting > 0
      ? { tone: 'warn', title: `${plural(waiting, 'chat')} waiting for you`, text: 'The bot stepped back and asked for you.', action: { label: 'Open', href: '/relationships' } }
      : { tone: 'ok', title: 'No chats waiting for you', text: `Bot is ${botOnline ? 'online' : 'paused'} · replying to ${chatRuleLabel(routingConfig).toLowerCase()}.` },
  ];

  const rangeTotal = data?.totals ? data.totals.received + data.totals.ai : null;
  const stats = [
    { label: 'People', value: s.total, sub: 'In your circle' },
    { label: 'Messages', value: s.totalMsgs, sub: rangeTotal === null ? 'All time' : `All time · ${fmt(rangeTotal)} in the ${rangeWords(range)}` },
    { label: 'Reels shared', value: s.totalReels, sub: 'All time' },
    { label: 'AI coverage', value: `${aiCoverage}%`, sub: `${s.aiOn.length} of ${s.total} people get AI replies` },
  ];

  // 3. Highlights
  const highlights = [];
  if (lead) {
    const reelRank = s.byReels.indexOf(lead);
    highlights.push({ badge: firstName(lead)[0], title: `${firstName(lead)} is your #1`, text: `Most messages${reelRank >= 0 ? `, and #${reelRank + 1} for reels` : ''}.` });
  }
  const reeler = s.byReels[0];
  if (reeler && !s.top.includes(reeler)) {
    highlights.push({ badge: firstName(reeler)[0], title: `${firstName(reeler)} talks in reels`, text: `Top reel sharer (${fmt(reels(reeler))}) but not in your top 5 for messages.` });
  }
  if (s.totalReels > 0 && s.totalMsgs > 0) {
    const reelShare = pct(s.topReelSum, s.totalReels);
    const msgShare = pct(s.topMsgs, s.totalMsgs);
    highlights.push(reelShare > msgShare
      ? { badge: '5', title: 'Reels are even more concentrated', text: `Top 5 sharers send ${reelShare}% of all reels.` }
      : { badge: '5', title: 'Reels are more spread out', text: `Top 5 sharers send ${reelShare}% of reels, against ${msgShare}% of messages.` });
  }
  const peak = heatPeak(data?.heatmap);
  if (peak && highlights.length < 3) {
    highlights.push({ badge: peak.day[0], title: `${peak.dayName}s are busiest`, text: `${peak.windowShare}% of messages arrive ${peak.window}.` });
  }

  const boardRows = (board === 'messages' ? s.byMsgs : s.byReels).slice(0, 5).map(n => ({
    id: n.id,
    name: n.name || n.handle,
    handle: (n.handle || n.instagramHandle) ? `@${String(n.handle || n.instagramHandle).replace(/^@/, '')}` : '',
    value: board === 'messages' ? msgs(n) : reels(n),
    href: personHref(n),
    avatar: <ContactAvatar contact={n} size={28} showStatus={false} />,
  }));

  return (
    <>
      <StoryCard eyebrow={lead ? 'Your story so far' : 'Getting started'} {...story} />
      <AttentionCards items={attention} />
      <StatStrip items={stats} />

      {children}

      <div className="an-row">
        <VolumeChart
          title="Messages over time"
          data={data}
          loading={loading}
          range={range}
          keys={[
            { key: 'received', label: 'Received', color: 'var(--an-accent)' },
            { key: 'ai', label: 'Sent by AI', color: 'var(--an-accent-2)' },
          ]}
          totalLabel={`messages · ${rangeWords(range)}`}
          emptyText="No messages in this range yet. Try a longer range, or check back after new chats come in."
        />
        <Card title="AI replies" aside={<span className={`an-live${botOnline ? '' : ' off'}`}>{botOnline ? 'Bot online' : 'Bot paused'}</span>}>
          <div className="an-huge"><strong>{s.aiOn.length}</strong><span>of {plural(s.total, 'person', 'people')}</span></div>
          <Progress value={aiCoverage} />
          <KeyValues rows={[
            { label: 'Who gets AI replies', value: chatRuleLabel(routingConfig) },
            { label: 'Full AI', value: fmt(s.aiOn.length) },
            { label: 'Manual or paused', value: fmt(s.total - s.aiOn.length) },
          ]} />
          <Action action={{ label: 'Manage AI & routing', href: '/controls' }} className="an-link" />
        </Card>
      </div>

      <div className="an-row">
        <Card
          title="Most active people"
          aside={(
            <div className="an-seg" role="group" aria-label="Rank by">
              {[['messages', 'Messages'], ['reels', 'Reels']].map(([k, label]) => (
                <button key={k} type="button" aria-pressed={board === k} onClick={() => setBoard(k)}>{label}</button>
              ))}
            </div>
          )}
        >
          <Leaderboard rows={boardRows} emptyText={board === 'messages' ? 'No message counts yet.' : 'No reels shared yet.'} />
          {s.total > 0 && <Action action={{ label: `See all ${fmt(s.total)}`, href: '/relationships' }} className="an-link" />}
        </Card>
        <Card title="Your circle">
          <div className="an-huge"><strong>{s.total}</strong><span>{s.total === 1 ? 'person' : 'people'}</span></div>
          <SplitList parts={[
            { label: 'Online friends', value: s.cat.online_friend, color: 'var(--an-accent)' },
            { label: 'Offline friends', value: s.cat.offline_friend, color: 'var(--an-accent-2)' },
            { label: 'Family', value: s.cat.family, color: 'var(--an-orange)' },
            { label: 'Professional', value: s.cat.professional, color: 'var(--an-ok)' },
            { label: 'Close circle', value: s.cat.close_friend, color: '#e879f9', hollow: s.cat.close_friend === 0 },
          ]} />
        </Card>
      </div>

      <div className="an-row">
        <Heatmap
          title="When your circle messages you"
          grid={data?.heatmap}
          loading={loading}
          range={range}
          emptyText="No incoming messages in this range yet."
        />
        <Highlights items={highlights.slice(0, 3)} />
      </div>
    </>
  );
}
