import type { Animal, BreedingEvent, Feeding, MilkLog, WeightRecord } from '../db/types';
import { addDays, daysBetween, todayISO } from './dates';
import { hasCalved, repro, GESTATION_DAYS } from './herd';

// Planning estimates for Ugandan conditions. They are starting points, not
// measurements: every forecast is corrected by the animal's own weighings and
// milk records as soon as those exist.

export interface BreedProfile {
  key: string;
  label: string;
  birthKg: number;
  adgPre: number; // kg/day, birth to ~8 months
  adgPost: number; // kg/day after weaning
  matureF: number; // kg
  matureM: number; // kg
  minBreedMonths: number; // earliest sensible age to serve a heifer
  peakMilk: number; // litres/day at peak, on grazing + supplements
  lactationDays: number;
}

export const PROFILES: { match: RegExp; p: BreedProfile }[] = [
  // crosses first, so "Friesian x Ankole" counts as a cross
  { match: /cross|\bx\b|×/i, p: { key: 'cross', label: 'Crossbred', birthKg: 30, adgPre: 0.5, adgPost: 0.45, matureF: 430, matureM: 650, minBreedMonths: 18, peakMilk: 9, lactationDays: 280 } },
  { match: /holstein|friesian|fresian/i, p: { key: 'friesian', label: 'Friesian / Holstein', birthKg: 38, adgPre: 0.6, adgPost: 0.55, matureF: 550, matureM: 800, minBreedMonths: 15, peakMilk: 18, lactationDays: 305 } },
  { match: /jersey|guernsey/i, p: { key: 'jersey', label: 'Jersey', birthKg: 25, adgPre: 0.45, adgPost: 0.4, matureF: 400, matureM: 600, minBreedMonths: 15, peakMilk: 13, lactationDays: 305 } },
  { match: /ayrshire|brown swiss|simmental/i, p: { key: 'exotic', label: 'Exotic dairy', birthKg: 34, adgPre: 0.55, adgPost: 0.5, matureF: 500, matureM: 750, minBreedMonths: 15, peakMilk: 15, lactationDays: 305 } },
  { match: /boran|zebu|nganda|teso|sahiwal/i, p: { key: 'zebu', label: 'Boran / Zebu', birthKg: 26, adgPre: 0.45, adgPost: 0.4, matureF: 380, matureM: 600, minBreedMonths: 22, peakMilk: 4, lactationDays: 240 } },
  { match: /ankole|ankore|nkore/i, p: { key: 'ankole', label: 'Ankole', birthKg: 22, adgPre: 0.4, adgPost: 0.35, matureF: 350, matureM: 550, minBreedMonths: 24, peakMilk: 3.5, lactationDays: 240 } },
];
export const DEFAULT_PROFILE = PROFILES.find((x) => x.p.key === 'cross')!.p;

export function profileFor(breed?: string): BreedProfile {
  for (const { match, p } of PROFILES) if (breed && match.test(breed)) return p;
  return DEFAULT_PROFILE;
}

const GROWTH_FEED: Record<Feeding, number> = { grazing: 0.8, grazing_supplement: 1, zero_grazing: 1.15 };
const MILK_FEED: Record<Feeding, number> = { grazing: 0.75, grazing_supplement: 1, zero_grazing: 1.25 };
/** The animal as the models should see it: farm-default breed when its own isn't recorded. */
export const withBreed = (a: Animal, defaultBreed?: string): Animal => (a.breed || !defaultBreed ? a : { ...a, breed: defaultBreed });
export const feedingOf = (a: Animal, farmDefault: Feeding = 'grazing_supplement'): Feeding => a.feeding || farmDefault;

/** Expected live weight (kg) at a given age in days. */
export function expectedWeight(p: BreedProfile, sex: 'F' | 'M', ageDays: number, feeding: Feeding = 'grazing_supplement'): number {
  const f = GROWTH_FEED[feeding] * (sex === 'M' ? 1.1 : 1);
  const mature = sex === 'M' ? p.matureM : p.matureF;
  const d = Math.max(0, ageDays);
  const linear = p.birthKg + f * (p.adgPre * Math.min(d, 240) + p.adgPost * Math.max(0, d - 240));
  const knee = 0.7 * mature;
  if (linear <= knee) return linear;
  return knee + (mature - knee) * (1 - Math.exp(-(linear - knee) / (mature - knee)));
}

export interface WeightEstimate {
  kg: number | null;
  basis: 'weighed today' | 'projected from last weighing' | 'estimated from age' | 'unknown';
  lastWeighed?: string;
  adg?: number; // actual average daily gain, kg/day
  expectedAdg?: number;
  ratio?: number; // actual vs expected growth
}

export function weightsFor(id: string, weights: WeightRecord[]): WeightRecord[] {
  return weights.filter((w) => w.animal_id === id).sort((a, b) => a.date.localeCompare(b.date));
}

export function estimateWeight(a: Animal, weights: WeightRecord[], feeding: Feeding, on = todayISO()): WeightEstimate {
  const p = profileFor(a.breed);
  const ws = weightsFor(a.id, weights).filter((w) => w.date <= on);
  const age = (d: string) => (a.dob ? daysBetween(a.dob, d) : null);
  let ratio: number | undefined, adg: number | undefined, expectedAdg: number | undefined;
  if (ws.length >= 2) {
    const last = ws[ws.length - 1];
    const prev = [...ws].reverse().find((w) => daysBetween(w.date, last.date) >= 14) || ws[0];
    const days = daysBetween(prev.date, last.date);
    if (days > 0) {
      adg = (last.kg - prev.kg) / days;
      const a0 = age(prev.date), a1 = age(last.date);
      if (a0 != null && a1 != null) {
        expectedAdg = (expectedWeight(p, a.sex, a1, feeding) - expectedWeight(p, a.sex, a0, feeding)) / days;
        if (expectedAdg > 0.01) ratio = Math.max(0.2, Math.min(2, adg / expectedAdg));
      }
    }
  }
  if (ws.length) {
    const last = ws[ws.length - 1];
    if (last.date === on) return { kg: last.kg, basis: 'weighed today', lastWeighed: last.date, adg, expectedAdg, ratio };
    const aLast = age(last.date), aNow = age(on);
    let gain: number;
    if (aLast != null && aNow != null) gain = (expectedWeight(p, a.sex, aNow, feeding) - expectedWeight(p, a.sex, aLast, feeding)) * (ratio ?? 1);
    else gain = (adg ?? 0) * daysBetween(last.date, on);
    return { kg: Math.round(last.kg + gain), basis: 'projected from last weighing', lastWeighed: last.date, adg, expectedAdg, ratio };
  }
  if (a.dob) return { kg: Math.round(expectedWeight(p, a.sex, daysBetween(a.dob, on), feeding)), basis: 'estimated from age' };
  return { kg: null, basis: 'unknown' };
}

/** First day (from `from`) the animal is expected to reach `targetKg`, searching up to 3 years. */
function dateReaching(a: Animal, est: WeightEstimate, feeding: Feeding, targetKg: number, from: string): string | null {
  if (est.kg == null) return null;
  if (est.kg >= targetKg) return from;
  const p = profileFor(a.breed);
  const r = est.ratio ?? 1;
  let kg = est.kg;
  for (let i = 1; i <= 1095; i += 7) {
    const d = addDays(from, i);
    if (a.dob) {
      const age0 = daysBetween(a.dob, addDays(d, -7)), age1 = daysBetween(a.dob, d);
      kg += (expectedWeight(p, a.sex, age1, feeding) - expectedWeight(p, a.sex, age0, feeding)) * r;
    } else kg += (est.adg ?? p.adgPost) * 7;
    if (kg >= targetKg) return d;
  }
  return null;
}

export interface BreedingReadiness {
  applies: boolean;
  ready: boolean;
  date: string | null; // when she should be ready to serve
  targetKg: number;
  minAgeDate: string | null;
  weightDate: string | null;
  firstCalving: string | null; // if served on time
  reason: string;
}

/** Heifers are ready when old enough AND heavy enough (about 60% of mature weight). */
export function breedingReadiness(a: Animal, events: BreedingEvent[], weights: WeightRecord[], feeding: Feeding, on = todayISO()): BreedingReadiness {
  const p = profileFor(a.breed);
  const targetKg = Math.round(p.matureF * 0.6);
  const base = { applies: false, ready: false, date: null, targetKg, minAgeDate: null, weightDate: null, firstCalving: null, reason: '' };
  if (a.sex !== 'F' || a.status !== 'active' || hasCalved(a, events)) return base;
  const r = repro(a, events, [], on);
  if (r.state === 'served' || r.state === 'pregnant') return { ...base, reason: r.state === 'pregnant' ? 'Already pregnant' : 'Already served' };
  const est = estimateWeight(a, weights, feeding, on);
  const minAgeDate = a.dob ? addDays(a.dob, Math.round(p.minBreedMonths * 30.44)) : null;
  const weightDate = dateReaching(a, est, feeding, targetKg, on);
  const dates = [minAgeDate, weightDate].filter(Boolean) as string[];
  const date = dates.length === 2 || (dates.length === 1 && !a.dob) ? dates.sort().pop()! : weightDate || minAgeDate;
  const when = date && date < on ? on : date;
  const ready = !!when && when <= on;
  const reason = !a.dob && est.kg == null ? 'Needs a birth date or a weight' :
    `Serve at ${p.minBreedMonths}+ months and about ${targetKg} kg (60% of a grown ${p.label} cow)`;
  return { applies: true, ready, date: when, targetKg, minAgeDate, weightDate, firstCalving: when ? addDays(when, 21 + GESTATION_DAYS) : null, reason };
}

export interface SaleReadiness { applies: boolean; date: string | null; targetKg: number; ready: boolean }

/** Bulls not kept for breeding and castrates: when they reach the farm's sale weight. */
export function saleReadiness(a: Animal, weights: WeightRecord[], feeding: Feeding, saleKg = 300, on = todayISO()): SaleReadiness {
  if (a.sex !== 'M' || a.breeding_bull || a.status !== 'active') return { applies: false, date: null, targetKg: saleKg, ready: false };
  const est = estimateWeight(a, weights, feeding, on);
  const date = dateReaching(a, est, feeding, saleKg, on);
  return { applies: true, date, targetKg: saleKg, ready: !!date && date <= on };
}

export function growthFlag(est: WeightEstimate): 'slow' | 'good' | 'fast' | null {
  if (est.ratio == null) return null;
  return est.ratio < 0.7 ? 'slow' : est.ratio > 1.25 ? 'fast' : 'good';
}

// ─── Milk expectation (Wood's lactation curve) ───────────────

const B = 0.2, C = 0.004; // peak around day 50
const woodA = (peak: number) => peak / (Math.pow(50, B) * Math.exp(-B * 50 * C / B));

export function expectedMilk(p: BreedProfile, feeding: Feeding, dim: number, firstLactation = false): number {
  if (dim < 1 || dim > p.lactationDays) return 0;
  const peak = p.peakMilk * MILK_FEED[feeding] * (firstLactation ? 0.8 : 1);
  return woodA(peak) * Math.pow(dim, B) * Math.exp(-C * dim);
}

export interface MilkOutlook {
  applies: boolean;
  dim?: number;
  expectedToday?: number; // for this breed + feeding at this stage
  actual?: number; // average L/day over the last 14 days (recorded days)
  ratio?: number; // actual vs expected
  next30?: number; // forecast litres over the next 30 days
  lactationTotal?: number; // forecast for the whole lactation
  basis: string;
}

export function milkOutlook(a: Animal, events: BreedingEvent[], milk: MilkLog[], feeding: Feeding, on = todayISO()): MilkOutlook {
  if (a.sex !== 'F' || a.status !== 'active') return { applies: false, basis: '' };
  const r = repro(a, events, milk, on);
  const p = profileFor(a.breed);
  const first = r.calvings === 1 && !a.calved_before;
  const byDay = new Map<string, number>();
  milk.forEach((m) => { if (m.animal_id === a.id && m.date <= on && m.date > addDays(on, -14)) byDay.set(m.date, (byDay.get(m.date) || 0) + m.litres); });
  const actual = byDay.size ? [...byDay.values()].reduce((s, v) => s + v, 0) / byDay.size : undefined;
  if (!r.milking) return { applies: false, basis: 'Not milking' };
  if (r.lastCalving == null) {
    // Bought or recorded in milk without a calving date: carry the recent average forward
    return { applies: true, actual, next30: actual != null ? actual * 30 : undefined, basis: 'No calving date — using her recent average' };
  }
  const dim = daysBetween(r.lastCalving, on);
  const expectedToday = expectedMilk(p, feeding, Math.max(1, dim), first);
  let ratio: number | undefined;
  if (actual != null) {
    const days = [...byDay.keys()];
    const expAvg = days.reduce((s, d) => s + expectedMilk(p, feeding, daysBetween(r.lastCalving!, d), first), 0) / days.length;
    if (expAvg > 0.2) ratio = Math.max(0.2, Math.min(3, actual / expAvg));
  }
  const k = ratio ?? 1;
  let next30 = 0;
  for (let i = 1; i <= 30; i++) next30 += expectedMilk(p, feeding, dim + i, first) * k;
  let soFar = 0;
  milk.forEach((m) => { if (m.animal_id === a.id && m.date >= r.lastCalving! && m.date <= on) soFar += m.litres; });
  let rest = 0;
  for (let d = dim + 1; d <= p.lactationDays; d++) rest += expectedMilk(p, feeding, d, first) * k;
  return {
    applies: true, dim, expectedToday, actual, ratio, next30, lactationTotal: soFar + rest,
    basis: ratio != null ? `${p.label} curve, adjusted to her own records` : `${p.label} curve for ${feeding.replace('_', ' + ')} — record her milk to sharpen this`,
  };
}
