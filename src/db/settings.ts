import { db } from './db';
import type { Settings } from './types';

// The FarmOS cloud (Supabase). The publishable/anon key is meant to be public:
// row-level security in supabase/schema.sql decides who can read what.
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY at build time override these.
const env = (import.meta as any).env || {};
export const BUILTIN_CLOUD = {
  url: env.VITE_SUPABASE_URL || 'https://ivfqigpyjfgxniawchxs.supabase.co',
  key: env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_2KYBKov58ZyCzSN8ms6R0g_rbjHX98o',
};

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  onboarded: false,
  farm_name: '',
  manager_name: '',
  currency: 'UGX',
  milk_price: 1200,
  default_feeding: 'grazing_supplement',
  sale_weight_kg: 300,
  theme: 'system',
  reminders: [
    { id: 'am-milk', label: 'Record morning milking', time: '07:30', enabled: true },
    { id: 'pm-milk', label: 'Record evening milking', time: '18:30', enabled: true },
    { id: 'health', label: 'Walk the herd: check for sick or bulling cows', time: '08:00', enabled: true },
  ],
  supabase_url: BUILTIN_CLOUD.url,
  supabase_key: BUILTIN_CLOUD.key,
};

/** Phones that haven't chosen their own project always use the built-in cloud. */
export function withCloud(s: Settings): Settings {
  return s.supabase_custom ? s : { ...s, supabase_url: BUILTIN_CLOUD.url, supabase_key: BUILTIN_CLOUD.key };
}

export async function getSettings(): Promise<Settings> {
  const s = await db.meta.get('settings');
  return withCloud({ ...DEFAULT_SETTINGS, ...(s || {}) });
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch, id: 'settings' as const };
  await db.meta.put(next);
  return next;
}
