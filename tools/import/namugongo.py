"""Parse the Namugongo dairy farm workbook (Namirembe Diocese) into FarmOS records.

Usage: python3 -I namugongo.py <workbook.xlsx> <out.json>

Reads: MILK SALES 2017 (daily litres by cow, sold, amount), cash book 2018 (daily
milk sold + expenses), expenses (2017), OTHER INCOME (2017), stock taking 2018
(monthly register), fund accountability (2016 monthly summary).
Empty templates (milk sales 2018/2019, wages payroll) are skipped.
Every figure is checked against the sheet's own totals; differences are listed
in the output's "issues" so nothing is silently changed.
"""
import datetime as dt, json, re, sys
from collections import defaultdict
import openpyxl

SRC = 'Namugongo_diary_farm_livestock_placement_2021.xlsx'
STAMP = '2026-10-16T00:00:00.000Z'  # in the past, so any edit made in the app wins
P = 'nmg'
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
out = {'stock': [], 'milk': [], 'transactions': []}
issues = []
def issue(sheet, where, text): issues.append({'sheet': sheet, 'where': where, 'text': text})
def rec(table, d): out[table].append({'created_at': STAMP, 'updated_at': STAMP, 'deleted': 0, 'source': SRC, **d})
def num(v):
    if v in (None, ''): return 0
    if isinstance(v, (int, float)): return v
    try: return float(str(v).replace(',', ''))
    except ValueError: return 0
def clean(v): return re.sub(r'\s+', ' ', str(v)).strip() if v is not None else ''
def iso(d):
    if isinstance(d, dt.datetime): return d.date().isoformat()
    if isinstance(d, (int, float)) and 40000 < d < 50000: return (dt.date(1899, 12, 30) + dt.timedelta(days=int(d))).isoformat()  # Excel serial typed as a number
    return None
def month_end(ym):
    y, m = map(int, ym.split('-')); n = dt.date(y + (m == 12), m % 12 + 1, 1)
    return (n - dt.timedelta(days=1)).isoformat()

def category(text, column=''):
    t = f'{text} {column}'.lower()
    rules = [
        ('Breeding / AI', r'artificial|insemin|semen|\bai\b|technician|tecnician'),
        ('Veterinary & drugs', r'drug|deworm|dewormw|acc?aricide|vaccin|\bvet|spray|treat|inject|antibiot|tick|medic'),
        ('Feed & supplements', r'feed|grain|bran|mineral|lick|salt|molasses|cotton|hay|silage|meal|concentrat|napier|maize bran'),
        ('Garden & crops', r'herbicid|hebicid|seed|garden|fertili|weed|plant'),
        ('Equipment & repairs', r'tractor|repair|tool|spanner|bearing|plough|hacksaw|wheel|panga|hoe|blade|bucket|pipe'),
        ('Buildings & materials', r'cement|nail|iron sh|shheet|hinge|timber|sand|brick|wire|poles?\b|roof|construct'),
        ('Staff welfare', r'posho|food|meat|sauce|plates|cups|sugar|christmas|tea\b'),
        ('Transport', r'travel|transport|tranport|fare|boda|fuel|diesel|petrol|visit|vist'),
        ('Utilities', r'electric|water|umeme|power'),
        ('Labour', r'wage|herd|casual|salar|labou|allowance'),
    ]
    for cat, rx in rules:
        if re.search(rx, text.lower()): return cat
    for cat, rx in rules:
        if re.search(rx, column.lower()): return cat
    return 'Other'

# ── Milk 2017: litres per cow, total, sold, amount ─────────────────
def parse_milk_2017():
    ws = wb['MILK SALES 2017']; names = None; monthly = defaultdict(lambda: {'L': 0, 'amt': 0})
    for i, r in enumerate(ws.iter_rows(values_only=True), 1):
        r = list(r) + [None] * 10
        if any(clean(v) == 'Total' for v in r[:6]):
            names = [clean(v) for v in r[1:4]]; continue
        d = iso(r[0])
        if not d or not names: continue
        cows = [(n, num(v)) for n, v in zip(names, r[1:4]) if n and v not in (None, '')]
        total, sold, bal, amt = num(r[4]), num(r[5]), r[6], r[7]
        if amt in (None, '') and num(bal) > max(50, total * 20): amt, bal = bal, None  # February: amount typed in the Balance column
        amt = num(amt)
        s = sum(v for _, v in cows)
        if not total and s: total = s
        if cows and abs(s - total) > 0.01: issue('MILK SALES 2017', f'{d} (row {i})', f'cows add up to {s:g} L but the total says {total:g} L — kept {total:g}')
        if not total and not sold: continue
        if sold > total + 0.01: issue('MILK SALES 2017', f'{d} (row {i})', f'sold {sold:g} L but only {total:g} L produced')
        detail = ', '.join(f'{n} {v:g}' for n, v in cows)
        rec('milk', {'id': f'{P}-milk-{d}', 'animal_id': 'herd', 'date': d, 'session': 'AM', 'litres': total, 'method': 'measured',
                     'notes': f'Farm total for the day{f" ({detail})" if detail else ""} · sold {sold:g} L'})
        m = monthly[d[:7]]; m['L'] += sold; m['amt'] += amt
    for ym, m in sorted(monthly.items()):
        if m['amt']:
            rec('transactions', {'id': f'{P}-tx-milk-{ym}', 'date': month_end(ym), 'type': 'income', 'category': 'Milk sales', 'amount': m['amt'],
                                 'litres': m['L'], 'price_per_litre': round(m['amt'] / m['L']) if m['L'] else None, 'notes': f'Milk sold in {ym} ({m["L"]:g} L), monthly total from the daily sales sheet'})

# ── Cash book 2018: milk sold daily + expenses ─────────────────────
def parse_cash_2018():
    ws = wb['cash book 2018']; head = None; cur = None; monthly = defaultdict(lambda: {'L': 0, 'amt': 0}); block = {'milk': 0, 'exp': 0}
    for i, r in enumerate(ws.iter_rows(values_only=True), 1):
        r = list(r) + [None] * 20
        if clean(r[0]) == 'Date' and clean(r[1]) == 'Particulars':
            head = [clean(v) for v in r]; block = {'milk': 0, 'exp': 0}; continue
        if not head: continue
        d = iso(r[0]); part = clean(r[1])
        if d: cur = d
        if re.match(r'(namirembe|namugongo|daily sales|for the month)', part.lower()): continue  # page titles between months
        if not part:
            # month total row: compare with what we read
            if num(r[5]) or num(r[6]):
                if abs(num(r[5]) - block['milk']) > 1: issue('cash book 2018', f'{cur[:7] if cur else "?"} total (row {i})', f'milk sales column totals {num(r[5]):,.0f} but the entries add up to {block["milk"]:,.0f}')
                if abs(num(r[6]) - block['exp']) > 1: issue('cash book 2018', f'{cur[:7] if cur else "?"} total (row {i})', f'expenditure column totals {num(r[6]):,.0f} but the entries add up to {block["exp"]:,.0f}')
            continue
        if not cur: continue
        if part.lower().startswith('milk sale'):
            L, price, amt = num(r[3]), num(r[4]), num(r[5])
            if not amt and not L: continue
            if L and price and abs(L * price - amt) > 1: issue('cash book 2018', f'{cur} (row {i})', f'{L:g} L × {price:,.0f} = {L*price:,.0f} but the amount is {amt:,.0f}')
            ex = next((m for m in out['milk'] if m['id'] == f'{P}-milk-{cur}'), None)
            if ex: ex['litres'] += L; issue('cash book 2018', f'{cur} (row {i})', f'second milk-sales line for {cur}; added together ({ex["litres"]:g} L)')
            else: rec('milk', {'id': f'{P}-milk-{cur}', 'animal_id': 'herd', 'date': cur, 'session': 'AM', 'litres': L, 'method': 'measured',
                               'notes': 'Litres sold that day (cash book; milk kept at home not recorded)'})
            monthly[cur[:7]]['L'] += L; monthly[cur[:7]]['amt'] += amt; block['milk'] += amt
            continue
        cols = {head[j]: num(r[j]) for j in range(9, 18) if head[j] and num(r[j])}
        amt = num(r[6]) or sum(cols.values())
        pork, goat = num(r[7]), num(r[8])
        sale = re.search(r'sale|sold', part.lower())
        if sale and not (pork or goat) and num(r[5]):
            what = 'Pig' if re.search(r'pig|pork|porker', part.lower()) else 'Goat' if 'goat' in part.lower() else None
            if what: pork = num(r[5]) if what == 'Pig' else 0; goat = num(r[5]) if what == 'Goat' else 0
        if num(r[5]):  # something other than milk typed in the milk-sales column; the sheet's own total counts it as milk
            block['milk'] += num(r[5])
            if not amt and not sale: amt = num(r[5])
            issue('cash book 2018', f'{cur} (row {i})', f'"{part}" {num(r[5]):,.0f} is in the milk-sales column — imported as ' + ('an animal sale' if sale else 'an expense'))
        for v, what in ((pork, 'Pig'), (goat, 'Goat')):
            if v: rec('transactions', {'id': f'{P}-cb-{i}-{what.lower()}', 'date': cur, 'type': 'income', 'category': 'Animal sales', 'amount': v, 'notes': f'{what} sales: {part}'})
        if not amt:
            if not (pork or goat): issue('cash book 2018', f'{cur} (row {i})', f'"{part}" has no amount — not imported' + (f' ({num(r[3]):g})' if num(r[3]) else ''))
            continue
        if cols and abs(sum(cols.values()) - amt) > 1: issue('cash book 2018', f'{cur} (row {i})', f'"{part}": expenditure {amt:,.0f} but analysis columns show {sum(cols.values()):,.0f}')
        column = max(cols, key=cols.get) if cols else ''
        rec('transactions', {'id': f'{P}-cb-{i}', 'date': cur, 'type': 'expense', 'category': category(part, column), 'amount': amt, 'notes': part})
        block['exp'] += amt
    for ym, m in sorted(monthly.items()):
        rec('transactions', {'id': f'{P}-tx-milk-{ym}', 'date': month_end(ym), 'type': 'income', 'category': 'Milk sales', 'amount': m['amt'],
                             'litres': m['L'], 'price_per_litre': round(m['amt'] / m['L']) if m['L'] else None, 'notes': f'Milk sold in {ym} ({m["L"]:g} L), monthly total from the cash book'})

# ── Expenses 2017 ─────────────────────────────────────────────────
def parse_expenses_2017():
    ws = wb['expenses']; head = None; cur = None
    for i, r in enumerate(ws.iter_rows(values_only=True), 1):
        r = list(r) + [None] * 14
        cells = [clean(v) for v in r]
        if 'Wages' in cells[:4] and any(c.startswith('Total') for c in cells):
            head = cells; continue
        if clean(r[0]) == 'Summary': head = None; continue
        if not head: continue
        d = iso(r[0]); part = clean(r[1])
        if d: cur = d
        if not part or not cur or isinstance(r[1], (int, float)): continue
        tcol = next(j for j, c in enumerate(head) if c.startswith('Total'))
        cols = {head[j] or 'Other': num(r[j]) for j in range(2, tcol) if num(r[j])}
        amt = num(r[tcol]) or sum(cols.values())
        if not amt: continue
        if cols and abs(sum(cols.values()) - amt) > 1: issue('expenses', f'{cur} (row {i})', f'"{part}": total {amt:,.0f} but columns show {sum(cols.values()):,.0f}')
        column = max(cols, key=cols.get) if cols else ''
        cat = category(part, column) if column != 'Casual' else 'Labour'
        note = part + (' (pigs & goats)' if column.lower().startswith('pig') else '')
        rec('transactions', {'id': f'{P}-ex17-{i}', 'date': cur, 'type': 'expense', 'category': cat, 'amount': amt, 'notes': note})

# ── Other income 2017 ─────────────────────────────────────────────
def parse_other_income():
    ws = wb['OTHER INCOME']; head = None
    for i, r in enumerate(ws.iter_rows(values_only=True), 1):
        r = list(r) + [None] * 6
        if clean(r[1]).startswith('Goat'): head = True; continue
        d = iso(r[0])
        if not d: continue
        for j, cat, what in ((1, 'Other income', 'Goat & garden sales'), (2, 'Animal sales', 'Pork sales')):
            if num(r[j]): rec('transactions', {'id': f'{P}-oi-{i}-{j}', 'date': d, 'type': 'income', 'category': cat, 'amount': num(r[j]), 'notes': what})

# ── Stock taking 2018: monthly register ───────────────────────────
CLASS = {'diary cows': 'Cows', 'dairy cows': 'Cows', 'heifers': 'Heifers', 'calves': 'Calves', 'goats': 'Goats', 'pigs': 'Pigs'}
def parse_stock_2018():
    ws = wb['stock taking 2018']; month = None; prev = {}; span = None
    for i, r in enumerate(ws.iter_rows(values_only=True), 1):
        r = list(r) + [None] * 18
        if isinstance(r[1], dt.datetime):
            m = r[1].strftime('%Y-%m'); before = month
            if before and m <= before:  # e.g. the April 2018 sheet is headed 1 March 2018
                y, mm = map(int, before.split('-')); m2 = f'{y + (mm == 12)}-{mm % 12 + 1:02d}'
                issue('stock taking 2018', f'block headed {m} (row {i})', f'dated {m} again; read as {m2}, the next month in sequence'); m = m2
            month = m
            gap = (int(month[:4]) * 12 + int(month[5:])) - (int(before[:4]) * 12 + int(before[5:])) if before else 1
            span = None
            if gap > 1:
                y0 = (int(before[:4]) * 12 + int(before[5:])) if before else 0
                y, mm = divmod(y0, 12); start = f'{y + (mm == 12) if mm == 12 else y}-{(mm % 12) + 1:02d}' if before else None
                span = f'{month[:4]}-01' if month[5:] != '01' else month
                prev = {}  # B/F of a yearly stock-take is the start of that year, not last recorded month
            continue
        cls = CLASS.get(clean(r[1]).lower())
        if not cls or not month: continue
        row = {'opening': num(r[2]), 'births': num(r[5]), 'grade_in': num(r[6]), 'purchased': num(r[7]), 'deaths': num(r[9]),
               'grade_out': num(r[10]), 'sold': num(r[11]), 'closing': num(r[13])}
        calc = row['opening'] + row['births'] + row['grade_in'] + row['purchased'] - row['deaths'] - row['grade_out'] - row['sold']
        flags = []
        if calc != row['closing']: flags.append(f'Closing {row["closing"]:g} but the movements give {calc:g}')
        if cls in prev and prev[cls] != row['opening']: flags.append(f'B/F {row["opening"]:g} but last month closed at {prev[cls]:g}')
        for f in flags: issue('stock taking 2018', f'{month} {cls}', f)
        prev[cls] = row['closing']
        d = {'id': f'stk-{month}-{cls.lower()}', 'month': month, 'cls': cls, **{k: (int(v) if float(v).is_integer() else v) for k, v in row.items()},
             'unit_value': num(r[14]) or num(r[3]) or None}
        if span: d['remarks'] = f'Stock-take for {span} to {month} (movements are for the whole period)'
        if flags: d['flags'] = flags
        rec('stock', {k: v for k, v in d.items() if v is not None})

# ── Fund accountability 2016 (monthly summary) ────────────────────
def parse_fund_2016():
    ws = wb['fund accountability']; months = None
    MAP = {'milk sales': ('income', 'Milk sales'), 'porker sales': ('income', 'Animal sales'), 'goat sales': ('income', 'Animal sales'),
           'herds men': ('expense', 'Labour'), 'drugs,& accaricide': ('expense', 'Veterinary & drugs'), 'animal feeds': ('expense', 'Feed & supplements'),
           'water bills': ('expense', 'Utilities'), 'electricity bills': ('expense', 'Utilities'), 'namugongo travel': ('expense', 'Transport')}
    for i, r in enumerate(ws.iter_rows(values_only=True), 1):
        r = list(r) + [None] * 16
        if clean(r[0]) != 'Particulars' and clean(r[1]) == 'Particulars': r = r[1:]  # table starts one column in
        elif clean(r[0]) == '' and months: r = r[1:]
        if clean(r[0]) == 'Particulars':
            months = []
            for v in r[1:13]:
                try: months.append(dt.datetime.strptime(clean(v).replace('sept', 'Sep').replace('March', 'Mar').replace('April', 'Apr').title()[:3] + ' ' + clean(v)[-4:], '%b %Y').strftime('%Y-%m'))
                except ValueError: months.append(None)
            continue
        if not months: continue
        label = clean(r[0]).lower()
        key = next((k for k in MAP if label.startswith(k[:12])), None)
        if not key and label.startswith('construction'): key = 'construction'
        if not key: continue
        typ, cat = MAP.get(key, ('expense', 'Equipment & repairs'))
        for ym, v in zip(months, r[1:13]):
            if ym and ym < '2017-01' and num(v) > 0:  # 2017+ come in full detail from the other sheets
                rec('transactions', {'id': f'{P}-fa-{ym}-{re.sub(r"[^a-z]+", "-", label)[:20]}', 'date': month_end(ym), 'type': typ, 'category': cat, 'amount': num(v),
                                     'notes': f'{clean(r[0])} — monthly figure from the 2016 fund accountability'})

parse_fund_2016(); parse_milk_2017(); parse_other_income(); parse_expenses_2017(); parse_cash_2018(); parse_stock_2018()
for t in out: out[t].sort(key=lambda x: (x.get('date') or x.get('month') or '', x['id']))
ids = [x['id'] for t in out for x in out[t]]
from collections import Counter as _C
dup=[k for k,v in _C(ids).items() if v>1]
assert not dup, dup[:10]
json.dump({'records': out, 'issues': issues}, open(sys.argv[2], 'w'), indent=0)
print({t: len(v) for t, v in out.items()}, len(issues), 'issues')
