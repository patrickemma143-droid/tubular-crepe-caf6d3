import Dexie from 'dexie';
import { db } from '../db/db';
import { getSettings, updateSettings } from '../db/settings';
import { TABLES } from '../db/types';
import { stopSync } from './sync';
import { allFarmKeys, listFarms, loadFarm, mergeIntoFarm, switchFarm } from './farms';
import { activeFarmKey } from '../db/db';

function save(name: string, out: unknown) {
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** One file with every farm on this device. */
export async function downloadAllFarms() {
  const farms = [];
  for (const f of await listFarms()) {
    const { farm, settings: s } = await loadFarm(f.key);
    const tables: any = {};
    for (const t of TABLES) tables[t] = ((farm as any)[t] || []).filter((r: any) => !r.demo);
    farms.push({ key: f.key, settings: { farm_name: s.farm_name, manager_name: s.manager_name, currency: s.currency, milk_price: s.milk_price, default_breed: s.default_breed, default_feeding: s.default_feeding, sale_weight_kg: s.sale_weight_kg }, ...tables });
  }
  save(`FarmOS_all-farms_${new Date().toISOString().slice(0, 10)}.json`, { app: 'FarmOS', version: 2, kind: 'farms', exported_at: new Date().toISOString(), farms });
}

export interface RestoreResult { records: number; farms: string[]; open?: string }

export async function downloadBackup() {
  const s = await getSettings();
  const out: any = { app: 'FarmOS', version: 2, exported_at: new Date().toISOString(), settings: { farm_name: s.farm_name, manager_name: s.manager_name, currency: s.currency, milk_price: s.milk_price, reminders: s.reminders } };
  for (const t of TABLES) out[t] = (await (db as any)[t].toArray()).filter((r: any) => !r.demo);
  save(`${(s.farm_name || 'FarmOS').replace(/[^\w]+/g, '-')}_backup_${new Date().toISOString().slice(0, 10)}.json`, out);
}

/**
 * Merge a backup: a record is replaced only if the backup copy is newer.
 * A multi-farm file ({kind:'farms'}) adds each farm to this device as its own farm.
 */
export async function restoreBackup(file: File): Promise<RestoreResult> {
  let data: any;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('This file is not a FarmOS backup.'); }
  if (data.app !== 'FarmOS') throw new Error('This file is not a FarmOS backup.');
  if (data.kind === 'farms') {
    let records = 0; const names: string[] = [];
    for (const f of data.farms || []) {
      records += await mergeIntoFarm(f.key, f, f.settings);
      names.push(f.settings?.farm_name || f.key);
    }
    // If this device only had an empty starter farm, open the first imported farm
    const here = (await listFarms()).find((x) => x.active);
    const open = here && !here.records && data.farms?.[0] && data.farms[0].key !== activeFarmKey() ? data.farms[0].key : undefined;
    return { records, farms: names, open };
  }
  let n = 0;
  for (const t of TABLES) {
    const tbl = (db as any)[t];
    for (const r of data[t] || []) {
      const cur = await tbl.get(r.id);
      if (!cur || r.updated_at > cur.updated_at) { await tbl.put({ ...r, dirty: 1 }); n++; }
    }
  }
  const s = await getSettings();
  if ((!s.farm_name || !s.onboarded) && data.settings) await updateSettings({ ...data.settings, onboarded: true });
  return { records: n, farms: [] };
}

export { switchFarm };

/** Deletes everything stored on this phone. Cloud copies are not touched. */
export async function eraseThisDevice() {
  // Stop sync and ignore reads from screens still open, then delete
  stopSync();
  (window as any).__farmosErasing = true;
  db.close();
  for (const k of await allFarmKeys()) await Dexie.delete(k);
  try { localStorage.clear(); } catch { /* ignore */ }
  location.reload();
}
