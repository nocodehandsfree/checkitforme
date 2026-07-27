// Owner 07-05: (a) My-checks sheet slides fully UP on open + DOWN on close (was a 24px nudge / hard
// disappear); (b) Hobby+Thrift chips are PAID-plan only — PAYG/free never see them.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const fails = [];
const ok = (n,c) => { console.log((c?'  ✓ ':'  ✗ ')+n); if(!c) fails.push(n); };
async function page(me){
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.route('**/app/me*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(me) }));
  await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,90)); });
  for (let a=0;a<3;a++){ try{ await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}); break; }catch(e){ if(a===2) throw e; } }
  await pg.waitForTimeout(800);
  return pg;
}
const ALLON={exact_products:true,zone_sweeps:true,restock_alerts:true,scheduled_checks:true,any_town:true,store_holds:true,your_voice:true,thrift_hunts:true};

// PAYG: NOT comp, no active sub, but backend (wrongly) sends features on → chips must STILL be hidden
let pg = await page({credits:10,comp:false,subscription:"none",payg:10,features:ALLON,callsMade:0,phone:"+15550000000"});
ok('PAYG: NO hobby chip', await pg.evaluate(()=>!document.querySelector('.modetab[data-mode="hobby"]')));
ok('PAYG: NO thrift chip', await pg.evaluate(()=>!document.querySelector('.modetab[data-mode="thrift"]')));

// Paid subscriber with the features on → chips present
await pg.context().close();
pg = await page({credits:9999,comp:false,subscription:"active",subTier:"collector",quota:9999,features:ALLON,callsMade:0,phone:"+15550000000"});
ok('paid subscriber: hobby chip present', await pg.evaluate(()=>!!document.querySelector('.modetab[data-mode="hobby"]')));
ok('paid subscriber: thrift chip present', await pg.evaluate(()=>!!document.querySelector('.modetab[data-mode="thrift"]')));

// Account sheet slide: entrance animation + animated close keeps .on briefly
const anim = await pg.evaluate(()=>{ openAccount(); const m=document.querySelector('#acctOverlay .modal'); return getComputedStyle(m).animationName; });
ok('open: sheet uses the slide-up keyframe (sheetUpV2)', anim==='sheetUpV2');
const closeState = await pg.evaluate(()=> new Promise(res=>{
  closeAccount(); // animated
  const ov=document.getElementById('acctOverlay'), m=ov.querySelector('.modal');
  const midOn = ov.classList.contains('on'); const midTf = m.style.transform; // should be sliding down, still on
  setTimeout(()=>{ res({ midOn, midTf, afterOn: ov.classList.contains('on') }); }, 320);
}));
ok('close: still visible + sliding down mid-animation', closeState.midOn && /translateY\(100%\)/.test(closeState.midTf));
ok('close: hidden after the slide finishes', !closeState.afterOn);
// instant close path (sheetDrag) removes it immediately
const inst = await pg.evaluate(()=>{ openAccount(); closeAccount(true); return document.getElementById('acctOverlay').classList.contains('on'); });
ok('instant close (closeAccount(true)) hides immediately', inst===false);

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL SHEET+GATE TESTS PASS');
await b.close(); process.exit(fails.length?1:0);
