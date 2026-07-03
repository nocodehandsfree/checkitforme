// Hobby chip behavior tests: gating, type-filtered fetch, shop-prices tag, exact-product picker, empty state.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c) => { console.log((c?'  ✓ ':'  ✗ ')+n); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,90)); console.log('  ⚠', String(e).slice(0,120)); });

// gating: v1 has no chip
await pg.goto('http://localhost:8797/pokemon?skin=off',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(500);
ok('v1: no hobby chip', await pg.evaluate(() => !document.querySelector('.modetab[data-mode="hobby"]')));

// needoh (v2) has no chip — owner law
await pg.goto('http://localhost:8797/needoh?skin=v2',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(700);
ok('needoh v2: no hobby chip (owner law)', await pg.evaluate(() => !document.querySelector('.modetab[data-mode="hobby"]')));

// pokemon v2: chip present between Retail and Kiosk
await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(700);
const chip = await pg.evaluate(() => { const t0=[...document.querySelectorAll('.modetab')].map(x=>x.dataset.mode); return t0.join(','); });
ok('pokemon v2: chip order call,hobby,kiosk', chip==='call,hobby,kiosk');

// click Hobby → fetch carries type=Hobby, rows render with SHOP PRICES tag
const hob = await pg.evaluate(() => new Promise(res => {
  USER_LOC={lat:34.15,lng:-118.64};
  window.isClosed=()=>false; // test runs at night — seeded shops carry no hours ("Likely closed")
  const orig=window.fetch; let hobbyUrl='';
  window.fetch=(u,o)=>{ if(String(u).includes('type=Hobby')) hobbyUrl=String(u); return orig(u,o); };
  setMode('hobby');
  setTimeout(()=>{ window.fetch=orig;
    const rows=[...document.querySelectorAll('#storelist .store')];
    res({ hobbyUrl, rows: rows.length, tag: rows.some(r=>/SHOP PRICES/i.test(r.textContent)), step: document.getElementById('findstep').textContent }); }, 1800);
}));
ok('hobby fetch carries type=Hobby', /type=Hobby/.test(hob.hobbyUrl));
ok('hobby stores render ('+hob.rows+')', hob.rows>=2);
ok('SHOP PRICES tag on non-MSRP shops', hob.tag);
ok('find-step says card shop', /card shop/i.test(hob.step));
await pg.screenshot({ path: 'loops/site-redesign/proofs/hobby-chip-list.png', fullPage: false });

// pick a shop → sheet shows the exact-product link (poke only) → opens the sets flow
const sheet = await pg.evaluate(() => new Promise(res => {
  const st=STORES.find(x=>/QA Cards/.test(x.name));
  pickStore(st.id);
  setTimeout(()=>{ const pe=document.getElementById('cs_prod');
    res({ link: !!(pe&&pe.querySelector('a')), txt: pe?pe.textContent:'' }); }, 600);
}));
ok('sheet offers exact-product picker', sheet.link && /exact set or product/i.test(sheet.txt));
await pg.screenshot({ path: 'loops/site-redesign/proofs/hobby-sheet.png' });
await pg.evaluate(() => new Promise(res => { openHobby(); setTimeout(res,1500); }));
const flow = await pg.evaluate(() => ({ open: !document.getElementById('hobby').classList.contains('hidden'), eras: document.querySelectorAll('.hob-era').length }));
ok('picker opens the sets flow ('+flow.eras+' eras)', flow.open && flow.eras>=10);
await pg.screenshot({ path: 'loops/site-redesign/proofs/hobby-picker.png', fullPage: false });

// pick era -> set -> product; lock must survive back to the builder with the hobby store
await pg.evaluate(() => new Promise(res => { document.querySelector('.hob-era').click(); setTimeout(res,600); }));
await pg.evaluate(() => new Promise(res => { document.querySelector('.hob-set').click(); setTimeout(res,600); }));
await pg.evaluate(() => new Promise(res => { const p=document.querySelector('.hob-prod'); if(p)p.click(); setTimeout(res,700); }));
const lock = await pg.evaluate(() => ({ prod: typeof SEL_PRODUCT!=='undefined'?SEL_PRODUCT:'', builder: !document.getElementById('builder').classList.contains('hidden'), mode: MODE, store: SEL_STORE&&SEL_STORE.name }));
ok('product locked back on builder (hobby store kept)', !!lock.prod && lock.builder && /QA Cards/.test(lock.store||''));
console.log('   locked:', JSON.stringify(lock));

// empty state: tiny radius from a far point
const empty = await pg.evaluate(() => new Promise(res => {
  USER_LOC={lat:44.0,lng:-100.0}; setRadius(1);
  setTimeout(()=>{ res(document.getElementById('storelist').textContent); }, 1500);
}));
ok('hobby empty state message', /card shops within/i.test(empty));

// switching back to Retail refetches the normal slice (no lingering type filter)
const back = await pg.evaluate(() => new Promise(res => {
  USER_LOC={lat:34.15,lng:-118.64};
  const orig=window.fetch; let lastUrl='';
  window.fetch=(u,o)=>{ if(String(u).includes('/pub/stores/near')) lastUrl=String(u); return orig(u,o); };
  setMode('call');
  setTimeout(()=>{ window.fetch=orig; res(lastUrl); }, 1200);
}));
ok('back to Retail drops the type filter', back.length>0 && !/type=Hobby/.test(back));

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL HOBBY TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
