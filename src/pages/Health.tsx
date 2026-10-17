import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFarm, useSettings } from '../db/hooks';
import { daysBetween, fmtDate, relDay, todayISO, addDays } from '../lib/dates';
import { dueHealth, label, onWithdrawal, openTreatments } from '../lib/herd';
import { money } from '../lib/format';
import { useForms } from '../components/forms';
import { Empty } from '../components/ui';
import { saveHealth } from '../lib/actions';

export default function Health() {
  const farm = useFarm();
  const settings = useSettings();
  const open = useForms();
  const t = todayISO();
  const cur = settings?.currency || 'UGX';
  const byId = useMemo(() => new Map(farm.animals.map((a) => [a.id, a])), [farm.animals]);
  const activeIds = useMemo(() => new Set(farm.animals.filter((a) => a.status === 'active').map((a) => a.id)), [farm.animals]);

  const treat = openTreatments(farm.health).filter((h) => activeIds.has(h.animal_id)).sort((a, b) => a.date.localeCompare(b.date));
  const withdrawal = farm.animals.filter((a) => a.status === 'active').map((a) => ({ a, until: onWithdrawal(farm.health, a.id) })).filter((x) => x.until);
  const due = dueHealth(farm.health).filter((h) => activeIds.has(h.animal_id) && h.next_due! <= addDays(t, 30)).sort((a, b) => a.next_due!.localeCompare(b.next_due!));
  const history = [...farm.health].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const monthCost = farm.health.filter((h) => h.date.slice(0, 7) === t.slice(0, 7)).reduce((s, h) => s + (h.cost || 0), 0);

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head">
        <div><h1>Health</h1><p>{treat.length} under treatment · {due.filter((h) => h.next_due! < t).length} overdue · {money(monthCost, cur)} spent this month</p></div>
        <div className="row wrap">
          <button className="btn primary" onClick={() => open({ kind: 'health', healthKind: 'treatment' })}>Record treatment</button>
          <button className="btn secondary" onClick={() => open({ kind: 'health', healthKind: 'vaccination' })}>Vaccination / deworming</button>
        </div>
      </div>

      <section className="section">
        <header><h2>Under treatment</h2><span className="muted small">{treat.length}</span></header>
        {treat.length ? <div className="list">{treat.map((h) => (
          <div key={h.id} className="item">
            <Link to={`/animals/${h.animal_id}`} className="main" style={{ textDecoration: 'none' }}>
              <div className="title">{label(byId.get(h.animal_id))}</div>
              <div className="sub">{h.condition}{h.medicine ? ` · ${h.medicine}` : ''} · since {fmtDate(h.date)} (day {daysBetween(h.date, t) + 1}){h.status === 'chronic' ? ' · chronic' : ''}</div>
            </Link>
            <button className="btn secondary sm" onClick={() => saveHealth({ ...h, status: 'recovered', resolved_on: t })}>Recovered</button>
          </div>
        ))}</div> : <Empty title="No animals under treatment" />}
      </section>

      {withdrawal.length > 0 && (
        <section className="section">
          <header><h2>Keep milk separate</h2></header>
          <div className="list">{withdrawal.map(({ a, until }) => (
            <Link key={a.id} to={`/animals/${a.id}`} className="item"><div className="main"><div className="title">{label(a)}</div><div className="sub">Drug withdrawal until {fmtDate(until)}</div></div><span className="badge red">{relDay(until!)}</span></Link>
          ))}</div>
        </section>
      )}

      <section className="section">
        <header><h2>Vaccinations & deworming due</h2><span className="muted small">next 30 days</span></header>
        {due.length ? <div className="list">{due.map((h) => {
          const late = h.next_due! < t;
          return (
            <div key={h.id} className="item">
              <Link to={`/animals/${h.animal_id}`} className="main" style={{ textDecoration: 'none' }}>
                <div className="title">{label(byId.get(h.animal_id))}</div>
                <div className="sub">{h.condition} · last given {fmtDate(h.date)}</div>
              </Link>
              <div className="end row" style={{ gap: 8 }}>
                <span className={`badge ${late ? 'red' : 'amber'}`}>{late ? `${daysBetween(h.next_due!, t)} days late` : relDay(h.next_due!)}</span>
                <button className="btn secondary sm" onClick={() => open({ kind: 'health', healthKind: h.kind, animalId: h.animal_id })}>Given</button>
              </div>
            </div>
          );
        })}</div> : <p className="muted small">Nothing due. Set a “next due” date when you record a vaccine or dewormer.</p>}
      </section>

      <section className="section">
        <header><h2>History</h2></header>
        {history.length ? <div className="list">{history.map((h) => (
          <button key={h.id} className="item" onClick={() => open({ kind: 'health', record: h })}>
            <div className="main"><div className="title">{label(byId.get(h.animal_id))} · {h.condition}</div><div className="sub">{fmtDate(h.date)} · {h.kind}{h.vet ? ` · ${h.vet}` : ''}</div></div>
            <div className="end tiny muted">{h.cost ? money(h.cost, cur) : ''}</div>
          </button>
        ))}</div> : <Empty title="No health records yet" />}
      </section>
    </div>
  );
}
