/**
 * Pure timing rules for follow-up reminders (no DB, no network), used by reminderService.
 */
const HOUR_MS = 60 * 60 * 1000;
// A reminder may go out from reminderAfterHours until this many hours later (long enough to
// cover a night of quiet hours); after that we wait for the contact to text again.
const REMINDER_GRACE_HOURS = 12;
// Largest delay an owner can configure that is still honoured (one week)
const MAX_REMINDER_AFTER_HOURS = 168;
const QUIET_START_HOUR = 22; // no reminders 22:00-08:00 in the owner's local time
const QUIET_END_HOUR = 8;
const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** Hour of day (0-23) at `date` in a time zone; invalid zones fall back to Asia/Kolkata. */
function localHour(date, timeZone) {
  const fmt = (tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(date);
  let h;
  try { h = fmt(timeZone || DEFAULT_TIMEZONE); } catch (_) { h = fmt(DEFAULT_TIMEZONE); }
  return Number(h) % 24;
}

/** True during quiet hours (22:00-08:00 local time by default). */
function isQuietHours(date = new Date(), timeZone = DEFAULT_TIMEZONE, start = QUIET_START_HOUR, end = QUIET_END_HOUR) {
  const h = localHour(date, timeZone);
  return start > end ? (h >= start || h < end) : (h >= start && h < end);
}

/** Configured delay in hours, clamped to 1..168 (default 5). */
function reminderDelayHours(config) {
  const h = Number(config?.reminderAfterHours);
  if (!Number.isFinite(h) || h <= 0) return 5;
  return Math.min(Math.max(h, 1), MAX_REMINDER_AFTER_HOURS);
}

/** True when the contact has been idle at least the delay and not longer than delay + grace. */
function isWithinReminderWindow(lastInteraction, now, delayHours) {
  const idleMs = now - new Date(lastInteraction).getTime();
  return idleMs >= delayHours * HOUR_MS && idleMs <= (delayHours + REMINDER_GRACE_HOURS) * HOUR_MS;
}

module.exports = {
  HOUR_MS, REMINDER_GRACE_HOURS, MAX_REMINDER_AFTER_HOURS, DEFAULT_TIMEZONE,
  localHour, isQuietHours, reminderDelayHours, isWithinReminderWindow,
};
