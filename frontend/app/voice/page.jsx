'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AudioLines, Check, X, Trash2, BookOpen, ListChecks } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { enterMotion } from '../lib/motion';
import PageHero from '../components/PageHero';
import '../split.css';

/**
 * Voice Check: does the AI sound like you?
 *  - Review: real AI drafts, one at a time. You say "I'd send this" or not, without seeing the judge's
 *    score (so it can't sway you). Your labels show whether the judge agrees with you and where its
 *    threshold should be; until then it only watches (shadow mode).
 *  - Learned: rules learned from times you replied yourself instead of the AI. A rule is used only
 *    after 3 of your takeovers agree.
 */
const STATUS = { pass: 'Passed', would_rewrite: 'Checker would rewrite', rewritten: 'Rewritten', blocked: 'Stopped by a safety rule', timeout: 'Checker too slow', error: 'Checker failed', skipped: 'Skipped' };
const MODE = { shadow: 'Watching only (shadow)', enforce: 'Rewriting (enforce)', off: 'Off' };
const pct = v => (v == null ? '–' : `${Math.round(v * 100)}%`);

export default function VoicePage() {
  const { API_BASE, showToast } = useApp();
  const [tab, setTab] = useState('review');
  const [overview, setOverview] = useState(null);
  const [review, setReview] = useState(null);
  const [learned, setLearned] = useState(null);
  const [notes, setNotes] = useState({});
  const [revealed, setRevealed] = useState({});

  const loadOverview = useCallback(() => fetch(`${API_BASE}/api/voice/overview`).then(r => (r.ok ? r.json() : null)).then(setOverview).catch(() => {}), [API_BASE]);
  const loadReview = useCallback(() => fetch(`${API_BASE}/api/voice/review?limit=20`).then(r => (r.ok ? r.json() : { items: [], waiting: 0 })).then(setReview).catch(() => setReview({ items: [], waiting: 0 })), [API_BASE]);
  const loadLearned = useCallback(() => fetch(`${API_BASE}/api/voice/learned`).then(r => (r.ok ? r.json() : { rules: [] })).then(setLearned).catch(() => setLearned({ rules: [] })), [API_BASE]);
  useEffect(() => { loadOverview(); loadReview(); loadLearned(); }, [loadOverview, loadReview, loadLearned]);

  const label = async (item, value) => {
    const res = await fetch(`${API_BASE}/api/voice/logs/${item._id}/label`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: value, note: notes[item._id] || '' }),
    }).catch(() => null);
    if (!res?.ok) { showToast?.('Could not save that', 'error'); return; }
    const out = await res.json();
    setRevealed(r => ({ ...r, [item._id]: { ...out, label: value } }));
    loadOverview();
    // Drop it from the list a moment later, after you've seen what the judge said
    setTimeout(() => setReview(rv => rv && ({ ...rv, items: rv.items.filter(i => i._id !== item._id), waiting: Math.max(0, rv.waiting - 1) })), 2200);
  };
  const forget = async rule => {
    const res = await fetch(`${API_BASE}/api/voice/learned/${rule._id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) { showToast?.('Could not remove it', 'error'); return; }
    setLearned(l => ({ ...l, rules: l.rules.filter(r => r._id !== rule._id) }));
  };

  const s = overview?.stats;
  const week = overview?.week || {};
  const checked = Object.values(week).reduce((a, b) => a + b, 0);
  const verdict = !s ? '' : !s.enough
    ? `Not enough ratings yet. Rate at least 10 replies you'd send and 10 you wouldn't (${s.send}/10 and ${s.nosend}/10 so far). Then this says whether the checker can be trusted.`
    : s.kappa >= 0.6 ? `The checker agrees with you. It can be allowed to fix replies (pass mark ${s.best?.threshold}).`
      : s.kappa >= 0.4 ? 'The checker partly agrees with you. It keeps watching only for now; rate a few more.'
        : 'The checker does not agree with you. It stays watching only and never changes your replies.';

  return (
    <motion.div {...enterMotion} className="page-container split-page spx-page has-hero vc">
      <PageHero
        seed="page-voice"
        icon={<AudioLines size={96} strokeWidth={2} />}
        eyebrow="Persona"
        title="Voice check"
        desc="Does the AI sound like you? Rate its real replies: would you have sent it? One tap each."
        meta={overview ? `${MODE[overview.mode] || overview.mode}${overview.wouldSendRate != null ? ` · you'd send ${overview.wouldSendRate}%` : ''}` : 'Loading'}
      />

      <div className="split-body">
        <aside className="split-side">
          <section className="split-card vc-stats">
            <h2 className="ctl-title">Your ratings</h2>
            {!overview ? <p className="vc-muted">Loading…</p> : (
              <>
                <div className="vc-nums">
                  <div><b>{s?.labelled ?? 0}</b><span>replies rated</span></div>
                  <div><b>{overview.wouldSendRate != null ? `${overview.wouldSendRate}%` : '–'}</b><span>sound like you</span></div>
                </div>
                <h3 className="vc-sub">Can the automatic checker be trusted?</h3>
                <p className="vc-muted">Before a reply goes out, a checker scores how much it sounds like you. Your ratings test it.</p>
                <div className="vc-nums">
                  <div><b>{pct(s?.tpr)}</b><span>of your Yes replies it also passed</span></div>
                  <div><b>{pct(s?.tnr)}</b><span>of your No replies it also caught</span></div>
                  <div><b>{s?.kappa ?? '–'}</b><span>agreement (1 = always agrees)</span></div>
                </div>
                <p className="vc-verdict">{verdict}</p>
                <h3 className="vc-sub">Last 7 days · {checked} checked</h3>
                <ul className="vc-week">
                  {Object.entries(STATUS).filter(([k]) => week[k]).map(([k, label]) => <li key={k}><span>{label}</span><b>{week[k]}</b></li>)}
                  {!checked && <li><span>No AI replies checked yet</span></li>}
                </ul>
                {overview.judgeMs?.p95 != null && <p className="vc-muted">Judge time: {overview.judgeMs.p50} ms typical, {overview.judgeMs.p95} ms slowest 5%.</p>}
              </>
            )}
          </section>
        </aside>

        <main className="split-main">
          <div className="vc-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'review'} className={tab === 'review' ? 'on' : ''} onClick={() => setTab('review')}>
              <ListChecks size={15} /> Review{review?.waiting ? <span className="vc-count">{review.waiting}</span> : null}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'learned'} className={tab === 'learned' ? 'on' : ''} onClick={() => setTab('learned')}>
              <BookOpen size={15} /> Learned from you{learned?.rules?.length ? <span className="vc-count soft">{learned.rules.length}</span> : null}
            </button>
          </div>

          {tab === 'review' && (
            <div className="vc-list">
              {!review && <section className="split-card"><p className="vc-muted">Loading…</p></section>}
              {review && review.items.length === 0 && (
                <section className="split-card"><p className="vc-muted">Nothing to review. New AI replies show up here as the AI answers your DMs.</p></section>
              )}
              {review && review.items.length > 0 && (
                <section className="split-card vc-help">
                  <b>Would you have sent it?</b> Tap <b>Yes</b> if the reply sounds like you, <b>No</b> if it does not (too formal, wrong slang,
                  something you would never say). Your answers show how often the AI sounds like you, and test the checker before it may fix replies by itself.
                </section>
              )}
              {review?.items.map(item => {
                const done = revealed[item._id];
                return (
                  <section key={item._id} className={`split-card vc-item${done ? ` done ${done.label}` : ''}`}>
                    <div className="vc-item-head">
                      <b>{item.contactName || 'Someone'}</b>
                      <small>{item.kind === 'checkin' ? 'Check-in · ' : ''}{new Date(item.createdAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small>
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
                        You said <b>{done.label === 'send' ? 'Yes' : 'No'}</b>. The checker gave it <b>{done.score ?? '–'}/100</b>
                        {done.score != null ? ` (it ${done.score >= (overview?.threshold || 65) ? 'would let it through' : 'would rewrite it'})` : ''}
                        {done.issues?.length ? `: ${done.issues.join('; ')}` : ''}.
                      </p>
                    ) : (
                      <div className="vc-actions">
                        <span className="vc-ask">Would you have sent this?</span>
                        <button type="button" className="vc-btn no" onClick={() => label(item, 'nosend')}><X size={15} /> No, not me</button>
                        <button type="button" className="vc-btn yes" onClick={() => label(item, 'send')}><Check size={15} /> Yes</button>
                        <input className="bare-input vc-why" value={notes[item._id] || ''} onChange={e => setNotes(n => ({ ...n, [item._id]: e.target.value }))}
                          placeholder="What is off? (optional, e.g. too formal, I would say da)" aria-label="What is off" maxLength={300} />
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {tab === 'learned' && (
            <div className="vc-list">
              <section className="split-card">
                <p className="vc-muted">
                  When the AI has a reply ready and you type your own instead, the AI works out what you did differently.
                  A rule is used in replies only after {learned?.promoteAt || 3} of your takeovers agree, and dropped if later ones go against it.
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
        </main>
      </div>
    </motion.div>
  );
}
