import { useEffect, useRef, useState } from 'react';
import { useFarm, useSettings } from '../db/hooks';
import { updateSettings } from '../db/settings';
import type { Reminder, Settings } from '../db/types';
import { Confirm, Field, NumberInput, Segmented, toNum, useToast } from '../components/ui';
import { askPermission, notificationState, showNotification } from '../lib/notify';
import { useSyncStatus, syncNow } from '../lib/sync';
import { createFarm, currentUser, invite, members, myFarms, setCloudConfig, signIn, signOut, signUp, useFarmAccount, type FarmMembership, type Member } from '../lib/cloud';
import { downloadBackup, eraseThisDevice, restoreBackup } from '../lib/backup';
import { allDataToExcel } from '../lib/export';
import { hasDemo, removeDemo } from '../db/demo';
import { useInstall } from '../lib/install';
import { uid } from '../db/db';

const CURRENCIES = ['UGX', 'KES', 'TZS', 'RWF', 'USD'];

function FarmSection({ s }: { s: Settings }) {
  const toast = useToast();
  const [name, setName] = useState(s.farm_name);
  const [mgr, setMgr] = useState(s.manager_name);
  const [price, setPrice] = useState(String(s.milk_price || ''));
  return (
    <section className="section" id="farm">
      <h2>Farm</h2>
      <form className="panel pad form" onSubmit={async (e) => { e.preventDefault(); await updateSettings({ farm_name: name.trim(), manager_name: mgr.trim(), milk_price: toNum(price) || 0 }); toast('Farm details saved'); }}>
        <Field label="Farm name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Your name" hint="Shown on reports"><input className="input" value={mgr} onChange={(e) => setMgr(e.target.value)} /></Field>
        <div className="grid2">
          <Field label="Currency"><select className="select" value={s.currency} onChange={(e) => updateSettings({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Usual milk price per litre"><NumberInput value={price} onChange={setPrice} /></Field>
        </div>
        <Field label="Appearance"><Segmented value={s.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ value: 'system', label: 'Match phone' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></Field>
        <div><button className="btn primary">Save farm details</button></div>
      </form>
    </section>
  );
}

function RemindersSection({ s }: { s: Settings }) {
  const toast = useToast();
  const [perm, setPerm] = useState(notificationState());
  const setR = (id: string, p: Partial<Reminder>) => updateSettings({ reminders: s.reminders.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  return (
    <section className="section" id="reminders">
      <h2>Daily reminders</h2>
      <div className="list">
        {s.reminders.map((r) => (
          <div key={r.id} className="item">
            <input type="checkbox" checked={r.enabled} onChange={(e) => setR(r.id, { enabled: e.target.checked })} aria-label={`Turn ${r.label} on or off`} style={{ width: 22, height: 22 }} />
            <input className="input main" value={r.label} onChange={(e) => setR(r.id, { label: e.target.value })} aria-label="Reminder text" />
            <input className="input" type="time" value={r.time} onChange={(e) => setR(r.id, { time: e.target.value })} style={{ width: 120 }} aria-label="Time" />
          </div>
        ))}
      </div>
      <div className="row wrap">
        <button className="btn secondary sm" onClick={() => updateSettings({ reminders: [...s.reminders, { id: uid(), label: 'New reminder', time: '12:00', enabled: true }] })}>Add reminder</button>
        {perm !== 'granted' && perm !== 'unsupported' && <button className="btn primary sm" onClick={async () => setPerm(await askPermission())}>Allow notifications</button>}
        {perm === 'granted' && <button className="btn ghost sm" onClick={async () => { await showNotification(s.farm_name || 'FarmOS', 'Reminders are working.'); toast('Test reminder sent'); }}>Send a test</button>}
      </div>
      <p className="small muted">{perm === 'denied' ? 'Notifications are blocked. Allow them for this site in your phone’s browser settings.' : perm === 'unsupported' ? 'This browser can’t show notifications. Install FarmOS to your home screen first.' : 'Reminders appear while FarmOS is open or was used recently. Overdue tasks always show on the Today screen.'}</p>
    </section>
  );
}

function CloudSection({ s }: { s: Settings }) {
  const toast = useToast();
  const status = useSyncStatus();
  const [url, setUrl] = useState(s.supabase_url || '');
  const [key, setKey] = useState(s.supabase_key || '');
  const [email, setEmail] = useState(s.user_email || '');
  const [pw, setPw] = useState('');
  const [user, setUser] = useState<string | null>(null);
  const [farms, setFarms] = useState<FarmMembership[] | null>(null);
  const [team, setTeam] = useState<Member[]>([]);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState<'manager' | 'worker'>('worker');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const configured = !!(s.supabase_url && s.supabase_key);

  const refresh = async () => {
    try {
      const u = await currentUser();
      setUser(u?.email || null);
      if (u) setFarms(await myFarms());
      if (u && s.farm_id) setTeam(await members(s.farm_id));
    } catch (e: any) { setErr(e.message || String(e)); }
  };
  useEffect(() => { if (configured) refresh(); }, [configured, s.farm_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<any>) => { setErr(''); setBusy(true); try { await fn(); await refresh(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(false); } };

  return (
    <section className="section" id="sync">
      <h2>Cloud backup & team</h2>
      <div className="panel pad stack">
        <p className="small">{status.detail}</p>
        {!configured ? (
          <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => setCloudConfig(url, key)); }}>
            <p className="small muted">Backup uses your own free Supabase project. Run <code>supabase/schema.sql</code> in it once, then paste the project URL and the anon (public) key from Project settings → API.</p>
            <Field label="Supabase project URL"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" required /></Field>
            <Field label="Anon public key"><input className="input" value={key} onChange={(e) => setKey(e.target.value)} required /></Field>
            <div><button className="btn primary" disabled={busy}>Connect</button></div>
          </form>
        ) : !user ? (
          <form className="form" onSubmit={(e) => e.preventDefault()}>
            <Field label="Email"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Password" hint="At least 8 characters"><input className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} /></Field>
            <div className="row wrap">
              <button className="btn primary" disabled={busy || !email || pw.length < 8} onClick={() => act(() => signIn(email, pw))}>Sign in</button>
              <button className="btn secondary" disabled={busy || !email || pw.length < 8} onClick={() => act(async () => { if ((await signUp(email, pw)) === 'confirm') toast('Check your email to confirm, then sign in'); })}>Create account</button>
              <button type="button" className="btn ghost" onClick={() => act(() => setCloudConfig('', ''))}>Change project</button>
            </div>
          </form>
        ) : (
          <div className="stack">
            <div className="spread"><span>Signed in as <b>{user}</b></span><button className="btn ghost sm" onClick={() => act(signOut)}>Sign out</button></div>
            {farms && !s.farm_id && (
              <div className="stack-sm">
                {farms.length > 0 && <p className="small">Choose the farm this phone records for:</p>}
                {farms.map((f) => <button key={f.farm_id} className="btn secondary" onClick={() => act(() => useFarmAccount(f.farm_id, f.role, f.name))}>{f.name} · {f.role}</button>)}
                <button className="btn primary" disabled={busy} onClick={() => act(async () => { const id = await createFarm(s.farm_name || 'My farm'); await useFarmAccount(id, 'owner'); })}>Create “{s.farm_name || 'My farm'}” in the cloud</button>
                <p className="small muted">Records already on this phone will be uploaded to the farm you choose.</p>
              </div>
            )}
            {s.farm_id && farms && farms.length > 1 && (
              <div className="stack-sm">
                <h3>Your farms</h3>
                <div className="list">{farms.map((f) => (
                  <div key={f.farm_id} className="item">
                    <div className="main"><div className="title">{f.name}</div><div className="sub">{f.role}{f.farm_id === s.farm_id ? ' · this phone records for this farm' : ''}</div></div>
                    {f.farm_id === s.farm_id ? <span className="badge green">Open</span> : <button className="btn secondary sm" disabled={busy} onClick={() => act(async () => { await useFarmAccount(f.farm_id, f.role, f.name); toast(`Switched to ${f.name}`); })}>Switch</button>}
                  </div>
                ))}</div>
                <p className="small muted">Switching uploads everything first, then loads the other farm's records onto this phone.</p>
              </div>
            )}
            {s.farm_id && (
              <>
                <div className="row wrap">
                  <button className="btn secondary sm" disabled={status.busy} onClick={() => syncNow()}>Sync now</button>
                  <span className="small muted">{status.pending ? `${status.pending} changes waiting to upload` : 'Everything uploaded'}</span>
                </div>
                <div className="stack-sm">
                  <h3>People on this farm</h3>
                  <div className="list">{team.map((m) => (
                    <div key={m.email} className="item"><div className="main"><div className="title">{m.email}</div><div className="sub">{m.role}{m.pending ? ' · invited, not signed up yet' : ''}</div></div></div>
                  ))}</div>
                  {(s.farm_role === 'owner' || s.farm_role === 'manager') && (
                    <form className="row wrap" onSubmit={(e) => { e.preventDefault(); act(async () => { await invite(s.farm_id!, invEmail, invRole); setInvEmail(''); toast('Invite saved. Ask them to create an account with that email.'); }); }}>
                      <input className="input" style={{ flex: 1, minWidth: 200 }} type="email" placeholder="Their email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} required />
                      <Segmented value={invRole} onChange={setInvRole} options={[{ value: 'worker', label: 'Farm hand' }, { value: 'manager', label: 'Manager' }]} />
                      <button className="btn primary sm" disabled={busy}>Invite</button>
                    </form>
                  )}
                  <p className="small muted">Farm hands can record milk, breeding and health but can't see money.</p>
                </div>
              </>
            )}
          </div>
        )}
        {err && <p className="error" role="alert">{err}</p>}
      </div>
    </section>
  );
}

function DataSection({ s }: { s: Settings }) {
  const farm = useFarm();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [demo, setDemo] = useState(false);
  const [erase, setErase] = useState(false);
  const [typed, setTyped] = useState('');
  useEffect(() => { hasDemo().then(setDemo); }, [farm.animals.length]);
  return (
    <section className="section" id="data">
      <h2>Your records</h2>
      <div className="list">
        <button className="item" onClick={() => allDataToExcel(farm, s)}><div className="main"><div className="title">Download all records (Excel)</div><div className="sub">Every animal, milk, breeding, health and money record</div></div></button>
        <button className="item" onClick={() => downloadBackup()}><div className="main"><div className="title">Download backup file</div><div className="sub">Keep it somewhere safe, e.g. Google Drive or WhatsApp to yourself</div></div></button>
        <button className="item" onClick={() => fileRef.current?.click()}><div className="main"><div className="title">Restore from backup file</div><div className="sub">Adds records from the file; newer copies win</div></div></button>
        {demo && <button className="item" onClick={async () => { await removeDemo(); setDemo(false); toast('Sample farm removed. Your own records are kept.'); }}><div className="main"><div className="title">Remove the sample farm</div><div className="sub">Deletes only the example animals and records</div></div></button>}
        <button className="item" onClick={() => setErase(true)}><div className="main"><div className="title" style={{ color: 'var(--urgent)' }}>Erase everything on this phone</div><div className="sub">Cloud copies are not touched</div></div></button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        try { toast(`Restored ${await restoreBackup(f)} records`); } catch (x: any) { toast(x.message); }
        e.target.value = '';
      }} />
      {erase && <Confirm danger title="Erase this phone?" confirmLabel="Erase" onClose={() => { setErase(false); setTyped(''); }}
        onConfirm={async () => { if (typed.trim().toUpperCase() !== 'ERASE') { toast('Type ERASE to confirm'); return; } await eraseThisDevice(); }}
        body={<div className="stack-sm">
          <p>All animals and records stored on this phone will be deleted. {s.farm_id ? 'Records already backed up to the cloud stay there and come back when you sign in again.' : <b>You have no cloud backup — download a backup file first.</b>}</p>
          <Field label="Type ERASE to confirm"><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} /></Field>
        </div>} />}
    </section>
  );
}

function InstallSection() {
  const { canInstall, install, installed, ios } = useInstall();
  if (installed) return null;
  return (
    <section className="section">
      <h2>Install on your phone</h2>
      <div className="panel pad stack-sm">
        {canInstall ? <><p>Add FarmOS to your home screen. It opens like an app and works without internet.</p><div><button className="btn primary" onClick={install}>Install FarmOS</button></div></>
          : ios ? <p>In Safari, tap the Share button, then <b>Add to Home Screen</b>.</p>
          : <p>Open the browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const s = useSettings();
  useEffect(() => { const id = location.hash.split('#')[2]; if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView(), 50); }, []);
  if (!s) return null;
  return (
    <div className="stack" style={{ gap: 28, maxWidth: 720 }}>
      <h1>Settings</h1>
      <InstallSection />
      <FarmSection s={s} />
      <RemindersSection s={s} />
      <CloudSection s={s} />
      <DataSection s={s} />
      <p className="tiny muted">FarmOS 2.0 · records are stored on this device{s.farm_id ? ' and backed up to your farm account' : ''}.</p>
    </div>
  );
}
