// THE FIVE NUMBERS THE OWNER TUNES, DRIVEN IN A REAL BROWSER (round 1, part 2; two added 08-03).
//
// Charlie wrap-up seconds, the hold cap, how much silence means Staff walked off, how long a phone
// may ring while we wait for a human, and how long a whole check may run. They decide
// whether a check makes money, so he tunes them against real checks rather than guessing, and that
// means Admin has to save them to the environment he is looking at and show him what will actually
// run. Two things are invisible from the rendered screen and are the whole point of this file:
// WHICH SERVICE each read and each write lands on, and what the box says after a save.
//
// Run: node scripts/qa-admin-call-tuning.mjs      (no server needed: every request is intercepted)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const shell = readFileSync('public/app.html');
const host = createServer((_q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end(shell); });
await new Promise(r => host.listen(8801, '127.0.0.1', r));

const b = await chromium.launch();
const pg = await (await b.newContext()).newPage();
const fails = []; const ok = (n, c, e) => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (c ? '' : '  — ' + (e || ''))); if (!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror ' + String(e).slice(0, 100)); console.log('  ⚠', String(e).slice(0, 130)); });

// What the server would hold, and every request the page makes, in order.
let held = { charlieWrapUpSeconds: 45, holdCapSeconds: 120, holdQuietMs: 6, ringWaitSeconds: 90, maxCheckSeconds: 240 };
const LIMITS = { charlieWrapUpSeconds: [5, 600], holdCapSeconds: [10, 900], holdQuietMs: [2, 60], ringWaitSeconds: [10, 600], maxCheckSeconds: [30, 900] };
const WHY = {
  charlieWrapUpSeconds: 'How long Charlie may actually be TALKING before he starts wrapping up.',
  holdCapSeconds: 'How long a wait may run before we hang up.',
  holdQuietMs: 'Silence this long, mid conversation, and they have put the phone down and walked off.',
  ringWaitSeconds: 'How long the phone may ring while we wait for a human. We never hang up on a count of rings.',
  maxCheckSeconds: 'How long a whole check may run before the phone company ends it for us.',
};
const seen = [];
const rows = () => Object.keys(held).map(k => ({ key: k, label: k, seconds: held[k], def: held[k], min: LIMITS[k][0], max: LIMITS[k][1], why: WHY[k] }));
await pg.route('**/api/**', async (r) => {
  const req = r.request();
  seen.push({ url: req.url(), method: req.method(), body: req.postData() || '' });
  let body = [];
  if (req.url().includes('/api/call-tuning')) {
    if (req.method() === 'PATCH') {
      const sent = JSON.parse(req.postData() || '{}');
      const bad = Object.keys(sent).filter(k => sent[k] < LIMITS[k][0] || sent[k] > LIMITS[k][1]);
      // The real route refuses an out of range number rather than saving one the engine will
      // ignore, so the last good value is what the next check still uses.
      if (bad.length) {
        await r.fulfill({ status: 400, contentType: 'application/json',
          headers: { 'access-control-allow-origin': req.headers().origin || 'null', 'access-control-allow-credentials': 'true' },
          body: JSON.stringify({ error: 'out of range' }) });
        return;
      }
      Object.assign(held, sent);
      body = { ok: true, rows: rows() };
    } else body = { rows: rows() };
  } else if (req.url().includes('/api/policy')) body = { flags: {}, pricing: {}, rewards: {}, finds: {}, bail: {}, concurrency: {} };
  await r.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': req.headers().origin || 'null', 'access-control-allow-credentials': 'true' },
    body: JSON.stringify(body),
  });
});
await pg.goto('http://127.0.0.1:8801/', { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForTimeout(300);

const STG = 'https://staging.checkitforme.com';
const since = () => seen.length;
const from = (n) => seen.slice(n);
const tuning = (n, method) => from(n).filter(r => r.url.includes('/api/call-tuning') && r.method === method);
const boxOf = (k) => pg.$eval('#tune_' + k, el => el.value);
// The App screen is one section of a single page shell and only the open tab is visible, so the box
// is typed into the way the page itself would receive it rather than through a visible click.
const typeInto = async (k, v) => { await pg.$eval('#tune_' + k, (el, val) => { el.value = val; }, v); await pg.dispatchEvent('#tune_' + k, 'change'); await pg.waitForTimeout(250); };

console.log('\n▶ the App screen shows all five, in his words, with the numbers he set');
{
  await pg.evaluate(() => { setCallSrc('live'); return loadCallTuning(); });
  ok('Charlie wrap-up seconds is on the screen', (await boxOf('charlieWrapUpSeconds')) === '45', await boxOf('charlieWrapUpSeconds'));
  ok('the hold cap is on the screen', (await boxOf('holdCapSeconds')) === '120', await boxOf('holdCapSeconds'));
  ok('silence before Charlie drops is on the screen, in seconds', (await boxOf('holdQuietMs')) === '6', await boxOf('holdQuietMs'));
  ok('the ring wait is on the screen, and it is seconds and not rings', (await boxOf('ringWaitSeconds')) === '90', await boxOf('ringWaitSeconds'));
  ok('how long a whole check may run is on the screen', (await boxOf('maxCheckSeconds')) === '240', await boxOf('maxCheckSeconds'));
  const titles = await pg.$$eval('#settings .peek .pk-t', els => els.map(e => e.textContent.trim()));
  ok('they are named the way he names them', ['Charlie wrap-up seconds', 'Hold cap seconds', 'Silence before Charlie drops', 'Ring wait seconds', 'Check length seconds'].every(t => titles.includes(t)), titles.join(' | '));
  const under = await pg.$eval('#tune_charlieWrapUpSeconds', el => el.closest('.peek').querySelector('.pk-m').textContent);
  ok('each has ONE gray line saying what it does', /How long he may be talking before he starts wrapping up/.test(under), under);
  ok('no dash inside that sentence (copy law)', !/[—–]|\s-\s/.test(under), under);
}

console.log('\n▶ changing one saves it, and the check that runs next reads the new number');
{
  const n = since();
  await typeInto('charlieWrapUpSeconds', '30');
  const writes = tuning(n, 'PATCH');
  ok('exactly one save went out', writes.length === 1, JSON.stringify(writes.map(w => w.body)));
  ok('…and it carries the number in seconds, on its own', writes[0] && writes[0].body === '{"charlieWrapUpSeconds":30}', writes[0] && writes[0].body);
  ok('the value that will really run comes back and is what he sees', (await boxOf('charlieWrapUpSeconds')) === '30', await boxOf('charlieWrapUpSeconds'));
  ok('the server is holding it', held.charlieWrapUpSeconds === 30, String(held.charlieWrapUpSeconds));
  ok('and nothing else moved', held.holdCapSeconds === 120 && held.holdQuietMs === 6 && held.ringWaitSeconds === 90 && held.maxCheckSeconds === 240, JSON.stringify(held));
}

console.log('\n▶ a number out of range is refused, and the box goes back to what will run');
{
  await typeInto('holdCapSeconds', '99999');
  ok('the server never took it', held.holdCapSeconds === 120, String(held.holdCapSeconds));
  ok('and the screen shows the number that is really in force', (await boxOf('holdCapSeconds')) === '120', await boxOf('holdCapSeconds'));
}

console.log('\n▶ STAGING: he tunes the environment he is looking at, and production never moves');
{
  const n = since();
  await pg.evaluate(() => { setCallSrc('staging'); return loadCallTuning(); });
  const reads = tuning(n, 'GET');
  ok('the numbers are read from staging', reads.length > 0 && reads.every(r => r.url.startsWith(STG)), reads.map(r => r.url).join(' | '));
  const n2 = since();
  await typeInto('holdQuietMs', '5');
  const writes = tuning(n2, 'PATCH');
  ok('…and the save lands on staging, never on the live service', writes.length === 1 && writes[0].url.startsWith(STG), writes.map(w => w.url).join(' | '));
  const under = await pg.$eval('#tune_holdQuietMs', el => el.closest('.peek').querySelector('.pk-m').textContent);
  ok('the row says which one he is editing', /Staging/.test(under), under);
}

await b.close(); host.close();
console.log(fails.length ? `\n  ${fails.length} FAILED\n` : '\n  ALL PASS\n');
process.exit(fails.length ? 1 : 0);
