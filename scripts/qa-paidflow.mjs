// Paid-flow E2E (owner item 2/4 + DevOps prompt): plans sheet renders LIVE /pub/plans (4 tiers,
// EVERY PLAN GETS grid, PAYG ladder, annual prices), then the BRANDED 6c Stripe-Elements checkout
// sheet (intent → Payment Element styled to comp → confirmPayment redirect:if_required → poll /app/me),
// plus the hosted-redirect fallback when no on-page intent exists. Stripe.js + intent are stubbed so the
// happy path runs without live Stripe keys. Real card-4242 verify happens on staging.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
const pg = await ctx.newPage();
const fails = [];
const ok = (n,c,extra) => { console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':(extra?'  — '+extra:''))); if(!c) fails.push(n); };
pg.on('pageerror', e => { fails.push('pageerror: '+String(e).slice(0,110)); console.log('  ⚠', String(e).slice(0,140)); });

await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(500);

// ---- Part 1: plans sheet renders from LIVE /pub/plans ----
const plans = await pg.evaluate(async () => {
  await loadPlans();
  ACCOUNT={credits:0, subscription:'none', features:{}, callsMade:0};
  openBuy('out');
  await new Promise(r=>setTimeout(r,300));
  const tiles=[...document.querySelectorAll('#buy_plans .plan')].map(p=>({ name:p.querySelector('.pn')?.textContent.replace(/most popular/,'').trim(), price:p.querySelector('.pp')?.textContent.trim() }));
  const grid=[...document.querySelectorAll('#buy_grid .buygrid .g')].map(g=>g.textContent.trim());
  return { tiles, grid, plansLoaded: (typeof PLANS!=='undefined' && !!(PLANS&&PLANS.tiers)) };
});
ok('PLANS loaded from /pub/plans', plans.plansLoaded);
ok('4 live tiers rendered', plans.tiles.length===4, JSON.stringify(plans.tiles));
ok('tier names = Family/Collector/Hunter/Operator', plans.tiles.map(t=>t.name).join(',')==='Family,Collector,Hunter,Operator', plans.tiles.map(t=>t.name).join(','));
ok('monthly prices live ($4.99…$49.99)', /\$4\.99/.test(plans.tiles[0].price) && /\$49\.99/.test(plans.tiles[3].price), plans.tiles.map(t=>t.price).join(' | '));
ok('EVERY PLAN GETS grid = 8 live features', plans.grid.length===8, JSON.stringify(plans.grid));
ok('grid carries live labels (Exact products, Thrift hunts)', plans.grid.some(x=>/Exact products/i.test(x)) && plans.grid.some(x=>/Thrift hunts/i.test(x)));

// ---- annual toggle shows annualCents ----
const annual = await pg.evaluate(async () => {
  const btn=[...document.querySelectorAll('#billcycle button')][1]; setCycle(true,btn);
  await new Promise(r=>setTimeout(r,150));
  return [...document.querySelectorAll('#buy_plans .plan .pp')].map(p=>p.textContent.trim());
});
ok('annual prices live ($49.70 family, $497.90 operator)', /\$49\.70/.test(annual[0]) && /\$497\.90/.test(annual[3]), annual.join(' | '));
await pg.evaluate(()=>{ const btn=[...document.querySelectorAll('#billcycle button')][0]; setCycle(false,btn); });

// ---- PAYG ladder is live ----
const payg = await pg.evaluate(async () => {
  const btn=[...document.querySelectorAll('#buymode button')][1]; setBuyMode('packs',btn);
  await new Promise(r=>setTimeout(r,150));
  const ticks=[...document.querySelectorAll('#buy_plans span')].map(s=>s.textContent.trim()).filter(x=>/^\d+$/.test(x));
  return { ticks, n: document.getElementById('payg_n')?.textContent };
});
ok('PAYG ladder live (10,25,50,75,100)', ['10','25','50','75','100'].every(x=>payg.ticks.includes(x)), JSON.stringify(payg.ticks));

// ---- Part 2: branded checkout sheet (stub Stripe + intent for the happy path) ----
const co = await pg.evaluate(async () => {
  // stub Stripe.js
  window.__peReady=false; window.__confirmArgs=null;
  window.Stripe=(pk)=>({ __pk:pk,
    elements:(opts)=>({ __cs:opts.clientSecret,
      create:(type,o)=>({ mount:(el)=>{ el.innerHTML='<div id="fakePE">card fields</div>'; }, on:(ev,cb)=>{ if(ev==='ready') setTimeout(()=>{window.__peReady=true;cb();},10); } }) }),
    confirmPayment:async(args)=>{ window.__confirmArgs=args; return {}; } // success, no error
  });
  // intercept the intent + me
  const orig=window.fetch;
  window.fetch=(u,o)=>{ const s=String(u);
    if(s.includes('/app/checkout-intent')) return Promise.resolve(new Response(JSON.stringify({mode:'subscription',clientSecret:'cs_test_123',publishableKey:'pk_test_abc',amountCents:999}),{headers:{'content-type':'application/json'}}));
    if(s.includes('/app/me')) return Promise.resolve(new Response(JSON.stringify({credits:30,subscription:'active',subTier:'collector',quota:30,payg:0,features:{exact_products:true},comp:false,callsMade:0}),{headers:{'content-type':'application/json'}}));
    return orig(u,o); };
  // back to plans, pick Collector, continue
  const btn=[...document.querySelectorAll('#buymode button')][0]; setBuyMode('plans',btn);
  await new Promise(r=>setTimeout(r,120));
  pickTier('collector');
  await new Promise(r=>setTimeout(r,120));
  buyContinue();
  await new Promise(r=>setTimeout(r,400)); // intent fetch + PE mount + ready
  const open=document.getElementById('coOverlay').classList.contains('on');
  const plan=document.getElementById('co_plan').textContent;
  const price=document.getElementById('co_price').textContent;
  const ctaLabel=document.getElementById('co_cta_label').textContent;
  const ctaDisabled=document.getElementById('co_cta').disabled;
  const peMounted=!!document.getElementById('fakePE');
  return { open, plan, price, ctaLabel, ctaDisabled, peMounted, peReady:window.__peReady };
});
ok('checkout sheet opens on Continue', co.open);
ok('summary shows Collector plan', /Collector/.test(co.plan), co.plan);
ok('summary price $9.99', /\$9\.99/.test(co.price), co.price);
ok('CTA label = SUBSCRIBE · $9.99/mo', /Subscribe/i.test(co.ctaLabel) && /\$9\.99/.test(co.ctaLabel) && /\/mo/.test(co.ctaLabel), co.ctaLabel);
ok('Payment Element mounted (styled to comp)', co.peMounted);
ok('CTA enabled after Element ready', co.peReady && !co.ctaDisabled);
await pg.screenshot({ path: 'loops/site-redesign/proofs/checkout-6c.png', fullPage: false });

// ---- confirm the payment → confirmPayment called + success path ----
const done = await pg.evaluate(async () => {
  confirmCheckout();
  await new Promise(r=>setTimeout(r,2200)); // confirm + poll
  return { confirmed: !!window.__confirmArgs, redirectMode: window.__confirmArgs?.redirect,
    returnUrl: window.__confirmArgs?.confirmParams?.return_url,
    coClosed: !document.getElementById('coOverlay').classList.contains('on') };
});
ok('confirmPayment called with redirect:if_required', done.confirmed && done.redirectMode==='if_required', JSON.stringify(done));
ok('return_url = origin/?paid=1', /\/\?paid=1$/.test(done.returnUrl||''), done.returnUrl);
ok('checkout sheet closes on success', done.coClosed);

// ---- fallback: intent unavailable → hosted redirect (buy) ----
const fb = await pg.evaluate(async () => {
  const orig=window.fetch; let hostedCalled=false;
  window.fetch=(u,o)=>{ const s=String(u);
    if(s.includes('/app/checkout-intent')) return Promise.resolve(new Response(JSON.stringify({error:'checkout_unavailable'}),{status:400,headers:{'content-type':'application/json'}}));
    if(s.includes('/app/checkout')){ hostedCalled=true; return Promise.resolve(new Response(JSON.stringify({}),{headers:{'content-type':'application/json'}})); }
    return orig(u,o); };
  openCheckout('family', false, 499, 'Family · monthly', '15 checks a month');
  await new Promise(r=>setTimeout(r,500));
  window.fetch=orig;
  return { hostedCalled };
});
ok('intent-unavailable → hosted-redirect fallback', fb.hostedCalled);

console.log(fails.length ? ('FAILURES: '+fails.join(' | ')) : 'ALL PAID-FLOW TESTS PASS');
await b.close();
process.exit(fails.length?1:0);
