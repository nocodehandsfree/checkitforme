// Round-6 behavior tests: activity-return roundtrip, calendar system, bottom sheets, validation,
// footer, auto-checks-in-account, convo alignment, single terminus dot.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.route('**/app/me*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({credits:9999,comp:true,subscription:"active",subTier:"founder",quota:9999,payg:9999,premiumAsks:true,features:{exact_products:true,zone_sweeps:true,restock_alerts:true,scheduled_checks:true,any_town:true,store_holds:true,your_voice:true,thrift_hunts:true},callsMade:0,phone:"+15550000000",callerId:null,callerIdReady:false,catalog:{}}) })); // entitled account (all features) so gated modules render
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c) => { console.log((c?'  ✓ ':'  ✗ ')+n); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,90)); console.log('  ⚠', String(e).slice(0,120)); });
for (let a=0;a<3;a++){ try{ await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}); break; }catch(e){ if(a===2) throw e; } }
await pg.waitForTimeout(600);

// 1) convo alignment + single terminus dot
const r1 = await pg.evaluate(() => new Promise(res => {
  PHONE_TOKEN='probe'; SEL_STORE={id:1,name:'Fun'}; SEL_CATS=[railCatId()].filter(Boolean);
  LIVE_STEPS=[{n:1,label:'r',at:0},{n:3,label:'c',at:5},{n:7,label:'p',at:9},{n:8,label:'a',at:12}]; LIVE_T0=Date.now()-30000;
  showResult({status:'completed',confirmed:false,storeName:'Fun',cats:['Pokémon'],ts:Date.now()-500000,durationSecs:30,
    transcript:'Agent: got any Pokémon?\nClerk: no sorry'},'local:r6');
  setTimeout(()=>{
    const body=document.getElementById('convo_body');
    const d2=document.querySelector('.ctlv2-rail .d2');
    res({ pad:getComputedStyle(body).paddingLeft, d2:d2?getComputedStyle(d2).display:'gone' });
  },700);
}));
ok('convo bubbles left-aligned (pad 0)', r1.pad==='0px');
ok('rail bottom dot hidden (single status dot)', r1.d2==='none');

// 2) activity-return ROUNDTRIP (owner bug): acct -> activity -> open a check -> browser back -> activity tab
await pg.evaluate(() => new Promise(res => {
  const now=Date.now(), catId=railCatId();
  const mk=(cid,d,extra)=>({cid,ts:now-d*86400e3,storeName:'Fun',storeId:1,categoryId:catId,category:BRAND.category,...extra});
  localStorage.setItem('runnr_history',JSON.stringify([mk('rt1',0,{confirmed:true})]));
  sessionStorage.setItem('res:rt1',JSON.stringify({status:'completed',confirmed:true,storeName:'Fun',transcript:'Agent: hi\nClerk: yes'}));
  HIST_CACHE=[]; ACCOUNT={comp:true,credits:0}; backToBuilder(); openAccount(); acctTab('activity'); setTimeout(res,500);
}));
await pg.evaluate(() => { const btn=[...document.querySelectorAll('#acctv2panel button')].find(x=>(x.getAttribute('onclick')||'').includes('openHistEntry')); btn.click(); });
await pg.waitForTimeout(800);
const mid = await pg.evaluate(() => ({ res: !document.getElementById('result').classList.contains('hidden'), acct: document.getElementById('acctOverlay').classList.contains('on') }));
ok('check opened from activity (sheet closed)', mid.res && !mid.acct);
await pg.goBack(); await pg.waitForTimeout(600);
const rt = await pg.evaluate(() => ({ open: document.getElementById('acctOverlay').classList.contains('on'), tab: document.querySelector('#acctOverlay .tab.on')?.dataset.t }));
ok('back returns to ACTIVITY tab', rt.open && rt.tab==='activity');
if (!(rt.open && rt.tab==='activity')) console.log('   rt state:', JSON.stringify(rt), 'url:', await pg.evaluate(()=>location.search), 'histstate:', await pg.evaluate(()=>JSON.stringify(history.state)));

// 3) auto-checks live in the account overview (not on home)
const sched = await pg.evaluate(() => new Promise(res => {
  window.SCHEDS=[{id:9,store:'Barnes & Noble Calabasas',category:'Pokémon',daysOfWeek:'4',timeLocal:'10:00'}];
  acctTab('overview',true);
  setTimeout(()=>{ const host=document.getElementById('acctScheds');
    res({ has: !!host && /Barnes & Noble Calabasas/.test(host.textContent) && /Pokémon/.test(host.textContent) && /Cancel/.test(host.textContent),
      home: getComputedStyle(document.getElementById('schedCard')).display }); },400);
}));
ok('auto-checks block in overview w/ product', sched.has);
await pg.screenshot({ path: 'loops/site-redesign/proofs/r6-acct-scheds.png' });

// 4) bottom sheet: acct modal anchored to bottom + slides
const sheet = await pg.evaluate(() => { const ov=document.getElementById('acctOverlay'), m=ov.querySelector('.modal');
  return { align:getComputedStyle(ov).alignItems, radius:getComputedStyle(m).borderTopLeftRadius, w:Math.round(m.getBoundingClientRect().width), vw:innerWidth }; });
ok('acct sheet bottom-anchored full-width', sheet.align==='flex-end' && sheet.w===sheet.vw && sheet.radius==='28px');

// 5) calendar page: no Done, day dots + sched dashed rings, big cells
await pg.evaluate(() => { closeAccount(); openHistory(true); });
await pg.waitForTimeout(700);
const cal = await pg.evaluate(() => { const r=document.getElementById('result');
  const done=/Done/.test((r.querySelector('div')||{}).textContent||'');
  const hasCell=r.querySelector('#todaycal .rcal-d.has');
  const dot=hasCell?getComputedStyle(hasCell,'::after').display:'none';
  const schCell=r.querySelector('#todaycal .rcal-d.schday');
  const dashed=schCell?getComputedStyle(schCell).borderStyle:'none';
  const cellH=hasCell?Math.round(hasCell.getBoundingClientRect().height):0;
  const cta=r.querySelector('.todaywrap>.cta');
  return { done, dot, dashed, cellH, ctaW: cta?Math.round(cta.getBoundingClientRect().width):0, vw:innerWidth };
});
ok('calendar: Done gone', !cal.done);
ok('calendar: per-day status dot removed (owner 07-04)', cal.dot==='none');
ok('calendar: sched day dashed ring', cal.dashed==='dashed');
ok('calendar: big cells (46px)', cal.cellH===46);
ok('calendar: CTA no longer full-width', cal.ctaW>0 && cal.ctaW < cal.vw*0.8);
await pg.screenshot({ path: 'loops/site-redesign/proofs/r6-calendar.png', fullPage: true });

// 6) store-request empty submit highlights the field, no red word
await pg.evaluate(() => { backToBuilder(); openStoreReq(); });
await pg.waitForTimeout(300);
await pg.evaluate(() => submitStoreReq());
await pg.waitForTimeout(200);
const v = await pg.evaluate(() => ({ marked: document.getElementById('sr_name').classList.contains('fld-err'), err: document.getElementById('sr_err').textContent.trim(),
  border: getComputedStyle(document.getElementById('sr_name')).borderStyle }));
ok('empty submit -> field dashed-red, no error word', v.marked && v.err==='' && v.border==='dashed');
await pg.screenshot({ path: 'loops/site-redesign/proofs/r6-validation.png' });
await pg.evaluate(() => closeStoreReq());

// 7) footer: logo + socials on one line, bottom row hidden
const foot = await pg.evaluate(() => { const meta=document.querySelector('.foot-meta');
  return { logoInMeta: !!meta.querySelector('#footMark'), botHidden: getComputedStyle(document.querySelector('.foot-bottom')).display==='none',
    socialRight: getComputedStyle(meta.querySelector('.foot-social')).marginLeft!=='0px' }; });
ok('footer: logo beside socials, two lines total', foot.logoInMeta && foot.botHidden);
await pg.screenshot({ path: 'loops/site-redesign/proofs/r6-footer.png' });

// 8) referral copy pulls the runtime number
const refc = await pg.evaluate(async () => { POLICY.referralChecks=1; openAccount(); acctTab('earn',true);
  await new Promise(r=>setTimeout(r,300));
  acctInvitePanel(document.querySelector('#acctv2panel button'));
  await new Promise(r=>setTimeout(r,400));
  const ov=document.getElementById('inviteOverlay');
  return ov?ov.textContent:''; });
ok('referral copy says 1 free check', /1 free check(?!s)/.test(refc));

// 9) sched modal media block (body under the title, not the icon)
const sm = await pg.evaluate(() => { closeInvite(); closeAccount(); SEL_STORE={id:1,name:'Fun'}; SEL_CAT=railCatId(); openSchedule();
  const ico=document.getElementById('schIco').getBoundingClientRect();
  const body=document.querySelector('#scheduleOverlay p');
  return { bodyLeft: Math.round(body.getBoundingClientRect().left), icoRight: Math.round(ico.right) }; });
ok('sched body indented past the icon', sm.bodyLeft >= sm.icoRight);
await pg.screenshot({ path: 'loops/site-redesign/proofs/r6-sched.png' });

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL ROUND-6 TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
