import { db } from '../db/db';
import { getSettings, updateSettings } from '../db/settings';
import { TABLES } from '../db/types';
import { countPending, getClient, resetClient, syncNow } from './sync';

export interface FarmMembership { farm_id: string; role: 'owner' | 'manager' | 'worker'; name: string }
export interface Member { user_id: string | null; email: string; role: string; pending?: boolean }

async function sb() {
  const c = await getClient();
  if (!c) throw new Error('Enter your Supabase project URL and key first.');
  return c;
}

export async function currentUser() {
  const c = await getClient();
  if (!c) return null;
  const { data } = await c.auth.getUser();
  return data.user;
}

export async function signIn(email: string, password: string) {
  const c = await sb();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await updateSettings({ user_email: email });
  await c.rpc('accept_invites');
}

export async function signUp(email: string, password: string) {
  const c = await sb();
  const { data, error } = await c.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) return 'confirm' as const; // email confirmation is on
  await updateSettings({ user_email: email });
  await c.rpc('accept_invites');
  return 'ok' as const;
}

export async function signOut() {
  const c = await getClient();
  await c?.auth.signOut();
  await updateSettings({ farm_id: undefined, farm_role: undefined, user_email: undefined, last_pull: undefined });
  await syncNow();
}

export async function myFarms(): Promise<FarmMembership[]> {
  const c = await sb();
  await c.rpc('accept_invites');
  const { data: u } = await c.auth.getUser();
  if (!u.user) return [];
  // Only this person's own memberships (RLS also lets members see teammates' rows)
  const { data, error } = await c.from('farm_members').select('farm_id, role, farms(name)').eq('user_id', u.user.id);
  if (error) throw error;
  return (data || []).map((r: any) => ({ farm_id: r.farm_id, role: r.role, name: r.farms?.name || 'Farm' }));
}

export async function createFarm(name: string): Promise<string> {
  const c = await sb();
  const { data, error } = await c.rpc('create_farm', { farm_name: name });
  if (error) throw error;
  return data as string;
}

/**
 * Link this phone to a farm.
 * First link: records already on the phone are uploaded to the chosen farm.
 * Switching from one farm to another: the phone must be fully uploaded first,
 * then it is cleared and filled with the other farm's records — one farm's
 * records never leak into another.
 */
export async function useFarmAccount(farmId: string, role: FarmMembership['role'], farmName?: string) {
  const s = await getSettings();
  if (s.farm_id === farmId) return;
  if (!s.farm_id) {
    for (const t of TABLES) {
      const tbl = (db as any)[t];
      await tbl.toCollection().modify((r: any) => { if (!r.demo) r.dirty = 1; });
    }
  } else {
    await syncNow();
    const left = await countPending();
    if (left > 0) throw new Error(`${left} changes on this phone haven't uploaded to ${s.farm_name || 'the current farm'} yet. Connect to the internet, tap Sync now, then switch.`);
    await db.transaction('rw', TABLES.map((t) => (db as any)[t]), async () => { for (const t of TABLES) await (db as any)[t].clear(); });
  }
  await updateSettings({ farm_id: farmId, farm_role: role, last_pull: undefined, ...(farmName ? { farm_name: farmName } : {}) });
  await syncNow();
}

export async function members(farmId: string): Promise<Member[]> {
  const c = await sb();
  const [{ data: m }, { data: inv }] = await Promise.all([
    c.from('farm_members').select('user_id, email, role').eq('farm_id', farmId),
    c.from('farm_invites').select('email, role').eq('farm_id', farmId),
  ]);
  return [...(m || []), ...(inv || []).map((i: any) => ({ user_id: null, email: i.email, role: i.role, pending: true }))];
}

export async function invite(farmId: string, email: string, role: 'manager' | 'worker') {
  const c = await sb();
  const { error } = await c.from('farm_invites').upsert({ farm_id: farmId, email: email.trim().toLowerCase(), role }, { onConflict: 'farm_id,email' });
  if (error) throw error;
}

export async function setCloudConfig(url: string, key: string) {
  await updateSettings({ supabase_url: url.trim().replace(/\/$/, ''), supabase_key: key.trim() });
  resetClient();
  await syncNow();
}
