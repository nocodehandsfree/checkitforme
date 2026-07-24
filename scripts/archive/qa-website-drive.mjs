// qa-website-drive — drives the consumer site like a REAL USER against a LOCAL staging-mode server
// and asserts the invariants the owner keeps catching by hand:
//   1. every verdict status renders RESULT pill + date/time + headline + sub, no mid-sentence wraps
//   2. a ts-less reopened call still shows its date (history fallback)
//   3. the Alerts sheet: instant cache paint, real rows, Mute pauses server-side, Stop removes + pill,
//      no mid-sentence wraps in EN or ES
// Run: 1) STAGING=1 PORT=8795 COMP_PHONES="+13105550177" DATABASE_URL=file:/tmp/qa.db \
//         ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test npx tsx src/server.ts
//      2) node scripts/qa-website-drive.mjs   (screenshots land in ./shots)
// Headless Chromium can't TLS to staging through the egress proxy — always drive a local server
// (or the loopback bridge) at the same commit. See docs/shared/GOTCHAS.md.
import { chromium } from '/home/user/checkitforme/node_modules/playwright-core/index.mjs';
const BASE='http://127.0.0.1:8795';
await fetch(BASE+'/auth/phone/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:'+13105550177'})});
const j=await (await fetch(BASE+'/auth/phone/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:'+13105550177',code:'000000'})})).json();
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
const page=await (await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true})).newPage();
page.on('pageerror',e=>console.log('PAGEERR',String(e.message).slice(0,200)));
await page.goto(BASE+'/pokemon',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1000);
await page.evaluate(t=>{ localStorage.setItem('cifm_token',t); localStorage.setItem('runnr_authed','1'); },j.token);
await page.reload({waitUntil:'domcontentloaded'});
for(let i=0;i<20;i++){ const ok=await page.evaluate(()=>typeof showResult).catch(()=>'e'); if(ok==='function') break; await page.waitForTimeout(700); }
await page.waitForTimeout(1200);

// ── STATUS AUDIT: every status must show RESULT pill + date/time + title + sub
const CASES=[
  ['in_stock',      {status:'completed',confirmed:true,statusKey:'in_stock',productDetail:'Tin · Scarlet and Violet',transcript:'Staff: yes'}],
  ['not_in_stock',  {status:'completed',confirmed:false,statusKey:'not_in_stock',transcript:'Staff: no'}],
  ['sold_out',      {status:'completed',soldOut:true,statusKey:'sold_out',transcript:'Staff: gone'}],
  ['does_not_sell', {status:'completed',doesNotSell:true,statusKey:'does_not_sell',transcript:'Staff: nope'}],
  ['restock_soon',  {status:'completed',confirmed:false,shipmentDay:'tuesday',transcript:'Staff: tuesday'}],
  ['no_answer',     {status:'no_answer'}],
  ['voicemail',     {status:'voicemail'}],
  ['busy',          {status:'busy'}],
  ['ivr_stuck',     {status:'ivr_stuck'}],
  ['bad_number',    {status:'bad_number'}],
  ['closed',        {status:'closed'}],
  ['failed',        {status:'failed'}],
  ['unclear',       {status:'completed',transcript:'Agent: any Pokémon in stock today?\nStaff: mumble'}],
];
let fails=0;
for(const [name,o] of CASES){
  await page.evaluate(([nm,oo])=>{ SEL_STORE={id:1,name:'Fun',location:'x',logoUrl:null}; showResult(Object.assign({ts:Date.now()},oo),'aud:'+nm); },[name,o]);
  await page.waitForTimeout(350);
  const r=await page.evaluate(()=>({ pill:!!document.querySelector('.rpill'), when:!!document.querySelector('.rwhen'),
    title:(document.querySelector('.rtitle2')||{}).textContent||'', sub:!!document.querySelector('.rsub'),
    midwrap:[...document.querySelectorAll('.rsub span')].some(s=>{const lh=parseFloat(getComputedStyle(s.parentElement).fontSize)*1.5; return s.getBoundingClientRect().height>lh+4;}) }));
  const ok=r.pill&&r.when&&r.title&&r.sub&&!r.midwrap;
  if(!ok) fails++;
  console.log((ok?'ok ':'FAIL '), name, JSON.stringify(r));
}
// ts-less payload + saved history → date still shows (the reopened-call hole)
await page.evaluate(()=>{ try{ const h=JSON.parse(localStorage.getItem('runnr_history')||'[]'); h.unshift({cid:'conv_x1',ts:Date.now()-3600000,status:'completed',confirmed:true}); localStorage.setItem('runnr_history',JSON.stringify(h)); }catch(_){}
  showResult({status:'completed',confirmed:true,statusKey:'in_stock',transcript:'Staff: yes'},'conv_x1'); });
await page.waitForTimeout(350);
console.log('TSLESS-REOPEN when:', await page.evaluate(()=>!!document.querySelector('.rwhen')));

// ── ALERTS: create a real sub via API, then mute + stop end-to-end
await page.evaluate(()=>appApi('/app/alerts/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'restock',retailerId:1,categoryId:1,productLabel:'cards',channel:'email',lang:'en'})}));
await page.waitForTimeout(600);
await page.evaluate(()=>{ backToBuilder(); openAccount(); });
await page.waitForTimeout(900); // prefetch fires on openAccount
const t0=Date.now();
await page.evaluate(()=>openAlerts());
const instant=await page.evaluate(()=>!!document.querySelector('#alertsList > div'));
console.log('ALERTS instant-paint (cache):', instant);
await page.waitForTimeout(700);
console.log('ROWS', await page.evaluate(()=>[...document.querySelectorAll('#alertsList > div')].map(r=>r.innerText.replace(/\n/g,' | '))));
const rowWrap=()=>page.evaluate(()=>[...document.querySelectorAll('#alertsList span span')].some(s=>{const lh=parseFloat(getComputedStyle(s.parentElement).fontSize)*1.6; return s.getBoundingClientRect().height>lh+4;}));
console.log('ROW-MIDWRAP en:', await rowWrap());
await page.evaluate(()=>{ LANG='es'; window.__alertsPaint(ALERTS_ME); });
await page.waitForTimeout(200);
console.log('ROW-MIDWRAP es:', await rowWrap());
await page.evaluate(()=>{ LANG='en'; window.__alertsPaint(ALERTS_ME); });
await page.waitForTimeout(200);
await page.screenshot({path:'shots/A1-alerts-mutestop.png'});
// mute
await page.evaluate(()=>{ const b=[...document.querySelectorAll('#alertsList button')].find(x=>x.textContent==='Mute'); b.click(); });
await page.waitForTimeout(900);
console.log('MUTED row:', await page.evaluate(()=>(document.querySelector('#alertsList > div')||{}).innerText.replace(/\n/g,' | ')));
console.log('MUTED pill:', await page.evaluate(()=>{const t=document.querySelector('#toast,.toast'); return t?t.textContent.trim():'(no toast el found)';}));
await page.screenshot({path:'shots/A2-muted.png'});
// server actually muted? fanout check via /app/alerts/me
console.log('SERVER muted:', await page.evaluate(async()=>{ const r=await appApi('/app/alerts/me'); return r.subscriptions[0].muted; }));
// unmute then stop
await page.evaluate(()=>{ const b=[...document.querySelectorAll('#alertsList button')].find(x=>x.textContent==='Unmute'); b.click(); });
await page.waitForTimeout(800);
await page.evaluate(()=>{ const b=[...document.querySelectorAll('#alertsList button')].find(x=>x.textContent==='Stop'); b.click(); });
await page.waitForTimeout(900);
console.log('AFTER-STOP list:', await page.evaluate(()=>document.getElementById('alertsList').innerText.trim()));
console.log('STOP pill:', await page.evaluate(()=>{const t=document.querySelector('#toast,.toast'); return t?t.textContent.trim():'(no toast el)';}));
await page.screenshot({path:'shots/A3-stopped.png'});
console.log('AUDIT FAILS:', fails);
await browser.close();
