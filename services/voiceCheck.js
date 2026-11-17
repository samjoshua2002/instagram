/**
 * "Does this sound like the owner?" check, run on every AI draft before it is sent.
 *  1. Rules (instant, no AI): assistant / bot phrases and drafts far longer than the owner writes.
 *  2. A small, fast model scores 0-100 how believable the draft is as the owner's own text, compared
 *     with the owner's real messages.
 *
 * Modes (VOICE_CHECK; unset = automatic: shadow until the checker's daily self-test on the owner's
 * own messages shows it can be trusted for that account, then enforce, see voiceAudit.js):
 *  - shadow: rule failures are fixed (one rewrite); the judge only scores and logs
 *    "would_rewrite", the draft goes out as written. Research shows small judges are unreliable on
 *    short chat style, so the judge must be checked against the owner's own labels first.
 *  - enforce: a low judge score also triggers the rewrite.
 *  - off: nothing runs.
 * VOICE_CHECK_ENFORCE_PERCENT (0-100) enforces for that share of accounts while the rest stay in
 * shadow; each account always lands in the same bucket.
 *
 * Every check is logged (models/VoiceCheckLog.js) for the Voice Check page, where the owner labels
 * drafts "I'd send this" or not; that measures whether the judge agrees with them.
 * Never blocks a reply: a slow or failing judge lets the draft through.
 */

const PASS_SCORE = Number(process.env.VOICE_CHECK_THRESHOLD) || 65; // below this the judge says "rewrite"
const JUDGE_TIMEOUT_MS = 6000;
const FAST = () => process.env.FAST_MODEL || 'gpt-5.4-mini';

// Things people don't text friends; assistants and bots do
const BOT_PHRASES = [
  [/\bjust (checking|wanted to check) in\b/i, '"just checking in"'],
  [/\bhope (you('| a)?re|u r|ur) (doing )?(well|good|great)\b/i, '"hope you\'re doing well"'],
  [/\bhow (have|are) you been holding up\b/i, '"how have you been holding up"'],
  [/\bfeel free to\b/i, '"feel free to"'],
  [/\blet me know if (you|u) need\b/i, '"let me know if you need anything"'],
  [/\b(i('| a)?m|i am) (always )?here (for you|if you need)\b/i, '"I\'m here for you"'],
  [/\bi (totally |completely )?understand (how|that|what) you\b/i, '"I understand how you feel"'],
  [/\bthat('| i)s (totally|completely) (valid|understandable)\b/i, '"that\'s totally valid"'],
  [/\b(absolutely|certainly)[!.]/i, '"absolutely!" / "certainly!"'],
  [/\bas an ai\b|\blanguage model\b/i, 'mentions being an AI'],
  [/\bi was (just )?thinking about you\b/i, '"I was thinking about you"'],
  [/\b(is there )?anything else (i can|you need)\b/i, '"anything else I can help with"'],
  [/\bno worries at all\b/i, '"no worries at all"'],
];

const wordsOf = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;

/** off | shadow | enforce for this account. */
function bucketOf(id) {
  // FNV-1a: stable, so an account never flips between groups
  let h = 0x811c9dc5;
  for (const ch of String(id || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % 100;
}
function modeFor(ownerId) {
  const m = String(process.env.VOICE_CHECK || 'shadow').toLowerCase();
  if (m === 'off') return 'off';
  if (m === 'enforce') return 'enforce';
  const pct = Math.max(0, Math.min(100, Number(process.env.VOICE_CHECK_ENFORCE_PERCENT) || 0));
  return pct > 0 && ownerId && bucketOf(ownerId) < pct ? 'enforce' : 'shadow';
}

/** Pure: the language of a short message (script first, then the owner's Tanglish word list). */
function languageOf(text) {
  const t = String(text || '');
  const letters = t.match(/\p{L}/gu) || [];
  if (!letters.length) return 'none';
  const tamil = (t.match(/[஀-௿]/g) || []).length;
  const deva = (t.match(/[ऀ-ॿ]/g) || []).length;
  if (tamil / letters.length > 0.5) return 'tamil';
  if (deva / letters.length > 0.5) return 'hindi';
  if (tamil || deva) return 'mixed-script';
  try {
    if (require('./voiceService').isTanglish(t)) return 'tanglish';
  } catch { /* the word list is optional here */ }
  return letters.length < 4 ? 'short' : 'latin';
}

/**
 * Pure rule check. `fp` is the owner's texting fingerprint (voiceService.fingerprint), or null.
 * @returns {string[]} problems, empty when the draft passes
 */
function ruleIssues(draft, fp = null) {
  const text = String(draft || '');
  const issues = [];
  for (const [re, label] of BOT_PHRASES) if (re.test(text)) issues.push(`sounds like a bot: ${label}`);
  if (fp && fp.count >= 20) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const longest = Math.max(0, ...lines.map(wordsOf));
    const usual = Math.max(fp.medianWords || 0, fp.avgWords || 0);
    // Owner mostly sends short lines: a long paragraph gives the AI away
    if (longest > Math.max(14, Math.round(usual * 3) + 4)) issues.push(`far too long: a line has ${longest} words, you usually write about ${Math.round(usual)}`);
    if (fp.periodEndShare <= 5 && lines.filter(l => /[^.]\.$/.test(l)).length >= 2) issues.push('ends lines with full stops, you almost never do');
    if (fp.capStartShare <= 10 && lines.filter(l => /^[A-Z][a-z]/.test(l)).length >= 2) issues.push('starts lines with capitals, you usually type lowercase');
  }
  return issues;
}

/**
 * Fast-model judge: 0-100 how believable the draft is as the owner's own text.
 * @returns {{score, issues, ms}} or {error: 'timeout'|'error'|'nostyle', ms}
 */
async function judge({ draft, incoming = '', style = '', creatorName = 'the owner', ai }) {
  if (!style || !draft) return { error: 'nostyle', ms: 0 };
  const started = Date.now();
  const task = ai.jsonWithFallback(FAST(), [
    { role: 'system', content: `You check if a draft Instagram DM really sounds like ${creatorName} wrote it, using ${creatorName}'s REAL messages below.
Judge only how it is written: length, words and slang, language mix, casing, punctuation, emoji, warmth, how direct. Not the facts.
Score 0-100: 100 = their friends could never tell; 50 = a bit off; 0 = obviously a bot.
List the concrete differences (max 3, short), e.g. "too long", "too formal", "uses 'hey there', you say 'oii'", "no Tanglish, you always mix".
JSON only: {"score": n, "issues": ["..."]}` },
    { role: 'user', content: `${creatorName.toUpperCase()}'S REAL MESSAGES:\n${String(style).slice(0, 3500)}\n\n${incoming ? `THEY SENT: ${String(incoming).slice(0, 400)}\n` : ''}DRAFT: ${String(draft).slice(0, 600)}` },
  ]).then(out => ({ out }), () => ({ failed: true }));
  const timeout = new Promise(resolve => { const t = setTimeout(() => resolve({ timedOut: true }), JUDGE_TIMEOUT_MS); t.unref?.(); });
  const res = await Promise.race([task, timeout]);
  const ms = Date.now() - started;
  if (res.timedOut) return { error: 'timeout', ms };
  if (res.failed || !res.out || !Number.isFinite(Number(res.out.score))) return { error: 'error', ms };
  return {
    score: Math.max(0, Math.min(100, Math.round(Number(res.out.score)))),
    issues: (Array.isArray(res.out.issues) ? res.out.issues : []).map(x => String(x).slice(0, 120)).filter(Boolean).slice(0, 3),
    ms,
  };
}

/**
 * Checks a draft; fixes rule failures (and, in enforce mode, low judge scores) with one rewrite.
 * `rewrite(note)` writes a new draft from the problems (the caller knows its own prompt and format).
 * @returns {{ text, score, issues, ruleIssues, rewritten, status, mode, judgeMs, language }}
 */
async function gate({ draft, incoming = '', style = '', fp = null, creatorName, ai, rewrite, ownerId = null }) {
  let mode = modeFor(ownerId);
  // Self-tested and trusted for this account (services/voiceAudit.js): it may rewrite by itself.
  // VOICE_CHECK=shadow|enforce|off set on purpose always wins; VOICE_CHECK_AUTO=off turns this off.
  if (mode === 'shadow' && !process.env.VOICE_CHECK && String(process.env.VOICE_CHECK_AUTO || 'on') !== 'off' && ownerId) {
    if (await require('./voiceAudit').trusted(ownerId).catch(() => false)) mode = 'enforce';
  }
  const base = { text: draft, score: null, issues: [], ruleIssues: [], rewritten: false, mode, judgeMs: null, language: languageOf(draft) };
  if (mode === 'off' || !draft) return { ...base, status: mode === 'off' ? 'off' : 'skipped' };
  const rules = ruleIssues(draft, fp);
  const verdict = await judge({ draft, incoming, style, creatorName, ai });
  const judgeFails = Number.isFinite(verdict.score) && verdict.score < PASS_SCORE;
  const out = { ...base, score: verdict.score ?? null, ruleIssues: rules, judgeMs: verdict.ms || null,
    issues: [...rules, ...(judgeFails ? verdict.issues : [])] };
  const judgeStatus = verdict.error === 'timeout' ? 'timeout' : verdict.error === 'error' ? 'error' : null;

  // Shadow: only rule failures are fixed; the judge's opinion is recorded, not acted on
  const actOnJudge = mode === 'enforce' && judgeFails;
  if (!rules.length && !actOnJudge) {
    return { ...out, status: judgeFails ? 'would_rewrite' : (judgeStatus || 'pass') };
  }
  if (typeof rewrite !== 'function') return { ...out, status: judgeFails ? 'would_rewrite' : (judgeStatus || 'pass') };
  const problems = actOnJudge ? out.issues : rules;
  const note = `Your draft doesn't sound like you${actOnJudge ? ` (${verdict.score}/100)` : ''}:\n${problems.map(i => `- ${i}`).join('\n') || '- too generic'}\n` +
    'Write it again the way you REALLY text (copy your real messages: length, words, language, casing, punctuation). Same meaning, nothing new.';
  try {
    const again = String((await rewrite(note)) || '').trim();
    // Kept only if it is no worse on the rules than the original (rewrites can flatten a voice)
    if (again && ruleIssues(again, fp).length < Math.max(1, rules.length + (actOnJudge ? 1 : 0))) {
      return { ...out, text: again, rewritten: true, status: 'rewritten' };
    }
  } catch { /* keep the draft */ }
  return { ...out, status: judgeFails ? 'would_rewrite' : (judgeStatus || 'pass') };
}

/** Saves one check for the Voice Check page. Never throws. */
async function logCheck({ ownerId, senderId = '', contactName = '', kind = 'reply', incoming = '', draft = '', verdict }) {
  if (!ownerId || !verdict || verdict.status === 'off') return null;
  try {
    const VoiceCheckLog = require('../models/VoiceCheckLog');
    return await VoiceCheckLog.create({
      ownerId, senderId: String(senderId || ''), contactName: String(contactName || '').slice(0, 80), kind,
      incoming: String(incoming || '').slice(0, 600), draft: String(draft || '').slice(0, 800), final: String(verdict.text || '').slice(0, 800),
      mode: verdict.mode, status: verdict.status, score: verdict.score, issues: verdict.issues || [], ruleIssues: verdict.ruleIssues || [],
      judgeMs: verdict.judgeMs, language: verdict.language || '',
    });
  } catch (err) {
    console.warn('⚠️ [Voice check] log not saved:', err.message);
    return null;
  }
}

/**
 * Pure: how well the judge agrees with the owner's labels.
 * rows: [{ score, label: 'send'|'nosend' }]. "Positive" = the owner would send it.
 * Returns rates at the threshold, Cohen's kappa, and the threshold that best matches the owner.
 */
function agreementStats(rows, threshold = PASS_SCORE) {
  const scored = (rows || []).filter(r => Number.isFinite(r.score) && (r.label === 'send' || r.label === 'nosend'));
  const send = scored.filter(r => r.label === 'send').length;
  const nosend = scored.length - send;
  const at = th => {
    let tp = 0, tn = 0, fp = 0, fn = 0;
    for (const r of scored) {
      const judgePass = r.score >= th;
      if (r.label === 'send') { if (judgePass) tp++; else fn++; } else if (judgePass) fp++; else tn++;
    }
    const n = scored.length || 1;
    const po = (tp + tn) / n;
    const pe = (((tp + fp) / n) * ((tp + fn) / n)) + (((tn + fn) / n) * ((tn + fp) / n));
    return {
      tpr: send ? tp / send : null,
      tnr: nosend ? tn / nosend : null,
      kappa: pe < 1 ? (po - pe) / (1 - pe) : null,
      balanced: send && nosend ? ((tp / send) + (tn / nosend)) / 2 : null,
    };
  };
  const now = at(threshold);
  let best = null;
  if (send >= 10 && nosend >= 10) {
    for (let th = 5; th <= 95; th += 5) {
      const s = at(th);
      if (!best || s.balanced > best.balanced) best = { threshold: th, ...s };
    }
  }
  const round = v => (v == null ? null : Math.round(v * 100) / 100);
  return {
    labelled: scored.length, send, nosend, threshold,
    tpr: round(now.tpr), tnr: round(now.tnr), kappa: round(now.kappa),
    best: best && { threshold: best.threshold, tpr: round(best.tpr), tnr: round(best.tnr), kappa: round(best.kappa) },
    // Enough labels of both kinds to trust these numbers
    enough: send >= 10 && nosend >= 10,
  };
}

module.exports = { gate, judge, ruleIssues, logCheck, agreementStats, modeFor, bucketOf, languageOf, PASS_SCORE, BOT_PHRASES };
