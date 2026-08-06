// The auto-check report, take three — the ring is GONE (owner 08-06: "it's almost assuming that there
// are 12 checks... but checks can just go on forever"). An auto-check has no finish line, so the report
// is built the way the Activity tab already shows a run of days: one week of bars, tap a day, the
// checks made that day list underneath, tap one and it unfolds into the real check status page with
// the conversation, exactly the way a zone report row unfolds (`zoneExpand`).
//
// Every piece here is the page's own: the Activity chart's bar markup (checkit.html ~7311), the
// Activity list row (~7329), and `combinedTimelineHTML` + `deriveVerdict`, the same two functions the
// single-check page and the zone report both paint with. Nothing is drawn from scratch.
//
// Writes: /tmp/auto-check-comps/ac-4-report-v3.png (the week) and ac-5-report-open-v3.png (unfolded).
import pw from '/home/user/checkitforme/node_modules/playwright-core/index.js';
import { execFile } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = pw;
const dir = mkdtempSync(join(tmpdir(), 'rep3-')); let n = 0;
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
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium/chrome' });
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

// Sample checks for the picture only. Tuesday is the selected day and carries two checks so the list
// under the chart has something to show; the rest of the week is what a twice-a-week auto-check looks
// like. Real data replaces this wholesale when it is built.
const build = async (openIt) => page.evaluate(async ({ CLOCK, openIt }) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  ALERTS_ME = { subscriptions: [], alertsPaused:false, slotCap:10 };
  await openAlerts(); await sleep(900);
  const m = document.querySelector('#alertsOv .modal');

  // ---- the week, drawn with the Activity tab's own bar ----
  const days = [
    { d:'S', dt:'8/3', n:0 },
    { d:'M', dt:'8/4', n:0 },
    { d:'T', dt:'8/5', n:2, sel:true },
    { d:'W', dt:'8/6', n:0 },
    { d:'T', dt:'8/7', n:0 },
    { d:'F', dt:'8/8', n:1 },
    { d:'S', dt:'8/9', n:0 },
  ];
  const mx = Math.max(1, ...days.map(x => x.n));
  const bars = days.map(x => {
    const bh = Math.max(6, Math.round(x.n/mx*64));
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer">
      <div style="width:100%;height:${bh}px;border-radius:4px 4px 0 0;align-self:flex-end;background:${x.sel?'linear-gradient(180deg,#5BEA93,#34C268);box-shadow:0 0 14px rgba(74,222,128,.4)':'rgba(255,255,255,.13)'}"></div>
      <span style="font-size:9.5px;font-weight:700;color:${x.sel?'#4ADE80':'#7C7C88'}">${x.d}</span>
      <span style="font-size:9px;font-weight:600;color:#66666F;margin-top:-3px">${x.dt}</span>
    </div>`; }).join('');
  const arrow = (dir) => `<button style="background:none;border:0;color:#8A8A96;padding:4px 2px;cursor:pointer"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="${dir<0?'M14.5 5L8 12l6.5 7':'M9.5 5l6.5 7-6.5 7'}" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;

  // ---- the checks made on the picked day, drawn with the Activity list row ----
  const chip = (tone) => v2StatusChip(tone, 26);
  const row = (tone, title, when, open) => `<div style="margin-top:9px">
    <button class="${open?'open':''}" style="display:flex;align-items:center;gap:11px;width:100%;background:linear-gradient(180deg,#2D2D34 0%,#27272D 100%);border:0;border-radius:${open?'14px 14px 0 0':'14px'};padding:9px 12px;box-shadow:0 8px 14px -8px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07);color:#FFF;cursor:pointer;text-align:left">
      ${chip(tone)}
      <span style="flex:1;min-width:0"><span style="display:block;font-size:14px;font-weight:700">${title}</span>
        <span style="display:block;margin-top:2px;font-size:11.5px;font-weight:600;color:#8A8A96">${when}</span></span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="flex:0 0 auto;color:#8A8A96;transform:rotate(${open?180:0}deg)"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="acbody" style="display:${open?'block':'none'}"></div></div>`;

  m.innerHTML = `<div style="display:flex;justify-content:center;margin-bottom:6px">${CLOCK}</div>
    <h3 style="margin:2px 0 4px;text-align:center">Target Woodland Hills</h3>
    <div class="meta" style="margin-bottom:15px;text-align:center">Pokémon · Tuesdays and Fridays</div>

    <div style="padding:14px 14px 12px;border-radius:18px;background:linear-gradient(180deg,#2D2D34 0%,#27272D 100%);box-shadow:0 10px 18px -10px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.08)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        ${arrow(-1)}<b style="font-size:13px;font-weight:800;color:#FFF">Aug 3 to Aug 9</b>${arrow(1)}
      </div>
      <div style="display:flex;align-items:flex-end;gap:7px;height:92px">${bars}</div>
    </div>

    <div style="margin:18px 0 0;font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#8A8A96">Tuesday, August 5</div>
    ${row('in', 'In stock!', '10:02 AM', openIt)}
    ${row('out', 'Not in stock', '4:01 PM', false)}`;

  // ---- one check, unfolded into the real check status page (the zone report's own unfold) ----
  if (openIt) {
    // The stored transcript format is what the page parses: `Agent:` is Charlie, `Clerk:` is Staff.
    // Any other prefix is dropped as junk and no conversation renders at all.
    const tx = [
      'Agent: Hi, do you have any Pokemon cards in stock right now?',
      'Clerk: Yeah, we just put out a new shipment this morning.',
      'Agent: Perfect, thank you so much.',
    ].join('\n');
    const o = { status:'completed', statusKey:'in_stock', confirmed:true, transcript:tx, charged:true,
                ts: Date.now(), durationSecs: 41, storeName:'Target Woodland Hills', cats:['Pokémon'] };
    const v = deriveVerdict(o, 'Pokémon', 'Target Woodland Hills');
    const vT = String(v.title).replace(/[\s!?.:：]+$/,'');
    const when = `${new Date(o.ts).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})} · 10:02 AM`;
    const body = m.querySelector('.acbody');
    body.innerHTML = `<div style="background:#1B1B20;padding:14px 14px 4px;border-radius:0 0 14px 14px;text-align:left;overflow:hidden">
      <div class="rverdict ${v.cls}">
        <span class="rpill"><span class="d"></span>Result</span>
        <div class="rwhen">${when}</div>
        <div class="rtitle2">${vT}</div>
        ${v.note?`<div class="rsub">${sentLines(fillP(v.note,o,v.cls))}</div>`:''}
      </div>
      <div style="margin-top:16px">${combinedTimelineHTML(deriveSteps(tx), tx, o.durationSecs, {cls:v.cls, title:vT, term:'In stock.', ts:o.ts, used:'1 check used', store:{name:'Target Woodland Hills'}})}</div>
    </div>`;
    try { fitSub(body); } catch(_) {}
  }
  return { text: m.innerText.replace(/\s+/g,' ').trim() };
}, { CLOCK, openIt });

const a = await build(false);
await page.screenshot({ path: `${OUT}/ac-4-report-v3.png`, fullPage: false });
// The unfolded check is taller than a phone screen, so the second picture is taken on a tall window:
// this is one scroll of the same sheet, not a second screen.
await page.setViewportSize({ width: 390, height: 1180 });
const c = await build(true);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/ac-5-report-open-v3.png`, fullPage: false });
console.log(JSON.stringify({ week: a.text.slice(0,300), open: c.text.slice(0,600) }, null, 1));
await b.close();
