import { describe, it, expect } from 'vitest';
import type { Animal, BreedingEvent, MilkLog, WeightRecord } from '../db/types';
import { addDays } from './dates';
import { breedingReadiness, estimateWeight, expectedMilk, expectedWeight, growthFlag, milkOutlook, profileFor, saleReadiness } from './growth';

const ON = '2026-10-18';
const base = { created_at: '', updated_at: '', deleted: 0 as const, dirty: 0 as const };
const animal = (p: Partial<Animal>): Animal => ({ ...base, id: p.id || 'a1', tag: 'T1', sex: 'F', status: 'active', ...p } as Animal);
const w = (date: string, kg: number, id = 'a1'): WeightRecord => ({ ...base, id: `w${date}`, animal_id: id, date, kg } as WeightRecord);

describe('growth', () => {
  it('matches breeds, crosses first', () => {
    expect(profileFor('Ankole').key).toBe('ankole');
    expect(profileFor('Friesian x Ankole').key).toBe('cross');
    expect(profileFor('Holstein Friesian').key).toBe('friesian');
    expect(profileFor(undefined).key).toBe('cross');
  });

  it('expected weight rises and flattens toward mature', () => {
    const p = profileFor('Friesian');
    const at = (d: number) => expectedWeight(p, 'F', d);
    expect(at(0)).toBe(38);
    expect(at(365)).toBeGreaterThan(at(180));
    expect(at(3650)).toBeLessThanOrEqual(p.matureF);
    expect(expectedWeight(p, 'F', 365, 'grazing')).toBeLessThan(at(365));
  });

  it('projects from weighings and flags slow growers', () => {
    const a = animal({ dob: addDays(ON, -300), breed: 'Friesian' });
    const slow = [w(addDays(ON, -90), 120), w(addDays(ON, -30), 132)]; // 0.2 kg/day
    const est = estimateWeight(a, slow, 'grazing_supplement', ON);
    expect(est.basis).toBe('projected from last weighing');
    expect(growthFlag(est)).toBe('slow');
    expect(est.kg!).toBeGreaterThan(132);
    expect(estimateWeight(a, [], 'grazing_supplement', ON).basis).toBe('estimated from age');
  });

  it('heifer readiness needs age and weight', () => {
    const young = animal({ dob: addDays(ON, -200), breed: 'Ankole' });
    const r = breedingReadiness(young, [], [], 'grazing_supplement', ON);
    expect(r.applies).toBe(true);
    expect(r.ready).toBe(false);
    expect(r.date! >= r.minAgeDate!).toBe(true);
    expect(r.firstCalving! > r.date!).toBe(true);
    const old = animal({ dob: addDays(ON, -1000), breed: 'Friesian' });
    expect(breedingReadiness(old, [], [], 'zero_grazing', ON).ready).toBe(true);
    const cow = animal({ dob: addDays(ON, -1500), calved_before: true });
    expect(breedingReadiness(cow, [], [], 'grazing', ON).applies).toBe(false);
  });

  it('sale readiness for steers, not breeding bulls', () => {
    const steer = animal({ sex: 'M', castrated: true, dob: addDays(ON, -400), breed: 'Boran' });
    const s = saleReadiness(steer, [], 'grazing', 300, ON);
    expect(s.applies).toBe(true);
    expect(s.date).not.toBeNull();
    expect(saleReadiness({ ...steer, breeding_bull: true }, [], 'grazing', 300, ON).applies).toBe(false);
  });

  it('lactation curve peaks near day 50 and adjusts to records', () => {
    const p = profileFor('Friesian');
    expect(expectedMilk(p, 'grazing_supplement', 50)).toBeCloseTo(18, 0);
    expect(expectedMilk(p, 'grazing_supplement', 200)).toBeLessThan(expectedMilk(p, 'grazing_supplement', 50));
    expect(expectedMilk(p, 'zero_grazing', 50)).toBeGreaterThan(18);
    const cow = animal({ breed: 'Friesian', calved_before: true });
    const calved = addDays(ON, -60);
    const ev: BreedingEvent[] = [{ ...base, id: 'c', animal_id: 'a1', type: 'calving', date: calved } as BreedingEvent];
    const milk: MilkLog[] = Array.from({ length: 10 }, (_, i) => ({ ...base, id: `m${i}`, animal_id: 'a1', date: addDays(ON, -i), session: 'AM', litres: 9, method: 'measured' } as MilkLog));
    const o = milkOutlook(cow, ev, milk, 'grazing_supplement', ON);
    expect(o.applies).toBe(true);
    expect(o.dim).toBe(60);
    expect(o.ratio!).toBeLessThan(0.7); // giving about half of what her breed should
    expect(o.next30!).toBeGreaterThan(200);
    expect(o.next30!).toBeLessThan(300);
  });
});
