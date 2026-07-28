import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
const S='/tmp/claude-0/-home-user-checkitforme/32c95da3-a3de-5297-b557-c45e6611db3a/scratchpad/';
const PAGE=readFileSync(S+'site.html');
// EXACTLY what /pub/plans now ships (verified above by running publicPlans).
const PLANS={features:[
 {key:'zone_sweeps',label:'Zone sweeps',labelEs:'Barridos de zona'},
 {key:'restock_alerts',label:'Restock alerts',labelEs:'Alertas de reabastecimiento'},
 {key:'scheduled_checks',label:'Auto checks',labelEs:'Verificaciones programadas'},
 {key:'any_town',label:'Any town',labelEs:'Cualquier ciudad'},
 {key:'store_holds',label:'Store holds',labelEs:'Apartados en tienda'},
 {key:'your_voice',label:'Your voice',labelEs:'Tu voz'},
 {key:'thrift_hunts',label:'Thrift hunts',labelEs:'Cacerías thrift'},
 {key:'hobby_hunts',label:'Hobby hunts',labelEs:'Cacerías de tiendas de cartas'}],
 everyPlanGets:['zone_sweeps','restock_alerts','scheduled_checks','any_town','thrift_hunts','hobby_hunts'],
 tiers:[{key:'family',name:'Family',monthlyCents:499,annualCents:4970,checksPerMonth:20,premiumAsks:true,features:{zone_sweeps:1,restock_alerts:1,scheduled_checks:1,any_town:1,thrift_hunts:1,hobby_hunts:1}},
        {key:'collector',name:'Collector',monthlyCents:999,annualCents:9950,checksPerMonth:50,premiumAsks:true,features:{zone_sweeps:1,restock_alerts:1,scheduled_checks:1,any_town:1,thrift_hunts:1,hobby_hunts:1}}],
 payg:[{checks:10,cents:990}]};
const srv=createServer((req,r)=>{ const p=req.url.split('?')[0]; const J=o=>{r.writeHead(200,{'content-type':'application/json'});r.end(JSON.stringify(o));};
  if(p==='/pub/plans') return J(PLANS);
  if(p.startsWith('/pub/')||p.startsWith('/api/')) return J({});
  if(!(p==='/'||p.endsWith('.html'))){ r.writeHead(404); return r.end(''); }
  r.writeHead(200,{'content-type':'text/html'}); r.end(PAGE); });
await new Promise(res=>srv.listen(4610,'127.0.0.1',res));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,locale:'es-ES'});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await p.addInitScript(()=>localStorage.setItem('runnr_lang','es'));
await p.goto('http://127.0.0.1:4610/',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500);
console.log('boot: lang=', await p.evaluate(()=>document.documentElement.lang), ' plans loaded=', await p.evaluate(()=>{try{return !!PLANS}catch(e){return 'unreachable'}}));
console.log('the six tiles:', JSON.stringify(await p.evaluate(()=>{try{return ((PLANS&&PLANS.everyPlanGets)||[]).map(k=>featLabel(k))}catch(e){return ['ERR: '+e.message]}})));


// open the real sheet and read the rendered grid + a pop-up title
await p.evaluate(()=>{ try{ openBuy&&openBuy(); }catch(e){ try{ document.getElementById('buyOverlay').classList.add('on'); renderBuyPlans(); renderBuyGrid(); }catch(_){} } });
await p.waitForTimeout(1200);
console.log('grid on screen:', JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('#buyOverlay .g')].map(d=>d.textContent.trim()))));
await p.evaluate(()=>{ try{ openFeatInfo('zone_sweeps'); }catch(e){} }); await p.waitForTimeout(800);
console.log('pop-up title  :', JSON.stringify(await p.evaluate(()=>{const h=document.querySelector('#featInfo h3')||[...document.querySelectorAll('h3')].pop(); return h?h.textContent.trim():null;})));
await p.screenshot({path:S+'ES-plans.png',fullPage:false});
console.log(errs.length?errs.join('\n'):'no js errors');
await b.close(); srv.close();
