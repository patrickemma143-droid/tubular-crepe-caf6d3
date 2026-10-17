# FarmOS 2

Dairy farm records that work on a phone, with or without internet.

- **Milk**: cow-by-cow entry per morning/evening, or a herd total split across cows by their usual yield. Re-entering a session corrects it — no duplicates.
- **Animals**: cows, heifers, calves and bulls with tag, breed, age, mother and sire. Mark animals **sold, died or culled** (with price and buyer) and undo if needed.
- **Breeding & calving**: heats, services/AI, pregnancy checks, dry-off, calvings (calves are added to the herd automatically), expected calving dates.
- **Health**: treatments, vaccinations and deworming, milk withdrawal periods, next-due dates. Shows **how many animals need medical attention**.
- **Feed**: every feed in store (dairy meal, bran, napier, hay, minerals), purchases (added to expenses), daily use, stock counts, days of feed left, low-stock warnings, feed cost per litre of milk.
- **Herd register**: the monthly stock count by class used on ranches (cows, heifers, breeding bulls, castrates, young bulls, bull and female calves): brought forward, births, grading between classes, purchases, deaths, sales, closing count and value. Months that don't add up are flagged.
- **Track every animal on a ranch**: start from the herd register — one record per head with a temporary number (TMP-HF-012) until it is ear-tagged, ages estimated from the register's births. Each animal then gets an **outlook**: estimated weight and growth against its breed and feeding, when a heifer will be old and heavy enough to serve, its first calving date, when bulls and steers reach sale weight, and for cows the expected milk today, next 30 days and whole lactation (breed lactation curve, corrected by her own records). Calves born on the farm are tracked from birth and linked to their mother and grandmother. Slow growers, heifers ready to serve, stock at sale weight and cows giving far less than expected show on Today and in the monthly report. **What to record** (More → What to record) is the guide for staff.
- **Several farms, no sign-in**: keep any number of farms on one device (e.g. Kyankwanzi Ranch and Namugongo Farm). Tap the farm name at the top to switch; each farm has its own animals, milk, register and money and they never mix. **Compare farms** puts them side by side by year or month: cattle, goats & pigs, births, deaths, sales, milk, income, expenses and profit, with totals for all farms. Farms can be loaded from a FarmOS data file (welcome screen → *Open a data file*, or Settings → *Open a FarmOS data file*), and *Download backup of all farms* saves every farm in one file. Cloud sign-in is optional.
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

## Loading the farms' spreadsheets

`tools/import/` turns the farms' Excel ledgers into a FarmOS data file:

```bash
python3 -I tools/import/parse.py <Kyankwanzi.xlsx> blocks.json                # Kyankwanzi herd register
python3 -I tools/import/validate.py blocks.json 2026-10 issues.json            # its checks
python3 -I tools/import/namugongo.py <Namugongo.xlsx> namugongo.json          # Namugongo milk, money, register
python3 -I tools/import/make_bundle.py blocks.json issues.json namugongo.json FarmOS_farms.json
```

Open `FarmOS_farms.json` in the app. The data file holds real farm records: it is ignored by git — keep it private and never put it on the website.

## Importing the Kyankwanzi Ranch ledger into the cloud (optional)

After `schema.sql`, and after the owner has created an account in the app, run `supabase/import_kyankwanzi.sql` in the Supabase SQL Editor. It creates *Kyankwanzi Ranch* and *Namugongo Farm* for the owner and loads 106 months of stock (Jan 2018 – Oct 2026). Problems found in the ledger: `supabase/kyankwanzi_import_findings.md`. Tools to import other ledgers: `tools/import/`.

## Testing sync

`tests/sync-e2e/` runs three phones (owner, manager, farm hand) against a local Supabase stand-in and checks offline edits, conflicts, deletes, roles and recovery. See its README. Last run (18 Oct 2026): 25/25 passed; import + farm switching (`import.cjs`): 16/16; ranch tracking on the real Kyankwanzi register (`ranch.cjs`: 747 records created, synced to a second phone, tagging, weighing, calving, outlook, reports): 22/22; two farms on one device with no sign-in (`farms.cjs`: open the data file, switch, compare, add/remove a farm, farm-total milk, all-farms backup): 22/22.

## Code map

```
src/
  lib/growth.ts    breed profiles, growth, serve/sale readiness, lactation curve
  lib/outlook.ts   herd-level outlook and alerts
  lib/bootstrap.ts start per-animal records from the herd register
  db/        types, IndexedDB (Dexie), settings, sample farm
  lib/       dates (local calendar days), herd logic & alerts, reports, actions, sync, export
  components/ UI kit, record forms
  pages/     Today, Animals, Animal profile, Milk, Breeding, Health, Money, Reports, Settings
supabase/schema.sql   tables, row-level security, newest-edit-wins trigger
```

## Known limits

- Reminders show as notifications only while the app is open or recently used; overdue tasks always appear on Today. Guaranteed background alerts need a push server (planned).
