import Dexie, { type Table } from 'dexie';
import type {
  Animal, MilkLog, BreedingEvent, HealthRecord, WeightRecord, Transaction, Settings, TableName, Base, Feed, FeedMove, StockMonth,
} from './types';

class FarmDB extends Dexie {
  animals!: Table<Animal, string>;
  milk!: Table<MilkLog, string>;
  breeding!: Table<BreedingEvent, string>;
  health!: Table<HealthRecord, string>;
  weights!: Table<WeightRecord, string>;
  transactions!: Table<Transaction, string>;
  feeds!: Table<Feed, string>;
  feed_moves!: Table<FeedMove, string>;
  stock!: Table<StockMonth, string>;
  meta!: Table<Settings, string>;

  constructor() {
    super('farmos');
    this.version(1).stores({
      animals: 'id, tag, status, dirty, deleted',
      milk: 'id, animal_id, date, [animal_id+date+session], dirty, deleted',
      breeding: 'id, animal_id, date, type, dirty, deleted',
      health: 'id, animal_id, date, status, dirty, deleted',
      weights: 'id, animal_id, date, dirty, deleted',
      transactions: 'id, date, type, health_id, breeding_id, animal_id, dirty, deleted',
      meta: 'id',
    });
    this.version(2).stores({
      feeds: 'id, dirty, deleted',
      feed_moves: 'id, feed_id, date, dirty, deleted',
      transactions: 'id, date, type, health_id, breeding_id, feed_move_id, animal_id, dirty, deleted',
    });
    this.version(3).stores({ stock: 'id, month, cls, dirty, deleted' });
  }
}

export const db = new FarmDB();

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function table(name: TableName): Table<any, string> {
  return (db as any)[name];
}

/** Insert or update a record, stamping timestamps and marking it for upload. */
export async function save<T extends Partial<Base>>(name: TableName, rec: T): Promise<T & Base> {
  const now = nowISO();
  const full = {
    ...rec,
    id: rec.id || uid(),
    created_at: rec.created_at || now,
    updated_at: now,
    deleted: 0,
    dirty: 1,
  } as T & Base;
  await table(name).put(full);
  notifyChange();
  return full;
}

/** Insert many new records in one transaction (bulk set-up). */
export async function saveMany<T extends Partial<Base>>(name: TableName, recs: T[]): Promise<number> {
  if (!recs.length) return 0;
  const now = nowISO();
  await table(name).bulkPut(recs.map((r) => ({ ...r, id: r.id || uid(), created_at: r.created_at || now, updated_at: now, deleted: 0, dirty: 1 })));
  notifyChange();
  return recs.length;
}

/** Soft delete: kept as a tombstone so the deletion reaches other phones. */
export async function remove(name: TableName, id: string): Promise<void> {
  const t = table(name);
  const rec = await t.get(id);
  if (!rec) return;
  await t.put({ ...rec, deleted: 1, dirty: 1, updated_at: nowISO() });
  notifyChange();
}

export async function all<T>(name: TableName): Promise<T[]> {
  return (await table(name).toArray()).filter((r: Base) => !r.deleted) as T[];
}

// A tiny change bus so the sync engine can push soon after an edit.
type Listener = () => void;
const listeners = new Set<Listener>();
export function onChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notifyChange() {
  listeners.forEach((fn) => fn());
}
