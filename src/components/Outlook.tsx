import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { Animal } from '../db/types';
import { FEEDING_LABEL } from '../db/types';
import { useFarm, useSettings } from '../db/hooks';
import { fmtDate, relDay, todayISO } from '../lib/dates';
import { litres } from '../lib/format';
import { breedingReadiness, estimateWeight, expectedWeight, feedingOf, growthFlag, milkOutlook, profileFor, saleReadiness, withBreed } from '../lib/growth';
import { daysBetween } from '../lib/dates';
import { saveAnimal, tagInUse } from '../lib/actions';
import { useToast } from './ui';

const when = (d: string | null) => (!d ? 'Not within 3 years at this rate' : d <= todayISO() ? 'Now' : `${fmtDate(d)} (${relDay(d)})`);

/** What FarmOS expects for this animal: weight, readiness to serve or sell, milk. */
export function Outlook({ a }: { a: Animal }) {
  const farm = useFarm();
  const s = useSettings();
  if (a.status !== 'active') return null;
  const m = withBreed(a, s?.default_breed);
  const fd = feedingOf(a, s?.default_feeding);
  const p = profileFor(m.breed);
  const est = estimateWeight(m, farm.weights, fd);
  const flag = growthFlag(est);
  const br = breedingReadiness(m, farm.breeding, farm.weights, fd);
  const sale = saleReadiness(m, farm.weights, fd, s?.sale_weight_kg);
  const milk = milkOutlook(m, farm.breeding, farm.milk, fd);
  const expectedNow = m.dob ? Math.round(expectedWeight(p, m.sex, daysBetween(m.dob, todayISO()), fd)) : null;

  const rows: [string, React.ReactNode][] = [];
  if (est.kg != null) rows.push(['Weight now', <>{`~${est.kg} kg`}<div className="tiny muted">{est.basis}{est.lastWeighed ? ` (${fmtDate(est.lastWeighed)})` : ''}</div></>]);
  if (est.adg != null) rows.push(['Growth', <>{`${Math.round(est.adg * 1000)} g/day`}{est.expectedAdg ? <div className="tiny muted">expected about {Math.round(est.expectedAdg * 1000)} g/day</div> : null}</>]);
  else if (expectedNow && est.basis !== 'estimated from age') rows.push(['Expected for age', `${expectedNow} kg`]);
  if (br.applies) {
    rows.push(['Ready to serve', <>{br.ready ? <b style={{ color: 'var(--primary)' }}>Now</b> : when(br.date)}<div className="tiny muted">{br.reason}</div></>]);
    if (br.firstCalving) rows.push(['First calving if served then', fmtDate(br.firstCalving)]);
  }
  if (sale.applies) rows.push([`Reaches ${sale.targetKg} kg (sale)`, sale.ready ? <b style={{ color: 'var(--primary)' }}>Now</b> : when(sale.date)]);
  if (milk.applies) {
    if (milk.expectedToday != null) rows.push(['Expected milk today', <>{litres(milk.expectedToday)}{milk.actual != null ? <div className="tiny muted">giving {litres(milk.actual)}/day ({Math.round((milk.ratio ?? 1) * 100)}% of expected)</div> : null}</>]);
    if (milk.next30 != null) rows.push(['Next 30 days', `~${litres(milk.next30, 0)}`]);
    if (milk.lactationTotal != null) rows.push(['Whole lactation', `~${litres(milk.lactationTotal, 0)}`]);
  }
  if (!rows.length) return null;
  return (
    <section className="panel pad stack-sm">
      <div className="spread"><b className="row" style={{ gap: 6 }}><TrendingUp size={18} /> Outlook</b>
        {flag && <span className={`badge ${flag === 'slow' ? 'amber' : 'green'}`}>{flag === 'slow' ? 'Growing slowly' : flag === 'fast' ? 'Growing well' : 'On track'}</span>}</div>
      <dl className="facts" style={{ margin: 0 }}>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <p className="tiny muted">Estimates for {p.label}{!a.breed && s?.default_breed ? ' (farm default)' : ''}, {FEEDING_LABEL[fd].toLowerCase()}. They improve with every weighing and milk record.{milk.applies && milk.basis ? ` ${milk.basis}.` : ''}</p>
    </section>
  );
}

/** Replace a temporary TMP- number with the real ear tag. */
export function TagNow({ a }: { a: Animal }) {
  const toast = useToast();
  const [tag, setTag] = useState('');
  const [err, setErr] = useState('');
  if (!a.provisional) return null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const t = tag.trim().toUpperCase();
    if (!t) return;
    if (t.startsWith('TMP-')) return setErr('Type the number on the ear tag.');
    if (await tagInUse(t, a.id)) return setErr(`${t} is already used by another animal.`);
    await saveAnimal({ ...a, tag: t, provisional: undefined, notes: [a.notes, `Tagged ${fmtDate(todayISO())} (was ${a.tag}).`].filter(Boolean).join(' ') });
    toast(`${a.tag} is now ${t}`);
    setTag(''); setErr('');
  }
  return (
    <form className="panel pad stack-sm" onSubmit={save} style={{ borderColor: 'var(--soon)' }}>
      <b>Temporary number — not ear-tagged yet</b>
      <div className="row">
        <input className="input" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Ear tag number" autoCapitalize="characters" aria-label="Ear tag number" />
        <button className="btn primary">Tag</button>
      </div>
      {err && <p className="error small">{err}</p>}
    </form>
  );
}
