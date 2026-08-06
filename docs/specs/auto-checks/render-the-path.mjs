// THE PATH, screen by screen, both ways in (owner asked 08-06: "I need to see the path that somebody
// takes"). Everything here except the two report screens is the LIVE staging page, driven and
// photographed, not a comp: the check status page's box at the bottom, that box opened, and the
// real Set an auto-check sheet.
//
// Writes to $COMP_OUT (default /tmp/auto-check-comps):
//   path-a1-status-box-closed.png   the check status page, the box at the bottom
//   path-a2-status-box-open.png     the same box opened, with the auto-check row in it
//   path-a3-set-it-up.png           the real sheet where the days and the time are picked
//   path-b1-my-checks.png           My checks, where the Auto-checks row will live
import pw from '/home/user/checkitforme/node_modules/playwright-core/index.js';
import { execFile } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = pw;
const dir = mkdtempSync(join(tmpdir(), 'path-')); let n = 0;
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
const OUT = process.env.COMP_OUT || '/tmp/auto-check-comps';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await page.route('**/*', async r => {
  const q = r.request(); if (!q.url().startsWith('https://staging.checkitforme.com') || q.method()!=='GET') return r.abort();
  const g = await curlGet(q.url()); if (!g) return r.abort();
  return r.fulfill({ status: g.status, headers: g.headers, body: g.body });
});
await page.goto('https://staging.checkitforme.com/', { waitUntil:'domcontentloaded', timeout:45000 });
await page.waitForFunction(() => typeof window.showResult === 'function', null, { timeout: 45000 });
await page.waitForTimeout(1200);

// A member with auto-checks and restock alerts, so the box at the bottom shows both of its rows.
await page.evaluate(() => {
  PHONE_TOKEN = 'comp';
  ACCOUNT = { phone:'+13106662331', email:'fun@fungibles.com', emailVerified:true, comp:true,
              subscription:'active', credits:99, features:{ scheduled_checks:true, restock_alerts:true } };
  appApi = async () => ({ subscriptions: [], alertsPaused:false, slotCap:10 });
  window.canNotify = true;
});

// ---- PATH A: the check status page ----
await page.evaluate(() => {
  SEL_STORE = { id: 106362, name:'Target Woodland Hills', address:'23357 Mulholland Drive', location:'Woodland Hills, CA' };
  // THE BOX ONLY EXISTS WHEN THE STORE DID NOT HAVE IT (`canNotify = cls!=='in'`, checkit.html 6741),
  // which is exactly the moment somebody wants us to keep checking. So the path starts from a check
  // that came back not in stock.
  const tx = ['Agent: Hi, do you have any Pokemon cards in stock right now?',
              'Clerk: No, we are sold out right now.',
              'Agent: Okay, thank you.'].join('\n');
  showResult({ status:'completed', statusKey:'not_in_stock', confirmed:false, transcript:tx, charged:true,
               ts:Date.now(), durationSecs:38, storeName:'Target Woodland Hills', cats:['Pokémon'] }, 'path-demo');
});
await page.waitForTimeout(1400);
// The box lives at the bottom of the result, so scroll to it: this is the customer scrolling down.
await page.evaluate(() => { const m=document.querySelector('.upmod'); if(m) m.scrollIntoView({block:'center'}); });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/path-a1-status-box-closed.png` });

await page.evaluate(() => { const h=document.querySelector('.upmod .upmod-h'); if(h) h.click(); });
await page.waitForTimeout(700);
await page.evaluate(() => { const m=document.querySelector('.upmod'); if(m) m.scrollIntoView({block:'center'}); });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/path-a2-status-box-open.png` });
const rows = await page.evaluate(() => [...document.querySelectorAll('.upmod .uprow .a')].map(e=>e.textContent.trim()));

// The auto-check row opens the real sheet where the days and the time are picked.
await page.evaluate(() => { SEL_CAT = 1; openSchedule(); });
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/path-a3-set-it-up.png` });
const sched = await page.evaluate(() => (document.getElementById('scheduleOverlay')||{}).innerText?.replace(/\n{2,}/g,'\n').trim().slice(0,300));

// ---- PATH B: My checks ----
await page.evaluate(() => { closeSchedule(); openAccount(); });
await page.waitForTimeout(1400);
await page.screenshot({ path: `${OUT}/path-b1-my-checks.png` });

console.log(JSON.stringify({ boxRows: rows, sched }, null, 1));
await b.close();
