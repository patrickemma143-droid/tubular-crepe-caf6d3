import type { Animal } from '../db/types';
import { addDays, daysBetween, endOfMonth, startOfMonth, startOfWeek, addMonths, dateRange, fmtDate, fmtMonth, todayISO } from './dates';
import { type Farm, category, entryDate, label, repro, needsAttention, openTreatments } from './herd';
import { stockOn } from './feed';
import { summary as registerSummary, type RegisterSummary } from './register';
import type { Feed } from '../db/types';

export type PeriodKind = 'week' | 'month' | 'custom';
export interface Period { kind: PeriodKind; start: string; end: string; title: string }

export function weekPeriod(anyDay: string): Period {
  const start = startOfWeek(anyDay);
  const end = addDays(start, 6);
  return { kind: 'week', start, end, title: `Week of ${fmtDate(start)}` };
}
export function monthPeriod(anyDay: string): Period {
  const start = startOfMonth(anyDay);
  return { kind: 'month', start, end: endOfMonth(start), title: fmtMonth(start) };
}
export function shiftPeriod(p: Period, dir: 1 | -1): Period {
  if (p.kind === 'week') return weekPeriod(addDays(p.start, 7 * dir));
  if (p.kind === 'month') return monthPeriod(addMonths(p.start, dir));
  const len = daysBetween(p.start, p.end) + 1;
  const start = addDays(p.start, len * dir);
  return { kind: 'custom', start, end: addDays(start, len - 1), title: `${fmtDate(start)} – ${fmtDate(addDays(start, len - 1))}` };
}
export function previousPeriod(p: Period): Period { return shiftPeriod(p, -1); }

function activeOn(a: Animal, day: string): boolean {
  if (entryDate(a) > day) return false;
  if (a.status === 'active') return true;
  return !!a.exit_date && a.exit_date > day;
}

export interface CowMilkRow { animal: Animal; total: number; days: number; avg: number; am: number; pm: number; estimated: number }

export interface Report {
  period: Period;
  days: number;
  herd: {
    opening: number; closing: number;
    births: Animal[]; purchases: Animal[]; sold: Animal[]; died: Animal[]; culled: Animal[];
    byCategory: Record<string, number>;
  };
  milk: {
    total: number; perDay: number; recordedDays: number; prevTotal: number; changePct: number | null;
    estimatedShare: number; daily: { date: string; litres: number }[]; cows: CowMilkRow[];
    best?: { date: string; litres: number };
  };
  breeding: { services: number; confirmed: number; negative: number; calvings: number; calvesBorn: number; dueNext: { animal: Animal; due: string }[]; pregnantNow: number };
  health: { newCases: number; recovered: number; vaccinations: number; dewormings: number; underTreatmentNow: number; needAttentionNow: number; cost: number; cases: { animal?: Animal; date: string; condition: string; status: string }[] };
  register: RegisterSummary;
  feed: { items: { feed: Feed; used: number; bought: number; cost: number; stockEnd: number; perDay: number }[]; cost: number; costPerLitre: number | null };
  money: {
    income: number; expenses: number; net: number;
    incomeBy: [string, number][]; expenseBy: [string, number][];
    litresSold: number; milkIncome: number; pricePerLitre: number | null; costPerLitre: number | null;
  };
}

export function buildReport(farm: Farm, period: Period): Report {
  const { start, end } = period;
  const inP = (d?: string) => !!d && d >= start && d <= end;
  const days = daysBetween(start, end) + 1;
  const byId = new Map(farm.animals.map((a) => [a.id, a]));
  // Status figures ("at end") use today when the period hasn't finished yet
  const asOf = end > todayISO() ? todayISO() : end;

  // Herd movement
  const opening = farm.animals.filter((a) => activeOn(a, addDays(start, -1))).length;
  const closingAnimals = farm.animals.filter((a) => activeOn(a, end));
  const births = farm.animals.filter((a) => a.source === 'born' && inP(a.dob));
  const purchases = farm.animals.filter((a) => a.source === 'purchased' && inP(a.acquired_on));
  const exits = (s: Animal['status']) => farm.animals.filter((a) => a.status === s && inP(a.exit_date));
  const byCategory: Record<string, number> = { Cow: 0, Heifer: 0, Calf: 0, Bull: 0 };
  closingAnimals.forEach((a) => (byCategory[category(a, farm.breeding, end)]++));

  // Milk
  const logs = farm.milk.filter((m) => inP(m.date));
  const total = logs.reduce((s, m) => s + m.litres, 0);
  const prev = previousPeriod(period);
  const prevTotal = farm.milk.filter((m) => m.date >= prev.start && m.date <= prev.end).reduce((s, m) => s + m.litres, 0);
  const prevDays = daysBetween(prev.start, prev.end) + 1;
  const dailyMap = new Map<string, number>();
  logs.forEach((m) => dailyMap.set(m.date, (dailyMap.get(m.date) || 0) + m.litres));
  const daily = dateRange(start, end).map((date) => ({ date, litres: dailyMap.get(date) || 0 }));
  const recordedDays = dailyMap.size;
  const best = [...dailyMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const cowMap = new Map<string, CowMilkRow & { dset: Set<string> }>();
  for (const m of logs) {
    const animal = byId.get(m.animal_id);
    if (!animal) continue;
    let r = cowMap.get(m.animal_id);
    if (!r) { r = { animal, total: 0, days: 0, avg: 0, am: 0, pm: 0, estimated: 0, dset: new Set() }; cowMap.set(m.animal_id, r); }
    r.total += m.litres; r.dset.add(m.date);
    if (m.session === 'AM') r.am += m.litres; else r.pm += m.litres;
    if (m.method === 'estimated') r.estimated += m.litres;
  }
  const cows = [...cowMap.values()].map(({ dset, ...r }) => ({ ...r, days: dset.size, avg: dset.size ? r.total / dset.size : 0 })).sort((a, b) => b.total - a.total);
  const perDayNow = recordedDays ? total / recordedDays : 0;
  const prevRecorded = new Set(farm.milk.filter((m) => m.date >= prev.start && m.date <= prev.end).map((m) => m.date)).size;
  const perDayPrev = prevRecorded ? prevTotal / prevRecorded : 0;
  void prevDays;

  // Breeding
  const bev = farm.breeding.filter((e) => inP(e.date));
  const calvingEvents = bev.filter((e) => e.type === 'calving');
  const dueNext: { animal: Animal; due: string }[] = [];
  let pregnantNow = 0;
  for (const a of farm.animals.filter((x) => x.status === 'active' && x.sex === 'F')) {
    const r = repro(a, farm.breeding, farm.milk, asOf);
    if (r.state === 'pregnant') pregnantNow++;
    if (r.state === 'pregnant' && r.dueDate && r.dueDate > asOf && daysBetween(asOf, r.dueDate) <= 30) dueNext.push({ animal: a, due: r.dueDate });
  }

  // Health
  const hrec = farm.health.filter((h) => inP(h.date));
  const cost = hrec.reduce((s, h) => s + (h.cost || 0), 0);

  // Money (health & AI costs are already linked transactions — no double count)
  const tx = farm.transactions.filter((t) => inP(t.date));
  const sumBy = (type: 'income' | 'expense') => {
    const m = new Map<string, number>();
    tx.filter((t) => t.type === type).forEach((t) => m.set(t.category, (m.get(t.category) || 0) + t.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const incomeBy = sumBy('income');
  const expenseBy = sumBy('expense');
  const income = incomeBy.reduce((s, [, v]) => s + v, 0);
  const expenses = expenseBy.reduce((s, [, v]) => s + v, 0);
  const milkTx = tx.filter((t) => t.type === 'income' && t.category === 'Milk sales');
  const litresSold = milkTx.reduce((s, t) => s + (t.litres || 0), 0);
  const milkIncome = milkTx.reduce((s, t) => s + t.amount, 0);

  // Feed
  const fm = (farm.feed_moves || []).filter((m) => inP(m.date));
  const feedItems = (farm.feeds || []).map((feed) => {
    const mine = fm.filter((m) => m.feed_id === feed.id);
    const used = mine.filter((m) => m.type === 'out').reduce((s, m) => s + m.qty, 0);
    const bought = mine.filter((m) => m.type === 'in').reduce((s, m) => s + m.qty, 0);
    const cost = mine.filter((m) => m.type === 'in').reduce((s, m) => s + (m.cost || 0), 0);
    return { feed, used, bought, cost, stockEnd: stockOn(feed.id, farm.feed_moves || [], asOf), perDay: used / (daysBetween(start, asOf < start ? start : asOf) + 1) };
  }).filter((x) => x.used || x.bought || x.stockEnd);
  const feedCost = expenseBy.find(([c]) => c === 'Feed & supplements')?.[1] || 0;

  return {
    period, days,
    register: registerSummary(farm.stock || [], start, end),
    feed: { items: feedItems, cost: feedCost, costPerLitre: total ? feedCost / total : null },
    herd: { opening, closing: closingAnimals.length, births, purchases, sold: exits('sold'), died: exits('dead'), culled: exits('culled'), byCategory },
    milk: {
      total, perDay: perDayNow, recordedDays, prevTotal,
      changePct: perDayPrev > 0 ? ((perDayNow - perDayPrev) / perDayPrev) * 100 : null,
      estimatedShare: total ? logs.filter((m) => m.method === 'estimated').reduce((s, m) => s + m.litres, 0) / total : 0,
      daily, cows, best: best ? { date: best[0], litres: best[1] } : undefined,
    },
    breeding: {
      services: bev.filter((e) => e.type === 'service').length,
      confirmed: bev.filter((e) => e.type === 'preg_check' && e.result === 'pregnant').length,
      negative: bev.filter((e) => e.type === 'preg_check' && e.result === 'open').length,
      calvings: calvingEvents.length,
      calvesBorn: births.length,
      dueNext: dueNext.sort((a, b) => a.due.localeCompare(b.due)),
      pregnantNow,
    },
    health: {
      newCases: hrec.filter((h) => h.kind === 'treatment').length,
      recovered: farm.health.filter((h) => h.kind === 'treatment' && inP(h.resolved_on)).length,
      vaccinations: hrec.filter((h) => h.kind === 'vaccination').length,
      dewormings: hrec.filter((h) => h.kind === 'deworming').length,
      underTreatmentNow: new Set(openTreatments(farm.health).filter((h) => h.date <= asOf).map((h) => h.animal_id)).size,
      needAttentionNow: needsAttention(farm, asOf).size,
      cost,
      cases: hrec.filter((h) => h.kind === 'treatment').map((h) => ({ animal: byId.get(h.animal_id), date: h.date, condition: h.condition, status: h.status })),
    },
    money: {
      income, expenses, net: income - expenses, incomeBy, expenseBy, litresSold, milkIncome,
      pricePerLitre: litresSold ? milkIncome / litresSold : null,
      costPerLitre: total ? expenses / total : null,
    },
  };
}

export { label };
