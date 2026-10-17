const { chromium } = require('playwright');
const crypto = require('crypto');
const SECRET = 'farmos-local-test-secret-at-least-32-chars!!';
const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const h = b({ alg: 'HS256', typ: 'JWT' }), p = b({ role: 'anon', iat: 1, exp: 4102444800 });
const ANON = `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url')}`;
const APP = 'http://127.0.0.1:4173/', SB = 'http://127.0.0.1:54321';
let CC = null; const results = []; const ok = (name, cond, extra = '') => { results.push((CC ? '[C errs ' + CC.errs.length + '] ' : '') + `${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function phone(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.errs = []; page.on('pageerror', (e) => page.errs.push(e.name + ': ' + e.message + ' @ ' + String(e.stack || '').split('\n').slice(0, 3).join(' ')));
  page.ctx = ctx; page.who = name;
  await page.goto(APP); await page.waitForTimeout(500);
  return page;
}
async function dump(page) {
  return page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('farmos'); r.onsuccess = () => {
      const db = r.result; const out = {}; const names = ['animals', 'milk', 'health', 'transactions', 'feeds', 'feed_moves', 'breeding'];
      const tx = db.transaction(names, 'readonly'); let n = 0;
      for (const t of names) tx.objectStore(t).getAll().onsuccess = (e) => { out[t] = e.target.result; if (++n === names.length) res(out); };
    };
  }));
}
const live = (rows) => (rows || []).filter((x) => !x.deleted);
async function status(page) { return (await page.locator('.sync-pill').innerText()).trim(); }
async function syncNow(page) {
  await page.goto(APP + '#/settings'); await page.waitForTimeout(400);
  const btn = page.getByRole('button', { name: 'Sync now' });
  if (await btn.count()) { await btn.click(); }
  for (let i = 0; i < 40; i++) { await sleep(250); const s = await status(page); if (s === 'Backed up') break; }
  await sleep(300);
}
async function onboard(page, farm) {
  await page.getByLabel('Farm name').fill(farm); await page.getByLabel('Your name').fill(page.who);
  await page.getByText('Start and add my first animal').click(); await page.waitForTimeout(500);
}
async function addAnimal(page, tag, name) {
  await page.goto(APP + '#/animals/new'); await page.waitForTimeout(300);
  await page.getByLabel('Ear tag number').fill(tag); await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Breed').fill('Friesian'); await page.getByLabel('Date of birth').fill('2021-01-10');
  const d = new Date(Date.now() - 60 * 86400000); await page.getByLabel('Last calved').fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  await page.getByRole('button', { name: 'Add animal' }).click(); await page.waitForTimeout(500);
}
async function connect(page, email, { create, owner, farmName } = {}) {
  await page.goto(APP + '#/settings'); await page.waitForTimeout(400);
  // fresh phones use the built-in FarmOS cloud; point this one at the local stand-in
  await page.getByLabel('Email').waitFor(); await page.getByRole('button', { name: 'Use a different project' }).click(); await page.waitForTimeout(400);
  await page.getByLabel('Supabase project URL').fill(SB); await page.getByLabel('Anon public key').fill(ANON);
  await page.getByRole('button', { name: 'Connect' }).click(); await page.waitForTimeout(600);
  await page.getByLabel('Email').fill(email); await page.getByLabel('Password').fill('test-pass-123');
  await page.getByRole('button', { name: create ? 'Create account' : 'Sign in' }).click();
  await page.getByText('Signed in as').waitFor({ timeout: 8000 });
  await page.waitForTimeout(600);
  if (owner) await page.getByRole('button', { name: /in the cloud/ }).click();
  else await page.getByRole('button', { name: new RegExp(farmName) }).click();
  await page.waitForTimeout(800);
  await syncNow(page);
}
async function recordMilk(page, tag, session, litres, date) {
  await page.goto(APP + `#/milk/record?session=${session}${date ? '&date=' + date : ''}`); await page.waitForTimeout(500);
  const sa = page.getByText('Add a cow that\'s not listed'); if (await sa.count()) await sa.click();
  await page.getByLabel(`Litres for ${tag}`).fill(String(litres));
  await page.getByRole('button', { name: /^Save (morning|evening)$/ }).click(); await page.waitForTimeout(500);
}
async function renameAnimal(page, tag, newName) {
  await page.goto(APP + '#/animals'); await page.waitForTimeout(300);
  await page.locator('a.item', { hasText: tag }).first().click(); await page.waitForTimeout(400);
  await page.getByLabel('Edit animal').click(); await page.waitForTimeout(400);
  await page.getByLabel('Name', { exact: true }).fill(newName);
  await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch();
  const A = await phone(browser, 'Owner Fred');
  const C = await phone(browser, 'Manager Sarah'); CC = C;
  C.on('console', (m) => { if (m.type() === 'error') C.errs.push('console: ' + m.text().slice(0, 200)); });
  const W = await phone(browser, 'Farm hand Okello');

  // ── Owner records before ever connecting, then creates the cloud farm
  await onboard(A, 'Ntege Dairy');
  await addAnimal(A, 'ND-001', 'Nalongo');
  await addAnimal(A, 'ND-002', 'Babirye');
  await recordMilk(A, 'ND-001', 'AM', 9.5);
  await A.goto(APP + '#/money'); await A.waitForTimeout(300);
  await A.getByRole('button', { name: 'Expense', exact: true }).click(); await A.waitForTimeout(300);
  await A.getByLabel(/^Amount/).fill('150000'); await A.locator('.sheet-actions .btn.primary').click(); await A.waitForTimeout(400);
  await connect(A, 'fred@ntege.ug', { create: true, owner: true });
  ok('Owner: offline records uploaded after creating the farm', (await status(A)) === 'Backed up', await status(A));

  // ── Invite manager + farm hand
  await A.goto(APP + '#/settings'); await A.waitForTimeout(500);
  const inviteForm = A.locator('form', { has: A.getByPlaceholder('Their email') });
  await A.getByPlaceholder('Their email').fill('sarah@ntege.ug'); await inviteForm.getByRole('button', { name: 'Manager' }).click(); await inviteForm.getByRole('button', { name: 'Invite' }).click(); await A.waitForTimeout(700);
  await A.getByPlaceholder('Their email').fill('okello@ntege.ug'); await inviteForm.getByRole('button', { name: 'Farm hand' }).click(); await inviteForm.getByRole('button', { name: 'Invite' }).click(); await A.waitForTimeout(700);
  ok('Owner sees two pending invites', (await A.getByText('invited, not signed up yet').count()) === 2);

  // ── Manager joins on a fresh phone and receives everything
  await onboard(C, 'Temp');
  await connect(C, 'sarah@ntege.ug', { create: true, farmName: 'Ntege Dairy' });
  let dc = await dump(C);
  ok('Manager phone received animals', live(dc.animals).length === 2, `${live(dc.animals).length} animals`);
  ok('Manager phone received milk', live(dc.milk).length === 1);
  ok('Manager phone received money', live(dc.transactions).some((t) => t.amount === 150000));

  // ── Farm hand joins: sees herd, never receives money
  await onboard(W, 'Temp');
  await connect(W, 'okello@ntege.ug', { create: true, farmName: 'Ntege Dairy' });
  let dw = await dump(W);
  ok('Farm hand received animals', live(dw.animals).length === 2);
  ok('Farm hand did NOT receive money records', live(dw.transactions).length === 0, `${live(dw.transactions).length} money rows`);
  ok('Farm hand menu hides Money', (await (async () => { await W.goto(APP + '#/more'); await W.waitForTimeout(300); return W.getByText('Milk sales, animal sales, expenses, profit').count(); })()) === 0);
  // farm hand records milk + a treatment with a cost
  await recordMilk(W, 'ND-002', 'AM', 11);
  await W.goto(APP + '#/health'); await W.waitForTimeout(300);
  await W.getByRole('button', { name: 'Record treatment' }).click(); await W.waitForTimeout(300);
  await W.locator('.sheet select').first().selectOption({ label: 'ND-002 · Babirye (Friesian)' });
  await W.getByLabel('Problem / diagnosis').fill('Lameness'); await W.getByLabel('Cost').fill('20000');
  await W.locator('.sheet-actions .btn.primary').click(); await W.waitForTimeout(500);
  await syncNow(W);
  ok('Farm hand sync completes (money row stays on phone, no error)', (await status(W)) === 'Backed up', await status(W));
  const wPending = await (async () => { await W.goto(APP + '#/settings'); await W.waitForTimeout(400); return W.locator('text=/changes waiting|Everything uploaded/').first().innerText(); })();
  ok('Farm hand is not stuck with "changes waiting"', /Everything uploaded/.test(wPending), wPending);
  await syncNow(A);
  let da = await dump(A);
  ok("Owner received farm hand's milk", live(da.milk).some((m) => m.litres === 11));
  ok("Owner received farm hand's treatment", live(da.health).some((h) => h.condition === 'Lameness'));
  const { execSync } = require('child_process');
  const serverVet = execSync(`psql -h /var/tmp/farmpg -p 5499 -U postgres -d sb -tAc "select count(*) from farm_records where tbl='transactions' and (data->>'amount')::numeric = 20000"`).toString().trim();
  ok("Farm hand's treatment cost was not uploaded as a money record", serverVet === '0', serverVet + ' rows on server');

  // Feed: owner adds a feed with opening stock, buys more; manager sees same stock
  await A.goto(APP + '#/feed'); await A.waitForTimeout(400);
  await A.getByRole('button', { name: 'Add your first feed' }).click(); await A.waitForTimeout(300);
  await A.getByRole('button', { name: 'Dairy meal' }).click(); await A.getByLabel(/In store now/).fill('50');
  await A.locator('.sheet-actions .btn.primary').click(); await A.waitForTimeout(500);
  await A.getByRole('button', { name: 'Feed bought' }).first().click(); await A.waitForTimeout(300);
  await A.getByLabel(/Quantity/).fill('140'); await A.getByLabel(/Total paid/).fill('196000');
  await A.locator('.sheet-actions .btn.primary').click(); await A.waitForTimeout(500);
  await syncNow(A); await syncNow(C);
  await C.goto(APP + '#/feed'); await C.waitForTimeout(600);
  const cFeed = await C.locator('.item', { hasText: 'Dairy meal' }).innerText().catch(() => '');
  ok('Manager sees the same feed stock (190 kg)', /190 kg/.test(cFeed), cFeed.split('\n').join(' ').slice(0, 80));
  dc = await dump(C);
  ok('Feed purchase cost reached the manager as an expense', live(dc.transactions).some((t) => t.amount === 196000 && t.feed_move_id));

  // ── Offline conflict: both phones edit the same cow and record milk while offline
  await A.ctx.setOffline(true); await C.ctx.setOffline(true);
  await renameAnimal(A, 'ND-001', 'Alpha (older edit)');
  await sleep(1200);
  await renameAnimal(C, 'ND-001', 'Charlie (newer edit)');
  await recordMilk(A, 'ND-001', 'PM', 7);
  await recordMilk(C, 'ND-002', 'PM', 8);
  ok('Offline phone shows it is offline', /Offline|waiting/.test(await status(A)), await status(A));
  // newer phone comes online first, older second (worst case for the older edit)
  await C.ctx.setOffline(false); await syncNow(C);
  await A.ctx.setOffline(false); await syncNow(A); await syncNow(C);
  da = await dump(A); dc = await dump(C);
  const nameA = live(da.animals).find((x) => x.tag === 'ND-001')?.name, nameC = live(dc.animals).find((x) => x.tag === 'ND-001')?.name;
  ok('Conflicting edit: newest wins on both phones', nameA === 'Charlie (newer edit)' && nameC === nameA, `A="${nameA}" C="${nameC}"`);
  const milkKey = (rows) => live(rows).map((m) => `${m.animal_id.slice(0, 4)}-${m.session}-${m.litres}`).sort().join(',');
  ok('Both offline milk entries survive on both phones', live(da.milk).length === 4 && milkKey(da.milk) === milkKey(dc.milk), `A=${live(da.milk).length} C=${live(dc.milk).length}`);

  // ── Delete on one phone reaches the other
  await C.goto(APP + '#/money'); await C.waitForTimeout(400);
  await C.locator('button.item', { hasText: '150,000' }).first().click(); await C.waitForTimeout(300);
  await C.getByRole('button', { name: 'Delete' }).click(); await C.waitForTimeout(400);
  await syncNow(C); await syncNow(A);
  da = await dump(A);
  ok('Deleted expense disappears from the other phone', !live(da.transactions).some((t) => t.amount === 150000));

  // ── Same-session correction on two phones doesn't duplicate
  await recordMilk(A, 'ND-002', 'AM', 12); await syncNow(A); await syncNow(C);
  dc = await dump(C);
  const am2 = live(dc.milk).filter((m) => m.session === 'AM' && live(dc.animals).find((a) => a.id === m.animal_id)?.tag === 'ND-002');
  ok('Correction replaces, no duplicate across phones', am2.length === 1 && am2[0].litres === 12, JSON.stringify(am2.map((m) => m.litres)));

  // ── Lost phone: erase manager phone, sign back in, records return
  await C.goto(APP + '#/settings'); await C.waitForTimeout(400);
  await C.getByText('Erase everything on this phone').click(); await C.waitForTimeout(300);
  await C.locator('.sheet input').fill('ERASE'); await C.getByRole('button', { name: 'Erase', exact: true }).click();
  await C.waitForTimeout(1500);
  await onboard(C, 'Temp');
  await connect(C, 'sarah@ntege.ug', { create: false, farmName: 'Ntege Dairy' });
  dc = await dump(C); da = await dump(A);
  ok('Wiped phone gets every record back from the cloud', live(dc.animals).length === live(da.animals).length && live(dc.milk).length === live(da.milk).length, `animals ${live(dc.animals).length}/${live(da.animals).length}, milk ${live(dc.milk).length}/${live(da.milk).length}`);

  // ── Volume: 60 days offline backlog
  await A.ctx.setOffline(true);
  await A.evaluate(async () => {
    const open = () => new Promise((r) => { const q = indexedDB.open('farmos'); q.onsuccess = () => r(q.result); });
    const db = await open(); const animals = await new Promise((r) => { db.transaction('animals').objectStore('animals').getAll().onsuccess = (e) => r(e.target.result); });
    const tx = db.transaction('milk', 'readwrite'); const st = tx.objectStore('milk'); const now = new Date().toISOString();
    for (let i = 1; i <= 60; i++) for (const a of animals) for (const s of ['AM', 'PM']) {
      const d = new Date(Date.now() - (i + 2) * 86400000); const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      st.put({ id: `bulk-${a.id}-${ds}-${s}`, animal_id: a.id, date: ds, session: s, litres: 5, method: 'measured', created_at: now, updated_at: now, deleted: 0, dirty: 1 });
    }
    await new Promise((r) => (tx.oncomplete = r));
  });
  await A.ctx.setOffline(false); await syncNow(A); await syncNow(C);
  dc = await dump(C);
  ok('240-record offline backlog uploads and reaches the other phone', live(dc.milk).length >= 244, `${live(dc.milk).length} milk rows on manager phone`);

  for (const ph of [A, C, W]) ok(`${ph.who}: no app errors`, ph.errs.length === 0, ph.errs.slice(0, 3).map((e) => e.slice(0, 300)).join(' | '));
  console.log(results.join('\n'));
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.error('CRASH', e.message.split('\n').slice(0, 4).join(' ')); process.exit(1); });
