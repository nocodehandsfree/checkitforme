// THE LIVE/STAGING SWITCH ON THE SETTINGS SCREENS (owner, 2026-07-28).
//
// He could not turn the new calling engine on for staging, which is the only place he makes a test
// call: the Policy flags read AND wrote the live service from either side of the switch. This drives
// the real Admin page in a real browser and watches WHICH SERVICE every read and every write lands
// on, because that is the entire bug and it is invisible from the rendered screen.
//
// Run: node scripts/qa-admin-env-switch.mjs      (no server needed: every request is intercepted)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

// The shell has to be served over http, not file://, or a relative /api/ read has no origin to
// resolve against. Nothing else is served: every /api/ call is intercepted below.
const shell = readFileSync('public/app.html');
const host = createServer((_q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end(shell); });
await new Promise(r => host.listen(8799, '127.0.0.1', r));

const b = await chromium.launch();
const pg = await (await b.newContext()).newPage();
const fails = []; const ok = (n, c, e) => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (c ? '' : '  — ' + (e || ''))); if (!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror ' + String(e).slice(0, 100)); console.log('  ⚠', String(e).slice(0, 130)); });

// Every request the page makes, in order: {url, method, body}. This is the evidence.
const seen = [];
const POLICY = { flags: { cheapBridgeAll: false, ourBrain: false, productPokemon: true }, pricing: {}, rewards: {}, finds: {}, bail: {}, concurrency: {} };
await pg.route('**/api/**', async (r) => {
  const req = r.request();
  seen.push({ url: req.url(), method: req.method(), body: req.postData() || '' });
  await r.fulfill({
    status: 200, contentType: 'application/json',
    // The page fetches with credentials, so a wildcard origin is refused: echo the caller's own.
    headers: { 'access-control-allow-origin': req.headers().origin || 'null', 'access-control-allow-credentials': 'true' },
    // Only the policy read is being tested. Every other endpoint the shell wakes up and calls gets
    // an empty list, so a stubbed object never lands where the page expects rows.
    body: JSON.stringify(req.url().includes('/api/policy') ? POLICY : []),
  });
});
await pg.goto('http://127.0.0.1:8799/', { waitUntil: 'domcontentloaded', timeout: 20000 });
await pg.waitForTimeout(300);

const STG = 'https://staging.checkitforme.com';
const since = () => seen.length;
const from = (n) => seen.slice(n);
const policyCalls = (n, method) => from(n).filter(r => r.url.includes('/api/policy') && r.method === method);

console.log('\n▶ LIVE: the flags read and write the live service, exactly as before');
let n = since();
await pg.evaluate(() => { setCallSrc('live'); return loadGrowth(); });
let reads = policyCalls(n, 'GET');
ok('a policy read happened', reads.length >= 1, 'none');
ok('and NOT one of them went to staging', reads.every(r => !r.url.startsWith(STG)), reads.map(r => r.url).join(' '));
ok('one read, not two (no second fetch on Live)', reads.length === 1, `${reads.length} reads`);

console.log('\n▶ STAGING: the call-lane flags read the staging service');
n = since();
await pg.evaluate(() => { setCallSrc('staging'); return loadGrowth(); });
reads = policyCalls(n, 'GET');
ok('the call-lane flags are read from staging', reads.some(r => r.url.startsWith(STG)), reads.map(r => r.url).join(' '));
ok('and the live service is still read for everything else', reads.some(r => !r.url.startsWith(STG)), reads.map(r => r.url).join(' '));

console.log('\n▶ the screen says which environment it is editing');
const title = await pg.evaluate(() => [...document.querySelectorAll('#gw_flags .meta')].map(e => e.textContent).find(t => /How calls are made/.test(t)));
ok('the group reads "How calls are made · Staging"', title === 'How calls are made · Staging', `got "${title}"`);

console.log('\n▶ THE BUG ITSELF: turning the new calling engine on, from the Staging side');
n = since();
await pg.evaluate(() => {
  const row = [...document.querySelectorAll('#gw_flags .peek')].find(r => /New calling engine/.test(r.textContent));
  row.querySelector('.k-switch').click();
});
await pg.waitForTimeout(200);
let writes = policyCalls(n, 'PATCH');
ok('the switch wrote once', writes.length === 1, `${writes.length} writes`);
ok('and it wrote to STAGING, not Live', writes[0] && writes[0].url.startsWith(STG), writes[0] && writes[0].url);
ok('turning cheapBridgeAll on', writes[0] && /"cheapBridgeAll":true/.test(writes[0].body), writes[0] && writes[0].body);

console.log('\n▶ …while a flag that is NOT call-lane still edits Live from the same side');
n = since();
await pg.evaluate(() => {
  const row = [...document.querySelectorAll('#gw_flags .peek')].find(r => /Pokémon/.test(r.textContent));
  row.querySelector('.k-switch').click();
});
await pg.waitForTimeout(200);
writes = policyCalls(n, 'PATCH');
ok('the product flag wrote to LIVE while the header says Staging', writes.length === 1 && !writes[0].url.startsWith(STG), writes.map(w => w.url).join(' '));

console.log('\n▶ Charlie on Anthropic API: renamed, and under Calls, App');
const brain = await pg.evaluate(() => {
  const sec = document.getElementById('settings');
  const row = [...sec.querySelectorAll('.peek')].find(r => /Charlie on Anthropic API/.test(r.textContent));
  return { onCallsApp: !!row, oldNameGone: !/Think on our own account/.test(document.body.innerHTML),
    notInPolicy: ![...document.querySelectorAll('#gw_flags .peek')].some(r => /Charlie on Anthropic/.test(r.textContent)) };
});
ok('the row is on the Calls App screen', brain.onCallsApp);
ok('the old name is gone everywhere', brain.oldNameGone);
ok('and it is not left behind in the Policy flag list', brain.notInPolicy);

n = since();
await pg.evaluate(() => loadOurBrain());
ok('it reads the environment the switch names', policyCalls(n, 'GET').some(r => r.url.startsWith(STG)), 'read Live');
ok('and it reads OFF', await pg.evaluate(() => document.getElementById('brainToggle').dataset.on !== '1'));
n = since();
await pg.evaluate(() => { document.getElementById('brainToggle').click(); });
await pg.waitForTimeout(200);
writes = policyCalls(n, 'PATCH');
ok('flipping it writes to the same service it read', writes.length === 1 && writes[0].url.startsWith(STG), writes.map(w => w.url).join(' '));
ok('and it writes ourBrain, nothing else', writes[0] && writes[0].body === '{"flags":{"ourBrain":true}}', writes[0] && writes[0].body);

console.log('\n▶ the two switches that were never his decision are gone');
const gone = await pg.evaluate(() => ({
  keys: !/Stop keys when a person answers/.test(document.body.innerHTML),
  hold: !/Hang up the thinking on a hold/.test(document.body.innerHTML),
  engine: [...document.querySelectorAll('#gw_flags .peek')].some(r => /New calling engine/.test(r.textContent)),
}));
ok('"Stop keys when a person answers" is gone', gone.keys);
ok('"Hang up the thinking on a hold" is gone', gone.hold);
ok('the new calling engine switch is still there', gone.engine);

await b.close();
host.close();
console.log(fails.length ? `\n  ❌ ${fails.length} FAILED: ${fails.join(', ')}` : `\n  ✅ ALL PASSED`);
process.exit(fails.length ? 1 : 0);
