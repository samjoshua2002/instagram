'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Trash2, Plus, Minus, X, RotateCcw, ChevronDown, ChevronRight, Maximize, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useConfirm } from '../context/DialogContext';

const NODE_W = 240;
const HEAD_H = 34;
const SOCKET_Y = HEAD_H / 2; // sockets sit on the header line, so wires never depend on node height
const WORLD_W = 2400;
const WORLD_H = 1600;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.6;

// Closeness circles a person card can sit in (matches the Storyboard model)
const CIRCLES = [
  ['', 'No circle'], ['close', 'Close friends'], ['online', 'Online friends'],
  ['offline', 'Offline friends'], ['family', 'Family'], ['professional', 'Professional'],
];

const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const isField = el => !!el?.closest?.('input, textarea, select, button');

/** Curved wire from an output socket (x1,y1) to an input socket (x2,y2), like a node editor. */
const wirePath = (x1, y1, x2, y2) => {
  const dx = Math.max(60, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

/**
 * Node-editor canvas for the Storyboards (PLAN.md §13 Phase 4), in the style of
 * Blender's node editor: every card is edited inside the card itself, and links
 * are made by dragging a wire from a card's output socket (right) to another
 * card's input socket (left). Saves to /api/storyboard/:kind a moment after each change.
 *
 * nodeTypes: [{ key, label, color, icon, circles? }] (circles: true shows the closeness picker).
 * templates: [{ id, name, description, build(ctx) }] offered when the board is empty and on Reset; templateContext is passed to build().
 * onSelect(node|null) lets the page react (e.g. pick who the test chat is with).
 * extraAdd(addNode, board) can return extra add controls (shown in the toolbar and the add menu).
 */
export default function StoryboardCanvas({ kind, nodeTypes, templates, templateContext, onSelect, extraAdd }) {
  const { API_BASE, token, showToast } = useApp();
  const confirm = useConfirm();
  const [board, setBoard] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const [picking, setPicking] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [wire, setWire] = useState(null); // link being dragged: { from, side, x, y }
  const [addMenu, setAddMenu] = useState(null); // { x, y } in world space
  const [panning, setPanning] = useState(false);
  const gestureRef = useRef(null);
  const saveTimer = useRef(null);
  // After a failed load the starter layout is shown, but it must never be saved over the real board
  const loadFailedRef = useRef(false);
  const worldRef = useRef(null);
  const scrollerRef = useRef(null);
  const zoomRef = useRef(1);
  const anchorRef = useRef(null); // keeps one world point under the same screen point while zooming
  const lastPointRef = useRef(null);
  const lastTapRef = useRef(null); // last plain click on empty canvas, for double-click to add
  zoomRef.current = zoom;

  const typeOf = key => nodeTypes.find(t => t.key === key) || nodeTypes[0];
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const buildTemplate = t => t.build(templateContext || {});

  // Screen point -> canvas (world) point, taking scroll and zoom into account
  const toWorld = (clientX, clientY) => {
    const r = worldRef.current.getBoundingClientRect();
    return { x: (clientX - r.left) / zoomRef.current, y: (clientY - r.top) / zoomRef.current };
  };

  // Load once; an empty board gets the template picker
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/storyboard/${kind}`, { headers: authHeaders })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('load failed'))))
      .then(data => {
        if (cancelled) return;
        if (data.nodes?.length) setBoard({ nodes: data.nodes, edges: data.edges || [] });
        else { setBoard({ nodes: [], edges: [] }); setPicking(true); }
      })
      .catch(() => { if (!cancelled) { loadFailedRef.current = true; setBoard(buildTemplate(templates[0])); setSaveState('offline'); } });
    return () => { cancelled = true; };
  }, [API_BASE, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll so the cards sit in the middle of the view
  const centeredRef = useRef(false);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!board || centeredRef.current || !scroller || !board.nodes.length) return;
    centeredRef.current = true;
    const xs = board.nodes.map(n => n.x), ys = board.nodes.map(n => n.y);
    const midX = (Math.min(...xs) + Math.max(...xs) + NODE_W) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys) + HEAD_H * 4) / 2;
    scroller.scrollTo({ left: Math.max(0, midX * zoom - scroller.clientWidth / 2), top: Math.max(0, midY * zoom - scroller.clientHeight / 2) });
  }, [board]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply a zoom while keeping the anchored point still
  const zoomTo = (next, clientX, clientY) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const z = clamp(Math.round(next * 100) / 100, ZOOM_MIN, ZOOM_MAX);
    const sr = scroller.getBoundingClientRect();
    const cx = clientX ?? sr.left + sr.width / 2;
    const cy = clientY ?? sr.top + sr.height / 2;
    anchorRef.current = { world: toWorld(cx, cy), sx: cx - sr.left, sy: cy - sr.top };
    setZoom(z);
  };
  useLayoutEffect(() => {
    const a = anchorRef.current;
    const scroller = scrollerRef.current;
    if (!a || !scroller) return;
    anchorRef.current = null;
    scroller.scrollLeft = a.world.x * zoom - a.sx;
    scroller.scrollTop = a.world.y * zoom - a.sy;
  }, [zoom]);

  // Ctrl/⌘ + wheel (and trackpad pinch) zooms; plain wheel scrolls as usual
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;
    const onWheel = e => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY);
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [!!board]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(next => {
    if (loadFailedRef.current) return;
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

  const patchNode = (id, patch) => update(prev => ({ ...prev, nodes: prev.nodes.map(n => (n.id === id ? { ...n, ...patch } : n)) }));
  const removeNode = id => {
    update(prev => ({ nodes: prev.nodes.filter(n => n.id !== id), edges: prev.edges.filter(e => e.from !== id && e.to !== id) }));
    setSelectedId(s => (s === id ? null : s));
  };
  const patchEdge = (id, patch) => update(prev => ({ ...prev, edges: prev.edges.map(e => (e.id === id ? { ...e, ...patch } : e)) }));
  const removeEdge = id => update(prev => ({ ...prev, edges: prev.edges.filter(e => e.id !== id) }));

  // New card at a world point (add menu), or near the middle of what you can see
  const addNode = (type, extra = {}, at = null) => {
    const scroller = scrollerRef.current;
    const z = zoomRef.current;
    const x = at ? at.x : ((scroller?.scrollLeft || 0) + (scroller?.clientWidth || 600) / 2) / z - NODE_W / 2 + (Math.random() - 0.5) * 80;
    const y = at ? at.y : ((scroller?.scrollTop || 0) + (scroller?.clientHeight || 400) / 2) / z - 80 + (Math.random() - 0.5) * 60;
    const node = {
      id: newId(), type, label: typeOf(type).label, notes: '', contactId: '',
      x: Math.round(clamp(x, 0, WORLD_W - NODE_W)), y: Math.round(clamp(y, 0, WORLD_H - HEAD_H)), ...extra,
    };
    update(prev => ({ ...prev, nodes: [...prev.nodes, node] }));
    setSelectedId(node.id);
    setAddMenu(null);
  };

  const linkNodes = (from, to) => {
    if (!from || !to || from === to) return;
    update(prev => {
      if (prev.edges.some(ed => (ed.from === from && ed.to === to) || (ed.from === to && ed.to === from))) return prev;
      return { ...prev, edges: [...prev.edges, { id: newId(), from, to, label: '' }] };
    });
  };

  // ── Pointer gestures (mouse, pen and touch): move a card, drag a wire, or pan the canvas ──
  const capture = e => scrollerRef.current?.setPointerCapture?.(e.pointerId);

  const onNodePointerDown = (e, node) => {
    setSelectedId(node.id);
    setAddMenu(null);
    if (e.button !== 0 || isField(e.target) || !e.target.closest('.story-node-head')) return;
    e.preventDefault();
    const p = toWorld(e.clientX, e.clientY);
    gestureRef.current = { kind: 'move', id: node.id, dx: p.x - node.x, dy: p.y - node.y, moved: false };
    capture(e);
  };

  const onSocketPointerDown = (e, node, side) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const p = toWorld(e.clientX, e.clientY);
    gestureRef.current = { kind: 'wire', from: node.id, side };
    setWire({ from: node.id, side, ...p });
    setSelectedId(node.id);
    capture(e);
  };

  const onWorldPointerDown = e => {
    if (e.target !== e.currentTarget && !e.target.classList?.contains('story-edges')) return;
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    setAddMenu(null);
    const s = scrollerRef.current;
    gestureRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, sl: s.scrollLeft, st: s.scrollTop, moved: false };
    setPanning(true);
    capture(e);
  };

  const onPointerMove = e => {
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    const g = gestureRef.current;
    if (!g) return;
    if (g.kind === 'pan') {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
      scrollerRef.current.scrollLeft = g.sl - dx;
      scrollerRef.current.scrollTop = g.st - dy;
      return;
    }
    const p = toWorld(e.clientX, e.clientY);
    if (g.kind === 'wire') { setWire(w => (w ? { ...w, ...p } : w)); return; }
    g.moved = true;
    const x = Math.round(clamp(p.x - g.dx, 0, WORLD_W - NODE_W));
    const y = Math.round(clamp(p.y - g.dy, 0, WORLD_H - HEAD_H));
    setBoard(prev => ({ ...prev, nodes: prev.nodes.map(n => (n.id === g.id ? { ...n, x, y } : n)) }));
  };

  const onPointerUp = e => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    if (g.kind === 'pan') {
      setPanning(false);
      if (g.moved) return;
      setSelectedId(null); // a plain click on empty canvas clears the selection
      // Double-click is detected here: pointer capture sends the browser's own dblclick to the scroller, not the canvas
      const last = lastTapRef.current;
      const now = Date.now();
      if (last && now - last.t < 400 && Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y) < 12) {
        lastTapRef.current = null;
        openAddMenuAt(e.clientX, e.clientY);
      } else lastTapRef.current = { t: now, x: e.clientX, y: e.clientY };
      return;
    }
    if (g.kind === 'move') {
      if (g.moved) setBoard(prev => { persist(prev); return prev; });
      return;
    }
    // Wire: dropping anywhere on another card links them (output -> input keeps the direction)
    setWire(null);
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-node-id]');
    const target = hit?.getAttribute('data-node-id');
    if (!target || target === g.from) return;
    if (g.side === 'out') linkNodes(g.from, target);
    else linkNodes(target, g.from);
  };

  const onPointerCancel = () => { gestureRef.current = null; setWire(null); setPanning(false); };

  // Replaces the board with a template (asks first when there are cards to lose)
  const applyTemplate = async t => {
    if (board?.nodes.length && !(await confirm({ title: `Use "${t.name}"?`, message: 'Your current cards will be replaced with this template.', confirmLabel: 'Replace', tone: 'danger' }))) return;
    const fresh = buildTemplate(t);
    centeredRef.current = false;
    setBoard(fresh);
    persist(fresh);
    setSelectedId(null);
    setPicking(false);
    showToast?.(`${t.name} template loaded`, 'info');
  };

  // Zoom out (never past 100%) so every card fits in view
  const fitView = () => {
    const scroller = scrollerRef.current;
    if (!scroller || !board?.nodes.length) return;
    const heights = Object.fromEntries([...worldRef.current.querySelectorAll('[data-node-id]')].map(el => [el.getAttribute('data-node-id'), el.offsetHeight]));
    const minX = Math.min(...board.nodes.map(n => n.x)), minY = Math.min(...board.nodes.map(n => n.y));
    const maxX = Math.max(...board.nodes.map(n => n.x + NODE_W));
    const maxY = Math.max(...board.nodes.map(n => n.y + (heights[n.id] || HEAD_H)));
    const z = clamp(Math.min(1, (scroller.clientWidth - 60) / (maxX - minX), (scroller.clientHeight - 60) / (maxY - minY)), ZOOM_MIN, ZOOM_MAX);
    anchorRef.current = { world: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, sx: scroller.clientWidth / 2, sy: scroller.clientHeight / 2 };
    if (z === zoom) { scroller.scrollLeft = anchorRef.current.world.x * z - anchorRef.current.sx; scroller.scrollTop = anchorRef.current.world.y * z - anchorRef.current.sy; anchorRef.current = null; }
    else setZoom(Math.round(z * 100) / 100);
  };

  const allCollapsed = !!board?.nodes.length && board.nodes.every(n => n.collapsed);
  const toggleAll = () => update(prev => ({ ...prev, nodes: prev.nodes.map(n => ({ ...n, collapsed: !allCollapsed })) }));

  const openAddMenuAt = (clientX, clientY) => {
    const p = toWorld(clientX, clientY);
    setAddMenu({ x: clamp(p.x, 0, WORLD_W - 200), y: clamp(p.y, 0, WORLD_H - 260) });
  };

  // Keys: Delete removes the selected card, Shift+A opens the add menu, Escape closes menus (never while typing)
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { setAddMenu(null); setWire(null); gestureRef.current = null; if (board?.nodes.length) setPicking(false); return; }
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (typing) return;
      if (selectedId && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeNode(selectedId); return; }
      if (e.shiftKey && (e.key === 'A' || e.key === 'a') && scrollerRef.current) {
        const last = lastPointRef.current;
        const r = scrollerRef.current.getBoundingClientRect();
        const inside = last && last.x >= r.left && last.x <= r.right && last.y >= r.top && last.y <= r.bottom;
        if (!inside && !scrollerRef.current.contains(document.activeElement)) return;
        e.preventDefault();
        openAddMenuAt(inside ? last.x : r.left + r.width / 2, inside ? last.y : r.top + r.height / 2);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!board) return <div className="skeleton" style={{ height: '560px', borderRadius: '20px' }} />;

  const byId = Object.fromEntries(board.nodes.map(n => [n.id, n]));
  const outPoint = n => ({ x: n.x + NODE_W, y: n.y + SOCKET_Y });
  const inPoint = n => ({ x: n.x, y: n.y + SOCKET_Y });
  const addTypes = nodeTypes.filter(t => !t.hideAdd);

  // Wire being dragged: from the grabbed socket to the pointer
  let draft = null;
  if (wire && byId[wire.from]) {
    const s = wire.side === 'out' ? outPoint(byId[wire.from]) : inPoint(byId[wire.from]);
    draft = wire.side === 'out' ? wirePath(s.x, s.y, wire.x, wire.y) : wirePath(wire.x, wire.y, s.x, s.y);
  }

  return (
    <div className="story-shell">
      {/* Toolbar */}
      <div className="story-toolbar">
        {addTypes.map(t => (
          <button key={t.key} type="button" className="story-chip" onClick={() => addNode(t.key)}>
            <Plus size={13} /> <span className="story-dot" style={{ background: t.color }} /> {t.label}
          </button>
        ))}
        {extraAdd?.(addNode, board)}
        <span className="story-spacer" />
        <span className={`story-save ${saveState}`}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'offline' ? 'Not saved' : 'Saved'}
        </span>
        <button type="button" className="story-chip" onClick={() => setPicking(true)} title="Start over from a template">
          <RotateCcw size={13} /> Templates
        </button>
      </div>

      {picking && (
        <div className="story-templates" role="dialog" aria-label="Pick a template">
          <div className="story-templates-head">
            <div>
              <strong>Pick a template</strong>
              <span>Start from a ready-made board, then change anything you like.</span>
            </div>
            {board.nodes.length > 0 && (
              <button type="button" className="story-icon-btn" onClick={() => setPicking(false)} aria-label="Close templates"><X size={16} /></button>
            )}
          </div>
          <div className="story-templates-grid">
            {templates.map(t => (
              <button key={t.id} type="button" className="story-template" onClick={() => applyTemplate(t)}>
                <strong>{t.name}</strong>
                <span>{t.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="story-body">
        <div
          ref={scrollerRef}
          className={`story-scroller${panning ? ' panning' : ''}${wire ? ' wiring' : ''}`}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <div className="story-sizer" style={{ width: WORLD_W * zoom, height: WORLD_H * zoom }}>
            <div
              ref={worldRef}
              className="story-world"
              style={{ width: WORLD_W, height: WORLD_H, transform: `scale(${zoom})` }}
              onPointerDown={onWorldPointerDown}
              onContextMenu={e => { if (e.target === e.currentTarget) { e.preventDefault(); openAddMenuAt(e.clientX, e.clientY); } }}
            >
              {/* Wires */}
              <svg className="story-edges" width={WORLD_W} height={WORLD_H} aria-hidden="true">
                {board.edges.map(e => {
                  const a = byId[e.from], b = byId[e.to];
                  if (!a || !b) return null;
                  const s = outPoint(a), t = inPoint(b);
                  const active = selectedId && (e.from === selectedId || e.to === selectedId);
                  return (
                    <path key={e.id} d={wirePath(s.x, s.y, t.x, t.y)} className={`story-edge${active ? ' active' : ''}`}
                      style={{ '--wire-color': typeOf(a.type).color }} />
                  );
                })}
                {draft && <path d={draft} className="story-edge draft" />}
              </svg>

              {/* Wire labels sit on the middle of each wire: type to name the link, × to cut it */}
              {board.edges.map(e => {
                const a = byId[e.from], b = byId[e.to];
                if (!a || !b) return null;
                const s = outPoint(a), t = inPoint(b);
                const active = selectedId && (e.from === selectedId || e.to === selectedId);
                return (
                  <div key={e.id} className={`story-wire-tag${e.label ? ' has-label' : ''}${active ? ' active' : ''}`}
                    style={{ left: (s.x + t.x) / 2, top: (s.y + t.y) / 2 }}>
                    <input
                      value={e.label}
                      maxLength={60}
                      size={Math.max(4, Math.min(e.label.length || 5, 22))}
                      placeholder="label"
                      aria-label={`Link label: ${a.label || 'card'} to ${b.label || 'card'}`}
                      onChange={ev => patchEdge(e.id, { label: ev.target.value })}
                    />
                    <button type="button" onClick={() => removeEdge(e.id)} title="Remove link" aria-label={`Remove link between ${a.label || 'card'} and ${b.label || 'card'}`}>
                      <X size={11} />
                    </button>
                  </div>
                );
              })}

              {/* Cards */}
              {board.nodes.map(n => {
                const t = typeOf(n.type);
                const Icon = t.icon;
                const typeChoices = nodeTypes.filter(x => !x.hideAdd || x.key === n.type);
                const isSel = n.id === selectedId;
                return (
                  <div
                    key={n.id}
                    data-node-id={n.id}
                    className={`story-node${isSel ? ' selected' : ''}${n.collapsed ? ' collapsed' : ''}${wire && wire.from !== n.id ? ' drop-target' : ''}`}
                    style={{ left: n.x, top: n.y, width: NODE_W, '--node-color': t.color }}
                    onPointerDown={e => onNodePointerDown(e, n)}
                    onFocus={() => setSelectedId(n.id)}
                  >
                    <span className="story-socket in" title="Input: drag a wire here, or drag out to link"
                      onPointerDown={e => onSocketPointerDown(e, n, 'in')} />
                    <span className="story-socket out" title="Output: drag to another card to link"
                      onPointerDown={e => onSocketPointerDown(e, n, 'out')} />

                    <div className="story-node-head" style={{ height: HEAD_H }}>
                      <button type="button" className="story-node-btn" onClick={() => patchNode(n.id, { collapsed: !n.collapsed })}
                        aria-label={n.collapsed ? 'Open card' : 'Fold card'} aria-expanded={!n.collapsed}>
                        {n.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <Icon size={13} className="story-node-icon" />
                      <span className="story-node-title">{n.collapsed ? (n.label || 'Untitled') : t.label}</span>
                      <button type="button" className="story-node-btn danger" onClick={() => removeNode(n.id)} aria-label={`Delete ${n.label || 'card'}`} title="Delete card">
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {!n.collapsed && (
                      <div className="story-node-body">
                        <input className="story-node-name" value={n.label} maxLength={120} placeholder="Title"
                          aria-label="Title" onChange={e => patchNode(n.id, { label: e.target.value })} />
                        {typeChoices.length > 1 && (
                          <label className="story-node-row">
                            <span>Type</span>
                            <select value={n.type} onChange={e => patchNode(n.id, { type: e.target.value })}>
                              {typeChoices.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                            </select>
                          </label>
                        )}
                        {t.circles && (
                          <label className="story-node-row">
                            <span>Circle</span>
                            <select value={n.circle || ''} onChange={e => patchNode(n.id, { circle: e.target.value })}>
                              {CIRCLES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </select>
                          </label>
                        )}
                        <textarea rows={3} maxLength={2000} value={n.notes} aria-label="Notes"
                          placeholder={t.placeholder || 'Details the AI should know'}
                          onChange={e => patchNode(n.id, { notes: e.target.value })} />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add menu (double-click, right-click or Shift+A on the canvas) */}
              {addMenu && (
                <div className="story-add-menu" style={{ left: addMenu.x, top: addMenu.y }} role="menu" aria-label="Add a card"
                  onPointerDown={e => e.stopPropagation()}>
                  <div className="story-add-head">Add card</div>
                  {addTypes.map(t => {
                    const Icon = t.icon;
                    return (
                      <button key={t.key} type="button" role="menuitem" onClick={() => addNode(t.key, {}, addMenu)}>
                        <Icon size={13} style={{ color: t.color }} /> {t.label}
                      </button>
                    );
                  })}
                  {extraAdd?.((type, extra) => addNode(type, extra, addMenu), board)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Canvas controls */}
        <div className="story-hud">
          <button type="button" onClick={() => zoomTo(zoom / 1.2)} aria-label="Zoom out" title="Zoom out (Ctrl + scroll)"><Minus size={14} /></button>
          <button type="button" className="story-hud-zoom" onClick={() => zoomTo(1)} title="Back to 100%">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => zoomTo(zoom * 1.2)} aria-label="Zoom in" title="Zoom in (Ctrl + scroll)"><Plus size={14} /></button>
          <button type="button" onClick={fitView} aria-label="Fit all cards" title="Fit all cards"><Maximize size={14} /></button>
          <button type="button" onClick={toggleAll} aria-label={allCollapsed ? 'Open all cards' : 'Fold all cards'} title={allCollapsed ? 'Open all cards' : 'Fold all cards'}>
            {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
          </button>
        </div>
        <div className="story-hint">Drag a card by its header · drag from a ● dot to link · double-click the canvas to add</div>
      </div>
    </div>
  );
}
