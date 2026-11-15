'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, FileText, Mic, Bell, Check, Download, X, Play } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * Everything this person sent, in tabs: Needs you (invites, requests, money, urgent), Media
 * (photos and videos, opened in a viewer here, not a new tab), Links, Docs and Voice.
 * Files come from our own saved copy, loaded with the signed-in user's token.
 */
const TABS = [
  { id: 'needs', label: 'Needs you', match: i => i.needsYou && i.status !== 'done' },
  { id: 'media', label: 'Media', match: i => i.kind === 'photo' || i.kind === 'video' },
  { id: 'links', label: 'Links', match: i => ['link', 'post', 'reel'].includes(i.kind) },
  { id: 'docs', label: 'Docs', match: i => i.kind === 'file' },
  { id: 'voice', label: 'Voice', match: i => i.kind === 'voice' },
];
const when = d => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const hrefOf = u => (/^https?:/i.test(u) ? u : `https://${u}`);
const hostOf = u => { try { return new URL(hrefOf(u)).hostname.replace(/^www\./, ''); } catch { return u; } };

function useFileUrl(API_BASE, item) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!item?.fileId) return undefined;
    let made = null;
    let alive = true;
    fetch(`${API_BASE}/api/shared/${item._id}/file`).then(r => (r.ok ? r.blob() : null)).then(b => {
      if (!b || !alive) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    }).catch(() => {});
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [API_BASE, item?._id, item?.fileId]);
  return url;
}

function Tile({ API_BASE, item, onOpen }) {
  const url = useFileUrl(API_BASE, item);
  return (
    <button type="button" className="shared-tile" onClick={() => onOpen(item)} aria-label={`Open ${item.kind}`}>
      {url && item.kind === 'photo' && <img src={url} alt="" />}
      {url && item.kind === 'video' && <video src={url} muted preload="metadata" />}
      {!url && <span className="shared-tile-empty">{item.fileId ? '' : 'Not saved'}</span>}
      {item.kind === 'video' && <span className="shared-tile-play"><Play size={16} /></span>}
    </button>
  );
}

function Viewer({ API_BASE, item, onClose }) {
  const url = useFileUrl(API_BASE, item);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const said = [item.text, ...(item.saidAfter || [])].filter(Boolean);
  return createPortal(
    <div className="shared-viewer" role="dialog" aria-label="Shared item" onClick={onClose}>
      <div className="shared-viewer-box" onClick={e => e.stopPropagation()}>
        <button type="button" className="shared-viewer-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="shared-viewer-media">
          {!url && <span className="shared-loading" />}
          {url && item.kind === 'photo' && <img src={url} alt={item.description || ''} />}
          {url && item.kind === 'video' && <video src={url} controls autoPlay />}
          {url && item.kind === 'voice' && <audio src={url} controls autoPlay />}
          {url && item.kind === 'file' && <a className="person-light-btn" href={url} download><Download size={14} /> Download file</a>}
        </div>
        <div className="shared-viewer-info">
          {item.description && <p className="shared-viewer-desc">{item.description}</p>}
          {said.length > 0 && <p className="shared-viewer-said">They said: "{said.join(' / ')}"</p>}
          <small>{when(item.createdAt)}</small>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function PersonShared({ senderId }) {
  const { API_BASE, showToast } = useApp();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!senderId) return;
    fetch(`${API_BASE}/api/people/${encodeURIComponent(senderId)}/shared`)
      .then(r => (r.ok ? r.json() : { items: [] })).then(d => setItems(d.items || [])).catch(() => setItems([]));
  }, [API_BASE, senderId]);
  if (!senderId || !items) return null;

  const tabs = TABS.map(t => ({ ...t, items: items.filter(t.match) })).filter(t => t.items.length);
  const current = tabs.find(t => t.id === tab) || tabs[0];
  const done = async it => {
    setItems(list => list.map(x => (x._id === it._id ? { ...x, status: 'done' } : x)));
    const res = await fetch(`${API_BASE}/api/shared/${it._id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }),
    }).catch(() => null);
    if (!res?.ok) showToast?.('Could not mark it done', 'error');
  };

  return (
    <section className="person-glass-card">
      <h2 className="person-card-title">Shared</h2>
      <div className="person-card-sub">What they sent you, and anything that needed you</div>
      {tabs.length === 0 && <p className="person-empty">Nothing yet. Photos, links and files they send show up here.</p>}

      {tabs.length > 0 && (
        <div className="shared-tabs" role="tablist">
          {tabs.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={current.id === t.id}
              className={current.id === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label} <span>{t.items.length}</span>
            </button>
          ))}
        </div>
      )}

      {current?.id === 'needs' && (
        <ul className="shared-list">
          {current.items.map(it => (
            <li key={it._id} className="shared-item shared-needs">
              <span className="shared-icon"><Bell size={15} /></span>
              <span className="shared-main"><b>{it.summary}</b><small>{it.category} · {when(it.createdAt)}{it.emailedAt ? ' · emailed you' : ''}</small></span>
              <button type="button" className="person-light-btn" onClick={() => done(it)}><Check size={14} /> Done</button>
            </li>
          ))}
        </ul>
      )}

      {current?.id === 'media' && (
        <div className="shared-grid">
          {current.items.map(it => <Tile key={it._id} API_BASE={API_BASE} item={it} onOpen={setOpen} />)}
        </div>
      )}

      {current?.id === 'links' && (
        <ul className="shared-list">
          {current.items.map(it => (
            <li key={it._id} className="shared-item">
              <span className="shared-icon"><Link2 size={15} /></span>
              <span className="shared-main">
                <a href={hrefOf(it.url)} target="_blank" rel="noreferrer">{it.summary || hostOf(it.url)}</a>
                <small>{hostOf(it.url)} · {when(it.createdAt)}</small>
              </span>
            </li>
          ))}
        </ul>
      )}

      {(current?.id === 'docs' || current?.id === 'voice') && (
        <ul className="shared-list">
          {current.items.map(it => {
            const Icon = it.kind === 'voice' ? Mic : FileText;
            return (
              <li key={it._id}>
                <button type="button" className="shared-item shared-item-btn" onClick={() => setOpen(it)}>
                  <span className="shared-icon"><Icon size={15} /></span>
                  <span className="shared-main"><b>{it.kind === 'voice' ? 'Voice note' : (it.summary || 'File')}</b><small>{when(it.createdAt)}</small></span>
                  {it.kind === 'voice' && <Play size={15} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && <Viewer API_BASE={API_BASE} item={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
