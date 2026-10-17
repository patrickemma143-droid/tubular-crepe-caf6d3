import type { Report } from './report';
import type { Farm } from './herd';
import { label, category, repro } from './herd';
import { fmtDate } from './dates';
import { money } from './format';
import type { Settings } from '../db/types';

const r1 = (n: number) => Math.round(n * 10) / 10;

function filename(s: Settings, rep: Report, ext: string) {
  const farm = (s.farm_name || 'FarmOS').replace(/[^\w]+/g, '-');
  return `${farm}_${rep.period.kind}_${rep.period.start}_to_${rep.period.end}.${ext}`;
}

export async function reportToPDF(rep: Report, s: Settings) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const cur = s.currency;
  const green: [number, number, number] = [31, 81, 48];
  let y = 48;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(23, 37, 28);
  doc.text(`${s.farm_name || 'Farm'} — ${rep.period.kind === 'week' ? 'Weekly' : rep.period.kind === 'month' ? 'Monthly' : ''} report`, 40, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
  y += 18; doc.text(`${fmtDate(rep.period.start)} to ${fmtDate(rep.period.end)}${s.manager_name ? ` · ${s.manager_name}` : ''} · generated ${new Date().toLocaleString()}`, 40, y);

  const table = (title: string, head: string[], body: (string | number)[][], opts: any = {}) => {
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 24;
    if (y > 740) { doc.addPage(); y = 48; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(23, 37, 28); doc.text(title, 40, y);
    autoTable(doc, { startY: y + 6, head: [head], body, theme: 'grid', headStyles: { fillColor: green, textColor: 255 }, styles: { fontSize: 9, cellPadding: 4 }, margin: { left: 40, right: 40 }, ...opts });
  };

  if (rep.register.months.length) {
    table('Herd register (monthly stock)', ['Class', 'B/F', 'Born', 'Graded in', 'Graded out', 'Bought', 'Died', 'Sold', 'Closing', 'Value'],
      rep.register.byClass.map((c) => [c.cls, c.opening, c.births, c.grade_in, c.grade_out, c.purchased, c.deaths, c.sold, c.closing, money(c.value, cur)]),
      { foot: [['Total', rep.register.total.opening, rep.register.total.births, rep.register.total.grade_in, rep.register.total.grade_out, rep.register.total.purchased, rep.register.total.deaths, rep.register.total.sold, rep.register.total.closing, money(rep.register.total.value, cur)]], footStyles: { fillColor: [226, 238, 227], textColor: 20 }, styles: { fontSize: 8, cellPadding: 3 } });
  }
  table('Summary', ['Measure', 'Value'], [
    ['Animals at start / end', `${rep.herd.opening} / ${rep.herd.closing}`],
    ['Calves born', rep.herd.births.length],
    ['Animals bought', rep.herd.purchases.length],
    ['Animals sold', rep.herd.sold.length],
    ['Animals died', rep.herd.died.length],
    ['Animals culled', rep.herd.culled.length],
    ['Milk produced', `${r1(rep.milk.total)} L (${r1(rep.milk.perDay)} L/day)`],
    ['Pregnant at end of period', rep.breeding.pregnantNow],
    ['Need medical attention at end', rep.health.needAttentionNow],
    ['Income', money(rep.money.income, cur)],
    ['Expenses', money(rep.money.expenses, cur)],
    ['Profit / loss', money(rep.money.net, cur)],
  ], { columnStyles: { 1: { halign: 'right' } } });

  table('Milk per cow', ['Tag', 'Name', 'Days', 'Total (L)', 'Avg/day (L)', 'Morning', 'Evening'],
    rep.milk.cows.map((c) => [c.animal.tag, c.animal.name || '', c.days, r1(c.total), r1(c.avg), r1(c.am), r1(c.pm)]),
    { foot: [['Total', '', '', r1(rep.milk.total), '', '', '']], footStyles: { fillColor: [226, 238, 227], textColor: 20 } });

  table('Milk per day', ['Date', 'Litres'], rep.milk.daily.map((d) => [fmtDate(d.date), r1(d.litres)]));

  const movement = [
    ...rep.herd.births.map((a) => ['Born', a.tag, a.sex === 'F' ? 'Heifer calf' : 'Bull calf', fmtDate(a.dob), '']),
    ...rep.herd.purchases.map((a) => ['Bought', a.tag, a.breed || '', fmtDate(a.acquired_on), a.purchase_price ? money(a.purchase_price, cur) : '']),
    ...rep.herd.sold.map((a) => ['Sold', a.tag, a.buyer || '', fmtDate(a.exit_date), a.sale_price ? money(a.sale_price, cur) : '']),
    ...rep.herd.died.map((a) => ['Died', a.tag, a.exit_reason || '', fmtDate(a.exit_date), '']),
    ...rep.herd.culled.map((a) => ['Culled', a.tag, a.exit_reason || '', fmtDate(a.exit_date), a.sale_price ? money(a.sale_price, cur) : '']),
  ];
  if (movement.length) table('Herd changes', ['Change', 'Tag', 'Details', 'Date', 'Value'], movement);

  table('Breeding', ['Measure', 'Count'], [
    ['Services / AI', rep.breeding.services], ['Confirmed pregnant', rep.breeding.confirmed], ['Not pregnant at check', rep.breeding.negative],
    ['Calvings', rep.breeding.calvings], ['Due in the next 30 days', rep.breeding.dueNext.map((d) => `${d.animal.tag} (${fmtDate(d.due)})`).join(', ') || '—'],
  ]);
  table('Health', ['Measure', 'Value'], [
    ['New cases', rep.health.newCases], ['Recovered', rep.health.recovered], ['Vaccinations', rep.health.vaccinations], ['Dewormings', rep.health.dewormings],
    ['Under treatment at end', rep.health.underTreatmentNow], ['Health costs', money(rep.health.cost, cur)],
  ]);
  if (rep.health.cases.length) table('Cases', ['Date', 'Animal', 'Problem', 'Status'], rep.health.cases.map((c) => [fmtDate(c.date), label(c.animal), c.condition, c.status]));
  if (rep.feed.items.length) table('Feed', ['Feed', 'Used', 'Per day', 'Bought', 'In store at end'],
    rep.feed.items.map((f) => [f.feed.name, `${r1(f.used)} ${f.feed.unit}`, `${r1(f.perDay)} ${f.feed.unit}`, `${r1(f.bought)} ${f.feed.unit}`, `${r1(f.stockEnd)} ${f.feed.unit}`]),
    { foot: [[`Feed cost ${money(rep.feed.cost, cur)}`, '', rep.feed.costPerLitre != null ? `${money(rep.feed.costPerLitre, cur)} per litre` : '', '', '']], footStyles: { fillColor: [226, 238, 227], textColor: 20 } });
  table('Income and expenses', ['Category', 'Type', 'Amount'], [
    ...rep.money.incomeBy.map(([c, v]) => [c, 'Income', money(v, cur)]),
    ...rep.money.expenseBy.map(([c, v]) => [c, 'Expense', money(v, cur)]),
  ], { foot: [['Profit / loss', '', money(rep.money.net, cur)]], footStyles: { fillColor: [226, 238, 227], textColor: 20 }, columnStyles: { 2: { halign: 'right' } } });

  doc.save(filename(s, rep, 'pdf'));
}

export async function reportToExcel(rep: Report, s: Settings) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const cur = s.currency;
  const add = (name: string, rows: any[][], widths?: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add('Summary', [
    [`${s.farm_name || 'Farm'} report`], ['Period', `${rep.period.start} to ${rep.period.end}`], [],
    ['Animals at start', rep.herd.opening], ['Calves born', rep.herd.births.length], ['Bought', rep.herd.purchases.length],
    ['Sold', rep.herd.sold.length], ['Died', rep.herd.died.length], ['Culled', rep.herd.culled.length], ['Animals at end', rep.herd.closing], [],
    ['Milk produced (L)', r1(rep.milk.total)], ['Milk per recorded day (L)', r1(rep.milk.perDay)], ['Share estimated from herd totals', `${Math.round(rep.milk.estimatedShare * 100)}%`], [],
    ['Services / AI', rep.breeding.services], ['Confirmed pregnant', rep.breeding.confirmed], ['Calvings', rep.breeding.calvings], ['Pregnant at end', rep.breeding.pregnantNow], [],
    ['New health cases', rep.health.newCases], ['Under treatment at end', rep.health.underTreatmentNow], ['Need attention at end', rep.health.needAttentionNow], [],
    [`Income (${cur})`, rep.money.income], [`Expenses (${cur})`, rep.money.expenses], [`Profit / loss (${cur})`, rep.money.net],
    [`Cost per litre (${cur})`, rep.money.costPerLitre != null ? Math.round(rep.money.costPerLitre) : ''],
  ], [32, 22]);
  if (rep.register.months.length) add('Herd register', [['Class', 'B/F', 'Born', 'Graded in', 'Graded out', 'Bought', 'Died', 'Sold', 'Closing', `Value (${cur})`],
    ...rep.register.byClass.map((c) => [c.cls, c.opening, c.births, c.grade_in, c.grade_out, c.purchased, c.deaths, c.sold, c.closing, c.value]),
    ['Total', rep.register.total.opening, rep.register.total.births, rep.register.total.grade_in, rep.register.total.grade_out, rep.register.total.purchased, rep.register.total.deaths, rep.register.total.sold, rep.register.total.closing, rep.register.total.value]], [24, 8, 8, 10, 10, 8, 8, 8, 10, 16]);
  add('Milk per cow', [['Tag', 'Name', 'Days recorded', 'Total L', 'Avg L/day', 'Morning L', 'Evening L', 'Estimated L'],
    ...rep.milk.cows.map((c) => [c.animal.tag, c.animal.name || '', c.days, r1(c.total), r1(c.avg), r1(c.am), r1(c.pm), r1(c.estimated)])], [12, 14, 14, 10, 10, 10, 10, 12]);
  add('Milk per day', [['Date', 'Litres'], ...rep.milk.daily.map((d) => [d.date, r1(d.litres)])], [12, 10]);
  add('Herd changes', [['Change', 'Tag', 'Name', 'Date', 'Details', `Value (${cur})`],
    ...rep.herd.births.map((a) => ['Born', a.tag, a.name || '', a.dob, a.sex === 'F' ? 'Heifer calf' : 'Bull calf', '']),
    ...rep.herd.purchases.map((a) => ['Bought', a.tag, a.name || '', a.acquired_on, a.breed || '', a.purchase_price || '']),
    ...rep.herd.sold.map((a) => ['Sold', a.tag, a.name || '', a.exit_date, a.buyer || '', a.sale_price || '']),
    ...rep.herd.died.map((a) => ['Died', a.tag, a.name || '', a.exit_date, a.exit_reason || '', '']),
    ...rep.herd.culled.map((a) => ['Culled', a.tag, a.name || '', a.exit_date, a.exit_reason || '', a.sale_price || '']),
  ], [10, 12, 14, 12, 24, 14]);
  add('Feed', [['Feed', 'Unit', 'Used', 'Per day', 'Bought', `Paid (${cur})`, 'In store at end'],
    ...rep.feed.items.map((f) => [f.feed.name, f.feed.unit, r1(f.used), r1(f.perDay), r1(f.bought), f.cost, r1(f.stockEnd)])], [20, 12, 10, 10, 10, 14, 14]);
  add('Money', [['Type', 'Category', `Amount (${cur})`], ...rep.money.incomeBy.map(([c, v]) => ['Income', c, v]), ...rep.money.expenseBy.map(([c, v]) => ['Expense', c, v]), [], ['', 'Profit / loss', rep.money.net]], [10, 24, 16]);
  XLSX.writeFile(wb, filename(s, rep, 'xlsx'));
}

/** Every record, one sheet per type — for your accountant or a backup you can read. */
export async function allDataToExcel(farm: Farm, s: Settings) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const byId = new Map(farm.animals.map((a) => [a.id, a]));
  const tag = (id?: string) => (id ? byId.get(id)?.tag || '' : '');
  const sheet = (name: string, rows: any[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  sheet('Animals', farm.animals.map((a) => {
    const r = repro(a, farm.breeding, farm.milk);
    return { Tag: a.tag, Name: a.name, Sex: a.sex === 'F' ? 'Female' : 'Male', Category: category(a, farm.breeding), Breed: a.breed, Born: a.dob, Source: a.source, Bought: a.acquired_on, 'Purchase price': a.purchase_price, Mother: tag(a.dam_id), Sire: a.sire, Status: a.status, 'Exit date': a.exit_date, 'Exit reason': a.exit_reason, 'Sale price': a.sale_price, Buyer: a.buyer, Reproduction: r.state, 'Due date': r.dueDate, Notes: a.notes };
  }));
  sheet('Milk', [...farm.milk].sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ Date: m.date, Session: m.session === 'AM' ? 'Morning' : 'Evening', Tag: tag(m.animal_id), Litres: m.litres, Method: m.method, Notes: m.notes })));
  sheet('Breeding', farm.breeding.map((e) => ({ Date: e.date, Tag: tag(e.animal_id), Event: e.type, Method: e.method, Sire: e.sire, Result: e.result, Calves: (e.calf_ids || []).map(tag).join(', '), Cost: e.cost, Notes: e.notes })));
  sheet('Health', farm.health.map((h) => ({ Date: h.date, Tag: tag(h.animal_id), Type: h.kind, Condition: h.condition, Medicine: h.medicine, Dose: h.dose, Vet: h.vet, Cost: h.cost, Status: h.status, 'Withdrawal until': h.milk_withdrawal_until, 'Next due': h.next_due, Notes: h.notes })));
  sheet('Weights', farm.weights.map((w) => ({ Date: w.date, Tag: tag(w.animal_id), Kg: w.kg })));
  const feedName = new Map((farm.feeds || []).map((f) => [f.id, f]));
  sheet('Feed', (farm.feed_moves || []).sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ Date: m.date, Feed: feedName.get(m.feed_id)?.name, Type: m.type === 'in' ? 'Bought' : m.type === 'out' ? 'Used' : 'Stock count', Quantity: m.qty, Unit: feedName.get(m.feed_id)?.unit, Cost: m.cost, Supplier: m.supplier, Notes: m.notes })));
  sheet('Herd register', [...(farm.stock || [])].sort((a, b) => a.month.localeCompare(b.month)).map((r) => ({ Month: r.month, Class: r.cls, 'B/F': r.opening, Births: r.births, 'Graded in': r.grade_in, Bought: r.purchased, Deaths: r.deaths, 'Graded out': r.grade_out, Sold: r.sold, Closing: r.closing, 'Value per head': r.unit_value, Remarks: r.remarks, Flags: (r.flags || []).join('; ') })));
  sheet('Money', farm.transactions.map((t) => ({ Date: t.date, Type: t.type, Category: t.category, Amount: t.amount, Litres: t.litres, 'Price/L': t.price_per_litre, Party: t.party, Payment: t.payment, Animal: tag(t.animal_id), Notes: t.notes })));
  XLSX.writeFile(wb, `${(s.farm_name || 'FarmOS').replace(/[^\w]+/g, '-')}_all-records_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
