// Hobby HUNT-FIRST flow tests (owner 2026-07-03): tap Hobby -> "What are you hunting?" era picker
// FIRST (switcher stays visible), era -> set -> product, THEN the hobby store list, then call.
// Requires the local throwaway DB seeded with a Hobby chain: run scripts/qa-hobby-seed.ts first.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c) => { console.log((c?'  ✓ ':'  ✗ ')+n); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,90)); console.log('  ⚠', String(e).slice(0,120)); });

await pg.goto('http://localhost:8797/pokemon?skin=off',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(500);
ok('v1: no hobby chip', await pg.evaluate(() => !document.querySelector('.modetab[data-mode="hobby"]')));

await pg.goto('http://localhost:8797/needoh?skin=v2',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(700);
ok('needoh v2: no hobby chip', await pg.evaluate(() => !document.querySelector('.modetab[data-mode="hobby"]')));

await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(700);
ok('pokemon v2: chip order call,hobby,thrift,kiosk', await pg.evaluate(() => [...document.querySelectorAll('.modetab')].map(x=>x.dataset.mode).join(','))==='call,hobby,thrift,kiosk');

const hunt = await pg.evaluate(() => new Promise(res => {
  setMode('hobby');
  setTimeout(()=>{ res({
    huntmode: document.body.classList.contains('huntmode'),
    eras: document.querySelectorAll('#hobby .hob-era').length,
    switcherVisible: (()=>{ const t=document.getElementById('modetabs'); return !!t && t.getBoundingClientRect().height>0; })(),
    hobbyOn: document.querySelector('.modetab.on')?.dataset.mode,
    findbodyHidden: getComputedStyle(document.getElementById('findbody')).display==='none',
    storeListShown: [...document.querySelectorAll('#storelist .store')].length,
  }); }, 1500);
}));
ok('tap Hobby -> HUNT picker first (era screen)', hunt.eras>=10);
ok('tap Hobby -> NOT a store list', hunt.storeListShown===0);
ok('hunt: switcher STILL visible', hunt.switcherVisible && hunt.hobbyOn==='hobby');
ok('hunt: body.huntmode on, findbody hidden', hunt.huntmode && hunt.findbodyHidden);
await pg.screenshot({ path: 'loops/site-redesign/proofs/hobby-hunt-first.png', fullPage: true });

await pg.evaluate(() => new Promise(res => { document.querySelector('#hobby .hob-era').click(); setTimeout(res,700); }));
ok('era -> sets ("What are you hunting?")', await pg.evaluate(() => document.querySelectorAll('#hobby .hob-set').length>=3 && /hunting/i.test(document.getElementById('hobby').textContent)));
await pg.evaluate(() => new Promise(res => { document.querySelector('#hobby .hob-set').click(); setTimeout(res,700); }));
ok('set -> products', await pg.evaluate(() => document.querySelectorAll('#hobby .hob-prod').length>=3));

const afterLock = await pg.evaluate(() => new Promise(res => {
  window.isClosed=()=>false; USER_LOC={lat:34.15,lng:-118.64};
  document.querySelector('#hobby .hob-prod').click();
  setTimeout(()=>{ res({
    prod: typeof SEL_PRODUCT!=='undefined'?SEL_PRODUCT:'',
    huntmode: document.body.classList.contains('huntmode'),
    hobbyHidden: document.getElementById('hobby').classList.contains('hidden'),
    lockBanner: (()=>{ const l=document.getElementById('hoblockbar'); return !!l && l.style.display!=='none' && /HUNTING/i.test(l.textContent); })(),
    stores: [...document.querySelectorAll('#storelist .store')].length,
    findstep: document.getElementById('findstep').textContent, mode: MODE,
  }); }, 1800);
}));
ok('product locked -> exits hunt, shows shop list', !afterLock.huntmode && afterLock.hobbyHidden && afterLock.mode==='hobby');
ok('locked-product banner over the shop list', afterLock.lockBanner);
ok('shop list renders after lock ('+afterLock.stores+')', afterLock.stores>=2);
ok('find-step says "pick a card shop"', /card shop/i.test(afterLock.findstep));
await pg.screenshot({ path: 'loops/site-redesign/proofs/hobby-shop-list.png', fullPage: true });

ok('SHOP PRICES tag on non-MSRP shops', await pg.evaluate(() => [...document.querySelectorAll('#storelist .store')].some(r=>/SHOP PRICES/i.test(r.textContent))));

const sheet = await pg.evaluate(() => new Promise(res => {
  const st=STORES.find(x=>/QA Cards/.test(x.name)); pickStore(st.id);
  setTimeout(()=>{ const pe=document.getElementById('cs_prod'); res({ txt: pe?pe.textContent:'', keeps: (SEL_STORE&&SEL_STORE.name)||'' }); }, 600);
}));
ok('pick shop -> call sheet carries the locked product', /Booster|ETB|Bundle|Collection|Blister|Tin|Box/i.test(sheet.txt) && /QA Cards/.test(sheet.keeps));

const back = await pg.evaluate(() => new Promise(res => {
  setMode('call');
  setTimeout(()=>{ res({
    huntmode: document.body.classList.contains('huntmode'),
    findbodyShown: getComputedStyle(document.getElementById('findbody')).display!=='none',
    banner: (()=>{ const l=document.getElementById('hoblockbar'); return l?l.style.display:'gone'; })(),
  }); }, 600);
}));
ok('back to Retail: huntmode off, findbody shown, banner hidden', !back.huntmode && back.findbodyShown && back.banner==='none');

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL HOBBY HUNT-FIRST TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
