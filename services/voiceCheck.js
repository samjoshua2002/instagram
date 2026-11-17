/**
 * "Does this sound like the owner?" check, run on every AI draft before it is sent.
 *  1. Rules (instant, no AI): assistant / bot phrases and drafts far longer than the owner writes.
 *  2. A small, fast model scores 0-100 how believable the draft is as the owner's own text, compared
 *     with the owner's real messages (their real exchanges with this person and similar chats).
 * If either fails, the caller rewrites the draft once with the concrete problems listed.
 * Never blocks a reply: a slow or failing judge just lets the draft through.
 * Works per account: the comparison is always that account's own real messages.
 */

const PASS_SCORE = 65;          // below this the draft is rewritten
const JUDGE_TIMEOUT_MS = 6000;
const FAST = () => process.env.FAST_MODEL || 'gpt-5.4-mini';
const enabled = () => String(process.env.VOICE_CHECK || 'on').toLowerCase() !== 'off';

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
 * `style` is the owner's real-voice block (real exchanges / lines). Returns null when it cannot judge.
 */
async function judge({ draft, incoming = '', style = '', creatorName = 'the owner', ai }) {
  if (!style || !draft) return null;
  const task = ai.jsonWithFallback(FAST(), [
    { role: 'system', content: `You check if a draft Instagram DM really sounds like ${creatorName} wrote it, using ${creatorName}'s REAL messages below.
Judge only how it is written: length, words and slang, language mix, casing, punctuation, emoji, warmth, how direct. Not the facts.
Score 0-100: 100 = their friends could never tell; 50 = a bit off; 0 = obviously a bot.
List the concrete differences (max 3, short), e.g. "too long", "too formal", "uses 'hey there', you say 'oii'", "no Tanglish, you always mix".
JSON only: {"score": n, "issues": ["..."]}` },
    { role: 'user', content: `${creatorName.toUpperCase()}'S REAL MESSAGES:\n${String(style).slice(0, 3500)}\n\n${incoming ? `THEY SENT: ${String(incoming).slice(0, 400)}\n` : ''}DRAFT: ${String(draft).slice(0, 600)}` },
  ]);
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), JUDGE_TIMEOUT_MS).unref?.());
  try {
    const out = await Promise.race([task, timeout]);
    if (!out || !Number.isFinite(Number(out.score))) return null;
    return {
      score: Math.max(0, Math.min(100, Math.round(Number(out.score)))),
      issues: (Array.isArray(out.issues) ? out.issues : []).map(x => String(x).slice(0, 120)).filter(Boolean).slice(0, 3),
    };
  } catch {
    return null;
  }
}

/**
 * Checks a draft and rewrites it once if it doesn't sound like the owner.
 * `rewrite(note)` writes a new draft from the problems (the caller knows its own prompt and format).
 * @returns {{ text, score, issues, rewritten }}
 */
async function gate({ draft, incoming = '', style = '', fp = null, creatorName, ai, rewrite }) {
  if (!enabled() || !draft) return { text: draft, score: null, issues: [], rewritten: false };
  const rules = ruleIssues(draft, fp);
  const verdict = await judge({ draft, incoming, style, creatorName, ai });
  const issues = [...rules, ...((verdict && verdict.score < PASS_SCORE) ? verdict.issues : [])];
  const fails = rules.length > 0 || (verdict && verdict.score < PASS_SCORE);
  if (!fails || typeof rewrite !== 'function') return { text: draft, score: verdict?.score ?? null, issues, rewritten: false };
  const note = `Your draft doesn't sound like you${verdict ? ` (${verdict.score}/100)` : ''}:\n${issues.map(i => `- ${i}`).join('\n') || '- too generic'}\n` +
    'Write it again the way you REALLY text (copy your real messages: length, words, language, casing, punctuation). Same meaning, nothing new.';
  try {
    const again = String((await rewrite(note)) || '').trim();
    if (!again) return { text: draft, score: verdict?.score ?? null, issues, rewritten: false };
    // A rewrite that still uses a bot phrase is worse than nothing new: keep whichever has fewer problems
    const keep = ruleIssues(again, fp).length <= rules.length ? again : draft;
    return { text: keep, score: verdict?.score ?? null, issues, rewritten: keep === again };
  } catch {
    return { text: draft, score: verdict?.score ?? null, issues, rewritten: false };
  }
}

module.exports = { gate, judge, ruleIssues, PASS_SCORE, BOT_PHRASES };
