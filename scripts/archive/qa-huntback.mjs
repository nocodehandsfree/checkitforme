// Owner 07-04: (#44) browser/OS back walks the hobby hunt out (shop→prods→sets→eras→Retail) instead
// of escaping to a stale My-checks entry; (#40) Retail mode never lists Hobby/Thrift stores; (#41) the
// "in stock?" hero header stays visible through the hunt. Needs the seeded Hobby+Thrift DB on :8797.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.route('**/app/me*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({credits:9999,comp:true,subscription:"active",subTier:"founder",quota:9999,payg:9999,premiumAsks:true,features:{exact_products:true,zone_sweeps:true,restock_alerts:true,scheduled_checks:true,any_town:true,store_holds:true,your_voice:true,thrift_hunts:true},callsMade:0,phone:"+15550000000",callerId:null,callerIdReady:false,catalog:{}}) }));
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c) => { console.log((c?'  ✓ ':'  ✗ ')+n); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,90)); console.log('  ⚠', String(e).slice(0,120)); });
for (let a=0;a<3;a++){ try{ await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}); break; }catch(e){ if(a===2) throw e; } }
await pg.waitForTimeout(600);

// Walk the hunt: hobby -> era -> set -> product -> shop list, tracking HUNT_STEP.
await pg.evaluate(() => { USER_LOC={lat:34.15,lng:-118.63}; window.isClosed=()=>false; });
const steps = await pg.evaluate(() => new Promise(res => {
  const out={};
  setMode('hobby');
  setTimeout(()=>{ out.eras=HUNT_STEP;
    document.querySelector('#hobby .hob-erabtn').click();
    setTimeout(()=>{ out.sets=HUNT_STEP;
      document.querySelector('#hobby .hob-set').click();
      setTimeout(()=>{ out.prods=HUNT_STEP;
        document.querySelector('#hobby .hob-prod').click();
        setTimeout(()=>{ out.shop=HUNT_STEP; out.stores=[...document.querySelectorAll('#storelist .store')].length; res(out); },1500);
      },700);
    },700);
  },1400);
}));
ok('hunt marks step eras', steps.eras==='eras');
ok('hunt marks step sets', steps.sets==='sets');
ok('hunt marks step prods', steps.prods==='prods');
ok('hunt marks step shop', steps.shop==='shop');
ok('shop list rendered after lock', steps.stores>=2);

// #41: the "in stock?" hero header is visible during the hunt (huntmode keeps .hero on).
const heroVis = await pg.evaluate(() => { const h=document.querySelector('#builder .hero'); return h ? getComputedStyle(h).display!=='none' && h.getBoundingClientRect().height>0 : false; });
ok('#41 hero header visible in hunt (kiosk/hobby header stays)', heroVis);

// Browser BACK from shop -> products -> sets -> eras -> Retail. Each back walks one step.
await pg.goBack(); await pg.waitForTimeout(500);
ok('back: shop -> products', await pg.evaluate(()=>HUNT_STEP==='prods' && document.querySelectorAll('#hobby .hob-prod').length>=3 && document.body.classList.contains('huntmode')));
await pg.goBack(); await pg.waitForTimeout(500);
ok('back: products -> sets', await pg.evaluate(()=>HUNT_STEP==='sets' && document.querySelectorAll('#hobby .hob-set').length>=3));
await pg.goBack(); await pg.waitForTimeout(500);
ok('back: sets -> eras', await pg.evaluate(()=>HUNT_STEP==='eras' && document.querySelectorAll('#hobby .hob-erabtn').length>=10));
await pg.goBack(); await pg.waitForTimeout(600);
ok('back: eras -> Retail (huntmode off, mode=call)', await pg.evaluate(()=>HUNT_STEP==='' && MODE==='call' && !document.body.classList.contains('huntmode')));

// #40: Retail mode must NOT list Hobby or Thrift stores even though they carry the brand & are nearby.
const retail = await pg.evaluate(() => new Promise(res => {
  setMode('call'); setRadius && setRadius(20);
  setTimeout(()=>{ const names=[...document.querySelectorAll('#storelist .store .nm')].map(n=>n.textContent);
    res({ names, hasHobby: names.some(n=>/QA Cards/.test(n)), hasThrift: names.some(n=>/QA Thrift|Thrift/i.test(n)) }); },1600);
}));
ok('#40 Retail hides Hobby card shops', !retail.hasHobby);
ok('#40 Retail hides Thrift stores', !retail.hasThrift);

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL HUNT-BACK TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
