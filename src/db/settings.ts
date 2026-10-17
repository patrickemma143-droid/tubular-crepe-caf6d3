import { db } from './db';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  onboarded: false,
  farm_name: '',
  manager_name: '',
  currency: 'UGX',
  milk_price: 1200,
  theme: 'system',
  reminders: [
    { id: 'am-milk', label: 'Record morning milking', time: '07:30', enabled: true },
    { id: 'pm-milk', label: 'Record evening milking', time: '18:30', enabled: true },
    { id: 'health', label: 'Walk the herd: check for sick or bulling cows', time: '08:00', enabled: true },
  ],
  supabase_url: (import.meta as any).env?.VITE_SUPABASE_URL || '',
  supabase_key: (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '',
};

export async function getSettings(): Promise<Settings> {
  const s = await db.meta.get('settings');
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch, id: 'settings' as const };
  await db.meta.put(next);
  return next;
}
