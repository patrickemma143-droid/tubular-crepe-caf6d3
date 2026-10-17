import { getSettings } from '../db/settings';

// Daily reminders. Browsers only allow a web app to show notifications while
// it is open or recently used; for guaranteed alerts a push server is needed
// (see README). We fire each enabled reminder once per day at its time.

const KEY = 'farmos-fired';

function firedToday(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function markFired(id: string, day: string) {
  try { const f = firedToday(); f[id] = day; localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* ignore */ }
}

export function notificationState(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function askPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}

export async function showNotification(title: string, body: string) {
  if (notificationState() !== 'granted') return false;
  const reg = await navigator.serviceWorker?.getRegistration?.();
  const opts = { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: title };
  if (reg) await reg.showNotification(title, opts);
  else new Notification(title, opts);
  return true;
}

export function startReminderLoop() {
  const tick = async () => {
    const s = await getSettings();
    const now = new Date();
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const fired = firedToday();
    for (const r of s.reminders) {
      if (!r.enabled || fired[r.id] === day) continue;
      // fire if the time has passed within the last 2 hours
      const [h, m] = r.time.split(':').map(Number);
      const due = new Date(now); due.setHours(h, m, 0, 0);
      const late = now.getTime() - due.getTime();
      if (late >= 0 && late < 2 * 3600_000) {
        markFired(r.id, day);
        await showNotification(s.farm_name || 'FarmOS', r.label);
      }
    }
    void hm;
  };
  tick();
  const id = setInterval(tick, 30_000);
  return () => clearInterval(id);
}
