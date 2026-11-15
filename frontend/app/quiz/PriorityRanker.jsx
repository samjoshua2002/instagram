'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, Search, Check } from 'lucide-react';
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

  useEffect(() => {
    fetch(`${API_BASE}/api/priorities`).then(r => (r.ok ? r.json() : { people: [] }))
      .then(d => setPeople((d.people || []).map(p => ({ ...p, priority: p.priority || 'normal' }))))
      .catch(() => setPeople([]));
  }, [API_BASE]);

  const tiers = useMemo(() => TIERS.map(t => ({ ...t, list: (people || []).filter(p => p.priority === t.id) })), [people]);
  const match = p => !q || `${p.name} ${p.instagramHandle || ''}`.toLowerCase().includes(q.toLowerCase());

  const setTier = (id, tier) => { setPeople(list => { const p = list.find(x => x.senderId === id); return [...list.filter(x => x.senderId !== id), { ...p, priority: tier }]; }); setDirty(true); };
  const move = (id, dir) => {
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
  const save = async () => {
    setSaving(true);
    const body = tiers.flatMap(t => t.list.map((p, i) => ({ senderId: p.senderId, priority: t.id, rank: i + 1 })));
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
      <p className="qz2-summary">Put your people in order. Move them up or down, or into another tier.</p>
      <label className="qz2-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find someone" aria-label="Find someone" /></label>
      {!people && <div className="qz2-loading">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</div>}
      {people && tiers.map(t => (
        <div key={t.id} className={`qz2-tier ${t.id}`}>
          <div className="qz2-tier-head"><b>{t.label}</b><small>{t.list.length} · {t.hint}</small></div>
          {t.list.length === 0 && <p className="qz2-measures">Nobody here yet.</p>}
          <ol className="qz2-rank">
            {t.list.map((p, i) => match(p) && (
              <li key={p.senderId}>
                <span className="qz2-rank-n">{i + 1}</span>
                {p.profilePic ? <img src={p.profilePic} alt="" className="qz2-rank-av" referrerPolicy="no-referrer" /> : <span className="qz2-rank-av">{(p.name || '?')[0]}</span>}
                <span className="qz2-rank-name"><b>{p.name}</b><small>{p.instagramHandle ? `@${p.instagramHandle} · ` : ''}{(p.chatsCount || 0).toLocaleString()} chats</small></span>
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
