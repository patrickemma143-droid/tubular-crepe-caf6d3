import json, sys, re
blocks = json.load(open(sys.argv[1])); issues = json.load(open(sys.argv[2])); out = sys.argv[3]
CUTOFF = '2026-10'; STAMP = '2026-10-16T00:00:00.000Z'  # must be in the past: any later edit in the app wins
SRC = 'Kyankwanzi_Ranch_2026_animal_stock_2026_Audit.xlsx'
OWNER_EMAIL = 'owner@example.com'  # the farm owner's FarmOS sign-in email
canon = [b for b in blocks if b['month'][:4] == b['sheet'] and b['month'] <= CUTOFF]
slug = lambda s: re.sub(r'(^-|-$)', '', re.sub(r'[^a-z0-9]+', '-', s.lower()))
flags = {}
for m, cls, kind, text in issues:
    if cls != '(all classes)': flags.setdefault((m, cls), []).append(f'{kind}: {text}')
def n(v): return 0 if v in (None, '') else (int(v) if float(v).is_integer() else float(v))
rows = []
for b in canon:
    for c in b['classes']:
        rid = f"stk-{b['month']}-{slug(c['class'])}"
        d = {'id': rid, 'created_at': STAMP, 'updated_at': STAMP, 'deleted': 0,
             'month': b['month'], 'cls': c['class'],
             'opening': n(c['bf']), 'births': n(c['births']), 'grade_in': n(c['grade_in']), 'purchased': n(c['purchased']),
             'deaths': n(c['deaths']), 'grade_out': n(c['grade_out']), 'sold': n(c['sold']), 'closing': n(c['closing']),
             'unit_value': n(c['unit_value']) or None, 'source': SRC}
        if c['remarks'] not in (None, ''): d['remarks'] = f"In fattening unit: {n(c['remarks'])}"
        if (b['month'], c['class']) in flags: d['flags'] = flags[(b['month'], c['class'])]
        rows.append((rid, json.dumps({k: v for k, v in d.items() if v is not None}, separators=(',', ':'))))
q = lambda s: "'" + s.replace("'", "''") + "'"
first, last = canon[0]['month'], canon[-1]['month']
L = []
L.append(f"""-- ════════════════════════════════════════════════════════════════════
-- FarmOS: create the Namirembe Diocese farms and import the Kyankwanzi
-- Ranch herd register ({first} to {last}, {len(canon)} months, {len(rows)} rows)
-- Source: {SRC}
--
-- BEFORE RUNNING
--   1. supabase/schema.sql has been run once in this project.
--   2. The owner has an account: either created in the app, or in Supabase
--      → Authentication → Users → Add user (tick "Auto Confirm User").
--      Change owner_email below if you use a different address.
--
-- HOW TO RUN: Supabase → SQL Editor → New query → paste ALL of this file →
-- make sure nothing is highlighted → Run.
-- The whole import is one block: it either completes fully or changes nothing.
-- Safe to run more than once: farms are not duplicated, and stock rows are
-- only replaced if nobody has edited them in the app since.
--
-- AFTER RUNNING: in the app, Settings → Your farms → Switch to
-- "Kyankwanzi Ranch". Figures appear under More → Herd register,
-- and in monthly Reports, PDF and Excel.
--
-- Figures are imported exactly as written in the ledger. 37 places where the
-- ledger doesn't add up are flagged on the rows concerned and shown in the
-- app. The duplicate 2020 tables on the 2019 sheet were not imported (the
-- 2020 sheet was used). November and December 2026 were not imported.
-- ════════════════════════════════════════════════════════════════════

do $farmos$
declare
  owner_email     text := {q(OWNER_EMAIL)};   -- ← edit if needed
  kyankwanzi_name text := 'Kyankwanzi Ranch';
  namugongo_name  text := 'Namugongo Farm';
  oid uuid; kid uuid; nid uuid; n int;
begin
  select id into oid from auth.users where lower(email) = lower(owner_email);
  if oid is null then
    raise exception 'No account for %. Create it first: Supabase → Authentication → Users → Add user (tick Auto Confirm), or sign up in the app. Then run this again.', owner_email;
  end if;

  select f.id into kid from public.farms f join public.farm_members m on m.farm_id = f.id
   where m.user_id = oid and m.role = 'owner' and lower(f.name) = lower(kyankwanzi_name) limit 1;
  if kid is null then
    insert into public.farms (name, created_by) values (kyankwanzi_name, oid) returning id into kid;
    insert into public.farm_members (farm_id, user_id, email, role) values (kid, oid, lower(owner_email), 'owner');
  end if;

  select f.id into nid from public.farms f join public.farm_members m on m.farm_id = f.id
   where m.user_id = oid and m.role = 'owner' and lower(f.name) = lower(namugongo_name) limit 1;
  if nid is null then
    insert into public.farms (name, created_by) values (namugongo_name, oid) returning id into nid;
    insert into public.farm_members (farm_id, user_id, email, role) values (nid, oid, lower(owner_email), 'owner');
  end if;

  insert into public.farm_records (farm_id, tbl, id, data, updated_at, deleted)
  select kid, 'stock', v.id, v.data::jsonb, {q(STAMP)}::timestamptz, false
  from (values""")
for k, (rid, data) in enumerate(rows):
    L.append(f"    ({q(rid)}, {q(data)}){',' if k < len(rows) - 1 else ''}")
L.append("""  ) as v(id, data)
  on conflict (farm_id, tbl, id) do update
    set data = excluded.data, updated_at = excluded.updated_at, deleted = false;

  select count(*) into n from public.farm_records where farm_id = kid and tbl = 'stock' and not deleted;
  raise notice 'Done: % has % herd register rows. % is ready.', kyankwanzi_name, n, namugongo_name;
end
$farmos$;

-- Check what was imported (also safe to run on its own)
select f.name as farm, m.role,
       count(r.id) filter (where r.tbl = 'stock' and not r.deleted) as register_rows,
       min(r.data->>'month') as first_month,
       max(r.data->>'month') as last_month
from public.farms f
join public.farm_members m on m.farm_id = f.id
left join public.farm_records r on r.farm_id = f.id
where f.name in ('Kyankwanzi Ranch', 'Namugongo Farm')
group by f.name, m.role
order by f.name;
""")
open(out, 'w').write('\n'.join(L))
print(len(rows), 'rows written to', out)
