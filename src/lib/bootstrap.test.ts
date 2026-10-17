import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../db/db';
import type { StockMonth } from '../db/types';
import { apply, plan } from './bootstrap';
import { ranchClass } from './herd';
import { herdOutlook, outlookAlerts } from './outlook';

const base = { created_at: '', updated_at: '', deleted: 0 as const, dirty: 0 as const };
const row = (month: string, cls: string, closing: number, births = 0): StockMonth =>
  ({ ...base, id: `${month}-${cls}`, month, cls, opening: closing - births, births, grade_in: 0, purchased: 0, deaths: 0, grade_out: 0, sold: 0, closing } as StockMonth);

const stock: StockMonth[] = [
  row('2026-06', 'Female calves', 3, 3), row('2026-06', 'Bull calves', 2, 2),
  row('2026-08', 'Female calves', 5, 2), row('2026-08', 'Bull calves', 2, 0),
  row('2026-08', 'Cows', 10), row('2026-08', 'Heifers', 4), row('2026-08', 'Castrates', 3), row('2026-08', 'Breeding bulls', 1), row('2026-08', 'Oxen', 2),
];

describe('start individual tracking from the register', () => {
  beforeAll(async () => { await db.delete(); await db.open(); });

  it('plans one record per head with ages from births', () => {
    const p = plan(stock, { breed: 'Ankole', feeding: 'grazing' }, '2026-10-18')!;
    expect(p.month).toBe('2026-08');
    expect(p.total).toBe(5 + 2 + 10 + 4 + 3 + 1);
    expect(p.skipped).toEqual([{ cls: 'Oxen', count: 2 }]);
    const fc = p.animals.filter((a) => a.tag.startsWith('TMP-FC'));
    expect(fc.map((a) => a.dob)).toEqual(['2026-08-15', '2026-08-15', '2026-06-15', '2026-06-15', '2026-06-15']);
    // heifers run out of recorded births → class fallback age
    expect(p.animals.find((a) => a.tag === 'TMP-HF-001')!.dob).toBe('2024-10-01');
    expect(p.rows.find((r) => r.cls === 'Heifers')!.datedFromBirths).toBe(0);
    const cs = p.animals.find((a) => a.tag === 'TMP-CS-001')!;
    expect(cs.castrated).toBe(true);
    expect(ranchClass(cs as any, [], '2026-10-18')).toBe('Castrates');
    expect(ranchClass(p.animals.find((a) => a.tag === 'TMP-CW-001') as any, [], '2026-10-18')).toBe('Cows');
    expect(ranchClass(p.animals.find((a) => a.tag === 'TMP-BB-001') as any, [], '2026-10-18')).toBe('Breeding bulls');
  });

  it('is safe to run twice', async () => {
    const p = plan(stock, {}, '2026-10-18')!;
    expect((await apply(p)).created).toBe(25);
    const again = await apply(p);
    expect(again).toEqual({ created: 0, existed: 25 });
    expect(await db.animals.count()).toBe(25);
    const animals = await db.animals.toArray();
    const o = herdOutlook({ animals, milk: [], breeding: [], health: [], weights: [], transactions: [], feeds: [], feed_moves: [], stock }, { sale_weight_kg: 300, default_feeding: 'grazing' }, '2026-10-18');
    expect(o.total).toBe(25);
    expect(o.tagged).toBe(0);
    expect(o.needWeighing).toBeGreaterThan(0);
    expect(outlookAlerts(o).some((a) => a.id === 'ol-tags')).toBe(true);
  });
});
