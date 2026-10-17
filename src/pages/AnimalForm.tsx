import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import { useFarm, useSettings } from '../db/hooks';
import type { Animal } from '../db/types';
import { saveAnimal, saveBreeding, tagInUse } from '../lib/actions';
import { ageInMonths, todayISO } from '../lib/dates';
import { Field, NumberInput, Segmented, numStr, toNum, useToast } from '../components/ui';

const BREEDS = ['Friesian', 'Holstein Friesian', 'Jersey', 'Guernsey', 'Ayrshire', 'Friesian x Ankole', 'Jersey x Friesian', 'Ankole', 'Boran', 'Zebu'];

export default function AnimalForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const farm = useFarm();
  const settings = useSettings();
  const toast = useToast();
  const [a, setA] = useState<Partial<Animal>>({ sex: 'F', source: 'purchased', status: 'active', acquired_on: todayISO() });
  const [price, setPrice] = useState('');
  const [err, setErr] = useState('');
  const [lastCalved, setLastCalved] = useState('');
  const [pregnant, setPregnant] = useState(false);
  const [servedOn, setServedOn] = useState('');
  const editing = !!id;

  useEffect(() => {
    if (id) db.animals.get(id).then((x) => { if (x) { setA(x); setPrice(numStr(x.purchase_price)); } });
  }, [id]);
  const up = (p: Partial<Animal>) => setA((x) => ({ ...x, ...p }));
  const dams = farm.animals.filter((x) => x.sex === 'F' && x.id !== id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!a.tag?.trim()) return setErr('Enter the ear tag number.');
    if (await tagInUse(a.tag, id)) return setErr(`Tag ${a.tag.toUpperCase()} is already used by another animal.`);
    if (a.dob && a.dob > todayISO()) return setErr('Date of birth can’t be in the future.');
    const rec = await saveAnimal({ ...a, name: a.name?.trim() || undefined, breed: a.breed?.trim() || undefined, purchase_price: a.source === 'purchased' ? toNum(price) : undefined, acquired_on: a.source === 'purchased' ? a.acquired_on : undefined });
    if (!editing && rec.sex === 'F') {
      // History for animals that arrive part-way through their life
      if (lastCalved) await saveBreeding({ animal_id: rec.id, date: lastCalved, type: 'calving', notes: 'Recorded when the animal was added' });
      if (pregnant && servedOn) {
        await saveBreeding({ animal_id: rec.id, date: servedOn, type: 'service', notes: 'Recorded when the animal was added' });
        await saveBreeding({ animal_id: rec.id, date: todayISO(), type: 'preg_check', result: 'pregnant', notes: 'Recorded when the animal was added' });
      }
    }
    toast(editing ? 'Changes saved' : `${rec.tag} added to the herd`);
    nav(`/animals/${rec.id}`, { replace: true });
  }

  return (
    <form className="form" onSubmit={submit} style={{ maxWidth: 640 }}>
      <h1>{editing ? `Edit ${a.tag || ''}` : 'Add animal'}</h1>
      <div className="grid2">
        <Field label="Ear tag number"><input className="input" value={a.tag || ''} onChange={(e) => up({ tag: e.target.value })} required placeholder="e.g. KF-008" autoCapitalize="characters" /></Field>
        <Field label="Name"><input className="input" value={a.name || ''} onChange={(e) => up({ name: e.target.value })} placeholder="Optional" /></Field>
      </div>
      <Field label="Sex"><Segmented full value={a.sex as 'F' | 'M'} onChange={(v) => up({ sex: v })} options={[{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }]} /></Field>
      <Field label="Breed">
        <input className="input" list="breeds" value={a.breed || ''} onChange={(e) => up({ breed: e.target.value })} placeholder="e.g. Friesian" />
        <datalist id="breeds">{BREEDS.map((b) => <option key={b} value={b} />)}</datalist>
      </Field>
      <Field label="Date of birth" hint="An estimate is fine for bought animals"><input className="input" type="date" max={todayISO()} value={a.dob || ''} onChange={(e) => up({ dob: e.target.value })} /></Field>
      <Field label="How it came to the farm"><Segmented full value={a.source as 'born' | 'purchased'} onChange={(v) => up({ source: v })} options={[{ value: 'born', label: 'Born here' }, { value: 'purchased', label: 'Bought' }]} /></Field>
      {a.source === 'purchased' ? (
        <div className="grid2">
          <Field label="Date bought"><input className="input" type="date" max={todayISO()} value={a.acquired_on || ''} onChange={(e) => up({ acquired_on: e.target.value })} /></Field>
          <Field label={`Price (${settings?.currency || 'UGX'})`} hint="Added to expenses"><NumberInput value={price} onChange={setPrice} placeholder="0" /></Field>
        </div>
      ) : (
        <div className="grid2">
          <Field label="Mother">
            <select className="select" value={a.dam_id || ''} onChange={(e) => up({ dam_id: e.target.value || undefined })}>
              <option value="">Not recorded</option>
              {dams.map((d) => <option key={d.id} value={d.id}>{d.tag}{d.name ? ` · ${d.name}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Sire (bull or semen)"><input className="input" value={a.sire || ''} onChange={(e) => up({ sire: e.target.value })} /></Field>
        </div>
      )}
      {!editing && a.sex === 'F' && (!a.dob || ageInMonths(a.dob) >= 15) && (
        <div className="panel pad form">
          <b>Breeding so far</b>
          <Field label="Last calved" hint="Fill this in if she is milking now, so she appears on the milking list">
            <input className="input" type="date" max={todayISO()} value={lastCalved} onChange={(e) => setLastCalved(e.target.value)} />
          </Field>
          <label className="row"><input type="checkbox" checked={pregnant} onChange={(e) => setPregnant(e.target.checked)} style={{ width: 22, height: 22 }} /> She is pregnant now</label>
          {pregnant && <Field label="Date served" hint="Used to work out her calving date"><input className="input" type="date" max={todayISO()} value={servedOn} onChange={(e) => setServedOn(e.target.value)} required /></Field>}
        </div>
      )}
      <Field label="Notes"><textarea className="textarea" value={a.notes || ''} onChange={(e) => up({ notes: e.target.value })} placeholder="Markings, temperament, where it came from" /></Field>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="row">
        <button type="button" className="btn secondary" onClick={() => nav(-1)}>Cancel</button>
        <button type="submit" className="btn primary" style={{ flex: 1 }}>{editing ? 'Save changes' : 'Add animal'}</button>
      </div>
    </form>
  );
}
