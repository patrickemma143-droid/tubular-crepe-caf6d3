import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useFarm, useSettings } from '../db/hooks';
import { addDays, dateRange, fmtDate, todayISO, fmtWeekday } from '../lib/dates';
import { activeAnimals, alerts, milkingCows, needsAttention, repro, type Alert } from '../lib/herd';
import { litres, money, plural } from '../lib/format';
import { monthPeriod, buildReport } from '../lib/report';
import { months, rowsFor, totals, fmtYMShort } from '../lib/register';
import { herdOutlook, outlookAlerts } from '../lib/outlook';

function greeting(h: number) { return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

export default function Today() {
  const farm = useFarm();
  const settings = useSettings();
  const t = todayISO();
  const hour = new Date().getHours();
  const cur = settings?.currency || 'UGX';

  const data = useMemo(() => {
    const active = activeAnimals(farm);
    const cows = milkingCows(farm, t);
    const todayLogs = farm.milk.filter((m) => m.date === t);
    const am = todayLogs.filter((m) => m.session === 'AM').reduce((s, m) => s + m.litres, 0);
    const pm = todayLogs.filter((m) => m.session === 'PM').reduce((s, m) => s + m.litres, 0);
    const days = dateRange(addDays(t, -13), t);
    const byDay = new Map<string, number>();
    farm.milk.forEach((m) => { if (m.date >= days[0]) byDay.set(m.date, (byDay.get(m.date) || 0) + m.litres); });
    const strip = days.map((d) => byDay.get(d) || 0);
    const yesterday = byDay.get(addDays(t, -1)) || 0;
    let pregnant = 0; let due30 = 0;
    for (const a of active) {
      if (a.sex !== 'F') continue;
      const r = repro(a, farm.breeding, farm.milk, t);
      if (r.state === 'pregnant') { pregnant++; if (r.dueDate && r.dueDate <= addDays(t, 30)) due30++; }
    }
    const attention = needsAttention(farm, t).size;
    const ol = herdOutlook(farm, settings, t);
    const al = [...outlookAlerts(ol), ...alerts(farm, t, hour)];
    const month = buildReport(farm, monthPeriod(t));
    const ms = months(farm.stock); const lastM = ms[ms.length - 1];
    const reg = lastM ? { month: lastM, ...totals(rowsFor(farm.stock, lastM)) } : null;
    return { active, cows, am, pm, strip, days, yesterday, pregnant, due30, attention, al, month, reg, ol };
  }, [farm, t, hour, settings]);

  if (farm.loading) return null;
  const total = data.am + data.pm;
  const max = Math.max(1, ...data.strip);
  const groups: [string, Alert[]][] = [
    ['Needs attention now', data.al.filter((a) => a.severity === 'urgent')],
    ['Coming up', data.al.filter((a) => a.severity === 'soon')],
    ['Worth knowing', data.al.filter((a) => a.severity === 'info')],
  ];

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div>
          <h1>{greeting(hour)}{settings?.manager_name ? `, ${settings.manager_name.split(' ')[0]}` : ''}</h1>
          <p>{fmtWeekday(t)} {fmtDate(t)}</p>
        </div>
      </div>

      <section className="ledger" aria-label="Today's milk">
        <div className="stack-sm">
          <span className="when">Milk today</span>
          <div className="big">{total.toFixed(1)}<small>L</small></div>
          <div className="split">
            <div><b>{data.am ? data.am.toFixed(1) : '—'}</b>Morning</div>
            <div><b>{data.pm ? data.pm.toFixed(1) : '—'}</b>Evening</div>
            <div><b>{data.yesterday ? data.yesterday.toFixed(1) : '—'}</b>Yesterday</div>
          </div>
        </div>
        <div className="stack-sm">
          <div className="strip" aria-label="Last 14 days">
            {data.strip.map((v, i) => <i key={i} className={i === data.strip.length - 1 ? 'today' : ''} style={{ height: `${(v / max) * 100}%` }} title={`${fmtDate(data.days[i])}: ${v.toFixed(1)} L`} />)}
          </div>
          <span className="when">Last 14 days · {plural(data.cows.length, 'cow')} milking</span>
        </div>
        <div className="actions">
          <Link className="btn on-primary" to={`/milk/record?session=${hour < 13 ? 'AM' : 'PM'}`}>Record {hour < 13 ? 'morning' : 'evening'} milk</Link>
          <Link className="btn on-primary-ghost" to="/milk/herd">Enter herd total</Link>
        </div>
      </section>

      <section className="panel herdline" aria-label="Herd">
        {data.reg && data.active.length === 0
          ? <Link to="/register"><b>{data.reg.closing}</b><span>head in register ({fmtYMShort(data.reg.month)})</span></Link>
          : <Link to="/animals"><b>{data.active.length}</b><span>animals on farm</span></Link>}
        <Link to="/breeding"><b>{data.pregnant}</b><span>pregnant{data.due30 ? ` · ${data.due30} due in 30 days` : ''}</span></Link>
        <Link to="/health"><b style={{ color: data.attention ? 'var(--urgent)' : undefined }}>{data.attention}</b><span>need medical attention</span></Link>
        <Link to="/money"><b style={{ color: data.month.money.net < 0 ? 'var(--urgent)' : undefined }}>{money(data.month.money.net, cur, { compact: true })}</b><span>profit this month</span></Link>
      </section>

      {data.al.length === 0 ? (
        <div className="panel pad row"><CheckCircle2 color="var(--grass)" /> <span>Nothing needs your attention right now.</span></div>
      ) : groups.filter(([, xs]) => xs.length).map(([title, xs]) => (
        <section className="section" key={title}>
          <header><h2>{title}</h2><span className="muted small">{xs.length}</span></header>
          <div className="list">
            {xs.slice(0, title === 'Worth knowing' ? 8 : 20).map((a) => (
              <Link key={a.id} to={a.to || '/'} className={`alert ${a.severity}`}>
                <span className="tick" />
                <span><span className="title">{a.title}</span><br /><span className="sub">{a.detail}</span></span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {data.ol.total > 0 && (
        <section className="section">
          <header><h2>Next 3 months</h2><Link to="/reports">Herd outlook</Link></header>
          <div className="panel pad stack-sm">
            <div className="spread"><span className="muted">Calvings due</span><b className="num">{data.ol.calvingsDue.length}</b></div>
            <div className="spread"><span className="muted">Heifers ready to serve (now · soon)</span><b className="num">{data.ol.readyToServe.length} · {data.ol.readySoon.length}</b></div>
            <div className="spread"><span className="muted">Bulls/steers at sale weight (now · soon)</span><b className="num">{data.ol.saleReady.length} · {data.ol.saleSoon.length}</b></div>
            {data.ol.milkingCows > 0 && <div className="spread"><span className="muted">Expected milk, next 30 days</span><b className="num">{litres(data.ol.milkNext30, 0)}</b></div>}
            {data.ol.needWeighing > 0 && <div className="spread"><span className="muted">Young stock due for weighing</span><b className="num">{data.ol.needWeighing}</b></div>}
          </div>
        </section>
      )}

      <section className="section">
        <header><h2>This month so far</h2><Link to="/reports">Full report</Link></header>
        <div className="panel pad stack-sm">
          <div className="spread"><span className="muted">Milk produced</span><b className="num">{litres(data.month.milk.total, 0)}</b></div>
          <div className="spread"><span className="muted">Calves born</span><b className="num">{data.month.herd.births.length}</b></div>
          <div className="spread"><span className="muted">Animals sold</span><b className="num">{data.month.herd.sold.length}</b></div>
          <div className="spread"><span className="muted">Income</span><b className="num">{money(data.month.money.income, cur)}</b></div>
          <div className="spread"><span className="muted">Expenses</span><b className="num">{money(data.month.money.expenses, cur)}</b></div>
        </div>
      </section>
    </div>
  );
}
