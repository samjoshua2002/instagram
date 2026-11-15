/** Pure rules for AI-started check-ins (no DB, no network), used by checkInService. */
const { atLeast } = require('./closeness');

const HOUR = 3600 * 1000;
const WINDOW_HOURS = 22;      // Instagram allows replies up to 24h after their last message; 2h margin
const MAX_PER_RUN = 3;

/**
 * Should this contact get a check-in now? Pure, so it is unit tested.
 * @returns {{ ok: boolean, reason: string }}
 */
function checkInDecision({ enabled = true, level, minLevel = 'close', lastTheirsAt, lastAnyAt, lastAnyRole,
  lastAnyWasCheckIn = false, lastCheckInAt = null, idleHours = 4, quiet = false, sentToday = 0, dailyLimit = 6, away = 'none', now = Date.now() }) {
  if (!enabled) return { ok: false, reason: 'check-ins are off' };
  // They said they're busy: don't disturb until they're back
  if (away === 'away') return { ok: false, reason: 'they said they are busy' };
  if (!atLeast(level || 'stranger', minLevel)) return { ok: false, reason: `not ${minLevel} enough (${level})` };
  if (sentToday >= dailyLimit) return { ok: false, reason: 'daily limit reached' };
  if (!lastTheirsAt) return { ok: false, reason: 'they never messaged' };
  const sinceTheirs = now - new Date(lastTheirsAt).getTime();
  if (sinceTheirs > WINDOW_HOURS * HOUR) return { ok: false, reason: "outside Instagram's 24h window" };
  if (away !== 'justBack' && now - new Date(lastAnyAt || lastTheirsAt).getTime() < idleHours * HOUR) return { ok: false, reason: 'chat still active' };
  // Their message still waiting is the reply's job; our unanswered check-in means don't double-text
  if (lastAnyRole !== 'assistant') return { ok: false, reason: 'their message is unanswered' };
  if (lastAnyWasCheckIn) return { ok: false, reason: 'last check-in not answered yet' };
  return { ok: true, reason: 'quiet chat with someone close' };
}

/** What the AI should try to learn next: the biggest gap in what it knows about them. */
function nextQuestionTopic(mem) {
  const has = arr => Array.isArray(arr) && arr.length > 0;
  const dob = mem.dob || (mem.importantDates || []).some(d => /birth|bday/i.test(d?.title || ''));
  const events = (mem.lifeEvents || []).filter(e => e && e.title);
  const recent = events[events.length - 1];
  if (recent) return { topic: 'life event follow-up', hint: `how "${recent.title}" is going (${recent.details || recent.dateOrTime || ''})` };
  if (!has(mem.lifeEvents)) return { topic: 'what they are up to', hint: 'what they are busy with these days (studies, work, a project)' };
  if (!has(mem.favoriteThings)) return { topic: 'interests', hint: 'something they are watching, playing or listening to lately' };
  if (!dob) return { topic: 'birthday', hint: 'when their birthday is, only if it fits naturally' };
  return { topic: 'how they are', hint: 'how their day or week is really going' };
}

/**
 * Where they are after saying they'd be busy:
 *  'away'     still busy (until the time they gave, else 6 h, or 9 h for sleep)
 *  'justBack' came back (said so, or their time passed) within the last 3 h: ask how it went
 *  'none'     nothing going on
 */
function awayState(away, now = Date.now()) {
  if (!away || !away.since) return { state: 'none' };
  const since = new Date(away.since).getTime();
  const defaultMs = (/sleep|bed|nap/i.test(away.reason || '') ? 9 : 6) * HOUR;
  const until = away.until ? new Date(away.until).getTime() : since + defaultMs;
  const ended = away.endedAt ? new Date(away.endedAt).getTime() : (now >= until ? until : null);
  if (!ended) return { state: 'away', reason: away.reason, until };
  if (now - ended <= 3 * HOUR) return { state: 'justBack', reason: away.reason, since: ended };
  return { state: 'none' };
}

module.exports = { checkInDecision, nextQuestionTopic, awayState, WINDOW_HOURS, HOUR, MAX_PER_RUN };
