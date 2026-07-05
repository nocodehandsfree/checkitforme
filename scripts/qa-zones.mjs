// Owner 07-05: Manage Zones redesign regressions — the builder renders map-first, the Save button is
// always enabled, saving with NO name flags #z_name red + toasts (never silently no-ops), the GPS pin
// re-sync button exists, and the My-Zones list paints from cache instantly. Runs against the no-seed
// :8797 server (no Hobby/Thrift chains needed — zones use RETAIL stores which every seed has).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
// comp account WITH zone_sweeps so the builder (not the upsell) renders; stub the zones list empty.
await ctx.route('**/app/me*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({credits:9999,comp:true,subscription:"active",subTier:"founder",quota:9999,payg:9999,premiumAsks:true,features:{exact_products:true,zone_sweeps:true,restock_alerts:true,scheduled_checks:true,any_town:true,store_holds:true,your_voice:true,thrift_hunts:true},callsMade:0,phone:"+15550000000",callerId:null,callerIdReady:false,catalog:{}}) }));
await ctx.route('**/app/zones', r => { if (r.request().method()==='POST'){ posted=true; r.fulfill({contentType:'application/json',body:'{"id":1}'}); } else r.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }); });
// Zones use RETAIL stores; the no-seed DB has none, so feed the builder a couple nearby retail stores.
let posted = false;
await ctx.route('**/pub/stores/near*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ total:2, offset:0, limit:60, stores:[
  { id:9001, name:'Target Calabasas', type:'retail', location:'Calabasas, CA', lat:34.152, lng:-118.632, distance:1.2 },
  { id:9002, name:'Walmart Woodland Hills', type:'retail', location:'Woodland Hills, CA', lat:34.168, lng:-118.605, distance:3.4 },
] }) }));
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c) => { console.log((c?'  ✓ ':'  ✗ ')+n); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,90)); console.log('  ⚠', String(e).slice(0,120)); });
for (let a=0;a<3;a++){ try{ await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}); break; }catch(e){ if(a===2) throw e; } }
await pg.waitForTimeout(600);
await pg.evaluate(() => { USER_LOC={lat:34.15,lng:-118.63}; window.isClosed=()=>false; });

// Open the zone builder directly (skip the list->new nav) and let it fetch retail stores.
const build = await pg.evaluate(() => new Promise(res => {
  zoneNew();
  setTimeout(()=>{
    res({
      hasGps: !!document.querySelector('#zones .zsearch .zgps'),
      hasSave: !!document.getElementById('z_save'),
      saveEnabled: (()=>{ const s=document.getElementById('z_save'); return s ? !s.disabled : false; })(),
      hasNameField: !!document.getElementById('z_name'),
      stores: document.querySelectorAll('#zones .zlist .store').length,
      mapFirst: !!document.getElementById('zmap'),
    });
  }, 1600);
}));
ok('builder renders GPS re-sync pin', build.hasGps);
ok('builder renders Save button', build.hasSave);
ok('Save button is always enabled (no disabled attr)', build.saveEnabled);
ok('builder renders the prominent name field', build.hasNameField);
ok('builder is map-first (#zmap present)', build.mapFirst);

ok('builder lists nearby retail stores', build.stores>=2);

// Save with NO stores selected + NO name -> no crash, and NOTHING is POSTed.
await pg.evaluate(() => new Promise(res => {
  ZONES.sel = new Set(); const nm=document.getElementById('z_name'); if(nm) nm.value='';
  zoneSave();
  setTimeout(res, 300);
}));
ok('save with no stores does not crash + no POST', !posted);

// Now select a store but leave the name blank -> #z_name should get the fld-err red class, still no POST.
const nameRed = await pg.evaluate(() => new Promise(res => {
  const first = document.querySelector('#zones .zlist .store');
  if (first) first.click();
  setTimeout(()=>{
    const nm=document.getElementById('z_name'); if(nm) nm.value='';
    zoneSave();
    setTimeout(()=>res({ red: !!(document.getElementById('z_name')||{}).classList?.contains('fld-err') }), 250);
  }, 300);
}));
ok('save with stores but no name flags #z_name red', nameRed.red);
ok('blank-name save still does NOT POST', !posted);

// Finally: store selected + a real name -> POST fires.
await pg.evaluate(() => new Promise(res => {
  const nm=document.getElementById('z_name'); if(nm) nm.value='My neighborhood';
  zoneSave();
  setTimeout(res, 400);
}));
ok('valid save (store + name) DOES POST', posted);

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL ZONES TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
