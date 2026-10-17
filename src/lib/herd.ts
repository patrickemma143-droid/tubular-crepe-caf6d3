import type { Animal, BreedingEvent, Feed, FeedMove, StockMonth, HealthRecord, MilkLog, Transaction, WeightRecord } from '../db/types';
import { addDays, ageInMonths, daysBetween, fmtDate, todayISO } from './dates';
import { feedStatus, fmtQty } from './feed';

export interface Farm {
  animals: Animal[];
  milk: MilkLog[];
  breeding: BreedingEvent[];
  health: HealthRecord[];
  weights: WeightRecord[];
  transactions: Transaction[];
  feeds: Feed[];
  feed_moves: FeedMove[];
  stock: StockMonth[];
}

export const GESTATION_DAYS = 283;
export const HEAT_CYCLE_DAYS = 21;

// ─── Categories ───────────────────────────────────────────────

export type Category = 'Cow' | 'Heifer' | 'Calf' | 'Bull';

export function hasCalved(a: Animal, events: BreedingEvent[]): boolean {
  return events.some((e) => e.animal_id === a.id && e.type === 'calving');
}

export function category(a: Animal, events: BreedingEvent[], on = todayISO()): Category {
  const months = a.dob ? ageInMonths(a.dob, on) : 36;
  if (a.sex === 'M') return months < 12 ? 'Calf' : 'Bull';
  if (hasCalved(a, events)) return 'Cow';
  if (months < 12) return 'Calf';
  return 'Heifer';
}

export function label(a?: Animal): string {
  if (!a) return 'Unknown animal';
  return a.name ? `${a.tag} · ${a.name}` : a.tag;
}

/** The day the animal joined the farm (born or bought). */
export function entryDate(a: Animal): string {
  return (a.source === 'purchased' ? a.acquired_on : a.dob) || a.acquired_on || a.dob || a.created_at.slice(0, 10);
}

// ─── Reproduction ─────────────────────────────────────────────

export type ReproState = 'not bred' | 'open' | 'served' | 'pregnant' | 'n/a';

export interface Repro {
  state: ReproState;
  milking: boolean;
  dry: boolean;
  lastCalving?: string;
  lastService?: string;
  lastHeat?: string;
  servicesSinceCalving: number;
  dueDate?: string; // expected calving (confirmed pregnancy, or tentative if served)
  confirmed: boolean;
  daysInMilk?: number;
  calvings: number;
}

export function eventsFor(id: string, events: BreedingEvent[]): BreedingEvent[] {
  return events
    .filter((e) => e.animal_id === id)
    .sort((a, b) => (a.date === b.date ? a.created_at.localeCompare(b.created_at) : a.date.localeCompare(b.date)));
}

export function repro(a: Animal, events: BreedingEvent[], milk: MilkLog[] = [], on = todayISO()): Repro {
  const r: Repro = { state: 'n/a', milking: false, dry: false, servicesSinceCalving: 0, confirmed: false, calvings: 0 };
  if (a.sex !== 'F') return r;
  r.state = 'not bred';
  let pregnant = false;
  let served = false;
  for (const e of eventsFor(a.id, events)) {
    if (e.date > on) continue;
    switch (e.type) {
      case 'calving':
        r.lastCalving = e.date; r.calvings++; r.milking = true; r.dry = false;
        pregnant = false; served = false; r.servicesSinceCalving = 0; r.lastService = undefined; r.confirmed = false;
        r.state = 'open';
        break;
      case 'abortion':
        pregnant = false; served = false; r.confirmed = false; r.state = 'open';
        break;
      case 'service':
        r.lastService = e.date; r.servicesSinceCalving++; served = true; pregnant = false; r.confirmed = false;
        break;
      case 'preg_check':
        if (e.result === 'pregnant') { pregnant = true; r.confirmed = true; }
        else { pregnant = false; served = false; r.confirmed = false; r.state = 'open'; }
        break;
      case 'dry_off':
        r.milking = false; r.dry = true;
        break;
      case 'heat':
        r.lastHeat = e.date;
        break;
    }
  }
  if (pregnant) r.state = 'pregnant';
  else if (served) r.state = 'served';
  else if (r.state === 'not bred' && r.calvings > 0) r.state = 'open';
  if ((pregnant || served) && r.lastService) r.dueDate = addDays(r.lastService, GESTATION_DAYS);

  // Cows bought already in milk have no calving record: treat recent milk as milking.
  if (!r.lastCalving && !r.dry) {
    const recent = milk.some((m) => m.animal_id === a.id && m.date <= on && daysBetween(m.date, on) <= 10);
    if (recent) r.milking = true;
  }
  if (r.milking && r.lastCalving) r.daysInMilk = daysBetween(r.lastCalving, on);
  return r;
}

// ─── Milk helpers ─────────────────────────────────────────────

export function dailyTotals(milk: MilkLog[], animalId?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of milk) {
    if (animalId && l.animal_id !== animalId) continue;
    m.set(l.date, (m.get(l.date) || 0) + l.litres);
  }
  return m;
}

/** Average litres per recorded day for one cow in [start, end]. */
export function avgDaily(milk: MilkLog[], animalId: string, start: string, end: string): { avg: number; days: number } {
  const byDay = new Map<string, number>();
  for (const l of milk) {
    if (l.animal_id !== animalId || l.date < start || l.date > end) continue;
    byDay.set(l.date, (byDay.get(l.date) || 0) + l.litres);
  }
  const vals = [...byDay.values()];
  return { avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0, days: vals.length };
}

// Realistic Ugandan baselines (litres/day) when a cow has no history.
const BREED_BASELINE: [RegExp, number][] = [
  [/holstein|friesian|fresian/i, 14],
  [/jersey/i, 10],
  [/guernsey|ayrshire|brown swiss/i, 11],
  [/cross|x\b/i, 8],
  [/ankole|zebu|boran|nganda/i, 3],
];
export function breedBaseline(breed?: string): number {
  for (const [re, v] of BREED_BASELINE) if (breed && re.test(breed)) return v;
  return 8;
}

export interface Share {
  animal: Animal;
  basis: string;
  expected: number; // expected litres for the chosen session(s)
  sick: boolean;
  share: number; // 0..1
}

/**
 * Split a herd total across cows in proportion to what each normally gives.
 * Uses the 14 days before `date` (measured records preferred), then 30 days,
 * then a breed baseline. Cows under treatment are weighted down.
 */
export function estimateShares(
  cows: Animal[], farm: Pick<Farm, 'milk' | 'health'>, date: string, session: 'AM' | 'PM' | 'both',
): Share[] {
  const sessionFactor = session === 'both' ? 1 : session === 'AM' ? 0.55 : 0.45;
  const measured = farm.milk.filter((m) => m.method === 'measured');
  const rows = cows.map((animal) => {
    const end = addDays(date, -1);
    let src = measured;
    let { avg, days } = avgDaily(src, animal.id, addDays(date, -14), end);
    let basis = `${days}-day average`;
    if (days < 3) {
      src = farm.milk;
      ({ avg, days } = avgDaily(src, animal.id, addDays(date, -30), end));
      basis = `${days}-day average`;
    }
    if (days < 3) {
      avg = breedBaseline(animal.breed);
      basis = `breed estimate (${animal.breed || 'unknown breed'})`;
    }
    const sick = farm.health.some((h) => h.animal_id === animal.id && h.kind === 'treatment' && h.status === 'open' && h.date <= date);
    const expected = Math.max(0.1, avg * sessionFactor * (sick ? 0.6 : 1));
    return { animal, basis, expected, sick, share: 0 };
  });
  const total = rows.reduce((s, r) => s + r.expected, 0);
  rows.forEach((r) => (r.share = total > 0 ? r.expected / total : 1 / rows.length));
  return rows;
}

/** Splits `total` by shares, rounding to 0.1 L while keeping the sum exact. */
export function distribute(total: number, shares: Share[]): number[] {
  const tenths = Math.round(total * 10);
  const raw = shares.map((s) => s.share * tenths);
  const base = raw.map(Math.floor);
  let left = tenths - base.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; base[i]++; left--; }
  return base.map((v) => v / 10);
}

// ─── Health ───────────────────────────────────────────────────

export function openTreatments(health: HealthRecord[]): HealthRecord[] {
  return health.filter((h) => h.kind === 'treatment' && (h.status === 'open' || h.status === 'chronic'));
}

export function onWithdrawal(health: HealthRecord[], animalId: string, on = todayISO()): string | undefined {
  const until = health
    .filter((h) => h.animal_id === animalId && h.milk_withdrawal_until && h.milk_withdrawal_until >= on && h.date <= on)
    .map((h) => h.milk_withdrawal_until!)
    .sort()
    .pop();
  return until;
}

/** Latest scheduled follow-up per animal+product that hasn't been superseded. */
export function dueHealth(health: HealthRecord[]): HealthRecord[] {
  const latest = new Map<string, HealthRecord>();
  for (const h of health) {
    if (h.kind === 'treatment') continue;
    const key = `${h.animal_id}|${h.kind}|${h.condition.trim().toLowerCase()}`;
    const cur = latest.get(key);
    if (!cur || h.date > cur.date) latest.set(key, h);
  }
  return [...latest.values()].filter((h) => !!h.next_due);
}

// ─── Alerts ───────────────────────────────────────────────────

export type Severity = 'urgent' | 'soon' | 'info';
export interface Alert {
  id: string;
  severity: Severity;
  group: 'health' | 'breeding' | 'milk' | 'records' | 'feed';
  title: string;
  detail: string;
  animalId?: string;
  to?: string;
}

export function activeAnimals(farm: Farm): Animal[] {
  return farm.animals.filter((a) => a.status === 'active');
}

export function milkingCows(farm: Farm, on = todayISO()): Animal[] {
  return activeAnimals(farm).filter((a) => a.sex === 'F' && repro(a, farm.breeding, farm.milk, on).milking);
}

export function alerts(farm: Farm, on = todayISO(), hour = new Date().getHours()): Alert[] {
  const out: Alert[] = [];
  const byId = new Map(farm.animals.map((a) => [a.id, a]));
  const active = activeAnimals(farm);
  const activeIds = new Set(active.map((a) => a.id));

  // Health: animals under treatment
  for (const h of openTreatments(farm.health)) {
    if (!activeIds.has(h.animal_id)) continue;
    const a = byId.get(h.animal_id);
    const days = daysBetween(h.date, on);
    out.push({
      id: 'tx-' + h.id, severity: h.status === 'open' ? 'urgent' : 'soon', group: 'health',
      title: `${label(a)} is under treatment`,
      detail: `${h.condition}${h.medicine ? ' · ' + h.medicine : ''} · day ${days + 1}`,
      animalId: h.animal_id, to: `/animals/${h.animal_id}`,
    });
  }
  // Health: milk withdrawal
  for (const a of active) {
    const until = onWithdrawal(farm.health, a.id, on);
    if (until) out.push({
      id: 'wd-' + a.id, severity: 'urgent', group: 'health',
      title: `Don't sell milk from ${label(a)}`,
      detail: `Drug withdrawal until ${until === on ? 'end of today' : fmtDate(until)}`,
      animalId: a.id, to: `/animals/${a.id}`,
    });
  }
  // Health: vaccinations / deworming due (herd-wide rounds collapse into one alert)
  const dueGroups = new Map<string, HealthRecord[]>();
  for (const h of dueHealth(farm.health)) {
    if (!activeIds.has(h.animal_id) || daysBetween(on, h.next_due!) > 7) continue;
    const k = `${h.kind}|${h.condition.trim().toLowerCase()}|${h.next_due! < on ? 'late' : 'due'}`;
    dueGroups.set(k, [...(dueGroups.get(k) || []), h]);
  }
  const what = (h: HealthRecord) => (h.kind === 'deworming' ? 'Deworming' : h.kind === 'vaccination' ? 'Vaccination' : 'Follow-up');
  const when = (n: number) => (n < 0 ? `${-n} days late` : n === 0 ? 'today' : `in ${n} days`);
  for (const hs of dueGroups.values()) {
    const first = hs.sort((x, y) => x.next_due!.localeCompare(y.next_due!))[0];
    const n = daysBetween(on, first.next_due!);
    if (hs.length >= 3) {
      out.push({
        id: 'due-' + first.id, severity: n < 0 ? 'urgent' : 'soon', group: 'health',
        title: `${first.condition}: ${what(first).toLowerCase()} ${n < 0 ? 'overdue' : 'due'} for ${hs.length} animals`,
        detail: `${n < 0 ? 'First one ' : ''}${when(n)} · ${hs.map((h) => byId.get(h.animal_id)?.tag).filter(Boolean).slice(0, 6).join(', ')}${hs.length > 6 ? '…' : ''}`,
        to: '/health',
      });
    } else for (const h of hs) {
      const m = daysBetween(on, h.next_due!);
      out.push({
        id: 'due-' + h.id, severity: m < 0 ? 'urgent' : 'soon', group: 'health',
        title: `${what(h)} ${m < 0 ? 'overdue' : 'due'}: ${label(byId.get(h.animal_id))}`,
        detail: `${h.condition} · ${when(m)}`,
        animalId: h.animal_id, to: `/animals/${h.animal_id}`,
      });
    }
  }

  // Breeding
  for (const a of active) {
    if (a.sex !== 'F') continue;
    const r = repro(a, farm.breeding, farm.milk, on);
    if (r.dueDate && (r.state === 'pregnant' || r.state === 'served')) {
      const n = daysBetween(on, r.dueDate);
      if (n <= 21 && r.state === 'pregnant') out.push({
        id: 'calve-' + a.id, severity: n <= 7 ? 'urgent' : 'soon', group: 'breeding',
        title: n < 0 ? `${label(a)} is past her calving date` : `${label(a)} due to calve ${n === 0 ? 'today' : `in ${n} days`}`,
        detail: `Expected ${fmtDate(r.dueDate)}. Move to the calving area and watch closely.`,
        animalId: a.id, to: `/animals/${a.id}`,
      });
      if (r.state === 'pregnant' && r.milking && n <= 60 && n > 21) out.push({
        id: 'dry-' + a.id, severity: 'soon', group: 'breeding',
        title: `Dry off ${label(a)}`,
        detail: `Calving expected in ${n} days. Dry off about 60 days before.`,
        animalId: a.id, to: `/animals/${a.id}`,
      });
    }
    if (r.state === 'served' && r.lastService) {
      const d = daysBetween(r.lastService, on);
      if (d >= 18 && d <= 24) out.push({
        id: 'heat-' + a.id, severity: 'soon', group: 'breeding',
        title: `Watch ${label(a)} for heat`,
        detail: `Served ${d} days ago. If she shows heat, the service didn't hold.`,
        animalId: a.id, to: `/animals/${a.id}`,
      });
      if (d >= 45) out.push({
        id: 'pd-' + a.id, severity: 'soon', group: 'breeding',
        title: `Pregnancy check due: ${label(a)}`,
        detail: `Served ${d} days ago and not yet confirmed.`,
        animalId: a.id, to: `/animals/${a.id}`,
      });
    }
    if (r.state === 'open' && r.lastCalving) {
      const dim = daysBetween(r.lastCalving, on);
      if (dim >= 60) out.push({
        id: 'open-' + a.id, severity: dim >= 120 ? 'soon' : 'info', group: 'breeding',
        title: `${label(a)} not yet served`,
        detail: `${dim} days since calving. Aim to serve by 60–90 days.`,
        animalId: a.id, to: `/animals/${a.id}`,
      });
    }
    if (r.state === 'not bred' && a.dob && ageInMonths(a.dob, on) >= 15 && r.calvings === 0) out.push({
      id: 'heifer-' + a.id, severity: 'info', group: 'breeding',
      title: `Heifer ${label(a)} ready to serve`,
      detail: `${ageInMonths(a.dob, on)} months old and not yet served.`,
      animalId: a.id, to: `/animals/${a.id}`,
    });
  }

  // Milk
  const cows = milkingCows(farm, on);
  const todayLogs = farm.milk.filter((m) => m.date === on);
  if (cows.length) {
    const hasAM = todayLogs.some((m) => m.session === 'AM');
    const hasPM = todayLogs.some((m) => m.session === 'PM');
    if (!hasAM && hour >= 9) out.push({ id: 'am', severity: 'soon', group: 'records', title: 'Morning milk not recorded', detail: `${cows.length} cows milking`, to: `/milk/record?session=AM` });
    if (!hasPM && hour >= 19) out.push({ id: 'pm', severity: 'soon', group: 'records', title: 'Evening milk not recorded', detail: `${cows.length} cows milking`, to: `/milk/record?session=PM` });
  }
  for (const a of cows) {
    const recent = avgDaily(farm.milk, a.id, addDays(on, -3), addDays(on, -1));
    const base = avgDaily(farm.milk, a.id, addDays(on, -17), addDays(on, -4));
    if (recent.days >= 2 && base.days >= 5 && base.avg >= 3 && recent.avg < base.avg * 0.75) {
      const pct = Math.round((1 - recent.avg / base.avg) * 100);
      out.push({
        id: 'drop-' + a.id, severity: 'soon', group: 'milk',
        title: `${label(a)} milk down ${pct}%`,
        detail: `${recent.avg.toFixed(1)} L/day over the last 3 days vs ${base.avg.toFixed(1)} L before. Check for mastitis, feed or heat.`,
        animalId: a.id, to: `/animals/${a.id}`,
      });
    }
  }

  // Feed stock
  for (const f of feedStatus(farm.feeds || [], farm.feed_moves || [], on)) {
    if (!f.low && !f.out) continue;
    const left = f.daysLeft != null ? Math.floor(f.daysLeft) : null;
    out.push({
      id: 'feed-' + f.feed.id, severity: f.out || (left != null && left < 3) ? 'urgent' : 'soon', group: 'feed',
      title: f.out ? `Out of ${f.feed.name}` : `${f.feed.name} running low`,
      detail: `${fmtQty(f.stock, f.feed.unit)} left${left != null ? ` · ${left < 1 ? 'less than a day' : `about ${left} ${left === 1 ? 'day' : 'days'}`} at current use` : ''}`,
      to: '/feed',
    });
  }

  const rank: Record<Severity, number> = { urgent: 0, soon: 1, info: 2 };
  return out.sort((x, y) => rank[x.severity] - rank[y.severity]);
}

/** Animals that need medical attention now (treatment, overdue vaccination, withdrawal). */
export function needsAttention(farm: Farm, on = todayISO()): Set<string> {
  const ids = new Set<string>();
  const activeIds = new Set(activeAnimals(farm).map((a) => a.id));
  openTreatments(farm.health).forEach((h) => ids.add(h.animal_id));
  dueHealth(farm.health).forEach((h) => { if (h.next_due! < on) ids.add(h.animal_id); });
  return new Set([...ids].filter((id) => activeIds.has(id)));
}
