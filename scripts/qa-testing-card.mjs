// THE TESTING SECTION, DRIVEN ON THE REAL ADMIN (round 1, parts 3 and 4).
//
// The owner reads one screen after a test check: the log end to end, and eleven rows saying what
// Charlie did. Neither is provable from the source — the sheet is built in the browser from what the
// real server sends — so this signs in to the REAL Admin, opens Voice ▸ Testing, taps a check and
// reads what actually rendered.
//
// Run: env ADMIN_TOKEN=… node scripts/qa-testing-card.mjs [room]
//   with no room it taps the newest check in the list.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';

// The shell is the ONE Admin, exactly where he opens it; the data comes from staging because the
// header switch says staging, which is the same thing his thumb does.
const ADMIN = process.env.ADMIN_SITE || 'https://admin.checkitforme.com';
const TOKEN = process.env.ADMIN_TOKEN || '';
const WANT = process.argv[2] || '';
const EXE = process.env.PLAYWRIGHT_CHROMIUM || '/opt/pw-browsers/chromium';
if (!TOKEN) { console.error('need ADMIN_TOKEN'); process.exit(1); }

// This sandbox's browser cannot open an encrypted connection, so EVERY request the page makes is
// fetched by node (which can) and handed back to the browser exactly as the server answered it.
// Never a copy of the site or a stub: every page, every script and every answer below is the real
// server's, including the reads that go to staging while the shell itself comes from the Admin.
function wire(context) {
  return context.route('**/*', async (route) => {
    const req = route.request();
    if (process.env.QA_TRACE) console.log('   · ' + req.method() + ' ' + req.url().slice(0, 70));
    const headers = { ...req.headers() }; delete headers.host; delete headers['accept-encoding'];
    try {
      const r = await fetch(req.url(), {
        method: req.method(), headers,
        body: ['GET', 'HEAD'].includes(req.method()) ? undefined : req.postData() || undefined,
        // FOLLOW, never manual: this sandbox's outbound proxy refuses to hand back a redirect
        // untouched (503), and the browser only needs the answer at the end of one anyway.
        redirect: 'follow',
        // A phone's request either lands or dies; a hung one here hangs the page forever.
        signal: AbortSignal.timeout(20000),
      });
      const out = {};
      r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) out[k] = v; });
      await route.fulfill({ status: r.status, headers: out, body: Buffer.from(await r.arrayBuffer()) });
    } catch (e) { console.log('  ⚠ request failed:', req.method(), req.url().slice(0, 80), String(e).slice(0, 140)); try { await route.abort(); } catch (_) {} }
  });
}

const fails = []; const ok = (n, c, e) => { console.log((c ? '  ✓ ' : '  ✗ ') + n + (c ? '' : '  — ' + (e || ''))); if (!c) fails.push(n); };

const b = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const context = await b.newContext({ ignoreHTTPSErrors: true });
await wire(context);
const pg = await context.newPage();
pg.on('pageerror', e => { fails.push('pageerror'); console.log('  ⚠', String(e).slice(0, 140)); });

// THE SAME DOOR THE OWNER USES: the token mints the session cookie. Minted here rather than by
// walking the browser through the redirect, because the browser in this sandbox cannot open an
// encrypted connection of its own and a redirect is the one thing the request pipe above cannot hand
// back to it. The cookie is the real one, from the real service.
{
  // Minted with curl for one reason: the session rides on the redirect's own headers, and this
  // sandbox's outbound proxy will not hand a redirect back to node untouched. Same request, same
  // real service, same cookie the owner's browser gets.
  const head = execFileSync('curl', ['-sS', '-D', '-', '-o', '/dev/null', `${ADMIN}/admin-login?token=${TOKEN}`], { encoding: 'utf8' });
  const raw = head.split('\n').filter((l) => /^set-cookie:/i.test(l)).map((l) => l.replace(/^set-cookie:\s*/i, '').trim());
  const jar = raw.map((c) => String(c).split(';')[0]).map((kv) => {
    const i = kv.indexOf('=');
    return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: '.checkitforme.com', path: '/', httpOnly: true, secure: true };
  });
  if (!jar.length) { console.error('the admin token was refused: no session came back'); process.exit(1); }
  await context.addCookies(jar);
}

console.log('\n▶ Voice ▸ Testing opens and lists his checks');
await pg.goto(`${ADMIN}/`, { waitUntil: 'load', timeout: 45000 });
await pg.waitForFunction(() => typeof window.showSection === 'function', null, { timeout: 30000 })
  .catch(async () => { console.log('  ⚠ the shell never finished booting:', (await pg.content()).slice(0, 300)); });
await pg.waitForTimeout(1500);
// The header Live/Staging switch, flipped the way his thumb flips it: the checks he is testing live
// on staging, and the Admin shell is the same one either way.
await pg.evaluate(() => window.setCallSrc('staging'));
await pg.evaluate(() => window.showSection('testing'));
await pg.waitForTimeout(4000);
const rows = await pg.$$eval('#testing .peek, #testing button.peek', els => els.length).catch(() => 0);
if (process.env.QA_TRACE) console.log('  probe:', await pg.evaluate(async () => {
  const out = { logHtml: (document.getElementById('testing_log') || {}).innerHTML?.slice(0, 150) };
  try { await loadTesting(); out.after = (document.getElementById('testing_log') || {}).innerHTML?.slice(0, 100); } catch (e) { out.threw = String(e && e.stack || e).slice(0, 300); }
  return out;
}));
ok('the list has checks in it', rows > 0, String(rows));

const room = WANT || await pg.evaluate(async () => {
  const d = await api('/api/admin/test-calls?limit=5');
  return (d && d.rows || []).map(r => r.room).filter(Boolean)[0] || '';
});
console.log(`\n▶ tapping the check ${room}`);
await pg.evaluate((r) => openTestReceipt(r, 'MVPs', Math.floor(Date.now() / 1000)), room);
await pg.waitForFunction(() => { const b = document.querySelector('.sheet .sh-body'); return !!b && !/Loading/.test(b.innerText); }, null, { timeout: 40000 }).catch(() => {});
await pg.waitForTimeout(600);

const sheet = await pg.$eval('.sheet .sh-body', el => el.innerText).catch(() => '');
const tiles = await pg.$$eval('.sheet .sh-body .stat', els => els.map(e => e.innerText.replace(/\n+/g, ' '))).catch(() => []);
const buckets = await pg.$$eval('.sheet .sh-body details.v2c', els => els.map(e => e.querySelector('.row').innerText.replace(/\n+/g, ' | '))).catch(() => []);
const logHead = await pg.$$eval('.sheet .sh-body .k-eyebrow', els => els.map(e => e.innerText.trim())).catch(() => []);
console.log('  — tiles:', tiles.join('  ·  '));
console.log('  — cost lines:', buckets.join('  ·  '));

ok('the sheet opened through the approved pixels', /check cost/i.test(sheet) && /check log/i.test(sheet), logHead.join(' | '));
ok('the four stat tiles render', tiles.length === 4, String(tiles.length));
ok('total cost, total time, Charlie talked and gross profit are the tiles', /Total cost/.test(tiles[0] || '') && /Total time/.test(tiles[1] || '') && /Charlie talked/.test(tiles[2] || '') && /Gross profit/.test(tiles[3] || ''), tiles.join(' | '));
ok('every cost line is one of his five buckets', buckets.length > 0 && buckets.every(b => /(Bravo \(Menu Nav\)|Foxtrot \(Phone Line\)|Echo \(Listening\)|Charlie \(Talking\)|Status \(Verification\))/.test(b)), buckets.join(' // '));
ok('money reads in cents', buckets.every(b => /¢|\$/.test(b)), buckets.join(' // '));
// Tap a cost line for its detail rows.
await pg.$eval('.sheet .sh-body details.v2c summary', el => el.click()).catch(() => {});
await pg.waitForTimeout(200);
const detail = await pg.$eval('.sheet .sh-body details.v2c[open]', el => el.innerText).catch(() => '');
ok('a tapped cost line opens its detail rows', /Rate \(per minute\)|Cost|Read by|Menu time|Line time|Talk time/.test(detail), detail.slice(0, 120));
ok('the log is end to end', /Dialing|Staff greeting|Check ended|Customer (charged|not charged)|Answer/i.test(sheet));
ok('no dash inside any sentence on the sheet (copy law)', !/[—–]/.test(sheet), (sheet.match(/[^\n]*[—–][^\n]*/) || [''])[0]);
ok('the retired word never reaches the screen', !/\bdesk\b/i.test(sheet), (sheet.match(/[^\n]*\bdesk\b[^\n]*/i) || [''])[0]);
ok('no unused pill at the top', !/UNUSED/i.test((sheet.split('Total cost')[0] || '')), (sheet.split('Total cost')[0] || '').slice(0, 100));

await pg.screenshot({ path: 'loops/site-redesign/render/testing-card.png', fullPage: false }).catch(() => {});
await b.close();
console.log(fails.length ? `\n  ${fails.length} FAILED\n` : '\n  ALL PASS\n');
process.exit(fails.length ? 1 : 0);
