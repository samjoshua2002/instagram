'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * Chat Rules > "AI starts chats": the AI checks in on its own when a chat goes quiet, with everyone
 * the AI is on for or only the people you pick (only inside Instagram's 24-hour window, never two
 * in a row without an answer). It writes the way you really start chats.
 */
const WHO = [
  { id: 'all', label: 'Everyone with AI on' },
  { id: 'selected', label: 'Pick people' },
];

export default function CheckInsCard() {
  const { API_BASE, showToast } = useApp();
  const [s, setS] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    fetch(`${API_BASE}/api/checkins`).then(r => (r.ok ? r.json() : null)).then(setS).catch(() => {});
  }, [API_BASE]);
  const picked = useMemo(() => new Set(s?.people || []), [s?.people]);
  const shown = useMemo(() => {
    const list = (s?.contacts || []).filter(c => !q || `${c.name} ${c.handle}`.toLowerCase().includes(q.toLowerCase()));
    // Picked people first, then the rest in the order you last talked
    return [...list.filter(c => picked.has(c.senderId)), ...list.filter(c => !picked.has(c.senderId))];
  }, [s?.contacts, q, picked]);
  if (!s) return null;

  const save = async patch => {
    const before = s;
    setS({ ...s, ...patch });
    try {
      const res = await fetch(`${API_BASE}/api/checkins`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `server answered ${res.status}`);
    } catch (e) {
      setS(before);
      showToast?.(`Could not save: ${e.message}`, 'error');
    }
  };

  return (
    <section className="split-card">
      <h2 className="ctl-title">AI starts chats</h2>
      <p className="split-card-sub">
        When a chat goes quiet, the AI texts them first the way you do (your greeting, your nickname for them, learned from
        how you really start chats) and maybe asks one small thing. Their answer is saved to their profile.
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={s.enabled}
        className={`sb-ai-switch${s.enabled ? ' on' : ''}`}
        onClick={() => save({ enabled: !s.enabled })}
      >
        <span className="sb-ai-track" aria-hidden="true"><span className="sb-ai-knob" /></span>
        <span className="sb-ai-text">{s.enabled ? 'On' : 'Off'}</span>
      </button>
      {s.enabled && (
        <div className="ci-rows">
          <div className="ci-row">
            <span>Who</span>
            <div className="ci-seg">
              {WHO.map(l => (
                <button key={l.id} type="button" className={s.who === l.id ? 'on' : ''} onClick={() => save({ who: l.id })}>{l.label}</button>
              ))}
            </div>
          </div>
          {s.who === 'all' && <p className="ci-note">{(s.contacts || []).length} people · everyone you turned the AI on for.</p>}
          {s.who === 'selected' && (
            <div className="ci-pick">
              <div className="ci-pick-head">
                <label className="ci-pick-search"><Search size={14} /><input className="bare-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Find someone" aria-label="Find someone" /></label>
                <span>{picked.size} picked</span>
              </div>
              {(s.contacts || []).length === 0 && <p className="ci-note">Turn the AI on for someone first; only those people can get check-ins.</p>}
              <ul className="ci-pick-list">
                {shown.map(c => {
                  const on = picked.has(c.senderId);
                  return (
                    <li key={c.senderId}>
                      <button type="button" role="checkbox" aria-checked={on} className={on ? 'on' : ''}
                        onClick={() => save({ people: on ? [...picked].filter(x => x !== c.senderId) : [...picked, c.senderId] })}>
                        {c.profilePic ? <img src={c.profilePic} alt="" referrerPolicy="no-referrer" /> : <span className="ci-pick-av">{(c.name || '?')[0]}</span>}
                        <span className="ci-pick-name"><b>{c.name}</b>{c.handle && <small>@{String(c.handle).replace(/^@+/, '')}</small>}</span>
                        <span className="ci-pick-box" aria-hidden="true">{on && <Check size={13} />}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <label className="ci-row">
            <span>Quiet for</span>
            <select value={s.idleHours} onChange={e => save({ idleHours: Number(e.target.value) })}>
              {[2, 3, 4, 6, 8, 12].map(h => <option key={h} value={h}>{h} hours</option>)}
            </select>
          </label>
          <label className="ci-row">
            <span>Most per day</span>
            <select value={s.dailyLimit} onChange={e => save({ dailyLimit: Number(e.target.value) })}>
              {[2, 4, 6, 10, 15].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <p className="ci-note">Instagram only lets the AI message someone within 24 hours of their last message, so check-ins happen inside that window. It never sends another until they've answered the last one.</p>
        </div>
      )}
    </section>
  );
}
