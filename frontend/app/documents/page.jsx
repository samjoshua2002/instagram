'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/DialogContext';
import { FileText, Link2, Type, UploadCloud, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { IconSwap, SegIndicator } from '../components/ui/motion';
import PageHero from '../components/PageHero';

const ACCEPT = '.pdf,.txt,.md,.csv';
const TABS = [
  { id: 'file', label: 'Upload file', icon: UploadCloud },
  { id: 'link', label: 'Add link', icon: Link2 },
  { id: 'text', label: 'Paste text', icon: Type },
];

// Cover colours for document cards (Figma), picked by position
const ART = ['#1db954', '#509bf5', '#e8115b', '#f59b23', '#af2896', '#148a08'];

const SourceIcon = ({ type, size = 18 }) =>
  type === 'link' ? <Link2 size={size} /> : type === 'text' ? <Type size={size} /> : <FileText size={size} />;

/**
 * Business knowledge base: files, links and text the AI reads before it replies.
 */
export default function DocumentsPage() {
  const { API_BASE, token, showToast } = useApp();

  // Uploaded documents are private now: fetch them with the login header and open the file locally
  const openDoc = async (fileUrl) => {
    const name = String(fileUrl || '').match(/\/(?:api\/knowledge\/files|uploads)\/([^/?#]+)$/)?.[1];
    if (!name) { window.open(fileUrl, '_blank', 'noopener'); return; }
    const win = window.open('', '_blank');
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/files/${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token || localStorage.getItem('chatter_jwt_token') || ''}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blobUrl = URL.createObjectURL(await res.blob());
      if (win) win.location.href = blobUrl; else window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      try { win?.close(); } catch { }
      showToast?.('Could not open this document.', 'error');
    }
  };
  const confirm = useConfirm();
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
    if (!(await confirm({ title: 'Remove document?', message: `"${item.title}" will be removed from the knowledge base. The AI will stop using it.`, confirmLabel: 'Remove', tone: 'danger' }))) return;
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

  const sections = (items || []).reduce((sum, i) => sum + (i.chunks || 0), 0);
  const openTab = (id) => {
    setTab(id);
    if (id === 'file' && !busy) fileInput.current?.click();
  };

  return (
    <div className="page-container settings-fullwidth spx-page">
      <PageHero
        seed="page-documents"
        icon={<FileText size={96} strokeWidth={2} />}
        eyebrow="Knowledge base"
        title="Document & Service Vault"
        desc="Add price lists, menus, FAQs and brochure links. The AI reads the matching parts before replying to customers."
        meta={`${items?.length || 0} document${items?.length === 1 ? '' : 's'} · ${sections} section${sections === 1 ? '' : 's'} indexed`}
      >
        <button type="button" className="spx-play" disabled={busy} onClick={() => openTab('file')}>
          <IconSwap k={busy ? 'loader2' : 'uploadcloud'}>{busy ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={20} />}</IconSwap> Upload file
        </button>
        <button type="button" className="spx-outline" aria-pressed={tab === 'link'} onClick={() => setTab('link')}>
          <Link2 size={14} /> Add link
        </button>
        <button type="button" className="spx-outline" aria-pressed={tab === 'text'} onClick={() => setTab('text')}>
          <Type size={14} /> Paste text
        </button>
      </PageHero>

      <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => uploadFiles(e.target.files)} />

      <div className="spx-panel">
        <div className="spx-pills" role="tablist">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`spx-pill${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              {tab === id && <SegIndicator id="seg-documents" />}
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {tab === 'file' && (
          <div
            className={`spx-drop${dragging ? ' dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !busy && fileInput.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
          >
            <div className="spx-drop-icon">
              <IconSwap k={busy ? 'loader2' : 'uploadcloud'}>{busy ? <Loader2 size={26} className="animate-spin icon-keep" /> : <UploadCloud size={26} className="icon-keep" />}</IconSwap>
            </div>
            <div className="spx-drop-title">{busy ? 'Reading document…' : 'Drop files here or click to browse'}</div>
            <div className="spx-drop-sub">PDF, TXT, MD or CSV, up to 10 MB</div>
          </div>
        )}

        {tab === 'link' && (
          <form className="spx-form" onSubmit={(e) => { e.preventDefault(); postJson('link', form, 'Link added'); }}>
            <input placeholder="Title, e.g. Spring brochure" value={form.title} onChange={setField('title')} required />
            <input type="url" placeholder="https://…" value={form.url} onChange={setField('url')} required />
            <textarea rows={3} placeholder="What is in this link? (helps the AI decide when to share it)" value={form.text} onChange={setField('text')} />
            <button className="spx-play" disabled={busy}>{busy ? 'Saving…' : 'Add link'}</button>
          </form>
        )}

        {tab === 'text' && (
          <form className="spx-form" onSubmit={(e) => { e.preventDefault(); postJson('text', form, 'Text added'); }}>
            <input placeholder="Title, e.g. Opening hours & FAQ" value={form.title} onChange={setField('title')} required />
            <textarea rows={6} placeholder="Paste your prices, policies or FAQ here" value={form.text} onChange={setField('text')} required />
            <button className="spx-play" disabled={busy}>{busy ? 'Saving…' : 'Add text'}</button>
          </form>
        )}
      </div>

      <div className="spx-section-head">
        <h2 className="spx-section-title">Your documents {items?.length ? `(${items.length})` : ''}</h2>
      </div>

      {!items && <div className="skeleton" style={{ height: '120px', borderRadius: '8px', marginTop: '16px' }} />}

      {items?.length === 0 && (
        <div className="spx-empty-card">Nothing here yet. Add your first price list or FAQ above.</div>
      )}

      {items?.length > 0 && <div className="spx-doc-grid stagger-in">{items.map((item, idx) => (
        <div key={item._id} className="spx-doc">
          <div className="spx-doc-art" style={{ background: `linear-gradient(135deg, ${ART[idx % ART.length]} 0%, #121212 140%)` }}>
            <SourceIcon type={item.sourceType} size={28} />
          </div>
          <div className="spx-doc-body">
            <div className="spx-doc-title" title={item.title}>{item.title}</div>
            <div className="spx-doc-chips">
              {((item.categories || []).filter(Boolean).length ? item.categories.filter(Boolean) : ['general']).map(c => (
                <span key={c} className="spx-chip">{c}</span>
              ))}
              <span className="spx-chip spx-chip-green">{item.chunks} section{item.chunks === 1 ? '' : 's'} indexed</span>
              {item.createdAt && <span className="spx-doc-date">· {new Date(item.createdAt).toLocaleDateString()}</span>}
            </div>
            <div className="spx-doc-preview">{item.preview}</div>
          </div>
          <div className="spx-doc-actions">
            {item.fileUrl && (
              <button type="button" className="spx-icon-btn" onClick={() => openDoc(item.fileUrl)} title="Open" aria-label="Open"><ExternalLink size={15} /></button>
            )}
            <button type="button" className="spx-icon-btn" onClick={() => remove(item)} title="Remove" aria-label="Remove"><Trash2 size={16} /></button>
          </div>
        </div>
      ))}</div>}
    </div>
  );
}
