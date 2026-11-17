'use client';

import { useEffect, useMemo, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { Search, Check, Sparkles, RotateCcw, GripVertical } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * After the quiz: rank your people. Top priority people get alert emails at once and check-ins;
 * not important people get no alert emails and no check-ins. Order inside a tier is the rank.
 *
 * Drag to rank: one list with the three tier headings as dividers (framer-motion Reorder), so the
 * row you hold follows the pointer, the others slide out of the way, and dropping it under another
 * heading moves it to that tier. Mouse: drag the whole row. Touch: drag the handle (the rest of
 * the row scrolls the page). Keyboard: focus the handle and press the up / down arrows.
 */
const TIERS = [
  { id: 'top', label: 'Top priority', hint: 'Alerts at once, the AI checks in on them' },
  { id: 'normal', label: 'Normal', hint: 'Usual replies and alerts' },
  { id: 'low', label: 'Not important', hint: 'No alert emails, no check-ins' },
];
const HEAD = id => `tier:${id}`;
const isHead = key => key.startsWith('tier:');
const SPRING = { type: 'spring', stiffness: 520, damping: 42, mass: 0.7 };

/** Pure: the flat list of keys (headings and people, in order) for the people's tiers. */
function keysOf(people) {
  return TIERS.flatMap(t => [HEAD(t.id), ...people.filter(p => p.priority === t.id).map(p => p.senderId)]);
}
/** Pure: people re-ordered and re-tiered from a flat key list (headings mark where each tier starts). */
function fromKeys(keys, people) {
  // The first tier's heading always stays on top: anyone dragged above it joins that tier
  const order = [HEAD(TIERS[0].id), ...keys.filter(k => k !== HEAD(TIERS[0].id))];
  const byId = new Map(people.map(p => [p.senderId, p]));
  const out = [];
  let tier = TIERS[0].id;
  for (const k of order) {
    if (isHead(k)) { tier = k.slice(5); continue; }
    const p = byId.get(k);
    if (p) out.push(p.priority === tier ? p : { ...p, priority: tier });
  }
  return out;
}

function Row({ p, index, mineMark, onTier, onDragStart, onMove }) {
  const controls = useDragControls();
  const [held, setHeld] = useState(false);
  return (
    <Reorder.Item
      as="li"
      value={p.senderId}
      dragListener={false}
      dragControls={controls}
      layout="position"
      transition={SPRING}
      className={`qz2-row${held ? ' is-held' : ''}`}
      data-rank-id={p.senderId}
      whileDrag={{ scale: 1.02, zIndex: 5, boxShadow: '0 18px 36px -14px rgba(0,0,0,0.55)' }}
      onDragStart={() => { setHeld(true); onDragStart(); }}
      onDragEnd={() => setHeld(false)}
      // Mouse / pen: the whole row drags (buttons still click); touch keeps scrolling the page
      onPointerDown={e => { if (e.pointerType !== 'touch' && !e.target.closest('button, a, input')) controls.start(e); }}
    >
      <button
        type="button"
        className="qz2-grip"
        aria-label={`Move ${p.name}: drag, or use the up and down arrow keys`}
        title="Drag to move"
        onPointerDown={e => { e.preventDefault(); controls.start(e); }}
        onKeyDown={e => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onMove(e.key === 'ArrowUp' ? -1 : 1); }
        }}
      >
        <GripVertical size={16} />
      </button>
      <span className="qz2-rank-n">{index + 1}</span>
      {p.profilePic ? <img src={p.profilePic} alt="" className="qz2-rank-av" referrerPolicy="no-referrer" draggable={false} /> : <span className="qz2-rank-av">{(p.name || '?')[0]}</span>}
      <span className="qz2-rank-name"><b>{p.name}</b><small>{p.instagramHandle ? `@${String(p.instagramHandle).replace(/^@+/, '')} · ` : ''}{(p.chatsCount || 0).toLocaleString()} chats
        {mineMark
          ? <em className="qz2-src you">yours</em>
          : p.priorityReason ? <em className="qz2-src"><Sparkles size={10} /> {p.priorityReason}</em> : null}</small></span>
      <span className="qz2-seg" role="group" aria-label={`Tier for ${p.name}`}>
        {TIERS.map(x => (
          <button key={x.id} type="button" className={p.priority === x.id ? 'on' : ''} onClick={() => onTier(x.id)} title={x.label}>{x.id === 'top' ? 'Top' : x.id === 'low' ? 'Low' : 'Normal'}</button>
        ))}
      </span>
    </Reorder.Item>
  );
}

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
  const keys = useMemo(() => keysOf(people || []), [people]);
  const byId = useMemo(() => new Map((people || []).map(p => [p.senderId, p])), [people]);
  const searching = q.trim().length > 0;
  const match = p => `${p.name} ${p.instagramHandle || ''}`.toLowerCase().includes(q.trim().toLowerCase());

  const reorder = next => {
    setPeople(list => {
      const out = fromKeys(next, list);
      const same = out.length === list.length && out.every((x, i) => x.senderId === list[i].senderId && x.priority === list[i].priority);
      return same ? list : out;
    });
    setDirty(true);
  };
  const setTier = (id, tier) => {
    touch(id);
    setPeople(list => { const p = list.find(x => x.senderId === id); return [...list.filter(x => x.senderId !== id), { ...p, priority: tier }]; });
    setDirty(true);
  };
  // Keyboard: one step up or down in the whole list (crossing a heading changes the tier)
  const moveBy = (id, dir) => {
    touch(id);
    const k = [...keys];
    const i = k.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 1 || j >= k.length) return;
    [k[i], k[j]] = [k[j], k[i]];
    reorder(k);
  };

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

  // Position of each person inside their tier (for the number on the row)
  const indexInTier = useMemo(() => {
    const m = new Map();
    for (const t of tiers) t.list.forEach((p, i) => m.set(p.senderId, i));
    return m;
  }, [tiers]);

  return (
    <section className="split-card qz2-card">
      <div className="qz2-q-head">
        <span className="qz2-eyebrow">Last step · Who matters most</span>
        <button type="button" className="qz2-btn" onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : dirty ? 'Save ranking' : <><Check size={14} /> Saved</>}</button>
      </div>
      <p className="qz2-summary">Ranked automatically from what the AI knows (friendship, memory, how recently you talk) and kept up to date. Drag anyone to move them, also into another group. Anyone you move stays where you put them.</p>
      <button type="button" className="qz2-btn ghost qz2-reset" onClick={resetAuto}><RotateCcw size={13} /> Reset all to automatic</button>
      <label className="qz2-search"><Search size={14} /><input className="bare-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Find someone" aria-label="Find someone" /></label>
      {!people && <div className="qz2-loading">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</div>}

      {/* Searching: a plain filtered list (dragging needs the whole list) */}
      {people && searching && tiers.map(t => {
        const list = t.list.filter(match);
        if (!list.length) return null;
        return (
          <div key={t.id} className={`qz2-tier ${t.id}`}>
            <div className="qz2-tier-head"><b>{t.label}</b><small>{list.length} found · clear the search to drag</small></div>
            <ol className="qz2-rank">
              {list.map(p => (
                <li key={p.senderId} className="qz2-row">
                  <span className="qz2-rank-n">{t.list.indexOf(p) + 1}</span>
                  {p.profilePic ? <img src={p.profilePic} alt="" className="qz2-rank-av" referrerPolicy="no-referrer" /> : <span className="qz2-rank-av">{(p.name || '?')[0]}</span>}
                  <span className="qz2-rank-name"><b>{p.name}</b><small>{p.instagramHandle ? `@${String(p.instagramHandle).replace(/^@+/, '')}` : ''}</small></span>
                  <span className="qz2-seg" role="group" aria-label={`Tier for ${p.name}`}>
                    {TIERS.map(x => (
                      <button key={x.id} type="button" className={p.priority === x.id ? 'on' : ''} onClick={() => setTier(p.senderId, x.id)}>{x.id === 'top' ? 'Top' : x.id === 'low' ? 'Low' : 'Normal'}</button>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}

      {people && !searching && (
        <Reorder.Group as="ol" axis="y" values={keys} onReorder={reorder} className="qz2-rank qz2-board">
          {keys.map(key => {
            if (isHead(key)) {
              const t = tiers.find(x => HEAD(x.id) === key);
              return (
                <Reorder.Item as="li" key={key} value={key} dragListener={false} layout="position" transition={SPRING} className={`qz2-tier-head qz2-tier-row ${t.id}`}>
                  <b>{t.label}</b><small>{t.list.length} · {t.hint}{t.list.length === 0 ? ' · drag someone here' : ''}</small>
                </Reorder.Item>
              );
            }
            const p = byId.get(key);
            return (
              <Row
                key={key}
                p={p}
                index={indexInTier.get(key) ?? 0}
                mineMark={p.prioritySource === 'you' || mine.has(key)}
                onTier={tier => setTier(key, tier)}
                onDragStart={() => touch(key)}
                onMove={dir => moveBy(key, dir)}
              />
            );
          })}
        </Reorder.Group>
      )}
    </section>
  );
}
