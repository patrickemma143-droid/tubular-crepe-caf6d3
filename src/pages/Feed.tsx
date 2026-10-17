import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFarm, useSettings } from '../db/hooks';
import type { Feed, FeedMove } from '../db/types';
import { fmtDate, todayISO } from '../lib/dates';
import { feedStatus, fmtQty, movesFor, stockOn, type FeedStatus } from '../lib/feed';
import { deleteFeed, deleteFeedMove, saveFeed, saveFeedMove, setFeedUsed } from '../lib/actions';
import { money } from '../lib/format';
import { Confirm, Empty, Field, HBar, NumberInput, Segmented, Sheet, numStr, toNum, useToast } from '../components/ui';

const UNITS = ['kg', 'bag (70 kg)', 'bag (50 kg)', 'bale', 'litre', 'tonne'];
const SUGGESTED = [
  { name: 'Dairy meal', unit: 'kg', daily_ration: 20 },
  { name: 'Maize bran', unit: 'kg', daily_ration: 10 },
  { name: 'Napier grass', unit: 'kg', daily_ration: 250 },
  { name: 'Hay', unit: 'bale', daily_ration: 2 },
  { name: 'Silage', unit: 'kg', daily_ration: 120 },
  { name: 'Mineral lick / salt', unit: 'kg', daily_ration: 0.5 },
  { name: 'Cotton seed cake', unit: 'kg', daily_ration: 8 },
];

type Open =
  | { kind: 'feed'; feed?: Feed }
  | { kind: 'move'; type: FeedMove['type']; feedId?: string; record?: FeedMove }
  | { kind: 'use' }
  | null;

function FeedForm({ feed, onClose }: { feed?: Feed; onClose: () => void }) {
  const toast = useToast();
  const farm = useFarm();
  const [name, setName] = useState(feed?.name || '');
  const [unit, setUnit] = useState(feed?.unit || 'kg');
  const [low, setLow] = useState(numStr(feed?.low_level));
  const [ration, setRation] = useState(numStr(feed?.daily_ration));
  const [start, setStart] = useState('');
  const [del, setDel] = useState(false);
  const taken = new Set(farm.feeds.filter((f) => f.id !== feed?.id).map((f) => f.name.toLowerCase()));
  const suggestions = SUGGESTED.filter((s) => !taken.has(s.name.toLowerCase()));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (taken.has(name.trim().toLowerCase())) return toast(`${name} is already in your feed list`);
    const f = await saveFeed({ ...(feed || {}), name, unit, low_level: toNum(low), daily_ration: toNum(ration) });
    const s0 = toNum(start);
    if (!feed && s0 != null) await saveFeedMove({ feed_id: f.id, date: todayISO(), type: 'count', qty: s0, notes: 'Opening stock' });
    toast(feed ? 'Feed updated' : `${f.name} added`);
    onClose();
  }
  return (
    <Sheet title={feed ? `Edit ${feed.name}` : 'Add a feed'} onClose={onClose} actions={<>
      {feed ? <button type="button" className="btn danger-ghost" onClick={() => setDel(true)}>Delete</button> : <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>}
      <button className="btn primary" form="feed-form">Save</button>
    </>}>
      <form id="feed-form" className="form" onSubmit={submit}>
        {!feed && suggestions.length > 0 && (
          <div className="chips" aria-label="Common feeds">
            {suggestions.map((s) => <button type="button" key={s.name} className="chip" aria-pressed={name === s.name} onClick={() => { setName(s.name); setUnit(s.unit); setRation(String(s.daily_ration)); }}>{s.name}</button>)}
          </div>
        )}
        <Field label="Feed name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Dairy meal" /></Field>
        <Field label="Measured in">
          <input className="input" list="units" value={unit} onChange={(e) => setUnit(e.target.value)} required />
          <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
        </Field>
        <div className="grid2">
          <Field label={`Usual use per day (${unit})`} hint="Pre-fills the daily entry"><NumberInput value={ration} onChange={setRation} /></Field>
          <Field label={`Warn me below (${unit})`} hint="Also warns at under 7 days left"><NumberInput value={low} onChange={setLow} /></Field>
        </div>
        {!feed && <Field label={`In store now (${unit})`} hint="Leave blank if you'll record a purchase next"><NumberInput value={start} onChange={setStart} /></Field>}
      </form>
      {del && feed && <Confirm danger title={`Delete ${feed.name}?`} confirmLabel="Delete" onClose={() => setDel(false)}
        body="This removes the feed and its stock records. Purchase costs are removed from expenses too."
        onConfirm={async () => { await deleteFeed(feed); toast('Feed deleted'); onClose(); }} />}
    </Sheet>
  );
}

function MoveForm({ type: t0, feedId, record, onClose }: { type: FeedMove['type']; feedId?: string; record?: FeedMove; onClose: () => void }) {
  const farm = useFarm();
  const settings = useSettings();
  const toast = useToast();
  const [type, setType] = useState<FeedMove['type']>(record?.type || t0);
  const [fid, setFid] = useState(record?.feed_id || feedId || farm.feeds[0]?.id || '');
  const [date, setDate] = useState(record?.date || todayISO());
  const [qty, setQty] = useState(numStr(record?.qty));
  const [cost, setCost] = useState(numStr(record?.cost));
  const [supplier, setSupplier] = useState(record?.supplier || '');
  const [notes, setNotes] = useState(record?.notes || '');
  useEffect(() => { if (!fid && farm.feeds[0]) setFid(farm.feeds[0].id); }, [fid, farm.feeds]);
  const feed = farm.feeds.find((f) => f.id === fid);
  const unit = feed?.unit || '';
  const now = feed ? stockOn(feed.id, farm.feed_moves.filter((m) => m.id !== record?.id), date) : 0;
  const q = toNum(qty);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!feed || q == null) return;
    await saveFeedMove({ ...(record || {}), feed_id: fid, date, type, qty: q, cost: type === 'in' ? toNum(cost) : undefined, supplier: type === 'in' ? supplier.trim() || undefined : undefined, notes: notes.trim() || undefined }, feed.name);
    toast(type === 'in' ? `${fmtQty(q, unit)} of ${feed.name} added to stock` : type === 'count' ? `${feed.name} stock set to ${fmtQty(q, unit)}` : 'Feed use saved');
    onClose();
  }
  return (
    <Sheet title={record ? 'Edit feed record' : type === 'in' ? 'Feed bought' : type === 'count' ? 'Count stock' : 'Feed used'} onClose={onClose} actions={<>
      {record ? <button type="button" className="btn danger-ghost" onClick={async () => { await deleteFeedMove(record); toast('Deleted'); onClose(); }}>Delete</button> : <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>}
      <button className="btn primary" form="move-form" disabled={!feed || q == null}>Save</button>
    </>}>
      <form id="move-form" className="form" onSubmit={submit}>
        {!record && <Segmented full value={type} onChange={setType} options={[{ value: 'in', label: 'Bought' }, { value: 'out', label: 'Used' }, { value: 'count', label: 'Stock count' }]} />}
        <Field label="Feed">
          <select className="select" value={fid} onChange={(e) => setFid(e.target.value)} required>
            {farm.feeds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label={type === 'count' ? `Counted in store (${unit})` : `Quantity (${unit})`} hint={feed ? `In store before this: ${fmtQty(now, unit)}${q != null && type !== 'count' ? ` → after: ${fmtQty(Math.max(0, type === 'in' ? now + q : now - q), unit)}` : ''}` : undefined}>
          <NumberInput big value={qty} onChange={setQty} required placeholder="0" />
        </Field>
        {type === 'in' && <div className="grid2">
          <Field label={`Total paid (${settings?.currency || 'UGX'})`} hint="Added to expenses"><NumberInput value={cost} onChange={setCost} placeholder="0" /></Field>
          <Field label="Supplier"><input className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
        </div>}
        {type === 'in' && q && toNum(cost) ? <p className="small muted">{money(toNum(cost)! / q, settings?.currency)} per {unit}</p> : null}
        <Field label="Notes"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </form>
    </Sheet>
  );
}

function DailyUse({ onClose }: { onClose: () => void }) {
  const farm = useFarm();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const feeds = farm.feeds.filter((f) => !f.archived);
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    const v: Record<string, string> = {};
    for (const f of feeds) {
      const ex = farm.feed_moves.find((m) => m.feed_id === f.id && m.type === 'out' && m.date === date);
      v[f.id] = ex ? String(ex.qty) : '';
    }
    setVals(v);
  }, [date, farm.feed_moves.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const already = feeds.some((f) => farm.feed_moves.some((m) => m.feed_id === f.id && m.type === 'out' && m.date === date));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    for (const f of feeds) await setFeedUsed(f.id, date, toNum(vals[f.id]) ?? null);
    toast(`Feed use saved for ${fmtDate(date)}`);
    onClose();
  }
  return (
    <Sheet title="Feed used" onClose={onClose} actions={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" form="use-form">Save</button></>}>
      <form id="use-form" className="form" onSubmit={submit}>
        <Field label="Date"><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
        {already && <p className="small" style={{ color: 'var(--soon)' }}>Already recorded for this day. Changing a number replaces it.</p>}
        <div className="list">
          {feeds.map((f) => (
            <label key={f.id} className="entry-row">
              <span><b>{f.name}</b><br /><span className="prev">{f.daily_ration ? `Usual: ${fmtQty(f.daily_ration, f.unit)}` : f.unit}</span></span>
              <NumberInput value={vals[f.id] ?? ''} onChange={(v) => setVals((x) => ({ ...x, [f.id]: v }))} placeholder={f.daily_ration ? String(f.daily_ration) : f.unit} aria-label={`${f.name} used`} />
            </label>
          ))}
        </div>
        <button type="button" className="linkbtn" onClick={() => setVals(Object.fromEntries(feeds.map((f) => [f.id, f.daily_ration ? String(f.daily_ration) : vals[f.id] || ''])))}>Fill in usual amounts</button>
      </form>
    </Sheet>
  );
}

function StockRow({ s, onOpen, cur }: { s: FeedStatus; onOpen: () => void; cur: string }) {
  const left = s.daysLeft != null ? Math.floor(s.daysLeft) : null;
  const max = Math.max(s.feed.low_level || 0, s.perDay * 30, s.stock, 1);
  return (
    <button className="item" onClick={onOpen} style={{ alignItems: 'stretch' }}>
      <div className="main stack-sm" style={{ gap: 6 }}>
        <div className="spread">
          <span className="title">{s.feed.name}</span>
          {s.out ? <span className="badge red">Out of stock</span> : s.low ? <span className="badge amber">Running low</span> : left != null ? <span className="badge green">{left > 60 ? '60+' : left} {left === 1 ? 'day' : 'days'} left</span> : null}
        </div>
        <HBar value={s.stock} max={max} red={s.low || s.out} />
        <div className="sub">
          <b className="num" style={{ color: 'var(--ink)' }}>{fmtQty(s.stock, s.feed.unit)}</b> in store
          {s.perDay > 0 && ` · using ${fmtQty(s.perDay, s.feed.unit)}/day${s.basis === 'usual ration' ? ' (usual)' : ''}`}
          {left != null && s.low && ` · ${left < 1 ? 'less than a day' : `about ${left} ${left === 1 ? 'day' : 'days'}`} left`}
          {s.unitCost != null && ` · ${money(s.unitCost, cur)}/${s.feed.unit}`}
        </div>
      </div>
    </button>
  );
}

export default function FeedPage() {
  const farm = useFarm();
  const settings = useSettings();
  const cur = settings?.currency || 'UGX';
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<Open>(null);
  useEffect(() => {
    const d = params.get('do');
    if (!d || farm.loading) return;
    if (farm.feeds.length === 0) setOpen({ kind: 'feed' });
    else setOpen(d === 'use' ? { kind: 'use' } : { kind: 'move', type: 'in' });
    setParams({}, { replace: true });
  }, [params, farm.loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const [detail, setDetail] = useState<string | null>(null);
  const status = useMemo(() => feedStatus(farm.feeds, farm.feed_moves), [farm.feeds, farm.feed_moves]);
  const month = todayISO().slice(0, 7);
  const monthCost = farm.transactions.filter((t) => t.type === 'expense' && t.category === 'Feed & supplements' && t.date.slice(0, 7) === month).reduce((s, t) => s + t.amount, 0);
  const milkMonth = farm.milk.filter((m) => m.date.slice(0, 7) === month).reduce((s, m) => s + m.litres, 0);
  const sel = farm.feeds.find((f) => f.id === detail);
  const recent = sel ? movesFor(sel.id, farm.feed_moves).reverse().slice(0, 30) : [];

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head">
        <div><h1>Feed</h1><p>{money(monthCost, cur)} on feed this month{milkMonth ? ` · ${money(monthCost / milkMonth, cur)} per litre of milk` : ''}</p></div>
        {farm.feeds.length > 0 && <div className="row wrap">
          <button className="btn primary" onClick={() => setOpen({ kind: 'use' })}>Record feed used</button>
          <button className="btn secondary" onClick={() => setOpen({ kind: 'move', type: 'in' })}>Feed bought</button>
          <button className="btn secondary" onClick={() => setOpen({ kind: 'move', type: 'count' })}>Count stock</button>
        </div>}
      </div>

      {farm.feeds.length === 0 ? (
        <Empty title="No feeds yet" action={<button className="btn primary" onClick={() => setOpen({ kind: 'feed' })}>Add your first feed</button>}>
          Add each feed you keep in store — dairy meal, bran, napier, hay, minerals — and FarmOS tracks how much is left and warns you before it runs out.
        </Empty>
      ) : (
        <section className="section">
          <header><h2>In store</h2><button className="linkbtn" onClick={() => setOpen({ kind: 'feed' })}>Add feed</button></header>
          <div className="list">{status.map((s) => <StockRow key={s.feed.id} s={s} cur={cur} onOpen={() => setDetail(s.feed.id)} />)}</div>
        </section>
      )}

      {sel && (
        <Sheet title={sel.name} onClose={() => setDetail(null)} wide actions={<>
          <button className="btn secondary" onClick={() => { setDetail(null); setOpen({ kind: 'feed', feed: sel }); }}>Edit feed</button>
          <button className="btn primary" onClick={() => { setDetail(null); setOpen({ kind: 'move', type: 'in', feedId: sel.id }); }}>Feed bought</button>
        </>}>
          <div className="stack">
            <p>{fmtQty(stockOn(sel.id, farm.feed_moves), sel.unit)} in store now.</p>
            {recent.length ? <div className="list">{recent.map((m) => (
              <button key={m.id} className="item" onClick={() => { setDetail(null); setOpen({ kind: 'move', type: m.type, record: m }); }}>
                <div className="main"><div className="title">{m.type === 'in' ? 'Bought' : m.type === 'out' ? 'Used' : 'Stock count'}</div><div className="sub">{fmtDate(m.date)}{m.supplier ? ` · ${m.supplier}` : ''}{m.notes ? ` · ${m.notes}` : ''}</div></div>
                <div className="end"><b className="num">{m.type === 'in' ? '+' : m.type === 'out' ? '−' : '='}{fmtQty(m.qty, sel.unit)}</b>{m.cost ? <div className="tiny muted">{money(m.cost, cur)}</div> : null}</div>
              </button>
            ))}</div> : <p className="muted">No records yet.</p>}
          </div>
        </Sheet>
      )}
      {open?.kind === 'feed' && <FeedForm feed={open.feed} onClose={() => setOpen(null)} />}
      {open?.kind === 'move' && <MoveForm type={open.type} feedId={open.feedId} record={open.record} onClose={() => setOpen(null)} />}
      {open?.kind === 'use' && <DailyUse onClose={() => setOpen(null)} />}
    </div>
  );
}
