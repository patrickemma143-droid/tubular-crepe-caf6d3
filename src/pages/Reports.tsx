import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileDown, Printer, Sheet as SheetIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFarm, useSettings } from '../db/hooks';
import { fmtDate, fmtShort, todayISO, addDays } from '../lib/dates';
import { buildReport, monthPeriod, shiftPeriod, weekPeriod, type Period } from '../lib/report';
import { litres, money, pct, num } from '../lib/format';
import { fmtYM } from '../lib/register';
import { label } from '../lib/herd';
import { Bars, Field, Segmented, useToast } from '../components/ui';
import { reportToExcel, reportToPDF } from '../lib/export';
import { fmtQty } from '../lib/feed';
import { herdOutlook } from '../lib/outlook';

const CAT: Record<string, [string, string]> = { Cow: ['cow', 'cows'], Heifer: ['heifer', 'heifers'], Calf: ['calf', 'calves'], Bull: ['bull', 'bulls'], Castrate: ['castrate', 'castrates'] };

export default function Reports() {
  const farm = useFarm();
  const settings = useSettings();
  const toast = useToast();
  const t = todayISO();
  const [kind, setKind] = useState<Period['kind']>('month');
  const [period, setPeriod] = useState<Period>(monthPeriod(t));
  const [busy, setBusy] = useState('');
  const rep = useMemo(() => {
    const r = buildReport(farm, period);
    const asOf = period.end > t ? t : period.end;
    return { ...r, outlook: farm.animals.length ? herdOutlook(farm, settings, asOf) : undefined };
  }, [farm, period, settings, t]);
  const cur = settings?.currency || 'UGX';

  const pick = (k: Period['kind']) => {
    setKind(k);
    if (k === 'week') setPeriod(weekPeriod(t));
    if (k === 'month') setPeriod(monthPeriod(t));
    if (k === 'custom') setPeriod({ kind: 'custom', start: addDays(t, -29), end: t, title: 'Custom' });
  };
  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    try { await fn(); toast(`${what} downloaded`); } catch (e: any) { toast(`Couldn't create the ${what}: ${e?.message || e}`); } finally { setBusy(''); }
  };
  const h = rep.herd;

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head">
        <div><h1>Reports</h1><p>Weekly and monthly summaries you can download or print.</p></div>
        <div className="row wrap no-print">
          <button className="btn primary" disabled={!!busy || !settings} onClick={() => run('PDF', () => reportToPDF(rep, settings!))}><FileDown size={18} /> {busy === 'PDF' ? 'Preparing…' : 'PDF'}</button>
          <button className="btn secondary" disabled={!!busy || !settings} onClick={() => run('Excel file', () => reportToExcel(rep, settings!))}><SheetIcon size={18} /> Excel</button>
          <button className="btn secondary" onClick={() => window.print()}><Printer size={18} /> Print</button>
        </div>
      </div>

      <div className="stack-sm no-print">
        <Segmented value={kind} onChange={pick} options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }, { value: 'custom', label: 'Choose dates' }]} />
        {kind === 'custom' ? (
          <div className="grid2">
            <Field label="From"><input className="input" type="date" value={period.start} max={period.end} onChange={(e) => setPeriod({ ...period, start: e.target.value, title: '' })} /></Field>
            <Field label="To"><input className="input" type="date" value={period.end} min={period.start} max={t} onChange={(e) => setPeriod({ ...period, end: e.target.value, title: '' })} /></Field>
          </div>
        ) : (
          <div className="spread panel" style={{ padding: 4 }}>
            <button className="iconbtn" onClick={() => setPeriod(shiftPeriod(period, -1))} aria-label="Previous"><ChevronLeft /></button>
            <b>{period.title}</b>
            <button className="iconbtn" onClick={() => setPeriod(shiftPeriod(period, 1))} disabled={period.end >= t} aria-label="Next"><ChevronRight /></button>
          </div>
        )}
      </div>

      <div className="report">
        <div>
          <h2>{settings?.farm_name} · {kind === 'custom' ? `${fmtDate(period.start)} – ${fmtDate(period.end)}` : period.title}</h2>
          <p className="muted small">{fmtDate(period.start)} to {fmtDate(period.end)} · {rep.days} days{period.end > t ? ' · period still running' : ''}</p>
        </div>

        <section className="section">
          <h3>Herd</h3>
          <div className="panel pad stack-sm">
            <div className="movement">
              <span><b>{h.opening}</b> at start</span>
              <span className="op">+</span><span><b>{h.births.length}</b> born</span>
              <span className="op">+</span><span><b>{h.purchases.length}</b> bought</span>
              <span className="op">−</span><span><b>{h.sold.length}</b> sold</span>
              <span className="op">−</span><span><b>{h.died.length}</b> died</span>
              {h.culled.length > 0 && <><span className="op">−</span><span><b>{h.culled.length}</b> culled</span></>}
              <span className="op">=</span><span><b>{h.closing}</b> at end</span>
            </div>
            <p className="small muted">At end: {Object.entries(h.byCategory).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${CAT[k]?.[v === 1 ? 0 : 1] || k}`).join(', ')}</p>
            {[...h.births.map((a) => ['Born', a, a.dob]), ...h.purchases.map((a) => ['Bought', a, a.acquired_on]), ...h.sold.map((a) => ['Sold', a, a.exit_date]), ...h.died.map((a) => ['Died', a, a.exit_date]), ...h.culled.map((a) => ['Culled', a, a.exit_date])].length > 0 && (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Change</th><th>Animal</th><th>Date</th><th className="r">Value</th></tr></thead>
                <tbody>
                  {h.births.map((a) => <tr key={a.id}><td>Born</td><td><Link to={`/animals/${a.id}`}>{label(a)}</Link> · {a.sex === 'F' ? 'heifer' : 'bull'}</td><td>{fmtDate(a.dob)}</td><td className="r">—</td></tr>)}
                  {h.purchases.map((a) => <tr key={a.id}><td>Bought</td><td><Link to={`/animals/${a.id}`}>{label(a)}</Link></td><td>{fmtDate(a.acquired_on)}</td><td className="r">{a.purchase_price ? money(a.purchase_price, cur) : '—'}</td></tr>)}
                  {h.sold.map((a) => <tr key={a.id}><td>Sold</td><td><Link to={`/animals/${a.id}`}>{label(a)}</Link>{a.buyer ? ` · ${a.buyer}` : ''}</td><td>{fmtDate(a.exit_date)}</td><td className="r">{a.sale_price ? money(a.sale_price, cur) : '—'}</td></tr>)}
                  {h.died.map((a) => <tr key={a.id}><td>Died</td><td><Link to={`/animals/${a.id}`}>{label(a)}</Link>{a.exit_reason ? ` · ${a.exit_reason}` : ''}</td><td>{fmtDate(a.exit_date)}</td><td className="r">—</td></tr>)}
                  {h.culled.map((a) => <tr key={a.id}><td>Culled</td><td><Link to={`/animals/${a.id}`}>{label(a)}</Link></td><td>{fmtDate(a.exit_date)}</td><td className="r">{a.sale_price ? money(a.sale_price, cur) : '—'}</td></tr>)}
                </tbody>
              </table></div>
            )}
          </div>
        </section>

        {rep.register.months.length > 0 && (
          <section className="section">
            <h3>Herd register</h3>
            <p className="small muted">Monthly stock count{rep.register.months.length > 1 ? `, ${fmtYM(rep.register.first!)} to ${fmtYM(rep.register.last!)}` : `, ${fmtYM(rep.register.first!)}`}{kind === 'week' ? ' (the register is kept by month)' : ''}{rep.register.issues ? ` · ${rep.register.issues} figures don’t add up — see Herd register` : ''}</p>
            <div className="panel pad">
              <div className="movement">
                <span><b>{num(rep.register.total.opening)}</b> B/F</span>
                <span className="op">+</span><span><b>{num(rep.register.total.births)}</b> born</span>
                <span className="op">+</span><span><b>{num(rep.register.total.purchased)}</b> bought</span>
                <span className="op">−</span><span><b>{num(rep.register.total.deaths)}</b> died</span>
                <span className="op">−</span><span><b>{num(rep.register.total.sold)}</b> sold</span>
                <span className="op">=</span><span><b>{num(rep.register.total.closing)}</b> closing</span>
              </div>
            </div>
            <div className="panel table-wrap"><table className="table">
              <thead><tr><th>Class</th><th className="r">B/F</th><th className="r">Born</th><th className="r">Graded in/out</th><th className="r">Bought</th><th className="r">Died</th><th className="r">Sold</th><th className="r">Closing</th><th className="r">Value</th></tr></thead>
              <tbody>{rep.register.byClass.map((c) => (
                <tr key={c.cls}><td>{c.cls}</td><td className="r">{num(c.opening)}</td><td className="r">{num(c.births)}</td><td className="r">+{num(c.grade_in)} / −{num(c.grade_out)}</td><td className="r">{num(c.purchased)}</td><td className="r">{num(c.deaths)}</td><td className="r">{num(c.sold)}</td><td className="r"><b>{num(c.closing)}</b></td><td className="r">{money(c.value, cur, { compact: true })}</td></tr>
              ))}
              <tr><td><b>Total</b></td><td className="r"><b>{num(rep.register.total.opening)}</b></td><td className="r"><b>{num(rep.register.total.births)}</b></td><td className="r"><b>+{num(rep.register.total.grade_in)} / −{num(rep.register.total.grade_out)}</b></td><td className="r"><b>{num(rep.register.total.purchased)}</b></td><td className="r"><b>{num(rep.register.total.deaths)}</b></td><td className="r"><b>{num(rep.register.total.sold)}</b></td><td className="r"><b>{num(rep.register.total.closing)}</b></td><td className="r"><b>{money(rep.register.total.value, cur, { compact: true })}</b></td></tr>
              </tbody>
            </table></div>
          </section>
        )}

        {rep.outlook && rep.outlook.total > 0 && (() => { const o = rep.outlook; return (
          <section className="section">
            <h3>Herd outlook — next 3 months from {fmtDate(o.asOf)}</h3>
            <div className="kv">
              <div><b>{o.calvingsDue.length}</b><span>calvings due</span></div>
              <div><b>{o.readyToServe.length} + {o.readySoon.length}</b><span>heifers ready to serve now + coming</span></div>
              <div><b>{o.saleReady.length} + {o.saleSoon.length}</b><span>bulls/steers at sale weight now + coming</span></div>
              <div><b>{o.milkingCows ? litres(o.milkNext30, 0) : '—'}</b><span>expected milk next 30 days</span></div>
              <div><b>{o.slowGrowers.length}</b><span>slow growers</span></div>
              <div><b>{num(o.tagged)} / {num(o.total)}</b><span>animals ear-tagged</span></div>
            </div>
            {(o.calvingsDue.length > 0 || o.readySoon.length > 0 || o.saleSoon.length > 0) && (
              <div className="panel table-wrap"><table className="table">
                <thead><tr><th>Animal</th><th>What</th><th>When</th></tr></thead>
                <tbody>{[
                  ...o.calvingsDue.map((x) => ({ a: x.a, w: 'Due to calve', d: x.date })),
                  ...o.readySoon.map((x) => ({ a: x.a, w: 'Ready to serve', d: x.date })),
                  ...o.saleSoon.map((x) => ({ a: x.a, w: 'Reaches sale weight', d: x.date })),
                ].sort((x, y) => x.d.localeCompare(y.d)).slice(0, 40).map((x) => (
                  <tr key={x.w + x.a.id}><td><Link to={`/animals/${x.a.id}`}>{label(x.a)}</Link></td><td>{x.w}</td><td>{fmtDate(x.d)}</td></tr>
                ))}</tbody>
              </table></div>
            )}
            {o.needWeighing > 0 && <p className="small muted">{o.needWeighing} young animals have no weight in the last 100 days, so their forecasts use breed averages. Weigh them (a weigh band is fine) to sharpen the outlook.</p>}
          </section>
        ); })()}

        <section className="section">
          <h3>Milk</h3>
          <div className="kv">
            <div><b>{litres(rep.milk.total, 0)}</b><span>produced</span></div>
            <div><b>{litres(rep.milk.perDay)}</b><span>per recorded day ({rep.milk.recordedDays} of {rep.days})</span></div>
            <div><b>{pct(rep.milk.changePct)}</b><span>per day vs previous {kind === 'week' ? 'week' : kind === 'month' ? 'month' : 'period'}</span></div>
            <div><b>{rep.milk.best ? litres(rep.milk.best.litres, 0) : '—'}</b><span>best day{rep.milk.best ? ` (${fmtShort(rep.milk.best.date)})` : ''}</span></div>
          </div>
          {rep.days <= 92 && <div className="panel pad"><Bars data={rep.milk.daily.map((d) => ({ label: rep.days <= 7 ? fmtShort(d.date) : d.date.slice(8), value: d.litres }))} /></div>}
          {rep.milk.estimatedShare > 0 && <p className="small muted">{Math.round(rep.milk.estimatedShare * 100)}% of this milk was estimated from herd totals.</p>}
          {rep.milk.cows.length > 0 && (
            <div className="panel table-wrap"><table className="table">
              <thead><tr><th>Cow</th><th className="r">Days</th><th className="r">Total</th><th className="r">Per day</th><th className="r">Share</th></tr></thead>
              <tbody>{rep.milk.cows.map((c) => (
                <tr key={c.animal.id}><td><Link to={`/animals/${c.animal.id}`}>{label(c.animal)}</Link></td><td className="r">{c.days}</td><td className="r">{litres(c.total, 0)}</td><td className="r">{litres(c.avg)}</td><td className="r">{rep.milk.total ? Math.round((c.total / rep.milk.total) * 100) : 0}%</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </section>

        <section className="section">
          <h3>Breeding</h3>
          <div className="kv">
            <div><b>{rep.breeding.calvings}</b><span>calvings</span></div>
            <div><b>{rep.breeding.services}</b><span>services / AI</span></div>
            <div><b>{rep.breeding.confirmed}</b><span>confirmed pregnant{rep.breeding.negative ? ` · ${rep.breeding.negative} not` : ''}</span></div>
            <div><b>{rep.breeding.pregnantNow}</b><span>pregnant at end</span></div>
          </div>
          {rep.breeding.dueNext.length > 0 && <p className="small">Due in the 30 days after: {rep.breeding.dueNext.map((d) => `${label(d.animal)} (${fmtDate(d.due)})`).join(', ')}</p>}
        </section>

        <section className="section">
          <h3>Health</h3>
          <div className="kv">
            <div><b>{rep.health.newCases}</b><span>new cases · {rep.health.recovered} recovered</span></div>
            <div><b style={{ color: rep.health.needAttentionNow ? 'var(--urgent)' : undefined }}>{rep.health.needAttentionNow}</b><span>need attention at end</span></div>
            <div><b>{rep.health.vaccinations + rep.health.dewormings}</b><span>vaccinations & dewormings</span></div>
            <div><b>{money(rep.health.cost, cur, { compact: true })}</b><span>health costs</span></div>
          </div>
          {rep.health.cases.length > 0 && <div className="list">{rep.health.cases.map((c, i) => (
            <div key={i} className="item"><div className="main"><div className="title">{label(c.animal)} · {c.condition}</div><div className="sub">{fmtDate(c.date)}</div></div><span className={`badge ${c.status === 'open' ? 'red' : c.status === 'recovered' ? 'green' : 'amber'}`}>{c.status === 'open' ? 'Under treatment' : c.status}</span></div>
          ))}</div>}
        </section>

        {(rep.feed.items.length > 0 || rep.feed.cost > 0) && (
          <section className="section">
            <h3>Feed</h3>
            <div className="kv">
              <div><b>{money(rep.feed.cost, cur, { compact: true })}</b><span>spent on feed</span></div>
              <div><b>{rep.feed.costPerLitre != null ? money(rep.feed.costPerLitre, cur) : '—'}</b><span>feed cost per litre of milk</span></div>
            </div>
            {rep.feed.items.length > 0 && <div className="panel table-wrap"><table className="table">
              <thead><tr><th>Feed</th><th className="r">Used</th><th className="r">Per day</th><th className="r">Bought</th><th className="r">Left</th></tr></thead>
              <tbody>{rep.feed.items.map((f) => (
                <tr key={f.feed.id}><td>{f.feed.name}</td><td className="r">{fmtQty(f.used, f.feed.unit)}</td><td className="r">{fmtQty(f.perDay, f.feed.unit)}</td><td className="r">{fmtQty(f.bought, f.feed.unit)}</td><td className="r">{fmtQty(f.stockEnd, f.feed.unit)}</td></tr>
              ))}</tbody>
            </table></div>}
          </section>
        )}

        <section className="section">
          <h3>Money</h3>
          <div className="kv">
            <div><b>{money(rep.money.income, cur)}</b><span>income</span></div>
            <div><b>{money(rep.money.expenses, cur)}</b><span>expenses</span></div>
            <div><b style={{ color: rep.money.net < 0 ? 'var(--urgent)' : 'var(--grass)' }}>{money(rep.money.net, cur, { sign: true })}</b><span>{rep.money.net < 0 ? 'loss' : 'profit'}</span></div>
            <div><b>{rep.money.costPerLitre != null ? money(rep.money.costPerLitre, cur) : '—'}</b><span>cost per litre{rep.money.pricePerLitre != null ? ` · sold at ${money(rep.money.pricePerLitre, cur)}` : ''}</span></div>
          </div>
          <div className="panel table-wrap"><table className="table">
            <tbody>
              {rep.money.incomeBy.map(([c, v]) => <tr key={'i' + c}><td>{c}</td><td className="r" style={{ color: 'var(--grass)' }}>+{money(v, cur)}</td></tr>)}
              {rep.money.expenseBy.map(([c, v]) => <tr key={'e' + c}><td>{c}</td><td className="r">−{money(v, cur)}</td></tr>)}
              {!rep.money.incomeBy.length && !rep.money.expenseBy.length && <tr><td className="muted">No income or expenses recorded.</td></tr>}
            </tbody>
          </table></div>
        </section>
      </div>
    </div>
  );
}
