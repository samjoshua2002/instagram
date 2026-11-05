'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, Cake, PauseCircle, BotOff, ChevronRight, Users, Heart, Clock, User } from 'lucide-react';
import { useApp } from '../context/AppContext';
import PageSkeleton from './Skeletons';
import { prefetchAmbientImages } from './AmbientBackground';
import { personArtUrl } from '../lib/utils';

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

// Colour sets for the abstract artwork (warm reds, sunset, ocean, violet, peach)
const PALETTES = [
  ['#ff3d5a', '#ff9a8b', '#6a8dff'],
  ['#ff5e3a', '#ffcf6b', '#e8115b'],
  ['#2f80ed', '#56ccf2', '#ff6b8b'],
  ['#8e2de2', '#ff6fd8', '#ff9966'],
  ['#ff4e50', '#f9d423', '#c31432'],
  ['#ff758c', '#ff7eb3', '#3a1c71'],
  ['#00c6ff', '#ff3a6e', '#fbd786'],
];

const hash = s => [...String(s || '?')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Deterministic abstract "blurred light" artwork for a name. */
export function abstractArt(seed) {
  const h = hash(seed);
  const [a, b, c] = PALETTES[h % PALETTES.length];
  const x1 = 15 + (h % 50), y1 = 10 + ((h >> 3) % 50), x2 = 55 + ((h >> 5) % 40), y2 = 45 + ((h >> 7) % 50);
  return [
    `radial-gradient(circle at ${x1}% ${y1}%, ${a} 0%, transparent 55%)`,
    `radial-gradient(circle at ${x2}% ${y2}%, ${b} 0%, transparent 50%)`,
    `radial-gradient(circle at ${100 - x1}% ${100 - y2 / 2}%, ${c} 0%, transparent 60%)`,
    `linear-gradient(${(h % 360)}deg, ${c}, ${a})`,
  ].join(', ');
}

const personHref = p => `/relationships?person=${encodeURIComponent(p.id)}`;
const handleOf = p => (p.handle || '').replace(/^@/, '').trim();
const fmt = n => Number(n || 0).toLocaleString();

/** Photo -> unavatar -> abstract artwork. */
function Photo({ person, className = '' }) {
  const [stage, setStage] = useState(0);
  const handle = handleOf(person);
  const sources = [
    person.profilePic?.startsWith('http') ? person.profilePic : null,
    handle ? `https://unavatar.io/instagram/${handle}?fallback=false` : null,
  ].filter(Boolean);
  const src = sources[stage];
  const initials = (person.name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return (
    <div className={`sh-photo ${className}`} style={{ backgroundImage: abstractArt(person.name) }}>
      {src ? (
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setStage(s => s + 1)} />
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

export default function SpotlightHome() {
  const { nodes, user, routingConfig, isSyncingInitial } = useApp();
  const [category, setCategory] = useState('all');
  const [showAlerts, setShowAlerts] = useState(false);

  const people = useMemo(() => (nodes || []).filter(n => !n.isRoot && n.name), [nodes]);

  // Pre-compute each contact's page colours so tapping a card opens an already-tinted page
  useEffect(() => { prefetchAmbientImages(people.map(personArtUrl)); }, [people]);
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
  const favourites = useMemo(
    () => [...filtered].filter(p => p.category === 'close_friend' || p.category === 'family')
      .concat([...filtered].sort((a, b) => (b.chatsCount || 0) - (a.chatsCount || 0)))
      .filter((p, i, arr) => arr.findIndex(q => q.id === p.id) === i)
      .slice(0, 10),
    [filtered]
  );
  const reconnect = useMemo(
    () => [...filtered].filter(p => (p.chatsCount || 0) > 0).sort((a, b) => (a.chatsCount || 0) - (b.chatsCount || 0)).slice(0, 10),
    [filtered]
  );
  const totalChats = filtered.reduce((s, p) => s + (p.chatsCount || 0), 0);
  const totalReels = filtered.reduce((s, p) => s + (p.reelsCount || 0), 0);

  const birthdays = useMemo(() => people
    .map(p => ({ p, days: daysUntil(p.dob || (p.importantDates || []).find(d => /birth|bday/i.test(d?.title || ''))?.date) }))
    .filter(x => x.days !== null && x.days <= 30)
    .sort((a, b) => a.days - b.days), [people]);
  const paused = people.filter(p => p.aiEnabled === false);
  const alerts = [
    routingConfig && routingConfig.globalBotActive === false && { id: 'bot', icon: BotOff, title: 'Automation is paused', href: '/controls' },
    ...birthdays.slice(0, 5).map(({ p, days }) => ({
      id: `bd-${p.id}`, icon: Cake, href: personHref(p),
      title: days === 0 ? `${p.name}'s birthday is today` : `${p.name}'s birthday in ${days} day${days === 1 ? '' : 's'}`,
    })),
    paused.length > 0 && { id: 'paused', icon: PauseCircle, title: `${paused.length} with AI paused`, href: '/controls' },
  ].filter(Boolean);

  const firstName = (user?.firstName || user?.name || user?.username || '').split(' ')[0];

  return (
    <div className="sh-home">
      <header className="sh-top">
        <h1 className="sh-hello">Hello, {firstName || 'there'}!</h1>
        <div className="sh-bell-wrap">
          <button
            type="button"
            className="sh-icon-btn"
            aria-label={`Notifications${alerts.length ? ` (${alerts.length})` : ''}`}
            aria-expanded={showAlerts}
            onClick={() => setShowAlerts(v => !v)}
          >
            <Bell size={20} />
            {alerts.length > 0 && <span className="sh-dot" />}
          </button>
          {showAlerts && (
            <div className="sh-alerts" role="dialog" aria-label="Notifications">
              {alerts.length === 0 && <div className="sh-alerts-empty">You're all caught up.</div>}
              {alerts.map(a => (
                <Link key={a.id} href={a.href} className="sh-alert" onClick={() => setShowAlerts(false)}>
                  <span className="sh-alert-icon"><a.icon size={16} /></span>
                  <span className="sh-alert-text">{a.title}</span>
                  <ChevronRight size={15} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      {chips.length > 2 && (
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
              {c.label}
            </button>
          ))}
        </div>
      )}

      {people.length === 0 && isSyncingInitial ? (
        <PageSkeleton variant="home" header={false} bare label="Loading your people" />
      ) : people.length === 0 ? (
        <div className="sh-empty">
          <div className="sh-empty-title">Your circle is empty</div>
          <p>People appear here once Instagram DMs sync or you add someone.</p>
          <Link href="/relationships" className="sh-btn">Open People</Link>
        </div>
      ) : (
        <>
          <section aria-label="Spotlight">
            <div className="sh-spot-row">
              {spotlight.map(p => (
                <Link key={p.id} href={personHref(p)} className="sh-spot" style={{ backgroundImage: abstractArt(p.name) }}>
                  <span className="sh-spot-glow" aria-hidden="true" />
                  <Photo person={p} className="sh-spot-avatar" />
                  <span className="sh-spot-text">
                    <span className="sh-spot-name">{p.name}</span>
                    <span className="sh-spot-sub">
                      {handleOf(p) ? `@${handleOf(p)}` : CATEGORY_LABEL[p.category || 'online_friend']} · {fmt(p.chatsCount)} DMs
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <div className="sh-row-head">
            <h2>At a glance</h2>
            <Link href="/analytics" className="sh-link">Full analytics</Link>
          </div>
          <StatStrip stats={[
            { label: 'People', value: filtered.length, href: '/relationships' },
            { label: 'DMs', value: totalChats, href: '/analytics' },
            { label: 'Reels shared', value: totalReels, href: '/analytics' },
            { label: 'AI replying', value: filtered.filter(p => p.aiEnabled !== false).length, href: '/controls' },
          ]} />

          {favourites.length > 0 && (
            <>
              <div className="sh-row-head"><h2>Favourite people</h2><Link href="/relationships" className="sh-link">Show all</Link></div>
              <div className="sh-fav-row">
                {favourites.map(p => (
                  <Link key={p.id} href={personHref(p)} className="sh-fav">
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
                    <Link href={personHref(p)} className="sh-list-item">
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
    </div>
  );
}
