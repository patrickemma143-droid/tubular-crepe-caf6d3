import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useFarm } from '../db/hooks';
import { category, repro, needsAttention, onWithdrawal, type Category } from '../lib/herd';
import { formatAge, fmtDate } from '../lib/dates';
import { Empty } from '../components/ui';
import type { Animal } from '../db/types';

type Filter = 'all' | Category | 'milking' | 'pregnant' | 'sick' | 'gone';

export function StatusBadges({ a, farm }: { a: Animal; farm: ReturnType<typeof useFarm> }) {
  if (a.status !== 'active') return <span className="badge">{a.status === 'dead' ? 'Died' : a.status === 'sold' ? 'Sold' : 'Culled'} {fmtDate(a.exit_date)}</span>;
  const r = repro(a, farm.breeding, farm.milk);
  const sick = farm.health.some((h) => h.animal_id === a.id && h.kind === 'treatment' && h.status === 'open');
  const wd = onWithdrawal(farm.health, a.id);
  return (
    <span className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
      {sick && <span className="badge red">Sick</span>}
      {wd && !sick && <span className="badge red">Withdrawal</span>}
      {r.state === 'pregnant' && <span className="badge blue">Pregnant</span>}
      {r.state === 'served' && <span className="badge amber">Served</span>}
      {r.milking && <span className="badge green">Milking</span>}
      {r.dry && <span className="badge">Dry</span>}
    </span>
  );
}

export default function Animals() {
  const farm = useFarm();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const attention = useMemo(() => needsAttention(farm), [farm]);

  const rows = useMemo(() => farm.animals.map((a) => ({ a, cat: category(a, farm.breeding), r: repro(a, farm.breeding, farm.milk) })), [farm]);
  const test = (f: Filter, x: (typeof rows)[number]) => {
    if (f === 'gone') return x.a.status !== 'active';
    if (x.a.status !== 'active') return false;
    if (f === 'all') return true;
    if (f === 'milking') return x.r.milking;
    if (f === 'pregnant') return x.r.state === 'pregnant';
    if (f === 'sick') return attention.has(x.a.id);
    return x.cat === f;
  };
  const filters: { v: Filter; l: string }[] = [
    { v: 'all', l: 'All' }, { v: 'milking', l: 'Milking' }, { v: 'pregnant', l: 'Pregnant' }, { v: 'sick', l: 'Need attention' },
    { v: 'Cow', l: 'Cows' }, { v: 'Heifer', l: 'Heifers' }, { v: 'Calf', l: 'Calves' }, { v: 'Bull', l: 'Bulls' }, { v: 'gone', l: 'Sold / died' },
  ];
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((x) => test(filter, x) && (!needle || [x.a.tag, x.a.name, x.a.breed].some((s) => s?.toLowerCase().includes(needle))));

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Animals</h1><p>{rows.filter((x) => x.a.status === 'active').length} on the farm</p></div>
        <Link to="/animals/new" className="btn primary"><Plus size={20} /> Add animal</Link>
      </div>
      <label className="row panel" style={{ padding: '0 12px', gap: 8 }}>
        <Search size={20} className="muted" aria-hidden />
        <input className="input" style={{ border: 0, paddingLeft: 0 }} placeholder="Search tag, name or breed" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search animals" />
      </label>
      <div className="chips" role="group" aria-label="Filter">
        {filters.map((f) => (
          <button key={f.v} className="chip" aria-pressed={filter === f.v} onClick={() => setFilter(f.v)}>
            {f.l}<span className="count">{rows.filter((x) => test(f.v, x)).length}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        farm.animals.length === 0
          ? <Empty title="No animals yet" action={<Link to="/animals/new" className="btn primary">Add your first animal</Link>}>Add each cow, heifer, calf and bull with its ear tag number.</Empty>
          : <Empty title="No animals match">Try another filter or search.</Empty>
      ) : (
        <div className="list">
          {shown.map(({ a, cat }) => (
            <Link key={a.id} to={`/animals/${a.id}`} className="item">
              <div className="main">
                <div className="title"><span className="tag">{a.tag}</span>{a.name ? ` · ${a.name}` : ''}</div>
                <div className="sub">{cat} · {a.breed || 'Breed not set'} · {formatAge(a.dob)}</div>
              </div>
              <div className="end"><StatusBadges a={a} farm={farm} /></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
