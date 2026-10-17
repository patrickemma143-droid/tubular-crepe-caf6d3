# FarmOS 2

Dairy farm records that work on a phone, with or without internet.

- **Milk**: cow-by-cow entry per morning/evening, or a herd total split across cows by their usual yield. Re-entering a session corrects it — no duplicates.
- **Animals**: cows, heifers, calves and bulls with tag, breed, age, mother and sire. Mark animals **sold, died or culled** (with price and buyer) and undo if needed.
- **Breeding & calving**: heats, services/AI, pregnancy checks, dry-off, calvings (calves are added to the herd automatically), expected calving dates.
- **Health**: treatments, vaccinations and deworming, milk withdrawal periods, next-due dates. Shows **how many animals need medical attention**.
- **Feed**: every feed in store (dairy meal, bran, napier, hay, minerals), purchases (added to expenses), daily use, stock counts, days of feed left, low-stock warnings, feed cost per litre of milk.
- **Herd register**: the monthly stock count by class used on ranches (cows, heifers, breeding bulls, castrates, young bulls, bull and female calves): brought forward, births, grading between classes, purchases, deaths, sales, closing count and value. Months that don't add up are flagged.
- **Several farms**: one account can own several farms (e.g. Namugongo and Kyankwanzi). Switch farms under Settings; each phone holds one farm at a time and never mixes their records.
- **Money**: milk sales, animal sales, expenses by category. Vet, AI and animal purchase costs are added automatically.
- **Reports**: weekly, monthly or any dates — herd movement (born, bought, sold, died), milk per cow, breeding, health, profit. Download as **PDF** or **Excel**, or print.
- **Today screen**: what needs doing — sick cows, withdrawal, calvings due, heat watch, pregnancy checks, overdue vaccines, milk drops, missed milk entries.
- **Installable** (PWA) and fully **offline**. Optional cloud backup and team sharing with Supabase.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # herd, report and feed logic tests
npm run build      # production build in dist/
```

The `dist/` folder is a ready-to-deploy build: drag it into Netlify (Sites → Add new site → Deploy manually), or connect the repo — `netlify.toml` is included. It must be served over HTTPS for "Install app" and offline mode to work.

## Install on a phone

Open the site in Chrome on Android → menu ⋮ → **Install app**. On iPhone: Safari → Share → **Add to Home Screen**. The app also offers an Install button under Settings.

## Cloud backup and team (optional)

Without this, records stay on the phone (download a backup file from Settings regularly).

1. Create a free project at supabase.com.
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. In FarmOS: Settings → Cloud backup → paste the project URL and anon key (Project settings → API). To pre-fill them for everyone, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before building (see `.env.example`).
4. Create an account, then **Create farm**. Invite others by email as *manager* or *farm hand*. Farm hands can record milk, breeding and health but cannot see money (enforced in the database).

How sync works: every record is uploaded separately with its edit time. The database keeps the newest edit of each record, deletes are kept as markers, and phones pull only what changed. Two phones recording offline at the same time both keep their work.

## Importing the Kyankwanzi Ranch ledger

After `schema.sql`, and after the owner has created an account in the app, run `supabase/import_kyankwanzi.sql` in the Supabase SQL Editor. It creates *Kyankwanzi Ranch* and *Namugongo Farm* for the owner and loads 106 months of stock (Jan 2018 – Oct 2026). Problems found in the ledger: `supabase/kyankwanzi_import_findings.md`. Tools to import other ledgers: `tools/import/`.

## Testing sync

`tests/sync-e2e/` runs three phones (owner, manager, farm hand) against a local Supabase stand-in and checks offline edits, conflicts, deletes, roles and recovery. See its README. Last run: 25/25 passed; import + farm switching (`import.cjs`): 16/16.

## Code map

```
src/
  db/        types, IndexedDB (Dexie), settings, sample farm
  lib/       dates (local calendar days), herd logic & alerts, reports, actions, sync, export
  components/ UI kit, record forms
  pages/     Today, Animals, Animal profile, Milk, Breeding, Health, Money, Reports, Settings
supabase/schema.sql   tables, row-level security, newest-edit-wins trigger
```

## Known limits

- Reminders show as notifications only while the app is open or recently used; overdue tasks always appear on Today. Guaranteed background alerts need a push server (planned).
