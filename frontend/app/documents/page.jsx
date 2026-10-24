'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { FileText, Link2, Type, UploadCloud, Trash2, ExternalLink, Loader2 } from 'lucide-react';

const ACCEPT = '.pdf,.txt,.md,.csv';
const TABS = [
  { id: 'file', label: 'Upload file', icon: UploadCloud },
  { id: 'link', label: 'Add link', icon: Link2 },
  { id: 'text', label: 'Paste text', icon: Type },
];

const SourceIcon = ({ type, size = 18 }) =>
  type === 'link' ? <Link2 size={size} /> : type === 'text' ? <Type size={size} /> : <FileText size={size} />;

/**
 * Business knowledge base: files, links and text the AI reads before it replies.
 */
export default function DocumentsPage() {
  const { API_BASE, token, showToast } = useApp();
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState('file');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', text: '', category: '' });
  const fileInput = useRef(null);

  const authHeaders = useCallback((extra = {}) => {
    const t = token || (typeof window !== 'undefined' ? localStorage.getItem('chatter_jwt_token') : null);
    return { ...extra, ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  }, [token]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/knowledge`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setItems(data.items || []);
    } catch (err) {
      setItems([]);
      showToast(err.message || 'Failed to load documents', 'error');
    }
  }, [API_BASE, authHeaders, showToast]);

  useEffect(() => { load(); }, [load]);

  const setField = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const submit = async (request, okMessage) => {
    setBusy(true);
    try {
      const res = await request();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`${okMessage} (${data.chunks} section${data.chunks === 1 ? '' : 's'} indexed)`, 'success');
      setForm({ title: '', url: '', text: '', category: '' });
      load();
    } catch (err) {
      showToast(err.message || 'Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (fileList) => {
    for (const file of Array.from(fileList || [])) {
      const body = new FormData();
      body.append('file', file);
      if (form.category) body.append('category', form.category);
      await submit(
        () => fetch(`${API_BASE}/api/knowledge/upload`, { method: 'POST', headers: authHeaders(), body }),
        `Added ${file.name}`
      );
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const postJson = (path, payload, okMessage) => submit(
    () => fetch(`${API_BASE}/api/knowledge/${path}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    }),
    okMessage
  );

  const remove = async (item) => {
    if (!window.confirm(`Remove "${item.title}" from the knowledge base?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/${item._id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json()).error);
      setItems(list => list.filter(i => i._id !== item._id));
      showToast('Document removed', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to delete document', 'error');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (!busy) uploadFiles(e.dataTransfer.files);
  };

  return (
    <div className="page-container" style={{ maxWidth: '860px' }}>
      <div style={{ marginBottom: '24px' }}>
        <div className="mono" style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 'bold' }}>
          // KNOWLEDGE BASE
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.6px', margin: '4px 0 6px' }}>
          Document & Service Vault
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', margin: 0, lineHeight: 1.5 }}>
          Add price lists, menus, FAQs and brochure links. The AI reads the matching parts before replying to customers.
        </p>
      </div>

      <div className="download-card">
        <div className="docs-tabs" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`docs-tab${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {tab === 'file' && (
          <div
            className={`docs-dropzone${dragging ? ' dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !busy && fileInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
          >
            {busy ? <Loader2 size={28} className="animate-spin" /> : <UploadCloud size={28} />}
            <div style={{ fontWeight: 700, marginTop: '8px' }}>
              {busy ? 'Reading document…' : 'Drop files here or click to browse'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>PDF, TXT, MD or CSV, up to 10 MB</div>
            <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
          </div>
        )}

        {tab === 'link' && (
          <form className="docs-form" onSubmit={(e) => { e.preventDefault(); postJson('link', form, 'Link added'); }}>
            <input placeholder="Title, e.g. Spring brochure" value={form.title} onChange={setField('title')} required />
            <input type="url" placeholder="https://…" value={form.url} onChange={setField('url')} required />
            <textarea rows={3} placeholder="What is in this link? (helps the AI decide when to share it)" value={form.text} onChange={setField('text')} />
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add link'}</button>
          </form>
        )}

        {tab === 'text' && (
          <form className="docs-form" onSubmit={(e) => { e.preventDefault(); postJson('text', form, 'Text added'); }}>
            <input placeholder="Title, e.g. Opening hours & FAQ" value={form.title} onChange={setField('title')} required />
            <textarea rows={6} placeholder="Paste your prices, policies or FAQ here" value={form.text} onChange={setField('text')} required />
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add text'}</button>
          </form>
        )}
      </div>

      <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '24px 0 12px' }}>
        Your documents {items?.length ? `(${items.length})` : ''}
      </h2>

      {!items && <div className="skeleton" style={{ height: '120px', borderRadius: '16px' }} />}

      {items?.length === 0 && (
        <div className="download-card" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Nothing here yet. Add your first price list or FAQ above.
        </div>
      )}

      {items?.map(item => (
        <div key={item._id} className="download-card docs-item">
          <div className="download-icon"><SourceIcon type={item.sourceType} /></div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
            <div className="docs-chips">
              {((item.categories || []).filter(Boolean).length ? item.categories.filter(Boolean) : ['general']).map(c => (
                <span key={c} className="docs-chip">{c}</span>
              ))}
              <span className="docs-chip docs-chip-indexed">{item.chunks} section{item.chunks === 1 ? '' : 's'} indexed</span>
              {item.createdAt && <span className="docs-chip-date">{new Date(item.createdAt).toLocaleDateString()}</span>}
            </div>
            <div className="docs-preview">{item.preview}</div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {item.fileUrl && (
              <a className="btn" href={item.fileUrl} target="_blank" rel="noreferrer" title="Open" aria-label="Open"><ExternalLink size={15} /></a>
            )}
            <button type="button" className="btn" onClick={() => remove(item)} title="Remove" aria-label="Remove"><Trash2 size={15} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
