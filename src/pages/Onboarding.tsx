import { useRef, useState } from 'react';
import { restoreBackup, switchFarm } from '../lib/backup';
import { updateSettings } from '../db/settings';
import { loadDemo } from '../db/demo';
import { Field, NumberInput, toNum } from '../components/ui';
import { Logo } from '../components/Logo';

export default function Onboarding() {
  const [farm, setFarm] = useState('');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('UGX');
  const [price, setPrice] = useState('1200');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function openFile(f: File) {
    setBusy(true); setErr('');
    try {
      const r = await restoreBackup(f);
      if (r.open) switchFarm(r.open); else location.reload();
    } catch (e: any) { setErr(e.message || String(e)); setBusy(false); }
  }

  async function start(demo: boolean) {
    setBusy(true);
    if (demo) await loadDemo();
    await updateSettings({ onboarded: true, farm_name: farm.trim() || (demo ? 'Sample dairy farm' : 'My farm'), manager_name: name.trim(), currency, milk_price: toNum(price) || 0 });
    location.hash = demo ? '#/' : '#/animals/new';
  }

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '32px 20px 48px' }} className="stack">
      <Logo size={56} />
      <div className="stack-sm">
        <h1 style={{ fontSize: 34 }}>Keep your dairy records in one place</h1>
        <p className="muted">Milk per cow, breeding and calvings, sick animals, sales and costs. Works without internet, and makes weekly and monthly reports for you.</p>
      </div>
      <form className="form" onSubmit={(e) => { e.preventDefault(); start(false); }}>
        <Field label="Farm name"><input className="input" value={farm} onChange={(e) => setFarm(e.target.value)} placeholder="e.g. Ntege Dairy Farm" /></Field>
        <Field label="Your name" hint="Shown on reports"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid2">
          <Field label="Currency"><select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>{['UGX', 'KES', 'TZS', 'RWF', 'USD'].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Milk price per litre"><NumberInput value={price} onChange={setPrice} /></Field>
        </div>
        <button className="btn primary block" disabled={busy}>Start and add my first animal</button>
        <button type="button" className="btn secondary block" disabled={busy} onClick={() => start(true)}>Explore with a sample farm first</button>
        <p className="small muted">The sample farm has 13 animals and two months of records. You can remove it from Settings at any time without touching your own records.</p>
      </form>
      <div className="panel pad stack-sm">
        <b>Already have FarmOS records?</b>
        <p className="small muted">Open a FarmOS data file or backup (.json) — for example the file with your farms' records. Every farm in it is added to this device.</p>
        <div><button type="button" className="btn secondary" disabled={busy} onClick={() => fileRef.current?.click()}>Open a data file</button></div>
        {err && <p className="error small">{err}</p>}
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ''; }} />
      </div>
    </main>
  );
}
