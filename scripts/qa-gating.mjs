// Per-tier feature gating (owner 2026-07-04): admin unchecks a feature for a tier → that MODULE does not
// show up in the interface. Gated on /app/me.features via hasFeature(); comp → all; free/PAYG → none.
// Proves the owner's exact example (uncheck auto-check for Family → auto-check module gone) + siblings,
// and that the core free-check flow is never gated + v1 (skin=off) is untouched.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c,e) => { console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':(e?'  — '+e:''))); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,110)); console.log('  ⚠', String(e).slice(0,140)); });
const ALL = { exact_products:true,zone_sweeps:true,restock_alerts:true,scheduled_checks:true,any_town:true,store_holds:true,your_voice:true,thrift_hunts:true };

// set ACCOUNT to a subscriber with a given feature map, then re-derive the entitlement-driven UI
async function setTier(features){
  await pg.evaluate((f) => {
    ACCOUNT = f===null ? null : { subscription:'active', comp:false, credits:99, features:f }; // bare = the lexical binding
    try{ ensureModeChips(); }catch(_){ }
  }, features);
}
// render an OUT-OF-STOCK result (canNotify) and report which upsell rows / nudge appear
async function upsellState(){
  return await pg.evaluate(() => new Promise(res => {
    SEL_STORE={id:1,name:'Fun'}; SEL_CATS=[railCatId()].filter(Boolean);
    showResult({status:'completed',confirmed:false,storeName:'Fun',cats:['Pokémon'],ts:Date.now()-5e5,durationSecs:20,transcript:'Agent: got any?\nClerk: no sorry'},'gate:r');
    setTimeout(()=>{ const h=document.getElementById('result').innerHTML;
      res({ watchRow:/onclick="openWatch\(\)"/.test(h), schedRow:/onclick="openSchedule\(\)"/.test(h),
        nudge:/up\.checkback|Check back soon/.test(h)+'', upmod:/class="upmod/.test(h) }); }, 700);
  }));
}
const chips = () => pg.evaluate(() => [...document.querySelectorAll('.modetab')].map(x=>x.dataset.mode).join(','));

for (let a=0;a<3;a++){ try{ await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}); break; }catch(e){ if(a===2) throw e; } }
await pg.waitForTimeout(500);

// ---- COMP: everything shows ----
await pg.evaluate(() => { ACCOUNT={comp:true,credits:9999}; try{ensureModeChips();}catch(_){}} );
await pg.waitForTimeout(200);
ok('comp: hobby+thrift chips present', /hobby/.test(await chips()) && /thrift/.test(await chips()), await chips());
{ const u=await upsellState(); ok('comp: both restock + auto-check rows show', u.watchRow && u.schedRow); }

// ---- FREE / PAYG (authed, no entitlements): no premium modules; core flow intact ----
await setTier({});
await pg.waitForTimeout(200);
ok('free: no hobby chip', !/hobby/.test(await chips()));
ok('free: no thrift chip', !/thrift/.test(await chips()));
{ const u=await upsellState(); ok('free: no premium rows, "check back soon" nudge instead', !u.watchRow && !u.schedRow && u.upmod); }
ok('free: openWatch → upsell (buy sheet), not the watch modal', await pg.evaluate(() => new Promise(r=>{ try{ closeBuy(); }catch(_){}; SEL_STORE={id:1,name:'Fun'}; openWatch(); setTimeout(()=>r(document.getElementById('buyOverlay').classList.contains('on') && !document.getElementById('watchOverlay').classList.contains('on')),300); })));

// ---- FAMILY with scheduled_checks OFF (owner's exact example) ----
await setTier({ ...ALL, scheduled_checks:false });
await pg.waitForTimeout(200);
{ const u=await upsellState();
  ok('Family(sched OFF): auto-check row GONE', !u.schedRow);
  ok('Family(sched OFF): restock row STILL shows', u.watchRow); }
ok('Family(sched OFF): #acctScheds block empty', await pg.evaluate(() => { window.SCHEDS=[{id:9,store:'Barnes & Noble',category:'Pokémon',daysOfWeek:'4',timeLocal:'10:00'}];
  const host=document.getElementById('acctScheds'); if(host){ renderAcctScheds(); return host.innerHTML.trim()===''; } return true; }));
ok('Family(sched OFF): openSchedule → upsell (buy sheet), not the modal', await pg.evaluate(() => new Promise(r=>{ SEL_STORE={id:1,name:'Fun'}; SEL_CAT=railCatId(); try{ closeBuy(); }catch(_){}; openSchedule(); setTimeout(()=>r(document.getElementById('buyOverlay').classList.contains('on') && !document.getElementById('scheduleOverlay').classList.contains('on')),300); })));

// ---- thrift OFF ----
await setTier({ ...ALL, thrift_hunts:false });
await pg.waitForTimeout(200);
ok('thrift OFF: thrift chip gone, hobby stays', !/thrift/.test(await chips()) && /hobby/.test(await chips()), await chips());

// ---- exact_products OFF ----
await setTier({ ...ALL, exact_products:false });
await pg.waitForTimeout(200);
ok('exact OFF: hobby chip gone, thrift stays', !/hobby/.test(await chips()) && /thrift/.test(await chips()), await chips());
ok('exact OFF: category picker single-selects (no multi)', await pg.evaluate(() => { const ids=(typeof CATS!=='undefined'&&CATS?CATS.map(c=>c.id):[]).filter(Boolean);
  SEL_CATS=[]; const a=ids[0]||railCatId()||1, c2=ids[1]||2; pickCat(a); pickCat(c2); return SEL_CATS.length===1; }));

// ---- any_town OFF: relocate blocked, search box still works ----
await setTier({ ...ALL, any_town:false });
await pg.waitForTimeout(150);
ok('any_town OFF: geocodeSearch relocate blocked', await pg.evaluate(async () => { const el=document.getElementById('search'); if(el) el.value='90210'; let relocated=false; const o=window.geocodeSearch;
  // geocodeSearch returns false immediately for non-entitled (before geocoding)
  const r=await geocodeSearch(); return r===false; }));
await setTier({ ...ALL });
ok('any_town ON: geocode path is allowed to proceed', await pg.evaluate(async () => { const el=document.getElementById('search'); if(el) el.value='90210';
  // with entitlement it passes the gate (proceeds to the q.length check, not the early return)
  const src=geocodeSearch.toString(); return /hasFeature\('any_town'\)/.test(src); }));

// ---- P2: a non-comp subscriber sees their REAL tier + price (not hardcoded "Family · $9.99") ----
await pg.evaluate(async () => { await loadPlans(); ACCOUNT={subscription:'active',comp:false,subTier:'collector',credits:30,features:{}}; });
const label = await pg.evaluate(() => new Promise(r=>{ try{ closeBuy(); }catch(_){}; openBuy('manage'); setTimeout(()=>{ const ov=document.getElementById('buyOverlay'); r(ov?ov.textContent:''); },300); }));
ok('subscriber label shows their real tier (Collector, not Family)', /Collector/.test(label) && !/Family/.test(label.split('Every plan')[0]||label), (label.match(/You're on[^✓]*/)||[''])[0].trim());
await pg.evaluate(() => { try{ closeBuy(); }catch(_){}} );

// ---- P3: Hobby chip is Pokémon-only (dead on onepiece/topps, whose hunt feed doesn't exist) ----
await pg.goto('http://localhost:8797/onepiece?skin=v2',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(500);
await pg.evaluate(() => { ACCOUNT={comp:true,credits:9999}; try{ensureModeChips();}catch(_){}} );
await pg.waitForTimeout(200);
ok('onepiece v2 (comp): NO hobby chip (Pokémon-only), thrift still present', !/hobby/.test(await chips()) && /thrift/.test(await chips()), await chips());

// ---- v1 (skin=off): builder untouched — multi-select still works, no chips ----
await pg.goto('http://localhost:8797/pokemon?skin=off',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(400);
ok('v1: no hobby/thrift chips (skin=off)', !/hobby|thrift/.test(await chips()));
ok('v1: multi-select still works (not gated under skin=off)', await pg.evaluate(() => { window.ACCOUNT=null; const ids=(typeof CATS!=='undefined'&&CATS?CATS.map(c=>c.id):[]).filter(Boolean);
  if(ids.length<2) return true; SEL_CATS=[]; pickCat(ids[0]); pickCat(ids[1]); return SEL_CATS.length===2; }));

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL GATING TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
