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

/**
 * Best-effort date/time from phrases like "tomorrow at 5pm", "friday 10:30", "24 oct 3 pm", "25/10 at 11am".
 * Returns a Date, or null when no day or time is mentioned.
 */
function extractBookingTime(text, now = new Date()) {
  const lower = String(text || '').toLowerCase();
  let day = null;

  if (/\btoday|tonight\b/.test(lower)) day = new Date(now);
  else if (/\btomorrow|tmrw|tmr\b/.test(lower)) day = new Date(now.getTime() + 864e5);
  else if (/\bday after tomorrow\b/.test(lower)) day = new Date(now.getTime() + 2 * 864e5);

  if (!day) {
    const wd = WEEKDAYS.findIndex(w => new RegExp(`\\b${w}|\\b${w.slice(0, 3)}\\b`).test(lower));
    if (wd >= 0) {
      const diff = (wd - now.getDay() + 7) % 7 || 7;
      day = new Date(now.getTime() + diff * 864e5);
    }
  }

  if (!day) {
    // "24 oct", "oct 24", "24th october"
    const m1 = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/)
      || lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (m1) {
      const [dd, mon] = /\d/.test(m1[1]) ? [Number(m1[1]), m1[2]] : [Number(m1[2]), m1[1]];
      day = new Date(now.getFullYear(), MONTHS.indexOf(mon.slice(0, 3)), dd);
      if (day < new Date(now.getFullYear(), now.getMonth(), now.getDate())) day.setFullYear(day.getFullYear() + 1);
    } else {
      // "25/10" or "25-10-2026" (day first)
      const m2 = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
      if (m2 && Number(m2[2]) <= 12) {
        const year = m2[3] ? (m2[3].length === 2 ? 2000 + Number(m2[3]) : Number(m2[3])) : now.getFullYear();
        day = new Date(year, Number(m2[2]) - 1, Number(m2[1]));
      }
    }
  }

  // "5pm", "5:30 pm", "at 17:00", "10.30am"
  const t = lower.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/) || lower.match(/\b(?:at\s+)?([01]?\d|2[0-3])[:.](\d{2})\b/);
  if (!day && !t) return null;

  const result = new Date(day || now);
  if (t) {
    let hours = Number(t[1]);
    const minutes = Number(t[2] || 0);
    if (t[3] === 'pm' && hours < 12) hours += 12;
    if (t[3] === 'am' && hours === 12) hours = 0;
    result.setHours(hours, minutes, 0, 0);
    if (!day && result < now) result.setDate(result.getDate() + 1); // "at 5pm" already passed today
  } else {
    result.setHours(10, 0, 0, 0); // day only: keep it on the calendar at 10:00
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
function extractBookingSignals(incomingText, replyText = '', now = new Date()) {
  const combined = `${incomingText || ''}\n${replyText || ''}`;
  if (BOOKING_CANCEL_RE.test(incomingText || '')) return { isBooking: true, cancelled: true };
  const hasIntent = BOOKING_INTENT_RE.test(combined);
  if (!hasIntent) return { isBooking: false };

  const bookingTime = extractBookingTime(incomingText, now) || extractBookingTime(replyText, now);
  const confirmed = BOOKING_CONFIRM_RE.test(replyText || '') || /\b(confirm|done|yes book|book it)\b/i.test(incomingText || '');
  const serviceMatch = combined.match(/\b(?:book|reserve|schedule)\s+(?:a|an|the|my)?\s*([a-z][a-z\s]{2,30}?)(?:\s+(?:for|on|at|tomorrow|today)\b|[.,!?\n]|$)/i)
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
async function processConversationTurn({ ownerId, senderId, handle = '', incomingText, replyText = '', captureLeads = true, captureBookings = true }) {
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
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    console.warn('⚠️ [Analytics] Lead capture failed:', err.message);
  }

  try {
    const booking = captureBookings ? extractBookingSignals(incomingText, replyText) : { isBooking: false };
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

module.exports = { extractLeadSignals, extractBookingSignals, extractBookingTime, extractPhone, processConversationTurn };
