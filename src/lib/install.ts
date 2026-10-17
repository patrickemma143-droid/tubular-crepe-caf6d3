import { useEffect, useState } from 'react';

let deferred: any = null;
const subs = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; subs.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; subs.forEach((f) => f()); });
}

export function isInstalled() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

/** Returns an install function when the browser offers one (Android Chrome, desktop Chrome/Edge). */
export function useInstall(): { canInstall: boolean; install: () => Promise<void>; installed: boolean; ios: boolean } {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return {
    canInstall: !!deferred,
    installed: isInstalled(),
    ios,
    install: async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; force((x) => x + 1); },
  };
}
