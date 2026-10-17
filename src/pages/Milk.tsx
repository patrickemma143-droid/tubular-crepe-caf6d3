import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFarm } from '../db/hooks';
import { addDays, dateRange, fmtDate, fmtShort, todayISO, fmtWeekday } from '../lib/dates';
import { avgDaily, milkingCows, onWithdrawal } from '../lib/herd';
import { litres, pct } from '../lib/format';
import { Bars, Empty, HBar } from '../components/ui';
import { useForms } from '../components/forms';

export default function MilkPage() {
  const farm = useFarm();
  const open = useForms();
  const t = todayISO();
  const d = useMemo(() => {
    const days = dateRange(addDays(t, -29), t);
    const byDay = new Map<string, { v: number; est: boolean }>();
    farm.milk.forEach((m) => {
      if (m.date < days[0]) return;
      const c = byDay.get(m.date) || { v: 0, est: false };
      byDay.set(m.date, { v: c.v + m.litres, est: c.est || m.method === 'estimated' });
    });
    const chart = days.map((x) => ({ label: fmtShort(x), value: byDay.get(x)?.v || 0, estimated: byDay.get(x)?.est }));
    // 7 full days before today, averaged over days that have records
    const last7 = dateRange(addDays(t, -7), addDays(t, -1)).map((x) => byDay.get(x)?.v || 0).filter((v) => v > 0);
    const prev7 = dateRange(addDays(t, -14), addDays(t, -8)).map((x) => byDay.get(x)?.v || 0).filter((v) => v > 0);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
    const a7 = avg(last7); const p7 = avg(prev7);
    const cows = milkingCows(farm, t).map((c) => {
      const now = avgDaily(farm.milk, c.id, addDays(t, -7), addDays(t, -1));
      const before = avgDaily(farm.milk, c.id, addDays(t, -14), addDays(t, -8));
      return { c, now: now.avg, before: before.avg, wd: onWithdrawal(farm.health, c.id) };
    }).sort((x, y) => y.now - x.now);
    const sessions = new Map<string, { date: string; session: string; total: number; cows: number; est: boolean }>();
    farm.milk.forEach((m) => {
      if (m.date < addDays(t, -13)) return;
      const k = m.date + m.session;
      const s = sessions.get(k) || { date: m.date, session: m.session, total: 0, cows: 0, est: false };
      s.total += m.litres; s.cows++; s.est = s.est || m.method === 'estimated';
      sessions.set(k, s);
    });
    const log = [...sessions.values()].sort((x, y) => y.date.localeCompare(x.date) || y.session.localeCompare(x.session));
    const today = byDay.get(t)?.v || 0;
    return { chart, a7, change: p7 ? ((a7 - p7) / p7) * 100 : null, cows, log, today };
  }, [farm, t]);
  const top = Math.max(1, ...d.cows.map((x) => x.now));

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head">
        <div><h1>Milk</h1><p>Today {litres(d.today)} · last 7 days {litres(d.a7)}/day {d.change != null && <span style={{ color: d.change < 0 ? 'var(--urgent)' : 'var(--grass)' }}>({pct(d.change)} vs week before)</span>}</p></div>
        <div className="row wrap">
          <Link className="btn primary" to="/milk/record">Record milking</Link>
          <button className="btn secondary" onClick={() => open({ kind: 'tx', type: 'income', category: 'Milk sales' })}>Milk sale</button>
        </div>
      </div>

      <section className="section">
        <header><h2>Last 30 days</h2><span className="tiny muted">Striped bars include estimates</span></header>
        <div className="panel pad"><Bars data={d.chart} /></div>
      </section>

      <section className="section">
        <header><h2>Per cow, last 7 days</h2><Link to="/milk/herd">Enter herd total</Link></header>
        {d.cows.length ? (
          <div className="list">
            {d.cows.map(({ c, now, before, wd }) => {
              const ch = before ? ((now - before) / before) * 100 : null;
              return (
                <Link key={c.id} to={`/animals/${c.id}`} className="item">
                  <div className="main">
                    <div className="title"><span className="tag">{c.tag}</span>{c.name ? ` · ${c.name}` : ''} {wd && <span className="badge red">Withdrawal</span>}</div>
                    <HBar value={now} max={top} />
                  </div>
                  <div className="end"><b className="num">{now ? litres(now) : '—'}</b><div className="tiny" style={{ color: ch != null && ch < -15 ? 'var(--urgent)' : 'var(--muted)' }}>{ch != null ? pct(ch) : 'per day'}</div></div>
                </Link>
              );
            })}
          </div>
        ) : <Empty title="No cows milking yet">Record a calving or log milk to see cows here.</Empty>}
      </section>

      <section className="section">
        <header><h2>Recent sessions</h2></header>
        {d.log.length ? (
          <div className="list">
            {d.log.map((s) => (
              <Link key={s.date + s.session} to={`/milk/record?date=${s.date}&session=${s.session}`} className="item">
                <div className="main"><div className="title">{fmtWeekday(s.date)} {fmtDate(s.date)} · {s.session === 'AM' ? 'Morning' : 'Evening'}</div><div className="sub">{s.cows} cows{s.est ? ' · estimated' : ''} · tap to correct</div></div>
                <b className="num">{litres(s.total)}</b>
              </Link>
            ))}
          </div>
        ) : <Empty title="No milk recorded in the last two weeks" />}
      </section>
    </div>
  );
}
