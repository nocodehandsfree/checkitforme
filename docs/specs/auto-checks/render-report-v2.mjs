// The auto-check report, take two. Same sheet the approved list uses. The picture is now the site's
// OWN two pieces: the zone report's 72px ring (8172-8179) and the Activity chart's green bar
// (linear-gradient(180deg,#5BEA93,#34C268) on an rgba(255,255,255,.13) track).
import pw from '/home/user/checkitforme/node_modules/playwright-core/index.js';
import { execFile } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = pw;
const dir = mkdtempSync(join(tmpdir(), 'rep-')); let n = 0;
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
await page.waitForFunction(() => typeof window.openAlerts === 'function', null, { timeout: 45000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  PHONE_TOKEN = 'comp';
  ACCOUNT = { phone:'+13106662331', email:'fun@fungibles.com', emailVerified:true, comp:true,
              subscription:'active', credits:0, features:{ scheduled_checks:true, restock_alerts:true } };
  appApi = async () => ({ subscriptions: [], alertsPaused:false, slotCap:10 });
});

const CLOCK = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FFCB05" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 3v5h-5"/><path d="M12 8v4l2.5 1.5"/></svg>';

const r = await page.evaluate(async (CLOCK) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  ALERTS_ME = { subscriptions: [], alertsPaused:false, slotCap:10 };
  await openAlerts(); await sleep(900);
  const m = document.querySelector('#alertsOv .modal');

  // The ring, exactly as the zone report draws it: r=42, stroke 9, #2D2D34 track, #4ADE80 arc.
  const C = 2 * Math.PI * 42, hit = 3, ran = 12;
  const ring = `<div style="position:relative;width:78px;height:78px;flex:none">
      <svg width="78" height="78" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#2D2D34" stroke-width="9"/>
        <circle cx="50" cy="50" r="42" fill="none" stroke="#4ADE80" stroke-width="9" stroke-linecap="round"
                stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C*(1-hit/ran)).toFixed(1)}" transform="rotate(-90 50 50)"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;line-height:1;font-size:26px;font-weight:900;letter-spacing:-1px;color:#4ADE80">${hit}</div>
    </div>`;

  // One bar per day the auto-check runs, so the picture answers "which day should I go".
  const dayBar = (lbl, got, of) => {
    const pct = Math.round(got/of*100), on = got > 0;
    return `<div style="display:flex;align-items:center;gap:11px;margin-top:11px">
      <span style="width:34px;flex:0 0 auto;font-size:11px;font-weight:800;letter-spacing:.1em;color:${on?'#4ADE80':'#7C7C88'}">${lbl}</span>
      <span style="flex:1;height:10px;border-radius:999px;background:rgba(255,255,255,.13);overflow:hidden;display:block">
        <span style="display:block;height:100%;width:${pct}%;border-radius:999px;background:linear-gradient(180deg,#5BEA93,#34C268)${on?';box-shadow:0 0 12px rgba(74,222,128,.45)':''}"></span></span>
      <span style="flex:0 0 auto;font-size:12px;font-weight:700;color:${on?'#FFF':'#7C7C88'}">${got} of ${of}</span>
    </div>`;
  };

  const chip = (bg, sw) => `<span style="width:26px;height:26px;flex:0 0 auto;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center">${sw}</span>`;
  const tick = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const ex = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  const truck = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35a1 1 0 0 0-.78-.38H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';
  const row = (c, t, s) => `<div style="display:flex;align-items:center;gap:11px;margin-top:9px;padding:11px 14px;border-radius:16px;background:linear-gradient(180deg,#2D2D34 0%,#27272D 100%);box-shadow:0 8px 14px -8px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07)">${c}<div style="flex:1;min-width:0"><div style="font-size:14.5px;font-weight:700;color:#fff">${t}</div><div style="margin-top:2px;font-size:12px;font-weight:600;color:#8A8A96">${s}</div></div></div>`;

  m.innerHTML = `<div style="display:flex;justify-content:center;margin-bottom:6px">${CLOCK}</div>
    <h3 style="margin:2px 0 4px;text-align:center">Target Woodland Hills</h3>
    <div class="meta" style="margin-bottom:15px;text-align:center">Pokémon · Tuesdays and Fridays</div>

    <div style="display:flex;align-items:center;gap:15px;padding:16px;border-radius:18px;background:linear-gradient(180deg,#2D2D34 0%,#27272D 100%);box-shadow:0 10px 18px -10px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.08)">
      ${ring}
      <div style="flex:1;min-width:0">
        <div style="font-size:15.5px;font-weight:800;color:#fff;line-height:1.3">They had it 3 times</div>
        <div style="margin-top:3px;font-size:12.5px;font-weight:600;color:#8A8A96">out of the 12 times we called</div>
      </div>
    </div>

    <div style="margin-top:10px;padding:15px 16px 17px;border-radius:18px;background:linear-gradient(180deg,#2D2D34 0%,#27272D 100%);box-shadow:0 10px 18px -10px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.08)">
      <div style="font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#8A8A96">The day they had it</div>
      ${dayBar('TUE', 3, 6)}
      ${dayBar('FRI', 0, 6)}
      <div style="margin-top:14px;font-size:13px;font-weight:600;color:#CDCDD8;line-height:1.45">Tuesday is your day. They have never had it on a Friday.</div>
    </div>

    <div style="margin:18px 0 0;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#8A8A96">Every check</div>
    ${row(chip('rgba(74,222,128,.15)', tick), 'In stock', 'Tue, Jul 29 · 10:02 AM')}
    ${row(chip('rgba(239,68,68,.15)', ex), 'Not in stock', 'Fri, Jul 25 · 10:01 AM')}
    ${row(chip('rgba(245,158,11,.15)', truck), 'Restock Tuesday', 'Tue, Jul 22 · 10:03 AM')}`;
  return { text: m.innerText.replace(/\s+/g,' ').trim().slice(0,200) };
}, CLOCK);
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: `${OUT}/ac-4-report-v2.png` });
await b.close();
