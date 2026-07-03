// Thrift chip tests (owner 2026-07-03, item 8): Thrift = the retail call flow filtered to thrift stores
// via the server-side type=Thrift filter — NO product picker, NO huntmode. Chip shows for ALL v2 brands.
// Requires the local throwaway DB seeded with a Thrift chain: run scripts/qa-thrift-seed.ts first.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c) => { console.log((c?'  ✓ ':'  ✗ ')+n); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,90)); console.log('  ⚠', String(e).slice(0,120)); });

// v1: no thrift chip
await pg.goto('http://localhost:8797/pokemon?skin=off',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(500);
ok('v1: no thrift chip', await pg.evaluate(() => !document.querySelector('.modetab[data-mode="thrift"]')));

// needoh v2: thrift chip present (all brands), NO hobby chip (cards-only)
await pg.goto('http://localhost:8797/needoh?skin=v2',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(700);
ok('needoh v2: thrift chip present (all brands)', await pg.evaluate(() => !!document.querySelector('.modetab[data-mode="thrift"]')));
ok('needoh v2: still NO hobby chip', await pg.evaluate(() => !document.querySelector('.modetab[data-mode="hobby"]')));

// pokemon v2: chip order call,hobby,thrift,kiosk
await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(700);
const order = await pg.evaluate(() => [...document.querySelectorAll('.modetab')].map(x=>x.dataset.mode).join(','));
ok('pokemon v2: order call,hobby,thrift,kiosk ('+order+')', order==='call,hobby,thrift,kiosk');

// click Thrift -> fetch carries type=Thrift, NOT huntmode, stores render, findstep says thrift
const thr = await pg.evaluate(() => new Promise(res => {
  USER_LOC={lat:34.15,lng:-118.63};
  window.isClosed=()=>false;
  const orig=window.fetch; let tUrl='';
  window.fetch=(u,o)=>{ if(String(u).includes('/pub/stores/near')) tUrl=String(u); return orig(u,o); };
  setMode('thrift');
  setTimeout(()=>{ window.fetch=orig;
    const rows=[...document.querySelectorAll('#storelist .store')];
    res({ tUrl, rows: rows.length, hunt: document.body.classList.contains('huntmode'),
      step: document.getElementById('findstep').textContent,
      onChip: document.querySelector('.modetab.on')?.dataset.mode,
      hobbyHidden: document.getElementById('hobby')?document.getElementById('hobby').classList.contains('hidden'):true }); }, 1800);
}));
ok('thrift fetch carries type=Thrift', /type=Thrift/.test(thr.tUrl));
ok('thrift: no huntmode (retail flow)', !thr.hunt);
ok('thrift: hobby picker stays hidden', thr.hobbyHidden);
ok('thrift stores render ('+thr.rows+')', thr.rows>=2);
ok('thrift find-step says thrift store', /thrift/i.test(thr.step));
ok('thrift chip active', thr.onChip==='thrift');
await pg.screenshot({ path: 'loops/site-redesign/proofs/thrift-list.png', fullPage: false });

// empty state from a far point
const empty = await pg.evaluate(() => new Promise(res => {
  USER_LOC={lat:44.0,lng:-100.0}; setRadius(1);
  setTimeout(()=>{ res(document.getElementById('storelist').textContent); }, 1500);
}));
ok('thrift empty-state message', /thrift stores within/i.test(empty));

// back to Retail drops the type filter
const back = await pg.evaluate(() => new Promise(res => {
  USER_LOC={lat:34.15,lng:-118.63};
  const orig=window.fetch; let lastUrl='';
  window.fetch=(u,o)=>{ if(String(u).includes('/pub/stores/near')) lastUrl=String(u); return orig(u,o); };
  setMode('call');
  setTimeout(()=>{ window.fetch=orig; res(lastUrl); }, 1200);
}));
ok('back to Retail drops type filter', back.length>0 && !/type=Thrift/.test(back) && !/type=Hobby/.test(back));

// reload persistence: cifm_mode=thrift restores the thrift chip active
await pg.evaluate(() => { try{ localStorage.setItem('cifm_mode','thrift'); }catch(e){} });
await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(900);
ok('reload restores thrift mode', await pg.evaluate(() => MODE==='thrift' && document.querySelector('.modetab.on')?.dataset.mode==='thrift'));

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL THRIFT TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
