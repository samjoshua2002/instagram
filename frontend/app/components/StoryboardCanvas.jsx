'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, Trash2, Plus, X, RotateCcw } from 'lucide-react';
import { useApp } from '../context/AppContext';

const NODE_W = 172;
const NODE_H = 64;
const WORLD_W = 1800;
const WORLD_H = 1100;

const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Node canvas for the Storyboards (PLAN.md §13 Phase 4): drag cards around,
 * link them, edit notes in the side panel. Saves to /api/storyboard/:kind a
 * moment after each change.
 *
 * nodeTypes: [{ key, label, color, icon }]; seed(): { nodes, edges } for an empty board.
 * onSelect(node|null) lets the page react (e.g. pick who the test chat is with).
 */
export default function StoryboardCanvas({ kind, nodeTypes, seed, onSelect, extraAdd }) {
  const { API_BASE, token, showToast } = useApp();
  const [board, setBoard] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [linkFrom, setLinkFrom] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const dragRef = useRef(null);
  const saveTimer = useRef(null);
  const worldRef = useRef(null);

  const typeOf = key => nodeTypes.find(t => t.key === key) || nodeTypes[0];
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // Load once; an empty board gets the page's starter layout
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/storyboard/${kind}`, { headers: authHeaders })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))
      .then(data => {
        if (cancelled) return;
        setBoard(data.nodes?.length ? { nodes: data.nodes, edges: data.edges || [] } : seed());
      })
      .catch(() => { if (!cancelled) { setBoard(seed()); setSaveState('offline'); } });
    return () => { cancelled = true; };
  }, [API_BASE, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(next => {
    clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/storyboard/${kind}`, {
          method: 'PUT', headers: authHeaders, body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error();
        setSaveState('saved');
      } catch {
        setSaveState('offline');
      }
    }, 700);
  }, [API_BASE, kind, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback(fn => {
    setBoard(prev => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, [persist]);

  const selected = board?.nodes.find(n => n.id === selectedId) || null;
  useEffect(() => { onSelect?.(selected); }, [selected?.id, selected?.contactId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dragging (pointer events cover mouse, pen and touch) ──
  const onPointerDown = (e, node) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    dragRef.current = { id: node.id, dx: e.clientX - node.x, dy: e.clientY - node.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = e => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.moved = true;
    const x = clamp(e.clientX - drag.dx, 0, WORLD_W - NODE_W);
    const y = clamp(e.clientY - drag.dy, 0, WORLD_H - NODE_H);
    setBoard(prev => ({ ...prev, nodes: prev.nodes.map(n => (n.id === drag.id ? { ...n, x, y } : n)) }));
  };

  const onPointerUp = node => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) {
      setBoard(prev => { persist(prev); return prev; });
      return;
    }
    // A plain click: finish a link or select
    if (linkFrom && linkFrom !== node.id) {
      const exists = board.edges.some(ed => (ed.from === linkFrom && ed.to === node.id) || (ed.from === node.id && ed.to === linkFrom));
      if (!exists) update(prev => ({ ...prev, edges: [...prev.edges, { id: newId(), from: linkFrom, to: node.id, label: '' }] }));
      setLinkFrom(null);
      setSelectedId(node.id);
      return;
    }
    setSelectedId(node.id);
  };

  const addNode = (type, extra = {}) => {
    const scroller = worldRef.current?.parentElement;
    const x = clamp((scroller?.scrollLeft || 0) + 60 + Math.random() * 160, 0, WORLD_W - NODE_W);
    const y = clamp((scroller?.scrollTop || 0) + 60 + Math.random() * 120, 0, WORLD_H - NODE_H);
    const node = { id: newId(), type, label: typeOf(type).label, notes: '', contactId: '', x, y, ...extra };
    update(prev => ({ ...prev, nodes: [...prev.nodes, node] }));
    setSelectedId(node.id);
  };

  const patchNode = (id, patch) => update(prev => ({ ...prev, nodes: prev.nodes.map(n => (n.id === id ? { ...n, ...patch } : n)) }));
  const removeNode = id => {
    update(prev => ({ nodes: prev.nodes.filter(n => n.id !== id), edges: prev.edges.filter(e => e.from !== id && e.to !== id) }));
    setSelectedId(null);
  };
  const patchEdge = (id, patch) => update(prev => ({ ...prev, edges: prev.edges.map(e => (e.id === id ? { ...e, ...patch } : e)) }));
  const removeEdge = id => update(prev => ({ ...prev, edges: prev.edges.filter(e => e.id !== id) }));

  const resetBoard = () => {
    if (!window.confirm('Replace this storyboard with the starter layout? Your current cards will be removed.')) return;
    const fresh = seed();
    setBoard(fresh);
    persist(fresh);
    setSelectedId(null);
    showToast?.('Storyboard reset', 'info');
  };

  // Delete key removes the selected card (not while typing); Escape cancels linking
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { setLinkFrom(null); return; }
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (!typing && selectedId && (e.key === 'Delete' || e.key === 'Backspace')) removeNode(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!board) return <div className="skeleton" style={{ height: '560px', borderRadius: '20px' }} />;

  const byId = Object.fromEntries(board.nodes.map(n => [n.id, n]));
  const selectedEdges = selected ? board.edges.filter(e => e.from === selected.id || e.to === selected.id) : [];

  return (
    <div className="story-shell">
      {/* Toolbar */}
      <div className="story-toolbar">
        {nodeTypes.filter(t => !t.hideAdd).map(t => (
          <button key={t.key} type="button" className="story-chip" onClick={() => addNode(t.key)}>
            <Plus size={13} /> <span className="story-dot" style={{ background: t.color }} /> {t.label}
          </button>
        ))}
        {extraAdd?.(addNode, board)}
        <span className="story-spacer" />
        <span className={`story-save ${saveState}`}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'offline' ? 'Not saved' : 'Saved'}
        </span>
        <button type="button" className="story-chip" onClick={resetBoard} title="Start over from the starter layout">
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      {linkFrom && (
        <div className="story-banner">
          Click another card to link it to <strong>{byId[linkFrom]?.label || 'this card'}</strong>.
          <button type="button" onClick={() => setLinkFrom(null)}>Cancel</button>
        </div>
      )}

      <div className="story-body">
        {/* Canvas */}
        <div className="story-scroller" onPointerMove={onPointerMove}>
          <div
            ref={worldRef}
            className="story-world"
            style={{ width: WORLD_W, height: WORLD_H }}
            onPointerDown={e => { if (e.target === e.currentTarget) { setSelectedId(null); setLinkFrom(null); } }}
          >
            <svg className="story-edges" width={WORLD_W} height={WORLD_H} aria-hidden="true">
              {board.edges.map(e => {
                const a = byId[e.from];
                const b = byId[e.to];
                if (!a || !b) return null;
                const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H / 2, x2 = b.x + NODE_W / 2, y2 = b.y + NODE_H / 2;
                const active = selectedId && (e.from === selectedId || e.to === selectedId);
                return (
                  <g key={e.id}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} className={`story-edge${active ? ' active' : ''}`} />
                    {e.label && (
                      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="story-edge-label">{e.label}</text>
                    )}
                  </g>
                );
              })}
            </svg>

            {board.nodes.map(n => {
              const t = typeOf(n.type);
              const Icon = t.icon;
              return (
                <div
                  key={n.id}
                  className={`story-node${n.id === selectedId ? ' selected' : ''}${linkFrom ? ' linking' : ''}`}
                  style={{ left: n.x, top: n.y, width: NODE_W, minHeight: NODE_H, '--node-color': t.color }}
                  onPointerDown={e => onPointerDown(e, n)}
                  onPointerUp={() => onPointerUp(n)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t.label}: ${n.label}`}
                  onKeyDown={e => { if (e.key === 'Enter') setSelectedId(n.id); }}
                >
                  <div className="story-node-type"><Icon size={12} /> {t.label}</div>
                  <div className="story-node-label">{n.label || 'Untitled'}</div>
                  <button
                    type="button"
                    className="story-link-btn"
                    title="Link to another card"
                    aria-label="Link to another card"
                    onClick={() => setLinkFrom(n.id)}
                  >
                    <Link2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Inspector */}
        {selected && (
          <aside className="story-inspector">
            <div className="story-inspector-head">
              <span className="sheet-label" style={{ margin: 0 }}>Card</span>
              <button type="button" className="story-icon-btn" onClick={() => setSelectedId(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <label className="story-field">
              <span>Title</span>
              <input value={selected.label} maxLength={120} onChange={e => patchNode(selected.id, { label: e.target.value })} />
            </label>
            <label className="story-field">
              <span>Type</span>
              <select value={selected.type} onChange={e => patchNode(selected.id, { type: e.target.value })}>
                {nodeTypes.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
            <label className="story-field">
              <span>Notes</span>
              <textarea rows={5} maxLength={2000} value={selected.notes} placeholder={typeOf(selected.type).placeholder || 'Details the AI should know'}
                onChange={e => patchNode(selected.id, { notes: e.target.value })} />
            </label>

            {selectedEdges.length > 0 && (
              <div className="story-field">
                <span>Links</span>
                {selectedEdges.map(e => {
                  const other = byId[e.from === selected.id ? e.to : e.from];
                  return (
                    <div key={e.id} className="story-link-row">
                      <span className="story-link-name">{other?.label || 'Card'}</span>
                      <input value={e.label} maxLength={60} placeholder="label" onChange={ev => patchEdge(e.id, { label: ev.target.value })} />
                      <button type="button" className="story-icon-btn" onClick={() => removeEdge(e.id)} aria-label="Remove link"><X size={14} /></button>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button type="button" className="story-chip" onClick={() => setLinkFrom(selected.id)}><Link2 size={13} /> Link</button>
              <button type="button" className="story-chip danger" onClick={() => removeNode(selected.id)}><Trash2 size={13} /> Delete</button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
