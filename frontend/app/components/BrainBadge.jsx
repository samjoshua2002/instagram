'use client';

import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * A person's brain score as a small ring (how well the AI knows them, learned on its own from
 * your chats). While their chats are being read it shows the progress; queued shows "Queued".
 * All badges on a page share one request to /api/memory-index, refreshed every 15 seconds.
 */
let cache = null;
let listeners = new Set();
let timer = null;
let base = '';

function poll() {
  fetch(`${base}/api/memory-index`).then(r => (r.ok ? r.json() : null)).then(d => {
    if (d) {
      cache = new Map((d.people || []).map(p => [String(p.senderId), p]));
      listeners.forEach(f => f());
    }
  }).catch(() => {}).finally(() => {
    clearTimeout(timer);
    if (listeners.size) timer = setTimeout(poll, 15000);
  });
}

function useMemoryIndex(API_BASE) {
  const [, tick] = useState(0);
  useEffect(() => {
    base = API_BASE;
    const f = () => tick(n => n + 1);
    listeners.add(f);
    if (listeners.size === 1) poll();
    return () => { listeners.delete(f); if (!listeners.size) clearTimeout(timer); };
  }, [API_BASE]);
  return cache;
}

const LEVEL = { close: 'Close', friend: 'Friend', acquaintance: 'Know a bit', stranger: 'New' };

/** Friendship score (closeness): what personal details the AI may share with them. */
export function FriendshipBadge({ senderId }) {
  const { API_BASE } = useApp();
  const index = useMemoryIndex(API_BASE);
  const f = senderId && index ? index.get(String(senderId))?.friendship : null;
  if (!f) return null;
  return (
    <span className={`friend-badge lvl-${f.level}`} title={`Friendship ${f.score}/100 (${LEVEL[f.level] || f.level})${f.reasons?.length ? `: ${f.reasons.join(', ')}` : ''}`}>
      <span aria-hidden="true">♥</span> {f.score} <small>{LEVEL[f.level] || f.level}</small>
    </span>
  );
}

export default function BrainBadge({ senderId, size = 34 }) {
  const { API_BASE } = useApp();
  const index = useMemoryIndex(API_BASE);
  const p = senderId && index ? index.get(String(senderId)) : null;
  if (!p) return null;
  const reading = p.status === 'indexing';
  const queued = p.status === 'pending';
  const pct = reading && p.totalMessages ? Math.round(100 * Math.min(p.indexedMessages || 0, p.totalMessages) / p.totalMessages) : 0;
  const value = reading ? pct : (p.brainScore || 0);
  const R = (size - 6) / 2;
  const C = 2 * Math.PI * R;
  const title = reading ? `Reading their chats… ${pct}%` : queued ? 'Waiting to be read' : `Brain score ${p.brainScore || 0}/100: how well the AI knows them`;
  return (
    <span className={`brain-badge${reading ? ' reading' : ''}${queued ? ' queued' : ''}`} title={title} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={R} className="bb-track" />
        {!queued && <circle cx={size / 2} cy={size / 2} r={R} className="bb-arc" strokeDasharray={C} strokeDashoffset={C * (1 - value / 100)} />}
      </svg>
      <b>{queued ? '…' : reading ? `${pct}%` : p.brainScore || 0}</b>
    </span>
  );
}
