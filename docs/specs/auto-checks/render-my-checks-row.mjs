// Take the REAL My checks screen off staging and add ONE row: Auto-checks. Nothing else invented.
import pw from '/home/user/checkitforme/node_modules/playwright-core/index.js';
import { execFile } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = pw;
const dir = mkdtempSync(join(tmpdir(), 'mc-')); let n = 0;
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
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await page.route('**/*', async r => {
  const q = r.request(); if (!q.url().startsWith('https://staging.checkitforme.com') || q.method()!=='GET') return r.abort();
  const g = await curlGet(q.url()); if (!g) return r.abort();
  return r.fulfill({ status: g.status, headers: g.headers, body: g.body });
});
await page.goto('https://staging.checkitforme.com/', { waitUntil:'domcontentloaded', timeout:45000 });
await page.waitForTimeout(1800);

const out = await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const o = {};
  try {
    // Sign the page in the way the real screen is signed in, with his own numbers from the screenshot.
    PHONE_TOKEN = 'comp';
    ACCOUNT = { phone: '+13106662331', email: 'fun@fungibles.com', emailVerified: true, comp: true,
                subscription: 'active', credits: 0, features: { scheduled_checks: true, restock_alerts: true } };
    appApi = async (p) => p.includes('/app/schedules') ? [{ id: 1 }, { id: 2 }] : ({ ok: true });
    openAccount();
    await sleep(900);
    if (typeof acctTab === 'function') { acctTab('overview'); await sleep(900); }
    const rows = [...document.querySelectorAll('#acctv2panel button')].filter(b => /Manage plan|Check history|Alerts|Manage Zones/i.test(b.innerText));
    o.realRows = rows.map(r => r.innerText.replace(/\s+/g, ' ').trim());
    // Add ONE row, built from the row right above it so it is the same in every way but its words.
    const hist = rows.find(r => /Check history/i.test(r.innerText));
    if (hist) {
      const add = hist.cloneNode(true);
      const cal = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFCB05" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 3v5h-5"/><path d="M12 8v4l2.5 1.5"/></svg>';
      const svg = add.querySelector('svg'); if (svg) svg.outerHTML = cal;
      const spans = [...add.querySelectorAll('span')].filter(x => x.children.length === 0 && x.textContent.trim());
      if (spans[0]) spans[0].textContent = 'Auto-checks';
      if (spans[1]) spans[1].textContent = '2 stores on a schedule';
      hist.after(add);
      const buried = document.getElementById('acctScheds'); if (buried) buried.innerHTML = '';
      o.added = add.innerText.replace(/\s+/g, ' ').trim();
    }
    await sleep(300);
  } catch (e) { o.error = String(e); }
  return o;
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/auto-check-comps/mychecks-real.png' });
await b.close();
