// Price-hunt scaffold (owner item 3, "get ahead"): the verdict price line + cross-store
// cheapest-first "Prices found" panel. Populates from a completed check's o.priceCents (backend field
// pending — see PRICE_CONTRACT). Hidden until a real quote exists; lights up cheapest-first with BEST on
// the lowest IN-STOCK store the moment priceCents ships. Runs against the local server on :8797.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c,e) => { console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':(e?'  — '+e:''))); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,110)); console.log('  ⚠', String(e).slice(0,140)); });
await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(500);

// 1) NO price today → verdict shows no price line / panel (invisible, zero regression)
const none = await pg.evaluate(() => {
  try{ localStorage.removeItem('cifm_pricehunt'); }catch(_){}
  PRICE_HUNT={};
  SEL_STORE={id:1,name:'Fun'};
  showResult({status:'completed',confirmed:true,storeName:'Fun',productName:'ETB',cats:['Pokémon'],ts:Date.now(),transcript:'Agent: got ETB?\nClerk: yes, $60'}, 'p1');
  return { priceLine: !!document.querySelector('.rprice'), panel: !!document.querySelector('.ph-panel') };
});
ok('no priceCents → no price line (hidden)', !none.priceLine);
ok('no priceCents → no Prices-found panel (hidden)', !none.panel);

// 2) results WITH priceCents across 3 stores → panel appears, cheapest-first, BEST on lowest in-stock
const shown = await pg.evaluate(() => {
  PRICE_HUNT={};
  SEL_STORE={id:10,name:'Card Shop A'};
  showResult({status:'completed',confirmed:true,storeName:'Card Shop A',storeId:10,productName:'ETB',cats:['Pokémon'],priceCents:6499,ts:Date.now()}, 'a');
  SEL_STORE={id:11,name:'Card Shop B'};
  showResult({status:'completed',confirmed:true,storeName:'Card Shop B',storeId:11,productName:'ETB',cats:['Pokémon'],priceCents:5499,ts:Date.now()}, 'b');
  SEL_STORE={id:12,name:'Card Shop C'};
  showResult({status:'completed',confirmed:false,storeName:'Card Shop C',storeId:12,productName:'ETB',cats:['Pokémon'],priceCents:4999,ts:Date.now()}, 'c'); // cheapest but OUT of stock
  const rows=[...document.querySelectorAll('.ph-panel .ph-row')].map(r=>({ txt:r.querySelector('.ph-st').textContent.trim(), price:r.querySelector('.ph-pr').textContent.trim(), best:r.classList.contains('best') }));
  const priceLine=document.querySelector('.rprice')?document.querySelector('.rprice').textContent.trim():'';
  return { rows, priceLine };
});
ok('panel renders 3 store rows', shown.rows.length===3, JSON.stringify(shown.rows));
ok('sorted: in-stock first, cheapest in-stock on top', shown.rows[0].txt.includes('Card Shop B') && /\$54\.99/.test(shown.rows[0].price));
ok('BEST tag on cheapest IN-STOCK (not the $49.99 OOS)', shown.rows[0].best && shown.rows[0].txt.includes('BEST') && !shown.rows.find(r=>/Card Shop C/.test(r.txt)).best);
ok('OOS store still listed, marked out', shown.rows.some(r=>/Card Shop C/.test(r.txt)&&/out/i.test(r.txt)));
ok('verdict price line shows the quote', /They quoted/.test(shown.priceLine) && /\$49\.99/.test(shown.priceLine), shown.priceLine);
await pg.screenshot({ path: 'loops/site-redesign/proofs/prices-found.png', fullPage: false });

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL PRICE-SCAFFOLD TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
