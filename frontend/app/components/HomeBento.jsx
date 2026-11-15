'use client';

// Home's dashboard grid: a wide 14-day reply chart beside the AI-share ring, then top people, the circle's mix
// and AI coverage. Everything is drawn from data Home already has (GET /api/home/summary + the people list).
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ChevronRight } from 'lucide-react';
import { isAiOnFor } from '../lib/aiReply';

const fmt = n => (n === null || n === undefined ? '-' : Number(n).toLocaleString());
const sum = a => (a || []).reduce((x, y) => x + y, 0);

/** Stacked bars: AI replies (accent) on top of yours, one bar per day, today last. */
function ReplyChart({ summary }) {
  const r = summary?.replies;
  const days = summary?.days || [];
  const ai = r?.ai || [];
  const human = r?.human || [];
  const max = Math.max(1, ...ai.map((a, i) => a + (human[i] || 0)));
  const total = sum(ai) + sum(human);
  const label = d => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' });
  const full = d => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <section className="bn-card bn-chart" aria-label="Replies in the last 14 days">
      <div className="bn-head">
        <div>
          <h3 className="bn-title">Replies</h3>
          <p className="bn-sub">Last 14 days</p>
        </div>
        <div className="bn-legend">
          <span><i className="bn-dot ai" /> AI <b>{fmt(sum(ai))}</b></span>
          <span><i className="bn-dot you" /> You <b>{fmt(sum(human))}</b></span>
        </div>
      </div>
      {!r ? (
        <div className="bn-skeleton" aria-hidden="true" />
      ) : total === 0 ? (
        <p className="bn-empty">No replies yet. They show up here as soon as a DM is answered.</p>
      ) : (
        <div className="bn-bars" role="img" aria-label={`${fmt(sum(ai))} AI replies and ${fmt(sum(human))} of yours in 14 days`}>
          {days.map((d, i) => {
            const a = ai[i] || 0;
            const h = human[i] || 0;
            return (
              <div key={d} className={`bn-bar${i === days.length - 1 ? ' today' : ''}`} title={`${full(d)}: ${a} AI, ${h} yours`}>
                <div className="bn-bar-track">
                  <span className="bn-bar-ai" style={{ height: `${(a / max) * 100}%`, animationDelay: `${i * 25}ms` }} />
                  <span className="bn-bar-you" style={{ height: `${(h / max) * 100}%`, animationDelay: `${i * 25}ms` }} />
                </div>
                <span className="bn-bar-label">{label(d)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** How much of this week's replying the AI did, as a ring. */
function ShareRing({ summary, botOn }) {
  const share = summary?.aiShare?.thisWeek;
  const before = summary?.aiShare?.lastWeek;
  const w = summary?.replies?.thisWeek;
  const pct = Number.isFinite(share) ? share : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  const diff = Number.isFinite(share) && Number.isFinite(before) ? Math.round(share - before) : null;
  return (
    <Link href="/controls" className="bn-card bn-ring" aria-label="AI share this week. Open Controls">
      <div className="bn-head">
        <div>
          <h3 className="bn-title">AI share</h3>
          <p className="bn-sub">This week</p>
        </div>
        <span className={`bn-state${botOn ? ' on' : ''}`}><i /> {botOn ? 'AI on' : 'Paused'}</span>
      </div>
      <div className="bn-ring-body">
        <svg viewBox="0 0 120 120" className="bn-ring-svg" aria-hidden="true">
          <circle cx="60" cy="60" r={R} className="bn-ring-track" />
          <circle cx="60" cy="60" r={R} className="bn-ring-arc" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} />
        </svg>
        <div className="bn-ring-num">
          <b>{Number.isFinite(share) ? `${Math.round(share)}%` : '-'}</b>
          <span>by the AI</span>
        </div>
      </div>
      <div className="bn-ring-foot">
        <span><b>{fmt(w?.ai)}</b> AI</span>
        <span><b>{fmt(w?.human)}</b> you</span>
        {diff !== null && diff !== 0 && <span className={diff > 0 ? 'up' : ''}>{diff > 0 ? '+' : ''}{diff} pts</span>}
      </div>
    </Link>
  );
}

/** The five people you talk to most, with their share of the top one. */
function TopPeople({ people, personHref, Photo, loading }) {
  const top = [...people].filter(p => (p.chatsCount || 0) > 0).sort((a, b) => (b.chatsCount || 0) - (a.chatsCount || 0)).slice(0, 5);
  const max = Math.max(1, top[0]?.chatsCount || 1);
  return (
    <section className="bn-card bn-top" aria-label="People you talk to most">
      <div className="bn-head">
        <div>
          <h3 className="bn-title">Most talked to</h3>
          <p className="bn-sub">By messages</p>
        </div>
        <Link href="/relationships" className="bn-more">All <ChevronRight size={14} /></Link>
      </div>
      {loading ? (
        <div className="bn-skeleton" aria-hidden="true" />
      ) : top.length === 0 ? (
        <p className="bn-empty">Your top chats appear here once DMs sync.</p>
      ) : (
        <ol className="bn-rank">
          {top.map((p, i) => (
            <li key={p.id}>
              <Link href={personHref(p)} className="bn-rank-row">
                <span className="bn-rank-n">{i + 1}</span>
                <Photo person={p} className="bn-rank-photo" />
                <span className="bn-rank-main">
                  <span className="bn-rank-name">{p.name}</span>
                  <span className="bn-rank-track"><span style={{ width: `${((p.chatsCount || 0) / max) * 100}%`, animationDelay: `${i * 60}ms` }} /></span>
                </span>
                <span className="bn-rank-val">{fmt(p.chatsCount)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Who is in the circle, by kind. */
function CircleMix({ people, labels, loading }) {
  const counts = new Map();
  for (const p of people) {
    const k = p.category || 'online_friend';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = people.length || 1;
  return (
    <section className="bn-card bn-mix" aria-label="Your circle by kind">
      <div className="bn-head">
        <div>
          <h3 className="bn-title">Your circle</h3>
          <p className="bn-sub">{loading ? 'Loading' : `${fmt(people.length)} ${people.length === 1 ? 'person' : 'people'}`}</p>
        </div>
      </div>
      {loading ? (
        <div className="bn-skeleton" aria-hidden="true" />
      ) : rows.length === 0 ? (
        <p className="bn-empty">Nobody here yet.</p>
      ) : (
        <ul className="bn-mix-list">
          {rows.map(([k, n], i) => (
            <li key={k}>
              <span className="bn-mix-label">{labels[k] || k}</span>
              <span className="bn-mix-track"><span style={{ width: `${(n / total) * 100}%`, animationDelay: `${i * 60}ms` }} /></span>
              <span className="bn-mix-val">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** How many people the AI answers for, and how much it knows. */
function Coverage({ people, routingConfig, summary, loading }) {
  const on = people.filter(p => isAiOnFor(p, routingConfig)).length;
  const facts = sum(people.map(p => p.factsCount || (p.facts || p.lore || []).length || 0));
  const waiting = summary?.handoffs?.total || 0;
  const tiles = [
    { label: 'AI replies for', value: on, sub: `of ${fmt(people.length)}`, href: '/controls' },
    { label: 'You reply to', value: people.length - on, sub: 'AI off', href: '/controls' },
    { label: 'Facts learned', value: facts, sub: 'across everyone', href: '/relationships' },
    { label: 'Waiting for you', value: waiting, sub: waiting ? 'handed over' : 'all clear', href: '/controls', warn: waiting > 0 },
  ];
  return (
    <section className="bn-card bn-cover" aria-label="AI coverage">
      <div className="bn-head">
        <div>
          <h3 className="bn-title">AI coverage</h3>
          <p className="bn-sub">Right now</p>
        </div>
      </div>
      {loading ? <div className="bn-skeleton" aria-hidden="true" /> : (
      <div className="bn-cover-grid">
        {tiles.map(t => (
          <Link key={t.label} href={t.href} className={`bn-mini${t.warn ? ' warn' : ''}`}>
            <b>{fmt(t.value)}</b>
            <span>{t.label}</span>
            <small>{t.sub}</small>
          </Link>
        ))}
      </div>
      )}
    </section>
  );
}

/**
 * The AI's memory across everyone: people indexed, share of all messages read and the average
 * brain score (weighted by chat size). Indexing runs on its own in the background; while it is
 * still going this refreshes every 15 seconds.
 */
function MemoryStatus() {
  const { API_BASE } = useApp();
  const [d, setD] = useState(null);
  const [agent, setAgent] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const loadQuestions = () => fetch(`${API_BASE}/api/memory-index/questions`).then(r => (r.ok ? r.json() : null)).then(setQuestions).catch(() => {});
  useEffect(() => {
    fetch(`${API_BASE}/api/memory-index/agent`).then(r => (r.ok ? r.json() : null)).then(setAgent).catch(() => {});
    loadQuestions();
  }, [API_BASE]); // eslint-disable-line react-hooks/exhaustive-deps
  const reply = async (q, dismiss = false) => {
    const answer = dismiss ? '' : String(answers[q._id] || '').trim();
    if (!dismiss && !answer) return;
    setQuestions(x => x && ({ ...x, items: x.items.filter(i => i._id !== q._id), total: x.total - 1 }));
    await fetch(`${API_BASE}/api/people/${encodeURIComponent(q.senderId)}/memory/doubts/${q._id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }),
    }).catch(() => {});
  };
  useEffect(() => {
    let t = null;
    const load = () => fetch(`${API_BASE}/api/memory-index`).then(r => (r.ok ? r.json() : null)).then(x => {
      setD(x);
      clearTimeout(t);
      t = setTimeout(load, x && x.overall && x.overall.ready < x.overall.people ? 15000 : 120000);
    }).catch(() => {});
    load();
    return () => clearTimeout(t);
  }, [API_BASE]);
  const o = d?.overall;
  const busy = o && o.ready < o.people;
  const top = (d?.people || []).filter(p => p.status === 'ready').sort((a, b) => (b.brainScore || 0) - (a.brainScore || 0)).slice(0, 3);
  return (
    <section className="bn-card bn-memory" aria-label="AI memory">
      <div className="bn-head">
        <div>
          <h3 className="bn-title">AI memory</h3>
          <p className="bn-sub">{!o ? 'Loading' : busy ? 'Reading your chats in the background' : 'Up to date'}</p>
        </div>
        {busy && <span className="bn-state on"><i /> Indexing</span>}
      </div>
      {!o ? <div className="bn-skeleton" aria-hidden="true" /> : (
        <>
          <div className="bn-mem-nums">
            <div><b>{o.ready}<small>/{o.people}</small></b><span>people known</span></div>
            <div><b>{o.indexedPct}%</b><span>messages read</span></div>
            <div><b>{o.brain}</b><span>avg brain score</span></div>
          </div>
          <div className="bn-mem-bar" aria-hidden="true"><span style={{ width: `${Math.max(3, o.indexedPct)}%` }} /></div>
          {top.length > 0 && <p className="bn-mem-top">Knows best: {top.map(p => `${p.name} ${p.brainScore}`).join(' · ')}</p>}
          {questions?.total > 0 && (
            <div className="bn-review">
              <span className="bn-agent-head">Needs your review · {questions.total} question{questions.total === 1 ? '' : 's'} from the AI</span>
              {questions.items.slice(0, 4).map(q => (
                <form key={q._id} className="bn-review-row" onSubmit={e => { e.preventDefault(); reply(q); }}>
                  <span className="bn-review-q"><b>{q.name}</b>: {q.question}</span>
                  <span className="bn-review-a">
                    <input value={answers[q._id] || ''} onChange={e => setAnswers(a => ({ ...a, [q._id]: e.target.value }))} placeholder="Answer" aria-label={`Answer: ${q.question}`} />
                    <button type="submit" disabled={!String(answers[q._id] || '').trim()}>Send</button>
                    <button type="button" onClick={() => reply(q, true)} aria-label="Dismiss" title="Not important">✕</button>
                  </span>
                </form>
              ))}
              {questions.total > 4 && <span className="bn-agent-row">+ {questions.total - 4} more on people's pages</span>}
            </div>
          )}
          {agent && (
            <div className="bn-agent">
              <span className="bn-agent-head">Memory agent · checked {agent.reviewedToday} {agent.reviewedToday === 1 ? 'person' : 'people'} today</span>
              {(agent.items || []).slice(0, 3).map(a => (
                <span key={a._id} className="bn-agent-row" title={(a.details || []).join('\n')}>
                  {a.name ? <b>{a.name}</b> : null}{a.name ? ': ' : ''}{a.summary}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function HomeBento({ summary, people, routingConfig, botOn, personHref, Photo, labels, kpis, loading = false }) {
  return (
    <div className="bn-grid">
      <ReplyChart summary={summary} />
      <ShareRing summary={summary} botOn={botOn} />
      <div className="bn-kpis">{kpis}</div>
      <MemoryStatus />
      <TopPeople people={people} personHref={personHref} Photo={Photo} loading={loading} />
      <CircleMix people={people} labels={labels} loading={loading} />
      <Coverage people={people} routingConfig={routingConfig} summary={summary} loading={loading} />
    </div>
  );
}
