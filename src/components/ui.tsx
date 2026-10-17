import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Animal } from '../db/types';

// ─── Sheet ────────────────────────────────────────────────────
export function Sheet({ title, onClose, children, actions, wide }: {
  title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.iconbtn)');
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [onClose]);
  return createPortal(
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`sheet${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="grabber" />
        <header>
          <h2>{title}</h2>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><X size={22} /></button>
        </header>
        {children}
        {actions && <div className="sheet-actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ─── Form bits ────────────────────────────────────────────────
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, full, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; full?: boolean; label?: string;
}) {
  return (
    <div className={`segmented${full ? ' full' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Decimal input that keeps the raw text (so "12." can be typed) and accepts commas. */
export function NumberInput({ value, onChange, big, className, ...rest }: {
  value: string; onChange: (v: string) => void; big?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      className={`input${big ? ' big' : ''}${className ? ' ' + className : ''}`} inputMode="decimal" type="text" autoComplete="off" {...rest}
      value={value}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, '').replace(/\s/g, '');
        if (raw === '' || /^\d*\.?\d*$/.test(raw)) onChange(raw);
      }}
    />
  );
}
export const toNum = (v: string | number | undefined | null): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? undefined : n;
};
export const numStr = (n?: number) => (n == null ? '' : String(n));

export function AnimalSelect({ animals, value, onChange, placeholder = 'Choose an animal' }: {
  animals: Animal[]; value: string; onChange: (id: string) => void; placeholder?: string;
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">{placeholder}</option>
      {animals.map((a) => <option key={a.id} value={a.id}>{a.tag}{a.name ? ` · ${a.name}` : ''}{a.breed ? ` (${a.breed})` : ''}</option>)}
    </select>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

// ─── Toasts ───────────────────────────────────────────────────
interface ToastItem { id: number; text: string; undo?: () => void }
const ToastCtx = createContext<(text: string, undo?: () => void) => void>(() => {});
export function useToast() { return useContext(ToastCtx); }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, undo?: () => void) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text, undo }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), undo ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div className="toast" key={t.id}>
            <span>{t.text}</span>
            {t.undo && <button onClick={() => { t.undo!(); setItems((xs) => xs.filter((x) => x.id !== t.id)); }}>Undo</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ─── Confirm ──────────────────────────────────────────────────
export function Confirm({ title, body, confirmLabel, danger, onConfirm, onClose }: {
  title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void | Promise<void>; onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose} actions={<>
      <button className="btn secondary" onClick={onClose}>Cancel</button>
      <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={async () => { await onConfirm(); onClose(); }}>{confirmLabel}</button>
    </>}>
      <div className="muted">{body}</div>
    </Sheet>
  );
}

// ─── Charts ───────────────────────────────────────────────────
export function Bars({ data, height = 140, highlightLast }: {
  data: { label: string; value: number; estimated?: boolean; title?: string }[]; height?: number; highlightLast?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const every = data.length > 16 ? Math.ceil(data.length / 8) : 1;
  return (
    <div className="bars" style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${d.value.toFixed(1)}`).join(', ')}>
      {data.map((d, i) => (
        <div key={i} className={`bar${d.estimated ? ' est' : ''}${highlightLast && i !== data.length - 1 ? '' : ''}`} title={d.title || `${d.label}: ${d.value.toFixed(1)}`}>
          <i style={{ height: `${(d.value / max) * 100}%` }} />
          <small>{i % every === 0 ? d.label : ' '}</small>
        </div>
      ))}
    </div>
  );
}

export function HBar({ value, max, red }: { value: number; max: number; red?: boolean }) {
  return <div className={`hbar${red ? ' red' : ''}`}><i style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }} /></div>;
}
