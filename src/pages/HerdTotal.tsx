import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFarm } from '../db/hooks';
import { todayISO } from '../lib/dates';
import { HERD, distribute, estimateShares, milkingCows } from '../lib/herd';
import { setMilk } from '../lib/actions';
import { Field, NumberInput, Segmented, toNum, useToast } from '../components/ui';
import { litres } from '../lib/format';

export default function HerdTotal() {
  const farm = useFarm();
  const nav = useNavigate();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [session, setSession] = useState<'AM' | 'PM' | 'both'>(new Date().getHours() < 13 ? 'AM' : 'PM');
  const [totalS, setTotal] = useState('');
  const total = toNum(totalS) || 0;
  const cows = useMemo(() => milkingCows(farm, date), [farm, date]);
  const shares = useMemo(() => estimateShares(cows, farm, date, session), [cows, farm, date, session]);
  const parts = useMemo(() => distribute(total, shares), [total, shares]);
  const measuredExisting = farm.milk.filter((m) => m.date === date && (session === 'both' || m.session === session) && m.method === 'measured').length;

  async function save() {
    const sessions: ('AM' | 'PM')[] = session === 'both' ? ['AM', 'PM'] : [session];
    if (!cows.length) {
      // No cow records (e.g. a farm that only keeps a herd register): keep the total for the farm as a whole
      await setMilk(HERD, date, session === 'both' ? 'AM' : session, total, 'measured', session === 'both' ? 'Whole day, farm total' : 'Farm total');
      toast(`${litres(total)} saved for the farm`);
      nav('/milk');
      return;
    }
    for (let i = 0; i < shares.length; i++) {
      if (sessions.length === 2) {
        const am = Math.round(parts[i] * 0.55 * 10) / 10;
        await setMilk(shares[i].animal.id, date, 'AM', am, 'estimated');
        await setMilk(shares[i].animal.id, date, 'PM', Math.round((parts[i] - am) * 10) / 10, 'estimated');
      } else {
        await setMilk(shares[i].animal.id, date, sessions[0], parts[i], 'estimated');
      }
    }
    toast(`${litres(total)} saved across ${shares.length} cows (estimated)`);
    nav('/milk');
  }

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <div className="page-head"><div><h1>Herd total</h1><p>Only measured the churn? Enter the total and FarmOS splits it by each cow's usual yield.</p></div></div>
      <div className="grid2 collapse">
        <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Session"><Segmented full value={session} onChange={setSession} options={[{ value: 'AM', label: 'Morning' }, { value: 'PM', label: 'Evening' }, { value: 'both', label: 'Whole day' }]} /></Field>
      </div>
      <Field label="Total litres from all cows"><NumberInput big value={totalS} onChange={setTotal} placeholder="0" /></Field>
      {measuredExisting > 0 && <p className="small" style={{ color: 'var(--soon)' }}>{measuredExisting} cow-by-cow records already exist for this session and will be replaced by estimates.</p>}
      {cows.length === 0 ? <p className="panel pad small">No milking cows on record, so the total is saved for the farm as a whole. Add cows (or record their calvings) to track milk cow by cow.</p> : (
        <div className="list">
          {shares.map((s, i) => (
            <div className="item" key={s.animal.id}>
              <div className="main">
                <div className="title"><span className="tag">{s.animal.tag}</span>{s.animal.name ? ` · ${s.animal.name}` : ''}</div>
                <div className="sub">Based on {s.basis}{s.sick ? ' · lowered: under treatment' : ''}</div>
              </div>
              <div className="end"><b className="num">{total ? litres(parts[i]) : '—'}</b><div className="tiny muted">{(s.share * 100).toFixed(0)}%</div></div>
            </div>
          ))}
        </div>
      )}
      <p className="small muted">Estimates are marked in the records and reports. Measure each cow separately at least once a week to keep the split accurate.</p>
      <button className="btn primary block" disabled={!total} onClick={save}>Save {total ? litres(total) : 'total'}</button>
    </div>
  );
}
