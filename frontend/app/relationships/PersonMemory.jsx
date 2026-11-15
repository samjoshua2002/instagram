'use client';

import { useCallback, useEffect, useState } from 'react';
import { Brain, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * The AI's memory of this person (read only): a document written from all your real chats
 * (who they are, your bond, how you talk, people in their life, timeline, inside jokes, open
 * threads), the brain score and indexing progress. It updates itself as you chat; "Re-read"
 * rebuilds it from the whole history. It cannot be edited or deleted here.
 */

// Small Markdown reader for the memory document: ## headings, "- " bullets, paragraphs
function MemoryDoc({ text }) {
  const blocks = [];
  let list = null;
  String(text || '').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) { list = null; return; }
    if (line.startsWith('## ')) { list = null; blocks.push(<h3 key={i} className="pm-h">{line.slice(3)}</h3>); return; }
    if (/^[-*] /.test(line)) {
      if (!list) { list = []; blocks.push(<ul key={i} className="pm-ul">{list}</ul>); }
      list.push(<li key={i}>{line.slice(2)}</li>);
      return;
    }
    list = null;
    blocks.push(<p key={i} className="pm-p">{line}</p>);
  });
  return <div className="pm-doc">{blocks}</div>;
}

const BOND = { family: 'Family', partner: 'Partner', close: 'Close', friend: 'Friend', acquaintance: 'Acquaintance', stranger: 'New' };

export default function PersonMemory({ senderId, name }) {
  const { API_BASE, showToast } = useApp();
  const [mem, setMem] = useState(undefined);
  const load = useCallback(() => {
    fetch(`${API_BASE}/api/people/${encodeURIComponent(senderId)}/memory`)
      .then(r => (r.ok ? r.json() : { memory: null })).then(d => setMem(d.memory || null)).catch(() => setMem(null));
  }, [API_BASE, senderId]);
  useEffect(() => { load(); }, [load]);
  // While it is being read, check again every few seconds
  useEffect(() => {
    if (!mem || (mem.status !== 'indexing' && mem.status !== 'pending')) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [mem, load]);

  const reindex = async () => {
    setMem(m => ({ ...(m || {}), status: 'indexing' }));
    const res = await fetch(`${API_BASE}/api/people/${encodeURIComponent(senderId)}/memory/reindex`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) showToast?.('Could not start re-reading', 'error');
    setTimeout(load, 1500);
  };

  const score = mem?.brainScore || 0;
  const busy = mem && (mem.status === 'indexing' || mem.status === 'pending');
  const pct = mem?.totalMessages ? Math.round(100 * Math.min(mem.indexedMessages || 0, mem.totalMessages) / mem.totalMessages) : 0;
  const R = 22;
  const C = 2 * Math.PI * R;

  return (
    <div className="pm">
      <div className="pm-head">
        <div className="pm-ring" title="How well the AI knows them, from your chats">
          <svg viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r={R} className="pm-ring-track" />
            <circle cx="26" cy="26" r={R} className="pm-ring-arc" strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} />
          </svg>
          <b>{score}</b>
        </div>
        <div className="pm-title">
          <h2 className="person-card-title"><Brain size={18} /> AI memory of {name}</h2>
          <div className="person-card-sub">
            {mem === undefined ? 'Loading…'
              : !mem ? 'Not read yet. It starts on its own in the background.'
                : busy ? `Reading your chats… ${pct ? `${pct}%` : ''}`
                  : `Brain score ${score}/100${mem.bond ? ` · ${BOND[mem.bond] || mem.bond}` : ''} · from ${(mem.totalMessages || 0).toLocaleString()} messages${mem.lastIndexedAt ? ` · updated ${new Date(mem.lastIndexedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}`}
          </div>
        </div>
        <button type="button" className="person-light-btn pm-reindex" onClick={reindex} disabled={busy} title="Read the whole chat again">
          <RefreshCw size={14} className={busy ? 'pm-spin' : ''} /> {busy ? 'Reading' : 'Re-read'}
        </button>
      </div>
      {busy && <div className="pm-bar"><span style={{ width: `${Math.max(4, pct)}%` }} /></div>}
      {mem?.bondReason && <p className="pm-bond">{mem.bondReason}</p>}
      {mem?.doc ? <MemoryDoc text={mem.doc} /> : !busy && mem && <p className="person-empty">Nothing learned yet.</p>}
      <p className="pm-note">Written by the AI from your real chats only. It updates itself; you can't edit or delete it.</p>
    </div>
  );
}
