'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Send, SkipForward, Sparkles, Check, ArrowLeft, ArrowRight, RotateCcw, User, ListOrdered } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { enterMotion } from '../lib/motion';
import PageHero from '../components/PageHero';
import PriorityRanker from './PriorityRanker';
import '../split.css';

/**
 * Texting-style quiz laid out like a test: numbered questions by section on the left, the open
 * question on the right. You reply the way you really would; the AI guesses first, then you see
 * how close it got. Then the AI drafts your persona, and you rank who matters most.
 */
const FROM = { stranger: 'Someone new', friend: 'A friend', close: 'Your close friend' };
const tone = s => (s >= 70 ? 'good' : s >= 45 ? 'ok' : 'bad');

export default function QuizPage() {
  const { API_BASE, showToast } = useApp();
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [total, setTotal] = useState(60);
  const [sel, setSel] = useState(null);
  const [view, setView] = useState('quiz'); // quiz | draft | rank
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [average, setAverage] = useState(null);
  const [applied, setApplied] = useState(false);
  const [last, setLast] = useState(null);

  const call = async (path, body) => {
    const res = await fetch(`${API_BASE}/api/quiz/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `server answered ${res.status}`);
    return data;
  };
  const load = d => {
    setSession(d.session); setNext(d.next); setTotal(d.total || 60);
    if (d.items) setItems(d.items);
    setSel(d.next?.id || null);
    // Step 1 is ranking your people: the quiz messages then come from them
    if (d.ranked === false) setView('rank');
  };
  const afterRanking = async () => {
    const d = await call('start').catch(() => null);
    if (d) { load(d); setView('quiz'); setLast(null); showToast?.('Now your top people send the quiz messages'); }
  };
  useEffect(() => {
    call('start').then(load).catch(e => showToast?.(e.message, 'error'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const history = session?.history || [];
  const byId = useMemo(() => Object.fromEntries(history.map(h => [h.itemId, h])), [history]);
  const sections = useMemo(() => {
    const out = [];
    items.forEach((it, n) => {
      let s = out[out.length - 1];
      if (!s || s.id !== it.round) { s = { id: it.round, title: it.roundTitle, items: [] }; out.push(s); }
      s.items.push({ ...it, n: n + 1 });
    });
    return out;
  }, [items]);
  const numberOf = id => items.findIndex(i => i.id === id) + 1;
  const current = items.find(i => i.id === sel) || next;
  const done = current ? byId[current.id] : null;
  const scores = history.filter(h => !h.skipped && Number.isFinite(h.score)).map(h => h.score);
  const live = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const answeredCount = history.filter(h => !h.skipped).length;
  const progress = session ? Math.round((100 * history.length) / total) : 0;
  const isOpen = (id, hist = history) => !hist.some(h => h.itemId === id);
  const openAfter = (id, hist = history) => {
    const start = items.findIndex(i => i.id === id);
    for (let k = 1; k < items.length; k += 1) {
      const it = items[(start + k) % items.length];
      if (it && isOpen(it.id, hist)) return it.id;
    }
    return null;
  };

  const send = async (skip = false) => {
    if (!current || done || busy || (!skip && !text.trim())) return;
    setBusy(true);
    try {
      const answeredId = current.id;
      const d = await call(`${session.id}/answer`, { itemId: answeredId, text, skip });
      const hist = d.session.history || [];
      setSession(d.session);
      setNext(d.next);
      setText('');
      setLast(skip ? null : hist.find(h => h.itemId === answeredId) || null);
      setSel(openAfter(answeredId, hist));
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
      setView('draft');
    } catch (e) { showToast?.(e.message, 'error'); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      await call(`${session.id}/apply`);
      setApplied(true);
      showToast?.('Persona updated. Now rank your people');
      setView('rank');
    } catch (e) { showToast?.(e.message, 'error'); } finally { setBusy(false); }
  };
  const restart = async () => {
    const d = await call('restart').catch(() => null);
    if (d) { load(d); setDraft(null); setApplied(false); setAverage(null); setLast(null); setView('quiz'); }
  };
  const go = id => { if (!id) return; setSel(id); setView('quiz'); setLast(null); setText(''); };

  const allDone = session && !next;
  const meta = session ? `${history.length} of ${total} done${live != null ? ` · ${live}% match` : ''}` : 'Loading';

  return (
    <motion.div {...enterMotion} className="page-container split-page spx-page has-hero qz2">
      <PageHero
        seed="page-quiz"
        icon={<Sparkles size={96} strokeWidth={2} />}
        eyebrow="Persona"
        title="Train your clone"
        desc="Real DMs from someone new, a friend or a close friend. Reply the way you really would. The AI guesses first, then you see how close it got."
        meta={meta}
      >
        <Link href="/settings" className="split-badge"><ArrowLeft size={14} /> Back to persona</Link>
      </PageHero>

      <div className="split-body">
        <aside className="split-side">
          <section className="split-card qz2-nav">
            <div className="qz2-score">
              <div className="qz2-ring" style={{ '--p': progress }}>
                <b>{live ?? '–'}</b><span>match</span>
              </div>
              <div>
                <h2 className="qz2-h">Your progress</h2>
                <p className="qz2-sub">{history.length}/{total} questions · {answeredCount} answered</p>
                <div className="qz2-bar"><span style={{ width: `${progress}%` }} /></div>
              </div>
            </div>

            {!session && <div className="qz2-loading">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>}
            {sections.map((s, si) => {
              const doneIn = s.items.filter(i => byId[i.id]).length;
              return (
                <div key={s.id} className="qz2-sec">
                  <div className="qz2-sec-head">
                    <span>Section {si + 1} · {s.title}</span>
                    <small className={doneIn === s.items.length ? 'full' : ''}>{doneIn}/{s.items.length}</small>
                  </div>
                  <div className="qz2-nums">
                    {s.items.map(it => {
                      const h = byId[it.id];
                      const state = h ? (h.skipped ? 'skip' : `done ${tone(h.score)}`) : 'open';
                      return (
                        <button key={it.id} type="button" onClick={() => go(it.id)}
                          className={`qz2-num ${state}${sel === it.id && view === 'quiz' ? ' on' : ''}`}
                          title={h ? (h.skipped ? 'Skipped' : `${h.score}% match`) : `${it.person?.name || FROM[it.from]}: ${it.text}`}
                          aria-label={`Question ${it.n}${h ? (h.skipped ? ', skipped' : `, ${h.score}% match`) : ''}`}>
                          {it.n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {sections.length > 0 && (
              <div className="qz2-legend">
                <span><i className="good" /> close match</span><span><i className="ok" /> partly</span>
                <span><i className="bad" /> off</span><span><i className="skip" /> skipped</span>
              </div>
            )}
            {answeredCount >= 12 && view === 'quiz' && (
              <button type="button" className="qz2-btn wide" onClick={draft ? () => setView('draft') : finish} disabled={busy}>
                <Sparkles size={15} /> {draft ? 'See what the AI learned' : allDone ? 'Write my persona' : `Write my persona from ${answeredCount} answers`}
              </button>
            )}
            {session && (
              <button type="button" className={`qz2-btn ghost wide${view === 'rank' ? ' on' : ''}`} onClick={() => setView('rank')}>
                <ListOrdered size={15} /> Rank who matters most
              </button>
            )}
          </section>
        </aside>

        <main className="split-main">
          {view === 'rank' && (
            <>
              {session && !history.length && (
                <section className="split-card qz2-card qz2-step">
                  <span className="qz2-eyebrow">Step 1 of 2</span>
                  <p className="qz2-summary">Rank your people first. Then the quiz messages come from them: your top people as close friends, the rest as friends, so the AI learns how you text each of them.</p>
                </section>
              )}
              <PriorityRanker onSaved={afterRanking} />
            </>
          )}

          {view === 'draft' && draft && (
            <section className="split-card qz2-card">
              <div className="qz2-q-head"><span className="qz2-pill"><Sparkles size={13} /> What the AI learned</span>{average != null && <span className="qz2-pill soft">{average}% match</span>}</div>
              {draft.summary && <p className="qz2-summary">{draft.summary}</p>}
              <div className="qz2-fields">
                {[['characteristics', 'My characteristics'], ['textingHabits', 'How I text'], ['replyRules', 'How I reply'], ['boundaries', 'Boundaries'], ['toneGuidelines', 'Tone']].map(([k, label]) => draft[k] && (
                  <div key={k} className="qz2-field"><b>{label}</b><p>{draft[k]}</p></div>
                ))}
                {draft.byPerson && (
                  <div className="qz2-field"><b>With different people</b>
                    {Object.entries(draft.byPerson).map(([k, v]) => <p key={k}><i>{FROM[k] || k}:</i> {v}</p>)}
                  </div>
                )}
              </div>
              <div className="qz2-actions">
                {applied
                  ? <button type="button" className="qz2-btn" onClick={() => setView('rank')}><Check size={15} /> Saved · next: rank your people</button>
                  : <button type="button" className="qz2-btn" onClick={apply} disabled={busy}>Apply to my persona</button>}
                {!allDone && <button type="button" className="qz2-btn ghost" onClick={() => go(next?.id)}>Answer more</button>}
                <button type="button" className="qz2-btn ghost" onClick={restart}><RotateCcw size={14} /> Take it again</button>
              </div>
            </section>
          )}

          {view === 'quiz' && (
            <>
              {last && (
                <section className="split-card qz2-card qz2-last">
                  <div className="qz2-q-head">
                    <span className="qz2-eyebrow">Question {numberOf(last.itemId)} result</span>
                    <span className={`qz2-chip ${tone(last.score)}`}>{last.score}% match</span>
                  </div>
                  <Compare h={last} />
                </section>
              )}

              {current ? (
                <section className="split-card qz2-card">
                  <div className="qz2-q-head">
                    <span className="qz2-eyebrow">Question {numberOf(current.id) || '–'} of {total} · {current.roundTitle}</span>
                    <span className="qz2-pill soft"><User size={12} /> {current.person ? `${current.person.name} · ${FROM[current.from].replace('Your ', '').toLowerCase()}` : FROM[current.from]}</span>
                  </div>
                  <div className="qz2-dm">
                    {current.person?.profilePic
                      ? <img className="qz2-dm-av" src={current.person.profilePic} alt="" referrerPolicy="no-referrer" />
                      : <span className="qz2-dm-av">{(current.person?.name || FROM[current.from])[0]}</span>}
                    <div><div className="qz2-dm-name">{current.person?.name || FROM[current.from]}</div><div className="qz2-in">{current.text}</div></div>
                  </div>
                  {current.measures && <p className="qz2-measures">Tests: {current.measures}</p>}

                  {done ? (
                    done.skipped ? <p className="qz2-measures">You skipped this one.</p> : (
                      <>
                        <div className="qz2-q-head"><span className="qz2-eyebrow">Your answer vs the AI</span><span className={`qz2-chip ${tone(done.score)}`}>{done.score}% match</span></div>
                        <Compare h={done} />
                      </>
                    )
                  ) : (
                    <form className="qz2-compose" onSubmit={e => { e.preventDefault(); send(); }}>
                      <textarea autoFocus rows={2} value={text} onChange={e => setText(e.target.value)} disabled={busy}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder="Reply like you really would…" aria-label="Your reply" />
                      <div className="qz2-compose-row">
                        <button type="button" className="qz2-btn ghost" onClick={() => send(true)} disabled={busy} title="I'd leave this on seen"><SkipForward size={14} /> Skip</button>
                        <button type="submit" className="qz2-btn" disabled={busy || !text.trim()}>
                          {busy ? <span className="qz2-typing"><i /><i /><i /></span> : <><Send size={14} /> Send</>}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="qz2-pager">
                    <button type="button" className="qz2-btn ghost" disabled={numberOf(current.id) <= 1} onClick={() => go(items[numberOf(current.id) - 2]?.id)}><ArrowLeft size={14} /> Previous</button>
                    {openAfter(current.id) && <button type="button" className="qz2-btn ghost" onClick={() => go(openAfter(current.id))}>Next open <ArrowRight size={14} /></button>}
                  </div>
                </section>
              ) : session && (
                <section className="split-card qz2-card qz2-done">
                  <h2>All {total} done</h2>
                  <p>The AI will write your persona from your answers. You'll see it before anything changes.</p>
                  <button type="button" className="qz2-btn" onClick={finish} disabled={busy}>{busy ? 'Writing…' : 'Write my persona'}</button>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </motion.div>
  );
}

function Compare({ h }) {
  return (
    <div className="qz2-compare">
      <div className="qz2-col"><span className="qz2-label">You</span><div className="qz2-out">{h.answer}</div></div>
      <div className="qz2-col"><span className="qz2-label"><Sparkles size={12} /> AI would say</span><div className="qz2-ai">{h.aiGuess}</div></div>
      {h.note && <p className="qz2-note">{h.note}</p>}
    </div>
  );
}
