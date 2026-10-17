# Two-phone sync test

Runs the real built app in three separate browser "phones" (owner, manager, farm hand)
against a local stand-in for Supabase: real Postgres with `supabase/schema.sql`,
PostgREST (the REST layer Supabase uses) and `gateway.mjs`, which mimics Supabase's
`/auth/v1` password sign-in and forwards `/rest/v1` to PostgREST.

Checks: offline records upload after joining, invites and roles, farm hands never
receive money records, offline edits on two phones (newest edit wins, both phones'
new records survive), deletes spread, corrections don't duplicate, a wiped phone gets
everything back, a 240-record offline backlog, feed stock, and no app errors.

## Run (Linux/macOS)

1. Postgres 16 on a local socket in `/var/tmp/farmpg`, port 5499, database `sb`, with roles
   `anon`, `authenticated`, `authenticator` and a minimal `auth` schema (`auth.users`,
   `auth.uid()`, `auth.jwt()` reading `request.jwt.claims`). Then `psql -f supabase/schema.sql`.
2. `postgrest postgrest.conf` (PostgREST v12) — listens on 3001.
3. `npm i pg playwright && node gateway.mjs` — listens on 54321.
4. `npm run build && npx vite preview --port 4173`
5. `bash reset.sh && node phones.cjs`

`ranch.cjs` (after `reset.sh`, needs `supabase/import_kyankwanzi.sql`): imports the Kyankwanzi register, starts per-animal tracking (747 records), tags, weighs and calves animals, checks the outlook, Today, filters, report and Excel, and that a second phone receives the whole herd.

`farms.cjs <shots dir> <data file>` (no cloud needed): opens the two-farm data file on a fresh phone, switches farms, checks the comparison figures for 2018, records farm-total milk, adds and removes a farm, and downloads the all-farms backup.

Last run (18 Oct 2026): phones 25/25, import 16/16, ranch 22/22, farms 22/22.
