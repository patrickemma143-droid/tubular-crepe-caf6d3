"""Build a FarmOS data file holding several farms, to open in the app
(welcome screen → "Open a data file", or Settings → "Open a FarmOS data file").

Usage: python3 -I make_bundle.py <kyankwanzi blocks.json> <kyankwanzi issues.json> <namugongo.json> <out.json>

The file holds real farm records: keep it private (not in git, not on the website).
"""
import json, re, sys
blocks, issues, nmg, out = (json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), json.load(open(sys.argv[3])), sys.argv[4])
STAMP = '2026-10-16T00:00:00.000Z'
slug = lambda s: re.sub(r'(^-|-$)', '', re.sub(r'[^a-z0-9]+', '-', s.lower()))
def n(v): return 0 if v in (None, '') else (int(v) if float(v).is_integer() else float(v))

# Kyankwanzi herd register — same rules as make_sql.py
CUTOFF = '2026-10'; SRC = 'Kyankwanzi_Ranch_2026_animal_stock_2026_Audit.xlsx'
canon = [b for b in blocks if b['month'][:4] == b['sheet'] and b['month'] <= CUTOFF]
flags = {}
for m, cls, kind, text in issues:
    if cls != '(all classes)': flags.setdefault((m, cls), []).append(f'{kind}: {text}')
kyk = []
for b in canon:
    for c in b['classes']:
        d = {'id': f"stk-{b['month']}-{slug(c['class'])}", 'created_at': STAMP, 'updated_at': STAMP, 'deleted': 0,
             'month': b['month'], 'cls': c['class'], 'opening': n(c['bf']), 'births': n(c['births']), 'grade_in': n(c['grade_in']),
             'purchased': n(c['purchased']), 'deaths': n(c['deaths']), 'grade_out': n(c['grade_out']), 'sold': n(c['sold']),
             'closing': n(c['closing']), 'unit_value': n(c['unit_value']) or None, 'source': SRC}
        if c['remarks'] not in (None, ''): d['remarks'] = f"In fattening unit: {n(c['remarks'])}"
        if (b['month'], c['class']) in flags: d['flags'] = flags[(b['month'], c['class'])]
        kyk.append({k: v for k, v in d.items() if v is not None})

base = {'currency': 'UGX', 'default_feeding': 'grazing_supplement', 'sale_weight_kg': 300}
bundle = {'app': 'FarmOS', 'version': 2, 'kind': 'farms', 'exported_at': STAMP, 'farms': [
    {'key': 'farmos-kyankwanzi-ranch', 'settings': {**base, 'farm_name': 'Kyankwanzi Ranch', 'milk_price': 1200, 'default_breed': 'Ankole'}, 'stock': kyk},
    {'key': 'farmos-namugongo-farm', 'settings': {**base, 'farm_name': 'Namugongo Farm', 'milk_price': 1500}, **nmg['records']},
]}
json.dump(bundle, open(out, 'w'), separators=(',', ':'))
for f in bundle['farms']:
    print(f['settings']['farm_name'], {t: len(v) for t, v in f.items() if isinstance(v, list)})
