'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Cake, PauseCircle, BotOff, ChevronRight, Users, Heart, HeartOff, Clock, User, Sparkles, Shuffle, ExternalLink, MessageCircle, Send, Hand, AlarmClock } from 'lucide-react';
import { SegIndicator } from './ui/motion';
import { useApp } from '../context/AppContext';
import PageSkeleton from './Skeletons';
import { prefetchAmbientImages } from './AmbientBackground';
import { savedPhotoUrl } from '../lib/utils';
import { abstractArt, useFreshBanner } from '../lib/banners';
import UnsplashBanner from './UnsplashBanner';
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

/** Saved photo (a fresh link is fetched when it has expired) -> unavatar -> abstract artwork. */
function Photo({ person, className = '' }) {
  const { requestFreshPhoto } = useApp();
  const [stage, setStage] = useState(0);
  const handle = handleOf(person);
  const saved = savedPhotoUrl(person);
  const sources = [
    saved,
    handle ? `https://unavatar.io/instagram/${handle}?fallback=false` : null,
  ].filter(Boolean);
  const src = sources[stage];

  // A new link from the server starts the chain again
  useEffect(() => { setStage(0); }, [saved]);
  // No saved photo at all: ask the server for one
  useEffect(() => { if (!saved && person.senderId) requestFreshPhoto?.(person.senderId); }, [saved, person.senderId, requestFreshPhoto]);

  const onError = () => {
    if (stage === 0 && saved && person.senderId) requestFreshPhoto?.(person.senderId);
    setStage(s => s + 1);
  };
  const initials = (person.name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  return (
    <div className={`sh-photo ${className}`} style={{ backgroundImage: abstractArt(person.name) }}>
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
    <UnsplashBanner as="section" seed={`fact-${index ?? 0}`} topic="colorful" width={1200} credit={false} className="sh-fact">
      <span className="sh-fact-icon" aria-hidden="true"><Sparkles size={22} /></span>
      <span className="sh-fact-text">
        <span className="sh-fact-label">Did you know?</span>
        <span className="sh-fact-body" aria-live="polite">{fact || '\u00a0'}</span>
      </span>
      <button type="button" className="sh-fact-btn" onClick={next} aria-label="Show another fact">
        <Shuffle size={18} />
      </button>
    </UnsplashBanner>
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
  return (
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
    </>
  );
}

export default function SpotlightHome() {
  const { nodes, user, routingConfig, isSyncingInitial, setFavourite } = useApp();
  const [menu, setMenu] = useState(null); // { person, x, y } while the long-press menu is open
  const closeMenu = useCallback(() => setMenu(null), []);
  const openMenu = useCallback((person, x, y) => setMenu({ person, x, y }), []);
  const pressProps = useLongPress(openMenu);
  const [category, setCategory] = useState('all');
  const [showAlerts, setShowAlerts] = useState(false);

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
  const totalChats = filtered.reduce((s, p) => s + (p.chatsCount || 0), 0);
  const totalReels = filtered.reduce((s, p) => s + (p.reelsCount || 0), 0);

  const paused = people.filter(p => p.aiEnabled === false);
  const alerts = [
    routingConfig && routingConfig.globalBotActive === false && { id: 'bot', icon: BotOff, title: 'Automation is paused', href: '/controls' },
    ...birthdays.slice(0, 5).map(({ p, days }) => ({
      id: `bd-${p.id}`, icon: Cake, href: personHref(p),
      title: days === 0 ? `${p.name}'s birthday is today` : `${p.name}'s birthday in ${days} day${days === 1 ? '' : 's'}`,
    })),
    paused.length > 0 && { id: 'paused', icon: PauseCircle, title: `${paused.length} with AI paused`, href: '/controls' },
  ].filter(Boolean);

  // A new background and banner photo every time Home opens (page colours follow the background)
  const coverPhoto = useFreshBanner('home-cover', 'abstract');
  const bannerPhoto = useFreshBanner('home-banner', 'colorful');
  const firstName = (user?.firstName || user?.name || user?.username || '').split(' ')[0];

  return (
    <div className={`sh-home${coverPhoto ? ' sh-tinted' : ''}`}>
      <PageCover seed="home-cover" photo={coverPhoto} />
      <header className="sh-top">
        <h1 className="sh-hello">{hour === null ? 'Hello' : greeting(hour)}, {firstName || 'there'}!</h1>
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

      <UnsplashBanner seed="home-banner" topic="colorful" photo={bannerPhoto} className="sh-banner">
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
      </UnsplashBanner>

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
                <Link key={p.id} href={personHref(p)} className="sh-spot sh-pressable" {...pressProps(p)}>
                  <UnsplashBanner as="span" seed={p.name} width={720} credit={false} matchImage={savedPhotoUrl(p)} className="sh-spot-art" />
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

          <FactCard people={people} />

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
