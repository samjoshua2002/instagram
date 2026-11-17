'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, Search, Check, Sparkles, RotateCcw, GripVertical } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * After the quiz: rank your people. Top priority people get alert emails at once and check-ins;
 * not important people get no alert emails and no check-ins. Order inside a tier is the rank.
 */
const TIERS = [
  { id: 'top', label: 'Top priority', hint: 'Alerts at once, the AI checks in on them' },
  { id: 'normal', label: 'Normal', hint: 'Usual replies and alerts' },
  { id: 'low', label: 'Not important', hint: 'No alert emails, no check-ins' },
];

export default function PriorityRanker({ onSaved }) {
  const { API_BASE, showToast } = useApp();
  const [people, setPeople] = useState(null);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [mine, setMine] = useState(() => new Set());

  const loadPeople = () => fetch(`${API_BASE}/api/priorities`).then(r => (r.ok ? r.json() : { people: [] }))
      .then(d => { setPeople((d.people || []).map(p => ({ ...p, priority: p.priority || 'normal' }))); setMine(new Set()); setDirty(!d.ranked); })
    .catch(() => setPeople([]));
  useEffect(() => { loadPeople(); }, [API_BASE]); // eslint-disable-line react-hooks/exhaustive-deps
  const touch = id => setMine(s => new Set(s).add(id));
  const resetAuto = async () => {
    const res = await fetch(`${API_BASE}/api/priorities/auto`, { method: 'POST' }).catch(() => null);
    if (!res?.ok) { showToast?.('Could not reset', 'error'); return; }
    showToast?.('Ranked again from what the AI knows');
    setPeople(null);
    loadPeople();
  };

  const tiers = useMemo(() => TIERS.map(t => ({ ...t, list: (people || []).filter(p => p.priority === t.id) })), [people]);
  const match = p => !q || `${p.name} ${p.instagramHandle || ''}`.toLowerCase().includes(q.toLowerCase());

  const setTier = (id, tier) => { touch(id); setPeople(list => { const p = list.find(x => x.senderId === id); return [...list.filter(x => x.senderId !== id), { ...p, priority: tier }]; }); setDirty(true); };
  const move = (id, dir) => {
    touch(id);
    setPeople(list => {
      const p = list.find(x => x.senderId === id);
      const same = list.filter(x => x.priority === p.priority);
      const i = same.indexOf(p);
      const j = i + dir;
      if (j < 0 || j >= same.length) return list;
      const a = list.indexOf(same[i]);
      const b = list.indexOf(same[j]);
      const out = [...list];
      [out[a], out[b]] = [out[b], out[a]];
      return out;
    });
    setDirty(true);
  };
  // Drag to rank: grab the handle and drop anywhere, also into another tier (works with mouse and touch)
  const [dragId, setDragId] = useState(null);
  const drag = useRef(null);
  const placeAt = (id, targetId, after, tier) => setPeople(list => {
    const p = list.find(x => x.senderId === id);
    if (!p) return list;
    const rest = list.filter(x => x.senderId !== id);
    let at;
    if (targetId) {
      at = rest.findIndex(x => x.senderId === targetId);
      if (at < 0) return list;
      if (after) at += 1;
    } else {
      if (p.priority === tier) return list; // over its own tier's heading: stay put
      at = rest.map(x => x.priority).lastIndexOf(tier) + 1 || rest.length;
    }
    const out = [...rest.slice(0, at), { ...p, priority: tier }, ...rest.slice(at)];
    const same = out.length === list.length && out.every((x, i) => x.senderId === list[i].senderId && x.priority === list[i].priority);
    return same ? list : out;
  });
  const scrollParent = el => {
    for (let n = el?.parentElement; n; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    }
    return document.scrollingElement;
  };
  // Pointer moves are followed on the whole window, not the handle: the dragged row is moved in the
  // page as you drag, and moving an element drops the browser's pointer capture on it (that is
  // why dragging used to stop after the first step)
  const onGripMove = e => {
    const d = drag.current;
    if (!d) return;
    if (e.cancelable) e.preventDefault();
    d.x = e.clientX;
    d.y = e.clientY;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const row = under?.closest('[data-rank-id]');
    if (row) {
      const targetId = row.getAttribute('data-rank-id');
      if (targetId === d.id) return;
      const r = row.getBoundingClientRect();
      placeAt(d.id, targetId, e.clientY > r.top + r.height / 2, row.getAttribute('data-tier'));
      setDirty(true);
      return;
    }
    const zone = under?.closest('[data-tier-drop]');
    if (zone) { placeAt(d.id, null, true, zone.getAttribute('data-tier-drop')); setDirty(true); }
  };
  const onGripUp = () => {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    window.removeEventListener('pointermove', onGripMove);
    window.removeEventListener('pointerup', onGripUp);
    window.removeEventListener('pointercancel', onGripUp);
    document.body.classList.remove('qz2-dragging');
    drag.current = null;
    setDragId(null);
  };
  const startDrag = (id, scroller, x, y) => {
    if (drag.current) onGripUp();
    drag.current = { id, scroller, y, x, raf: 0 };
    setDragId(id);
    touch(id);
    document.body.classList.add('qz2-dragging');
    window.addEventListener('pointermove', onGripMove, { passive: false });
    window.addEventListener('pointerup', onGripUp);
    window.addEventListener('pointercancel', onGripUp);
    // Near the top or bottom of the screen the list scrolls by itself
    const edge = () => {
      const d = drag.current;
      if (!d) return;
      const zone = 70;
      const v = d.y < zone ? -(zone - d.y) / 4 : d.y > window.innerHeight - zone ? (d.y - (window.innerHeight - zone)) / 4 : 0;
      if (v) d.scroller.scrollTop += v;
      d.raf = requestAnimationFrame(edge);
    };
    drag.current.raf = requestAnimationFrame(edge);
  };
  // The handle: drag at once (mouse and touch; it takes the touch, so the page doesn't scroll)
  const onGripDown = (e, id) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    startDrag(id, scrollParent(e.currentTarget), e.clientX, e.clientY);
  };
  // The whole row, with a mouse or pen: the drag starts once it moves 5px, so clicks still work.
  // On touch the row scrolls the page as usual; the handle is the way to drag.
  const onRowDown = (e, id) => {
    if (e.pointerType === 'touch' || (e.button !== undefined && e.button !== 0)) return;
    if (e.target.closest('button, input, a, select')) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const scroller = scrollParent(e.currentTarget);
    const stop = () => {
      window.removeEventListener('pointermove', pre);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    const pre = ev => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      stop();
      startDrag(id, scroller, ev.clientX, ev.clientY);
      onGripMove(ev);
    };
    window.addEventListener('pointermove', pre);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };
  // Leaving the page mid-drag must not leave the listeners behind
  useEffect(() => () => { if (drag.current) onGripUp(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setSaving(true);
    const body = tiers.flatMap(t => t.list.map((p, i) => ({ senderId: p.senderId, priority: t.id, rank: i + 1, mine: mine.has(p.senderId) })));
    const res = await fetch(`${API_BASE}/api/priorities`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ people: body }) }).catch(() => null);
    setSaving(false);
    if (!res?.ok) { showToast?.('Could not save your ranking', 'error'); return; }
    setDirty(false);
    showToast?.('Ranking saved');
    onSaved?.();
  };

  return (
    <section className="split-card qz2-card">
      <div className="qz2-q-head">
        <span className="qz2-eyebrow">Last step · Who matters most</span>
        <button type="button" className="qz2-btn" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : dirty ? 'Save ranking' : <><Check size={14} /> Saved</>}</button>
      </div>
      <p className="qz2-summary">Ranked automatically from what the AI knows (friendship, memory, how recently you talk) and kept up to date. Anyone you move stays where you put them.</p>
      <button type="button" className="qz2-btn ghost qz2-reset" onClick={resetAuto}><RotateCcw size={13} /> Reset all to automatic</button>
      <label className="qz2-search"><Search size={14} /><input className="bare-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Find someone · drag the handle to reorder" aria-label="Find someone" /></label>
      {!people && <div className="qz2-loading">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</div>}
      {people && tiers.map(t => (
        <div key={t.id} className={`qz2-tier ${t.id}${dragId ? ' dragging' : ''}`} data-tier-drop={t.id}>
          <div className="qz2-tier-head"><b>{t.label}</b><small>{t.list.length} · {t.hint}</small></div>
          {t.list.length === 0 && <p className="qz2-measures">Nobody here yet.</p>}
          <ol className="qz2-rank">
            {t.list.map((p, i) => match(p) && (
              <li key={p.senderId} data-rank-id={p.senderId} data-tier={t.id} className={dragId === p.senderId ? 'is-dragging' : ''}
                onPointerDown={e => onRowDown(e, p.senderId)} title="Drag to move">
                <button type="button" className="qz2-grip" aria-label={`Drag to move ${p.name}`} title="Drag to move"
                  onPointerDown={e => onGripDown(e, p.senderId)}>
                  <GripVertical size={16} />
                </button>
                <span className="qz2-rank-n">{i + 1}</span>
                {p.profilePic ? <img src={p.profilePic} alt="" className="qz2-rank-av" referrerPolicy="no-referrer" /> : <span className="qz2-rank-av">{(p.name || '?')[0]}</span>}
                <span className="qz2-rank-name"><b>{p.name}</b><small>{p.instagramHandle ? `@${String(p.instagramHandle).replace(/^@+/, '')} · ` : ''}{(p.chatsCount || 0).toLocaleString()} chats
                  {p.prioritySource === 'you' || mine.has(p.senderId)
                    ? <em className="qz2-src you">yours</em>
                    : p.priorityReason ? <em className="qz2-src"><Sparkles size={10} /> {p.priorityReason}</em> : null}</small></span>
                <span className="qz2-seg" role="group" aria-label={`Tier for ${p.name}`}>
                  {TIERS.map(x => (
                    <button key={x.id} type="button" className={p.priority === x.id ? 'on' : ''} onClick={() => setTier(p.senderId, x.id)} title={x.label}>{x.id === 'top' ? 'Top' : x.id === 'low' ? 'Low' : 'Normal'}</button>
                  ))}
                </span>
                <span className="qz2-move">
                  <button type="button" onClick={() => move(p.senderId, -1)} disabled={i === 0} aria-label="Move up"><ChevronUp size={14} /></button>
                  <button type="button" onClick={() => move(p.senderId, 1)} disabled={i === t.list.length - 1} aria-label="Move down"><ChevronDown size={14} /></button>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}
