'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brain, RefreshCw, HelpCircle, X, Send, FileText } from 'lucide-react';
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
    const t = setInterval(load, mem.status === 'indexing' ? 3000 : 10000);
    return () => clearInterval(t);
  }, [mem, load]);

  const reindex = async () => {
    setMem(m => ({ ...(m || {}), status: 'indexing' }));
    const res = await fetch(`${API_BASE}/api/people/${encodeURIComponent(senderId)}/memory/reindex`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) showToast?.('Could not start re-reading', 'error');
    setTimeout(load, 1500);
  };

  // Your answers and corrections: saved as always-true, then the document is rewritten
  const [answers, setAnswers] = useState({});
  const [correction, setCorrection] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const post = async (path, body, okText) => {
    const res = await fetch(`${API_BASE}/api/people/${encodeURIComponent(senderId)}/memory/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) { showToast?.('Could not save that', 'error'); return false; }
    showToast?.(okText);
    load();
    return true;
  };
  const answer = async (d, dismiss = false) => {
    const text = dismiss ? '' : String(answers[d._id] || '').trim();
    if (!dismiss && !text) return;
    setMem(m => ({ ...m, doubts: (m.doubts || []).map(x => (x._id === d._id ? { ...x, status: dismiss ? 'dismissed' : 'answered' } : x)) }));
    await post(`doubts/${d._id}`, { answer: text }, dismiss ? 'Dismissed' : 'Thanks, the AI will use that');
  };
  const sendCorrection = async e => {
    e.preventDefault();
    const text = correction.trim();
    if (!text) return;
    if (await post('correct', { text }, 'Got it, updating the memory')) setCorrection('');
  };
  const openDoubts = (mem?.doubts || []).filter(d => d.status === 'open');

  const score = mem?.brainScore || 0;
  const busy = mem && (mem.status === 'indexing' || mem.status === 'pending');
  const pct = mem?.totalMessages ? Math.round(100 * Math.min(mem.indexedMessages || 0, mem.totalMessages) / mem.totalMessages) : 0;
  const R = 22;
  const C = 2 * Math.PI * R;

  const status = mem === undefined ? 'Loading…'
    : !mem ? 'Not read yet'
      : mem.status === 'indexing' ? `Reading ${pct ? `${pct}%` : '…'}`
        : mem.status === 'pending' ? (mem.queuePosition > 0 ? `Queued · ${mem.queuePosition} ahead` : 'Starting…')
          : `${mem.bond ? `${BOND[mem.bond] || mem.bond} · ` : ''}${(mem.totalMessages || 0).toLocaleString()} messages`;

  return (
    <div className="pm pm-compact">
      <div className="pm-head">
        <div className="pm-ring" title="Brain score: how well the AI knows them, learned from your chats">
          <svg viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r={R} className="pm-ring-track" />
            <circle cx="26" cy="26" r={R} className="pm-ring-arc" strokeDasharray={C} strokeDashoffset={C * (1 - (mem?.status === 'indexing' ? pct : score) / 100)} />
          </svg>
          <b>{mem?.status === 'indexing' ? `${pct}%` : score}</b>
        </div>
        <div className="pm-title">
          <h2 className="person-card-title"><Brain size={17} /> AI memory</h2>
          <div className="person-card-sub">{status}</div>
        </div>
        <button type="button" className="pm-icon-btn" onClick={() => setOpen(true)} title={openDoubts.length ? `Open memory · ${openDoubts.length} question(s) for you` : 'Open memory'} aria-label="Open the AI's memory">
          <FileText size={18} />
          {openDoubts.length > 0 && <span className="pm-icon-dot">{openDoubts.length}</span>}
        </button>
        <button type="button" className="pm-icon-btn" onClick={reindex} disabled={busy} title={busy ? 'Reading' : 'Read the whole chat again'} aria-label="Read again">
          <RefreshCw size={16} className={mem?.status === 'indexing' ? 'pm-spin' : ''} />
        </button>
      </div>
      {mem?.status === 'indexing' && <div className="pm-bar"><span style={{ width: `${Math.max(4, pct)}%` }} /></div>}

      {open && createPortal(
        <div className="pm-modal" role="dialog" aria-label={`AI memory of ${name}`} onClick={() => setOpen(false)}>
          <div className="pm-modal-box" onClick={e => e.stopPropagation()}>
            <div className="pm-modal-head">
              <div>
                <h2>AI memory of {name}</h2>
                <p>Brain score {score}/100{mem?.lastIndexedAt ? ` · updated ${new Date(mem.lastIndexedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}</p>
              </div>
              <button type="button" className="pm-icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="pm-modal-body">
              {openDoubts.length > 0 && (
                <div className="pm-doubts">
                  <div className="pm-doubts-head"><HelpCircle size={15} /> Needs your review</div>
                  {openDoubts.map(d => (
                    <form key={d._id} className="pm-doubt" onSubmit={e => { e.preventDefault(); answer(d); }}>
                      <span className="pm-doubt-q">{d.question}</span>
                      <div className="pm-doubt-row">
                        <input value={answers[d._id] || ''} onChange={e => setAnswers(x => ({ ...x, [d._id]: e.target.value }))} placeholder="Your answer" aria-label={`Answer: ${d.question}`} />
                        <button type="submit" className="person-light-btn" disabled={!String(answers[d._id] || '').trim()}><Send size={13} /></button>
                        <button type="button" className="pm-doubt-x" onClick={() => answer(d, true)} aria-label="Dismiss" title="Not important"><X size={14} /></button>
                      </div>
                    </form>
                  ))}
                </div>
              )}
              {mem?.bondReason && <p className="pm-bond">{mem.bondReason}</p>}
              {mem?.doc ? <MemoryDoc text={mem.doc} /> : <p className="person-empty">{busy ? 'Reading their chats…' : 'Nothing learned yet.'}</p>}
            </div>
            <form className="pm-correct" onSubmit={sendCorrection}>
              <input value={correction} onChange={e => setCorrection(e.target.value)} maxLength={500}
                placeholder="Something wrong? Tell the AI" aria-label="Correct the AI's memory" />
              <button type="submit" className="person-light-btn" disabled={!correction.trim()}>Fix</button>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
