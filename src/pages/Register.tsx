import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, Tags } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useFarm, useSettings } from '../db/hooks';
import { FEEDING_LABEL, STOCK_CLASSES, type Feeding, type StockMonth } from '../db/types';
import { apply, plan, startedFromRegister } from '../lib/bootstrap';
import { ranchClass } from '../lib/herd';
import { ageInMonths, todayISO } from '../lib/dates';
import { money, num } from '../lib/format';
import { computedClosing, fmtYM, fmtYMShort, issues, months, nextMonth, prevMonth, rowsFor, saveMonth, totals, FIELDS, type Field } from '../lib/register';
import { Bars, Empty, Field as FormField, NumberInput, Sheet, useToast } from '../components/ui';

const LABEL: Record<Field, string> = { opening: 'B/F', births: 'Births', grade_in: 'Graded in', purchased: 'Bought', deaths: 'Deaths', grade_out: 'Graded out', sold: 'Sold', closing: 'Closing' };
const EDIT: Field[] = ['births', 'grade_in', 'purchased', 'deaths', 'grade_out', 'sold'];

type Draft = Record<string, Record<Field | 'unit_value', string>>;

function MonthForm({ month, onClose }: { month: string; onClose: () => void }) {
  const farm = useFarm();
  const settings = useSettings();
  const toast = useToast();
  const existing = rowsFor(farm.stock, month);
  const prev = rowsFor(farm.stock, prevMonth(month));
  const classes = [...new Set([...STOCK_CLASSES, ...prev.map((r) => r.cls), ...existing.map((r) => r.cls)])];
  const [draft, setDraft] = useState<Draft>({});
  useEffect(() => {
    const d: Draft = {};
    for (const cls of classes) {
      const ex = existing.find((r) => r.cls === cls); const pv = prev.find((r) => r.cls === cls);
      const src: any = ex || { opening: pv?.closing ?? 0, unit_value: pv?.unit_value };
      d[cls] = {} as any;
      for (const f of [...FIELDS, 'unit_value'] as const) d[cls][f] = src[f] ? String(src[f]) : f === 'opening' ? String(src.opening ?? 0) : '';
    }
    setDraft(d);
  }, [month, farm.stock.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = (cls: string, f: Field | 'unit_value') => Number(draft[cls]?.[f] || 0);
  const closingOf = (cls: string) => computedClosing(Object.fromEntries(FIELDS.map((f) => [f, n(cls, f)])) as any);
  const gi = classes.reduce((s, c) => s + n(c, 'grade_in'), 0), go = classes.reduce((s, c) => s + n(c, 'grade_out'), 0);
  const set = (cls: string, f: Field | 'unit_value', v: string) => setDraft((d) => ({ ...d, [cls]: { ...d[cls], [f]: v } }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const rows = classes.map((cls) => ({
      month, cls, opening: n(cls, 'opening'), births: n(cls, 'births'), grade_in: n(cls, 'grade_in'), purchased: n(cls, 'purchased'),
      deaths: n(cls, 'deaths'), grade_out: n(cls, 'grade_out'), sold: n(cls, 'sold'), closing: closingOf(cls), unit_value: n(cls, 'unit_value') || undefined,
      remarks: existing.find((r) => r.cls === cls)?.remarks, source: 'app',
    })).filter((r) => r.opening || r.closing || r.births || r.purchased || existing.some((x) => x.cls === r.cls));
    await saveMonth(month, rows, existing);
    toast(`${fmtYM(month)} saved: ${rows.reduce((s, r) => s + r.closing, 0)} head`);
    onClose();
  }
  return (
    <Sheet title={`${existing.length ? 'Edit' : 'Record'} ${fmtYM(month)}`} wide onClose={onClose} actions={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" form="reg-form">Save month</button></>}>
      <form id="reg-form" className="form" onSubmit={submit}>
        <p className="small muted">Brought forward comes from last month's closing. Enter this month's movements; the closing count is worked out for you.</p>
        {classes.map((cls) => (
          <div key={cls} className="panel pad stack-sm">
            <div className="spread"><b>{cls}</b><span className="small">B/F <b className="num">{n(cls, 'opening')}</b> → closing <b className="num">{closingOf(cls)}</b></span></div>
            <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))' }}>
              {EDIT.map((f) => (
                <FormField key={f} label={LABEL[f]}><NumberInput value={draft[cls]?.[f] ?? ''} onChange={(v) => set(cls, f, v)} placeholder="0" aria-label={`${cls} ${LABEL[f]}`} /></FormField>
              ))}
              <FormField label={`Value/head (${settings?.currency || 'UGX'})`}><NumberInput value={draft[cls]?.unit_value ?? ''} onChange={(v) => set(cls, 'unit_value', v)} /></FormField>
            </div>
          </div>
        ))}
        {gi !== go && <p className="error">{go} graded out but {gi} graded in. Each animal that changes class should be graded out of one and into another.</p>}
      </form>
    </Sheet>
  );
}

const ageText = (dob?: string) => { if (!dob) return ''; const m = ageInMonths(dob); return m < 24 ? `${m} mo` : `${Math.floor(m / 12)} yr`; };

function StartTracking({ onClose }: { onClose: () => void }) {
  const farm = useFarm();
  const settings = useSettings();
  const toast = useToast();
  const nav = useNavigate();
  const [breed, setBreed] = useState(settings?.default_breed || '');
  const [feeding, setFeeding] = useState<Feeding>(settings?.default_feeding || 'grazing_supplement');
  const [groups, setGroups] = useState(true);
  const [busy, setBusy] = useState(false);
  const p = useMemo(() => plan(farm.stock, { breed: breed.trim() || undefined, feeding, group: groups ? (c) => c : undefined }), [farm.stock, breed, feeding, groups]);
  if (!p) return null;
  async function go() {
    setBusy(true);
    const r = await apply(p!);
    toast(`${r.created} animals added${r.existed ? ` (${r.existed} were already there)` : ''}`);
    nav('/animals?filter=untagged');
  }
  return (
    <Sheet title="Start tracking each animal" wide onClose={onClose} actions={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={go}>Create {p.total} records</button></>}>
      <div className="form">
        <p className="small">FarmOS will create one record for every animal counted in <b>{fmtYM(p.month)}</b>, each with a temporary number like <span className="tag">TMP-HF-001</span>. When an animal gets its ear tag, open it and type the real number. Ages are estimated from the births in the register — correct any you know.</p>
        <div className="panel table-wrap"><table className="table">
          <thead><tr><th>Class</th><th className="r">Head</th><th>Numbers</th><th>Estimated age</th></tr></thead>
          <tbody>{p.rows.map((r) => (
            <tr key={r.cls}><td>{r.cls}</td><td className="r">{num(r.count)}</td><td className="tiny">TMP-{r.prefix}-001…{String(r.count).padStart(3, '0')}</td>
              <td className="small">{r.newestDob ? (ageText(r.newestDob) === ageText(r.oldestDob) ? ageText(r.newestDob) : `${ageText(r.newestDob)} – ${ageText(r.oldestDob)}`) : 'Unknown (adult)'}{r.capped ? <div className="tiny muted">{r.capped} older than recorded births allow — set to {ageText(r.oldestDob)}</div> : null}</td></tr>
          ))}</tbody>
        </table></div>
        {p.skipped.length > 0 && <p className="small muted">Not created (class not recognised): {p.skipped.map((x) => `${x.count} ${x.cls}`).join(', ')}.</p>}
        <div className="grid2">
          <FormField label="Breed of most animals" hint="Change individual animals later"><input className="input" list="boot-breeds" value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="e.g. Ankole" />
            <datalist id="boot-breeds">{['Ankole', 'Friesian x Ankole', 'Boran', 'Friesian'].map((b) => <option key={b} value={b} />)}</datalist></FormField>
          <FormField label="Feeding"><select className="select" value={feeding} onChange={(e) => setFeeding(e.target.value as Feeding)}>{(Object.keys(FEEDING_LABEL) as Feeding[]).map((f) => <option key={f} value={f}>{FEEDING_LABEL[f]}</option>)}</select></FormField>
        </div>
        <label className="row"><input type="checkbox" checked={groups} onChange={(e) => setGroups(e.target.checked)} style={{ width: 22, height: 22 }} /> Put each class in its own group (Cows, Heifers…)</label>
      </div>
    </Sheet>
  );
}

function RecordsVsRegister({ month }: { month: string }) {
  const farm = useFarm();
  const live = farm.animals.filter((a) => a.status === 'active');
  const rows = rowsFor(farm.stock, month);
  const counts = new Map<string, number>();
  live.forEach((a) => { const c = ranchClass(a, farm.breeding); counts.set(c, (counts.get(c) || 0) + 1); });
  const classes = [...new Set([...rows.map((r) => r.cls), ...counts.keys()])];
  const tagged = live.filter((a) => !a.provisional).length;
  const over = live.filter((a) => a.sex === 'F' && ranchClass(a, farm.breeding) === 'Heifers' && a.group === 'Female calves').length;
  return (
    <section className="section">
      <header><h2>Animal records vs register</h2><Link to="/animals?filter=untagged" className="small">{num(live.length - tagged)} not tagged yet</Link></header>
      <div className="panel pad stack-sm">
        <div className="spread small"><span><Tags size={16} style={{ verticalAlign: -3 }} /> Tagged</span><b>{num(tagged)} of {num(live.length)}</b></div>
        <div style={{ height: 8, borderRadius: 4, background: 'var(--line)' }}><div style={{ width: `${live.length ? (100 * tagged) / live.length : 0}%`, height: 8, borderRadius: 4, background: 'var(--primary)' }} /></div>
      </div>
      <div className="panel table-wrap"><table className="table">
        <thead><tr><th>Class</th><th className="r">Register {fmtYMShort(month)}</th><th className="r">Records today</th><th className="r">Diff</th></tr></thead>
        <tbody>{classes.map((c) => { const reg = rows.find((r) => r.cls === c)?.closing || 0, rec = counts.get(c) || 0; return (
          <tr key={c}><td>{c}</td><td className="r">{num(reg)}</td><td className="r">{num(rec)}</td><td className="r" style={{ color: rec !== reg ? 'var(--soon)' : undefined }}>{rec === reg ? '✓' : (rec > reg ? '+' : '−') + num(Math.abs(rec - reg))}</td></tr>
        ); })}</tbody>
      </table></div>
      {over > 0 && <p className="small muted">{num(over)} animals in the “Female calves” group are now over 12 months, so their records count them as heifers. Grade them in the register when you next record the month.</p>}
    </section>
  );
}

export default function Register() {
  const farm = useFarm();
  const settings = useSettings();
  const cur = settings?.currency || 'UGX';
  const ms = useMemo(() => months(farm.stock), [farm.stock]);
  const latest = ms[ms.length - 1];
  const [month, setMonth] = useState<string | undefined>();
  const [editing, setEditing] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const started = startedFromRegister(farm.animals).length > 0;
  useEffect(() => { if (!month && latest) setMonth(latest); }, [latest, month]);
  const m = month || latest;
  const rows = m ? rowsFor(farm.stock, m) : [];
  const t = totals(rows);
  const iss = m ? issues(farm.stock, m) : [];
  const year = m?.slice(0, 4);
  const trend = ms.filter((x) => x.slice(0, 4) === year).map((x) => ({ label: fmtYMShort(x).slice(0, 3), value: totals(rowsFor(farm.stock, x)).closing }));
  const yearIssues = ms.filter((x) => x.slice(0, 4) === year).reduce((s, x) => s + issues(farm.stock, x).length, 0);
  const current = todayISO().slice(0, 7);
  const nextToRecord = latest ? (latest < current ? nextMonth(latest) : null) : current;

  if (farm.loading) return null;
  if (!ms.length) return (
    <div className="stack">
      <h1>Herd register</h1>
      <Empty title="No monthly stock records yet" action={<button className="btn primary" onClick={() => setEditing(current)}>Record {fmtYM(current)}</button>}>
        Keep the monthly stock count by class — cows, heifers, bulls, castrates, calves — with births, deaths, grading, purchases and sales. Ranch ledgers can also be imported into the cloud.
      </Empty>
      {editing && <MonthForm month={editing} onClose={() => setEditing(null)} />}
    </div>
  );

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head">
        <div><h1>Herd register</h1><p>Monthly stock by class · {ms.length} months on record ({fmtYM(ms[0])} – {fmtYM(latest)})</p></div>
        <div className="row wrap">
          {nextToRecord && <button className="btn primary" onClick={() => setEditing(nextToRecord)}>Record {fmtYM(nextToRecord)}</button>}
          {m && <button className="btn secondary" onClick={() => setEditing(m)}>Edit {fmtYMShort(m)}</button>}
        </div>
      </div>

      <div className="spread panel" style={{ padding: 4 }}>
        <button className="iconbtn" disabled={!m || m <= ms[0]} onClick={() => m && setMonth(ms[ms.indexOf(m) - 1])} aria-label="Previous month"><ChevronLeft /></button>
        <select className="select" style={{ border: 0, width: 'auto', fontWeight: 700, background: 'transparent' }} value={m} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          {[...ms].reverse().map((x) => <option key={x} value={x}>{fmtYM(x)}</option>)}
        </select>
        <button className="iconbtn" disabled={!m || m >= latest} onClick={() => m && setMonth(ms[ms.indexOf(m) + 1])} aria-label="Next month"><ChevronRight /></button>
      </div>

      <div className="report"><div className="kv">
        <div><b>{num(t.closing)}</b><span>head at close of {fmtYMShort(m!)}</span></div>
        <div><b>{num(t.births)}</b><span>born · {num(t.deaths)} died</span></div>
        <div><b>{num(t.sold)}</b><span>sold · {num(t.purchased)} bought</span></div>
        <div><b>{money(t.value, cur, { compact: true })}</b><span>herd value at close</span></div>
      </div></div>

      {!started && (
        <div className="panel pad stack-sm" style={{ borderColor: 'var(--primary)' }}>
          <b>Track every animal, not just the totals</b>
          <p className="small">Create a record for each of the {num(totals(rowsFor(farm.stock, latest)).closing)} head in {fmtYM(latest)}. FarmOS then follows each calf as it grows, says when heifers should be ready to serve and steers ready to sell, and forecasts milk. Temporary numbers are used until animals are ear-tagged.</p>
          <div><button className="btn primary" onClick={() => setStarting(true)}>Start tracking each animal</button></div>
        </div>
      )}

      {iss.length > 0 && (
        <div className="panel pad stack-sm" style={{ borderColor: 'var(--soon)' }}>
          <div className="row"><AlertTriangle size={20} color="var(--soon)" /><b>{iss.length} {iss.length === 1 ? 'figure doesn’t' : 'figures don’t'} add up this month</b></div>
          {iss.map((x, i) => <p key={i} className="small"><b>{x.cls}:</b> {x.text}</p>)}
        </div>
      )}

      <section className="section">
        <h2>By class</h2>
        <div className="panel table-wrap narrow-only"><table className="table">
          <thead><tr><th>Class</th><th className="r">B/F</th><th className="r">In</th><th className="r">Out</th><th className="r">Closing</th></tr></thead>
          <tbody>
            {rows.map((r: StockMonth) => {
              const inn = r.births + r.grade_in + r.purchased, out = r.deaths + r.grade_out + r.sold;
              const parts = (xs: [number, string][]) => xs.filter(([v]) => v).map(([v, l]) => `${v} ${l}`).join(', ');
              return (
                <tr key={r.id}>
                  <td>{r.cls}{(inn || out) ? <div className="tiny muted">{parts([[r.births, 'born'], [r.grade_in, 'graded in'], [r.purchased, 'bought'], [r.deaths, 'died'], [r.grade_out, 'graded out'], [r.sold, 'sold']])}</div> : null}{r.remarks ? <div className="tiny muted">{r.remarks}</div> : null}</td>
                  <td className="r">{num(r.opening)}</td><td className="r">{inn ? `+${num(inn)}` : '—'}</td><td className="r">{out ? `−${num(out)}` : '—'}</td><td className="r"><b>{num(r.closing)}</b></td>
                </tr>
              );
            })}
            <tr><td><b>Total</b></td><td className="r"><b>{num(t.opening)}</b></td><td className="r"><b>+{num(t.births + t.grade_in + t.purchased)}</b></td><td className="r"><b>−{num(t.deaths + t.grade_out + t.sold)}</b></td><td className="r"><b>{num(t.closing)}</b></td></tr>
          </tbody>
        </table></div>
        <div className="panel table-wrap wide-only"><table className="table">
          <thead><tr><th>Class</th>{FIELDS.map((f) => <th key={f} className="r">{LABEL[f]}</th>)}<th className="r">Value</th></tr></thead>
          <tbody>
            {rows.map((r: StockMonth) => (
              <tr key={r.id}><td>{r.cls}{r.remarks ? <div className="tiny muted">{r.remarks}</div> : null}</td>{FIELDS.map((f) => <td key={f} className="r" style={f === 'closing' ? { fontWeight: 700 } : undefined}>{r[f] ? num(r[f]) : f === 'closing' || f === 'opening' ? '0' : '—'}</td>)}<td className="r">{r.unit_value ? money(r.closing * r.unit_value, cur, { compact: true }) : '—'}</td></tr>
            ))}
            <tr><td><b>Total</b></td>{FIELDS.map((f) => <td key={f} className="r"><b>{num(t[f])}</b></td>)}<td className="r"><b>{money(t.value, cur, { compact: true })}</b></td></tr>
          </tbody>
        </table></div>
      </section>

      <section className="section">
        <header><h2>{year}: head count by month</h2>{yearIssues > 0 && <span className="small" style={{ color: 'var(--soon)' }}>{yearIssues} figures to check this year</span>}</header>
        <div className="panel pad"><Bars data={trend} /></div>
      </section>
      {started && <RecordsVsRegister month={latest} />}
      {editing && <MonthForm month={editing} onClose={() => setEditing(null)} />}
      {starting && <StartTracking onClose={() => setStarting(false)} />}
    </div>
  );
}
