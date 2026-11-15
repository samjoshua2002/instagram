'use client';

import { useEffect, useState } from 'react';
import { Link2, FileText, Image as ImageIcon, Mic, Film, Bell, Check, Download } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * Everything this person sent that is worth keeping: messages that need you (invites, requests,
 * money, urgent), links, photos, videos, voice notes and files. Files come from our own copy
 * (Instagram's links expire), loaded with the signed-in user's token.
 */
const KIND_ICON = { link: Link2, file: FileText, photo: ImageIcon, video: Film, voice: Mic, post: Link2, reel: Film, message: Bell };
const when = d => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function useFileUrl(API_BASE, item) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!item.fileId) return undefined;
    let revoke = null;
    let alive = true;
    fetch(`${API_BASE}/api/shared/${item._id}/file`).then(r => (r.ok ? r.blob() : null)).then(b => {
      if (!b || !alive) return;
      revoke = URL.createObjectURL(b);
      setUrl(revoke);
    }).catch(() => {});
    return () => { alive = false; if (revoke) URL.revokeObjectURL(revoke); };
  }, [API_BASE, item._id, item.fileId]);
  return url;
}

function Media({ API_BASE, item }) {
  const url = useFileUrl(API_BASE, item);
  if (!item.fileId) return <span className="shared-missing">Not saved (sent before saving was on)</span>;
  if (!url) return <span className="shared-loading" aria-label="Loading" />;
  if (item.kind === 'photo') return <a href={url} target="_blank" rel="noreferrer"><img className="shared-thumb" src={url} alt="" /></a>;
  if (item.kind === 'video') return <video className="shared-thumb" src={url} controls preload="metadata" />;
  if (item.kind === 'voice') return <audio className="shared-audio" src={url} controls preload="metadata" />;
  return <a className="shared-dl" href={url} download><Download size={14} /> Download</a>;
}

export default function PersonShared({ senderId }) {
  const { API_BASE, showToast } = useApp();
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!senderId) return;
    fetch(`${API_BASE}/api/people/${encodeURIComponent(senderId)}/shared`)
      .then(r => (r.ok ? r.json() : { items: [] })).then(d => setItems(d.items || [])).catch(() => setItems([]));
  }, [API_BASE, senderId]);
  if (!senderId || !items) return null;

  const needs = items.filter(i => i.needsYou && i.status !== 'done');
  const rest = items.filter(i => !i.needsYou);
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
      <div className="person-card-sub">Links, photos, files and voice notes they sent, and anything that needed you</div>
      {items.length === 0 && <p className="person-empty">Nothing yet. Links and files they send show up here.</p>}

      {needs.length > 0 && (
        <ul className="shared-list">
          {needs.map(it => (
            <li key={it._id} className="shared-item shared-needs">
              <span className="shared-icon"><Bell size={15} /></span>
              <span className="shared-main">
                <b>{it.summary}</b>
                <small>{it.category} · {when(it.createdAt)}{it.emailedAt ? ' · emailed you' : ''}</small>
              </span>
              <button type="button" className="person-light-btn" onClick={() => done(it)}><Check size={14} /> Done</button>
            </li>
          ))}
        </ul>
      )}

      {rest.length > 0 && (
        <ul className="shared-list">
          {rest.map(it => {
            const Icon = KIND_ICON[it.kind] || FileText;
            const href = /^https?:/.test(it.url) ? it.url : (it.url ? `https://${it.url}` : null);
            return (
              <li key={it._id} className="shared-item">
                <span className="shared-icon"><Icon size={15} /></span>
                <span className="shared-main">
                  {it.kind === 'link' || it.kind === 'post' || it.kind === 'reel'
                    ? <a href={href} target="_blank" rel="noreferrer">{it.summary || it.url}</a>
                    : <Media API_BASE={API_BASE} item={it} />}
                  <small>{it.kind} · {when(it.createdAt)}</small>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
