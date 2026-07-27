// zones-preview — drive the My Zones flow headless on a LOCAL server and screenshot every screen.
// Why local: headless Chromium cannot reach staging over HTTPS in a Claude session (see GOTCHAS).
// Boot the server first:
//   STAGING=1 PORT=8795 COMP_PHONES="+18185550142" DATABASE_URL=file:/tmp/zp.db \
//     ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test \
//     ./node_modules/.bin/tsx src/server.ts
// Then: node scripts/zones-preview.mjs   (screenshots land in ./shots/)
// Store/zone data is Playwright route-stubbed so the flow works on an empty throwaway DB.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
mkdirSync('shots',{recursive:true});
const BASE='http://127.0.0.1:8795';
const PHONE='+18185550142';
const ck=await fetch(BASE+'/auth/phone/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:PHONE,code:'000000'})});
const j=await ck.json();
console.log('login',ck.status,j.token?'TOKEN OK':JSON.stringify(j).slice(0,150));
if(!j.token){ await fetch(BASE+'/auth/phone/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:PHONE})}); const c2=await fetch(BASE+'/auth/phone/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:PHONE,code:'000000'})}); const j2=await c2.json(); if(!j2.token){console.log('FAIL login',JSON.stringify(j2).slice(0,150)); process.exit(1);} j.token=j2.token; }

// canned stores around Pacoima (deg offsets ≈ miles/69)
const C={lat:34.2647,lng:-118.4210};
const mk=(id,name,city,dmi,extra={})=>({id,name,location:city,lat:C.lat+dmi/69,lng:C.lng,phone:'+18180000000',...extra});
const STORES=[
 mk(1,'Food 4 Less N Pacoima','Pacoima, CA',0.2),
 mk(2,'Costco Pacoima','Pacoima, CA',0.6),
 mk(3,"Pacoima Lowe's",'Pacoima, CA',-0.6),
 mk(4,'CVS Van Nuys Blvd','Pacoima, CA',0.9),
 mk(5,'Office Depot Sylmar','Sylmar, CA',1.2,{openState:{known:true,open:false}}),
 mk(6,'GameStop San Fernando','San Fernando, CA',1.4),
 mk(7,'Vons Glenoaks','San Fernando, CA',-1.5),
 mk(8,'Target Sylmar','Sylmar, CA',2.2),
 mk(9,'Walmart Panorama City','Panorama City, CA',-3.1),
 mk(10,'Barnes & Noble Northridge','Northridge, CA',4.8),
];
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
await ctx.route('**/pub/stores/near*',r=>r.fulfill({json:{stores:STORES}}));
const ZONE={id:1,name:'Pacoima run',checkCount:7,stores:STORES.slice(0,7).map(s=>({retailerId:s.id,name:s.name,location:s.location,lat:s.lat,lng:s.lng}))};
await ctx.route('**/app/zones',r=>{ if(r.request().method()==='GET') r.fulfill({json:{zones:[ZONE]}}); else r.continue(); });
await ctx.route('**/app/zones/1',r=>{ if(r.request().method()==='GET') r.fulfill({json:ZONE}); else r.continue(); });
await ctx.route('**/app/zones/1/check',r=>r.fulfill({json:{runId:77,name:'Pacoima run'}}));
await ctx.route('**/app/zones/run/77',r=>r.fulfill({json:{name:'Pacoima run',done:3,total:7,results:[
 {name:'Food 4 Less N Pacoima',statusKey:'in_stock',confirmed:true},
 {name:'Costco Pacoima',statusKey:'no_stock',confirmed:false},
 {name:"Pacoima Lowe's",statusKey:'no_answer'},
 {name:'CVS Van Nuys Blvd',statusKey:'in_progress'},
 {name:'GameStop San Fernando',statusKey:''},
 {name:'Vons Glenoaks',statusKey:''},
 {name:'Target Sylmar',statusKey:''}]}}));
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('PAGEERR',String(e.message).slice(0,160)));
await page.goto(BASE+'/pokemon',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(1500);
await page.evaluate(([tok,loc])=>{ localStorage.setItem('cifm_token',tok); localStorage.setItem('runnr_authed','1'); localStorage.setItem('cifm_loc',loc); },[j.token,JSON.stringify({lat:C.lat,lng:C.lng,ts:9999999999999})]);
await page.reload({waitUntil:'domcontentloaded'});
for(let i=0;i<20;i++){ const ok=await page.evaluate(()=>typeof openZones).catch(()=>'e'); if(ok==='function') break; await page.waitForTimeout(800); }
await page.waitForTimeout(1500);
await page.screenshot({path:'shots/L1-home.png'});
await page.evaluate(()=>openZones());
await page.waitForTimeout(1800);
await page.screenshot({path:'shots/L2-list.png'});
await page.evaluate(async()=>{ USER_LOC={lat:34.2647,lng:-118.4210}; await zoneNew(); });
await page.waitForTimeout(1500);
await page.waitForTimeout(1500);
await page.screenshot({path:'shots/L3-create.png'});
const n=await page.evaluate(()=>{ const rows=[...document.querySelectorAll('#zones .zlist .zpick')]; rows.slice(0,7).forEach(r=>r.click()); return rows.length; });
console.log('rows',n);
await page.waitForTimeout(900);
await page.screenshot({path:'shots/L4-picked.png'});
await page.evaluate(()=>{ const sc=document.querySelector('#zones .zf-scroll'); if(sc) sc.scrollTop=sc.scrollHeight; });
await page.waitForTimeout(600);
await page.screenshot({path:'shots/L5-scrolled.png'});
// back to the zones list (stubbed: one zone with 7 stores)
await page.evaluate(()=>renderZonesList());
await page.waitForTimeout(1500);
await page.screenshot({path:'shots/L6-list-card.png'});
// kebab actions menu (bottom sheet now)
await page.evaluate(()=>{ const k=document.querySelector('#zones .zc-kebab'); if(k) k.click(); });
await page.waitForTimeout(1200);
await page.screenshot({path:'shots/L7-menu.png'});
await page.evaluate(()=>zPopClose());
await page.waitForTimeout(400);
// check-this-zone confirm
const conf=await page.evaluate(()=>{ const b=[...document.querySelectorAll('#zones .zc-go')]; if(b.length){ b[0].click(); return true; } return false; });
await page.waitForTimeout(1800);
if(conf) await page.screenshot({path:'shots/L8-confirm.png'});
// go through: run report screen
await page.evaluate(()=>{ const g=document.getElementById('zca_go'); if(g) g.click(); });
await page.waitForTimeout(2500);
await page.screenshot({path:'shots/L8b-report.png'});
// edit stores from the kebab
await page.evaluate(()=>{ zoneStopPoll(); renderZonesList(); });
await page.waitForTimeout(1000);
await page.evaluate(()=>{ const k=document.querySelector('#zones .zc-kebab'); if(k) k.click(); });
await page.waitForTimeout(800);
await page.evaluate(()=>{ const btns=[...document.querySelectorAll('#zmenuOv button')]; const b=btns.find(x=>/Edit stores/.test(x.textContent)); if(b) b.click(); });
await page.waitForTimeout(2000);
await page.screenshot({path:'shots/L8c-editstores.png'});
// check history sheet
await page.evaluate(()=>{ try{ backFromZones(); }catch(_){} });
await page.waitForTimeout(800);
await page.evaluate(()=>{ try{ openHistory(); }catch(e){ try{ renderHistoryView(); }catch(_){} } });
await page.waitForTimeout(1500);
await page.screenshot({path:'shots/L9-history.png'});
// tap the Check history row on My checks
await page.evaluate(()=>{ try{ openHistory(); }catch(e){ console.log('openHistory err',e.message); } });
await page.waitForTimeout(2000);
const hgeo=await page.evaluate(()=>{ const sup=document.getElementById('supTab'); return {histOn:!!document.querySelector('#histOverlay.on'), supDisp:sup?getComputedStyle(sup).display:null}; });
console.log('HIST',JSON.stringify(hgeo));
await page.screenshot({path:'shots/L10-history.png'});
const geo=await page.evaluate(()=>{ const r=e=>{ if(!e) return null; const b=e.getBoundingClientRect(); const cs=getComputedStyle(e); return {t:Math.round(b.top),b:Math.round(b.bottom),l:Math.round(b.left),r:Math.round(b.right),vis:cs.visibility+'/'+cs.display}; };
  const sup=document.querySelector('#suptab,.suptab,#support,[class*=suplaunch]');
  return { vh:innerHeight, modal:r(document.querySelector('#zones .modal')), scroll:r(document.querySelector('#zones .zf-scroll')),
    basket:r(document.querySelector('#zBasket')), save:r(document.querySelector('#z_save')), chips:r(document.querySelector('#zChips')),
    lastRow:r([...document.querySelectorAll('#zones .zlist .zpick')].pop()), padB:document.querySelector('#zones .zf-scroll')?.style.paddingBottom,
    supSel:sup?sup.id||sup.className:null, sup:r(sup), body:document.body.className };
});
console.log(JSON.stringify(geo));
await browser.close();
