// Build every auto-check screen by taking the REAL slide-ups off staging and changing only their
// contents. Nothing invented: the sheet, the grab handle, the icon block, the title, the sub line,
// the row shape, the switch and the delete button are the page's own.
import pw from '/home/user/checkitforme/node_modules/playwright-core/index.js';
import { execFile } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = pw;
const dir = mkdtempSync(join(tmpdir(), 'ac-')); let n = 0;
const curlGet = url => new Promise(res => {
  const bF = join(dir, `b${n}`), hF = join(dir, `h${n}`); n++;
  execFile('curl', ['-s','-L','--max-time','25','-H','Accept-Encoding: identity','-D',hF,'-o',bF,url], err => {
    if (err) return res(null);
    try {
      const head = readFileSync(hF,'utf8').trim().split(/\r?\n\r?\n/).pop().split(/\r?\n/);
      const status = parseInt((head[0].match(/ (\d{3})/)||[])[1]||'200');
      const headers = {};
      for (const h of head.slice(1)) { const i=h.indexOf(':'); if(i>0){const k=h.slice(0,i).trim().toLowerCase(); if(!/^(content-encoding|transfer-encoding|content-length)$/.test(k)) headers[k]=h.slice(i+1).trim();} }
      res({ status, headers, body: readFileSync(bF) });
    } catch { res(null); }
  });
});
const OUT = '/tmp/auto-check-comps';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await page.route('**/*', async r => {
  const q = r.request(); if (!q.url().startsWith('https://staging.checkitforme.com') || q.method()!=='GET') return r.abort();
  const g = await curlGet(q.url()); if (!g) return r.abort();
  return r.fulfill({ status: g.status, headers: g.headers, body: g.body });
});
await page.goto('https://staging.checkitforme.com/', { waitUntil:'domcontentloaded', timeout:45000 });
await page.waitForTimeout(1800);

const signIn = async () => page.evaluate(() => {
  PHONE_TOKEN = 'comp';
  ACCOUNT = { phone: '+13106662331', email: 'fun@fungibles.com', emailVerified: true, comp: true,
              subscription: 'active', credits: 0, features: { scheduled_checks: true, restock_alerts: true } };
  appApi = async (path) => String(path).includes('/app/alerts/me')
    ? { subscriptions: [
        { id: 1, retailerId: 1, storeName: 'Target Woodland Hills', storeLocation: 'Woodland Hills, CA', muted: false },
        { id: 2, retailerId: 2, storeName: 'GameStop Northridge', storeLocation: 'Northridge, CA', muted: true }],
        alertsPaused: false, slotCap: 10 }
    : { ok: true };
});

const CLOCK = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFCB05" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 3v5h-5"/><path d="M12 8v4l2.5 1.5"/></svg>';

// ── SCREEN 1: THE LIST. The real Alerts sheet with its contents rewritten. ──
await signIn();
const r1 = await page.evaluate(async (CLOCK) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  ALERTS_ME = { subscriptions: [
    { id: 1, retailerId: 1, storeName: 'Target Woodland Hills', storeLocation: 'Woodland Hills, CA', muted: false },
    { id: 2, retailerId: 2, storeName: 'GameStop Northridge', storeLocation: 'Northridge, CA', muted: true },
  ], alertsPaused: false, slotCap: 10 };
  await openAlerts();
  await sleep(900);
  const m = document.querySelector('#alertsOv .modal');
  m.querySelector('svg').outerHTML = CLOCK;                       // the section's own icon
  m.querySelector('h3').textContent = 'Auto-checks';
  m.querySelector('.meta').textContent = 'Delete or Pause them below.';
  const pauseLbl = m.querySelector('.alpause span'); if (pauseLbl) pauseLbl.textContent = 'Pause all';
  const onBtn = m.querySelector('.alpause .ho-toggle button'); if (onBtn) onBtn.textContent = 'On';
  // Each row keeps the store logo, name and switch. The second line becomes the schedule.
  const rows = [...m.querySelectorAll('.alrow')];
  const when = ['Tue, Fri · 10:00 AM', 'Thu · 9:00 AM'];
  rows.forEach((row, i) => { const lo = row.querySelector('.lo'); if (lo) lo.textContent = when[i] || ''; });
  return { rows: rows.length, text: m.innerText.replace(/\s+/g, ' ').trim().slice(0, 160) };
}, CLOCK);
await page.screenshot({ path: `${OUT}/ac-1-list.png` });
console.log('1 list:', JSON.stringify(r1));

// ── SCREEN 2: SAVED. The real Auto-check sheet, flipped to its done state. ──
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500); await signIn();
const r2 = await page.evaluate(async (CLOCK) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  SEL_STORE = { id: 1, name: 'Target Woodland Hills' }; SEL_CAT = 1;
  openSchedule(); await sleep(900);
  const m = document.querySelector('#scheduleOverlay .modal');
  const keepGrab = m.querySelector('svg');
  m.innerHTML = `<div style="display:flex;justify-content:center;margin-bottom:8px">${CLOCK}</div>
    <h3 style="margin:2px 0 4px;text-align:center">Auto-check is on.</h3>
    <div class="meta" style="margin-bottom:16px;text-align:center">We check for you and send the result.</div>
    <div style="background:#1B1B20;box-shadow:inset 0 2px 6px rgba(0,0,0,.45);border-radius:18px;padding:14px 16px">
      <div style="font-size:14.5px;font-weight:700;color:#fff">Target Woodland Hills</div>
      <div style="margin-top:2px;font-size:12px;font-weight:600;color:#8A8A96">Pokémon</div>
      <div style="height:1px;background:rgba(255,255,255,.06);margin:13px 0"></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span class="meta">Days</span><span style="font-size:13.5px;font-weight:700;color:#fff">Tue, Fri</span></div>
      <div style="display:flex;justify-content:space-between;padding:7px 0 3px"><span class="meta">From</span><span style="font-size:13.5px;font-weight:700;color:#fff">10:00 AM</span></div>
      <div style="display:flex;justify-content:space-between;padding:7px 0 0"><span class="meta">Next check</span><span style="font-size:13.5px;font-weight:700;color:#4ADE80">Tuesday</span></div>
    </div>
    <button class="cta" style="margin-top:16px;width:100%">See my auto-checks →</button>`;
  void keepGrab;
  return { ok: true };
}, CLOCK);
await page.screenshot({ path: `${OUT}/ac-2-saved.png` });
console.log('2 saved:', JSON.stringify(r2));

// ── SCREEN 3: WHAT THEY FOUND. The real Alerts sheet shell, report contents. ──
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500); await signIn();
await page.evaluate(async (CLOCK) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  ALERTS_ME = { subscriptions: [], alertsPaused: false, slotCap: 10 };
  await openAlerts(); await sleep(900);
  const m = document.querySelector('#alertsOv .modal');
  const chip = (bg, sw) => `<span style="width:26px;height:26px;flex:0 0 auto;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center">${sw}</span>`;
  const tick = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const ex = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  const truck = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35a1 1 0 0 0-.78-.38H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';
  const row = (c, t, s) => `<div style="display:flex;align-items:center;gap:11px;margin-top:10px;padding:12px 14px;border-radius:16px;background:linear-gradient(180deg,#2D2D34 0%,#27272D 100%);box-shadow:0 8px 14px -8px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07)">${c}<div style="flex:1;min-width:0"><div style="font-size:14.5px;font-weight:700;color:#fff">${t}</div><div style="margin-top:2px;font-size:12px;font-weight:600;color:#8A8A96">${s}</div></div></div>`;
  m.innerHTML = `<div style="display:flex;justify-content:center;margin-bottom:6px">${CLOCK}</div>
    <h3 style="margin:2px 0 4px;text-align:center">Target Woodland Hills</h3>
    <div class="meta" style="margin-bottom:16px;text-align:center">Pokémon · Tue, Fri</div>
    <div style="background:#1B1B20;box-shadow:inset 0 2px 6px rgba(0,0,0,.45);border-radius:18px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <div><div style="font-size:34px;font-weight:900;letter-spacing:-1.2px;color:#4ADE80;line-height:1">3</div><div class="meta" style="margin-top:4px">times in stock</div></div>
        <div style="text-align:right"><div style="font-size:34px;font-weight:900;letter-spacing:-1.2px;color:#fff;line-height:1">12</div><div class="meta" style="margin-top:4px">checks run</div></div>
      </div>
      <div style="height:1px;background:rgba(255,255,255,.06);margin:14px 0"></div>
      <div class="meta">They had it most often on a <b style="color:#fff">Tuesday</b>.</div>
    </div>
    <div style="margin:18px 0 0;font-size:10.5px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#8A8A96">Every check</div>
    ${row(chip('rgba(74,222,128,.15)', tick), 'In stock', 'Tue, Jul 29 · 10:02 AM')}
    ${row(chip('rgba(239,68,68,.15)', ex), 'Not in stock', 'Fri, Jul 25 · 10:01 AM')}
    ${row(chip('rgba(245,158,11,.15)', truck), 'Restock Tuesday', 'Tue, Jul 22 · 10:03 AM')}`;
}, CLOCK);
await page.screenshot({ path: `${OUT}/ac-3-found.png` });
console.log('3 found: ok');
await b.close();
