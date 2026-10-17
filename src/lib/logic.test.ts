import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../db/db';
import { loadDemo } from '../db/demo';
import { addDays, todayISO, toISODate, startOfWeek, endOfMonth } from './dates';
import { alerts, repro, estimateShares, distribute, milkingCows, needsAttention, type Farm } from './herd';
import { buildReport, monthPeriod, weekPeriod } from './report';
import { setMilk, recordCalving, exitAnimal, saveHealth, deleteHealth } from './actions';

async function farm(): Promise<Farm> {
  const f = async (t: any) => (await t.toArray()).filter((r: any) => !r.deleted);
  return { animals: await f(db.animals), milk: await f(db.milk), breeding: await f(db.breeding), health: await f(db.health), weights: await f(db.weights), transactions: await f(db.transactions), feeds: await f(db.feeds), feed_moves: await f(db.feed_moves), stock: await f(db.stock) };
}

describe('dates', () => {
  it('uses the local calendar day', () => {
    const d = new Date(2026, 9, 17, 1, 30); // 01:30 local
    expect(toISODate(d)).toBe('2026-10-17');
  });
  it('weeks start Monday; month ends', () => {
    expect(startOfWeek('2026-10-17')).toBe('2026-10-12');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });
});

describe('demo farm logic', () => {
  beforeAll(async () => { await db.delete(); await db.open(); await loadDemo(); });

  it('derives reproductive status', async () => {
    const F = await farm();
    const byTag = (t: string) => F.animals.find((a) => a.tag === t)!;
    expect(repro(byTag('KF-001'), F.breeding, F.milk).state).toBe('pregnant');
    expect(repro(byTag('KF-002'), F.breeding, F.milk).state).toBe('served');
    expect(repro(byTag('KF-004'), F.breeding, F.milk).dry).toBe(true);
    expect(repro(byTag('KF-004'), F.breeding, F.milk).dueDate).toBe(addDays(todayISO(), 12));
    expect(milkingCows(F).length).toBe(6);
  });

  it('raises the expected alerts', async () => {
    const F = await farm();
    const a = alerts(F, todayISO(), 20);
    const ids = a.map((x) => x.id.split('-')[0]);
    for (const k of ['tx', 'wd', 'due', 'calve', 'dry', 'heat', 'open', 'drop', 'pm']) expect(ids).toContain(k);
    expect(needsAttention(F).size).toBe(2); // mastitis + overdue calf deworming
  });

  it('herd total distribution sums exactly', async () => {
    const F = await farm();
    const cows = milkingCows(F);
    const shares = estimateShares(cows, F, todayISO(), 'PM');
    const parts = distribute(57.3, shares);
    expect(parts.reduce((s, v) => s + v, 0)).toBeCloseTo(57.3, 5);
    const sick = shares.findIndex((s) => s.sick);
    expect(sick).toBeGreaterThanOrEqual(0);
  });

  it('milk entry replaces instead of duplicating', async () => {
    const F = await farm();
    const cow = milkingCows(F)[0];
    const d = todayISO();
    await setMilk(cow.id, d, 'PM', 6);
    await setMilk(cow.id, d, 'PM', 7.5);
    let rows = (await farm()).milk.filter((m) => m.animal_id === cow.id && m.date === d && m.session === 'PM');
    expect(rows.length).toBe(1); expect(rows[0].litres).toBe(7.5);
    await setMilk(cow.id, d, 'PM', null);
    rows = (await farm()).milk.filter((m) => m.animal_id === cow.id && m.date === d && m.session === 'PM');
    expect(rows.length).toBe(0);
  });

  it('report herd movement balances and money is not double counted', async () => {
    let F = await farm();
    const dam = F.animals.find((a) => a.tag === 'KF-004')!;
    await recordCalving(dam, { date: todayISO(), calves: [{ tag: 'CALF-030', sex: 'F' }], ease: 'normal' });
    const bull = F.animals.find((a) => a.tag === 'KB-001')!;
    await exitAnimal(bull, { status: 'sold', date: todayISO(), price: 2_000_000, buyer: 'Mukasa' });
    const h = await saveHealth({ animal_id: dam.id, date: todayISO(), kind: 'treatment', condition: 'Retained placenta', cost: 50_000, status: 'open' });
    F = await farm();
    const r = buildReport(F, monthPeriod(todayISO()));
    const h1 = r.herd;
    expect(h1.opening + h1.births.length + h1.purchases.length - h1.sold.length - h1.died.length - h1.culled.length).toBe(h1.closing);
    expect(h1.births.some((a) => a.tag === 'CALF-030')).toBe(true);
    expect(h1.sold.some((a) => a.tag === 'KB-001')).toBe(true);
    expect(r.breeding.calvings).toBeGreaterThanOrEqual(1);
    const vet = r.money.expenseBy.find(([c]) => c === 'Veterinary & drugs')![1];
    await deleteHealth(h);
    const r2 = buildReport(await farm(), monthPeriod(todayISO()));
    expect(r2.money.expenseBy.find(([c]) => c === 'Veterinary & drugs')?.[1] ?? 0).toBe(vet - 50_000);
    expect(repro(F.animals.find((a) => a.tag === 'KF-004')!, F.breeding, F.milk).milking).toBe(true);
    const w = buildReport(F, weekPeriod(todayISO()));
    expect(w.days).toBe(7);
    expect(w.milk.total).toBeGreaterThan(0);
  });
});

import { feedStatus, stockOn } from './feed';
import { saveFeed, saveFeedMove, setFeedUsed, deleteFeedMove } from './actions';

describe('feed stock', () => {
  it('sample farm feed levels', async () => {
    await db.delete(); await db.open(); await loadDemo();
    const F = await farm();
    const st = feedStatus(F.feeds, F.feed_moves);
    console.log(st.map((s) => `${s.feed.name}: ${s.stock} ${s.feed.unit}, ${s.perDay.toFixed(1)}/day, ${s.daysLeft?.toFixed(1)} days, low=${s.low}`).join(' | '));
    expect(st.length).toBe(3);
  });
  it('counts reset, purchases add, use subtracts, expense linked', async () => {
    const f = await saveFeed({ name: 'Test hay', unit: 'bale', daily_ration: 2, low_level: 5 });
    const d = todayISO();
    await saveFeedMove({ feed_id: f.id, date: addDays(d, -5), type: 'count', qty: 10 });
    const buy = await saveFeedMove({ feed_id: f.id, date: addDays(d, -4), type: 'in', qty: 20, cost: 100_000 }, 'Test hay');
    for (let i = 4; i >= 1; i--) await setFeedUsed(f.id, addDays(d, -i), 3);
    await setFeedUsed(f.id, addDays(d, -1), 4); // correction replaces, not adds
    let F = await farm();
    expect(stockOn(f.id, F.feed_moves)).toBe(10 + 20 - 3 * 3 - 4);
    expect(F.transactions.filter((t) => t.feed_move_id === buy.id).map((t) => t.amount)).toEqual([100_000]);
    await saveFeedMove({ feed_id: f.id, date: d, type: 'count', qty: 4 });
    F = await farm();
    const s = feedStatus(F.feeds, F.feed_moves).find((x) => x.feed.id === f.id)!;
    expect(s.stock).toBe(4); expect(s.low).toBe(true);
    expect(alerts(F, d, 10).some((a) => a.id === 'feed-' + f.id)).toBe(true);
    await deleteFeedMove(F.feed_moves.find((m) => m.id === buy.id)!);
    F = await farm();
    expect(F.transactions.some((t) => t.feed_move_id === buy.id)).toBe(false);
    const rep = buildReport(F, monthPeriod(d));
    expect(rep.feed.items.some((x) => x.feed.id === f.id)).toBe(true);
  });
});
