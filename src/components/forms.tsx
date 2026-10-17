import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFarm, useSettings } from '../db/hooks';
import type { Animal, BreedingEvent, HealthRecord, Transaction, WeightRecord, HealthKind } from '../db/types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../db/types';
import { addDays, todayISO, fmtDate } from '../lib/dates';
import { deleteBreeding, deleteHealth, exitAnimal, nextTag, recordCalving, saveBreeding, saveHealth, type CalfInput } from '../lib/actions';
import { label, repro, GESTATION_DAYS, eventsFor } from '../lib/herd';
import { remove, save } from '../db/db';
import { money } from '../lib/format';
import { AnimalSelect, Field, NumberInput, Segmented, Sheet, numStr, toNum, useToast } from './ui';

export type FormKind =
  | { kind: 'breeding'; type?: BreedingEvent['type']; animalId?: string; record?: BreedingEvent }
  | { kind: 'calving'; animalId?: string }
  | { kind: 'health'; healthKind?: HealthKind; animalId?: string; record?: HealthRecord }
  | { kind: 'tx'; type: 'income' | 'expense'; category?: string; record?: Transaction }
  | { kind: 'exit'; animalId?: string }
  | { kind: 'weight'; animalId?: string; record?: WeightRecord };

const Ctx = createContext<(f: FormKind) => void>(() => {});
export const useForms = () => useContext(Ctx);

export function FormHost({ children }: { children: ReactNode }) {
  const [form, setForm] = useState<FormKind | null>(null);
  const close = () => setForm(null);
  return (
    <Ctx.Provider value={setForm}>
      {children}
      {form?.kind === 'breeding' && <BreedingForm {...form} onClose={close} />}
      {form?.kind === 'calving' && <CalvingForm animalId={form.animalId} onClose={close} />}
      {form?.kind === 'health' && <HealthForm {...form} onClose={close} />}
      {form?.kind === 'tx' && <TxForm {...form} onClose={close} />}
      {form?.kind === 'exit' && <ExitForm animalId={form.animalId} onClose={close} />}
      {form?.kind === 'weight' && <WeightForm {...form} onClose={close} />}
    </Ctx.Provider>
  );
}

function Actions({ onClose, onDelete, saveLabel = 'Save', disabled }: { onClose: () => void; onDelete?: () => void; saveLabel?: string; disabled?: boolean }) {
  return (
    <>
      {onDelete ? <button type="button" className="btn danger-ghost" onClick={onDelete}>Delete</button> : <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>}
      <button type="submit" form="sheet-form" className="btn primary" disabled={disabled}>{saveLabel}</button>
    </>
  );
}

// ─── Breeding (heat, service, pregnancy check, dry off, abortion) ─

const BREEDING_TITLES: Record<string, string> = {
  heat: 'Record heat', service: 'Record service / AI', preg_check: 'Record pregnancy check', dry_off: 'Record dry off', abortion: 'Record abortion', calving: 'Edit calving',
};

function BreedingForm({ type: t0 = 'service', animalId, record, onClose }: { type?: BreedingEvent['type']; animalId?: string; record?: BreedingEvent; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const [type, setType] = useState<BreedingEvent['type']>(record?.type || t0);
  const [aid, setAid] = useState(record?.animal_id || animalId || '');
  const [date, setDate] = useState(record?.date || todayISO());
  const [method, setMethod] = useState<'AI' | 'natural'>(record?.method || 'AI');
  const [sire, setSire] = useState(record?.sire || '');
  const [tech, setTech] = useState(record?.technician || '');
  const [result, setResult] = useState<'pregnant' | 'open'>(record?.result || 'pregnant');
  const [cost, setCost] = useState(numStr(record?.cost));
  const [notes, setNotes] = useState(record?.notes || '');
  const females = farm.animals.filter((a) => a.sex === 'F' && (a.status === 'active' || a.id === aid));
  const animal = farm.animals.find((a) => a.id === aid);
  const r = animal ? repro(animal, farm.breeding, farm.milk) : undefined;
  const sires = useMemo(() => [...new Set(farm.breeding.map((e) => e.sire).filter(Boolean) as string[])], [farm.breeding]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!aid) return;
    await saveBreeding({
      ...(record || {}), animal_id: aid, date, type,
      method: type === 'service' ? method : undefined,
      sire: type === 'service' ? sire.trim() || undefined : record?.sire,
      technician: type === 'service' ? tech.trim() || undefined : undefined,
      result: type === 'preg_check' ? result : undefined,
      cost: type === 'service' ? toNum(cost) : undefined,
      notes: notes.trim() || undefined,
    });
    const msg = type === 'service' ? `Service recorded. Expected calving ${fmtDate(addDays(date, GESTATION_DAYS))}` : type === 'preg_check' ? (result === 'pregnant' ? `${animal?.tag} confirmed pregnant` : `${animal?.tag} recorded as not pregnant`) : 'Saved';
    toast(msg);
    onClose();
  }
  return (
    <Sheet title={record ? BREEDING_TITLES[type] : BREEDING_TITLES[type] || 'Breeding'} onClose={onClose}
      actions={<Actions onClose={onClose} onDelete={record ? async () => { await deleteBreeding(record); toast('Deleted'); onClose(); } : undefined} />}>
      <form id="sheet-form" className="form" onSubmit={submit}>
        {!record && (
          <Segmented full value={type} onChange={setType} label="Event" options={[
            { value: 'heat', label: 'Heat' }, { value: 'service', label: 'Service' }, { value: 'preg_check', label: 'PD check' }, { value: 'dry_off', label: 'Dry off' }, { value: 'abortion', label: 'Lost calf' },
          ]} />
        )}
        <Field label="Cow or heifer"><AnimalSelect animals={females} value={aid} onChange={setAid} /></Field>
        {r && <p className="small muted">Now: {r.state}{r.lastCalving ? ` · calved ${fmtDate(r.lastCalving)}` : ''}{r.lastService ? ` · last served ${fmtDate(r.lastService)}` : ''}</p>}
        <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
        {type === 'service' && <>
          <Segmented full value={method} onChange={setMethod} label="Method" options={[{ value: 'AI', label: 'Artificial insemination' }, { value: 'natural', label: 'Bull' }]} />
          <Field label={method === 'AI' ? 'Semen / bull code' : 'Bull'}>
            <input className="input" list="sires" value={sire} onChange={(e) => setSire(e.target.value)} placeholder={method === 'AI' ? 'e.g. ABS Friesian 7HO' : 'e.g. Kato'} />
            <datalist id="sires">{sires.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          {method === 'AI' && <Field label="Technician"><input className="input" value={tech} onChange={(e) => setTech(e.target.value)} /></Field>}
          <Field label="Cost" hint="Added to expenses under Breeding / AI"><NumberInput value={cost} onChange={setCost} placeholder="0" /></Field>
          <p className="small muted">Expected calving: <b>{fmtDate(addDays(date, GESTATION_DAYS))}</b>. Watch for heat around {fmtDate(addDays(date, 21))}.</p>
        </>}
        {type === 'preg_check' && (
          <Segmented full value={result} onChange={setResult} label="Result" options={[{ value: 'pregnant', label: 'Pregnant' }, { value: 'open', label: 'Not pregnant' }]} />
        )}
        <Field label="Notes"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </form>
    </Sheet>
  );
}

// ─── Calving ──────────────────────────────────────────────────

function CalvingForm({ animalId, onClose }: { animalId?: string; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const [aid, setAid] = useState(animalId || '');
  const [date, setDate] = useState(todayISO());
  const [ease, setEase] = useState<'normal' | 'assisted' | 'difficult'>('normal');
  const [twins, setTwins] = useState(false);
  const tags = farm.animals.map((a) => a.tag);
  const [calves, setCalves] = useState<CalfInput[]>([{ tag: nextTag(tags), sex: 'F' }]);
  const [tagEdited, setTagEdited] = useState(false);
  // the herd loads asynchronously: refresh the suggested tag once it arrives
  useEffect(() => { if (!tagEdited) setCalves((cs) => cs.map((c, i) => ({ ...c, tag: nextTag([...tags, ...cs.slice(0, i).map((x) => x.tag)]) }))); }, [tags.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [err, setErr] = useState('');
  const dam = farm.animals.find((a) => a.id === aid);
  const lastService = dam ? eventsFor(dam.id, farm.breeding).filter((e) => e.type === 'service').pop() : undefined;
  const females = farm.animals.filter((a) => a.sex === 'F' && a.status === 'active');

  function setTwinsOn(on: boolean) {
    setTwins(on);
    setCalves((cs) => on ? [...cs, { tag: nextTag([...tags, cs[0].tag]), sex: 'F' }] : cs.slice(0, 1));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dam) return;
    const used = new Set(farm.animals.map((a) => a.tag.toUpperCase()));
    for (const c of calves) {
      if (!c.tag.trim()) return setErr('Give each calf a tag number.');
      if (used.has(c.tag.trim().toUpperCase())) return setErr(`Tag ${c.tag} is already used.`);
    }
    await recordCalving(dam, { date, calves: calves.map((c) => ({ ...c, tag: c.tag.trim() })), ease, sire: lastService?.sire });
    toast(`Calving recorded. ${calves.length === 1 ? 'Calf' : 'Calves'} added to the herd.`);
    onClose();
  }
  return (
    <Sheet title="Record calving" onClose={onClose} actions={<Actions onClose={onClose} saveLabel="Save calving" />}>
      <form id="sheet-form" className="form" onSubmit={submit}>
        <Field label="Mother"><AnimalSelect animals={females} value={aid} onChange={setAid} /></Field>
        {lastService && <p className="small muted">Served {fmtDate(lastService.date)}{lastService.sire ? ` with ${lastService.sire}` : ''}.</p>}
        <Field label="Calving date"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Segmented full value={ease} onChange={setEase} label="Calving" options={[{ value: 'normal', label: 'Normal' }, { value: 'assisted', label: 'Assisted' }, { value: 'difficult', label: 'Difficult' }]} />
        <label className="row"><input type="checkbox" checked={twins} onChange={(e) => setTwinsOn(e.target.checked)} style={{ width: 22, height: 22 }} /> Twins</label>
        {calves.map((c, i) => (
          <div key={i} className="panel pad stack-sm">
            <b>{calves.length > 1 ? `Calf ${i + 1}` : 'Calf'}</b>
            <div className="grid2">
              <Field label="Tag number"><input className="input" value={c.tag} onChange={(e) => { setTagEdited(true); setCalves((cs) => cs.map((x, j) => j === i ? { ...x, tag: e.target.value } : x)); }} required /></Field>
              <Field label="Name"><input className="input" value={c.name || ''} onChange={(e) => setCalves((cs) => cs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></Field>
            </div>
            <Segmented full value={c.sex} onChange={(v) => setCalves((cs) => cs.map((x, j) => j === i ? { ...x, sex: v } : x))} label="Sex" options={[{ value: 'F', label: 'Heifer calf' }, { value: 'M', label: 'Bull calf' }]} />
          </div>
        ))}
        {err && <p className="error">{err}</p>}
        <p className="small muted">The mother is marked as milking from this date. For a calf born dead, record “Lost calf” under Breeding instead.</p>
      </form>
    </Sheet>
  );
}

// ─── Health ───────────────────────────────────────────────────

function HealthForm({ healthKind = 'treatment', animalId, record, onClose }: { healthKind?: HealthKind; animalId?: string; record?: HealthRecord; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const [kind, setKind] = useState<HealthKind>(record?.kind || healthKind);
  const [aid, setAid] = useState(record?.animal_id || animalId || '');
  const [allHerd, setAllHerd] = useState(false);
  const [date, setDate] = useState(record?.date || todayISO());
  const [condition, setCondition] = useState(record?.condition || '');
  const [medicine, setMedicine] = useState(record?.medicine || '');
  const [dose, setDose] = useState(record?.dose || '');
  const [vet, setVet] = useState(record?.vet || '');
  const [cost, setCost] = useState(numStr(record?.cost));
  const [status, setStatus] = useState<HealthRecord['status']>(record?.status || (kind === 'treatment' ? 'open' : 'done'));
  const [withdrawDays, setWithdrawDays] = useState(record?.milk_withdrawal_until ? String(Math.max(0, Math.round((new Date(record.milk_withdrawal_until).getTime() - new Date(record.date).getTime()) / 86400000))) : '');
  const [nextDue, setNextDue] = useState(record?.next_due || '');
  const [notes, setNotes] = useState(record?.notes || '');
  const active = farm.animals.filter((a) => a.status === 'active' || a.id === aid);
  const conditions = useMemo(() => [...new Set(farm.health.filter((h) => h.kind === kind).map((h) => h.condition))], [farm.health, kind]);
  const isTx = kind === 'treatment';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ids = allHerd && !record ? active.map((a) => a.id) : [aid];
    if (!ids[0]) return;
    const wd = toNum(withdrawDays);
    const total = toNum(cost);
    for (const id of ids) {
      await saveHealth({
        ...(record || {}), animal_id: id, date, kind, condition: condition.trim(),
        medicine: medicine.trim() || undefined, dose: dose.trim() || undefined, vet: vet.trim() || undefined,
        cost: total != null ? Math.round(total / ids.length) : undefined,
        status: isTx ? status : 'done',
        resolved_on: isTx && status === 'recovered' ? (record?.resolved_on || todayISO()) : undefined,
        milk_withdrawal_until: wd ? addDays(date, wd) : undefined,
        next_due: nextDue || undefined,
        notes: notes.trim() || undefined,
      });
    }
    toast(ids.length > 1 ? `Recorded for ${ids.length} animals` : 'Health record saved');
    onClose();
  }
  return (
    <Sheet title={record ? 'Edit health record' : isTx ? 'Record treatment' : kind === 'vaccination' ? 'Record vaccination' : kind === 'deworming' ? 'Record deworming' : 'Record check-up'} onClose={onClose}
      actions={<Actions onClose={onClose} onDelete={record ? async () => { await deleteHealth(record); toast('Deleted'); onClose(); } : undefined} />}>
      <form id="sheet-form" className="form" onSubmit={submit}>
        {!record && <Segmented full value={kind} onChange={(k) => { setKind(k); setStatus(k === 'treatment' ? 'open' : 'done'); }} label="Type" options={[
          { value: 'treatment', label: 'Treatment' }, { value: 'vaccination', label: 'Vaccine' }, { value: 'deworming', label: 'Deworm' }, { value: 'checkup', label: 'Check-up' },
        ]} />}
        {!isTx && !record && <label className="row"><input type="checkbox" checked={allHerd} onChange={(e) => setAllHerd(e.target.checked)} style={{ width: 22, height: 22 }} /> Whole herd ({active.filter((a) => a.status === 'active').length} animals)</label>}
        {!allHerd && <Field label="Animal"><AnimalSelect animals={active} value={aid} onChange={setAid} /></Field>}
        <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label={isTx ? 'Problem / diagnosis' : kind === 'vaccination' ? 'Vaccine (disease)' : kind === 'deworming' ? 'Product' : 'What was checked'}>
          <input className="input" list="conds" value={condition} onChange={(e) => setCondition(e.target.value)} required placeholder={isTx ? 'e.g. Mastitis, East Coast Fever' : kind === 'vaccination' ? 'e.g. Foot and mouth disease' : ''} />
          <datalist id="conds">{conditions.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        {isTx && <div className="grid2">
          <Field label="Medicine"><input className="input" value={medicine} onChange={(e) => setMedicine(e.target.value)} /></Field>
          <Field label="Dose"><input className="input" value={dose} onChange={(e) => setDose(e.target.value)} /></Field>
        </div>}
        <div className="grid2">
          <Field label="Vet / given by"><input className="input" value={vet} onChange={(e) => setVet(e.target.value)} /></Field>
          <Field label={allHerd ? 'Total cost' : 'Cost'} hint="Added to expenses"><NumberInput value={cost} onChange={setCost} placeholder="0" /></Field>
        </div>
        {isTx && <Field label="Status"><Segmented full value={status} onChange={setStatus} label="Status" options={[{ value: 'open', label: 'Under treatment' }, { value: 'recovered', label: 'Recovered' }, { value: 'chronic', label: 'Chronic' }]} /></Field>}
        {(isTx || kind === 'deworming') && <Field label="Milk withdrawal (days)" hint={toNum(withdrawDays) ? `Don't sell this animal's milk until ${fmtDate(addDays(date, toNum(withdrawDays)!))}` : 'From the drug label. Leave blank if none.'}><NumberInput value={withdrawDays} onChange={setWithdrawDays} placeholder="0" /></Field>}
        <Field label={isTx ? 'Follow-up date' : 'Next due'} hint={!isTx ? 'You’ll get a reminder a week before' : undefined}>
          <input className="input" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
        </Field>
        {!isTx && !record && <div className="chips">{[['3 months', 91], ['6 months', 182], ['1 year', 365]].map(([l, d]) => (
          <button type="button" key={l} className="chip" onClick={() => setNextDue(addDays(date, d as number))}>In {l}</button>
        ))}</div>}
        <Field label="Notes"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </form>
    </Sheet>
  );
}

// ─── Money ────────────────────────────────────────────────────

function TxForm({ type, category: c0, record, onClose }: { type: 'income' | 'expense'; category?: string; record?: Transaction; onClose: () => void }) {
  const settings = useSettings();
  const toast = useToast();
  const cur = settings?.currency || 'UGX';
  const kind = record?.type || type;
  const [category, setCategory] = useState(record?.category || c0 || (kind === 'income' ? 'Milk sales' : 'Feed & supplements'));
  const [date, setDate] = useState(record?.date || todayISO());
  const [litresS, setLitres] = useState(numStr(record?.litres));
  const [priceS, setPrice] = useState(numStr(record?.price_per_litre ?? settings?.milk_price));
  const [amountS, setAmount] = useState(numStr(record?.amount));
  const [party, setParty] = useState(record?.party || '');
  const [payment, setPayment] = useState(record?.payment || 'Mobile money');
  const [notes, setNotes] = useState(record?.notes || '');
  const isMilk = kind === 'income' && category === 'Milk sales';
  // settings load asynchronously: fill the usual milk price once they arrive
  useEffect(() => { if (!record && settings?.milk_price) setPrice((p) => p || String(settings.milk_price)); }, [settings?.milk_price, record]);
  const linked = !!(record?.health_id || record?.breeding_id || record?.feed_move_id || (record?.animal_id && ['Animal sales', 'Animal purchase'].includes(record.category)));
  const computed = isMilk ? (toNum(litresS) || 0) * (toNum(priceS) || 0) : toNum(amountS) || 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!(computed > 0)) return;
    await save('transactions', {
      ...(record || {}), date, type: kind, category, amount: Math.round(computed * 100) / 100,
      litres: isMilk ? toNum(litresS) : undefined, price_per_litre: isMilk ? toNum(priceS) : undefined,
      party: party.trim() || undefined, payment, notes: notes.trim() || undefined,
    } as Transaction);
    toast(kind === 'income' ? `Income saved: ${money(computed, cur)}` : `Expense saved: ${money(computed, cur)}`);
    onClose();
  }
  return (
    <Sheet title={record ? 'Edit entry' : kind === 'income' ? (isMilk ? 'Record milk sale' : 'Record income') : 'Record expense'} onClose={onClose}
      actions={<Actions onClose={onClose} disabled={!(computed > 0) || linked} onDelete={record && !linked ? async () => { await remove('transactions', record.id); toast('Deleted'); onClose(); } : undefined} />}>
      <form id="sheet-form" className="form" onSubmit={submit}>
        {linked && <p className="small" style={{ color: 'var(--soon)' }}>This entry comes from a health, breeding, feed or animal record. Edit it there.</p>}
        <Field label="Category">
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} disabled={linked}>
            {(kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required disabled={linked} /></Field>
        {isMilk ? (
          <div className="grid2">
            <Field label="Litres sold"><NumberInput value={litresS} onChange={setLitres} required placeholder="0" /></Field>
            <Field label={`Price per litre (${cur})`}><NumberInput value={priceS} onChange={setPrice} required /></Field>
          </div>
        ) : (
          <Field label={`Amount (${cur})`}><NumberInput big value={amountS} onChange={setAmount} required placeholder="0" disabled={linked} /></Field>
        )}
        {isMilk && <p className="num" style={{ fontSize: 22 }}>{money(computed, cur)}</p>}
        <div className="grid2">
          <Field label={kind === 'income' ? 'Buyer' : 'Paid to'}><input className="input" value={party} onChange={(e) => setParty(e.target.value)} disabled={linked} /></Field>
          <Field label="Payment">
            <select className="select" value={payment} onChange={(e) => setPayment(e.target.value)} disabled={linked}>
              {['Mobile money', 'Cash', 'Bank', 'On credit'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={kind === 'expense' ? 'e.g. Dairy meal 2 × 70 kg' : ''} disabled={linked} /></Field>
      </form>
    </Sheet>
  );
}

// ─── Exit (sold / died / culled) ──────────────────────────────

function ExitForm({ animalId, onClose }: { animalId?: string; onClose: () => void }) {
  const farm = useFarm();
  const settings = useSettings();
  const toast = useToast();
  const [aid, setAid] = useState(animalId || '');
  const [status, setStatus] = useState<'sold' | 'dead' | 'culled'>('sold');
  const [date, setDate] = useState(todayISO());
  const [price, setPrice] = useState('');
  const [buyer, setBuyer] = useState('');
  const [reason, setReason] = useState('');
  const animal = farm.animals.find((a) => a.id === aid);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!animal) return;
    await exitAnimal(animal, { status, date, price: status === 'dead' ? undefined : toNum(price), buyer: buyer.trim() || undefined, reason: reason.trim() || undefined });
    toast(`${animal.tag} marked as ${status === 'dead' ? 'died' : status}`);
    onClose();
  }
  return (
    <Sheet title="Animal sold or died" onClose={onClose} actions={<Actions onClose={onClose} />}>
      <form id="sheet-form" className="form" onSubmit={submit}>
        <Field label="Animal"><AnimalSelect animals={farm.animals.filter((a) => a.status === 'active')} value={aid} onChange={setAid} /></Field>
        <Segmented full value={status} onChange={setStatus} label="What happened" options={[{ value: 'sold', label: 'Sold' }, { value: 'dead', label: 'Died' }, { value: 'culled', label: 'Culled / slaughtered' }]} />
        <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
        {status !== 'dead' && <div className="grid2">
          <Field label={`Price (${settings?.currency || 'UGX'})`} hint="Added to income"><NumberInput value={price} onChange={setPrice} placeholder="0" /></Field>
          <Field label="Buyer"><input className="input" value={buyer} onChange={(e) => setBuyer(e.target.value)} /></Field>
        </div>}
        <Field label={status === 'dead' ? 'Cause of death' : 'Reason'}><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={status === 'dead' ? 'e.g. East Coast Fever' : 'e.g. Low yield, bull calf'} /></Field>
        <p className="small muted">The animal's records are kept. You can undo this from its page.</p>
      </form>
    </Sheet>
  );
}

// ─── Weight ───────────────────────────────────────────────────

function WeightForm({ animalId, record, onClose }: { animalId?: string; record?: WeightRecord; onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const [aid, setAid] = useState(record?.animal_id || animalId || '');
  const [date, setDate] = useState(record?.date || todayISO());
  const [kg, setKg] = useState(numStr(record?.kg));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = toNum(kg);
    if (!aid || !v) return;
    await save('weights', { ...(record || {}), animal_id: aid, date, kg: v } as WeightRecord);
    toast('Weight saved');
    onClose();
  }
  return (
    <Sheet title="Record weight" onClose={onClose} actions={<Actions onClose={onClose} onDelete={record ? async () => { await remove('weights', record.id); onClose(); } : undefined} />}>
      <form id="sheet-form" className="form" onSubmit={submit}>
        <Field label="Animal"><AnimalSelect animals={farm.animals.filter((a: Animal) => a.status === 'active')} value={aid} onChange={setAid} /></Field>
        <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label="Weight (kg)" hint="A weigh band gives a good estimate"><NumberInput big value={kg} onChange={setKg} required /></Field>
      </form>
    </Sheet>
  );
}

export { label };
