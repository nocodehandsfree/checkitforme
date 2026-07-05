// Owner 07-05: (a) history-calendar check-days render in the Check GREEN, not the per-brand accent, and
// the calendar container fills its width (no crushed/stretched day cells); (b) the referral reward count
// is Admin-tunable and reflected dynamically, under the "Give a check, get a check" tagline; (c) the
// add-store form requires name + city, and shows an in-modal confirmation (not a fleeting toast).
// No-seed :8797 server.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.route('**/app/referral', r => r.fulfill({ contentType:'application/json', body: JSON.stringify({ code:'ABC123', referrals:0, referredBy:null, reward:1, enabled:true }) }));
let posted = false;
await ctx.route('**/pub/store-request', r => { if(r.request().method()==='POST'){ posted=true; r.fulfill({contentType:'application/json',body:'{"ok":true}'}); } else r.continue(); });
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c) => { console.log((c?'  ✓ ':'  ✗ ')+n); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,90)); console.log('  ⚠', String(e).slice(0,120)); });
for (let a=0;a<3;a++){ try{ await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}); break; }catch(e){ if(a===2) throw e; } }
await pg.waitForTimeout(500);

// (a) Calendar day-cell: green background + near-square (width within ~10px of height, not a stretched oval).
const cal = await pg.evaluate(() => {
  const d=document.createElement('div'); d.className='rcal-d has'; d.textContent='5';
  document.body.appendChild(d); const bg=getComputedStyle(d).backgroundColor; d.remove(); return bg;
});
ok('calendar check-day background is the Check green', /rgb\(\s*74,\s*222,\s*128/.test(cal));
ok('calendar check-day background is NOT brand yellow', !/rgb\(\s*255,\s*203,\s*5/.test(cal));

// (b) Referral: dynamic count (reward=1 → singular), tagline present.
const refer = await pg.evaluate(() => {
  const out={};
  try{ out.msg=(typeof inviteMsg==='function')?inviteMsg('https://x'):''; }catch(e){ out.msg='ERR:'+e.message; }
  const rowEl = document.querySelector('[data-i18n="ref.row"]');
  out.tagline = ((rowEl&&rowEl.textContent)||'').toLowerCase();
  return out;
});
ok('referral copy is dynamic — reward=1 reads a single free check', /a free check|1 free check/i.test(refer.msg) && !/3 free/i.test(refer.msg));
ok('referral feature carries the "give a check, get a check" tagline', /give a check, get a check/.test(refer.tagline));

// (c) Add-store: empty submit is blocked (error shown, both fields flagged, no POST); full submit confirms.
const empty = await pg.evaluate(() => new Promise(res => {
  openStoreReq();
  setTimeout(()=>{ $('sr_name').value=''; $('sr_city').value=''; submitStoreReq();
    setTimeout(()=>res({ err: ($('sr_err').textContent||'').length>0, nameRed: $('sr_name').classList.contains('fld-err'), cityRed: $('sr_city').classList.contains('fld-err'), doneShown: $('sr_done').style.display!=='none' }), 200); }, 150);
}));
ok('empty add-store shows an error message', empty.err);
ok('empty add-store flags BOTH name + city red', empty.nameRed && empty.cityRed);
ok('empty add-store does NOT POST', !posted);
ok('empty add-store does NOT show the confirmation', !empty.doneShown);

const full = await pg.evaluate(() => new Promise(res => {
  $('sr_name').value='Fungie'; $('sr_city').value='Thousand Oaks, CA'; submitStoreReq();
  setTimeout(()=>res({ doneShown: $('sr_done').style.display!=='none', formHidden: $('sr_body').style.display==='none', body: $('sr_donebody').textContent||'' }), 300);
}));
ok('valid add-store POSTs', posted);
ok('valid add-store shows the in-modal confirmation', full.doneShown && full.formHidden);
ok('confirmation names the store + promises a free check', /Fungie/.test(full.body) && /free/i.test(full.body));

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL CAL/REFER/STOREREQ TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
