// Owner 07-05: (a) history-calendar check-days render in the Check GREEN, not the per-brand accent
// (Pokémon yellow); (b) the referral reward copy reads a single "give a check, get a check" free check —
// never "3 free checks" — regardless of the tunable policy grant. No-seed :8797 server.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
// Force a >1 referral grant so a regression (copy re-coupling to policy) would surface as "3".
await ctx.route('**/pub/policy', async (r) => { const res = await r.fetch(); const j = await res.json(); j.referralChecks = 3; r.fulfill({ contentType:'application/json', body: JSON.stringify(j) }); });
await ctx.route('**/app/referral', r => r.fulfill({ contentType:'application/json', body: JSON.stringify({ code:'ABC123', referrals:0, referredBy:null, reward:3, enabled:true }) }));
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c) => { console.log((c?'  ✓ ':'  ✗ ')+n); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,90)); console.log('  ⚠', String(e).slice(0,120)); });
for (let a=0;a<3;a++){ try{ await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}); break; }catch(e){ if(a===2) throw e; } }
await pg.waitForTimeout(500);

// (a) Calendar: create a v2 .rcal-d.has cell and read its computed background — must be green, not yellow.
const cal = await pg.evaluate(() => {
  const d=document.createElement('div'); d.className='rcal-d has'; d.textContent='5';
  document.body.appendChild(d); const bg=getComputedStyle(d).backgroundColor; d.remove(); return bg;
});
// #4ADE80 == rgb(74, 222, 128). Yellow #FFCB05 == rgb(255, 203, 5).
ok('calendar check-day background is the Check green', /rgb\(\s*74,\s*222,\s*128/.test(cal));
ok('calendar check-day background is NOT brand yellow', !/rgb\(\s*255,\s*203,\s*5/.test(cal));

// (b) Referral copy: the invite text message + panel sub must say a single free check, never "3".
const refer = await pg.evaluate(() => {
  const out = {};
  try { out.msg = (typeof inviteMsg==='function') ? inviteMsg('https://x') : ''; } catch(e){ out.msg='ERR:'+e.message; }
  try { out.share = (typeof referMessage==='function') ? referMessage() : ''; } catch(e){ out.share='ERR:'+e.message; }
  return out;
});
ok('invite text message has no "3 free"', !/3\s*free/i.test(refer.msg));
ok('invite text message mentions a free check', /free check/i.test(refer.msg));
ok('share message has no "3 free"', !/3\s*free/i.test(refer.share));

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL CAL/REFER TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
