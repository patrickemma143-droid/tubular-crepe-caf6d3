import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { useFarm, useSettings } from '../db/hooks';
import { addDays, dateRange, fmtDate, fmtShort, formatAge, todayISO, relDay } from '../lib/dates';
import { avgDaily, category, eventsFor, label, onWithdrawal, repro } from '../lib/herd';
import { litres, money } from '../lib/format';
import { deleteAnimal, undoExit } from '../lib/actions';
import { useForms } from '../components/forms';
import { Bars, Confirm, Empty, useToast } from '../components/ui';
import { StatusBadges } from './Animals';

type Tab = 'milk' | 'breeding' | 'health' | 'weight' | 'family';

const EV_LABEL: Record<string, string> = { heat: 'Heat', service: 'Served', preg_check: 'Pregnancy check', calving: 'Calved', dry_off: 'Dried off', abortion: 'Lost calf' };

export default function AnimalDetail() {
  const { id } = useParams();
  const farm = useFarm();
  const settings = useSettings();
  const nav = useNavigate();
  const open = useForms();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('milk');
  const [confirmDel, setConfirmDel] = useState(false);
  const a = farm.animals.find((x) => x.id === id);
  const t = todayISO();
  const cur = settings?.currency || 'UGX';

  const info = useMemo(() => {
    if (!a) return null;
    const r = repro(a, farm.breeding, farm.milk);
    const days = dateRange(addDays(t, -29), t);
    const byDay = new Map<string, { v: number; est: boolean }>();
    farm.milk.filter((m) => m.animal_id === a.id && m.date >= days[0]).forEach((m) => {
      const cur = byDay.get(m.date) || { v: 0, est: false };
      byDay.set(m.date, { v: cur.v + m.litres, est: cur.est || m.method === 'estimated' });
    });
    const avg7 = avgDaily(farm.milk, a.id, addDays(t, -6), t);
    const lactation = r.lastCalving ? farm.milk.filter((m) => m.animal_id === a.id && m.date >= r.lastCalving!).reduce((s, m) => s + m.litres, 0) : 0;
    const events = eventsFor(a.id, farm.breeding).reverse();
    const health = farm.health.filter((h) => h.animal_id === a.id).sort((x, y) => y.date.localeCompare(x.date));
    const weights = farm.weights.filter((w) => w.animal_id === a.id).sort((x, y) => y.date.localeCompare(x.date));
    const calves = farm.animals.filter((x) => x.dam_id === a.id);
    const dam = farm.animals.find((x) => x.id === a.dam_id);
    const recentMilk = farm.milk.filter((m) => m.animal_id === a.id).sort((x, y) => y.date.localeCompare(x.date) || x.session.localeCompare(y.session)).slice(0, 14);
    return { r, chart: days.map((d) => ({ label: fmtShort(d), value: byDay.get(d)?.v || 0, estimated: byDay.get(d)?.est })), avg7, lactation, events, health, weights, calves, dam, recentMilk, wd: onWithdrawal(farm.health, a.id) };
  }, [a, farm, t]);

  if (farm.loading) return null;
  if (!a || !info) return <Empty title="Animal not found" action={<Link className="btn secondary" to="/animals">Back to animals</Link>} />;
  const { r } = info;
  const female = a.sex === 'F';
  const tabs: { v: Tab; l: string }[] = [
    ...(female ? [{ v: 'milk' as Tab, l: 'Milk' }, { v: 'breeding' as Tab, l: 'Breeding' }] : []),
    { v: 'health', l: 'Health' }, { v: 'weight', l: 'Weight' }, { v: 'family', l: 'Family' },
  ];
  const activeTab = tabs.some((x) => x.v === tab) ? tab : tabs[0].v;

  return (
    <div className="stack">
      <div className="profile-head">
        <div className="avatar">{a.tag.replace(/[^0-9]/g, '').slice(-3) || a.tag.slice(0, 2)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 26 }}>{a.tag}{a.name ? ` · ${a.name}` : ''}</h1>
          <p className="muted">{category(a, farm.breeding)} · {a.breed || 'Breed not set'} · {formatAge(a.dob)}</p>
        </div>
        <Link to={`/animals/${a.id}/edit`} className="iconbtn" aria-label="Edit animal"><Pencil size={20} /></Link>
      </div>
      <StatusBadges a={a} farm={farm} />
      {info.wd && <div className="panel pad" style={{ borderColor: 'var(--urgent)', color: 'var(--urgent)' }}><b>Don't sell this cow's milk until {fmtDate(info.wd)}.</b> Drug withdrawal period.</div>}

      <dl className="panel facts">
        {female && <div><dt>Status</dt><dd style={{ textTransform: 'capitalize' }}>{r.state}{r.milking ? ', milking' : r.dry ? ', dry' : ''}</dd></div>}
        {female && <div><dt>{r.state === 'pregnant' ? 'Due to calve' : r.state === 'served' ? 'Due if in calf' : 'Last calved'}</dt><dd>{r.dueDate ? `${fmtDate(r.dueDate)} (${relDay(r.dueDate)})` : fmtDate(r.lastCalving)}</dd></div>}
        {female && <div><dt>Milk, 7-day average</dt><dd>{info.avg7.days ? litres(info.avg7.avg) + '/day' : '—'}</dd></div>}
        {female && <div><dt>This lactation</dt><dd>{r.lastCalving ? `${litres(info.lactation, 0)} · day ${r.daysInMilk ?? '—'}` : '—'}</dd></div>}
        <div><dt>Born</dt><dd>{fmtDate(a.dob)}</dd></div>
        <div><dt>{a.source === 'born' ? 'Born on farm' : 'Bought'}</dt><dd>{a.source === 'born' ? (info.dam ? `Mother ${info.dam.tag}` : 'Yes') : `${fmtDate(a.acquired_on)}${a.purchase_price ? ' · ' + money(a.purchase_price, cur) : ''}`}</dd></div>
        {female && <div><dt>Calvings</dt><dd>{r.calvings}</dd></div>}
        {female && <div><dt>Services since calving</dt><dd>{r.servicesSinceCalving}</dd></div>}
      </dl>

      {a.status === 'active' ? (
        <div className="row wrap">
          {female && <button className="btn secondary sm" onClick={() => open({ kind: 'breeding', type: 'service', animalId: a.id })}>Served</button>}
          {female && <button className="btn secondary sm" onClick={() => open({ kind: 'breeding', type: 'preg_check', animalId: a.id })}>Pregnancy check</button>}
          {female && <button className="btn secondary sm" onClick={() => open({ kind: 'calving', animalId: a.id })}>Calved</button>}
          <button className="btn secondary sm" onClick={() => open({ kind: 'health', healthKind: 'treatment', animalId: a.id })}>Sick / treated</button>
          <button className="btn secondary sm" onClick={() => open({ kind: 'weight', animalId: a.id })}>Weight</button>
          <button className="btn secondary sm" onClick={() => open({ kind: 'exit', animalId: a.id })}>Sold or died</button>
        </div>
      ) : (
        <div className="panel pad spread">
          <span>{a.status === 'sold' ? `Sold ${fmtDate(a.exit_date)}${a.sale_price ? ' for ' + money(a.sale_price, cur) : ''}${a.buyer ? ' to ' + a.buyer : ''}` : a.status === 'dead' ? `Died ${fmtDate(a.exit_date)}${a.exit_reason ? ' · ' + a.exit_reason : ''}` : `Culled ${fmtDate(a.exit_date)}`}</span>
          <button className="btn ghost" onClick={async () => { await undoExit(a); toast(`${a.tag} is back in the herd`); }}>Undo</button>
        </div>
      )}

      <div className="tabs" role="tablist">
        {tabs.map((x) => <button key={x.v} role="tab" aria-selected={activeTab === x.v} onClick={() => setTab(x.v)}>{x.l}</button>)}
      </div>

      {activeTab === 'milk' && (
        <div className="stack">
          <div className="panel pad"><Bars data={info.chart} /></div>
          {info.recentMilk.length ? (
            <div className="list">
              {info.recentMilk.map((m) => (
                <div key={m.id} className="item">
                  <div className="main"><div className="title">{fmtDate(m.date)} · {m.session === 'AM' ? 'Morning' : 'Evening'}</div>{m.method === 'estimated' && <div className="sub">Estimated from herd total</div>}</div>
                  <b className="num">{litres(m.litres)}</b>
                </div>
              ))}
            </div>
          ) : <Empty title="No milk recorded">{r.milking ? 'Record milk from the Milk tab.' : 'Milk shows here after she calves.'}</Empty>}
        </div>
      )}

      {activeTab === 'breeding' && (info.events.length ? (
        <div className="list timeline">
          {info.events.map((e) => (
            <button key={e.id} className="ev item" onClick={() => open({ kind: 'breeding', record: e })} style={{ display: 'grid' }}>
              <span className="d">{fmtDate(e.date)}</span>
              <span><b>{EV_LABEL[e.type]}</b>{e.type === 'service' && <span className="muted"> · {e.method === 'AI' ? 'AI' : 'bull'}{e.sire ? ` · ${e.sire}` : ''}</span>}
                {e.type === 'preg_check' && <span className="muted"> · {e.result === 'pregnant' ? 'pregnant' : 'not pregnant'}</span>}
                {e.type === 'calving' && <span className="muted"> · {(e.calf_ids || []).map((cid) => farm.animals.find((x) => x.id === cid)?.tag).filter(Boolean).join(', ') || 'calf'}{e.calving_ease && e.calving_ease !== 'normal' ? ` · ${e.calving_ease}` : ''}</span>}
                {e.notes && <><br /><span className="small muted">{e.notes}</span></>}
              </span>
              <span className="small muted">{e.cost ? money(e.cost, cur) : ''}</span>
            </button>
          ))}
        </div>
      ) : <Empty title="No breeding records">Record heats, services and pregnancy checks to get calving dates and reminders.</Empty>)}

      {activeTab === 'health' && (info.health.length ? (
        <div className="list">
          {info.health.map((h) => (
            <button key={h.id} className="item" onClick={() => open({ kind: 'health', record: h })}>
              <div className="main">
                <div className="title">{h.condition}</div>
                <div className="sub">{fmtDate(h.date)} · {h.kind}{h.medicine ? ` · ${h.medicine}` : ''}{h.next_due ? ` · next due ${fmtDate(h.next_due)}` : ''}</div>
              </div>
              <div className="end">
                {h.kind === 'treatment' && <span className={`badge ${h.status === 'open' ? 'red' : h.status === 'chronic' ? 'amber' : 'green'}`}>{h.status === 'open' ? 'Under treatment' : h.status}</span>}
                {h.cost ? <div className="tiny muted">{money(h.cost, cur)}</div> : null}
              </div>
            </button>
          ))}
        </div>
      ) : <Empty title="No health records" action={<button className="btn secondary" onClick={() => open({ kind: 'health', animalId: a.id })}>Record treatment or vaccine</button>} />)}

      {activeTab === 'weight' && (info.weights.length ? (
        <div className="list">
          {info.weights.map((w, i) => {
            const prev = info.weights[i + 1];
            const gain = prev ? (w.kg - prev.kg) / Math.max(1, (new Date(w.date).getTime() - new Date(prev.date).getTime()) / 86400000) : null;
            return (
              <button key={w.id} className="item" onClick={() => open({ kind: 'weight', record: w })}>
                <div className="main"><div className="title">{fmtDate(w.date)}</div>{gain != null && <div className="sub">{gain >= 0 ? '+' : ''}{(gain * 1000).toFixed(0)} g/day since last weighing</div>}</div>
                <b className="num">{w.kg} kg</b>
              </button>
            );
          })}
        </div>
      ) : <Empty title="No weights recorded" action={<button className="btn secondary" onClick={() => open({ kind: 'weight', animalId: a.id })}>Record weight</button>} />)}

      {activeTab === 'family' && (
        <div className="list">
          <div className="item"><div className="main"><div className="sub">Mother</div><div className="title">{info.dam ? <Link to={`/animals/${info.dam.id}`}>{label(info.dam)}</Link> : 'Not recorded'}</div></div></div>
          <div className="item"><div className="main"><div className="sub">Sire</div><div className="title">{a.sire || 'Not recorded'}</div></div></div>
          {info.calves.map((c) => (
            <Link key={c.id} to={`/animals/${c.id}`} className="item"><div className="main"><div className="sub">Calf · born {fmtDate(c.dob)}</div><div className="title">{label(c)} · {c.sex === 'F' ? 'heifer' : 'bull'}</div></div><StatusBadges a={c} farm={farm} /></Link>
          ))}
        </div>
      )}

      {a.notes && <p className="muted">{a.notes}</p>}
      <div><button className="btn danger-ghost sm" onClick={() => setConfirmDel(true)}>Delete animal</button></div>
      {confirmDel && <Confirm danger title={`Delete ${a.tag}?`} confirmLabel="Delete for good" onClose={() => setConfirmDel(false)}
        body={<>This removes the animal and all its milk, breeding and health records. If it was sold or died, use <b>Sold or died</b> instead so your reports stay correct.</>}
        onConfirm={async () => { await deleteAnimal(a); toast(`${a.tag} deleted`); nav('/animals', { replace: true }); }} />}
    </div>
  );
}
