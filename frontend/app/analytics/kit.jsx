'use client';

// Shared pieces for the analytics page layouts (Personal / Business / Superadmin)
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EASE_OUT } from '../lib/motion';

export const fmt = n => Number(n || 0).toLocaleString();
export const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
export const countWord = n => WORDS[n] || fmt(n);
export const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

export const RANGES = [
  { key: '7d', label: '7D', words: 'last 7 days' },
  { key: '30d', label: '30D', words: 'last 30 days' },
  { key: '90d', label: '90D', words: 'last 90 days' },
  { key: 'all', label: 'All', words: 'all time' },
];
export const rangeWords = key => RANGES.find(r => r.key === key)?.words || '';

export const timeAgo = date => {
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

const grow = (delay = 0) => ({ initial: { scaleX: 0 }, animate: { scaleX: 1 }, transition: { duration: 0.9, delay, ease: EASE_OUT }, style: { transformOrigin: 'left' } });

/* Real message counts from GET /api/analytics/activity, refreshed every minute while visible */
export function useActivity(range, scope) {
  const { API_BASE, token } = useApp();
  const [state, setState] = useState({ data: null, loading: true, key: '' });
  // The data remembers which range it is for: a failed fetch never shows the old range under the new label
  const key = `${range}|${scope || ''}`;
  useEffect(() => {
    const t = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    if (!t) return undefined;
    let alive = true;
    setState(s => ({ ...s, loading: true }));
    const load = () => {
      const qs = new URLSearchParams({ range, tzOffset: String(new Date().getTimezoneOffset()) });
      if (scope) qs.set('scope', scope);
      fetch(`${API_BASE}/api/analytics/activity?${qs}`, { headers: { Authorization: `Bearer ${t}` } })
        .then(r => (r.ok ? r.json() : null))
        .then(data => { if (alive) setState(s => (data ? { data, loading: false, key } : { ...s, loading: false })); })
        .catch(() => { if (alive) setState(s => ({ ...s, loading: false })); });
    };
    load();
    const timer = setInterval(() => {
      if (document.hidden || navigator.onLine === false) return;
      load();
    }, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [API_BASE, token, range, scope]);
  return { data: state.key === key ? state.data : null, loading: state.loading };
}

export function RangeTabs({ value, onChange }) {
  return (
    <div className="an-seg" role="group" aria-label="Time range">
      {RANGES.map(r => (
        <button key={r.key} type="button" aria-pressed={value === r.key} onClick={() => onChange(r.key)} title={r.words}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, sub, aside, children, className = '' }) {
  return (
    <section className={`an-card ${className}`}>
      {(title || aside) && (
        <div className="an-card-head">
          <div>
            {title && <div className="an-card-title">{title}</div>}
            {sub && <div className="an-card-sub">{sub}</div>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

// A link (href) or a button (onClick) styled like a link or a pill
export function Action({ action, className }) {
  if (!action) return null;
  const inner = <>{action.label}{className === 'an-link' && <ChevronRight size={12} />}</>;
  return action.href
    ? <Link href={action.href} className={className}>{inner}</Link>
    : <button type="button" className={className} onClick={action.onClick}>{inner}</button>;
}

/* The headline card: one sentence, a share bar and its legend */
export function StoryCard({ eyebrow, headline, sub, action, segments, total }) {
  const sum = total || segments.reduce((s, x) => s + x.value, 0);
  return (
    <section className="an-card an-story">
      <div className="an-story-top">
        <div>
          <div className="an-eyebrow">{eyebrow}</div>
          <h2>{headline}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <Action action={action} className="an-btn" />
      </div>
      {sum > 0 && (
        <>
          <div className="an-share" role="img" aria-label={segments.map(s => `${s.label} ${pct(s.value, sum)}%`).join(', ')}>
            {segments.filter(s => s.value > 0).map((s, i) => (
              <motion.div key={s.label} {...grow(0.1 + i * 0.05)} style={{ ...grow().style, flex: `${s.value} 0 0`, background: s.color }} title={`${s.label}: ${fmt(s.value)}`} />
            ))}
          </div>
          <div className="an-legend">
            {segments.map(s => (
              <span key={s.label}><i className="an-dot" style={{ background: s.color }} />{s.label} <b>{pct(s.value, sum)}%</b></span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const ATTN_ICON = { warn: '!', info: 'i', ok: '✓' };
export function AttentionCards({ items }) {
  return (
    <div className="an-attn">
      {items.map(item => (
        <div key={item.title} className="an-card">
          <span className={`an-attn-icon ${item.tone}`} aria-hidden="true">{ATTN_ICON[item.tone]}</span>
          <div className="an-attn-text">
            <strong>{item.title}</strong>
            <span>{item.text}</span>
          </div>
          <Action action={item.action} className="an-btn" />
        </div>
      ))}
    </div>
  );
}

export function StatStrip({ items }) {
  return (
    <section className="an-card an-stats">
      {items.map(s => (
        <div key={s.label} className="an-stat">
          <div className="an-stat-label">{s.label}</div>
          <div className="an-stat-value">{typeof s.value === 'number' ? fmt(s.value) : s.value}</div>
          <div className="an-stat-sub" title={s.sub}>{s.sub}</div>
        </div>
      ))}
    </section>
  );
}

const shortDate = iso => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/* Stacked bars per day/week. keys: [{ key, label, color }] bottom to top */
export function VolumeChart({ title, data, loading, range, keys, totalLabel, emptyText }) {
  const series = data?.series || [];
  const max = Math.max(1, ...series.map(p => keys.reduce((s, k) => s + (p[k.key] || 0), 0)));
  const total = series.reduce((s, p) => s + keys.reduce((t, k) => t + (p[k.key] || 0), 0), 0);
  const per = data?.bucket === 'week' ? 'per week' : 'per day';
  return (
    <Card
      title={title}
      sub={`${rangeWords(range).replace(/^./, c => c.toUpperCase())} · ${per}${data?.bucket === 'week' && range === 'all' ? ' (last 12 months)' : ''}`}
      aside={(
        <div className="an-legend-inline">
          {keys.map(k => <span key={k.key}><i className="an-dot" style={{ background: k.color, marginRight: 5 }} />{k.label}</span>)}
        </div>
      )}
    >
      <div className="an-big"><strong>{fmt(total)}</strong><span>{totalLabel}</span></div>
      {total === 0 ? (
        <div className="an-empty">{loading ? 'Loading message counts…' : emptyText}</div>
      ) : (
        <>
          <div className="an-bars" role="img" aria-label={`${title}: ${fmt(total)} messages`}>
            {series.map((p, i) => {
              const label = p.start === p.end ? shortDate(p.start) : `${shortDate(p.start)} – ${shortDate(p.end)}`;
              return (
                <div key={p.start} className="an-bar" title={`${label}\n${keys.map(k => `${k.label}: ${fmt(p[k.key])}`).join('\n')}`}>
                  {[...keys].reverse().map(k => (
                    <motion.div
                      key={k.key}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.7, delay: Math.min(i * 0.015, 0.5), ease: EASE_OUT }}
                      style={{ height: `${((p[k.key] || 0) / max) * 100}%`, background: k.color }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          <div className="an-axis"><span>{series[0] && shortDate(series[0].start)}</span><span>Today</span></div>
        </>
      )}
    </Card>
  );
}

export function Progress({ value }) {
  return (
    <div className="an-progress" role="img" aria-label={`${value}%`}>
      <motion.div {...grow(0.2)} style={{ ...grow().style, width: `${Math.max(value, value > 0 ? 2 : 0)}%` }} />
    </div>
  );
}

export function KeyValues({ rows }) {
  return <div className="an-kv">{rows.map(r => <div key={r.label}><span>{r.label}</span><b>{r.value}</b></div>)}</div>;
}

/* Ranked rows with a bar. rows: [{ id, name, handle, value, href, avatar }] */
export function Leaderboard({ rows, emptyText }) {
  if (!rows.length) return <div className="an-empty">{emptyText}</div>;
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <ol className="an-lb">
      {rows.map((r, i) => {
        const body = (
          <>
            <span className="an-lb-rank">{i + 1}</span>
            {r.avatar || <span className="an-lb-badge">{(r.name || '?').replace(/^[@\s]+/, '')[0]?.toUpperCase() || '?'}</span>}
            <span style={{ minWidth: 0 }}>
              <span className="an-lb-name"><b>{r.name}</b>{r.handle && <span>{r.handle}</span>}</span>
              <span className="an-lb-track" style={{ display: 'block' }}>
                <motion.div {...grow(0.1 + i * 0.05)} style={{ ...grow().style, width: `${(r.value / max) * 100}%` }} />
              </span>
            </span>
            <span className="an-lb-value">{fmt(r.value)}</span>
          </>
        );
        return <li key={r.id || r.name}>{r.href ? <Link href={r.href}>{body}</Link> : <div className="an-lb-row">{body}</div>}</li>;
      })}
    </ol>
  );
}

/* A count split into parts: segmented bar + list. parts: [{ label, value, color, hollow }] */
export function SplitList({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <>
      <div className="an-split-bar" role="img" aria-label={parts.map(p => `${p.label} ${p.value}`).join(', ')}>
        {total > 0 && parts.filter(p => p.value > 0).map((p, i) => (
          <motion.div key={p.label} {...grow(0.1 + i * 0.05)} style={{ ...grow().style, flex: `${p.value} 0 0`, background: p.color }} />
        ))}
      </div>
      <ul className="an-split">
        {parts.map(p => (
          <li key={p.label} className={p.value ? '' : 'zero'}>
            <i className={`an-dot${p.hollow ? ' hollow' : ''}`} style={{ background: p.color }} />
            <span>{p.label}</span>
            <b>{fmt(p.value)}</b>
          </li>
        ))}
      </ul>
    </>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hourLabel = h => { const x = ((h % 24) + 24) % 24; return x === 0 ? '12am' : x === 12 ? '12pm' : x < 12 ? `${x}am` : `${x - 12}pm`; };

// Busiest day and busiest 3-hour window (wrapping past midnight) of a 7 x 24 grid
export function heatPeak(grid) {
  if (!grid) return null;
  const total = grid.flat().reduce((s, n) => s + n, 0);
  if (!total) return null;
  const dayTotals = grid.map(row => row.reduce((s, n) => s + n, 0));
  const hourTotals = Array.from({ length: 24 }, (_, h) => grid.reduce((s, row) => s + row[h], 0));
  let start = 0, best = -1;
  for (let h = 0; h < 24; h++) {
    const sum = hourTotals[h] + hourTotals[(h + 1) % 24] + hourTotals[(h + 2) % 24];
    if (sum > best) { best = sum; start = h; }
  }
  const day = dayTotals.indexOf(Math.max(...dayTotals));
  return { day: DAYS[day], dayName: DAY_NAMES[day], window: `${hourLabel(start)}–${hourLabel(start + 3)}`, windowShare: pct(best, total), total };
}

export function Heatmap({ title, grid, loading, range, emptyText }) {
  const max = grid ? Math.max(0, ...grid.flat()) : 0;
  const peak = heatPeak(grid);
  const level = n => (n <= 0 || !max ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  return (
    <Card
      title={title}
      sub={peak ? `Busiest: ${peak.day}, ${peak.window} · ${rangeWords(range)}, your time` : rangeWords(range)}
      aside={(
        <span className="an-heat-key" aria-hidden="true">
          Quiet {[1, 2, 3, 4].map(l => <i key={l} className="an-heat-cell" data-l={l} />)} Busy
        </span>
      )}
    >
      {!peak ? (
        <div className="an-empty">{loading ? 'Loading message times…' : emptyText}</div>
      ) : (
        <>
          <div className="an-heat" role="img" aria-label={`${title}. Busiest ${peak.day}, ${peak.window}`}>
            {grid.map((row, d) => (
              <React.Fragment key={DAYS[d]}>
                <span className="an-heat-day">{DAYS[d]}</span>
                {row.map((n, h) => (
                  <span key={h} className="an-heat-cell" data-l={level(n)} title={`${DAYS[d]} ${hourLabel(h)}: ${plural(n, 'message')}`} />
                ))}
              </React.Fragment>
            ))}
          </div>
          <div className="an-heat-axis" aria-hidden="true">
            <span />
            {Array.from({ length: 24 }, (_, h) => <span key={h}>{[0, 6, 12, 18].includes(h) ? hourLabel(h) : ''}</span>)}
          </div>
        </>
      )}
    </Card>
  );
}

/* Short facts. items: [{ badge, title, text }] */
export function Highlights({ items }) {
  return (
    <Card title="Highlights">
      {items.length ? (
        <ul className="an-hl">
          {items.map(it => (
            <li key={it.title}>
              <span className="an-lb-badge" style={{ flexShrink: 0 }}>{it.badge}</span>
              <div><b>{it.title}</b><span>{it.text}</span></div>
            </li>
          ))}
        </ul>
      ) : <div className="an-empty">Highlights show up once messages come in.</div>}
    </Card>
  );
}
