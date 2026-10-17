const { chromium } = require('playwright'); const crypto = require('crypto'); const { execSync } = require('child_process');
const SECRET = 'farmos-local-test-secret-at-least-32-chars!!';
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ role: 'anon', iat: 1, exp: 4102444800 });
const ANON = `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url')}`;
const APP = 'http://127.0.0.1:4173/', SB = 'http://127.0.0.1:54321', S = process.argv[2];
const PSQL = 'psql -h /var/tmp/farmpg -p 5499 -U postgres -d sb -v ON_ERROR_STOP=1';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function dump(page) { return page.evaluate(() => new Promise((res) => { const r = indexedDB.open('farmos'); r.onsuccess = () => { const db = r.result; const out = {}; const names = ['animals', 'stock']; const tx = db.transaction(names, 'readonly'); let n = 0; for (const t of names) tx.objectStore(t).getAll().onsuccess = (e) => { out[t] = e.target.result.filter((x) => !x.deleted); if (++n === names.length) res(out); }; }; })); }
async function waitSynced(page) { for (let i = 0; i < 60; i++) { await sleep(250); if ((await page.locator('.sync-pill').innerText()).trim() === 'Backed up') return; } }
(async () => {
  const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.name + ': ' + e.message));
  // Patrick sets up Namugongo on his phone and signs up
  await pg.goto(APP); await pg.waitForTimeout(500);
  await pg.getByLabel('Farm name').fill('Namugongo Farm'); await pg.getByLabel('Your name').fill('Patrick');
  await pg.getByText('Start and add my first animal').click(); await pg.waitForTimeout(400);
  await pg.getByLabel('Ear tag number').fill('NMG-001'); await pg.getByLabel('Name', { exact: true }).fill('Namugongo cow'); await pg.getByRole('button', { name: 'Add animal' }).click(); await pg.waitForTimeout(400);
  await pg.goto(APP + '#/settings'); await pg.waitForTimeout(400);
  // fresh phones use the built-in FarmOS cloud; point this one at the local stand-in
  await pg.getByLabel('Email').waitFor(); await pg.getByRole('button', { name: 'Use a different project' }).click(); await pg.waitForTimeout(400);
  await pg.getByLabel('Supabase project URL').fill(SB); await pg.getByLabel('Anon public key').fill(ANON); await pg.getByRole('button', { name: 'Connect' }).click(); await pg.waitForTimeout(500);
  await pg.getByLabel('Email').fill('patrickemma143@gmail.com'); await pg.getByLabel('Password').fill('test-pass-123'); await pg.getByRole('button', { name: 'Create account' }).click();
  await pg.getByText('Signed in as').waitFor(); await pg.waitForTimeout(500);
  await pg.getByRole('button', { name: /in the cloud/ }).click(); await pg.waitForTimeout(800); await waitSynced(pg);

  // Run the import SQL twice in "Supabase"
  const out1 = execSync(`${PSQL} -f /home/claude/farmos-v2/supabase/import_kyankwanzi.sql 2>&1`).toString();
  const out2 = execSync(`${PSQL} -f /home/claude/farmos-v2/supabase/import_kyankwanzi.sql 2>&1`).toString();
  console.log(out2.split('\n').filter((l) => /\|/.test(l) || /rows?\)/.test(l)).join('\n'));
  const farms = execSync(`${PSQL} -tAc "select name from farms order by name"`).toString().trim().split('\n');
  ok('SQL runs twice without error', !/ERROR/.test(out1 + out2));
  ok('Exactly two farms, Namugongo not duplicated', farms.length === 2 && farms.includes('Kyankwanzi Ranch') && farms.includes('Namugongo Farm'), farms.join(', '));
  const rows = execSync(`${PSQL} -tAc "select count(*) from farm_records where tbl='stock'"`).toString().trim();
  ok('742 register rows, no duplicates after second run', rows === '742', rows);
  const missing = execSync(`${PSQL} -tAc "select count(*) from auth.users"`).toString().trim();

  // Switch the phone to Kyankwanzi
  await pg.goto(APP + '#/settings'); await pg.reload(); await pg.waitForTimeout(1500);
  ok('Settings lists both farms', (await pg.getByText('Your farms').count()) === 1);
  await pg.locator('.item', { hasText: 'Kyankwanzi Ranch' }).getByRole('button', { name: 'Switch' }).click();
  await pg.waitForTimeout(800); await waitSynced(pg);
  let d = await dump(pg);
  ok('Kyankwanzi loaded on the phone: 742 register rows', d.stock.length === 742, String(d.stock.length));
  ok('Namugongo cow did NOT come along to Kyankwanzi', !d.animals.some((a) => a.tag === 'NMG-001'), d.animals.map((a) => a.tag).join(','));
  ok('Top bar shows Kyankwanzi Ranch', (await pg.locator('.topbar .farm').innerText()).includes('Kyankwanzi'));
  const kykNmg = execSync(`${PSQL} -tAc "select count(*) from farm_records r join farms f on f.id=r.farm_id where f.name='Kyankwanzi Ranch' and r.tbl='animals'"`).toString().trim();
  ok('Server: no Namugongo animals inside Kyankwanzi', kykNmg === '0', kykNmg);

  await pg.goto(APP + '#/register'); await pg.waitForTimeout(800); await pg.screenshot({ path: S + '/v2/reg-1.png', fullPage: true });
  const head = await pg.locator('.report .kv > div').first().innerText();
  ok('Register opens on Oct 2026 with 747 head', /747/.test(head) && /Oct 26/.test(head), head.replace(/\n/g, ' '));
  await pg.locator('select[aria-label="Month"]').selectOption('2024-01'); await pg.waitForTimeout(400);
  const iss = await pg.getByText(/figures? don.t add up this month/).innerText().catch(() => 'none');
  ok('Jan 2024 shows the carry-forward problems', /4 figures/.test(iss), iss);
  await pg.screenshot({ path: S + '/v2/reg-2-jan2024.png', fullPage: true });
  await pg.goto(APP + '#/'); await pg.waitForTimeout(700);
  ok('Today shows register head count', /747/.test(await pg.locator('.herdline').innerText()));
  await pg.screenshot({ path: S + '/v2/reg-3-today.png' });
  // monthly report for September 2026
  await pg.goto(APP + '#/reports'); await pg.waitForTimeout(600);
  await pg.getByRole('button', { name: 'Previous' }).click(); await pg.waitForTimeout(500);
  const regSec = await pg.locator('section', { hasText: 'Herd register' }).first().innerText();
  ok('September 2026 report: 731 B/F, 16 born, 747 closing', /731\s*B\/F/.test(regSec) && /16\s*born/.test(regSec) && /747\s*closing/.test(regSec), regSec.split('\n').slice(0, 4).join(' '));
  await pg.locator('section', { hasText: 'Herd register' }).first().screenshot({ path: S + '/v2/reg-4-report.png' });
  // record October movements in the app, then switch back
  await pg.goto(APP + '#/register'); await pg.waitForTimeout(500);
  await pg.getByRole('button', { name: /Edit Oct/ }).click(); await pg.waitForTimeout(500);
  await pg.getByLabel('Female calves Births').fill('3'); await pg.getByLabel('Bull calves Deaths').fill('1');
  await pg.getByRole('button', { name: 'Save month' }).click(); await pg.waitForTimeout(600);
  ok('Recording October updates closing to 749', /749/.test(await pg.locator('.report .kv > div').first().innerText()));
  await waitSynced(pg);
  await pg.goto(APP + '#/settings'); await pg.waitForTimeout(1200);
  await pg.locator('.item', { hasText: 'Namugongo Farm' }).getByRole('button', { name: 'Switch' }).click(); await pg.waitForTimeout(800); await waitSynced(pg);
  d = await dump(pg);
  ok('Back on Namugongo: cow is back, no Kyankwanzi register', d.animals.some((a) => a.tag === 'NMG-001') && d.stock.length === 0, `${d.animals.length} animals, ${d.stock.length} register rows`);
  const octServer = execSync(`${PSQL} -tAc "select data->>'closing' from farm_records where id='stk-2026-10-female-calves'"`).toString().trim();
  ok("October edit reached the cloud (female calves 170)", octServer === '170', octServer);
  ok('No app errors', errs.length === 0, errs.join(' | '));
  console.log(res.join('\n')); await br.close();
})().catch((e) => { console.log(res.join('\n')); console.error('CRASH', e.message.split('\n').slice(0, 3).join(' ')); });
