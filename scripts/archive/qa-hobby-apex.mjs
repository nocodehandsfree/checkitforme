import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844} });
await ctx.route('**/app/me*', r=>r.fulfill({contentType:'application/json',body:JSON.stringify({credits:9999,comp:true,subscription:'active',subTier:'founder',features:{exact_products:true,thrift_hunts:true},phone:'+13106662331'})}));
await ctx.addInitScript(()=>{ localStorage.setItem('cifm_skin','v2'); localStorage.setItem('cifm_token','probe'); localStorage.setItem('runnr_authed','1'); });
const pg = await ctx.newPage();
const fails=[]; const ok=(n,c)=>{console.log((c?'  ✓ ':'  ✗ ')+n); if(!c)fails.push(n);};
pg.on('pageerror',e=>{fails.push('pageerror');console.log('  ⚠',String(e).slice(0,110));});
await pg.goto('http://localhost:8797/pokemon?skin=v2',{waitUntil:'networkidle',timeout:20000});
await pg.waitForTimeout(1200);
// Simulate the APEX brand exactly: key 'runner', category 'Pokémon'. Re-run the chip logic.
const r = await pg.evaluate(async ()=>{
  BRAND.key='runner'; BRAND.category='Pokémon';           // apex shape
  const ex=document.querySelector('.modetab[data-mode="hobby"]'); if(ex) ex.remove(); // clear so we test insertion fresh
  ensureModeChips();
  await new Promise(z=>setTimeout(z,100));
  return { key:BRAND.key, cat:BRAND.category, hobby:!!document.querySelector('.modetab[data-mode="hobby"]'), chips:[...document.querySelectorAll('.modetab')].map(x=>x.dataset.mode) };
});
console.log(`  apex-shape: key=${r.key} category=${r.cat} chips=${JSON.stringify(r.chips)}`);
ok('Hobby shows on apex brand (key=runner, category=Pokémon)', r.hobby);
// And confirm openHobby actually opens (not brand-blocked) on the apex shape
const opened = await pg.evaluate(async ()=>{ try{ await openHobby(); }catch(e){ return 'err:'+e.message; } await new Promise(z=>setTimeout(z,600)); return document.querySelectorAll('#hobEraGrid .hob-erabtn').length; });
ok('openHobby renders the era picker on apex shape', typeof opened==='number' && opened>=1);
console.log(fails.length?('FAIL: '+fails.join(', ')):'ALL APEX-SHAPE HOBBY TESTS PASS');
await b.close(); process.exit(fails.length?1:0);
