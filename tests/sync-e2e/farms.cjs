// Several farms on one device, no sign-in: open the Kyankwanzi + Namugongo data
// file on a fresh phone, switch farms, compare, add a farm, start individual
// tracking on Kyankwanzi, and check farms never mix.
// Usage: node farms.cjs <screenshot dir> <data file .json>
const { chromium } = require('playwright');
const APP = 'http://127.0.0.1:4173/', S = process.argv[2] || '.', FILE = process.argv[3];
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`);
const dbs = (pg) => pg.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());
const count = (pg, dbName, table) => pg.evaluate(([n, t]) => new Promise((res) => { const r = indexedDB.open(n); r.onsuccess = () => { const db = r.result; if (!db.objectStoreNames.contains(t)) { res(-1); return; } const q = db.transaction(t).objectStore(t).count(); q.onsuccess = () => { res(q.result); db.close(); }; }; }), [dbName, table]);
const text = (pg) => pg.locator('body').innerText();

(async () => {
  const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.name + ': ' + e.message));
  await pg.goto(APP); await pg.waitForTimeout(600);
  await pg.screenshot({ path: S + '/v2/mf-0-welcome.png', fullPage: true });
  const t0 = Date.now();
  await pg.locator('input[type=file]').setInputFiles(FILE);
  await pg.waitForFunction(() => document.querySelector('.topbar .farm-switch')?.textContent?.includes('Kyankwanzi'), null, { timeout: 20000 });
  ok('Opening the data file on a fresh phone lands on Kyankwanzi Ranch', true, `${Date.now() - t0} ms`);
  ok('Two farm databases, nothing else', JSON.stringify(await dbs(pg)) === JSON.stringify(['farmos', 'farmos-kyankwanzi-ranch', 'farmos-namugongo-farm']), (await dbs(pg)).join(','));
  ok('Kyankwanzi: 742 register rows, no Namugongo milk or money', (await count(pg, 'farmos-kyankwanzi-ranch', 'stock')) === 742 && (await count(pg, 'farmos-kyankwanzi-ranch', 'milk')) === 0 && (await count(pg, 'farmos-kyankwanzi-ranch', 'transactions')) === 0);
  ok('Namugongo: 85 register rows, 716 milk days, 421 money records', (await count(pg, 'farmos-namugongo-farm', 'stock')) === 85 && (await count(pg, 'farmos-namugongo-farm', 'milk')) === 716 && (await count(pg, 'farmos-namugongo-farm', 'transactions')) === 421);
  await pg.waitForFunction(() => /On this device/.test(document.querySelector('.sync-pill')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  ok('No sign-in asked; status says On this device', /On this device/.test(await pg.locator('.sync-pill').innerText()), await pg.locator('.sync-pill').innerText());
  await pg.goto(APP + '#/register'); await pg.waitForTimeout(800);
  ok('Kyankwanzi register shows 747 head (Oct 2026)', /747/.test(await pg.locator('.report .kv > div').first().innerText()));

  // Switch to Namugongo from the farm name
  await pg.locator('.topbar .farm-switch').click(); await pg.waitForTimeout(500);
  const sheet = await text(pg);
  ok('Switcher lists both farms with record counts', /Kyankwanzi Ranch/.test(sheet) && /Namugongo Farm/.test(sheet) && /Compare farms/.test(sheet));
  await pg.screenshot({ path: S + '/v2/mf-1-switcher.png' });
  await pg.getByRole('button', { name: /Namugongo Farm/ }).click();
  await pg.waitForFunction(() => document.querySelector('.topbar .farm-switch')?.textContent?.includes('Namugongo'), null, { timeout: 15000 });
  await pg.waitForTimeout(600);
  ok('Switched to Namugongo with no sign-in', true);
  await pg.screenshot({ path: S + '/v2/mf-2-nmg-today.png', fullPage: true });
  await pg.goto(APP + '#/register'); await pg.waitForTimeout(800);
  const reg = await text(pg);
  ok('Namugongo register: 46 head in Sep 2026, goats and pigs listed', /46/.test(await pg.locator('.report .kv > div').first().innerText()) && /Goats/.test(reg) && /Pigs/.test(reg), (await pg.locator('.report .kv > div').first().innerText()).replace(/\n/g, ' '));
  await pg.screenshot({ path: S + '/v2/mf-3-nmg-register.png', fullPage: true });
  await pg.goto(APP + '#/reports'); await pg.waitForTimeout(500);
  await pg.getByRole('button', { name: 'Choose dates' }).click(); await pg.waitForTimeout(300);
  await pg.getByLabel('From').fill('2018-01-01'); await pg.getByLabel('To').fill('2018-12-31'); await pg.waitForTimeout(800);
  const rep = await text(pg);
  ok('Namugongo 2018 report: 8,633 L milk', /8,633/.test(rep));
  await pg.screenshot({ path: S + '/v2/mf-4-nmg-report2018.png', fullPage: true });

  // Compare
  await pg.goto(APP + '#/compare'); await pg.waitForTimeout(1500);
  await pg.locator('select[aria-label="Year"]').selectOption('2018'); await pg.waitForTimeout(600);
  const cmp = await pg.locator('table.cmp').innerText();
  const cells = await pg.$$eval('table.cmp tbody tr', (trs) => Object.fromEntries(trs.map((tr) => [...tr.cells].map((c) => (c.firstChild?.textContent || c.textContent).trim())).filter((c) => c.length > 1).map((c) => [c[0], c.slice(1)])));
  const L = (k) => (cells[k] || []).join(' | ');
  ok('Compare 2018: cattle at end — Kyankwanzi 608, Namugongo 10, both 618', L('Cattle at end') === '608 | 10 | 618', L('Cattle at end'));
  ok('Compare 2018: goats & pigs shown apart (Namugongo 37)', L('Goats, pigs & other') === '0 | 37 | 37', L('Goats, pigs & other'));
  ok('Compare 2018: Kyankwanzi calves born 82, died 2, sold 65', /^82 \|/.test(L('Calves born')) && /^2 \|/.test(L('Cattle died')) && /^65 \|/.test(L('Cattle sold')), [L('Calves born'), L('Cattle died'), L('Cattle sold')].join(' / '));
  ok('Compare 2018: Namugongo milk 8,633 L, income UGX 15M', L('Milk recorded (L)') === '0 | 8,633 | 8,633' && /UGX 15M/.test(L('All income')), [L('Milk recorded (L)'), L('All income')].join(' / '));
  await pg.screenshot({ path: S + '/v2/mf-5-compare.png', fullPage: true });
  await pg.setViewportSize({ width: 1280, height: 900 }); await pg.waitForTimeout(400);
  await pg.screenshot({ path: S + '/v2/mf-5b-compare-wide.png', fullPage: true });
  await pg.setViewportSize({ width: 390, height: 844 });

  // Record today's milk at Namugongo as a farm total (no cow records there)
  await pg.goto(APP + '#/milk/herd'); await pg.waitForTimeout(500);
  await pg.getByLabel('Total litres from all cows').fill('31'); await pg.getByRole('button', { name: /Save/ }).click(); await pg.waitForTimeout(700);
  ok('Farm-total milk saved at Namugongo', (await count(pg, 'farmos-namugongo-farm', 'milk')) === 717);
  ok('…and not at Kyankwanzi', (await count(pg, 'farmos-kyankwanzi-ranch', 'milk')) === 0);

  // Add a third farm, then go back to Kyankwanzi and start individual tracking
  await pg.locator('.topbar .farm-switch').click(); await pg.waitForTimeout(400);
  await pg.getByRole('button', { name: 'Add a farm' }).click(); await pg.getByLabel('New farm name').fill('Mukono Test Farm'); await pg.getByRole('button', { name: 'Add and open' }).click();
  await pg.waitForFunction(() => document.querySelector('.topbar .farm-switch')?.textContent?.includes('Mukono'), null, { timeout: 15000 });
  ok('New farm opens empty (0 animals, no register)', /0 on the farm|No animals yet|Good (morning|afternoon|evening)/.test(await text(pg)) && (await count(pg, 'farmos-mukono-test-farm', 'stock')) === 0);
  await pg.goto(APP + '#/settings'); await pg.waitForTimeout(900);
  await pg.locator('#farms .item', { hasText: 'Kyankwanzi Ranch' }).getByRole('button', { name: 'Open' }).click();
  await pg.waitForFunction(() => document.querySelector('.topbar .farm-switch')?.textContent?.includes('Kyankwanzi'), null, { timeout: 15000 });
  await pg.goto(APP + '#/register'); await pg.waitForTimeout(900);
  await pg.getByRole('button', { name: 'Start tracking each animal' }).click(); await pg.waitForTimeout(400);
  await pg.getByRole('button', { name: 'Create 747 records' }).click(); await pg.waitForURL(/filter=untagged/); await pg.waitForTimeout(600);
  ok('Kyankwanzi individual tracking: 747 animals, Namugongo still 0', (await count(pg, 'farmos-kyankwanzi-ranch', 'animals')) === 747 && (await count(pg, 'farmos-namugongo-farm', 'animals')) === 0);
  await pg.goto(APP + '#/compare'); await pg.waitForTimeout(1500);
  ok('Compare lists all three farms', /Mukono Test Farm/.test(await pg.locator('table.cmp').innerText().catch(() => '')) || /Mukono Test Farm/.test(await text(pg)));
  // Remove the test farm from Settings
  await pg.goto(APP + '#/settings'); await pg.waitForTimeout(900);
  await pg.locator('#farms .item', { hasText: 'Mukono Test Farm' }).getByRole('button', { name: 'Remove' }).click(); await pg.getByRole('button', { name: 'Remove', exact: true }).last().click(); await pg.waitForTimeout(800);
  ok('Removing a farm deletes only that farm', !(await dbs(pg)).includes('farmos-mukono-test-farm') && (await count(pg, 'farmos-namugongo-farm', 'milk')) === 717);
  // Backup of all farms
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.getByText('Download backup of all farms').click()]);
  const all = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
  ok('All-farms backup holds both farms', all.kind === 'farms' && all.farms.length === 2 && all.farms.some((f) => f.settings.farm_name === 'Namugongo Farm' && f.milk.length === 717), all.farms.map((f) => f.settings.farm_name).join(', '));
  ok('No app errors', errs.length === 0, errs.join(' | '));
  console.log(res.join('\n')); await br.close();
})().catch((e) => { console.log(res.join('\n')); console.error('CRASH', e.message.split('\n').slice(0, 3).join(' ')); process.exit(1); });
