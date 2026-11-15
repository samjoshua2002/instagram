'use client';

import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Chat Rules > "AI starts chats": the AI checks in on its own when a chat with someone close goes
 * quiet (only inside Instagram's 24-hour window, never in quiet hours, at most once a day each).
 */
const LEVELS = [
  { id: 'close', label: 'Close only' },
  { id: 'friend', label: 'Friends too' },
];

export default function CheckInsCard() {
  const { API_BASE, showToast } = useApp();
  const [s, setS] = useState(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/checkins`).then(r => (r.ok ? r.json() : null)).then(setS).catch(() => {});
  }, [API_BASE]);
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
        When a chat with someone close goes quiet, the AI checks in like you would and asks one thing it doesn't know yet.
        Their answer is saved to their profile.
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
              {LEVELS.map(l => (
                <button key={l.id} type="button" className={s.minLevel === l.id ? 'on' : ''} onClick={() => save({ minLevel: l.id })}>{l.label}</button>
              ))}
            </div>
          </div>
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
          <p className="ci-note">Instagram only lets the AI message someone within 24 hours of their last message, so check-ins happen inside that window. Never between 10pm and 8am.</p>
        </div>
      )}
    </section>
  );
}
