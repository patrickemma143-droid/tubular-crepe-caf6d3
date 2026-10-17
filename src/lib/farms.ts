import Dexie from 'dexie';
import { ACTIVE_KEY, FarmDB, activeFarmKey, db } from '../db/db';
import { DEFAULT_SETTINGS, withCloud } from '../db/settings';
import { TABLES, type Settings } from '../db/types';
import type { Farm } from './herd';

// Several farms on one device, no sign-in needed. Each farm is its own
// database; the farm switcher just changes which one the app opens.

export interface LocalFarm { key: string; name: string; active: boolean; records: number }

const isFarmDb = (n: string) => n === 'farmos' || n.startsWith('farmos-');

async function withFarm<T>(key: string, fn: (d: FarmDB) => Promise<T>): Promise<T> {
  if (key === activeFarmKey()) return fn(db);
  const d = new FarmDB(key);
  try { await d.open(); return await fn(d); } finally { d.close(); }
}

export async function listFarms(): Promise<LocalFarm[]> {
  const names = (await Dexie.getDatabaseNames()).filter(isFarmDb);
  const active = activeFarmKey();
  if (!names.includes(active)) names.push(active);
  const out: LocalFarm[] = [];
  for (const key of names) {
    const info = await withFarm(key, async (d) => {
      const s = await d.meta.get('settings');
      let records = 0;
      for (const t of ['animals', 'milk', 'stock', 'transactions'] as const) records += await (d as any)[t].count();
      return { name: s?.farm_name || '', onboarded: !!s?.onboarded, records };
    }).catch(() => null);
    if (!info) continue;
    // an untouched default database (never set up, nothing in it) isn't a farm
    if (!info.onboarded && !info.records && key !== active) continue;
    out.push({ key, name: info.name || 'Unnamed farm', active: key === active, records: info.records });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function switchFarm(key: string) {
  try { localStorage.setItem(ACTIVE_KEY, key); } catch { /* private mode: stays on this farm */ }
  location.hash = '#/';
  location.reload();
}

export const farmKeyFor = (name: string) => 'farmos-' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'farm');

export async function addFarm(name: string, base?: Partial<Settings>): Promise<string> {
  const existing = (await Dexie.getDatabaseNames()).filter(isFarmDb);
  let key = farmKeyFor(name), n = 2;
  while (existing.includes(key)) key = `${farmKeyFor(name)}-${n++}`;
  await withFarm(key, async (d) => {
    await d.meta.put({ ...DEFAULT_SETTINGS, ...(base || {}), id: 'settings', farm_name: name.trim(), onboarded: true, farm_id: undefined, farm_role: undefined, last_pull: undefined });
  });
  return key;
}

export async function renameFarm(key: string, name: string) {
  await withFarm(key, async (d) => {
    const s = await d.meta.get('settings');
    await d.meta.put({ ...DEFAULT_SETTINGS, ...(s || {}), id: 'settings', farm_name: name.trim() });
  });
}

/** Removes a farm from this device (not the open one). */
export async function removeFarm(key: string) {
  if (key === activeFarmKey()) throw new Error('Switch to another farm before removing this one.');
  await Dexie.delete(key);
}

/** All live records of a farm, for comparing farms side by side. */
export async function loadFarm(key: string): Promise<{ farm: Farm; settings: Settings }> {
  return withFarm(key, async (d) => {
    const get = async (t: string) => ((await (d as any)[t].toArray()) as any[]).filter((r) => !r.deleted);
    const farm: any = {};
    for (const t of TABLES) farm[t] = await get(t);
    const s = withCloud({ ...DEFAULT_SETTINGS, ...((await d.meta.get('settings')) || {}) });
    return { farm: farm as Farm, settings: s };
  });
}

/** Write records into a farm (creating it if needed); newer copies win. Returns records added or updated. */
export async function mergeIntoFarm(key: string, data: Record<string, any[]>, settings?: Partial<Settings>): Promise<number> {
  return withFarm(key, async (d) => {
    let n = 0;
    for (const t of TABLES) {
      const rows = data[t] || [];
      if (!rows.length) continue;
      const tbl = (d as any)[t];
      const cur = new Map(((await tbl.bulkGet(rows.map((r) => r.id))) as any[]).filter(Boolean).map((r) => [r.id, r]));
      const fresh = rows.filter((r) => { const c = cur.get(r.id); return !c || r.updated_at > c.updated_at; }).map((r) => ({ ...r, deleted: r.deleted ? 1 : 0, dirty: 1 }));
      await tbl.bulkPut(fresh);
      n += fresh.length;
    }
    const s = await d.meta.get('settings');
    if (!s?.onboarded || !s.farm_name) await d.meta.put({ ...DEFAULT_SETTINGS, ...(s || {}), ...(settings || {}), id: 'settings', onboarded: true });
    return n;
  });
}

/** Every farm database on this device (used when erasing). */
export async function allFarmKeys(): Promise<string[]> {
  return (await Dexie.getDatabaseNames()).filter(isFarmDb);
}
