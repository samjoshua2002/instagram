'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, SkipForward, Sparkles, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

/**
 * Texting-style quiz: realistic DMs from someone new, a friend or a close friend. You reply the way
 * you really would; then you see what the AI would have said and how close it was. At the end the
 * AI drafts your persona from your answers; you review it and apply it.
 */
const FROM = { stranger: 'Someone new', friend: 'A friend', close: 'Your close friend' };

export default function QuizPage() {
  const { API_BASE, showToast } = useApp();
  const [session, setSession] = useState(null);
  const [next, setNext] = useState(null);
  const [total, setTotal] = useState(60);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [average, setAverage] = useState(null);
  const [applied, setApplied] = useState(false);
  const endRef = useRef(null);

  const call = async (path, body) => {
    const res = await fetch(`${API_BASE}/api/quiz/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `server answered ${res.status}`);
    return data;
  };
  useEffect(() => {
    call('start').then(d => { setSession(d.session); setNext(d.next); setTotal(d.total); }).catch(e => showToast?.(e.message, 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [session?.answered, busy, draft]);

  const send = async (skip = false) => {
    if (!next || busy || (!skip && !text.trim())) return;
    setBusy(true);
    try {
      const d = await call(`${session.id}/answer`, { itemId: next.id, text, skip });
      setSession(d.session);
      setNext(d.next);
      setText('');
    } catch (e) {
      showToast?.(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    setBusy(true);
    try {
      const d = await call(`${session.id}/finish`);
      setDraft(d.draft);
      setAverage(d.average);
    } catch (e) { showToast?.(e.message, 'error'); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try { await call(`${session.id}/apply`); setApplied(true); showToast?.('Persona updated from your answers'); } catch (e) { showToast?.(e.message, 'error'); } finally { setBusy(false); }
  };
  const restart = async () => {
    const d = await call('restart').catch(() => null);
    if (d) { setSession(d.session); setNext(d.next); setDraft(null); setApplied(false); setAverage(null); }
  };

  const history = session?.history || [];
  const answered = history.filter(h => !h.skipped);
  const scores = answered.filter(h => Number.isFinite(h.score)).map(h => h.score);
  const live = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const progress = session ? Math.round((100 * session.answered) / total) : 0;

  return (
    <div className="qz">
      <header className="qz-head">
        <Link href="/settings" className="qz-back"><ArrowLeft size={16} /> Persona</Link>
        <div className="qz-title">
          <h1>Train your clone</h1>
          <p>Reply the way you really would. The AI guesses first, then you see how close it got.</p>
        </div>
        <div className="qz-score" title="How close the AI's guesses are to your real replies">
          <b>{live ?? '–'}</b><span>match</span>
        </div>
      </header>
      <div className="qz-bar"><span style={{ width: `${progress}%` }} /></div>

      <div className="qz-thread">
        {history.map(h => (
          <div key={h.itemId} className="qz-turn">
            <div className="qz-from">{FROM[h.from]}</div>
            <div className="qz-in">{h.text}</div>
            {h.skipped ? <div className="qz-skipped">skipped</div> : (
              <>
                <div className="qz-out">{h.answer}</div>
                <div className="qz-ai">
                  <span className="qz-ai-label"><Sparkles size={12} /> AI would say</span>
                  <span className="qz-ai-text">{h.aiGuess}</span>
                  <span className={`qz-chip ${h.score >= 70 ? 'good' : h.score >= 45 ? 'ok' : 'bad'}`}>{h.score} match</span>
                  {h.note && <span className="qz-note">{h.note}</span>}
                </div>
              </>
            )}
          </div>
        ))}

        {next && !draft && (
          <div className="qz-turn">
            <div className="qz-round">{next.roundTitle}</div>
            <div className="qz-from">{FROM[next.from]}</div>
            <div className="qz-in">{next.text}</div>
            {busy && <div className="qz-typing"><i /><i /><i /></div>}
          </div>
        )}

        {!next && !draft && session && (
          <div className="qz-done">
            <h2>All done</h2>
            <p>The AI will now write your persona from your answers. You'll see it before anything changes.</p>
            <button type="button" className="qz-btn" onClick={finish} disabled={busy}>{busy ? 'Writing…' : 'Write my persona'}</button>
          </div>
        )}

        {draft && (
          <div className="qz-draft">
            <h2>What the AI learned{average != null ? ` · ${average}% match` : ''}</h2>
            {draft.summary && <p className="qz-summary">{draft.summary}</p>}
            {[['characteristics', 'My characteristics'], ['textingHabits', 'How I text'], ['replyRules', 'How I reply'], ['boundaries', 'Boundaries'], ['toneGuidelines', 'Tone']].map(([k, label]) => draft[k] && (
              <div key={k} className="qz-field"><b>{label}</b><p>{draft[k]}</p></div>
            ))}
            {draft.byPerson && (
              <div className="qz-field"><b>With different people</b>
                {Object.entries(draft.byPerson).map(([k, v]) => <p key={k}><i>{FROM[k] || k}:</i> {v}</p>)}
              </div>
            )}
            <div className="qz-actions">
              {applied
                ? <span className="qz-applied"><Check size={16} /> Saved to your persona</span>
                : <button type="button" className="qz-btn" onClick={apply} disabled={busy}>Apply to my persona</button>}
              <button type="button" className="qz-btn ghost" onClick={restart}>Take it again</button>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {next && !draft && answered.length >= 12 && (
        <button type="button" className="qz-early" onClick={finish} disabled={busy}>
          Enough for now · write my persona from {answered.length} answers (you can come back for the rest)
        </button>
      )}
      {next && !draft && (
        <form className="qz-compose" onSubmit={e => { e.preventDefault(); send(); }}>
          <input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Reply like you would…" disabled={busy} aria-label="Your reply" />
          <button type="button" className="qz-icon" onClick={() => send(true)} disabled={busy} title="Skip ('I'd leave this on seen')"><SkipForward size={16} /></button>
          <button type="submit" className="qz-icon send" disabled={busy || !text.trim()} aria-label="Send"><Send size={16} /></button>
        </form>
      )}
    </div>
  );
}
