// Owner 07-06: "hobby is completely gone" — a signed-in comp/owner account lost the Hobby (and Thrift)
// chip. Root cause: refreshAuth() overwrote ACCOUNT with appApi's {error:'network'} on any /app/me blip,
// so paid went false and ensureModeChips REMOVED the chips. Fix: never clobber a good account with an
// error response. This test drives exactly that: chip shows, then a failing /app/me must NOT drop it.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
let meHits = 0;
await ctx.route('**/app/me*', r => {
  meHits++;
  // First answer: a healthy comp account. Every later answer: a hard failure (network/500), like a blip.
  if (meHits === 1) return r.fulfill({ contentType:'application/json', body: JSON.stringify({credits:9999,comp:true,subscription:'active',subTier:'founder',features:{exact_products:true,thrift_hunts:true},phone:'+13106662331'}) });
  return r.abort('failed');
});
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c) => { console.log((c?'  ✓ ':'  ✗ ')+n); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,90)); console.log('  ⚠', String(e).slice(0,120)); });
for (let a=0;a<3;a++){ try{ await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}); break; }catch(e){ if(a===2) throw e; } }
await pg.waitForTimeout(1200);

const before = await pg.evaluate(() => ({ hobby: !!document.querySelector('.modetab[data-mode="hobby"]'), thrift: !!document.querySelector('.modetab[data-mode="thrift"]'), comp: !!(window.ACCOUNT&&ACCOUNT.comp) }));
ok('comp account shows the Hobby chip on load', before.hobby);
ok('comp account shows the Thrift chip on load', before.thrift);

// Now force a refreshAuth — /app/me will FAIL (route aborts). The chips must survive.
const after = await pg.evaluate(async () => {
  await refreshAuth().catch(()=>{});
  await new Promise(z=>setTimeout(z,150));
  try{ ensureModeChips(); }catch(_){ }
  return { hobby: !!document.querySelector('.modetab[data-mode="hobby"]'), thrift: !!document.querySelector('.modetab[data-mode="thrift"]'), acct: (window.ACCOUNT&&ACCOUNT.error)?'error':((ACCOUNT&&ACCOUNT.comp)?'comp':'other') };
});
ok('a failed /app/me does NOT clobber ACCOUNT (stays comp)', after.acct==='comp');
ok('Hobby chip SURVIVES a transient /app/me failure', after.hobby);
ok('Thrift chip SURVIVES a transient /app/me failure', after.thrift);

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL CHIP-RESILIENCE TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
