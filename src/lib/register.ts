import type { StockMonth } from '../db/types';
import { STOCK_CLASSES } from '../db/types';
import { save } from '../db/db';

// Monthly herd register: counts per class of animal, as ranches keep them on paper.
// Each month: brought forward + births + graded in + bought − deaths − graded out − sold = closing.

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const stockId = (month: string, cls: string) => `stk-${month}-${slug(cls)}`;

export function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
}
export function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtYM = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const fmtYMShort = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3)} ${m.slice(2, 4)}`;

export function months(stock: StockMonth[]): string[] {
  return [...new Set(stock.map((r) => r.month))].sort();
}

const order = (cls: string) => { const i = STOCK_CLASSES.indexOf(cls); return i < 0 ? 99 : i; };

export function rowsFor(stock: StockMonth[], month: string): StockMonth[] {
  return stock.filter((r) => r.month === month).sort((a, b) => order(a.cls) - order(b.cls) || a.cls.localeCompare(b.cls));
}

export const FIELDS = ['opening', 'births', 'grade_in', 'purchased', 'deaths', 'grade_out', 'sold', 'closing'] as const;
export type Field = (typeof FIELDS)[number];
export type Totals = Record<Field, number> & { value: number };

export function totals(rows: StockMonth[]): Totals {
  const t: any = { value: 0 };
  for (const f of FIELDS) t[f] = rows.reduce((s, r) => s + (r[f] || 0), 0);
  t.value = rows.reduce((s, r) => s + (r.closing || 0) * (r.unit_value || 0), 0);
  return t;
}

export const computedClosing = (r: Pick<StockMonth, Field>) =>
  (r.opening || 0) + (r.births || 0) + (r.grade_in || 0) + (r.purchased || 0) - (r.deaths || 0) - (r.grade_out || 0) - (r.sold || 0);

/** Problems in a month: sums that don't add up, carry-forward breaks, unbalanced grading. */
export function issues(stock: StockMonth[], month: string): { cls: string; text: string }[] {
  const rows = rowsFor(stock, month);
  const prev = new Map(rowsFor(stock, prevMonth(month)).map((r) => [r.cls, r]));
  const out: { cls: string; text: string }[] = [];
  for (const r of rows) {
    const c = computedClosing(r);
    if (Math.abs(c - r.closing) > 0.01) out.push({ cls: r.cls, text: `Movements give ${c}, but closing is recorded as ${r.closing}` });
    const p = prev.get(r.cls);
    if (p && Math.abs(p.closing - r.opening) > 0.01) out.push({ cls: r.cls, text: `Brought forward ${r.opening}, but ${fmtYM(p.month)} closed at ${p.closing}` });
  }
  const t = totals(rows);
  if (Math.abs(t.grade_in - t.grade_out) > 0.01) out.push({ cls: 'All classes', text: `${t.grade_out} graded out but ${t.grade_in} graded in — every animal moved out of one class should arrive in another` });
  return out;
}

export interface RegisterSummary {
  months: string[];
  first?: string;
  last?: string;
  byClass: { cls: string; opening: number; births: number; grade_in: number; purchased: number; deaths: number; grade_out: number; sold: number; closing: number; value: number }[];
  total: Totals;
  issues: number;
}

/** Register figures for every month that overlaps [start, end] (dates YYYY-MM-DD). */
export function summary(stock: StockMonth[], start: string, end: string): RegisterSummary {
  const ms = months(stock).filter((m) => m >= start.slice(0, 7) && m <= end.slice(0, 7));
  if (!ms.length) return { months: [], byClass: [], total: { ...totals([]) }, issues: 0 };
  const first = ms[0], last = ms[ms.length - 1];
  const classes = [...new Set(stock.filter((r) => ms.includes(r.month)).map((r) => r.cls))].sort((a, b) => order(a) - order(b));
  const byClass = classes.map((cls) => {
    const rs = stock.filter((r) => r.cls === cls && ms.includes(r.month));
    const sum = (f: Field) => rs.reduce((s, r) => s + (r[f] || 0), 0);
    const o = rs.find((r) => r.month === first); const c = rs.find((r) => r.month === last);
    return {
      cls, opening: o?.opening || 0, closing: c?.closing || 0, value: (c?.closing || 0) * (c?.unit_value || 0),
      births: sum('births'), grade_in: sum('grade_in'), purchased: sum('purchased'), deaths: sum('deaths'), grade_out: sum('grade_out'), sold: sum('sold'),
    };
  });
  const total: any = { value: byClass.reduce((s, c) => s + c.value, 0) };
  for (const f of FIELDS) total[f] = byClass.reduce((s, c) => s + (c as any)[f], 0);
  return { months: ms, first, last, byClass, total, issues: ms.reduce((s, m) => s + issues(stock, m).length, 0) };
}

export async function saveMonth(month: string, rows: Omit<StockMonth, 'id' | 'created_at' | 'updated_at' | 'deleted' | 'dirty'>[], existing: StockMonth[]) {
  for (const r of rows) {
    const ex = existing.find((e) => e.month === month && e.cls === r.cls);
    await save('stock', { ...(ex || {}), ...r, id: ex?.id || stockId(month, r.cls), month, flags: undefined });
  }
}
