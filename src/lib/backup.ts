import Dexie from 'dexie';
import { db } from '../db/db';
import { getSettings, updateSettings } from '../db/settings';
import { TABLES } from '../db/types';
import { stopSync } from './sync';

export async function downloadBackup() {
  const s = await getSettings();
  const out: any = { app: 'FarmOS', version: 2, exported_at: new Date().toISOString(), settings: { farm_name: s.farm_name, manager_name: s.manager_name, currency: s.currency, milk_price: s.milk_price, reminders: s.reminders } };
  for (const t of TABLES) out[t] = (await (db as any)[t].toArray()).filter((r: any) => !r.demo);
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(s.farm_name || 'FarmOS').replace(/[^\w]+/g, '-')}_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Merge a backup: a record is replaced only if the backup copy is newer. */
export async function restoreBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text());
  if (data.app !== 'FarmOS') throw new Error('This file is not a FarmOS backup.');
  let n = 0;
  for (const t of TABLES) {
    const tbl = (db as any)[t];
    for (const r of data[t] || []) {
      const cur = await tbl.get(r.id);
      if (!cur || r.updated_at > cur.updated_at) { await tbl.put({ ...r, dirty: 1 }); n++; }
    }
  }
  const s = await getSettings();
  if (!s.farm_name && data.settings) await updateSettings({ ...data.settings });
  return n;
}

/** Deletes everything stored on this phone. Cloud copies are not touched. */
export async function eraseThisDevice() {
  // Stop sync and ignore reads from screens still open, then delete
  stopSync();
  (window as any).__farmosErasing = true;
  db.close();
  await Dexie.delete('farmos');
  try { localStorage.clear(); } catch { /* ignore */ }
  location.reload();
}
