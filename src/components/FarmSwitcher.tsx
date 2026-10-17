import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, GitCompare, Plus } from 'lucide-react';
import { addFarm, listFarms, switchFarm, type LocalFarm } from '../lib/farms';
import { getSettings } from '../db/settings';
import { Field, Sheet } from './ui';

export function useLocalFarms(): LocalFarm[] | null {
  const [farms, setFarms] = useState<LocalFarm[] | null>(null);
  useEffect(() => { let on = true; listFarms().then((f) => on && setFarms(f)).catch(() => on && setFarms([])); return () => { on = false; }; }, []);
  return farms;
}

export function FarmSwitcherSheet({ onClose }: { onClose: () => void }) {
  const farms = useLocalFarms();
  const nav = useNavigate();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const s = await getSettings();
    const key = await addFarm(name, { manager_name: s.manager_name, currency: s.currency, milk_price: s.milk_price, theme: s.theme });
    switchFarm(key);
  }
  return (
    <Sheet title="Your farms" onClose={onClose}>
      <div className="stack">
        <div className="list">
          {(farms || []).map((f) => (
            <button key={f.key} className="item" onClick={() => (f.active ? onClose() : switchFarm(f.key))} aria-current={f.active}>
              <div className="main"><div className="title">{f.name}</div><div className="sub">{f.records ? `${f.records.toLocaleString()} records on this device` : 'No records yet'}</div></div>
              {f.active ? <span className="badge green"><Check size={14} /> Open</span> : <span className="small">Open</span>}
            </button>
          ))}
        </div>
        {(farms?.length || 0) > 1 && <button className="btn secondary" onClick={() => { onClose(); nav('/compare'); }}><GitCompare size={18} /> Compare farms</button>}
        {adding ? (
          <form className="form panel pad" onSubmit={add}>
            <Field label="New farm name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Namugongo Farm" autoFocus /></Field>
            <div className="row"><button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary" disabled={busy || !name.trim()}>Add and open</button></div>
          </form>
        ) : <button className="btn ghost" onClick={() => setAdding(true)}><Plus size={18} /> Add a farm</button>}
        <p className="small muted">Each farm keeps its own animals, milk, register and money. Switching doesn't need internet or a sign-in.</p>
      </div>
    </Sheet>
  );
}

export function FarmName({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="farm farm-switch" onClick={() => setOpen(true)} aria-label={`Farm: ${name || 'FarmOS'}. Switch farm`}>
        <span>{name || 'FarmOS'}</span><ChevronDown size={18} aria-hidden />
      </button>
      {open && <FarmSwitcherSheet onClose={() => setOpen(false)} />}
    </>
  );
}
