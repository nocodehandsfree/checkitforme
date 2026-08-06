// The saved screen, as the owner ruled it on 08-06: "don't close the window build the screen that
// shows that their auto check has been saved and they should have a button there that allows them to
// jump directly into the auto check homepage where they can see their first check."
//
// So this picture is taken where it really happens: the check status page is BEHIND it (that is where
// the customer was), the auto-check sheet never closes, it flips in place to this, and its button goes
// straight to the auto-checks list. The old comp-2-saved.png was photographed over the search screen,
// which is not on this path at all.
//
// Writes $COMP_OUT/comp-2-saved-v2.png
import pw from '/home/user/checkitforme/node_modules/playwright-core/index.js';
import { execFile } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = pw;
const dir = mkdtempSync(join(tmpdir(), 'saved-')); let n = 0;
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
await page.evaluate(() => {
  PHONE_TOKEN = 'comp';
  ACCOUNT = { phone:'+13106662331', email:'fun@fungibles.com', emailVerified:true, comp:true,
              subscription:'active', credits:99, features:{ scheduled_checks:true, restock_alerts:true } };
  appApi = async () => ({ subscriptions: [], alertsPaused:false, slotCap:10 });
});
// The check that sent them here: not in stock, which is the only answer that offers an auto-check.
await page.evaluate(() => {
  SEL_STORE = { id:106362, name:'Target Woodland Hills', address:'23357 Mulholland Drive', location:'Woodland Hills, CA' };
  const tx = ['Agent: Hi, do you have any Pokemon cards in stock right now?',
              'Clerk: No, we are sold out right now.',
              'Agent: Okay, thank you.'].join('\n');
  showResult({ status:'completed', statusKey:'not_in_stock', confirmed:false, transcript:tx, charged:true,
               ts:Date.now(), durationSecs:38, storeName:'Target Woodland Hills', cats:['Pokémon'] }, 'saved-demo');
});
await page.waitForTimeout(1300);

const CAL = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFCB05" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>';

const r = await page.evaluate(async (CAL) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  SEL_CAT = 1; openSchedule(); await sleep(800);
  // THE SHEET DOES NOT CLOSE. It is the same slide-up, still open, with its inside swapped — the
  // pattern openWatchConfirm already uses. Everything below is the page's own furniture.
  const m = document.querySelector('#scheduleOverlay .modal') || document.querySelector('#scheduleOverlay > div');
  const line = (k, v, green) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0">
    <span style="font-size:14.5px;font-weight:600;color:#CDCDD8">${k}</span>
    <span style="font-size:14.5px;font-weight:800;color:${green?'#4ADE80':'#FFF'}">${v}</span></div>`;
  m.innerHTML = `<div style="display:flex;justify-content:center;margin-bottom:6px">${CAL}</div>
    <h3 style="margin:2px 0 4px;text-align:center">Auto-check is on.</h3>
    <div class="meta" style="margin-bottom:16px;text-align:center">We check for you and send the result.</div>
    <div style="padding:14px 16px 8px;border-radius:18px;background:linear-gradient(180deg,#2D2D34 0%,#27272D 100%);box-shadow:0 10px 18px -10px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.08)">
      <div style="font-size:15.5px;font-weight:800;color:#FFF">Target Woodland Hills</div>
      <div style="margin-top:2px;font-size:12.5px;font-weight:600;color:#8A8A96">Pokémon</div>
      <div style="height:1px;background:rgba(255,255,255,.08);margin:12px 0 4px"></div>
      ${line('Days','Tue, Fri')}
      ${line('From','10:00 AM')}
      ${line('Next check','Tuesday', true)}
    </div>
    <button class="cta" style="margin-top:18px;width:100%" onclick="closeSchedule();openAlerts()">
      <span>SEE MY AUTO-CHECKS →</span></button>`;
  await sleep(300);
  return m.innerText.replace(/\n{2,}/g,'\n').trim();
}, CAL);
console.log(r);
await page.screenshot({ path: `${OUT}/comp-2-saved-v2.png` });
await b.close();
