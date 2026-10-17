import { db, remove, save } from '../db/db';
import type { Animal, BreedingEvent, Feed, FeedMove, HealthRecord, MilkLog, Session, Transaction } from '../db/types';

// Costs entered on health/breeding/animal forms become linked transactions,
// so the money pages and reports have a single source of truth.
async function syncLinked(
  find: (t: Transaction) => boolean,
  want: Omit<Transaction, 'id' | 'created_at' | 'updated_at' | 'deleted' | 'dirty'> | null,
) {
  const existing = (await db.transactions.toArray()).filter((t) => !t.deleted && find(t));
  if (!want || !want.amount) {
    for (const t of existing) await remove('transactions', t.id);
    return;
  }
  const [first, ...rest] = existing;
  await save('transactions', { ...(first || {}), ...want });
  for (const t of rest) await remove('transactions', t.id);
}

// ─── Animals ──────────────────────────────────────────────────

export async function tagInUse(tag: string, exceptId?: string): Promise<boolean> {
  const t = tag.trim().toUpperCase();
  return (await db.animals.toArray()).some((a) => !a.deleted && a.tag.toUpperCase() === t && a.id !== exceptId);
}

export async function saveAnimal(a: Partial<Animal>): Promise<Animal> {
  const rec = await save('animals', { status: 'active', source: 'purchased', sex: 'F', ...a, tag: (a.tag || '').trim().toUpperCase() } as Animal);
  await syncLinked(
    (t) => t.animal_id === rec.id && t.category === 'Animal purchase',
    rec.source === 'purchased' && rec.purchase_price
      ? { date: rec.acquired_on || rec.created_at.slice(0, 10), type: 'expense', category: 'Animal purchase', amount: rec.purchase_price, animal_id: rec.id, notes: `Bought ${rec.tag}`, demo: rec.demo }
      : null,
  );
  return rec;
}

export interface ExitInput { status: 'sold' | 'dead' | 'culled'; date: string; reason?: string; price?: number; buyer?: string }

export async function exitAnimal(a: Animal, x: ExitInput) {
  const rec = await save('animals', { ...a, status: x.status, exit_date: x.date, exit_reason: x.reason, sale_price: x.price, buyer: x.buyer });
  await syncLinked(
    (t) => t.animal_id === a.id && t.category === 'Animal sales',
    (x.status === 'sold' || x.status === 'culled') && x.price
      ? { date: x.date, type: 'income', category: 'Animal sales', amount: x.price, party: x.buyer, animal_id: a.id, notes: `Sold ${a.tag}`, demo: a.demo }
      : null,
  );
  return rec;
}

export async function undoExit(a: Animal) {
  await save('animals', { ...a, status: 'active', exit_date: undefined, exit_reason: undefined, sale_price: undefined, buyer: undefined });
  await syncLinked((t) => t.animal_id === a.id && t.category === 'Animal sales', null);
}

export async function deleteAnimal(a: Animal) {
  // Removes the animal and everything recorded against it.
  const id = a.id;
  for (const m of await db.milk.where('animal_id').equals(id).toArray()) await remove('milk', m.id);
  for (const e of await db.breeding.where('animal_id').equals(id).toArray()) await deleteBreeding(e);
  for (const h of await db.health.where('animal_id').equals(id).toArray()) await deleteHealth(h);
  for (const w of await db.weights.where('animal_id').equals(id).toArray()) await remove('weights', w.id);
  for (const t of (await db.transactions.toArray()).filter((t) => t.animal_id === id)) await remove('transactions', t.id);
  await remove('animals', id);
}

// ─── Milk ─────────────────────────────────────────────────────

/** One value per cow per session per day: re-entering replaces, blank deletes. */
export async function setMilk(animalId: string, date: string, session: Session, litres: number | null, method: MilkLog['method'] = 'measured', notes?: string) {
  const existing = (await db.milk.where('[animal_id+date+session]').equals([animalId, date, session]).toArray()).filter((m) => !m.deleted);
  if (litres == null || !(litres > 0)) {
    for (const m of existing) await remove('milk', m.id);
    return;
  }
  const [first, ...rest] = existing;
  await save('milk', { ...(first || {}), animal_id: animalId, date, session, litres: Math.round(litres * 10) / 10, method, notes: notes ?? first?.notes });
  for (const m of rest) await remove('milk', m.id);
}

// ─── Health ───────────────────────────────────────────────────

export async function saveHealth(h: Partial<HealthRecord>): Promise<HealthRecord> {
  const rec = await save('health', h as HealthRecord);
  await syncLinked(
    (t) => t.health_id === rec.id,
    rec.cost ? { date: rec.date, type: 'expense', category: 'Veterinary & drugs', amount: rec.cost, health_id: rec.id, animal_id: rec.animal_id, party: rec.vet, notes: rec.condition, demo: rec.demo } : null,
  );
  return rec;
}

export async function deleteHealth(h: HealthRecord) {
  await syncLinked((t) => t.health_id === h.id, null);
  await remove('health', h.id);
}

// ─── Breeding ─────────────────────────────────────────────────

export async function saveBreeding(e: Partial<BreedingEvent>): Promise<BreedingEvent> {
  const rec = await save('breeding', e as BreedingEvent);
  await syncLinked(
    (t) => t.breeding_id === rec.id,
    rec.cost ? { date: rec.date, type: 'expense', category: 'Breeding / AI', amount: rec.cost, breeding_id: rec.id, animal_id: rec.animal_id, party: rec.technician, notes: rec.sire ? `Service: ${rec.sire}` : 'Service', demo: rec.demo } : null,
  );
  return rec;
}

export async function deleteBreeding(e: BreedingEvent) {
  await syncLinked((t) => t.breeding_id === e.id, null);
  await remove('breeding', e.id);
}

export interface CalfInput { tag: string; name?: string; sex: 'F' | 'M' }

export async function recordCalving(dam: Animal, input: {
  date: string; calves: CalfInput[]; ease: BreedingEvent['calving_ease']; sire?: string; notes?: string; demo?: boolean;
}) {
  const calfIds: string[] = [];
  for (const c of input.calves) {
    const calf = await saveAnimal({
      tag: c.tag, name: c.name, sex: c.sex, breed: dam.breed, dob: input.date, source: 'born',
      dam_id: dam.id, sire: input.sire, status: 'active', demo: input.demo,
    });
    calfIds.push(calf.id);
  }
  return saveBreeding({ animal_id: dam.id, date: input.date, type: 'calving', calf_ids: calfIds, calving_ease: input.ease, sire: input.sire, notes: input.notes, demo: input.demo });
}

/** Suggest the next free tag with the same prefix, e.g. COW-014 → COW-015. */
export function nextTag(tags: string[], prefix = 'CALF-'): string {
  let max = 0;
  const re = new RegExp('^' + prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '(\\d+)$', 'i');
  for (const t of tags) { const m = t.match(re); if (m) max = Math.max(max, Number(m[1])); }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// ─── Feed ─────────────────────────────────────────────────────


export async function saveFeed(f: Partial<Feed>): Promise<Feed> {
  return save('feeds', { ...f, name: (f.name || '').trim(), unit: (f.unit || 'kg').trim() } as Feed);
}

export async function saveFeedMove(m: Partial<FeedMove>, feedName?: string): Promise<FeedMove> {
  const rec = await save('feed_moves', m as FeedMove);
  await syncLinked(
    (t) => t.feed_move_id === rec.id,
    rec.type === 'in' && rec.cost
      ? { date: rec.date, type: 'expense', category: 'Feed & supplements', amount: rec.cost, feed_move_id: rec.id, party: rec.supplier, notes: feedName ? `${feedName}: ${rec.qty}` : undefined, demo: rec.demo }
      : null,
  );
  return rec;
}

export async function deleteFeedMove(m: FeedMove) {
  await syncLinked((t) => t.feed_move_id === m.id, null);
  await remove('feed_moves', m.id);
}

export async function deleteFeed(f: Feed) {
  for (const m of await db.feed_moves.where('feed_id').equals(f.id).toArray()) if (!m.deleted) await deleteFeedMove(m);
  await remove('feeds', f.id);
}

/** One "used" entry per feed per day: re-entering replaces it, blank removes it. */
export async function setFeedUsed(feedId: string, date: string, qty: number | null) {
  const existing = (await db.feed_moves.where('feed_id').equals(feedId).toArray()).filter((m) => !m.deleted && m.type === 'out' && m.date === date);
  if (qty == null || !(qty > 0)) { for (const m of existing) await remove('feed_moves', m.id); return; }
  const [first, ...rest] = existing;
  await save('feed_moves', { ...(first || {}), feed_id: feedId, date, type: 'out', qty } as FeedMove);
  for (const m of rest) await remove('feed_moves', m.id);
}
