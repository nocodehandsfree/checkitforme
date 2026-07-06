// Owner 07-06: the Hobby era picker is redesigned — a search box + a 2-col grid of era BUTTON-CARDS
// (set-logo imagery kept, but tappable cards you can filter, not a wall of big page logos). Typing a set
// name/code surfaces the era that holds it. Also checks the footer-page sheet pins its header (title
// stays while the body scrolls). Mock feed; no seeded DB needed.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.route('**/app/me*', r => r.fulfill({ contentType:'application/json', body: JSON.stringify({credits:9999,comp:true,subscription:'active',subTier:'founder',features:{exact_products:true},phone:'+15550000000'}) }));
const FEED = { eras: [
  { era:'Scarlet & Violet', code:'sv', years:'2023–2025', slug:'scarlet-violet', logo:'/logos/eras/scarlet-violet.png', sets:[
    { code:'sv3.5', name:'151', release:'2023-09-22', logoKey:'sv3-5', logo:'', banner:'', products:[] },
    { code:'sv08', name:'Surging Sparks', release:'2024-11-08', logoKey:'sv08', logo:'', banner:'', products:[] } ] },
  { era:'Sword & Shield', code:'swsh', years:'2020–2022', slug:'sword-shield', logo:'/logos/eras/sword-shield.png', sets:[
    { code:'swsh12', name:'Silver Tempest', release:'2022-11-11', logoKey:'swsh12', logo:'', banner:'', products:[] } ] },
  { era:'Sun & Moon', code:'sm', years:'2017–2019', slug:'sun-moon', logo:'/logos/eras/sun-moon.png', sets:[
    { code:'sm12', name:'Cosmic Eclipse', release:'2019-11-01', logoKey:'sm12', logo:'', banner:'', products:[] } ] },
] };
await ctx.route('**/pub/pokemon-sets', r => r.fulfill({ contentType:'application/json', body: JSON.stringify(FEED) }));
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c) => { console.log((c?'  ✓ ':'  ✗ ')+n); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,90)); console.log('  ⚠', String(e).slice(0,120)); });
for (let a=0;a<3;a++){ try{ await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}); break; }catch(e){ if(a===2) throw e; } }
await pg.waitForTimeout(500);
await pg.evaluate(() => { USER_LOC={lat:34.15,lng:-118.63}; });

// Open Hobby → the redesigned era picker.
await pg.evaluate(() => openHobby());
await pg.waitForTimeout(700);
const base = await pg.evaluate(() => ({
  hasSearch: !!document.getElementById('hobEraSearch'),
  cards: document.querySelectorAll('#hobEraGrid .hob-erabtn').length,
  twoCol: getComputedStyle(document.getElementById('hobEraGrid')).gridTemplateColumns.split(' ').length===2,
  hasImagery: !!document.querySelector('#hobEraGrid .hob-erabtn img'),
  firstName: (document.querySelector('#hobEraGrid .hob-erabtn')||{}).getAttribute&&document.querySelector('#hobEraGrid .hob-erabtn').getAttribute('aria-label'),
}));
ok('era picker renders a search box', base.hasSearch);
ok('eras render as button-cards (one per era)', base.cards===3);
ok('cards laid out 2-across', base.twoCol);
ok('imagery (era logos) present on the cards', base.hasImagery);
ok('newest era is first', /Scarlet/.test(base.firstName||''));

// Filter by a SET name that lives inside an era → only that era shows.
const f1 = await pg.evaluate(() => new Promise(res => {
  const inp=document.getElementById('hobEraSearch'); inp.value='surging sparks'; hobEraFilter();
  setTimeout(()=>{ const vis=[...document.querySelectorAll('#hobEraGrid .hob-eracell')].filter(c=>c.style.display!=='none').map(c=>c.querySelector('.hob-erabtn').getAttribute('aria-label')); res(vis); },150);
}));
ok('search a set name surfaces only its era', f1.length===1 && /Scarlet/.test(f1[0]));

// Filter by a set CODE.
const f2 = await pg.evaluate(() => new Promise(res => {
  const inp=document.getElementById('hobEraSearch'); inp.value='swsh12'; hobEraFilter();
  setTimeout(()=>{ const vis=[...document.querySelectorAll('#hobEraGrid .hob-eracell')].filter(c=>c.style.display!=='none').map(c=>c.querySelector('.hob-erabtn').getAttribute('aria-label')); res(vis); },150);
}));
ok('search a set code surfaces only its era', f2.length===1 && /Sword/.test(f2[0]));

// No match → the empty-state note shows, and clearing restores all.
const f3 = await pg.evaluate(() => new Promise(res => {
  const inp=document.getElementById('hobEraSearch'); inp.value='zzzznope'; hobEraFilter();
  setTimeout(()=>{ const none=getComputedStyle(document.getElementById('hobEraNone')).display!=='none';
    inp.value=''; hobEraFilter();
    setTimeout(()=>{ const vis=[...document.querySelectorAll('#hobEraGrid .hob-eracell')].filter(c=>c.style.display!=='none').length; res({none, vis}); },120); },150);
}));
ok('no-match shows the empty note', f3.none);
ok('clearing the search restores all eras', f3.vis===3);

// Tapping an era card advances to the set grid (existing flow intact).
const toSets = await pg.evaluate(() => new Promise(res => {
  document.querySelector('#hobEraGrid .hob-erabtn').click();
  setTimeout(()=>res({ sets: document.querySelectorAll('#hobby .hob-set').length, step: (typeof HUNT_STEP!=='undefined')?HUNT_STEP:'' }), 500);
}));
ok('tap era → set grid renders', toSets.sets>=1 && toSets.step==='sets');

// Footer-page sheet: title pinned (flex header), body is the scroll container.
const sheet = await pg.evaluate(() => new Promise(res => {
  openPage('faq');
  setTimeout(()=>{ const m=document.querySelector('#pageOverlay .modal'); const body=document.getElementById('pg_body');
    res({ flexCol: getComputedStyle(m).flexDirection==='column', modalHidden: getComputedStyle(m).overflowY==='hidden', bodyScrolls: getComputedStyle(body).overflowY==='auto' }); }, 500);
}));
ok('page sheet is a flex column (pinned header)', sheet.flexCol);
ok('modal itself does not scroll', sheet.modalHidden);
ok('only the body scrolls (title stays put)', sheet.bodyScrolls);

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL HOBBY-ERA + SHEET TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
