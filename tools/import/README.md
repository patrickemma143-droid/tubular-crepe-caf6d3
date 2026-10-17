# Importing a ranch stock ledger

For Excel ledgers laid out like the Kyankwanzi Ranch file: one sheet per year, twelve
monthly blocks, each with a date cell, a header row and one row per class
(B/F, cost, births, grade in, purchased, deaths, grade out, sold, total, unit cost, remarks).

```bash
python3 parse.py ledger.xlsx blocks.json            # read every monthly block
python3 validate.py blocks.json 2026-10 issues.json # check sums, carry-forward, grading (up to this month)
python3 make_sql.py blocks.json issues.json import.sql
```

Edit `OWNER_EMAIL`, `CUTOFF`, farm names and `SRC` at the top of `make_sql.py` for another farm.
`STAMP` must be a time in the past, so later edits made in the app always win.

## Namugongo dairy farm workbook and the two-farm data file

```bash
python3 -I namugongo.py Namugongo.xlsx namugongo.json    # milk 2017-18, money 2016-18, stock-takes 2018-2026, with issues
python3 -I make_bundle.py blocks.json issues.json namugongo.json FarmOS_farms.json
```

`FarmOS_farms.json` opens in the app (welcome screen → Open a data file, or Settings → Open a FarmOS data file)
and adds Kyankwanzi Ranch and Namugongo Farm as two farms on the device. It holds real records: keep it private.
