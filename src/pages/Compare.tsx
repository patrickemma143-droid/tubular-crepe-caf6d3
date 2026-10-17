import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSettings } from '../db/hooks';
import { endOfMonth, todayISO } from '../lib/dates';
import { listFarms, loadFarm } from '../lib/farms';
import type { Farm } from '../lib/herd';
import { buildReport, type Period } from '../lib/report';
import { fmtYM, months, rowsFor, totals } from '../lib/register';
import { money, num } from '../lib/format';
import { Empty, Segmented } from '../components/ui';

// Side-by-side figures for every farm on this device, for a year or a month.

interface Loaded { key: string; name: string; farm: Farm; active: boolean }
const COLORS = ['#2F7D4A', '#C27C1E', '#3767A8', '#8A4FA0'];

const yearPeriod = (y: number): Period => ({ kind: 'custom', start: `${y}-01-01`, end: `${y}-12-31`, title: String(y) });
const monthP = (ym: string): Period => ({ kind: 'month', start: `${ym}-01`, end: endOfMonth(`${ym}-01`), title: fmtYM(ym) });

function yearsWithData(f: Farm): Set<number> {
  const ys = new Set<number>();
  const add = (d?: string) => { if (d) ys.add(Number(d.slice(0, 4))); };
  f.milk.forEach((m) => add(m.date)); f.transactions.forEach((t) => add(t.date)); f.stock.forEach((s) => add(s.month));
  f.animals.forEach((a) => { add(a.dob); add(a.exit_date); });
  return ys;
}

const NOT_CATTLE = /goat|pig|sheep|poultry|chicken|hen|rabbit|duck/i;
const isCattle = (cls: string) => !NOT_CATTLE.test(cls);

/** Head count and herd value at the end of the period: animal records if the farm keeps them, else the register. */
function herdAt(f: Farm, end: string) {
  const today = todayISO();
  if (f.animals.length) {
    const on = end > today ? today : end;
    const live = f.animals.filter((a) => (!a.dob || a.dob <= on) && (a.status === 'active' || (a.exit_date && a.exit_date > on)));
    return { head: live.length, other: 0, value: null as number | null, asOf: on, source: 'animal records' };
  }
  const ms = months(f.stock).filter((m) => m <= end.slice(0, 7));
  const m = ms[ms.length - 1];
  if (!m) return null;
  const rows = rowsFor(f.stock, m);
  const cattle = totals(rows.filter((r) => isCattle(r.cls))), other = totals(rows.filter((r) => !isCattle(r.cls)));
  return { head: cattle.closing, other: other.closing, value: (cattle.value + other.value) || null, asOf: `${m}-28`, source: `register, ${fmtYM(m)}` };
}

export default function Compare() {
  const settings = useSettings();
  const cur = settings?.currency || 'UGX';
  const [farms, setFarms] = useState<Loaded[] | null>(null);
  const [mode, setMode] = useState<'year' | 'month'>('year');
  const [year, setYear] = useState<number | null>(null);
  const [ym, setYm] = useState(todayISO().slice(0, 7));

  useEffect(() => {
    (async () => {
      const list = await listFarms();
      const out: Loaded[] = [];
      for (const f of list) out.push({ key: f.key, name: f.name, active: f.active, ...(await loadFarm(f.key)) } as any);
      setFarms(out);
    })();
  }, []);

  const years = useMemo(() => {
    const all = new Set<number>();
    (farms || []).forEach((f) => yearsWithData(f.farm).forEach((y) => all.add(y)));
    return [...all].filter((y) => y <= new Date().getFullYear()).sort();
  }, [farms]);
  useEffect(() => {
    if (year != null || !farms) return;
    // default: the latest year in which every farm has records, else the latest year with any
    const shared = years.filter((y) => farms.every((f) => yearsWithData(f.farm).has(y)));
    setYear(shared[shared.length - 1] ?? years[years.length - 1] ?? new Date().getFullYear());
  }, [years, farms, year]);

  const period = mode === 'year' ? yearPeriod(year ?? new Date().getFullYear()) : monthP(ym);
  const rows = useMemo(() => (farms || []).map((f) => {
    const rep = buildReport(f.farm, period);
    const herd = herdAt(f.farm, period.end);
    const reg = rep.register;
    const useReg = !f.farm.animals.length && reg.months.length > 0;
    const cattle = reg.byClass.filter((c) => isCattle(c.cls));
    const regSum = (k: 'births' | 'deaths' | 'sold' | 'purchased') => cattle.reduce((s2, c) => s2 + c[k], 0);
    const born = useReg ? regSum('births') : rep.herd.births.length;
    const died = useReg ? regSum('deaths') : rep.herd.died.length;
    const sold = useReg ? regSum('sold') : rep.herd.sold.length;
    const bought = useReg ? regSum('purchased') : rep.herd.purchases.length;
    const inc = (c: string) => rep.money.incomeBy.find(([k]) => k === c)?.[1] || 0;
    const topExp = rep.money.expenseBy[0];
    return { f, rep, herd, born, died, sold, bought, milkIncome: inc('Milk sales'), animalSales: inc('Animal sales'), topExp, hasAny: rep.milk.total > 0 || rep.money.income > 0 || rep.money.expenses > 0 || !!reg.months.length };
  }), [farms, period.start, period.end]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!farms) return null;
  if (farms.length < 2) return (
    <div className="stack">
      <h1>Compare farms</h1>
      <Empty title="Only one farm on this device">Add another farm from the farm name at the top of the screen, or open a FarmOS data file under Settings.</Empty>
    </div>
  );

  const step = (d: 1 | -1) => {
    if (mode === 'year') setYear((y) => (y ?? 0) + d);
    else { const [y, m] = ym.split('-').map(Number); const n = new Date(y, m - 1 + d, 1); setYm(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`); }
  };
  const total = (fn: (r: (typeof rows)[number]) => number | null | undefined) => rows.reduce((s, r) => s + (fn(r) || 0), 0);
  type Line = { label: string; get: (r: (typeof rows)[number]) => number | null | undefined; fmt: (v: number) => string; sum?: boolean; hint?: (r: (typeof rows)[number]) => string | undefined };
  const M = (v: number) => money(v, cur, { compact: true });
  const groups: { title: string; lines: Line[] }[] = [
    { title: 'Herd', lines: [
      { label: 'Cattle at end', get: (r) => r.herd?.head, fmt: num, sum: true, hint: (r) => r.herd ? `from ${r.herd.source}` : 'no herd records' },
      { label: 'Goats, pigs & other', get: (r) => r.herd ? r.herd.other : null, fmt: num, sum: true },
      { label: 'Herd value', get: (r) => r.herd?.value, fmt: M, sum: true },
      { label: 'Calves born', get: (r) => r.born, fmt: num, sum: true },
      { label: 'Cattle died', get: (r) => r.died, fmt: num, sum: true },
      { label: 'Cattle sold', get: (r) => r.sold, fmt: num, sum: true },
      { label: 'Cattle bought', get: (r) => r.bought, fmt: num, sum: true },
    ] },
    { title: 'Milk', lines: [
      { label: 'Milk recorded (L)', get: (r) => r.rep.milk.total, fmt: (v) => num(Math.round(v)), sum: true },
      { label: 'Per recorded day (L)', get: (r) => r.rep.milk.recordedDays ? r.rep.milk.perDay : null, fmt: (v) => v.toFixed(1), hint: (r) => r.rep.milk.recordedDays ? `${r.rep.milk.recordedDays} days recorded` : undefined },
      { label: 'Price per litre', get: (r) => r.rep.money.pricePerLitre, fmt: (v) => money(v, cur) },
    ] },
    { title: 'Money', lines: [
      { label: 'Milk sales', get: (r) => r.milkIncome, fmt: M, sum: true },
      { label: 'Animal sales', get: (r) => r.animalSales, fmt: M, sum: true },
      { label: 'All income', get: (r) => r.rep.money.income, fmt: M, sum: true },
      { label: 'Expenses', get: (r) => r.rep.money.expenses, fmt: M, sum: true },
      { label: 'Profit / loss', get: (r) => r.rep.money.net, fmt: M, sum: true },
      { label: 'Biggest cost', get: (r) => r.topExp?.[1], fmt: M, hint: (r) => r.topExp?.[0] },
    ] },
  ];
  const bars: { label: string; get: (r: (typeof rows)[number]) => number; fmt: (v: number) => string }[] = [
    { label: 'Cattle', get: (r) => r.herd?.head || 0, fmt: num },
    { label: 'Milk (L)', get: (r) => r.rep.milk.total, fmt: (v) => num(Math.round(v)) },
    { label: 'Income', get: (r) => r.rep.money.income, fmt: M },
    { label: 'Expenses', get: (r) => r.rep.money.expenses, fmt: M },
  ];
  const nothing = rows.every((r) => !r.hasAny);

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head"><div><h1>Compare farms</h1><p>{rows.map((r) => r.f.name).join(' · ')}</p></div></div>
      <div className="stack-sm">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'year', label: 'By year' }, { value: 'month', label: 'By month' }]} />
        <div className="spread panel" style={{ padding: 4 }}>
          <button className="iconbtn" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft /></button>
          {mode === 'year'
            ? <select className="select" style={{ border: 0, width: 'auto', fontWeight: 700, background: 'transparent' }} value={year ?? ''} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year">
                {[...new Set([...years, year ?? new Date().getFullYear()])].sort().reverse().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            : <b>{period.title}</b>}
          <button className="iconbtn" onClick={() => step(1)} aria-label="Next"><ChevronRight /></button>
        </div>
        {mode === 'year' && years.length > 0 && <p className="small muted">Years with records: {years.map((y) => `${y}${farms.filter((f) => yearsWithData(f.farm).has(y)).length === farms.length ? '' : '*'}`).join(', ')} <span className="tiny">(* only one farm has records that year)</span></p>}
      </div>

      {nothing ? <Empty title={`No records for ${period.title}`}>Try another {mode}.</Empty> : (
        <>
          <section className="section">
            <h2>At a glance</h2>
            <div className="panel pad stack">
              {bars.map((b) => {
                const max = Math.max(1, ...rows.map(b.get));
                return (
                  <div key={b.label} className="stack-sm">
                    <b className="small">{b.label}</b>
                    {rows.map((r, i) => (
                      <div key={r.f.key} className="cmpbar">
                        <span className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.f.name}</span>
                        <span className="bar"><i style={{ width: `${(100 * b.get(r)) / max}%`, background: COLORS[i % COLORS.length] }} /></span>
                        <b className="small num">{b.fmt(b.get(r))}</b>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="section">
            <h2>Side by side</h2>
            <div className="panel table-wrap"><table className="cmp">
              <thead><tr><th>{period.title}</th>{rows.map((r) => <th key={r.f.key}>{r.f.active ? <b>{r.f.name}</b> : r.f.name}</th>)}<th>Both farms</th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.title}>
                    <tr className="group"><td colSpan={rows.length + 2}>{g.title}</td></tr>
                    {g.lines.map((l) => {
                      const vals = rows.map(l.get);
                      const known = vals.filter((v): v is number => v != null);
                      const best = known.length > 1 ? Math.max(...known) : null;
                      return (
                        <tr key={g.title + l.label}>
                          <td>{l.label}</td>
                          {rows.map((r, i) => {
                            const v = vals[i];
                            return <td key={r.f.key} className={v != null && best && v === best && !/Expenses|died|Biggest cost/.test(l.label) ? 'lead' : undefined}>
                              {v == null ? '—' : l.fmt(v)}{l.hint?.(r) ? <div className="tiny muted">{l.hint(r)}</div> : null}
                            </td>;
                          })}
                          <td>{l.sum ? l.fmt(total(l.get)) : ''}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table></div>
            <p className="small muted">Herd figures come from each farm's animal records where it keeps them, otherwise from its herd register; births, deaths and sales count cattle only. Open a farm's Reports for the full detail. <Link to="/reports">Reports</Link></p>
          </section>
        </>
      )}
    </div>
  );
}
