import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFarm } from '../db/hooks';
import { addDays, ageInMonths, daysBetween, fmtDate, relDay, todayISO } from '../lib/dates';
import { label, repro } from '../lib/herd';
import { useForms } from '../components/forms';
import { Empty } from '../components/ui';
import type { Animal } from '../db/types';

export default function Breeding() {
  const farm = useFarm();
  const open = useForms();
  const t = todayISO();
  const d = useMemo(() => {
    const females = farm.animals.filter((a) => a.status === 'active' && a.sex === 'F');
    const rows = females.map((a) => ({ a, r: repro(a, farm.breeding, farm.milk, t) }));
    const pregnant = rows.filter((x) => x.r.state === 'pregnant').sort((x, y) => (x.r.dueDate || '').localeCompare(y.r.dueDate || ''));
    const served = rows.filter((x) => x.r.state === 'served').sort((x, y) => (x.r.lastService || '').localeCompare(y.r.lastService || ''));
    const openCows = rows.filter((x) => x.r.state === 'open' && x.r.lastCalving).sort((x, y) => (x.r.lastCalving || '').localeCompare(y.r.lastCalving || ''));
    const heifers = rows.filter((x) => x.r.state === 'not bred' && x.a.dob && ageInMonths(x.a.dob, t) >= 12);
    const yearAgo = addDays(t, -365);
    const services = farm.breeding.filter((e) => e.type === 'service' && e.date >= yearAgo).length;
    const conceptions = farm.breeding.filter((e) => e.type === 'preg_check' && e.result === 'pregnant' && e.date >= yearAgo).length;
    const calvings = farm.breeding.filter((e) => e.type === 'calving' && e.date >= yearAgo);
    const recent = [...farm.breeding].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 12);
    return { pregnant, served, openCows, heifers, services, conceptions, calvings, recent };
  }, [farm, t]);
  const byId = new Map(farm.animals.map((a) => [a.id, a]));

  const Row = ({ a, right, sub }: { a: Animal; right: React.ReactNode; sub: string }) => (
    <Link to={`/animals/${a.id}`} className="item">
      <div className="main"><div className="title">{label(a)}</div><div className="sub">{sub}</div></div>
      <div className="end small">{right}</div>
    </Link>
  );

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head">
        <div><h1>Breeding & calving</h1><p>{d.pregnant.length} pregnant · {d.calvings.length} calvings in the last 12 months{d.conceptions ? ` · ${(d.services / d.conceptions).toFixed(1)} services per conception` : ''}</p></div>
        <div className="row wrap">
          <button className="btn primary" onClick={() => open({ kind: 'calving' })}>Record calving</button>
          <button className="btn secondary" onClick={() => open({ kind: 'breeding', type: 'service' })}>Record service</button>
        </div>
      </div>

      <section className="section">
        <header><h2>Pregnant</h2><span className="muted small">{d.pregnant.length}</span></header>
        {d.pregnant.length ? <div className="list">{d.pregnant.map(({ a, r }) => {
          const n = daysBetween(t, r.dueDate!);
          return <Row key={a.id} a={a} sub={`Served ${fmtDate(r.lastService)}${r.dry ? ' · dry' : r.milking ? ' · still milking' : ''}`} right={<span className={`badge ${n <= 14 ? 'red' : n <= 60 ? 'amber' : 'blue'}`}>Due {relDay(r.dueDate!)}</span>} />;
        })}</div> : <Empty title="No confirmed pregnancies">Record a pregnancy check about 45–60 days after service.</Empty>}
      </section>

      <section className="section">
        <header><h2>Served, waiting for pregnancy check</h2><span className="muted small">{d.served.length}</span></header>
        {d.served.length ? <div className="list">{d.served.map(({ a, r }) => {
          const n = daysBetween(r.lastService!, t);
          return (
            <div key={a.id} className="item">
              <Link to={`/animals/${a.id}`} className="main" style={{ textDecoration: 'none' }}><div className="title">{label(a)}</div><div className="sub">Served {n} days ago · {n < 18 ? 'too early to check' : n <= 24 ? 'watch for heat' : n >= 45 ? 'pregnancy check due' : 'waiting'}</div></Link>
              {n >= 30 && <button className="btn secondary sm" onClick={() => open({ kind: 'breeding', type: 'preg_check', animalId: a.id })}>Record check</button>}
            </div>
          );
        })}</div> : <p className="muted small">None.</p>}
      </section>

      <section className="section">
        <header><h2>Calved, not yet served</h2><span className="muted small">{d.openCows.length}</span></header>
        {d.openCows.length ? <div className="list">{d.openCows.map(({ a, r }) => {
          const n = daysBetween(r.lastCalving!, t);
          return (
            <div key={a.id} className="item">
              <Link to={`/animals/${a.id}`} className="main" style={{ textDecoration: 'none' }}><div className="title">{label(a)}</div><div className="sub">{n} days since calving{r.lastHeat ? ` · last heat ${fmtDate(r.lastHeat)}` : ''}</div></Link>
              <button className="btn secondary sm" onClick={() => open({ kind: 'breeding', type: 'service', animalId: a.id })}>Served</button>
            </div>
          );
        })}</div> : <p className="muted small">None.</p>}
      </section>

      {d.heifers.length > 0 && (
        <section className="section">
          <header><h2>Heifers</h2><span className="muted small">{d.heifers.length}</span></header>
          <div className="list">{d.heifers.map(({ a }) => <Row key={a.id} a={a} sub={`${ageInMonths(a.dob!, t)} months old`} right={ageInMonths(a.dob!, t) >= 15 ? <span className="badge amber">Ready to serve</span> : <span className="muted">Growing</span>} />)}</div>
        </section>
      )}

      <section className="section">
        <header><h2>Recent events</h2></header>
        {d.recent.length ? <div className="list">{d.recent.map((e) => (
          <button key={e.id} className="item" onClick={() => open({ kind: 'breeding', record: e })}>
            <div className="main"><div className="title">{label(byId.get(e.animal_id))}</div><div className="sub">{fmtDate(e.date)} · {({ heat: 'Heat', service: `Served${e.sire ? ' · ' + e.sire : ''}`, preg_check: e.result === 'pregnant' ? 'Confirmed pregnant' : 'Not pregnant', calving: 'Calved', dry_off: 'Dried off', abortion: 'Lost calf' } as any)[e.type]}</div></div>
          </button>
        ))}</div> : <Empty title="No breeding records yet" />}
      </section>
    </div>
  );
}
