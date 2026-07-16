// qa-android-sweep — drives every consumer page/flow of checkit.html at a Pixel 8 class
// Android viewport (412x915, DPR 2.625, Android Chrome UA) and screenshots each screen,
// logging layout diagnostics: overflow-x + offending elements, tap targets < 36px, dvh sanity.
// Includes a keyboard-height (412x500) auth-sheet check and a 360px narrow-phone sanity pass.
// Run: 1) node scripts/staging-bridge.mjs &        (Chromium can't TLS to staging directly)
//      2) node scripts/qa-android-sweep.mjs <outdir>   (screenshots + _report.json land there)
// Or point BASE at a local staging-mode server (see scripts/qa-website-drive.mjs header).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8899';
const OUT = process.argv[2] || 'shots/before';
fs.mkdirSync(OUT, { recursive: true });

const PIXEL8 = {
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  ...PIXEL8,
  geolocation: { latitude: 34.0522, longitude: -118.2437 },
  permissions: ['geolocation'],
  locale: 'en-US',
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', String(e.message).slice(0, 200)));

const report = [];
async function diag(name) {
  const d = await page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    const overX = Math.max(de.scrollWidth - vw, document.body ? document.body.scrollWidth - vw : 0);
    const offenders = [];
    if (overX > 1) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width > vw + 1 || r.right > vw + 8) {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') continue;
          offenders.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
          if (offenders.length >= 6) break;
        }
      }
    }
    // tap targets: visible interactive elements smaller than 40px in either dimension
    const small = [];
    for (const el of document.querySelectorAll('button,a[onclick],a[href],input[type=range],[role=button],.chip,.modetab')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.top > innerHeight || r.bottom < 0) continue;
      if ((r.height < 36 || r.width < 36) && el.offsetParent !== null) {
        small.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}"`);
        if (small.length >= 10) break;
      }
    }
    return { overX, offenders, small, innerH: innerHeight, docH: de.scrollHeight };
  }).catch((e) => ({ err: String(e.message).slice(0, 120) }));
  report.push({ name, ...d });
  const flag = d.overX > 1 ? ` ⚠ OVERFLOW-X ${d.overX}px` : '';
  console.log(`[${name}]${flag}${d.small && d.small.length ? ` small-taps:${d.small.length}` : ''}`);
  if (d.offenders && d.offenders.length) console.log('   offenders:', d.offenders.join(' | '));
}
async function shot(name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await diag(name);
}
async function nav(url) {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
}

// ---- 1. Brand landings
for (const [slug, name] of [['/', '01-landing-pokemon'], ['/onepiece', '02-landing-onepiece'], ['/toppsbasketball', '03-landing-topps'], ['/needoh', '04-landing-needoh']]) {
  await nav(slug);
  await shot(name);
}

// ---- 2. Spanish
await nav('/');
await page.evaluate(() => setLang('es'));
await page.waitForTimeout(600);
await shot('05-landing-es');
await page.evaluate(() => setLang('en'));
await page.waitForTimeout(400);

// ---- 3. Store search (geolocation)
await page.evaluate(() => findMe());
await page.waitForTimeout(4000);
await shot('06-stores-near');
// map view if present
const hasMap = await page.evaluate(() => { const b = document.getElementById('maptoggle'); if (b && b.offsetParent) { b.click(); return true; } return false; });
if (hasMap) { await page.waitForTimeout(2500); await shot('07-mapview'); await page.evaluate(() => toggleMap()); await page.waitForTimeout(600); }

// ---- 4. Pick first store -> chips -> call sheet
const picked = await page.evaluate(() => { const row = document.querySelector('#storelist .srow, #storelist > div'); if (row) { row.click(); return true; } return false; });
await page.waitForTimeout(1500);
if (picked) {
  await shot('08-store-picked');
  await page.evaluate(() => { const c = document.querySelector('#chips .chip, #chips > *'); if (c) c.click(); });
  await page.waitForTimeout(1000);
  await shot('09-category-picked');
  const cta = await page.evaluate(() => { const b = document.getElementById('checkBtn'); if (b && b.offsetParent) { b.click(); return true; } return false; });
  if (cta) { await page.waitForTimeout(1200); await shot('10-call-sheet'); await page.evaluate(() => { try { dismissCallSheet(); } catch (_) {} }); await page.waitForTimeout(500); }
}

// ---- 5. Kiosk mode
await page.evaluate(() => { try { setMode('kiosk'); } catch (_) {} });
await page.waitForTimeout(1500);
await shot('11-kiosk-mode');
await page.evaluate(() => { try { setMode('call'); } catch (_) {} });
await page.waitForTimeout(600);

// ---- 6. Auth overlay + code step + keyboard sim
await page.evaluate(() => signUp());
await page.waitForTimeout(800);
await shot('12-auth-phone');
// keyboard open sim: Android resizes-content behavior -> short layout viewport
await page.setViewportSize({ width: 412, height: 500 });
await page.evaluate(() => document.getElementById('auth_phone').focus());
await page.waitForTimeout(500);
await shot('13-auth-phone-keyboard');
await page.setViewportSize({ width: 412, height: 915 });
await page.waitForTimeout(400);
// type phone, go to code step (staging: no real SMS)
await page.fill('#auth_phone', '3105550177');
await page.evaluate(() => phoneStart());
await page.waitForTimeout(2000);
await shot('14-auth-code');
// verify (staging prefills / accepts dev code)
const authed = await page.evaluate(async () => {
  try { await phoneVerify(); await new Promise((r) => setTimeout(r, 2500)); return !!localStorage.getItem('cifm_token'); } catch (e) { return 'ERR ' + e.message; }
});
console.log('AUTHED:', authed);
await page.waitForTimeout(1500);
await shot('15-post-auth');

// ---- 7. Logged-in surfaces
await page.evaluate(() => { try { closeAuth(); } catch (_) {} openAccount(); });
await page.waitForTimeout(1200);
await shot('16-account');
await page.evaluate(() => { try { closeAccount(); } catch (_) {} openHistory(); });
await page.waitForTimeout(1500);
await shot('17-mychecks');
await page.evaluate(() => { try { closeHistory(); } catch (_) {} try { openAccount(); } catch (_) {} });
await page.waitForTimeout(800);
const alertsOK = await page.evaluate(() => { try { closeAccount(); openAlerts(); return true; } catch (e) { return 'ERR ' + e.message; } });
console.log('ALERTS:', alertsOK);
await page.waitForTimeout(1500);
await shot('18-alerts');
await page.evaluate(() => { const o = document.getElementById('alertsOv'); if (o) o.classList.remove('on'); try { openBuy(); } catch (e) { console.log(e); } });
await page.waitForTimeout(1500);
await shot('19-checkplus');
await page.evaluate(() => { const o = document.getElementById('buyOverlay'); if (o) o.classList.remove('on'); });

// ---- 8. Verdict statuses (client render, same as qa-website-drive)
const CASES = [
  ['20-verdict-instock', { status: 'completed', confirmed: true, statusKey: 'in_stock', productDetail: 'Tin · Scarlet and Violet', transcript: 'Staff: yes' }],
  ['21-verdict-out', { status: 'completed', confirmed: false, statusKey: 'not_in_stock', transcript: 'Staff: no' }],
  ['22-verdict-soon', { status: 'completed', confirmed: false, shipmentDay: 'tuesday', transcript: 'Staff: tuesday' }],
  ['23-verdict-noanswer', { status: 'no_answer' }],
  ['24-verdict-voicemail', { status: 'voicemail' }],
  ['25-verdict-unclear', { status: 'completed', transcript: 'Agent: any Pokémon in stock today?\nStaff: mumble' }],
];
for (const [name, o] of CASES) {
  await page.evaluate(([nm, oo]) => { SEL_STORE = { id: 1, name: 'Fun Collectibles Store', location: '123 Main St, Los Angeles', logoUrl: null }; showResult(Object.assign({ ts: Date.now() }, oo), 'aud:' + nm); }, [name, o]);
  await page.waitForTimeout(600);
  await shot(name);
}
await page.evaluate(() => { try { backToBuilder(); } catch (_) {} });
await page.waitForTimeout(600);

// ---- 9. Terms/Privacy page overlay + support widget
await page.evaluate(() => { const a = [...document.querySelectorAll('a,button')].find((x) => /terms/i.test(x.textContent || '')); if (a) a.click(); });
await page.waitForTimeout(1500);
await shot('26-terms');
await page.evaluate(() => { const o = document.getElementById('pageOverlay'); if (o) o.classList.remove('on'); });
await page.waitForTimeout(400);
const sup = await page.evaluate(() => { const b = document.querySelector('.suplaunch'); if (b && b.offsetParent) { b.click(); return true; } return false; });
if (sup) { await page.waitForTimeout(1500); await shot('27-support'); }

// ---- 10. narrow-width sanity (Android small phones, 360px)
await page.setViewportSize({ width: 360, height: 800 });
await nav('/');
await shot('28-landing-360w');

fs.writeFileSync(`${OUT}/_report.json`, JSON.stringify(report, null, 2));
console.log('DONE ->', OUT);
await browser.close();
