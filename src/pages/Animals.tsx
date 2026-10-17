import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useFarm, useSettings } from '../db/hooks';
import { breedingReadiness, feedingOf, saleReadiness, withBreed } from '../lib/growth';
import { category, repro, needsAttention, onWithdrawal, type Category } from '../lib/herd';
import { formatAge, fmtDate } from '../lib/dates';
import { Empty } from '../components/ui';
import type { Animal } from '../db/types';

type Filter = 'all' | Category | 'milking' | 'pregnant' | 'sick' | 'ready' | 'sale' | 'untagged' | 'gone';

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
      {a.provisional && <span className="badge">Not tagged</span>}
    </span>
  );
}

export default function Animals() {
  const farm = useFarm();
  const [q, setQ] = useState('');
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>((params.get('filter') as Filter) || 'all');
  const settings = useSettings();
  const attention = useMemo(() => needsAttention(farm), [farm]);

  const rows = useMemo(() => farm.animals.map((a) => {
    const fd = feedingOf(a, settings?.default_feeding);
    const m = withBreed(a, settings?.default_breed);
    const live = a.status === 'active';
    return {
      a, cat: category(a, farm.breeding), r: repro(a, farm.breeding, farm.milk),
      ready: live && breedingReadiness(m, farm.breeding, farm.weights, fd).ready,
      sale: live && saleReadiness(m, farm.weights, fd, settings?.sale_weight_kg).ready,
    };
  }), [farm, settings?.default_feeding, settings?.sale_weight_kg, settings?.default_breed]);
  const test = (f: Filter, x: (typeof rows)[number]) => {
    if (f === 'gone') return x.a.status !== 'active';
    if (x.a.status !== 'active') return false;
    if (f === 'all') return true;
    if (f === 'milking') return x.r.milking;
    if (f === 'pregnant') return x.r.state === 'pregnant';
    if (f === 'sick') return attention.has(x.a.id);
    if (f === 'ready') return x.ready;
    if (f === 'sale') return x.sale;
    if (f === 'untagged') return !!x.a.provisional;
    return x.cat === f;
  };
  const filters: { v: Filter; l: string }[] = [
    { v: 'all', l: 'All' }, { v: 'milking', l: 'Milking' }, { v: 'pregnant', l: 'Pregnant' }, { v: 'sick', l: 'Need attention' },
    { v: 'Cow', l: 'Cows' }, { v: 'Heifer', l: 'Heifers' }, { v: 'Calf', l: 'Calves' }, { v: 'Bull', l: 'Bulls' }, { v: 'Castrate', l: 'Steers' },
    { v: 'ready', l: 'Ready to serve' }, { v: 'sale', l: 'At sale weight' }, { v: 'untagged', l: 'Not tagged yet' }, { v: 'gone', l: 'Sold / died' },
  ].filter((f) => f.v === 'all' || f.v === filter || rows.some((x) => test(f.v as Filter, x))) as { v: Filter; l: string }[];
  const [limit, setLimit] = useState(150);
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((x) => test(filter, x) && (!needle || [x.a.tag, x.a.name, x.a.breed, x.a.group].some((s) => s?.toLowerCase().includes(needle))));

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
          {shown.slice(0, limit).map(({ a, cat }) => (
            <Link key={a.id} to={`/animals/${a.id}`} className="item">
              <div className="main">
                <div className="title"><span className="tag">{a.tag}</span>{a.name ? ` · ${a.name}` : ''}</div>
                <div className="sub">{cat === 'Castrate' ? 'Steer' : cat} · {a.breed || 'Breed not set'} · {a.dob ? `${a.dob_estimated ? '~' : ''}${formatAge(a.dob)}` : 'age not known'}{a.group ? ` · ${a.group}` : ''}</div>
              </div>
              <div className="end"><StatusBadges a={a} farm={farm} /></div>
            </Link>
          ))}
          {shown.length > limit && <button className="btn secondary" onClick={() => setLimit((n) => n + 300)}>Show more ({shown.length - limit} left)</button>}
        </div>
      )}
    </div>
  );
}
