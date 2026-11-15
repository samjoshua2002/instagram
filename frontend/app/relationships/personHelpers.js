// Small pure helpers for the Relationships page: birthdays, dates, labels and the People-in-their-life groups.

// Next birthday from a stored DOB ("2002-05-14", "14 May", "May 14, 2002")
export function getNextBirthday(dob) {
  if (!dob) return null;
  const hasYear = /\b(19|20)\d{2}\b/.test(dob);
  // "2002-05-14" alone is read as UTC midnight (a day early west of UTC), so ISO dates are built locally
  const iso = String(dob).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsed = iso ? new Date(+iso[1], +iso[2] - 1, +iso[3]) : new Date(hasYear ? dob : `${dob} 2000`);
  if (Number.isNaN(parsed.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), parsed.getMonth(), parsed.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, parsed.getMonth(), parsed.getDate());
  return {
    days: Math.round((next - today) / 86400000),
    label: next.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }),
    turning: hasYear ? next.getFullYear() - parsed.getFullYear() : null,
  };
}

export function formatLastContact(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Person page: built-in greeting chips, labels for the Details grid, and the People-in-their-life groups
export const DEFAULT_GREETINGS = ['hey', 'heyy', 'oyy', 'hii', 'yo'];
export const CATEGORY_LABELS = {
  close_friend: 'Close friend',
  online_friend: 'Online friend',
  offline_friend: 'Offline friend',
  family: 'Family',
  professional: 'Professional / creator',
  business: 'Business / client',
};
export const GENDER_LABELS = { female: 'Female', male: 'Male', neutral: 'Neutral', unknown: 'Not set' };
export const PEOPLE_GROUPS = [
  { id: 'friends', label: 'Friends', rel: 'friend' },
  { id: 'family', label: 'Family', rel: 'family' },
  { id: 'mentioned', label: 'Mentioned', rel: 'mentioned' },
];
const FAMILY_REL = /\b(sis|sister|brother|mom|mum|mother|amma|dad|father|appa|parent|cousin|aunt|aunty|uncle|grand\w*|niece|nephew|family|relative|wife|husband|son|daughter|in-law)\b/i;
export function connectionGroup(c) {
  const rel = String(c?.rel || c?.relationship || '').trim();
  if (!rel || /^(connected|mentioned|unknown)$/i.test(rel)) return 'mentioned';
  return FAMILY_REL.test(rel) ? 'family' : 'friends';
}
export function connectionLabel(c) {
  const rel = String(c?.rel || c?.relationship || '').trim();
  if (!rel || /^(connected|unknown)$/i.test(rel)) return 'Mentioned';
  return rel.charAt(0).toUpperCase() + rel.slice(1);
}

// Drop broken years (e.g. "0002" from a half-typed date picker) so only day + month show
export function cleanDob(dob) {
  if (!dob) return "";
  return String(dob).replace(/^0\d{3}-/, "").replace(/,?\s*0\d{3}\b/, "").trim();
}

// Robust timezone-agnostic helper to parse date strings into YYYY-MM-DD
export function formatDobForInput(dob) {
  if (!dob) return '';
  const isoMatch = dob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const mName = MONTH_NAMES[i];
    if (dob.toLowerCase().includes(mName.toLowerCase()) || dob.toLowerCase().includes(mName.slice(0, 3).toLowerCase())) {
      const yearMatch = dob.match(/\b(19|20)\d{2}\b/);
      const dayMatch = dob.match(/\b([1-9]|[12]\d|3[01])\b/);
      if (yearMatch && dayMatch) {
        const y = yearMatch[0];
        const m = String(i + 1).padStart(2, '0');
        const d = String(dayMatch[0]).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  }
  const d = new Date(dob);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1900) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}
