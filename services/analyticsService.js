const Lead = require('../models/Lead');
const Booking = require('../models/Booking');

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// 10-15 digits with optional +country code, spaces, dashes, dots or brackets
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{3,5}/g;

const LEAD_INTENTS = [
  { key: 'pricing', label: 'Asked about pricing', re: /\b(price|pricing|cost|how much|rates?|quote|charges?|fees?)\b/i },
  { key: 'demo', label: 'Wants a demo or consultation', re: /\b(demo|trial|consultation|consult|walkthrough|sample)\b/i },
  { key: 'purchase', label: 'Purchase interest', re: /\b(buy|purchase|order|in stock|available|deliver|shipping|cod)\b/i },
  { key: 'contact', label: 'Asked to be contacted', re: /\b(call me|contact me|reach me|whatsapp me|my number|my email)\b/i },
];

const BOOKING_INTENT_RE = /\b(book|booking|appointment|reserve|reservation|schedule|slot|table for|visit|session)\b|calendly\.com/i;
const BOOKING_CONFIRM_RE = /\b(confirmed|is booked|you're booked|you are booked|booking is set|reserved|see you (on|at|tomorrow|then))\b/i;
const BOOKING_CANCEL_RE = /\b(cancel|cancelled|reschedule)\b.*\b(booking|appointment|reservation|slot)\b/i;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Real phone numbers from text: 10-15 digits, ignoring times, prices and dates.
 */
function extractPhone(text) {
  for (const match of String(text || '').match(PHONE_RE) || []) {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) return match.trim();
  }
  return '';
}

const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const WEEKDAY_ABBR = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };

/** A valid IANA zone name, else the default (Asia/Kolkata). */
function resolveTimeZone(timeZone) {
  if (!timeZone) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return timeZone;
  } catch (_) {
    return DEFAULT_TIMEZONE;
  }
}

/** Wall-clock parts of an instant in a time zone: { year, month (1-12), day, hour, minute, weekday (0=Sun) }. */
function zonedParts(date, timeZone) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
  }).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
  };
}

/** UTC instant for a wall-clock time in a time zone (DST-safe: offset re-checked at the result). */
function zonedToUtc(year, month, day, hour, minute, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (ms) => {
    const p = zonedParts(new Date(ms), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };
  let utc = wall - offsetAt(wall);
  const second = offsetAt(utc);
  if (wall - second !== utc) utc = wall - second;
  return new Date(utc);
}

/** Calendar date n days after { year, month, day } (plain date arithmetic, no time zone). */
function addDays({ year, month, day }, n) {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

const isValidDate = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
const dateKey = ({ year, month, day }) => year * 10000 + month * 100 + day;

/**
 * Best-effort date/time from phrases like "tomorrow at 5pm", "friday 10:30", "24 oct 3 pm", "25/10 at 11am",
 * read in the business's time zone (default Asia/Kolkata). Returns a Date (correct UTC instant),
 * or null when no day or time is mentioned. `now` is injectable for tests.
 */
function extractBookingTime(text, now = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const tz = resolveTimeZone(timeZone);
  const lower = String(text || '').toLowerCase();
  const local = zonedParts(now, tz);
  const today = { year: local.year, month: local.month, day: local.day };
  let day = null;
  let tonight = false;

  // "day after tomorrow" must be checked before "tomorrow" (it contains it)
  if (/\bday\s+after\s+(?:tomorrow|tmrw|tmr)\b/.test(lower)) day = addDays(today, 2);
  else if (/\b(?:tomorrow|tmrw|tmr)\b/.test(lower)) day = addDays(today, 1);
  else if (/\b(?:today|tonight)\b/.test(lower)) {
    day = today;
    tonight = /\btonight\b/.test(lower);
  }

  if (!day) {
    // Full weekday names anywhere; short forms ("sat", "fri") only with booking context
    // ("on sat", "next fri", "sat at 5", "sat 10am") so "i sat down" is not Saturday
    let wd = -1;
    const full = lower.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (full) wd = WEEKDAYS.indexOf(full[1]);
    else {
      const abbr = '(sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)';
      const short = lower.match(new RegExp(`\\b(?:on|next|this|coming|by|till|until)\\s+${abbr}\\b`))
        || lower.match(new RegExp(`\\b${abbr}\\s+(?:at\\s+|@\\s*)?\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?\\b`));
      if (short) wd = WEEKDAY_ABBR[short[1]];
    }
    if (wd >= 0) {
      const diff = (wd - local.weekday + 7) % 7 || 7;
      day = addDays(today, diff);
    }
  }

  if (!day) {
    // "24 oct", "oct 24", "24th october"
    const m1 = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/)
      || lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (m1) {
      const [dd, mon] = /\d/.test(m1[1]) ? [Number(m1[1]), m1[2]] : [Number(m1[2]), m1[1]];
      const month = MONTHS.indexOf(mon.slice(0, 3)) + 1;
      let candidate = { year: today.year, month, day: dd };
      if (dateKey(candidate) < dateKey(today)) candidate = { ...candidate, year: today.year + 1 };
      if (isValidDate(candidate.year, month, dd)) day = candidate;
    } else {
      // "25/10" or "25-10-2026" (day first). "24/7" is a phrase, not a date.
      const m2 = /\b24\s*\/\s*7\b/.test(lower) ? null : lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
      if (m2) {
        const dd = Number(m2[1]);
        const month = Number(m2[2]);
        let year = m2[3] ? (m2[3].length === 2 ? 2000 + Number(m2[3]) : Number(m2[3])) : today.year;
        if (!m2[3] && isValidDate(year, month, dd) && dateKey({ year, month, day: dd }) < dateKey(today)) year += 1;
        if (isValidDate(year, month, dd)) day = { year, month, day: dd };
      }
    }
  }

  // "5pm", "5:30 pm", "at 17:00", "10.30am"
  let t = lower.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/);
  if (t && (Number(t[1]) < 1 || Number(t[1]) > 12 || Number(t[2] || 0) > 59)) t = null;
  if (!t) {
    t = lower.match(/\b(?:at\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  }
  if (!day && !t) return null;

  const base = day || today;
  if (!t) {
    // Day only: keep it on the calendar at 10:00 (20:00 for "tonight")
    return zonedToUtc(base.year, base.month, base.day, tonight ? 20 : 10, 0, tz);
  }
  let hours = Number(t[1]);
  const minutes = Number(t[2] || 0);
  if (t[3] === 'pm' && hours < 12) hours += 12;
  if (t[3] === 'am' && hours === 12) hours = 0;
  let result = zonedToUtc(base.year, base.month, base.day, hours, minutes, tz);
  if (!day && result < now) {
    // "at 5pm" already passed today: next day
    const next = addDays(today, 1);
    result = zonedToUtc(next.year, next.month, next.day, hours, minutes, tz);
  }
  return result;
}

/**
 * Scans one customer message (and the AI reply) for lead details: phone, email and buying intent.
 */
function extractLeadSignals(incomingText, replyText = '') {
  const text = String(incomingText || '');
  const email = (text.match(EMAIL_RE) || [])[0] || '';
  const phone = extractPhone(text);
  const intents = LEAD_INTENTS.filter(i => i.re.test(text)).map(i => i.label);
  return { phone, email, intents, isLead: Boolean(phone || email || intents.length) };
}

/**
 * Scans the exchange for an appointment: customer intent plus a time, confirmed when the reply agrees.
 */
function extractBookingSignals(incomingText, replyText = '', now = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const combined = `${incomingText || ''}\n${replyText || ''}`;
  if (BOOKING_CANCEL_RE.test(incomingText || '')) return { isBooking: true, cancelled: true };
  const hasIntent = BOOKING_INTENT_RE.test(combined);
  if (!hasIntent) return { isBooking: false };

  const bookingTime = extractBookingTime(incomingText, now, timeZone) || extractBookingTime(replyText, now, timeZone);
  const confirmed = BOOKING_CONFIRM_RE.test(replyText || '') || /\b(confirm|done|yes book|book it)\b/i.test(incomingText || '');
  const serviceMatch = combined.match(/\b(?:book|reserve|schedule)\s+(?:(?:a|an|the|my)\s+)?([a-z][a-z\s]{2,30}?)(?:\s+(?:for|on|at|tomorrow|today)\b|[.,!?\n]|$)/i)
    || combined.match(/\b(table for \d+|haircut|facial|massage|consultation|demo|session|appointment)\b/i);
  return {
    isBooking: Boolean(bookingTime) || confirmed,
    cancelled: false,
    bookingTime,
    status: confirmed ? 'confirmed' : 'pending',
    serviceName: serviceMatch ? serviceMatch[1].trim() : '',
  };
}

/**
 * Records leads and bookings for one business conversation turn. Never throws.
 */
async function processConversationTurn({ ownerId, senderId, handle = '', incomingText, replyText = '', captureLeads = true, captureBookings = true, timeZone = null }) {
  if (!ownerId || !senderId) return { lead: null, booking: null };
  const result = { lead: null, booking: null };

  try {
    const lead = captureLeads ? extractLeadSignals(incomingText, replyText) : { isLead: false };
    if (lead.isLead) {
      const existing = await Lead.findOne({ ownerId, senderId });
      const summary = Array.from(new Set([
        ...String(existing?.intentSummary || '').split(' · ').filter(Boolean),
        ...lead.intents,
      ])).join(' · ');
      result.lead = await Lead.findOneAndUpdate(
        { ownerId, senderId },
        {
          $set: {
            handle: handle || existing?.handle || '',
            intentSummary: summary,
            ...(lead.phone ? { phone: lead.phone } : {}),
            ...(lead.email ? { email: lead.email } : {}),
          },
          $setOnInsert: { capturedAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' }
      );
    }
  } catch (err) {
    console.warn('⚠️ [Analytics] Lead capture failed:', err.message);
  }

  try {
    // Times are read in the business's own time zone (businessPolicy.timezone, default Asia/Kolkata)
    let tz = timeZone;
    if (!tz && captureBookings) {
      const PersonaConfig = require('../models/PersonaConfig');
      const cfg = await PersonaConfig.findOne({ ownerId }).select('businessPolicy.timezone').lean().catch(() => null);
      tz = cfg?.businessPolicy?.timezone || DEFAULT_TIMEZONE;
    }
    const booking = captureBookings ? extractBookingSignals(incomingText, replyText, new Date(), tz) : { isBooking: false };
    if (booking.isBooking) {
      // Update the customer's latest open booking instead of creating duplicates
      const open = await Booking.findOne({ ownerId, senderId, status: { $in: ['pending', 'confirmed'] } }).sort({ createdAt: -1 });
      if (booking.cancelled) {
        if (open) {
          open.status = 'cancelled';
          result.booking = await open.save();
        }
      } else if (open && (!open.bookingTime || open.bookingTime > new Date())) {
        if (booking.bookingTime) open.bookingTime = booking.bookingTime;
        if (booking.serviceName) open.serviceName = booking.serviceName;
        if (booking.status === 'confirmed') open.status = 'confirmed';
        open.handle = handle || open.handle;
        result.booking = await open.save();
      } else {
        result.booking = await Booking.create({
          ownerId, senderId, handle,
          serviceName: booking.serviceName,
          bookingTime: booking.bookingTime || null,
          status: booking.status,
        });
      }
    }
  } catch (err) {
    console.warn('⚠️ [Analytics] Booking capture failed:', err.message);
  }

  if (result.lead || result.booking) {
    console.log(`📈 [Analytics] ${handle || senderId}: ${result.lead ? 'lead updated' : ''}${result.lead && result.booking ? ', ' : ''}${result.booking ? `booking ${result.booking.status}` : ''}`);
  }
  return result;
}

module.exports = {
  extractLeadSignals, extractBookingSignals, extractBookingTime, extractPhone, processConversationTurn,
  zonedParts, zonedToUtc, resolveTimeZone, DEFAULT_TIMEZONE,
};
