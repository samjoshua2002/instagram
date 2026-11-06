// Browser time zone helpers shared by the dashboard routes (home summary, analytics activity)

// Browser's Date#getTimezoneOffset() (IST = -330). Bad values fall back to UTC.
function parseTzOffset(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= -840 && n <= 840 ? n : 0;
}

// -330 -> "+05:30", the form Mongo's $dateToString timezone accepts
function tzString(offset) {
  const mins = Math.abs(offset);
  return `${offset <= 0 ? '+' : '-'}${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

// Local calendar day (YYYY-MM-DD) of a moment, for a browser offset
const localDay = (ms, offset) => new Date(ms - offset * 60000).toISOString().slice(0, 10);

module.exports = { parseTzOffset, tzString, localDay };
