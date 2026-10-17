import { useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, onChange } from '../db/db';
import { getSettings, updateSettings } from '../db/settings';
import { TABLES, type TableName } from '../db/types';

// Per-record, offline-first sync.
//  • Every local change marks the record dirty; deletes are tombstones.
//  • Push: dirty records are upserted to `farm_records`. A database trigger
//    refuses to overwrite a row with an older `updated_at`, so the newest edit wins
//    per record — two phones never wipe each other's work.
//  • Pull: rows changed on the server since our last pull (by server clock).

export type SyncTone = 'ok' | 'warn' | 'off';
interface Status { tone: SyncTone; label: string; detail: string; busy: boolean; pending: number }

let status: Status = { tone: 'warn', label: 'On this device', detail: 'Cloud backup is not set up. Records are saved on this device only.', busy: false, pending: 0 };
const subs = new Set<() => void>();
function set(s: Partial<Status>) { status = { ...status, ...s }; subs.forEach((f) => f()); }
export function useSyncStatus(): Status {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => status);
}

let client: SupabaseClient | null = null;
let clientKey = '';
export async function getClient(): Promise<SupabaseClient | null> {
  const s = await getSettings();
  if (!s.supabase_url || !s.supabase_key) return null;
  const key = s.supabase_url + '|' + s.supabase_key;
  if (!client || key !== clientKey) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(s.supabase_url, s.supabase_key, { auth: { persistSession: true, storageKey: 'farmos-auth' } });
    clientKey = key;
  }
  return client;
}
export function resetClient() { client = null; clientKey = ''; }

export async function countPending(): Promise<number> {
  const role = (await getSettings()).farm_role;
  let n = 0;
  for (const t of TABLES) {
    if (t === 'transactions' && role === 'worker') continue; // kept on this phone only
    n += await (db as any)[t].where('dirty').equals(1).filter((r: any) => !r.demo).count();
  }
  return n;
}

let running = false;
let again = false;
let stopped = false;
/** Used before erasing the phone so nothing touches the database mid-delete. */
export function stopSync() { stopped = true; }

export async function syncNow(): Promise<void> {
  if (stopped) return;
  if (running) { again = true; return; }
  running = true;
  try {
    const pending = await countPending();
    const s = await getSettings();
    const sb = await getClient();
    if (!sb) return set({ tone: 'warn', label: 'On this device', detail: 'Cloud backup is not set up. Records are saved on this device only.', pending });
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) return s.farm_id
      ? set({ tone: 'warn', label: 'Signed out', detail: 'Sign in under Settings to back up and share records.', pending })
      : set({ tone: 'warn', label: 'On this device', detail: 'Records are saved on this device. Download a backup from Settings now and then, or sign in to back up to the cloud.', pending });
    if (!s.farm_id) return set({ tone: 'warn', label: 'No farm', detail: 'Create or join a farm under Settings.', pending });
    if (!navigator.onLine) return set({ tone: 'off', label: pending ? `${pending} waiting` : 'Offline', detail: 'No internet. Records are saved and will upload when you are back online.', pending });

    set({ busy: true, label: 'Syncing…', pending });

    // Push
    for (const t of TABLES as readonly TableName[]) {
      if (t === 'transactions' && s.farm_role === 'worker') continue; // farm hands can't upload money records
      const tbl = (db as any)[t];
      const dirty = (await tbl.where('dirty').equals(1).toArray()).filter((r: any) => !r.demo);
      for (let i = 0; i < dirty.length; i += 200) {
        const chunk = dirty.slice(i, i + 200);
        const rows = chunk.map(({ dirty: _d, ...data }: any) => ({ farm_id: s.farm_id, tbl: t, id: data.id, data, updated_at: data.updated_at, deleted: !!data.deleted }));
        const { error } = await sb.from('farm_records').upsert(rows, { onConflict: 'farm_id,tbl,id' });
        if (error) throw error;
        // Clear the flag only if the record hasn't changed again meanwhile
        await db.transaction('rw', tbl, async () => {
          for (const r of chunk) {
            const cur = await tbl.get(r.id);
            if (cur && cur.updated_at === r.updated_at) await tbl.update(r.id, { dirty: 0 });
          }
        });
      }
    }

    // Pull
    let since = s.last_pull || '1970-01-01T00:00:00Z';
    for (;;) {
      const { data, error } = await sb.from('farm_records').select('tbl,id,data,updated_at,deleted,server_updated_at')
        .eq('farm_id', s.farm_id).gt('server_updated_at', since).order('server_updated_at').limit(1000);
      if (error) throw error;
      if (!data?.length) break;
      for (const row of data) {
        const tbl = (db as any)[row.tbl];
        if (!tbl) continue;
        const local = await tbl.get(row.id);
        if (!local || !local.dirty || row.updated_at >= local.updated_at) {
          await tbl.put({ ...row.data, deleted: row.deleted ? 1 : 0, dirty: 0 });
        }
      }
      since = data[data.length - 1].server_updated_at;
      if (data.length < 1000) break;
    }
    const now = new Date().toISOString();
    await updateSettings({ last_pull: since, last_sync_at: now });
    set({ tone: 'ok', label: 'Backed up', detail: `Last synced ${new Date(now).toLocaleString()}`, busy: false, pending: await countPending() });
  } catch (e: any) {
    set({ tone: 'off', label: 'Sync failed', detail: (e?.message || String(e)) + ' — your records are safe on this phone. Will retry.', busy: false });
  } finally {
    running = false;
    if (again) { again = false; setTimeout(syncNow, 500); }
  }
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  let t: any;
  onChange(() => { clearTimeout(t); t = setTimeout(syncNow, 3000); });
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => syncNow());
  setInterval(syncNow, 60_000);
  setTimeout(syncNow, 800);
}
