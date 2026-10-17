import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFarm } from '../db/hooks';
import type { Session } from '../db/types';
import { addDays, fmtDate, todayISO } from '../lib/dates';
import { milkingCows, onWithdrawal } from '../lib/herd';
import { setMilk } from '../lib/actions';
import { Empty, Field, NumberInput, Segmented, toNum, useToast } from '../components/ui';
import { litres } from '../lib/format';

export default function MilkRecord() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const farm = useFarm();
  const toast = useToast();
  const [date, setDate] = useState(params.get('date') || todayISO());
  const [session, setSession] = useState<Session>((params.get('session') as Session) || (new Date().getHours() < 13 ? 'AM' : 'PM'));
  const [showAll, setShowAll] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);

  const cows = useMemo(() => {
    const milking = milkingCows(farm, date);
    if (!showAll) return milking;
    const ids = new Set(milking.map((c) => c.id));
    return [...milking, ...farm.animals.filter((a) => a.status === 'active' && a.sex === 'F' && !ids.has(a.id))];
  }, [farm, date, showAll]);

  const existing = useMemo(() => {
    const m = new Map<string, { litres: number; method: string }>();
    farm.milk.filter((x) => x.date === date && x.session === session).forEach((x) => m.set(x.animal_id, x));
    return m;
  }, [farm.milk, date, session]);
  const previous = useMemo(() => {
    // the same session on the last day it was recorded, per cow
    const m = new Map<string, number>();
    const before = farm.milk.filter((x) => x.session === session && x.date < date && x.date >= addDays(date, -7)).sort((a, b) => a.date.localeCompare(b.date));
    before.forEach((x) => m.set(x.animal_id, x.litres));
    return m;
  }, [farm.milk, date, session]);

  // Load what's already saved for this date + session
  const key = `${date}|${session}|${existing.size}`;
  useEffect(() => {
    const v: Record<string, string> = {};
    existing.forEach((x, id) => (v[id] = String(x.litres)));
    setValues(v);
    setTouched(false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = cows.reduce((s, c) => s + (toNum(values[c.id]) || 0), 0);
  const filled = cows.filter((c) => toNum(values[c.id])).length;
  const alreadySaved = existing.size > 0;

  async function saveAll() {
    let n = 0;
    for (const c of cows) {
      const v = toNum(values[c.id]);
      const ex = existing.get(c.id);
      if ((v ?? 0) === (ex?.litres ?? 0) && ex?.method !== 'estimated') continue;
      await setMilk(c.id, date, session, v ?? null, 'measured');
      n++;
    }
    toast(n ? `${session === 'AM' ? 'Morning' : 'Evening'} milk saved: ${litres(total)}` : 'No changes to save');
    nav('/milk');
  }

  return (
    <div className="stack">
      <div className="page-head"><div><h1>Record milking</h1><p>One number per cow. Re-opening a session lets you correct it.</p></div></div>
      <div className="grid2 collapse">
        <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Session"><Segmented full value={session} onChange={setSession} options={[{ value: 'AM', label: 'Morning' }, { value: 'PM', label: 'Evening' }]} /></Field>
      </div>
      {alreadySaved && <p className="small" style={{ color: 'var(--soon)' }}>{fmtDate(date)} {session === 'AM' ? 'morning' : 'evening'} was already recorded. Changing a number replaces it; clearing it removes that record.</p>}

      {cows.length === 0 ? (
        <Empty title="No cows are milking" action={<button className="btn secondary" onClick={() => setShowAll(true)}>Show all cows and heifers</button>}>
          Cows show here after a calving is recorded, or once you log milk for them.
        </Empty>
      ) : (
        <div className="list">
          {cows.map((c) => {
            const wd = onWithdrawal(farm.health, c.id, date);
            const prev = previous.get(c.id);
            const ex = existing.get(c.id);
            return (
              <label key={c.id} className="entry-row">
                <span>
                  <span className="tag">{c.tag}</span>{c.name ? ` · ${c.name}` : ''}<br />
                  <span className="prev">
                    {prev != null ? `Last ${session === 'AM' ? 'morning' : 'evening'}: ${prev} L` : 'No recent record'}
                    {ex?.method === 'estimated' && ' · currently estimated'}
                  </span>
                  {wd && <><br /><span className="badge red">Withdrawal: keep milk separate</span></>}
                </span>
                <NumberInput value={values[c.id] ?? ''} onChange={(v) => { setValues((x) => ({ ...x, [c.id]: v })); setTouched(true); }} placeholder="L" aria-label={`Litres for ${c.tag}`} />
              </label>
            );
          })}
        </div>
      )}
      {!showAll && cows.length > 0 && <button className="linkbtn" onClick={() => setShowAll(true)}>Add a cow that's not listed</button>}

      <div className="sticky-foot">
        <span><b className="num" style={{ fontSize: 22 }}>{litres(total)}</b><br /><span className="tiny" style={{ opacity: .8 }}>{filled} of {cows.length} cows</span></span>
        <button className="btn primary" onClick={saveAll} disabled={!touched && !alreadySaved}>Save {session === 'AM' ? 'morning' : 'evening'}</button>
      </div>
    </div>
  );
}
