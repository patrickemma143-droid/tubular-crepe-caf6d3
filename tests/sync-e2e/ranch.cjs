// Kyankwanzi: start individual tracking from the imported herd register, then
// tag, weigh and calve animals, and check the outlook, reports and a second phone.
// Needs the same local stand-in as phones.cjs plus supabase/import_kyankwanzi.sql.
const { chromium } = require('playwright'); const crypto = require('crypto'); const { execSync } = require('child_process');
const SECRET = 'farmos-local-test-secret-at-least-32-chars!!';
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ role: 'anon', iat: 1, exp: 4102444800 });
const ANON = `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url')}`;
const APP = 'http://127.0.0.1:4173/', SB = 'http://127.0.0.1:54321', S = process.argv[2] || '.';
const PSQL = 'psql -h /var/tmp/farmpg -p 5499 -U postgres -d sb -v ON_ERROR_STOP=1';
const res = []; const ok = (n, c, x = '') => res.push(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (sql) => execSync(`${PSQL} -tAc "${sql}"`).toString().trim();
async function dump(page) { return page.evaluate(() => new Promise((res) => { const r = indexedDB.open('farmos'); r.onsuccess = () => { const db = r.result; const out = {}; const names = ['animals', 'stock', 'breeding', 'weights']; const tx = db.transaction(names, 'readonly'); let n = 0; for (const t of names) tx.objectStore(t).getAll().onsuccess = (e) => { out[t] = e.target.result.filter((x) => !x.deleted); if (++n === names.length) res(out); }; }; })); }
async function waitSynced(page, tries = 120) { for (let i = 0; i < tries; i++) { await sleep(250); if ((await page.locator('.sync-pill').innerText()).trim() === 'Backed up') return true; } return false; }
async function phone(br, errs, who) {
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(who + ' ' + e.name + ': ' + e.message));
  return pg;
}
async function signIn(pg, farmName, create) {
  await pg.goto(APP); await pg.waitForTimeout(500);
  await pg.getByLabel('Farm name').fill(farmName); await pg.getByLabel('Your name').fill('Patrick');
  await pg.getByText('Start and add my first animal').click(); await pg.waitForTimeout(400);
  await pg.goto(APP + '#/settings'); await pg.waitForTimeout(400);
  // fresh phones use the built-in FarmOS cloud; point this one at the local stand-in
  await pg.getByLabel('Email').waitFor(); await pg.getByRole('button', { name: 'Use a different project' }).click(); await pg.waitForTimeout(400);
  await pg.getByLabel('Supabase project URL').fill(SB); await pg.getByLabel('Anon public key').fill(ANON); await pg.getByRole('button', { name: 'Connect' }).click(); await pg.waitForTimeout(500);
  await pg.getByLabel('Email').fill('patrickemma143@gmail.com'); await pg.getByLabel('Password').fill('test-pass-123');
  await pg.getByRole('button', { name: create ? 'Create account' : 'Sign in' }).click();
  await pg.getByText('Signed in as').waitFor(); await pg.waitForTimeout(800);
}

(async () => {
  const br = await chromium.launch(); const errs = [];
  const pg = await phone(br, errs, 'A');
  await signIn(pg, 'Namugongo Farm', true);
  await pg.getByRole('button', { name: /in the cloud/ }).click(); await pg.waitForTimeout(800); await waitSynced(pg);
  execSync(`${PSQL} -f /home/claude/farmos-v2/supabase/import_kyankwanzi.sql 2>&1`);
  await pg.goto(APP + '#/settings'); await pg.reload(); await pg.waitForTimeout(1500);
  await pg.locator('.item', { hasText: 'Kyankwanzi Ranch' }).getByRole('button', { name: 'Switch' }).click(); await pg.waitForTimeout(800); await waitSynced(pg);

  // Start tracking each animal
  await pg.goto(APP + '#/register'); await pg.waitForTimeout(800);
  await pg.getByRole('button', { name: 'Start tracking each animal' }).click(); await pg.waitForTimeout(500);
  const sheet = await pg.locator('.sheet').innerText().catch(() => pg.locator('body').innerText());
  ok('Plan lists 747 records for Oct 2026', /Create 747 records/.test(await pg.locator('body').innerText()) && /October 2026/.test(sheet));
  await pg.getByLabel('Breed of most animals').fill('Ankole');
  await pg.screenshot({ path: S + '/v2/rt-1-start.png', fullPage: true });
  const t0 = Date.now();
  await pg.getByRole('button', { name: 'Create 747 records' }).click();
  await pg.waitForURL(/filter=untagged/); await pg.locator('.item').first().waitFor();
  ok('Records created and animal list shown quickly', Date.now() - t0 < 8000, `${Date.now() - t0} ms`);
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: S + '/v2/rt-2-animals.png' });
  let d = await dump(pg);
  const by = (pre) => d.animals.filter((a) => a.tag.startsWith(pre)).length;
  ok('747 animals: 231 cows, 149 heifers, 167 female calves, 122 bull calves, 70 steers, 4+4 bulls', d.animals.length === 747 && by('TMP-CW') === 231 && by('TMP-HF') === 149 && by('TMP-FC') === 167 && by('TMP-BC') === 122 && by('TMP-CS') === 70 && by('TMP-BB') === 4 && by('TMP-YB') === 4, String(d.animals.length));
  ok('All marked not tagged, breed Ankole, ages estimated', d.animals.every((a) => a.provisional && a.breed === 'Ankole') && d.animals.filter((a) => a.dob).every((a) => a.dob_estimated));
  ok('Chip "Not tagged yet" shows 747', /Not tagged yet\s*747/.test(await pg.locator('.chips').innerText()));
  const t2 = Date.now(); let n = '0';
  for (let i = 0; i < 120 && n !== '747'; i++) { await sleep(500); n = q("select count(*) from farm_records r join farms f on f.id=r.farm_id where f.name='Kyankwanzi Ranch' and r.tbl='animals'"); }
  await sleep(1500); await waitSynced(pg);
  ok('747 animals reach the cloud', n === '747', `${n} in ${Date.now() - t2} ms`);

  // Register comparison
  await pg.goto(APP + '#/register'); await pg.waitForTimeout(900);
  const cmp = await pg.locator('section', { hasText: 'Animal records vs register' }).innerText();
  ok('Register shows records vs register and tagging progress', /0 of 747/.test(cmp), cmp.split('\n').slice(0, 3).join(' | '));
  ok('Start card is gone once tracking has started', (await pg.getByRole('button', { name: 'Start tracking each animal' }).count()) === 0);
  await pg.locator('section', { hasText: 'Animal records vs register' }).screenshot({ path: S + '/v2/rt-3-compare.png' });

  // Tag a female calf
  const fc = d.animals.find((a) => a.tag === 'TMP-FC-001');
  await pg.goto(APP + `#/animals/${fc.id}`); await pg.waitForTimeout(700);
  await pg.screenshot({ path: S + '/v2/rt-4-calf.png', fullPage: true });
  ok('Calf profile shows outlook with serve date', /Ready to serve/.test(await pg.locator('body').innerText()));
  await pg.getByLabel('Ear tag number').fill('kyk-0001'); await pg.getByRole('button', { name: 'Tag', exact: true }).click(); await pg.waitForTimeout(600);
  d = await dump(pg);
  const tagged = d.animals.find((a) => a.id === fc.id);
  ok('Tagging replaces the temporary number', tagged.tag === 'KYK-0001' && !tagged.provisional, tagged.tag);
  await pg.getByLabel('Ear tag number').waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  ok('Tag box disappears after tagging', (await pg.getByRole('button', { name: 'Tag', exact: true }).count()) === 0);

  // Weigh an older heifer: heavy enough → ready to serve
  const hf = d.animals.find((a) => a.tag === 'TMP-HF-149');
  await pg.goto(APP + `#/animals/${hf.id}`); await pg.waitForTimeout(600);
  await pg.getByRole('button', { name: 'Weight', exact: true }).click(); await pg.waitForTimeout(300);
  await pg.getByLabel('Weight (kg)').fill('235'); await pg.getByRole('button', { name: 'Save' }).click(); await pg.waitForTimeout(600);
  const out = await pg.locator('section', { hasText: 'Outlook' }).innerText();
  ok('Weighed heifer: 235 kg weighed today, ready to serve now', /235 kg/.test(out) && /weighed today/.test(out) && /Ready to serve\s*Now/.test(out), out.replace(/\n/g, ' | ').slice(0, 200));
  await pg.screenshot({ path: S + '/v2/rt-5-heifer.png', fullPage: true });

  // A cow calves: the calf joins the herd, linked to its mother, in the calves group
  const cw = d.animals.find((a) => a.tag === 'TMP-CW-001');
  await pg.goto(APP + `#/animals/${cw.id}`); await pg.waitForTimeout(600);
  await pg.getByRole('button', { name: 'Calved', exact: true }).click(); await pg.waitForTimeout(400);
  await pg.getByLabel('Tag number', { exact: true }).fill('TMP-FC-500'); await pg.getByRole('button', { name: 'Save' }).click(); await pg.waitForTimeout(700);
  d = await dump(pg);
  const calf = d.animals.find((a) => a.tag === 'TMP-FC-500');
  ok('New calf tracked: linked to mother, group Female calves, not tagged', calf && calf.dam_id === cw.id && calf.group === 'Female calves' && calf.provisional, calf && `${calf.group} ${calf.provisional}`);
  await pg.goto(APP + `#/animals/${cw.id}`); await pg.waitForTimeout(600);
  const cowText = await pg.locator('body').innerText();
  ok('Cow now milking with an expected-milk forecast', /Expected milk today/.test(cowText) && /Whole lactation/.test(cowText));
  await pg.screenshot({ path: S + '/v2/rt-6-cow.png', fullPage: true });

  // Today, Animals filters, report, guide
  const t1 = Date.now(); await pg.goto(APP + '#/'); await pg.locator('.herdline').waitFor(); await pg.waitForTimeout(300);
  ok('Today opens with 748 animals', /748/.test(await pg.locator('.herdline').innerText()), `${Date.now() - t1} ms`);
  const today = await pg.locator('body').innerText();
  ok('Today: tagging progress and 3-month outlook', /747 of 748 animals still need ear tags/.test(today) && /Next 3 months/.test(today));
  await pg.screenshot({ path: S + '/v2/rt-7-today.png', fullPage: true });
  await pg.goto(APP + '#/animals'); await pg.waitForTimeout(800);
  const chips = await pg.locator('.chips').innerText();
  ok('Animals filters: Steers 70, Ready to serve, At sale weight', /Steers\s*70/.test(chips) && /Ready to serve\s*\d+/.test(chips) && /At sale weight\s*\d+/.test(chips), chips.replace(/\n/g, ' '));
  await pg.goto(APP + '#/reports'); await pg.waitForTimeout(1200);
  const ol = await pg.locator('section', { hasText: 'Herd outlook' }).first().innerText();
  ok('Monthly report has a herd outlook', /calvings due/.test(ol) && /1 \/ 748/.test(ol), ol.split('\n').slice(0, 2).join(' '));
  await pg.locator('section', { hasText: 'Herd outlook' }).first().screenshot({ path: S + '/v2/rt-8-report.png' });
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.getByRole('button', { name: /Excel/ }).click()]);
  const xl = await dl.path(); const XLSX = require('xlsx'); const wb = XLSX.readFile(xl);
  ok('Excel report has an Outlook sheet', wb.SheetNames.includes('Outlook'), wb.SheetNames.join(','));
  await pg.goto(APP + '#/guide'); await pg.waitForTimeout(400);
  ok('Recording guide opens', /Births — within 24 hours/.test(await pg.locator('body').innerText()));
  await pg.screenshot({ path: S + '/v2/rt-9-guide.png' });
  await sleep(3500); await waitSynced(pg, 120);

  // A second phone signs in and gets the whole tracked herd
  const pb = await phone(br, errs, 'B');
  await signIn(pb, 'Kyankwanzi phone', false);
  await pb.goto(APP + '#/settings'); await pb.waitForTimeout(1200);
  await pb.getByRole('button', { name: 'Kyankwanzi Ranch · owner' }).click();
  for (let i = 0; i < 120 && (await dump(pb)).animals.length < 748; i++) await sleep(500);
  const db2 = await dump(pb);
  ok('Second phone receives 748 animals with the tag and calving', db2.animals.length === 748 && db2.animals.some((a) => a.tag === 'KYK-0001') && db2.breeding.some((e) => e.type === 'calving'), `${db2.animals.length} animals`);
  ok('No app errors', errs.length === 0, errs.join(' | '));
  console.log(res.join('\n')); await br.close();
})().catch((e) => { console.log(res.join('\n')); console.error('CRASH', e.message.split('\n').slice(0, 3).join(' ')); process.exit(1); });
