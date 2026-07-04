// God View Plans editor (app.html): per-tier feature matrix render + toggle (owner 2026-07-04).
// Admin unchecks a feature for a tier → savePlansDraft POSTs features → server persists → /pub/plans +
// /app/me reflect it → the consumer app hides that module. Runs against the local apex admin app on :8797.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const pg = await (await b.newContext()).newPage();
const fails=[]; const ok=(n,c,e)=>{console.log((c?'  ✓ ':'  ✗ ')+n+(c?'':'  — '+(e||'')));if(!c)fails.push(n);};
pg.on('pageerror', e=>{fails.push('pageerror '+String(e).slice(0,100));console.log('  ⚠',String(e).slice(0,130));});
// block the debounced save network call so the const api isn't invoked for real
await pg.route('**/api/admin/plans', r => r.fulfill({ contentType:'application/json', body:'{}' }));
await pg.goto('http://localhost:8797/',{waitUntil:'domcontentloaded',timeout:20000}).catch(()=>{});
await pg.waitForTimeout(500);
const res = await pg.evaluate(() => {
  if(typeof renderPlans!=='function' || typeof featMatrix!=='function') return {noFn:true};
  PLANS = {
    features:[{key:'exact_products',label:'Exact products'},{key:'scheduled_checks',label:'Scheduled checks'},{key:'thrift_hunts',label:'Thrift hunts'}],
    tiers:[{key:'family',name:'Family',monthlyCents:499,annualCents:4970,checksPerMonth:15,premiumAsks:true,sync:'in_sync',features:{exact_products:true,scheduled_checks:false,thrift_hunts:true}}],
    payg:{bundles:[{checks:10,cents:990,sync:'in_sync'}]}
  };
  if(!document.getElementById('plans_root')){ const d=document.createElement('div'); d.id='plans_root'; document.body.appendChild(d); }
  renderPlans();
  const root=document.getElementById('plans_root');
  const boxes=[...root.querySelectorAll('input[type=checkbox]')];
  const schedBox=boxes.find(x=>(x.getAttribute('onchange')||'').includes("scheduled_checks"));
  const hasMatrix=/FEATURES IN THIS TIER/.test(root.textContent);
  const schedChecked = schedBox ? schedBox.checked : null;
  const exactBox=boxes.find(x=>(x.getAttribute('onchange')||'').includes("exact_products"));
  if(schedBox){ schedBox.checked=true; schedBox.dispatchEvent(new Event('change')); }
  return { hasMatrix, boxCount:boxes.length, schedChecked, exactChecked: exactBox?exactBox.checked:null, plansSched: PLANS.tiers[0].features.scheduled_checks, noPremiumAsksLabel: !/Premium asks/.test(root.textContent) };
});
ok('editor exposes renderPlans + featMatrix', !res.noFn);
ok('tier card renders the FEATURES matrix', res.hasMatrix);
ok('a checkbox per feature (3)', res.boxCount===3, 'got '+res.boxCount);
ok('scheduled_checks renders UNCHECKED (stored false)', res.schedChecked===false);
ok('exact_products renders CHECKED (stored true)', res.exactChecked===true);
ok('toggling a feature updates PLANS.tiers[].features', res.plansSched===true);
ok('redundant "Premium asks" checkbox removed', res.noPremiumAsksLabel);
console.log(fails.length?('FAILURES: '+fails.join(' | ')):'ALL ADMIN-EDITOR TESTS PASS');
await b.close(); process.exit(fails.length?1:0);
