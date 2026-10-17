import type { Animal, Settings } from '../db/types';
import { addDays, daysBetween, todayISO } from './dates';
import { label, repro, type Alert, type Farm } from './herd';
import { breedingReadiness, estimateWeight, feedingOf, growthFlag, milkOutlook, saleReadiness, withBreed } from './growth';

type Opts = Pick<Settings, 'default_breed' | 'default_feeding' | 'sale_weight_kg'> | undefined;

export interface HerdOutlook {
  asOf: string;
  readyToServe: Animal[];
  readySoon: { a: Animal; date: string }[]; // next 90 days
  calvingsDue: { a: Animal; date: string }[]; // next 90 days
  saleReady: Animal[];
  saleSoon: { a: Animal; date: string }[];
  slowGrowers: Animal[];
  milkNext30: number; // forecast, litres
  milkingCows: number;
  belowExpected: { a: Animal; ratio: number }[];
  needWeighing: number; // young stock with no weight in 100 days
  tagged: number;
  total: number;
}

export function herdOutlook(farm: Farm, s: Opts, on = todayISO()): HerdOutlook {
  const o: HerdOutlook = { asOf: on, readyToServe: [], readySoon: [], calvingsDue: [], saleReady: [], saleSoon: [], slowGrowers: [], milkNext30: 0, milkingCows: 0, belowExpected: [], needWeighing: 0, tagged: 0, total: 0 };
  const horizon = addDays(on, 90);
  const lastWeighed = new Map<string, string>();
  farm.weights.forEach((w) => { if (w.date <= on && (lastWeighed.get(w.animal_id) || '') < w.date) lastWeighed.set(w.animal_id, w.date); });
  for (const raw of farm.animals) {
    if (raw.status !== 'active') continue;
    o.total++;
    if (!raw.provisional) o.tagged++;
    const a = withBreed(raw, s?.default_breed);
    const fd = feedingOf(a, s?.default_feeding);
    const young = !!a.dob && daysBetween(a.dob, on) < 730;
    const lw = lastWeighed.get(a.id);
    if (young && (!lw || daysBetween(lw, on) > 100)) o.needWeighing++;
    if (young || lw) {
      const est = estimateWeight(a, farm.weights, fd, on);
      if (growthFlag(est) === 'slow') o.slowGrowers.push(raw);
    }
    if (a.sex === 'F') {
      const br = breedingReadiness(a, farm.breeding, farm.weights, fd, on);
      if (br.ready) o.readyToServe.push(raw);
      else if (br.date && br.date <= horizon) o.readySoon.push({ a: raw, date: br.date });
      const r = repro(a, farm.breeding, farm.milk, on);
      if (r.state === 'pregnant' && r.dueDate && r.dueDate <= horizon) o.calvingsDue.push({ a: raw, date: r.dueDate });
      const m = milkOutlook(a, farm.breeding, farm.milk, fd, on);
      if (m.applies) {
        o.milkingCows++;
        o.milkNext30 += m.next30 || 0;
        if (m.ratio != null && m.ratio < 0.7) o.belowExpected.push({ a: raw, ratio: m.ratio });
      }
    } else {
      const sr = saleReadiness(a, farm.weights, fd, s?.sale_weight_kg, on);
      if (sr.ready) o.saleReady.push(raw);
      else if (sr.applies && sr.date && sr.date <= horizon) o.saleSoon.push({ a: raw, date: sr.date });
    }
  }
  const byDate = (x: { date: string }, y: { date: string }) => x.date.localeCompare(y.date);
  o.readySoon.sort(byDate); o.calvingsDue.sort(byDate); o.saleSoon.sort(byDate);
  o.belowExpected.sort((x, y) => x.ratio - y.ratio);
  return o;
}

const names = (xs: Animal[], n = 4) => xs.slice(0, n).map((a) => label(a)).join(', ') + (xs.length > n ? ` and ${xs.length - n} more` : '');

export function outlookAlerts(o: HerdOutlook): Alert[] {
  const out: Alert[] = [];
  if (o.readyToServe.length) out.push({ id: 'ol-serve', severity: 'info', group: 'breeding', title: `${o.readyToServe.length} ${o.readyToServe.length === 1 ? 'heifer is' : 'heifers are'} old and heavy enough to serve`, detail: names(o.readyToServe), to: '/animals?filter=ready' });
  if (o.saleReady.length) out.push({ id: 'ol-sale', severity: 'info', group: 'records', title: `${o.saleReady.length} ${o.saleReady.length === 1 ? 'bull or steer has' : 'bulls and steers have'} reached sale weight`, detail: `Estimated from age and weighings · ${names(o.saleReady)}`, to: '/animals?filter=sale' });
  if (o.slowGrowers.length) out.push({ id: 'ol-slow', severity: 'soon', group: 'health', title: `${o.slowGrowers.length} young ${o.slowGrowers.length === 1 ? 'animal is' : 'animals are'} growing slowly`, detail: `Under 70% of expected gain — check worms, ticks and feed · ${names(o.slowGrowers)}`, animalId: o.slowGrowers.length === 1 ? o.slowGrowers[0].id : undefined, to: o.slowGrowers.length === 1 ? `/animals/${o.slowGrowers[0].id}` : '/animals' });
  if (o.belowExpected.length) out.push({ id: 'ol-milk', severity: 'info', group: 'milk', title: `${o.belowExpected.length} ${o.belowExpected.length === 1 ? 'cow gives' : 'cows give'} much less milk than expected`, detail: o.belowExpected.slice(0, 4).map((x) => `${label(x.a)} ${Math.round(x.ratio * 100)}%`).join(', '), to: o.belowExpected.length === 1 ? `/animals/${o.belowExpected[0].a.id}` : '/milk' });
  const untagged = o.total - o.tagged;
  if (untagged > 0) out.push({ id: 'ol-tags', severity: 'info', group: 'records', title: `${untagged} of ${o.total} animals still need ear tags`, detail: 'Open each animal and type its tag number once tagged', to: '/animals?filter=untagged' });
  return out;
}
