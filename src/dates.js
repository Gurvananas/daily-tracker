// Dates are handled as local "YYYY-MM-DD" strings everywhere in the app.
// This avoids timezone surprises: a day is the day you lived, wherever you are.

export const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISO(fromISO(s)) === s;
}

export function today(now = new Date()) {
  return toISO(now);
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Number of days from `a` to `b` (b - a). */
export function diffDays(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 86400000);
}

/** Inclusive list of ISO dates from start to end. */
export function rangeDates(start, end) {
  const out = [];
  if (start > end) return out;
  let d = fromISO(start);
  const last = fromISO(end);
  while (d <= last) {
    out.push(toISO(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInYear = (y) => (isLeap(y) ? 366 : 365);
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0-11

export function dayOfYear(iso) {
  const y = Number(iso.slice(0, 4));
  return diffDays(`${y}-01-01`, iso) + 1;
}

/** Monday = 0 … Sunday = 6 */
export function weekdayMon(iso) {
  return (fromISO(iso).getDay() + 6) % 7;
}

const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtShortY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const formatLong = (iso) => cap(fmtLong.format(fromISO(iso)));
export const formatDay = (iso) => cap(fmtDay.format(fromISO(iso)));
export const formatShort = (iso) => fmtShort.format(fromISO(iso));
export const formatShortYear = (iso) => fmtShortY.format(fromISO(iso));
export const formatMonth = (iso) => fmtMonth.format(fromISO(iso));

export const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
export const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
