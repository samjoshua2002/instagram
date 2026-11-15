'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Bell, Cake, PauseCircle, BotOff, ChevronRight, Users, Heart, HeartOff, Clock, User, Sparkles, Shuffle, ExternalLink, MessageCircle, Send, Hand, AlarmClock, Pause, Play, Check, KeyRound } from 'lucide-react';
import { SegIndicator } from './ui/motion';
import { useApp } from '../context/AppContext';
import { prefetchAmbientImages } from './AmbientBackground';
import { savedPhotoUrl, unavatarUrl, noteUnavatarFailed } from '../lib/utils';
import { abstractArt, useFreshBanner } from '../lib/banners';
import HomeBento from './HomeBento';
import PageCover from './PageCover';

/**
 * Home after login: "Hello, <name>!" greeting, spotlight cards with abstract
 * gradient art, a circle-pulse card, favourite people and a recent list.
 * Every card is a real contact from AppContext nodes; nothing is invented.
 */

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'close_friend', label: 'Close Circle' },
  { id: 'online_friend', label: 'Online Friends' },
  { id: 'offline_friend', label: 'Offline Friends' },
  { id: 'family', label: 'Family' },
  { id: 'professional', label: 'Professional' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));

// Abstract artwork now lives in lib/banners (shared with every banner); re-exported for older imports
export { abstractArt };

const personHref = p => `/relationships?person=${encodeURIComponent(p.id)}`;
const handleOf = p => (p.handle || '').replace(/^@/, '').trim();
const fmt = n => Number(n || 0).toLocaleString();

/** Saved photo (a fresh link is fetched when it has expired) -> unavatar -> initials on the page's own colour. */
function Photo({ person, className = '' }) {
  const { requestFreshPhoto } = useApp();
  const [stage, setStage] = useState(0);
  const handle = handleOf(person);
  const saved = savedPhotoUrl(person);
  const sources = [
    saved,
    unavatarUrl(handle),
  ].filter(Boolean);
  const src = sources[stage];

  // A new link from the server starts the chain again
  useEffect(() => { setStage(0); }, [saved]);
  // No saved photo at all: ask the server for one
  useEffect(() => { if (!saved && person.senderId) requestFreshPhoto?.(person.senderId); }, [saved, person.senderId, requestFreshPhoto]);

  const onError = () => {
    if (stage === 0 && saved && person.senderId) requestFreshPhoto?.(person.senderId);
    noteUnavatarFailed(src);
    setStage(s => s + 1);
  };
  const initials = (person.name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return (
    <div className={`sh-photo ${className}`}>
      {src ? (
        <img key={src} src={src} alt="" referrerPolicy="no-referrer" onError={onError} />
      ) : (
        <span className="sh-photo-initials">{initials}</span>
      )}
    </div>
  );
}

function daysUntil(dateStr) {
  const m = String(dateStr || '').match(/(\d{4}-)?(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), Number(m[2]) - 1, Number(m[3]));
  if (next < today) next = new Date(now.getFullYear() + 1, Number(m[2]) - 1, Number(m[3]));
  return Math.round((next - today) / 86400000);
}

const DAY_MS = 86400000;
const SNOOZE_KEY = 'chatter_home_followup_snooze';
const SNOOZE_DAYS = 3;

function daysSince(date) {
  const t = new Date(date || 0).getTime();
  return t > 0 ? Math.max(0, Math.floor((Date.now() - t) / DAY_MS)) : null;
}

/**
 * Follow-up suggestions built only from real contact data, most urgent first:
 * birthdays this week, quiet close friends / family, quiet frequent chats,
 * new chats worth keeping going, then people with no DMs yet.
 */
export function followUps(people, birthdays, limit = 6) {
  const out = [];
  const seen = new Set();
  const add = (p, kind, text) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    out.push({ p, kind, text });
  };
  const withQuiet = people.map(p => ({ p, quiet: daysSince(p.lastInteraction), chats: p.chatsCount || 0 }));
  const isClose = p => p.category === 'close_friend' || p.category === 'family';

  birthdays.filter(b => b.days <= 7).forEach(({ p, days }) => add(p, 'birthday',
    days === 0 ? 'Birthday today. Send a wish!' : `Birthday in ${days} day${days === 1 ? '' : 's'}. Plan a wish.`));
  withQuiet.filter(x => isClose(x.p) && x.chats > 0 && x.quiet >= 7)
    .sort((a, b) => b.quiet - a.quiet)
    .forEach(x => add(x.p, 'checkin', `No DMs for ${x.quiet} days. Check in?`));
  withQuiet.filter(x => x.chats >= 20 && x.quiet >= 14)
    .sort((a, b) => b.chats - a.chats)
    .forEach(x => add(x.p, 'quiet', `${fmt(x.chats)} DMs, but quiet for ${x.quiet} days. Follow up?`));
  withQuiet.filter(x => x.chats > 0 && x.chats <= 5 && x.quiet !== null && x.quiet >= 2 && x.quiet <= 30)
    .sort((a, b) => a.quiet - b.quiet)
    .forEach(x => add(x.p, 'keep', `New chat, last DM ${x.quiet} days ago. Keep it going.`));
  withQuiet.filter(x => x.chats === 0)
    .forEach(x => add(x.p, 'hello', 'No DMs yet. Say hello?'));
  return out.slice(0, limit);
}

/**
 * Choices for the top banner, built only from real contact data. A birthday today is
 * always first (pinned); the rest rotate so Home does not say the same thing every visit.
 */
export function todayStories(people, birthdays, follow) {
  const withDays = people.map(p => ({ p, d: daysSince(p.lastInteraction) }));
  const today = withDays.filter(x => x.d === 0).map(x => x.p);
  const week = withDays.filter(x => x.d !== null && x.d <= 7).map(x => x.p);
  const byChats = list => [...list].sort((a, b) => (b.chatsCount || 0) - (a.chatsCount || 0));
  const totalChats = people.reduce((s, p) => s + (p.chatsCount || 0), 0);
  const totalReels = people.reduce((s, p) => s + (p.reelsCount || 0), 0);
  const names = list => {
    const n = list.slice(0, 2).map(p => p.name.split(' ')[0]);
    return list.length > 2 ? `${n.join(', ')} and ${list.length - 2} more` : n.join(' and ');
  };
  const pill = (value, label) => ({ value, label });
  const base = [
    pill(people.length, people.length === 1 ? 'person' : 'people'),
    pill(totalChats, 'DMs'),
    pill(follow.length, 'to follow up'),
  ];
  const pinned = [];
  const stories = [];

  const bdToday = birthdays.filter(b => b.days === 0);
  if (bdToday.length) pinned.push({
    key: 'bd-today', title: `It's ${names(bdToday.map(b => b.p))}'s birthday`,
    sub: 'Today is the day. Send a wish!', href: personHref(bdToday[0].p), cta: 'Open',
    pills: [pill(bdToday.length, bdToday.length === 1 ? 'birthday today' : 'birthdays today'), base[2]],
  });
  const bdSoon = birthdays.filter(b => b.days > 0 && b.days <= 7);
  if (bdSoon.length) stories.push({
    key: 'bd-soon', title: `${bdSoon[0].p.name.split(' ')[0]}'s birthday is in ${bdSoon[0].days} day${bdSoon[0].days === 1 ? '' : 's'}`,
    sub: bdSoon.length > 1 ? `${bdSoon.length} birthdays this week. Plan your wishes.` : 'Plan a wish ahead of time.',
    href: personHref(bdSoon[0].p), cta: 'Open',
    pills: [pill(bdSoon.length, 'this week'), pill(birthdays.length, 'in 30 days')],
  });
  if (today.length) stories.push({
    key: 'today', title: `You chatted with ${today.length} ${today.length === 1 ? 'person' : 'people'} today`,
    sub: names(byChats(today)), href: '/relationships', cta: 'People',
    pills: [pill(today.length, 'today'), pill(week.length, 'this week'), base[2]],
  });
  if (follow.length) stories.push({
    key: 'follow', title: {
      birthday: `Wish ${follow[0].p.name.split(' ')[0]} a happy birthday`,
      hello: `Say hello to ${follow[0].p.name.split(' ')[0]}`,
    }[follow[0].kind] || `${follow[0].p.name.split(' ')[0]} could use a message`,
    sub: follow[0].text, href: personHref(follow[0].p), cta: 'Open',
    pills: [base[2], pill(week.length, 'active this week')],
  });
  const topWeek = byChats(week)[0];
  if (topWeek && topWeek.chatsCount > 0) stories.push({
    key: 'top-week', title: `${topWeek.name.split(' ')[0]} is your top chat this week`,
    sub: `${fmt(topWeek.chatsCount)} DMs together so far.`, href: personHref(topWeek), cta: 'Open',
    pills: [pill(week.length, 'active this week'), base[1]],
  });
  const topAll = byChats(people)[0];
  if (topAll && topAll.chatsCount > 0 && topAll !== topWeek) stories.push({
    key: 'top-all', title: `${topAll.name.split(' ')[0]} leads your circle`,
    sub: `${fmt(topAll.chatsCount)} of your ${fmt(totalChats)} DMs are with ${topAll.name.split(' ')[0]}.`,
    href: personHref(topAll), cta: 'Open', pills: [base[0], base[1]],
  });
  if (totalReels > 0) stories.push({
    key: 'reels', title: `${fmt(totalReels)} reels shared`,
    sub: 'Everything your circle has sent you in DMs.', href: '/relationships', cta: 'People',
    pills: [base[0], pill(totalReels, 'reels')],
  });
  stories.push({ key: 'circle', title: 'Your circle today', sub: '', href: '/relationships', cta: 'People', pills: base });
  return { pinned, stories };
}

function greeting(hour) {
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const FOLLOW_ICON ={ birthday: Cake, checkin: Heart, quiet: AlarmClock, keep: MessageCircle, hello: Hand };

function readSnoozed() {
  try {
    const all = JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}');
    const now = Date.now();
    return Object.fromEntries(Object.entries(all).filter(([, until]) => until > now));
  } catch { return {}; }
}

/** "Follow up" card list: open the Instagram DM, or hide a suggestion for a few days. */
function FollowUps({ items, later, pressProps }) {
  if (!items.length) return null;
  return (
    <section aria-label="Follow up">
      <div className="sh-row-head">
        <h2>Follow up</h2>
        <span className="sh-row-note">Suggested for you</span>
      </div>
      <ul className="sh-follow">
        {items.map(({ p, kind, text }) => {
          const Icon = FOLLOW_ICON[kind] || MessageCircle;
          const handle = handleOf(p);
          return (
            <li key={p.id} className={`sh-follow-item sh-follow-${kind}`}>
              <Link href={personHref(p)} className="sh-follow-main sh-pressable" {...pressProps(p)}>
                <span className="sh-follow-photo-wrap">
                  <Photo person={p} className="sh-follow-photo" />
                  <span className="sh-follow-badge" aria-hidden="true"><Icon size={12} /></span>
                </span>
                <span className="sh-follow-text">
                  <span className="sh-follow-name">{p.name}</span>
                  <span className="sh-follow-why">{text}</span>
                </span>
              </Link>
              <div className="sh-follow-actions">
                {handle ? (
                  <a href={`https://ig.me/m/${encodeURIComponent(handle)}`} target="_blank" rel="noreferrer" className="sh-follow-btn" aria-label={`Message ${p.name} on Instagram`}>
                    <Send size={15} /><span>Message</span>
                  </a>
                ) : (
                  <Link href={personHref(p)} className="sh-follow-btn" aria-label={`Open ${p.name}`}>
                    <User size={15} /><span>Open</span>
                  </Link>
                )}
                <button type="button" className="sh-follow-later" onClick={() => later(p.id)} aria-label={`Remind me about ${p.name} in ${SNOOZE_DAYS} days`} title={`Remind me in ${SNOOZE_DAYS} days`}>
                  <Clock size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Small row of headline numbers; the full dashboard lives at /analytics (Settings > Analytics). */
export function StatStrip({ stats }) {
  return (
    <div className="sh-stats">
      {stats.map(s => (
        <Link key={s.label} href={s.href} className="sh-stat">
          <span className="sh-stat-num">{s.value === null || s.value === undefined ? '-' : fmt(s.value)}</span>
          <span className="sh-stat-label">{s.label}</span>
        </Link>
      ))}
    </div>
  );
}

/** GET /api/home/summary (replies, people, handoffs, Instagram token), refreshed every minute. */
function useHomeSummary(apiBase) {
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/home/summary?tzOffset=${new Date().getTimezoneOffset()}`);
      if (res.ok) setData(await res.json());
    } catch { /* offline: keep the last numbers */ }
  }, [apiBase]);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);
  return [data, setData, load];
}

function waitText(mins) {
  if (mins < 1) return 'Waiting just now';
  if (mins < 60) return `Waiting ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `Waiting ${h} h${mins % 60 ? ` ${mins % 60} min` : ''}`;
  const d = Math.floor(h / 24);
  return `Waiting ${d} day${d === 1 ? '' : 's'}`;
}

/**
 * "Needs your attention": chats the AI handed to the owner (oldest first) and an Instagram
 * token that is expiring. Done turns the AI back on for that chat, which clears the handoff.
 */
function NeedsAttention({ summary, people, onDone }) {
  const bySender = useMemo(() => new Map(people.filter(p => p.senderId).map(p => [String(p.senderId), p])), [people]);
  if (!summary) return null;
  const { handoffs, instagram } = summary;
  const tokenIssue = instagram && instagram.status !== 'green';
  if (!handoffs.items.length && !tokenIssue) return null;
  return (
    <section aria-label="Needs your attention">
      <div className="sh-row-head">
        <h2>Needs your attention</h2>
        {handoffs.total > handoffs.items.length && <Link href="/relationships" className="sh-link">All {fmt(handoffs.total)}</Link>}
      </div>
      <ul className="sh-follow">
        {tokenIssue && (
          <li className="sh-follow-item sh-attn-token">
            <Link href="/settings" className="sh-follow-main">
              <span className="sh-attn-icon" aria-hidden="true"><KeyRound size={20} /></span>
              <span className="sh-follow-text">
                <span className="sh-follow-name">{instagram.connected ? 'Instagram sign-in is expiring' : 'Instagram is not connected'}</span>
                <span className="sh-follow-why">
                  {!instagram.connected ? 'Replies stop until you connect Instagram again.'
                    : instagram.daysLeft !== null && instagram.daysLeft > 0 ? `${instagram.daysLeft} day${instagram.daysLeft === 1 ? '' : 's'} left. Reconnect in Settings to keep replies going.`
                      : 'It has expired. Reconnect in Settings to keep replies going.'}
                </span>
              </span>
            </Link>
            <div className="sh-follow-actions">
              <Link href="/settings" className="sh-follow-btn" aria-label="Open Settings to reconnect Instagram"><ChevronRight size={15} /><span>Fix</span></Link>
            </div>
          </li>
        )}
        {handoffs.items.map(h => {
          const p = bySender.get(String(h.senderId));
          const name = p?.name || h.name || (h.username ? `@${h.username}` : 'Someone');
          // The inbox lists every conversation; Controls has no handoff list
          const href = p ? personHref(p) : '/relationships';
          const why = [waitText(h.waitingMinutes), h.reason].filter(Boolean).join(' · ');
          return (
            <li key={h.senderId} className="sh-follow-item">
              <Link href={href} className="sh-follow-main">
                <span className="sh-follow-photo-wrap">
                  <Photo person={p || { name, handle: h.username }} className="sh-follow-photo" />
                  <span className="sh-follow-badge sh-attn-badge" aria-hidden="true"><Hand size={12} /></span>
                </span>
                <span className="sh-follow-text">
                  <span className="sh-follow-name">{name}</span>
                  <span className="sh-follow-why">{why}</span>
                </span>
              </Link>
              <div className="sh-follow-actions">
                <button type="button" className="sh-follow-btn" onClick={() => onDone(h, name)} aria-label={`Done with ${name}: turn AI replies back on`} title="Done: AI replies again">
                  <Check size={15} /><span>Done</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Tiny line of daily values; decorative (the tile text carries the numbers). */
function Sparkline({ values }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(1, ...values);
  const w = 100;
  const h = 28;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
  return (
    <svg className="sh-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Week-on-week change: percent for counts, points for a share. */
function weekChange(now, before, unit = '%', than = 'last week') {
  if (now === null || before === null || now === undefined || before === undefined) return { text: `No data ${than}`, dir: 0 };
  if (unit === 'pts') {
    const d = now - before;
    return { text: d === 0 ? `Same as ${than}` : `${d > 0 ? '+' : '−'}${Math.abs(d)} pts vs ${than}`, dir: Math.sign(d) };
  }
  if (before === 0) return now === 0 ? { text: `Same as ${than}`, dir: 0 } : { text: `Up from none ${than}`, dir: 1 };
  const pct = Math.round(((now - before) / before) * 100);
  return { text: pct === 0 ? `Same as ${than}` : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% vs ${than}`, dir: Math.sign(pct) };
}

/** This week's headline numbers, each with its change from last week and a 7-day sparkline. */
function KpiRow({ summary }) {
  // The AI-share ring beside the chart already shows this week's AI / your replies and the share, so these tiles
  // show what nothing else on Home does: today, the daily pace, the busiest day and who you talked to.
  const r = summary?.replies;
  const days = summary?.days || [];
  const totals = r ? r.ai.map((a, i) => a + (r.human[i] || 0)) : null;
  const lastSeven = arr => (arr ? arr.slice(-7) : null);
  const today = totals ? totals[totals.length - 1] : null;
  const yesterday = totals && totals.length > 1 ? totals[totals.length - 2] : null;
  const avg = arr => (arr && arr.length ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : null);
  const thisAvg = totals ? avg(totals.slice(-7)) : null;
  const lastAvg = totals && totals.length >= 14 ? avg(totals.slice(-14, -7)) : null;
  const best = totals ? totals.reduce((bi, v, i) => (v > totals[bi] ? i : bi), 0) : -1;
  const bestDay = best >= 0 && days[best] && totals[best] > 0
    ? new Date(`${days[best]}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    : null;
  const tiles = [
    { label: 'Replies today', value: today, change: yesterday !== null && weekChange(today, yesterday, '%', 'yesterday'), spark: lastSeven(totals), href: '/analytics' },
    { label: 'Daily average', value: thisAvg, change: lastAvg !== null && weekChange(thisAvg, lastAvg), spark: lastSeven(totals), href: '/analytics' },
    { label: 'Busiest day', value: best >= 0 ? totals[best] : null, change: bestDay && { dir: 0, text: bestDay }, spark: totals ? totals.slice(-14) : null, href: '/analytics' },
    { label: 'People messaged', value: summary?.people.thisWeek, change: summary && weekChange(summary.people.thisWeek, summary.people.lastWeek), spark: lastSeven(summary?.people.daily), href: '/relationships' },
    // Phones only: the AI-share ring is hidden there, so its number joins this row
    { label: 'AI share', value: Number.isFinite(summary?.aiShare?.thisWeek) ? Math.round(summary.aiShare.thisWeek) : null, suffix: '%', change: summary && Number.isFinite(summary.aiShare?.lastWeek) && weekChange(Math.round(summary.aiShare.thisWeek), Math.round(summary.aiShare.lastWeek), 'pts'), href: '/controls', phone: true },
  ];
  return (
    <div className="sh-stats sh-kpis">
      {tiles.map(t => (
        <Link key={t.label} href={t.href} className={`sh-stat${t.phone ? ' sh-stat-phone' : ''}`}>
          <span className="sh-stat-label">{t.label}</span>
          <span className="sh-stat-num">{t.value === null || t.value === undefined ? '-' : `${fmt(t.value)}${t.suffix || ''}`}</span>
          <Sparkline values={t.spark} />
          {t.change && <span className={`sh-kpi-change${t.change.dir > 0 ? ' up' : t.change.dir < 0 ? ' down' : ''}`}>{t.change.text}</span>}
        </Link>
      ))}
    </div>
  );
}

// General facts shown next to facts built from the user's own contacts
const GENERAL_FACTS = [
  'Instagram launched on 6 October 2010 and was only on the iPhone at first.',
  'Facebook bought Instagram in 2012 for about 1 billion dollars.',
  'Instagram Direct, the DM inbox, arrived in December 2013.',
  'Reels came to Instagram in August 2020.',
  'Most people can keep about 150 stable friendships at once. This is called Dunbar\'s number.',
  'People laugh far more often with others than when they are alone.',
  'A quick reply makes a chat feel warmer: people rate fast responders as more friendly.',
  'Stories on Instagram started in August 2016 and disappear after 24 hours.',
];

/** Facts built from real contact numbers; only the ones the data supports are returned. */
function personalFacts(people) {
  const facts = [];
  const byChats = [...people].sort((a, b) => (b.chatsCount || 0) - (a.chatsCount || 0));
  const byReels = [...people].sort((a, b) => (b.reelsCount || 0) - (a.reelsCount || 0));
  const totalChats = people.reduce((s, p) => s + (p.chatsCount || 0), 0);
  const totalReels = people.reduce((s, p) => s + (p.reelsCount || 0), 0);
  if (byChats[0]?.chatsCount > 0) facts.push(`You have swapped ${fmt(byChats[0].chatsCount)} DMs with ${byChats[0].name}, more than anyone else.`);
  if (byReels[0]?.reelsCount > 0) facts.push(`${byReels[0].name} has shared ${fmt(byReels[0].reelsCount)} reels with you, the most in your circle.`);
  if (totalChats > 0 && people.length > 1) facts.push(`On average you have ${fmt(Math.round(totalChats / people.length))} DMs with each person in your circle.`);
  if (totalReels > 0) facts.push(`Your circle has shared ${fmt(totalReels)} reels in total.`);
  const close = people.filter(p => p.category === 'close_friend').length;
  if (close > 0) facts.push(`${close} ${close === 1 ? 'person is' : 'people are'} in your Close Circle.`);
  const quiet = people.filter(p => !(p.chatsCount > 0)).length;
  if (quiet > 0) facts.push(`${quiet} ${quiet === 1 ? 'person has' : 'people have'} no DMs yet. A short hello could start something.`);
  return facts;
}

/** "Did you know?" card: looks like a spotlight card, shows a random fact each time Home opens. */
function FactCard({ people }) {
  const facts = useMemo(() => [...personalFacts(people), ...GENERAL_FACTS], [people]);
  const [index, setIndex] = useState(null);
  // Picked after mount (not during render) so server and browser HTML match
  useEffect(() => { setIndex(Math.floor(Math.random() * facts.length)); }, [facts.length]);
  const next = () => setIndex(i => {
    if (facts.length < 2) return i;
    let n = i;
    while (n === i) n = Math.floor(Math.random() * facts.length);
    return n;
  });
  const fact = index === null ? null : facts[index % facts.length];
  return (
    <section className="sh-fact" aria-label="Did you know?">
      <span className="sh-fact-icon" aria-hidden="true"><Sparkles size={20} /></span>
      <span className="sh-fact-text">
        <span className="sh-fact-label">Did you know?</span>
        <span className="sh-fact-body" aria-live="polite">{fact || '\u00a0'}</span>
      </span>
      <button type="button" className="sh-fact-btn" onClick={next} aria-label="Show another fact">
        <Shuffle size={16} />
      </button>
    </section>
  );
}

/**
 * Long press (touch, 500 ms) or right-click on a card opens the profile menu.
 * Moving the finger (scrolling a row) cancels it; the tap after a long press does not open the link.
 */
function useLongPress(onOpen) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const clear = () => { clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);
  return useCallback(person => ({
    onPointerDown: e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch { /* not supported */ } }
        onOpen(person, start.current.x, start.current.y);
      }, 500);
    },
    onPointerMove: e => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: e => {
      e.preventDefault();
      clear();
      fired.current = true;
      onOpen(person, e.clientX, e.clientY);
    },
    onClickCapture: e => {
      if (fired.current) { e.preventDefault(); e.stopPropagation(); fired.current = false; }
    },
  }), [onOpen]);
}

/** Small menu shown after a long press: add/remove favourite, open profile. */
function ProfileMenu({ menu, isFavourite, onToggle, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });
  useEffect(() => {
    // Keep the menu inside the screen
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(12, Math.min(menu.x, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(menu.y, window.innerHeight - height - 12)),
    });
    el.querySelector('button, a')?.focus({ preventScroll: true });
  }, [menu.x, menu.y]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  const p = menu.person;
  // Portaled to <body>: inside the Home page (isolation: isolate) the menu would sit under the phone tab bar
  return createPortal(
    <>
      <div className="sh-menu-backdrop" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div ref={ref} className="sh-menu" role="menu" aria-label={`Options for ${p.name}`} style={pos}>
        <div className="sh-menu-head">
          <Photo person={p} className="sh-menu-photo" />
          <span className="sh-menu-name">{p.name}</span>
        </div>
        <button type="button" role="menuitem" className="sh-menu-item" onClick={() => { onToggle(p, !isFavourite); onClose(); }}>
          {isFavourite ? <HeartOff size={18} /> : <Heart size={18} />}
          <span>{isFavourite ? 'Remove from favourites' : 'Add to favourites'}</span>
        </button>
        <Link href={personHref(p)} role="menuitem" className="sh-menu-item" onClick={onClose}>
          <ExternalLink size={18} />
          <span>Open profile</span>
        </Link>
      </div>
    </>,
    document.body
  );
}

/** Loading placeholder in the same shapes as Home's people sections (top chats, fact, favourites, list). */
function HomeSkeleton() {
  return (
    <div className="sh-skel" role="status" aria-label="Loading your people">
      <div className="sh-spot-row">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="sh-spot sh-skel-card">
            <span className="sh-skel-dot" />
            <span className="sh-skel-lines"><i style={{ width: '70%' }} /><i style={{ width: '45%' }} /></span>
          </div>
        ))}
      </div>
      <div className="sh-fact sh-skel-card"><span className="sh-skel-dot" /><span className="sh-skel-lines"><i style={{ width: '25%' }} /><i style={{ width: '80%' }} /></span></div>
      <div className="sh-row-head"><i className="sh-skel-bar" style={{ width: 160 }} /></div>
      <div className="sh-fav-row">
        {[0, 1, 2, 3, 4, 5].map(i => <span key={i} className="sh-fav"><span className="sh-fav-photo sh-skel-block" /><i className="sh-skel-bar" style={{ width: '70%' }} /></span>)}
      </div>
    </div>
  );
}

/** Notifications bell + list. Rendered in Home's header (desktop) and in the app header (phones). */
function HomeBell({ alerts, inHeader = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className={`sh-bell-wrap${inHeader ? ' sh-bell-hdr' : ''}`}>
      <button
        type="button"
        className={inHeader ? 'mobile-icon-btn sh-hdr-bell' : 'sh-icon-btn'}
        aria-label={`Notifications${alerts.length ? ` (${alerts.length})` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <Bell size={inHeader ? 18 : 20} />
        {alerts.length > 0 && <span className="sh-dot" />}
      </button>
      {open && (
        <div className="sh-alerts" role="dialog" aria-label="Notifications">
          {alerts.length === 0 && <div className="sh-alerts-empty">You're all caught up.</div>}
          {alerts.map(a => (
            <Link key={a.id} href={a.href} className="sh-alert" onClick={() => setOpen(false)}>
              <span className="sh-alert-icon"><a.icon size={16} /></span>
              <span className="sh-alert-text">{a.title}</span>
              <ChevronRight size={15} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SpotlightHome() {
  const { nodes, user, routingConfig, isSyncingInitial, setFavourite, toggleGlobalBot, showToast, API_BASE } = useApp();
  const [summary, setSummary, reloadSummary] = useHomeSummary(API_BASE);
  const botOn = routingConfig?.globalBotActive !== false;
  const [botBusy, setBotBusy] = useState(false);
  const flipBot = async () => {
    if (botBusy) return;
    setBotBusy(true);
    try { await toggleGlobalBot(); } finally { setBotBusy(false); }
  };
  // Done on a handoff: AI replies again for that chat (the server clears the handoff)
  const doneHandoff = async (h, name) => {
    const before = summary;
    setSummary(s => s && ({ ...s, handoffs: { total: Math.max(0, s.handoffs.total - 1), items: s.handoffs.items.filter(x => x.senderId !== h.senderId) } }));
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(h.senderId)}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiEnabled: true }),
      });
      if (!res.ok) throw new Error(`server answered ${res.status}`);
      showToast?.(`AI is replying to ${name} again`);
      reloadSummary();
    } catch (e) {
      setSummary(before);
      showToast?.(`Could not hand ${name} back to the AI: ${e.message}`, 'error');
    }
  };
  const [menu, setMenu] = useState(null); // { person, x, y } while the long-press menu is open
  const closeMenu = useCallback(() => setMenu(null), []);
  const openMenu = useCallback((person, x, y) => setMenu({ person, x, y }), []);
  const pressProps = useLongPress(openMenu);
  const [category, setCategory] = useState('all');
  const [headerSlot, setHeaderSlot] = useState(null);
  useEffect(() => { setHeaderSlot(document.getElementById('mobile-header-slot')); }, []);

  const people = useMemo(() => (nodes || []).filter(n => !n.isRoot && n.name), [nodes]);

  // Pre-compute each contact's page colours so tapping a card opens an already-tinted page
  // (saved photos only: looking up all 55 on unavatar.io used up its small daily free limit)
  useEffect(() => { prefetchAmbientImages(people.map(savedPhotoUrl)); }, [people]);
  const chips = useMemo(
    () => CATEGORIES.filter(c => c.id === 'all' || people.some(p => (p.category || 'online_friend') === c.id)),
    [people]
  );
  const filtered = useMemo(
    () => (category === 'all' ? people : people.filter(p => (p.category || 'online_friend') === category)),
    [people, category]
  );
  const score = p => (p.chatsCount || 0) + (p.reelsCount || 0) * 5;
  const spotlight = useMemo(() => [...filtered].sort((a, b) => score(b) - score(a)).slice(0, 8), [filtered]);
  // People the user added come first; the rest are suggestions (close friends, family, top chats)
  // unless the user removed them from favourites
  const favourites = useMemo(() => {
    const pinned = filtered.filter(p => p.isFavourite === true);
    const open = filtered.filter(p => p.isFavourite !== false);
    const suggested = open.filter(p => p.category === 'close_friend' || p.category === 'family')
      .concat([...open].sort((a, b) => (b.chatsCount || 0) - (a.chatsCount || 0)));
    return pinned.concat(suggested)
      .filter((p, i, arr) => arr.findIndex(q => q.id === p.id) === i)
      .slice(0, Math.max(10, pinned.length));
  }, [filtered]);
  const favouriteIds = useMemo(() => new Set(favourites.map(p => p.id)), [favourites]);
  const birthdays = useMemo(() => people
    .map(p => ({ p, days: daysUntil(p.dob || (p.importantDates || []).find(d => /birth|bday/i.test(d?.title || ''))?.date) }))
    .filter(x => x.days !== null && x.days <= 30)
    .sort((a, b) => a.days - b.days), [people]);
  const followAll = useMemo(() => followUps(people, birthdays, Infinity), [people, birthdays]);
  // Snoozed suggestions are hidden from the list and from the banner count
  const [snoozed, setSnoozed] = useState({});
  useEffect(() => { setSnoozed(readSnoozed()); }, []);
  const followOpen = useMemo(() => followAll.filter(f => !snoozed[f.p.id]), [followAll, snoozed]);
  const later = id => {
    const next = { ...readSnoozed(), [id]: Date.now() + SNOOZE_DAYS * DAY_MS };
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
    setSnoozed(next);
  };
  const { pinned, stories } = useMemo(() => todayStories(people, birthdays, followOpen), [people, birthdays, followOpen]);
  // Picked after mount (not during render) so server and browser HTML match; a new pick each visit
  const [pick, setPick] = useState(null);
  const [hour, setHour] = useState(null);
  useEffect(() => { setPick(Math.random()); setHour(new Date().getHours()); }, []);
  const story = pinned[0]
    || (pick === null ? stories[stories.length - 1] : stories[Math.floor(pick * stories.length)]);
  // People already suggested under Follow up are not repeated here
  const reconnect = useMemo(() => {
    const suggested = new Set(followAll.map(f => f.p.id));
    return [...filtered].filter(p => (p.chatsCount || 0) > 0 && !suggested.has(p.id))
      .sort((a, b) => (a.chatsCount || 0) - (b.chatsCount || 0)).slice(0, 10);
  }, [filtered, followAll]);

  // Messages that need you (invites, requests, money, urgent): newest first in the bell
  const [needsYou, setNeedsYou] = useState([]);
  const [aiQuestions, setAiQuestions] = useState(0);
  useEffect(() => {
    fetch(`${API_BASE}/api/memory-index/questions`).then(r => (r.ok ? r.json() : null)).then(d => setAiQuestions(d?.total || 0)).catch(() => {});
  }, [API_BASE]);
  useEffect(() => {
    const load = () => fetch(`${API_BASE}/api/shared/needs-you`).then(r => (r.ok ? r.json() : { items: [] }))
      .then(d => setNeedsYou(d.items || [])).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [API_BASE]);

  // Quiz nudge, always shown: answering real messages keeps the AI's replies sounding like you
  const [quiz, setQuiz] = useState(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/quiz/status`).then(r => (r.ok ? r.json() : null)).then(setQuiz).catch(() => {});
  }, [API_BASE]);
  const quizTitle = !quiz ? 'Train your clone with real messages'
    : quiz.waiting === null || quiz.waiting === 0 ? `New real messages to answer${quiz.match != null ? ` · AI ${quiz.match}% like you` : ''}`
      : `${quiz.waiting} real message${quiz.waiting === 1 ? '' : 's'} waiting${quiz.match != null ? ` · AI ${quiz.match}% like you` : ''}`;

  const paused = people.filter(p => p.aiEnabled === false);
  const alerts = [
    { id: 'quiz', icon: Sparkles, title: `Train your clone: ${quizTitle}`, href: '/quiz' },
    aiQuestions > 0 && { id: 'ai-questions', icon: Sparkles, title: `The AI has ${aiQuestions} question${aiQuestions === 1 ? '' : 's'} about your people`, href: '/' },
    ...needsYou.slice(0, 8).map(it => ({
      id: `need-${it._id}`, icon: Bell, title: it.summary || `${it.name || 'Someone'} needs you`,
      href: `/relationships?person=${encodeURIComponent(people.find(p => String(p.senderId) === String(it.senderId))?.id || '')}`,
    })),
    routingConfig && routingConfig.globalBotActive === false && { id: 'bot', icon: BotOff, title: 'Automation is paused', href: '/controls' },
    ...birthdays.slice(0, 5).map(({ p, days }) => ({
      id: `bd-${p.id}`, icon: Cake, href: personHref(p),
      title: days === 0 ? `${p.name}'s birthday is today` : `${p.name}'s birthday in ${days} day${days === 1 ? '' : 's'}`,
    })),
    paused.length > 0 && { id: 'paused', icon: PauseCircle, title: `${paused.length} with AI paused`, href: '/controls' },
  ].filter(Boolean);

  // One Unsplash photo per visit: it is the cover behind the greeting, and every colour on Home (and the
  // sidebar) comes from it. No other photo is shown, so nothing on the page clashes with it.
  const coverPhoto = useFreshBanner('home-cover', 'abstract');
  const firstName = (user?.firstName || user?.name || user?.username || '').split(' ')[0];

  return (
    <div className={`sh-home sh-v2${coverPhoto ? ' sh-tinted' : ''}`}>
      <PageCover seed="home-cover" photo={coverPhoto} />
      <header className="sh-top">
        {/* Two parts so a narrow phone breaks only after the comma, never inside "Good afternoon" */}
        <h1 className="sh-hello">
          <span className="sh-hello-greet">{hour === null ? 'Hello' : greeting(hour)},</span>{' '}
          <span className="sh-hello-name">{firstName || 'there'}!</span>
        </h1>
        <div className="sh-top-actions">
        {routingConfig && (
          <button
            type="button"
            role="switch"
            aria-checked={botOn}
            className={`sh-ai-pill${botOn ? ' on' : ''}`}
            onClick={flipBot}
            disabled={botBusy}
            title={botOn ? 'AI is replying to DMs. Tap to pause.' : 'AI replies are paused. Tap to start.'}
          >
            <span className="sh-ai-dot" aria-hidden="true" />
            <span className="sh-ai-label">{botOn ? 'AI on' : 'AI paused'}</span>
            {botOn ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          </button>
        )}
        <a href="/quiz" className="sh-quiz-pill" title="Answer real messages so the AI replies more like you">
          <Sparkles size={14} aria-hidden="true" />
          <span>{quiz?.waiting ? `Quiz · ${quiz.waiting} waiting` : 'Train your clone'}</span>
          {quiz?.match != null && <b>{quiz.match}%</b>}
        </a>
        <HomeBell alerts={alerts} />
        </div>
      </header>
      {/* Phones: the bell sits in the app header; the header's mode chip is the AI switch */}
      {headerSlot && createPortal(<HomeBell alerts={alerts} inHeader />, headerSlot)}

      {/* Today's line sits on the cover photo itself (no second photo, no card) */}
      <section className="sh-banner" aria-label="Today">
        <div className="sh-banner-text">
          <span className="sh-banner-eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h2 className="sh-banner-title">{people.length > 0 ? story.title : 'Your circle today'}</h2>
          {people.length > 0 ? (
            <>
              {story.sub && <span className="sh-banner-sub">{story.sub}</span>}
              <div className="sh-banner-pills">
                {story.pills.map(s => (
                  <span key={s.label} className="sh-pill"><b>{fmt(s.value)}</b> {s.label}</span>
                ))}
              </div>
            </>
          ) : (
            <span className="sh-banner-sub">People appear here once Instagram DMs sync.</span>
          )}
        </div>
        <Link href={people.length > 0 ? story.href : '/relationships'} className="sh-banner-btn" aria-label={`Open ${people.length > 0 ? story.cta : 'People'}`}>
          <span>{people.length > 0 ? story.cta : 'People'}</span><ChevronRight size={18} />
        </Link>
      </section>

      <NeedsAttention summary={summary} people={people} onDone={doneHandoff} />

      <div className="sh-row-head">
        <h2>Your dashboard</h2>
        <Link href="/analytics" className="sh-link">Full analytics</Link>
      </div>
      <HomeBento
        summary={summary}
        people={people}
        routingConfig={routingConfig}
        botOn={botOn}
        personHref={personHref}
        Photo={Photo}
        labels={CATEGORY_LABEL}
        kpis={<KpiRow summary={summary} />}
        loading={people.length === 0 && isSyncingInitial}
      />

      {people.length > 0 && <FollowUps items={followOpen.slice(0, 4)} later={later} pressProps={pressProps} />}

      {people.length > 0 && chips.length > 2 && (
        <div className="sh-chips" role="tablist" aria-label="Filter by category">
          {chips.map(c => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              className={`sh-chip${category === c.id ? ' active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              {category === c.id && <SegIndicator id="seg-spotlight" />}
              {c.label}
            </button>
          ))}
        </div>
      )}

      {people.length === 0 && isSyncingInitial ? (
        <HomeSkeleton />
      ) : people.length === 0 ? (
        <div className="sh-empty">
          <div className="sh-empty-title">Your circle is empty</div>
          <p>People appear here once Instagram DMs sync or you add someone.</p>
          <Link href="/relationships" className="sh-btn">Open People</Link>
        </div>
      ) : (
        <>
          {/* Top chats: the person's own photo is the card (no artwork behind it) */}
          <section aria-label="Top chats">
            <div className="sh-spot-row">
              {spotlight.map(p => (
                <Link key={p.id} href={personHref(p)} className="sh-spot sh-pressable" {...pressProps(p)}>
                  <Photo person={p} className="sh-spot-avatar" />
                  <span className="sh-spot-text">
                    <span className="sh-spot-name">{p.name}</span>
                    <span className="sh-spot-sub">
                      {handleOf(p) ? `@${handleOf(p)}` : CATEGORY_LABEL[p.category || 'online_friend']}
                    </span>
                  </span>
                  <span className="sh-spot-count"><b>{fmt(p.chatsCount)}</b> DMs</span>
                </Link>
              ))}
            </div>
          </section>

          <FactCard people={people} />

          {favourites.length > 0 && (
            <>
              <div className="sh-row-head"><h2>Favourite people</h2><Link href="/relationships" className="sh-link">Show all</Link></div>
              <div className="sh-fav-row">
                {favourites.map(p => (
                  <Link key={p.id} href={personHref(p)} className="sh-fav sh-pressable" {...pressProps(p)}>
                    <Photo person={p} className="sh-fav-photo" />
                    <span className="sh-fav-name">{p.name}</span>
                    <span className="sh-fav-sub">{CATEGORY_LABEL[p.category || 'online_friend'] || p.relationship || 'Friend'}</span>
                  </Link>
                ))}
              </div>
            </>
          )}

          {reconnect.length > 0 && (
            <>
              <div className="sh-row-head"><h2>Reconnect with</h2></div>
              <ul className="sh-list">
                {reconnect.map(p => (
                  <li key={p.id}>
                    <Link href={personHref(p)} className="sh-list-item sh-pressable" {...pressProps(p)}>
                      <Photo person={p} className="sh-list-photo" />
                      <span className="sh-list-main">
                        <span className="sh-list-name">{p.name}</span>
                        <span className="sh-list-sub">{handleOf(p) ? `@${handleOf(p)}` : (CATEGORY_LABEL[p.category || 'online_friend'] || p.relationship || 'Friend')} · {fmt(p.chatsCount)} DMs</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          <nav className="sh-quicknav" aria-label="Shortcuts">
            <Link href="/relationships"><User size={22} /><span>People</span></Link>
            <Link href="/storyboard"><Users size={22} /><span>Circle</span></Link>
            <Link href="/memories"><Heart size={22} /><span>Memories</span></Link>
            <Link href="/analytics"><Clock size={22} /><span>Activity</span></Link>
          </nav>
        </>
      )}

      {menu && (
        <ProfileMenu
          menu={menu}
          isFavourite={favouriteIds.has(menu.person.id)}
          onToggle={setFavourite}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
