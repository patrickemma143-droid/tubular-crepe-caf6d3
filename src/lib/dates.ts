// All farm dates are local calendar dates (YYYY-MM-DD). Never use toISOString()
// for a date: it converts to UTC and in Uganda (UTC+3) shifts early-morning
// records to the previous day.

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(a: string, b: string): number {
  // whole days from a to b (b - a)
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function startOfWeek(s: string): string {
  // Monday-based weeks
  const d = parseISO(s);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function startOfMonth(s: string): string {
  return s.slice(0, 8) + '01';
}

export function endOfMonth(s: string): string {
  const d = parseISO(startOfMonth(s));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return toISODate(d);
}

export function addMonths(s: string, n: number): string {
  const d = parseISO(startOfMonth(s));
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
}

export function ageInMonths(dob: string, on: string = todayISO()): number {
  const a = parseISO(dob);
  const b = parseISO(on);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

export function formatAge(dob?: string): string {
  if (!dob) return '—';
  const m = ageInMonths(dob);
  if (m < 1) return `${Math.max(0, daysBetween(dob, todayISO()))} days`;
  if (m < 24) return `${m} mo`;
  const y = Math.floor(m / 12);
  const r = m % 12;
  return r ? `${y} yr ${r} mo` : `${y} yr`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtDate(s?: string): string {
  if (!s) return '—';
  const d = parseISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtShort(s: string): string {
  const d = parseISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtWeekday(s: string): string {
  return DAYS[parseISO(s).getDay()];
}

export function fmtMonth(s: string): string {
  const d = parseISO(s);
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]} ${d.getFullYear()}`;
}

/** "today", "yesterday", "in 3 days", "5 days ago" */
export function relDay(s: string, from: string = todayISO()): string {
  const n = daysBetween(from, s);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
