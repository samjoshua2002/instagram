'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AudioLines, Check, X, Trash2, BookOpen, ListChecks, Sparkles, RefreshCw, ShieldCheck, Eye } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { enterMotion } from '../lib/motion';
import PageHero from '../components/PageHero';
import '../split.css';

/**
 * Voice Check: does the AI text like you? It runs by itself:
 *  - Summary: your own typed messages (with everyone, AI on or off) vs the AI's, last 30 days.
 *    Every difference becomes a rule the AI follows automatically.
 *  - The checker tests itself on your real messages once a day; if it can be trusted it fixes
 *    replies by itself, otherwise it only watches.
 *  - Learned from you: rules from the times you replied yourself instead of the AI.
 *  - Rate replies: optional, if you want to say yes / no to single replies.
 */
const when = d => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

export default function VoicePage() {
  const { API_BASE, showToast } = useApp();
  const [tab, setTab] = useState('summary');
  const [summary, setSummary] = useState(null);
  const [overview, setOverview] = useState(null);
  const [review, setReview] = useState(null);
  const [learned, setLearned] = useState(null);
  // "Not me" open on a reply: your own version being typed
  const [fixing, setFixing] = useState({});
  const [revealed, setRevealed] = useState({});
  const [testing, setTesting] = useState(false);

  const loadSummary = useCallback((fresh = false) => fetch(`${API_BASE}/api/voice/summary${fresh ? '?fresh=1' : ''}`).then(r => (r.ok ? r.json() : null)).then(setSummary).catch(() => setSummary({})), [API_BASE]);
  const loadOverview = useCallback(() => fetch(`${API_BASE}/api/voice/overview`).then(r => (r.ok ? r.json() : null)).then(setOverview).catch(() => {}), [API_BASE]);
  const loadReview = useCallback(() => fetch(`${API_BASE}/api/voice/review?limit=20`).then(r => (r.ok ? r.json() : { items: [], waiting: 0 })).then(setReview).catch(() => setReview({ items: [], waiting: 0 })), [API_BASE]);
  const loadLearned = useCallback(() => fetch(`${API_BASE}/api/voice/learned`).then(r => (r.ok ? r.json() : { rules: [] })).then(setLearned).catch(() => setLearned({ rules: [] })), [API_BASE]);
  useEffect(() => { loadSummary(); loadOverview(); loadReview(); loadLearned(); }, [loadSummary, loadOverview, loadReview, loadLearned]);

  const runTest = async () => {
    setTesting(true);
    const res = await fetch(`${API_BASE}/api/voice/audit`, { method: 'POST' }).catch(() => null);
    setTesting(false);
    if (!res?.ok) { showToast?.('Could not run the test', 'error'); return; }
    loadSummary();
  };
  const label = async (item, value, mine = '') => {
    const res = await fetch(`${API_BASE}/api/voice/logs/${item._id}/label`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: value, mine }),
    }).catch(() => null);
    if (!res?.ok) { showToast?.('Could not save that', 'error'); return; }
    const out = await res.json();
    setRevealed(r => ({ ...r, [item._id]: { ...out, label: value } }));
    loadOverview();
    setTimeout(() => setReview(rv => rv && ({ ...rv, items: rv.items.filter(i => i._id !== item._id), waiting: Math.max(0, rv.waiting - 1) })), 2200);
  };
  const forget = async rule => {
    const res = await fetch(`${API_BASE}/api/voice/learned/${rule._id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) { showToast?.('Could not remove it', 'error'); return; }
    setLearned(l => ({ ...l, rules: l.rules.filter(r => r._id !== rule._id) }));
  };

  const st = summary?.style;
  const audit = summary?.audit;
  const mode = summary?.mode;
  const active = (learned?.rules || []).filter(r => r.status === 'active').length;
  const s = overview?.stats;

  return (
    <motion.div {...enterMotion} className="page-container split-page spx-page has-hero vc">
      <PageHero
        seed="page-voice"
        icon={<AudioLines size={96} strokeWidth={2} />}
        eyebrow="Persona"
        title="Voice check"
        desc="Does the AI text like you? It compares its replies with the messages you type yourself, fixes the differences on its own, and tests itself every day. Nothing to do here; just look."
        meta={st?.match != null ? `Sounds like you: ${st.match}/100` : 'Learning from your messages'}
      />

      <div className="split-body">
        <aside className="split-side">
          <section className="split-card vc-stats">
            <h2 className="ctl-title">At a glance</h2>
            {!summary ? <p className="vc-muted">Loading…</p> : (
              <>
                <div className="vc-score">
                  <b>{st?.match ?? '–'}</b><span>/100</span>
                  <p>{st?.match == null ? 'Not enough messages yet to compare.' : st.match >= 80 ? 'The AI texts a lot like you.' : st.match >= 60 ? 'Close, with a few differences it is fixing.' : 'Quite different from you; it is fixing that now.'}</p>
                </div>
                <div className="vc-nums">
                  <div><b>{st?.yourMessages ?? 0}</b><span>messages you typed (last {st?.days || 30} days)</span></div>
                  <div><b>{st?.aiMessages ?? 0}</b><span>replies the AI sent</span></div>
                  <div><b>{st?.takeovers ?? 0}</b><span>times you replied instead of the AI</span></div>
                  <div><b>{active}</b><span>rules learned from that</span></div>
                </div>
                <div className={`vc-mode ${mode || ''}`}>
                  {mode === 'enforce' ? <ShieldCheck size={16} /> : <Eye size={16} />}
                  <span>{mode === 'enforce' ? 'The checker fixes replies that do not sound like you.' : mode === 'off' ? 'The checker is switched off.' : 'The checker only watches for now (it has not proven it agrees with you yet).'}</span>
                </div>
              </>
            )}
          </section>
        </aside>

        <main className="split-main">
          <div className="vc-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'summary'} className={tab === 'summary' ? 'on' : ''} onClick={() => setTab('summary')}>
              <Sparkles size={15} /> Summary
            </button>
            <button type="button" role="tab" aria-selected={tab === 'learned'} className={tab === 'learned' ? 'on' : ''} onClick={() => setTab('learned')}>
              <BookOpen size={15} /> Learned from you{learned?.rules?.length ? <span className="vc-count soft">{learned.rules.length}</span> : null}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'review'} className={tab === 'review' ? 'on' : ''} onClick={() => setTab('review')}>
              <ListChecks size={15} /> Rate replies <small className="vc-optional">optional</small>
            </button>
          </div>

          {tab === 'summary' && (
            <div className="vc-list">
              <section className="split-card">
                <div className="vc-head-row">
                  <h2 className="ctl-title">How the AI differs from you</h2>
                  <button type="button" className="vc-icon" onClick={() => loadSummary(true)} title="Check again now" aria-label="Check again now"><RefreshCw size={15} /></button>
                </div>
                {!summary && <p className="vc-muted">Loading…</p>}
                {summary && !st?.enough && (
                  <p className="vc-muted">Not enough yet: it needs at least 30 messages you typed and 30 the AI sent in the last 30 days ({st?.yourMessages || 0} and {st?.aiMessages || 0} so far). It fills in by itself as you chat.</p>
                )}
                {st?.enough && st.diffs.length === 0 && <p className="vc-muted"><Check size={14} /> No real differences: the AI's length, language mix, emoji and words match yours.</p>}
                {st?.enough && st.diffs.length > 0 && (
                  <ul className="vc-diffs">
                    {st.diffs.map(d => (
                      <li key={d.key}>
                        <span>{d.text}</span>
                        <small><Sparkles size={11} /> Fixing automatically: {d.fix.charAt(0).toLowerCase() + d.fix.slice(1)}</small>
                      </li>
                    ))}
                  </ul>
                )}
                {st?.enough && (
                  <table className="vc-compare">
                    <thead><tr><th /><th>You</th><th>AI</th></tr></thead>
                    <tbody>
                      <tr><td>Words per message</td><td>{st.you.avgWords}</td><td>{st.ai.avgWords}</td></tr>
                      <tr><td>Tanglish</td><td>{st.you.tanglish}%</td><td>{st.ai.tanglish}%</td></tr>
                      <tr><td>Emoji</td><td>{st.you.emoji}%</td><td>{st.ai.emoji}%</td></tr>
                      <tr><td>Starts lowercase</td><td>{st.you.lowercase}%</td><td>{st.ai.lowercase}%</td></tr>
                      <tr><td>Asks a question</td><td>{st.you.questions}%</td><td>{st.ai.questions}%</td></tr>
                    </tbody>
                  </table>
                )}
                <p className="vc-muted vc-foot">From every chat, AI on or off, including when you reply in between. Updated every few hours{st?.at ? `, last ${when(st.at)}` : ''}.</p>
              </section>

              <section className="split-card">
                <div className="vc-head-row">
                  <h2 className="ctl-title">Checker self-test</h2>
                  <button type="button" className="vc-btn" onClick={runTest} disabled={testing}><RefreshCw size={14} className={testing ? 'pm-spin' : ''} /> {testing ? 'Testing…' : 'Test now'}</button>
                </div>
                <p className="vc-muted">Every day the checker scores a sample of your own real messages (they must pass: they are you) and of the AI's. It is only allowed to fix replies when it passes yours reliably.</p>
                {!audit ? <p className="vc-muted">Not tested yet. It runs by itself once the AI has replied for a day, or press Test now.</p> : (
                  <>
                    <div className="vc-nums">
                      <div><b>{audit.realPass}%</b><span>of your real messages it passed (needs 85%+)</span></div>
                      <div><b>{audit.realAvg} vs {audit.aiAvg}</b><span>average score: you vs the AI</span></div>
                    </div>
                    <p className={`vc-verdict ${audit.trusted ? 'ok' : ''}`}>{audit.trusted ? 'Trusted: ' : 'Not trusted yet: '}{audit.reason}. Tested {when(audit.at)}.</p>
                  </>
                )}
              </section>
            </div>
          )}

          {tab === 'learned' && (
            <div className="vc-list">
              <section className="split-card">
                <p className="vc-muted">
                  When the AI has a reply ready and you type your own instead, it works out what you did differently.
                  A rule is used only after {learned?.promoteAt || 3} of your takeovers agree, and dropped if later ones go against it.
                </p>
              </section>
              {learned?.rules?.length === 0 && <section className="split-card"><p className="vc-muted">Nothing learned yet. Reply yourself sometimes while the AI is on, and it learns from the difference.</p></section>}
              {learned?.rules?.map(rule => (
                <section key={rule._id} className={`split-card vc-rule ${rule.status}`}>
                  <div className="vc-rule-head">
                    <span className={`vc-chip ${rule.status}`}>{rule.status === 'active' ? 'In use' : `Seen ${rule.support} of ${learned.promoteAt}`}</span>
                    <small>{rule.senderId ? `Only with ${rule.contactName || 'one person'}` : 'With everyone'}</small>
                    <button type="button" className="vc-icon" onClick={() => forget(rule)} aria-label="Forget this rule" title="Forget this rule"><Trash2 size={15} /></button>
                  </div>
                  <p className="vc-rule-text">{rule.text}</p>
                  {rule.examples?.length > 0 && (
                    <details className="vc-examples">
                      <summary>{rule.examples.length} example{rule.examples.length === 1 ? '' : 's'}</summary>
                      {rule.examples.slice(-3).map((ex, i) => (
                        <div key={i} className="vc-example">
                          {ex.incoming && <div><span>They sent</span>{ex.incoming}</div>}
                          <div><span>AI had</span>{ex.draft}</div>
                          <div><span>You sent</span>{ex.human}</div>
                        </div>
                      ))}
                    </details>
                  )}
                </section>
              ))}
            </div>
          )}

          {tab === 'review' && (
            <div className="vc-list">
              <section className="split-card vc-help">
                <b>Optional.</b> The AI already learns from your own messages by itself. Here you can confirm its replies: <b>Looks right</b>, or
                <b> Not me</b> and type how you would really reply (several lines if you send several messages). Your version teaches it like when you reply yourself.
                {s?.labelled ? ` You have checked ${s.labelled} so far.` : ''}
              </section>
              {!review && <section className="split-card"><p className="vc-muted">Loading…</p></section>}
              {review && review.items.length === 0 && <section className="split-card"><p className="vc-muted">Nothing to rate right now.</p></section>}
              {review?.items.map(item => {
                const done = revealed[item._id];
                return (
                  <section key={item._id} className={`split-card vc-item${done ? ` done ${done.label}` : ''}`}>
                    <div className="vc-item-head">
                      <b>{item.contactName || 'Someone'}</b>
                      <small>{item.kind === 'checkin' ? 'Check-in · ' : ''}{when(item.createdAt)}</small>
                    </div>
                    {item.incoming
                      ? <div className="vc-in"><span>They sent</span>{item.incoming}</div>
                      : <div className="vc-in"><span>Check-in</span>The chat was quiet, so the AI texted them first</div>}
                    <div className="vc-out"><span>AI replied as you</span>{item.draft}</div>
                    {item.final && item.final !== item.draft && (
                      <div className="vc-out sent">
                        <span>{item.status === 'blocked' ? 'Not sent: a safety rule replaced it with' : 'What was actually sent'}</span>{item.final}
                      </div>
                    )}
                    {done ? (
                      <p className="vc-reveal">
                        {done.label === 'send' ? <>Marked <b>looks right</b>.</> : <>Saved <b>your version</b>{done.rule ? `: it noticed "${done.rule.text}" (${done.rule.status === 'active' ? 'now in use' : `seen ${done.rule.support} of 3`})` : ''}.</>}
                        {' '}The checker gave the AI's reply <b>{done.score ?? '–'}/100</b>.
                      </p>
                    ) : fixing[item._id] !== undefined ? (
                      <form className="vc-mine" onSubmit={e => { e.preventDefault(); label(item, 'nosend', fixing[item._id]); }}>
                        <label htmlFor={`mine-${item._id}`}>How would you reply? <small>One message per line, like you send them</small></label>
                        <textarea id={`mine-${item._id}`} autoFocus rows={3} value={fixing[item._id]} maxLength={600}
                          onChange={e => setFixing(f => ({ ...f, [item._id]: e.target.value }))}
                          placeholder={'e.g.\nnot yet da\nwill send tonight'} />
                        <div className="vc-actions">
                          <button type="button" className="vc-btn" onClick={() => setFixing(f => { const n = { ...f }; delete n[item._id]; return n; })}>Back</button>
                          <button type="submit" className="vc-btn yes" disabled={!String(fixing[item._id] || '').trim()}><Check size={15} /> Save my reply</button>
                        </div>
                      </form>
                    ) : (
                      <div className="vc-actions">
                        <span className="vc-ask">Is this OK?</span>
                        <button type="button" className="vc-btn no" onClick={() => setFixing(f => ({ ...f, [item._id]: '' }))}><X size={15} /> Not me</button>
                        <button type="button" className="vc-btn yes" onClick={() => label(item, 'send')}><Check size={15} /> Looks right</button>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </motion.div>
  );
}
