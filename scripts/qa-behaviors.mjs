// Owner-round behavior tests: rail dots, nav history, popups, buy sheet, watch flow, map pins, calendar page.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1');
});
const pg = await ctx.newPage();
const fails = [];
const ok = (name, cond) => { console.log((cond?'  ✓ ':'  ✗ ')+name); if(!cond) fails.push(name); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,100)); console.log('  ⚠ pageerror', String(e).slice(0,120)); });

for (let a=0;a<3;a++){ try{ await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}); break; }catch(e){ if(a===2) throw e; } }
await pg.waitForTimeout(600);

// ---- 1. RESULT: IVR call with menu steps + dots + stamp
const r1 = await pg.evaluate(() => new Promise(res => {
  PHONE_TOKEN='probe';
  SEL_STORE={id:1,name:'CVS Mulholland Drive'}; SEL_CATS=[railCatId()].filter(Boolean);
  LIVE_STEPS=[{n:1,label:'r',at:0},{n:2,label:'r2',at:2},{n:3,label:'c',at:6},{n:4,label:'menu',at:8},{n:5,label:'nav',at:14},{n:7,label:'p',at:21},{n:8,label:'ask',at:24}];
  LIVE_T0=Date.now()-38000;
  showResult({status:'completed',confirmed:false,storeName:'CVS Mulholland Drive',cats:['Pokémon'],ts:Date.now()-3600e3,durationSecs:38,
    transcript:'Clerk: Thank you for calling CVS. Press 1 for pharmacy.\nAgent: pressing...\nClerk: Front store, how can I help?\nAgent: quick question — any Pokémon cards in stock?\nClerk: no, we are out.'},'local:t1');
  setTimeout(()=>{
    const steps=[...document.querySelectorAll('.ctlv2-steps span')].filter(x=>!x.closest('span span')).map(x=>x.textContent.trim());
    const head=document.querySelector('.ctlv2 summary span');
    const cur=document.querySelector('.ctlv2-steps .cur');
    const term=document.querySelector('.ctl-term');
    const curDot=cur?getComputedStyle(cur,'::before').width:'none';
    const termDot=term?getComputedStyle(term,'::before').width:'none';
    const convoWord=[...document.querySelectorAll('#result div')].some(d=>d.textContent.trim()==='CONVERSATION');
    const sub=[...document.querySelectorAll('#result .foot,#result div')].map(d=>d.textContent).join(' ');
    res({ steps, header:head?head.textContent:'', curDot, termDot, convoWord,
      hasStamp:/\w{3} \d+ · \d+:\d{2}/.test(sub), menuShown:steps.some(t0=>/menu/i.test(t0)) });
  },900);
}));
ok('IVR menu steps shown', r1.menuShown);
ok('header has no ellipsis', !/…|\.\.\./.test(r1.header));
ok('asking-step rail dot', r1.curDot==='8px');
ok('verdict rail dot', r1.termDot==='10px');
ok('CONVERSATION word gone', !r1.convoWord);
ok('date/time stamp present', r1.hasStamp);
await pg.screenshot({ path: 'loops/site-redesign/proofs/behav-result-ivr.png', fullPage: true });

// ---- 2. ACCOUNT NAV: open -> earn -> back -> overview -> back -> closed
await pg.evaluate(() => { backToBuilder(); ACCOUNT={comp:true,credits:0}; openAccount(); });
await pg.waitForTimeout(300);
await pg.evaluate(() => acctTab('earn'));
await pg.waitForTimeout(200);
const navA = await pg.evaluate(() => ({ on: document.querySelector('#acctOverlay .tab.on')?.dataset.t, grabber: !!document.querySelector('#acctOverlay .acctv2head')?.innerHTML.includes('44px'), done: /Done/.test(document.querySelector('#acctOverlay .wash')?.textContent||'') }));
ok('earn tab active', navA.on==='earn');
ok('Done button gone', !navA.done);
await pg.goBack(); await pg.waitForTimeout(350);
const navB = await pg.evaluate(() => ({ on: document.querySelector('#acctOverlay .tab.on')?.dataset.t, open: document.getElementById('acctOverlay').classList.contains('on') }));
ok('back -> overview tab', navB.open && navB.on==='overview');
await pg.goBack(); await pg.waitForTimeout(350);
ok('back again -> sheet closed', await pg.evaluate(() => !document.getElementById('acctOverlay').classList.contains('on')));

// ---- 3. EARN popups: invite overlay + score popup
await pg.evaluate(() => { openAccount(); acctTab('earn'); });
await pg.waitForTimeout(300);
await pg.evaluate(() => acctInvitePanel(document.querySelector('#acctv2panel button')));
await pg.waitForTimeout(400);
const inv = await pg.evaluate(() => { const ov=document.getElementById('inviteOverlay'); return { open: ov&&ov.classList.contains('on'), copy: ov&&/COPY/i.test(ov.textContent), btns: ov?[...ov.querySelectorAll('button')].length:0 }; });
ok('invite overlay opens', inv.open && inv.copy && inv.btns>=4);
await pg.screenshot({ path: 'loops/site-redesign/proofs/behav-invite.png' });
await pg.evaluate(() => closeInvite());
await pg.evaluate(() => openScorePop());
await pg.waitForTimeout(300);
const sc = await pg.evaluate(() => { const ov=document.getElementById('scorePostOv'); return { open: ov&&ov.classList.contains('on'), hasComposer: !!ov.querySelector('#composer'), inputVisible: !!ov.querySelector('#succ_store') }; });
ok('score popup hosts composer', sc.open && sc.hasComposer && sc.inputVisible);
await pg.screenshot({ path: 'loops/site-redesign/proofs/behav-scorepop.png' });
await pg.evaluate(() => { closeScorePop(); });
ok('composer returns home on close', await pg.evaluate(() => { const c=document.getElementById('composer'); return !!c && !document.getElementById('scorePostHost')?.contains(c); }));

// ---- 4. ACTIVITY: week bars + arrows + tone filter; cal icon target renders a real calendar
await pg.evaluate(() => new Promise(res => {
  const now=Date.now(), catId=railCatId();
  const mk=(cid,d,extra)=>({cid,ts:now-d*86400e3,storeName:'Fun',storeId:1,categoryId:catId,category:BRAND.category,...extra});
  localStorage.setItem('runnr_history',JSON.stringify([mk('a1',0,{confirmed:true}),mk('a2',1,{confirmed:false}),mk('a3',2,{confirmed:true})]));
  HIST_CACHE=[]; acctTab('activity',true); setTimeout(res,400);
}));
const act = await pg.evaluate(() => {
  const p=document.getElementById('acctv2panel');
  return { title:/CHECKS THIS WEEK/i.test(p.textContent), arrows:[...p.querySelectorAll('button')].filter(b=>b.getAttribute('onclick')&&b.getAttribute('onclick').includes('actWeek')).length,
    dates:/\d+\/\d+/.test(p.textContent), calIcon: !!p.querySelector('a[onclick*="openHistory(true)"]') };
});
ok('activity: week title', act.title);
ok('activity: two week arrows', act.arrows===2);
ok('activity: dates under bars', act.dates);
ok('activity: calendar icon link', act.calIcon);
await pg.evaluate(() => actTone('in'));
await pg.waitForTimeout(250);
ok('stat click filters list', await pg.evaluate(() => /Showing/i.test(document.getElementById('acctv2panel').textContent)));
await pg.screenshot({ path: 'loops/site-redesign/proofs/behav-activity.png' });
await pg.evaluate(() => { actTone('in'); });

// the calendar landing (was "page with nothing on it")
await pg.evaluate(() => { closeAccount(); openHistory(true); });
await pg.waitForTimeout(700);
const calpg = await pg.evaluate(() => { const r=document.getElementById('result');
  return { shown: !r.classList.contains('hidden'), hasCal: !!r.querySelector('#todaycal .rcal-grid'), cells: r.querySelectorAll('#todaycal .rcal-d').length, emptyHidden: (r.querySelector('.emptybox')||{}).offsetParent===null || getComputedStyle(r.querySelector('.emptybox')).display==='none' }; });
ok('calendar page renders grid', calpg.shown && calpg.hasCal && calpg.cells>27);
ok('no-checks note hidden on cal path', calpg.emptyHidden);
await pg.screenshot({ path: 'loops/site-redesign/proofs/behav-calpage.png' });

// ---- 5. BUY SHEET: toggles, payg slider end-to-end, annual price, accent icons
await pg.evaluate(() => { backToBuilder(); openBuy(); });
await pg.waitForTimeout(400);
const buy1 = await pg.evaluate(() => { const bm=document.getElementById('buymode');
  return { toggles: !!bm, carved: bm?getComputedStyle(bm).boxShadow.includes('inset'):false,
    iconStroke: document.querySelector('#buy_grid svg')?.getAttribute('stroke')||'' }; });
ok('buy mode toggle carved', buy1.toggles && buy1.carved);
ok('grid icons use accent var', /var\(--accent/.test(buy1.iconStroke));
await pg.evaluate(() => setBuyMode('packs', document.querySelectorAll('#buymode button')[1]));
await pg.waitForTimeout(300);
const payg = await pg.evaluate(() => { const rng=document.querySelector('#buy_plans input[type=range]');
  if(!rng) return { rng:false };
  rng.value=rng.max; rng.dispatchEvent(new Event('input'));
  return { rng:true, max:rng.max, n:document.getElementById('payg_n').textContent, p:document.getElementById('payg_p').textContent }; });
ok('payg slider reaches the end (live /pub/plans: 100 checks)', payg.rng && payg.n.includes('100') && /\$60/.test(payg.p));
await pg.screenshot({ path: 'loops/site-redesign/proofs/behav-payg.png' });
const cont = await pg.evaluate(() => new Promise(res => {
  // buyContinue → openCheckout → /app/checkout-intent (401 in test) → hosted fallback POST /app/checkout {kind}
  const orig=window.fetch; let hit=null;
  window.fetch=(u,o)=>{ if(String(u).includes('/app/checkout')&&!String(u).includes('checkout-intent')&&o&&o.body){ try{hit=JSON.parse(o.body).kind;}catch(_){}} return orig(u,o); };
  buyContinue(); setTimeout(()=>{ window.fetch=orig; try{closeCheckout();}catch(_){}; res(hit); },700);
}));
ok('payg CONTINUE posts live payg:100 checkout', cont==='payg:100', cont);
await pg.evaluate(() => { setBuyMode('plans', document.querySelectorAll('#buymode button')[0]); setCycle(true, document.querySelectorAll('#billcycle button')[1]); });
await pg.waitForTimeout(250);
ok('annual Family $49.70 (live annualCents)', await pg.evaluate(() => document.querySelector('#buy_plans .plan .pp').textContent.includes('$49.70')));
await pg.evaluate(() => { setCycle(false, document.querySelectorAll('#billcycle button')[0]); closeBuy(); });

// ---- 6. WATCH: in-place confirmation, no toast
await pg.evaluate(() => { SEL_STORE={id:1,name:'Fun'}; SEL_CAT=railCatId(); openWatch&&openWatch(); });
await pg.waitForTimeout(250);
const wOpen = await pg.evaluate(() => !!document.getElementById('watchOverlay')?.classList.contains('on'));
if (wOpen) {
  await pg.evaluate(() => { document.getElementById('watch_contact').value='owner@test.com'; submitWatch(); });
  await pg.waitForTimeout(700);
  const w = await pg.evaluate(() => ({ sub: document.getElementById('watch_sub').textContent, inputGone: document.getElementById('watch_contact').style.display==='none', btn: document.getElementById('watch_btn').textContent, toast: document.getElementById('toast').classList.contains('show') }));
  ok('watch: inbox-verify message', /inbox/i.test(w.sub));
  ok('watch: input hidden + Done', w.inputGone && /Done/i.test(w.btn));
  ok('watch: no toast fired', !w.toast);
  await pg.screenshot({ path: 'loops/site-redesign/proofs/behav-watch.png' });
} else { ok('watch overlay opened', false); }

// ---- 7. MAP: logo pins
// Leaflet CDN is unreachable in this sandbox — verify the logo-pin branch statically instead.
const map = await pg.evaluate(() => String(renderMapPins).includes('s.logoUrl') && String(renderMapPins).includes('object-fit:contain'));
ok('map: logo-pin branch present (CDN blocked in sandbox; visual on staging)', map);

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL BEHAVIOR TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
