import { db, uid } from './db';
import type { Animal, BreedingEvent, Feed, FeedMove, HealthRecord, MilkLog, Transaction, WeightRecord, TableName } from './types';
import { addDays, todayISO } from '../lib/dates';
import { TABLES } from './types';

// A small Ugandan dairy farm, realistic enough to explore every screen.
// Demo records are flagged `demo` and never uploaded by sync.

function rng(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

export async function loadDemo() {
  const t = todayISO();
  const now = new Date().toISOString();
  const base = { created_at: now, updated_at: now, deleted: 0 as const, dirty: 0 as const, demo: true };
  const r = rng(42);
  const A = (p: Partial<Animal>): Animal => ({ ...base, id: uid(), tag: '', sex: 'F', source: 'purchased', status: 'active', ...p });

  const cows = [
    A({ tag: 'KF-001', name: 'Nakato', breed: 'Friesian', dob: addDays(t, -6 * 365), acquired_on: addDays(t, -4 * 365), purchase_price: 2_800_000 }),
    A({ tag: 'KF-002', name: 'Babirye', breed: 'Friesian', dob: addDays(t, -5 * 365), acquired_on: addDays(t, -4 * 365), purchase_price: 2_800_000 }),
    A({ tag: 'KF-003', name: 'Kisakye', breed: 'Friesian x Ankole', dob: addDays(t, -4 * 365 - 90), acquired_on: addDays(t, -3 * 365) }),
    A({ tag: 'KF-004', name: 'Nankya', breed: 'Jersey', dob: addDays(t, -4 * 365), acquired_on: addDays(t, -2 * 365) }),
    A({ tag: 'KF-005', name: 'Namuli', breed: 'Friesian', dob: addDays(t, -7 * 365), acquired_on: addDays(t, -5 * 365) }),
    A({ tag: 'KF-006', name: 'Achen', breed: 'Jersey x Friesian', dob: addDays(t, -3 * 365 - 200), source: 'born' }),
    A({ tag: 'KF-007', name: 'Mirembe', breed: 'Friesian', dob: addDays(t, -5 * 365 - 40), acquired_on: addDays(t, -3 * 365) }),
  ];
  const heifers = [
    A({ tag: 'KF-011', name: 'Nalule', breed: 'Friesian', dob: addDays(t, -17 * 30), source: 'born', dam_id: cows[0].id }),
    A({ tag: 'KF-012', name: 'Akello', breed: 'Jersey x Friesian', dob: addDays(t, -20 * 30), source: 'born', dam_id: cows[3].id }),
  ];
  const bull = A({ tag: 'KB-001', name: 'Kato', sex: 'M', breed: 'Friesian', dob: addDays(t, -30 * 30), acquired_on: addDays(t, -400), purchase_price: 1_500_000 });
  const calfF = A({ tag: 'CALF-021', name: 'Nabwire', breed: 'Friesian', dob: addDays(t, -70), source: 'born', dam_id: cows[1].id, sire: 'ABS Friesian 7HO' });
  const calfM = A({ tag: 'CALF-022', sex: 'M', breed: 'Friesian x Ankole', dob: addDays(t, -40), source: 'born', dam_id: cows[2].id, sire: 'Kato' });
  const soldCalf = A({ tag: 'CALF-019', sex: 'M', breed: 'Jersey', dob: addDays(t, -160), source: 'born', status: 'sold', exit_date: addDays(t, -25), exit_reason: 'Bull calf sold', sale_price: 450_000, buyer: 'Ssemakula' });
  const animals = [...cows, ...heifers, bull, calfF, calfM, soldCalf];

  // Breeding histories
  const ev: BreedingEvent[] = [];
  const E = (p: Partial<BreedingEvent>) => ev.push({ ...base, id: uid(), animal_id: '', date: t, type: 'heat', ...p } as BreedingEvent);
  // KF-001: calved 150 days ago, served, confirmed pregnant (due in ~200 days)
  E({ animal_id: cows[0].id, date: addDays(t, -150), type: 'calving', calving_ease: 'normal' });
  E({ animal_id: cows[0].id, date: addDays(t, -80), type: 'service', method: 'AI', sire: 'ABS Friesian 7HO', technician: 'NAGRC technician', cost: 35_000 });
  E({ animal_id: cows[0].id, date: addDays(t, -20), type: 'preg_check', result: 'pregnant' });
  // KF-002: calved 70 days ago (calfF), served 20 days ago → watch for heat
  E({ animal_id: cows[1].id, date: addDays(t, -70), type: 'calving', calf_ids: [calfF.id], calving_ease: 'normal' });
  E({ animal_id: cows[1].id, date: addDays(t, -20), type: 'service', method: 'AI', sire: 'ABS Friesian 7HO', cost: 35_000 });
  // KF-003: calved 40 days ago (calfM)
  E({ animal_id: cows[2].id, date: addDays(t, -40), type: 'calving', calf_ids: [calfM.id], calving_ease: 'assisted' });
  // KF-004: due in 12 days, dried off
  E({ animal_id: cows[3].id, date: addDays(t, -600), type: 'calving' });
  E({ animal_id: cows[3].id, date: addDays(t, -271), type: 'service', method: 'natural', sire: 'Kato' });
  E({ animal_id: cows[3].id, date: addDays(t, -210), type: 'preg_check', result: 'pregnant' });
  E({ animal_id: cows[3].id, date: addDays(t, -50), type: 'dry_off' });
  // KF-005: calved 210 days ago, pregnant, due in 45 → dry-off alert
  E({ animal_id: cows[4].id, date: addDays(t, -320), type: 'calving' });
  E({ animal_id: cows[4].id, date: addDays(t, -238), type: 'service', method: 'AI', sire: 'WWS Jersey', cost: 35_000 });
  E({ animal_id: cows[4].id, date: addDays(t, -180), type: 'preg_check', result: 'pregnant' });
  // KF-006: calved 100 days ago, not yet served
  E({ animal_id: cows[5].id, date: addDays(t, -100), type: 'calving' });
  // KF-007: calved 200 days ago, served twice, second confirmed
  E({ animal_id: cows[6].id, date: addDays(t, -200), type: 'calving' });
  E({ animal_id: cows[6].id, date: addDays(t, -130), type: 'service', method: 'AI', cost: 35_000 });
  E({ animal_id: cows[6].id, date: addDays(t, -85), type: 'preg_check', result: 'open' });
  E({ animal_id: cows[6].id, date: addDays(t, -66), type: 'service', method: 'natural', sire: 'Kato' });
  E({ animal_id: cows[6].id, date: addDays(t, -10), type: 'preg_check', result: 'pregnant' });
  // Heifer KF-012 served 30 days ago
  E({ animal_id: heifers[1].id, date: addDays(t, -30), type: 'service', method: 'natural', sire: 'Kato' });

  // Milk: 60 days, two sessions. KF-003 (mastitis) drops over the last 4 days.
  const milking = [
    { a: cows[0], base: 13 }, { a: cows[1], base: 17 }, { a: cows[2], base: 11 },
    { a: cows[4], base: 7 }, { a: cows[5], base: 12 }, { a: cows[6], base: 10 },
  ];
  const milk: MilkLog[] = [];
  for (let i = 60; i >= 0; i--) {
    const d = addDays(t, -i);
    for (const { a, base: b } of milking) {
      const calved = ev.find((e) => e.animal_id === a.id && e.type === 'calving' && e.date <= d);
      if (!calved) continue;
      let day = b * (1 + (r() - 0.5) * 0.12);
      if (a.id === cows[2].id && i <= 4) day *= 0.55;
      if (a.id === cows[4].id) day *= 1 - (60 - i) * 0.003;
      const sessions: ['AM' | 'PM', number][] = [['AM', 0.56], ['PM', 0.44]];
      for (const [s, f] of sessions) {
        if (i === 0 && s === 'PM') continue; // tonight not yet milked
        milk.push({ ...base, id: uid(), animal_id: a.id, date: d, session: s, litres: Math.round(day * f * 10) / 10, method: 'measured' });
      }
    }
  }

  // Health
  const H = (p: Partial<HealthRecord>): HealthRecord => ({ ...base, id: uid(), animal_id: '', date: t, kind: 'treatment', condition: '', status: 'open', ...p });
  const health: HealthRecord[] = [
    H({ animal_id: cows[2].id, date: addDays(t, -3), condition: 'Clinical mastitis (rear left quarter)', medicine: 'Intramammary antibiotic', dose: '1 tube per 12 h × 3', vet: 'Dr. Okello', cost: 45_000, status: 'open', milk_withdrawal_until: addDays(t, 2) }),
    H({ animal_id: cows[6].id, date: addDays(t, -40), condition: 'East Coast Fever', medicine: 'Buparvaquone', vet: 'Dr. Okello', cost: 120_000, status: 'recovered', resolved_on: addDays(t, -33) }),
    ...[...cows, ...heifers, bull].map((a) => H({ animal_id: a.id, date: addDays(t, -175), kind: 'vaccination', condition: 'Foot and mouth disease', status: 'done', next_due: addDays(t, 5) })),
    ...[calfF, calfM].map((a) => H({ animal_id: a.id, date: addDays(t, -95 + (a === calfM ? 30 : 0)), kind: 'deworming', condition: 'Albendazole drench', status: 'done', cost: 3_000, next_due: addDays(t, -5 + (a === calfM ? 30 : 0)) })),
  ];

  const weights: WeightRecord[] = [
    { ...base, id: uid(), animal_id: calfF.id, date: addDays(t, -70), kg: 38 },
    { ...base, id: uid(), animal_id: calfF.id, date: addDays(t, -40), kg: 58 },
    { ...base, id: uid(), animal_id: calfF.id, date: addDays(t, -7), kg: 81 },
    { ...base, id: uid(), animal_id: heifers[0].id, date: addDays(t, -30), kg: 305 },
  ];

  // Money: daily milk sales to the collection centre, monthly costs
  const tx: Transaction[] = [];
  const T = (p: Partial<Transaction>) => tx.push({ ...base, id: uid(), date: t, type: 'expense', category: 'Other', amount: 0, ...p } as Transaction);
  const byDay = new Map<string, number>();
  milk.forEach((m) => byDay.set(m.date, (byDay.get(m.date) || 0) + m.litres));
  for (const [d, l] of byDay) {
    const home = 4; // household use
    const sold = Math.max(0, Math.round(l - home));
    if (sold) T({ date: d, type: 'income', category: 'Milk sales', litres: sold, price_per_litre: 1200, amount: sold * 1200, party: 'Milk collection centre', payment: 'Mobile money' });
  }
  for (const m of [0, 1]) {
    T({ date: addDays(t, -m * 30 - 2), category: 'Labour', amount: 600_000, notes: 'Two farm hands' });
    T({ date: addDays(t, -m * 30 - 12), category: 'Utilities', amount: 45_000, notes: 'Water & power' });
  }
  T({ date: addDays(t, -25), type: 'income', category: 'Animal sales', amount: 450_000, party: 'Ssemakula', animal_id: soldCalf.id, notes: 'Sold CALF-019' });
  // linked costs (same as actions.ts would create)
  ev.filter((e) => e.cost).forEach((e) => T({ date: e.date, category: 'Breeding / AI', amount: e.cost!, breeding_id: e.id, animal_id: e.animal_id }));
  health.filter((h) => h.cost).forEach((h) => T({ date: h.date, category: 'Veterinary & drugs', amount: h.cost!, health_id: h.id, animal_id: h.animal_id, notes: h.condition }));
  animals.filter((a) => a.purchase_price).forEach((a) => T({ date: a.acquired_on!, category: 'Animal purchase', amount: a.purchase_price!, animal_id: a.id, notes: `Bought ${a.tag}` }));

  // Feed store: dairy meal bought in 70 kg bags, napier cut on farm, minerals
  const F = (p: Partial<Feed>): Feed => ({ ...base, id: uid(), name: '', unit: 'kg', ...p });
  const meal = F({ name: 'Dairy meal', unit: 'kg', daily_ration: 22, low_level: 100 });
  const bran = F({ name: 'Maize bran', unit: 'kg', daily_ration: 12, low_level: 60 });
  const mineral = F({ name: 'Mineral lick', unit: 'kg', daily_ration: 0.5, low_level: 2 });
  const feeds = [meal, bran, mineral];
  const fmv: FeedMove[] = [];
  const M = (p: Partial<FeedMove>) => { const m = { ...base, id: uid(), feed_id: '', date: t, type: 'out', qty: 0, ...p } as FeedMove; fmv.push(m); return m; };
  M({ feed_id: meal.id, date: addDays(t, -60), type: 'count', qty: 230, notes: 'Opening stock' });
  M({ feed_id: bran.id, date: addDays(t, -60), type: 'count', qty: 200, notes: 'Opening stock' });
  M({ feed_id: mineral.id, date: addDays(t, -60), type: 'count', qty: 30, notes: 'Opening stock' });
  for (let i = 56; i >= 0; i -= 7) {
    if (i > 3) { const m = M({ feed_id: meal.id, date: addDays(t, -i), type: 'in', qty: 140, cost: 196_000, supplier: 'Agro shop', notes: '2 × 70 kg bags' }); T({ date: m.date, category: 'Feed & supplements', amount: m.cost!, feed_move_id: m.id, party: m.supplier, notes: 'Dairy meal: 140' }); }
  }
  for (const i of [45, 15]) { const m = M({ feed_id: bran.id, date: addDays(t, -i), type: 'in', qty: 300, cost: 210_000, supplier: 'Posho mill' }); T({ date: m.date, category: 'Feed & supplements', amount: m.cost!, feed_move_id: m.id, party: m.supplier, notes: 'Maize bran: 300' }); }
  { const m = M({ feed_id: mineral.id, date: addDays(t, -30), type: 'in', qty: 10, cost: 40_000, supplier: 'Agro shop' }); T({ date: m.date, category: 'Feed & supplements', amount: m.cost!, feed_move_id: m.id, party: m.supplier, notes: 'Mineral lick: 10' }); }
  for (let i = 59; i >= 1; i--) {
    M({ feed_id: meal.id, date: addDays(t, -i), type: 'out', qty: Math.round(20 + r() * 4) });
    M({ feed_id: bran.id, date: addDays(t, -i), type: 'out', qty: Math.round(10 + r() * 4) });
    if (i % 2 === 0) M({ feed_id: mineral.id, date: addDays(t, -i), type: 'out', qty: 1 });
  }

  await db.transaction('rw', [db.animals, db.breeding, db.milk, db.health, db.weights, db.transactions, db.feeds, db.feed_moves], async () => {
    await db.feeds.bulkPut(feeds);
    await db.feed_moves.bulkPut(fmv);
    await db.animals.bulkPut(animals);
    await db.breeding.bulkPut(ev);
    await db.milk.bulkPut(milk);
    await db.health.bulkPut(health);
    await db.weights.bulkPut(weights);
    await db.transactions.bulkPut(tx);
  });
}

export async function hasDemo(): Promise<boolean> {
  return (await db.animals.filter((a) => !!a.demo).count()) > 0;
}

/** Removes only sample records. Your own records are kept. */
export async function removeDemo() {
  for (const name of TABLES as readonly TableName[]) {
    const t = (db as any)[name];
    const ids = (await t.toArray()).filter((r: any) => r.demo).map((r: any) => r.id);
    await t.bulkDelete(ids);
  }
}
