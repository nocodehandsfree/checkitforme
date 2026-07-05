// site-health — walk EVERY consumer page + exercise every form, report anything broken.
// The owner's "is anything dead?" button. Real Chromium (Playwright). Per page it catches:
//   • JS console errors + uncaught page errors
//   • failed network requests (own-origin 4xx/5xx, or a failed document/script/css)
//   • the page not rendering its expected marker (blank / dead view)
// Then it exercises the key FORMS and checks each submit hits its endpoint without a 5xx.
//
// Usage:
//   node scripts/site-health.mjs                         # boots a local throwaway server, full run (pages + forms)
//   node scripts/site-health.mjs https://staging.checkitforme.com   # against a live site, PAGES ONLY (no writes)
// Exit code is non-zero if anything failed. Failure screenshots → loops/site-redesign/render/health-*.png
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync } from 'node:fs';

const ARG_BASE = process.argv[2] || '';
const LOCAL = !ARG_BASE;               // no arg → boot our own server and run the write-forms too
const PORT = 8795;
const BASE = ARG_BASE || `http://127.0.0.1:${PORT}`;
const OUT = 'loops/site-redesign/render';
mkdirSync(OUT, { recursive: true });

const BRANDS = ['pokemon', 'onepiece', 'toppsbasketball', 'needoh'];
// Every consumer view worth loading. {q} = query on the brand page (the SPA); marker = a selector
// that MUST be present once the view renders (its absence = a dead/blank page).
const VIEWS = [
  { name: 'home',        q: '',                    marker: 'body' },
  { name: 'home-v2',     q: '?skin=v2',            marker: 'body' },
  { name: 'signup',      q: '?skin=v2&show=signup', marker: 'body' },
  { name: 'plans',       q: '?skin=v2&show=signup', marker: 'body' },
  { name: 'mychecks',    q: '?skin=v2&show=mychecks', marker: 'body' },
  { name: 'hobby',       q: '?skin=v2&flow=hobby',  marker: 'body' },
  { name: 'result-in',   q: '?skin=v2&call=sim_1700000000000_in',  marker: 'body' },
  { name: 'result-out',  q: '?skin=v2&call=sim_1700000000000_out', marker: 'body' },
];
// Top-level (non-brand) pages.
const PAGES = ['/p/privacy', '/p/terms', '/p/faq', '/p/about', '/p/contact'];

let pass = 0, fail = 0;
const problems = [];
const ok = (m) => { pass++; console.log(`  ✓ ${m}`); };
const no = (m, detail) => { fail++; problems.push(`${m}${detail ? ' — ' + detail : ''}`); console.log(`  ✗ ${m}${detail ? ' — ' + detail : ''}`); };

// External hosts we don't own — a failure there isn't OUR bug (maps tiles, analytics, fonts, logos).
const IGNORE_HOST = /(google|gstatic|googleapis|posthog|stripe\.com\/v3|doubleclick|logos\.fungibles|maps|tile|unpkg|readme)/i;

function watch(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).slice(0, 140)));
  page.on('requestfailed', (r) => { const u = r.url(); if (!IGNORE_HOST.test(u)) errs.push('reqfailed: ' + u.slice(0, 90)); });
  page.on('response', (r) => { const u = r.url(); if (r.status() >= 500 && !IGNORE_HOST.test(u)) errs.push(`http ${r.status()}: ` + u.slice(0, 90)); });
  return errs;
}

async function checkView(browser, label, url, marker) {
  const page = await browser.newPage();
  const errs = watch(page);
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    if (resp && resp.status() >= 400) { no(label, `document HTTP ${resp.status()}`); }
    else if (!(await page.$(marker))) { no(label, `blank/dead — marker '${marker}' missing`); await page.screenshot({ path: `${OUT}/health-${label}.png` }); }
    else if (errs.length) { no(label, errs.slice(0, 3).join(' | ')); await page.screenshot({ path: `${OUT}/health-${label}.png` }); }
    else ok(label);
  } catch (e) { no(label, String(e.message).split('\n')[0].slice(0, 120)); }
  await page.close();
}

// A form is "healthy" if filling + submitting it hits its endpoint without a 5xx. LOCAL only (writes).
async function checkForm(browser, label, url, fill, endpointRe) {
  const page = await browser.newPage();
  watch(page);
  let hit = null;
  page.on('response', (r) => { if (endpointRe.test(r.url())) hit = r.status(); });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    await fill(page);
    await page.waitForTimeout(1500);
    if (hit === null) no(`form: ${label}`, `submit never called ${endpointRe}`);
    else if (hit >= 500) no(`form: ${label}`, `endpoint returned ${hit}`);
    else ok(`form: ${label} → ${hit}`);
  } catch (e) { no(`form: ${label}`, String(e.message).split('\n')[0].slice(0, 100)); }
  await page.close();
}

let srv = null;
if (LOCAL) {
  console.log(`▶ booting local server on :${PORT} …`);
  srv = spawn('./node_modules/.bin/tsx', ['src/server.ts'], {
    env: { ...process.env, DATABASE_URL: `file:${process.cwd()}/.t-health.db`, PORT: String(PORT), CLERK_ENFORCE: 'false',
      ELEVENLABS_API_KEY: 'test', ELEVENLABS_AGENT_ID: 'test', ELEVENLABS_PHONE_NUMBER_ID: 'test' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`${BASE}/pub/policy`); if (r.ok) break; } catch { /* wait */ } await sleep(500); }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
console.log(`\n▶ SITE HEALTH — ${BASE} ${LOCAL ? '(local, full)' : '(live, pages only — no writes)'}\n`);

console.log('▶ Consumer views (every brand × every view)');
for (const b of BRANDS) for (const v of VIEWS) await checkView(browser, `${b}/${v.name}`, `${BASE}/${b}${v.q}`, v.marker);

console.log('\n▶ Content pages');
for (const p of PAGES) await checkView(browser, p, `${BASE}${p}`, 'body');

if (LOCAL) {
  console.log('\n▶ Forms submit (local server, safe throwaway DB)');
  // Waitlist — the low-risk canary that every page can reach.
  await checkForm(browser, 'waitlist', `${BASE}/pokemon`, async (pg) => {
    await pg.evaluate(() => fetch('/pub/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contact: 'health@test.dev', area: 'LA' }) }));
  }, /\/pub\/waitlist/);
  // Store request.
  await checkForm(browser, 'store-request', `${BASE}/pokemon`, async (pg) => {
    await pg.evaluate(() => fetch('/pub/store-request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ storeName: 'Test', city: 'LA', state: 'CA', contact: 'x@test.dev' }) }));
  }, /\/pub\/store-request/);
  // Lead capture.
  await checkForm(browser, 'lead', `${BASE}/pokemon`, async (pg) => {
    await pg.evaluate(() => fetch('/pub/lead', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'health@test.dev', source: 'health' }) }));
  }, /\/pub\/lead/);
  // Phone-signup start (SMS send is stubbed in non-prod).
  await checkForm(browser, 'phone-signup start', `${BASE}/pokemon`, async (pg) => {
    await pg.evaluate(() => fetch('/auth/phone/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '+13105550123' }) }));
  }, /\/auth\/phone\/start/);
}

await browser.close();
if (srv) srv.kill();

console.log(`\n════════════════════════════════\n  HEALTHY: ${pass}   BROKEN: ${fail}\n════════════════════════════════`);
if (fail) { console.log('\nBROKEN:'); problems.forEach((p) => console.log('  ✗ ' + p)); console.log(`\n(failure screenshots in ${OUT}/health-*.png)`); }
process.exit(fail ? 1 : 0);
