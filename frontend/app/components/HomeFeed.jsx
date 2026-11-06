'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, ChevronRight, MessageCircle, Film, Cake, PauseCircle, BotOff, Play } from 'lucide-react';
import { SegIndicator } from './ui/motion';
import { useApp } from '../context/AppContext';
import ContactAvatar from './ContactAvatar';
import { unavatarUrl, noteUnavatarFailed } from '../lib/utils';

/**
 * Spotify-style Home: greeting + notifications bell, category filter chips,
 * quick-access tiles, horizontal "shelves" of people and a "most chatted" list.
 * All data comes from the user's real contacts (AppContext nodes); nothing is invented.
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

// Card artwork colours used when a person has no photo (Spotify-style solid tiles)
const TILE_COLORS = ['#E8115B', '#1E3264', '#8D67AB', '#E1118C', '#477D95', '#BA5D07', '#27856A', '#509BF5', '#AF2896', '#148A08'];
const tileColor = name => TILE_COLORS[[...(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % TILE_COLORS.length];

const personHref = p => `/relationships?person=${encodeURIComponent(p.id)}`;
const fmt = n => Number(n || 0).toLocaleString();

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Square artwork for a person: photo -> unavatar -> coloured initials tile. */
function PersonArt({ person, round = false }) {
  const [stage, setStage] = useState(0);
  const handle = (person.handle || '').replace(/^@/, '').trim();
  const sources = [
    person.profilePic?.startsWith('http') ? person.profilePic : null,
    unavatarUrl(handle),
  ].filter(Boolean);
  const src = sources[stage];
  const onError = () => { noteUnavatarFailed(src); setStage(s => s + 1); };
  const initials = (person.name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return (
    <div className={`sp-art${round ? ' sp-art-round' : ''}`} style={{ background: tileColor(person.name) }}>
      {src ? (
        <img src={src} alt="" referrerPolicy="no-referrer" onError={onError} />
      ) : (
        <span className="sp-art-initials">{initials}</span>
      )}
    </div>
  );
}

function Shelf({ title, subtitle, href, children }) {
  return (
    <section className="sp-shelf">
      <div className="sp-shelf-head">
        <div>
          {subtitle && <div className="sp-shelf-sub">{subtitle}</div>}
          <h2 className="sp-shelf-title">{title}</h2>
        </div>
        {href && <Link href={href} className="sp-show-all">Show all</Link>}
      </div>
      <div className="sp-shelf-row stagger-in">{children}</div>
    </section>
  );
}

function PersonCard({ person, sub, round }) {
  return (
    <Link href={personHref(person)} className="sp-card">
      <div className="sp-card-art">
        <PersonArt person={person} round={round} />
        <span className="sp-card-play" aria-hidden="true"><Play size={18} fill="currentColor" /></span>
      </div>
      <div className={`sp-card-title${round ? ' center' : ''}`}>{person.name}</div>
      <div className={`sp-card-sub${round ? ' center' : ''}`}>{sub}</div>
    </Link>
  );
}

// Days until the next occurrence of a YYYY-MM-DD (or MM-DD) date; null if unparseable.
function daysUntil(dateStr) {
  const m = String(dateStr || '').match(/(\d{4}-)?(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), Number(m[2]) - 1, Number(m[3]));
  if (next < today) next = new Date(now.getFullYear() + 1, Number(m[2]) - 1, Number(m[3]));
  return Math.round((next - today) / 86400000);
}

export default function HomeFeed() {
  const { nodes, user, routingConfig } = useApp();
  const [category, setCategory] = useState('all');
  const [showAlerts, setShowAlerts] = useState(false);

  const people = useMemo(() => (nodes || []).filter(n => !n.isRoot && n.name), [nodes]);
  const presentCategories = useMemo(
    () => CATEGORIES.filter(c => c.id === 'all' || people.some(p => (p.category || 'online_friend') === c.id)),
    [people]
  );
  const filtered = useMemo(
    () => (category === 'all' ? people : people.filter(p => (p.category || 'online_friend') === category)),
    [people, category]
  );

  const byChats = useMemo(() => [...filtered].sort((a, b) => (b.chatsCount || 0) - (a.chatsCount || 0)), [filtered]);
  const byReels = useMemo(() => [...filtered].filter(p => p.reelsCount > 0).sort((a, b) => b.reelsCount - a.reelsCount), [filtered]);
  const favourites = useMemo(
    () => [...filtered].sort((a, b) => (b.chatsCount || 0) + (b.reelsCount || 0) * 5 - ((a.chatsCount || 0) + (a.reelsCount || 0) * 5)).slice(0, 12),
    [filtered]
  );
  // "Made for you": people with some history who have gone quiet relative to the top chatters
  const reconnect = useMemo(
    () => [...filtered].filter(p => (p.chatsCount || 0) > 0).sort((a, b) => (a.chatsCount || 0) - (b.chatsCount || 0)).slice(0, 12),
    [filtered]
  );

  const birthdays = useMemo(() => people
    .map(p => {
      const dob = p.dob || (p.importantDates || []).find(d => /birth|bday/i.test(d?.title || ''))?.date;
      return { p, days: daysUntil(dob) };
    })
    .filter(x => x.days !== null && x.days <= 30)
    .sort((a, b) => a.days - b.days), [people]);
  const paused = people.filter(p => p.aiEnabled === false);

  const alerts = [
    routingConfig && routingConfig.globalBotActive === false && {
      id: 'bot', icon: BotOff, title: 'Automation is paused', body: 'AI replies are off for everyone.', href: '/controls',
    },
    ...birthdays.slice(0, 5).map(({ p, days }) => ({
      id: `bd-${p.id}`, icon: Cake, title: days === 0 ? `${p.name}'s birthday is today` : `${p.name}'s birthday in ${days} day${days === 1 ? '' : 's'}`,
      body: 'Send a wish or let the AI handle it.', href: personHref(p), person: p,
    })),
    paused.length > 0 && {
      id: 'paused', icon: PauseCircle, title: `${paused.length} ${paused.length === 1 ? 'person has' : 'people have'} AI paused`,
      body: 'You reply to them yourself.', href: '/controls',
    },
  ].filter(Boolean);

  const firstName = user?.firstName || user?.username || '';
  const quick = byChats.slice(0, 8);
  const maxChats = byChats[0]?.chatsCount || 1;

  return (
    <div className="sp-home">
      <header className="sp-home-top">
        <div className="sp-hello">
          <span className="sp-hello-dot" aria-hidden="true">{(firstName[0] || 'C').toUpperCase()}</span>
          <div>
            <div className="sp-hello-small">{greeting()}</div>
            <div className="sp-hello-name">{firstName || 'there'}</div>
          </div>
        </div>
        <div className="sp-bell-wrap">
          <button
            type="button"
            className="sp-icon-btn"
            aria-label={`Notifications${alerts.length ? ` (${alerts.length})` : ''}`}
            aria-expanded={showAlerts}
            onClick={() => setShowAlerts(v => !v)}
          >
            <Bell size={20} />
            {alerts.length > 0 && <span className="sp-badge">{alerts.length}</span>}
          </button>
          {showAlerts && (
            <div className="sp-alerts" role="dialog" aria-label="Notifications">
              <div className="sp-alerts-title">What's new</div>
              {alerts.length === 0 && <div className="sp-alerts-empty">You're all caught up.</div>}
              {alerts.map(a => (
                <Link key={a.id} href={a.href} className="sp-alert" onClick={() => setShowAlerts(false)}>
                  {a.person ? <ContactAvatar contact={a.person} size={40} showStatus={false} /> : (
                    <span className="sp-alert-icon"><a.icon size={18} /></span>
                  )}
                  <span className="sp-alert-text">
                    <span className="sp-alert-head">{a.title}</span>
                    <span className="sp-alert-body">{a.body}</span>
                  </span>
                  <ChevronRight size={16} className="sp-alert-chev" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      <h1 className="sp-home-title">Welcome to your <span className="sp-green">Chatter</span> circle</h1>

      <div className="sp-chips" role="tablist" aria-label="Filter by category">
        {presentCategories.map(c => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={category === c.id}
            className={`sp-chip${category === c.id ? ' active' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {category === c.id && <SegIndicator id="seg-home-feed" />}
            {c.label}
          </button>
        ))}
      </div>

      {people.length === 0 ? (
        <div className="sp-empty">
          <div className="sp-empty-title">Your circle is empty</div>
          <p>People appear here once Instagram DMs sync or you add someone.</p>
          <Link href="/relationships" className="sp-btn-green">Open People Directory</Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="sp-empty"><p>No one in {CATEGORY_LABEL[category]} yet.</p></div>
      ) : (
        <>
          {quick.length > 0 && (
            <div className="sp-quick stagger-in">
              {quick.map(p => (
                <Link key={p.id} href={personHref(p)} className="sp-quick-tile">
                  <PersonArt person={p} />
                  <span className="sp-quick-name">{p.name}</span>
                </Link>
              ))}
            </div>
          )}

          {reconnect.length > 0 && (
            <Shelf title="Made for you" subtitle="Reconnect with" href="/relationships">
              {reconnect.map(p => (
                <PersonCard key={p.id} person={p} sub={`${fmt(p.chatsCount)} DMs · ${CATEGORY_LABEL[p.category || 'online_friend'] || 'Friend'}`} />
              ))}
            </Shelf>
          )}

          {favourites.length > 0 && (
            <Shelf title="Favourite people" href="/relationships">
              {favourites.map(p => (
                <PersonCard key={p.id} person={p} round sub={p.handle ? `@${p.handle.replace(/^@/, '')}` : (p.relationship || 'Friend')} />
              ))}
            </Shelf>
          )}

          {byReels.length > 0 && (
            <Shelf title="Top reel sharers" subtitle="Reel activity" href="/relationships">
              {byReels.slice(0, 12).map(p => (
                <PersonCard key={p.id} person={p} sub={`${fmt(p.reelsCount)} reels`} />
              ))}
            </Shelf>
          )}

          <section className="sp-shelf">
            <div className="sp-shelf-head">
              <h2 className="sp-shelf-title">Most chatted all time</h2>
              <Link href="/analytics" className="sp-show-all">Analytics</Link>
            </div>
            <ol className="sp-tracklist stagger-in">
              {byChats.slice(0, 10).map((p, i) => (
                <li key={p.id}>
                  <Link href={personHref(p)} className="sp-track">
                    <span className="sp-track-num">{i + 1}</span>
                    <ContactAvatar contact={p} size={40} showStatus={false} style={{ borderRadius: 4 }} />
                    <span className="sp-track-main">
                      <span className="sp-track-name">{p.name}</span>
                      <span className="sp-track-sub">
                        {p.handle ? `@${p.handle.replace(/^@/, '')}` : (p.relationship || 'Friend')}
                      </span>
                      <span className="sp-track-bar"><span style={{ width: `${Math.max(3, ((p.chatsCount || 0) / maxChats) * 100)}%` }} /></span>
                    </span>
                    <span className="sp-track-stats">
                      <span><MessageCircle size={13} /> {fmt(p.chatsCount)}</span>
                      {p.reelsCount > 0 && <span className="sp-hide-xs"><Film size={13} /> {fmt(p.reelsCount)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
