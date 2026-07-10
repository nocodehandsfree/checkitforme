// Owner 07-05: the rotating finds banner (a) drops in-stock finds older than 2 days (restock "coming
// Tuesday" notices are exempt), and (b) hides the owner's test stores (Fun/MVP) on PRODUCTION only —
// they're fine on staging/localhost. Runs against the no-seed :8797 server.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c) => { console.log((c?'  ✓ ':'  ✗ ')+n); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,90)); console.log('  ⚠', String(e).slice(0,120)); });
for (let a=0;a<3;a++){ try{ await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}); break; }catch(e){ if(a===2) throw e; } }
await pg.waitForTimeout(500);

// Unit-check the helpers.
const helpers = await pg.evaluate(() => ({
  testFun: isTestStore('Fun'), testMvp: isTestStore('MVP Store'), testFunCity: isTestStore('Fun Calabasas'),
  notFunko: isTestStore('Funko HQ'), notTarget: isTestStore('Target'),
  prodHost: isProdHost(), // false on localhost
}));
ok('isTestStore matches Fun', helpers.testFun);
ok('isTestStore matches "MVP Store"', helpers.testMvp);
ok('isTestStore matches "Fun Calabasas"', helpers.testFunCity);
ok('isTestStore does NOT match Funko HQ', !helpers.notFunko);
ok('isTestStore does NOT match Target', !helpers.notTarget);
ok('isProdHost false on localhost', !helpers.prodHost);

// Feed the banner a mixed set and inspect what renders. On localhost (non-prod) Fun/MVP stay; the only
// thing dropped is the 3-day-old in-stock find. The old restock is kept (forward-looking).
const nowS = Math.floor(Date.now()/1000);
const feed = [
  { store:'Target Calabasas', category:'Pokémon', at: nowS-3600 },              // fresh in-stock -> keep
  { store:'Walmart Woodland Hills', category:'Pokémon', at: nowS-3*24*3600 },   // 3d old in-stock -> DROP
  { store:'GameStop Topanga', category:'Pokémon', at: nowS-5*24*3600, type:'restock' }, // old restock -> keep
  { store:'Fun', category:'Pokémon', at: nowS-1800 },                           // test store, non-prod -> keep
  { store:'MVP', category:'Pokémon', at: nowS-1800 },                           // test store, non-prod -> keep
];
const local = await pg.evaluate((f) => {
  NAV_VIEW='builder'; BRAND_CAT=null;
  renderFindsBanner(f);
  return [...document.querySelectorAll('#finds .tick')].map(n=>n.textContent).slice(0,5).join(' || ');
}, feed);
ok('fresh in-stock shown', /Target Calabasas/.test(local));
ok('3-day-old in-stock DROPPED', !/Walmart Woodland Hills/.test(local));
ok('old restock KEPT (forward-looking)', /GameStop Topanga/.test(local));
ok('Fun test store shown on localhost (non-prod)', /Fun/.test(local));
ok('MVP test store shown on localhost (non-prod)', /MVP/.test(local));

// Now simulate PRODUCTION by stubbing isProdHost() true, re-render: Fun/MVP must vanish.
const prod = await pg.evaluate((f) => {
  window.isProdHost = () => true;
  renderFindsBanner(f);
  return [...document.querySelectorAll('#finds .tick')].map(n=>n.textContent).join(' || ');
}, feed);
ok('prod hides Fun test store', !/\bFun\b/.test(prod));
ok('prod hides MVP test store', !/\bMVP\b/.test(prod));
ok('prod still shows a real store (Target)', /Target Calabasas/.test(prod));

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL FINDS-BANNER TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
