import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { startSync } from './lib/sync';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

startSync();

// While the phone is being erased, screens that were still reading get a harmless "database closed" error
window.addEventListener('unhandledrejection', (e) => {
  if ((window as any).__farmosErasing && e.reason?.name === 'DatabaseClosedError') e.preventDefault();
});

// Offline support + "update available" prompt (only in production builds)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh() {
        window.dispatchEvent(new CustomEvent('farmos:update', { detail: () => update(true) }));
      },
    });
  }).catch(() => {});
}
