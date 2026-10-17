import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useFarm, useSettings } from '../db/hooks';
import { fmtDate, todayISO } from '../lib/dates';
import { buildReport, monthPeriod, shiftPeriod } from '../lib/report';
import { money, litres } from '../lib/format';
import { useForms } from '../components/forms';
import { Empty, HBar, Segmented } from '../components/ui';

export default function Money() {
  const farm = useFarm();
  const settings = useSettings();
  const open = useForms();
  const cur = settings?.currency || 'UGX';
  const [period, setPeriod] = useState(monthPeriod(todayISO()));
  const [show, setShow] = useState<'all' | 'income' | 'expense'>('all');
  const r = useMemo(() => buildReport(farm, period), [farm, period]);
  const tx = farm.transactions.filter((t) => t.date >= period.start && t.date <= period.end && (show === 'all' || t.type === show)).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  const maxCat = Math.max(1, ...r.money.expenseBy.map(([, v]) => v), ...r.money.incomeBy.map(([, v]) => v));
  const isCurrent = period.end >= todayISO();

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="page-head">
        <div><h1>Money</h1></div>
        <div className="row wrap">
          <button className="btn primary" onClick={() => open({ kind: 'tx', type: 'income', category: 'Milk sales' })}>Milk sale</button>
          <button className="btn secondary" onClick={() => open({ kind: 'tx', type: 'expense' })}>Expense</button>
          <button className="btn secondary" onClick={() => open({ kind: 'tx', type: 'income', category: 'Other income' })}>Other income</button>
        </div>
      </div>
      <div className="spread panel" style={{ padding: 4 }}>
        <button className="iconbtn" onClick={() => setPeriod(shiftPeriod(period, -1))} aria-label="Previous month"><ChevronLeft /></button>
        <b>{period.title}</b>
        <button className="iconbtn" onClick={() => setPeriod(shiftPeriod(period, 1))} disabled={isCurrent} aria-label="Next month"><ChevronRight /></button>
      </div>

      <div className="report"><div className="kv">
        <div><b>{money(r.money.income, cur)}</b><span>Income</span></div>
        <div><b>{money(r.money.expenses, cur)}</b><span>Expenses</span></div>
        <div><b style={{ color: r.money.net < 0 ? 'var(--urgent)' : 'var(--grass)' }}>{money(r.money.net, cur, { sign: true })}</b><span>{r.money.net < 0 ? 'Loss' : 'Profit'}</span></div>
        <div><b>{r.money.costPerLitre != null ? money(r.money.costPerLitre, cur) : '—'}</b><span>Cost per litre produced ({litres(r.milk.total, 0)})</span></div>
      </div></div>
      {r.money.pricePerLitre != null && <p className="muted small">Milk sold: {litres(r.money.litresSold, 0)} at an average of {money(r.money.pricePerLitre, cur)} per litre. {r.milk.total > r.money.litresSold ? `${litres(r.milk.total - r.money.litresSold, 0)} produced but not sold (home use, calves, withdrawal, spillage).` : ''}</p>}

      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <section className="section">
          <h2>Where money came from</h2>
          <div className="panel pad stack-sm">
            {r.money.incomeBy.length ? r.money.incomeBy.map(([c, v]) => (
              <div key={c} className="stack-sm" style={{ gap: 4 }}><div className="spread"><span>{c}</span><b className="num">{money(v, cur)}</b></div><HBar value={v} max={maxCat} /></div>
            )) : <p className="muted small">No income recorded.</p>}
          </div>
        </section>
        <section className="section">
          <h2>Where money went</h2>
          <div className="panel pad stack-sm">
            {r.money.expenseBy.length ? r.money.expenseBy.map(([c, v]) => (
              <div key={c} className="stack-sm" style={{ gap: 4 }}><div className="spread"><span>{c}</span><b className="num">{money(v, cur)}</b></div><HBar red value={v} max={maxCat} /></div>
            )) : <p className="muted small">No expenses recorded.</p>}
          </div>
        </section>
      </div>

      <section className="section">
        <header><h2>Entries</h2><Segmented value={show} onChange={setShow} options={[{ value: 'all', label: 'All' }, { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expenses' }]} /></header>
        {tx.length ? <div className="list">{tx.map((t) => (
          <button key={t.id} className="item" onClick={() => open({ kind: 'tx', type: t.type, record: t })}>
            <div className="main"><div className="title">{t.category}{t.litres ? ` · ${litres(t.litres, 0)}` : ''}</div><div className="sub">{fmtDate(t.date)}{t.party ? ` · ${t.party}` : ''}{t.notes ? ` · ${t.notes}` : ''}</div></div>
            <b className="num" style={{ color: t.type === 'income' ? 'var(--grass)' : 'var(--ink)' }}>{t.type === 'income' ? '+' : '−'}{money(t.amount, cur).replace(cur + ' ', '')}</b>
          </button>
        ))}</div> : <Empty title="Nothing recorded this month" />}
      </section>
    </div>
  );
}
