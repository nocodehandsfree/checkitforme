// _preview.mjs <section-id> <out.png> [width] — renders the REAL app.html with stubbed API data.
import { chromium } from '@playwright/test';
const [section, out, width] = process.argv.slice(2);

const FIX = {
  '/api/admin/overview': { today:{ calls:24, confirms:15 }, week:{ calls:118, confirms:41 }, month:{ calls:302, confirms:97 }, days:[12,15,9,18,13,20,24], chainStats:[] },
  '/api/admin/metrics': { revenueCents:41200, profitCents:14000, marginPct:34, mrrCents:9900, cogs:{totalCents:27200}, callsMade:118, users:52, subscribers:11, marginPct_:34 },
  '/api/admin/restock-intel': { totals:{ confirms:41, confirmRate:35, checks:118, confirms7d:9, confirms30d:32 },
    answerFunnel:{ dialed:118, reachedHuman:73, gotAnswer:64, firstCall:1751000000, buckets:{in_stock:38,got_some:6,not_in:20,reached_no_answer:9,never_reached:45}, byChain:[{chain:'Target',dialed:24,reached:21},{chain:'GameStop',dialed:18,reached:12},{chain:'Walmart',dialed:16,reached:7}] },
    shipmentDays:[{day:'Tuesday',n:14},{day:'Friday',n:9},{day:'Thursday',n:7},{day:'Wednesday',n:6},{day:'Monday',n:5}],
    productForms:[{form:'Booster packs',n:22},{form:'Tins',n:9},{form:'Blisters',n:6}],
    productSets:[{set:'Prismatic Evolutions',n:11},{set:'Surging Sparks',n:6},{set:'OP-09',n:4}],
    byCategory:[{category:'Pokémon',n:29},{category:'One Piece',n:8},{category:'Topps',n:4}],
    topStores:[{id:11,store:'Target Glendale',location:'Glendale',confirms:9,bestDay:'Tue'},{id:13,store:'GameStop Burbank',location:'Burbank',confirms:6,bestDay:'Thu'},{id:14,store:'Hobby Planet',location:'Glendale',confirms:5,bestDay:'Fri'}] },
  '/api/credits': { remaining:31000, limit:100000 },
  '/api/admin/call-timing': { aggregate:{ calls:40, avgTalkSec:80, avgNavSec:108, avgCallSec:150, totalMinutes:100 }, byModel:[{model:'Charlie',type:'direct',n:22,avgNavSec:42,avgTalkSec:70,avgCallSec:120}], byStatus:[], byStore:[{name:'Target Glendale',n:6,avgTalkSec:75,avgNavSec:40,avgCallSec:118}] },
  '/api/admin/pulse': { funnel:{ leads:9, signups:3, paying:4, members:11, revenueCents:41200 }, activity:{ checks:24, checks24h:24, confirms:15, avgTalkSec:80, avgCallSec:150 }, community:{ watches:14, kioskReports:3, posts:1, postsPending:0, newLeads7d:5 }, statsSince:null },
  '/api/admin/call-health': { real:118, seed:12, rehearsal:6, firstReal:'2026-06-01', dialed:118, reached:73 },
  '/api/policy': { flags:{ liveListen:true }, pricing:{ perCallCents:25, minPurchaseCents:500, freeChecks:1 }, rewards:{ kioskRefreshChecks:1, referralChecks:3, storeAddChecks:1 }, finds:{ headstartMin:10 }, bail:{} },
  '/api/settings': { vt_workflows: JSON.stringify([
      {name:'Friendly Sam', voices:['v1'], openers:['Heyy! checking if you got any {category} in?','Hi there! quick one, any {category} cards on the shelf today?','Yo! any {category} restocks lately?'], persona:'Casual Sam', lane:'charlie'},
      {name:'Direct Dana', voices:['v2'], openers:['Hi, do you have {category} in stock?','Quick question, any {category} available?'], persona:'', lane:'charlie'},
      {name:'Hobby Shop Casual', voices:['v1','v2'], openers:['Hey! you guys get any {category} in this week?'], persona:'Homie', lane:'delta'},
    ]), vt_default_workflow:'Friendly Sam',
    vt_opener_library: JSON.stringify([{text:'Hi! Do you have any {category} in stock right now?',on:true},{text:'Hey, quick check: any {category} on shelves?',on:true},{text:'Old opener we retired',on:false}]) },
  '/api/voices': { voices:[{id:'v1',name:'Sam',cloned:true},{id:'v2',name:'Dana',cloned:true},{id:'v3',name:'Branson',cloned:true}], active:'v1' },
  '/api/admin/workflow-assignments': { 'Direct Dana': { chains:[{name:'Target'},{name:'GameStop'}], stores:[] }, 'Hobby Shop Casual': { chains:[], stores:[{name:'Hobby Planet',location:'Glendale'}] } },
  '/api/categories': [ {id:1,label:'Pokémon'}, {id:2,label:'One Piece TCG'}, {id:3,label:'Topps NBA'} ],
  '/api/admin/trainer/list': (()=>{ const mk=(type,n,m)=>Array.from({length:n},(_,i)=>({type,navStatus:i<m?'locked':'unmapped',navType:'keypad'})); return { chains:[...mk('Big box',26,24),...mk('Grocery',38,31),...mk('Pharmacy',18,18),...mk('Hardware',14,9),...mk('Hobby',20,19),...mk('Thrift',15,11)] }; })(),
  '/api/chains': [
    { id:1, name:'Academy Sports', tier:5, navStatus:'locked', stores:{n:42}, type:'Big box' },
    { id:2, name:'Ace Hardware', tier:4, navStatus:'locked', stores:{n:63}, type:'Hardware' },
    { id:3, name:'CVS Pharmacy', tier:5, navStatus:'locked', stores:{n:51}, logoUrl:'/logos/brand/check-icon.png', type:'Pharmacy' },
    { id:4, name:'Aldi', tier:3, navStatus:'locked', stores:{n:118}, type:'Grocery' },
    { id:5, name:'Acme Markets', tier:null, navStatus:null, muted:true, stores:{n:12}, type:'Grocery' },
    { id:6, name:"Gelson's Market", tier:null, navStatus:null, stores:{n:27}, type:'Grocery' },
    { id:7, name:'Walmart', tier:2, navStatus:'locked', stores:{n:204}, type:'Big box' },
  ],
  '/api/admin/plans': { tiers:[
    {key:'family',name:'Family',monthlyCents:499,checksPerMonth:20},
    {key:'collector',name:'Collector',monthlyCents:999,checksPerMonth:50},
    {key:'hunter',name:'Hunter',monthlyCents:1999,checksPerMonth:125},
    {key:'operator',name:'Operator',monthlyCents:4999,checksPerMonth:400},
  ], payg:{ bundles:[{checks:10,cents:990},{checks:25,cents:1999},{checks:50,cents:3499},{checks:75,cents:4799},{checks:100,cents:6000}] } },
  '/api/admin/store-intel': { total:101967, callable:84210, states:50, chains:212, byProduct:{'Pokemon':64890,'One Piece':22140,'Topps':18730,'NeeDoh':9210}, types:['Big box','Hobby','Grocery','Pharmacy','Thrift'], byType:[{type:'Big box',n:41200},{type:'Grocery',n:28800},{type:'Hobby',n:9100}], topRegions:[{region:'West Coast',n:22400},{region:'Southeast',n:18100}], topChecks:[{name:'Target Glendale',location:'Glendale',n:44},{name:'GameStop Burbank',location:'Burbank',n:31}] },
  '/api/admin/users': (()=>{ const now=Math.floor(Date.now()/1000); return [
    { id:'u1', phone:'+13105551234', email:'sam@example.com', plan:'Subscriber', credits:22, callsMade:38, spentCents:2497, createdAt:now-86400*20, callerIdVerified:true },
    { id:'u2', phone:'+18185550000', plan:'Pay-as-you-go', credits:3, callsMade:9, spentCents:180, createdAt:now-86400*6 },
    { id:'u3', email:'owner@checkitforme.com', plan:'Comp / owner', comp:true, credits:999, callsMade:210, spentCents:0, createdAt:now-86400*90, staff:true },
  ]; })(),
  '/api/admin/test-calls': (()=>{ const now=Math.floor(Date.now()/1000); return { count:12, summary:{avgNavSec:34,avgTalkSec:71,avgCallSec:118}, rows:[
    { workflow:'Friendly Sam', status:'in_stock', started:now-1800, navSec:28, talkSec:64, callSec:101, opener:{label:'#2', said:'Hi there! quick one, any Pokémon cards on the shelf today?'} },
    { workflow:'Hobby Shop Casual', status:'no_clear_answer', started:now-7200, navSec:41, talkSec:88, callSec:140, opener:{label:'#1', said:'Hey! you guys get any Pokémon in this week?'} },
    { workflow:null, status:'nobody_answered', started:now-90000, navSec:null, talkSec:null, callSec:62, opener:{} },
  ]}; })(),
  '/api/feedback': (()=>{ const now=Math.floor(Date.now()/1000); return [
    { id:1, store:'Hobby Planet', created_at:now-3600, confirmed:null, status_key:'no_clear_answer', user_verdict:'in', disagree:1, reviewed:0, transcript:'Agent: Any Pokémon in?\nClerk: Umm maybe, check back.' },
    { id:2, store:'Target Glendale', created_at:now-9000, confirmed:1, status_key:'in_stock', user_verdict:'in', disagree:0, reviewed:0 },
    { id:3, store:'GameStop Burbank', created_at:now-90000, confirmed:0, status_key:'not_in_stock', user_verdict:'out', disagree:0, reviewed:1 },
  ]; })(),
  '/api/alerts/templates': { restock:{sms:'{product} is BACK at {store} in {city}! Get going, this stuff does not stay on the shelves.', emailSubject:'{product} is back at {store}', emailBody:'Get going, this stuff doesn’t stay on the shelves for very long.'}, auto_check:{sms:'Your {store} check: {result}', emailSubject:'Your auto check: {result}', emailBody:'Here is what the store said on today’s call.'}, store_added:{emailSubject:'{store} is live on Check', emailBody:'The store you asked for is live. Your free check is loaded.'}, waitlist:{emailSubject:'We’re live in your area', emailBody:'Check now covers your area. Come find your card.'}, confirm_email:{emailSubject:'Confirm your email', emailBody:'Tap below and alerts start landing here.'} },
  '/api/alerts/log': (()=>{ const now=Math.floor(Date.now()/1000); return { delivery:{sms:false,email:true}, subscribers:{total:14}, rollup:{'restock.email.sent':6,'auto_check.email.sent':3,'restock.sms.stubbed':2}, recent:[
    { event:'restock', to:'sam@example.com', at:now-3600, status:'sent' },
    { event:'auto_check', to:'sam@example.com', at:now-7200, status:'sent' },
    { event:'restock', to:'+13105551234', at:now-9000, status:'stubbed' },
  ]}; })(),
  '/api/admin/owner-alert': { channel:'email', email:'owner@checkitforme.com' },
  '/api/watches': [ {contact:'sam@example.com',channel:'email',retailerId:11,categoryId:1,active:true}, {contact:'+18185550000',channel:'sms',retailerId:13,categoryId:1,active:false} ],
  '/api/community': [ {id:1,imageUrl:'/logos/brand/check-icon.png',caption:'Pulled a Moonbreon!',handle:'sam',likes:4,approved:false} ],
  '/api/store-requests': [ {id:1,storeName:'Card Castle',city:'Reseda',note:'They restock Fridays',contact:'sam@example.com',status:'new'} ],
  '/api/waitlist': { total:9, byRegion:[{region:'Midwest',n:5},{region:'Northeast',n:4}], recent:[{contact:'amy@example.com',area:'Chicago',region:'Midwest'}] },
  '/api/retailers': [
    { id:1, chainId:null, name:'1 Stop Card Shop', location:'Hillsboro, OR', storeType:'Hobby', carries:'Topps' },
    { id:2, chainId:null, name:'1 Stop Card Shop and Games', location:'Lake Oswego, OR', storeType:'Hobby', carries:'Pokemon, One Piece, Topps' },
    { id:3, chainId:null, name:'105 Beyblade', location:'Warwick, RI', storeType:'Other', carries:'Topps' },
    { id:4, chainId:9, name:'Goodwill', location:'Owasso, OK', storeType:'Thrift', logoUrl:'/logos/brand/check-icon.png', carries:'' },
  ],
  '/api/kiosks': [ { label:'Pok\u00e9mon kiosk \u00b7 Smoke Albertsons', category:'Pok\u00e9mon', refreshSummary:':03 & :33 \u00b7 every 30 min', reports:4 } ],
  '/api/kiosk-receipts': (()=>{ const now=Math.floor(Date.now()/1000); return [
    { product:'Scarlet & Violet White Flare Booster Bundle (6 Packs)', machineId:'Q00523', total:'29.57', orderId:'76701601', txnAt:'Jul 9', createdAt:now-86400*2 },
    { product:'Scarlet & Violet Journey Together Booster Pack (10 cards)', machineId:'Q00523', total:'4.93', orderId:'76701651', txnAt:'Jul 9', createdAt:now-86400*2 },
    { product:'Mega Evolution \u2014 Perfect Order Booster Pack (10 Cards)', machineId:'Q00523', total:'4.93', orderId:'75089379', txnAt:'Jun 15', createdAt:now-86400*26, claimedBy:'u1' },
  ]; })(),
  '/api/gtm': { items:[
    {id:'1',title:'A2P SMS approval',detail:'Twilio campaign pending carrier review',area:'backend',agent:'devops',critical:true,status:'doing'},
    {id:'2',title:'Outlook email render check',detail:'',area:'frontend',agent:'design',critical:false,status:'todo'},
    {id:'3',title:'Store sync nightly job',detail:'',area:'backend',agent:'data',critical:true,status:'done'},
    {id:'4',title:'Launch tweet thread',detail:'',area:'ops',agent:'social',critical:false,status:'todo'},
  ], missingDefaults:[] },

  '/api/support/stats': { conversations:31, selfServed:26, escalated:5, avgMessages:3.2, pendingReview:2, tickets:4, estCostUsd:1.84, byCategory:{billing:9, how_checks_work:7, bug:4, other:11}, topQuestions:[{q:'Why did my check not go through?',n:6},{q:'Do you check Costco?',n:4},{q:'How do refunds work?',n:3}] },
  '/api/support/chats': [
    { id:'c1', account:{phone:'+13106662331',email:'jcoindefi@gmail.com'}, category:'check_issue', status:'open', tier:1, source:'status_page', title:'', createdAt:Math.floor(Date.now()/1000)-2760 },
    { id:'c2', account:{phone:'+13106662331'}, category:'check_issue', status:'escalated', tier:2, source:'status_page', title:'Target said out but the app showed in stock', createdAt:Math.floor(Date.now()/1000)-3600 },
    { id:'c3', account:{email:'jt@example.com'}, category:'bug', status:'resolved', tier:1, source:'messenger', title:'The live audio cut out mid call', createdAt:Math.floor(Date.now()/1000)-10800 },
    { id:'c4', account:null, category:'other', status:'open', tier:1, source:'messenger', title:'Can I gift checks to a friend?', createdAt:Math.floor(Date.now()/1000)-14000 },
  ],
  '/api/statuses': [
    {id:1,key:'in_stock',label:'In stock',emoji:'in_stock',color:'#4ADE80',tone:'in',note:"They've got {product} in. go get it.",sort:1},
    {id:2,key:'not_in_stock',label:'Out',emoji:'circle-x',color:'#EF4444',tone:'out',note:'Sold out at this store right now.',sort:2},
    {id:3,key:'no_clear_answer',label:'Unclear',emoji:'circle-help',color:'#FBBF24',tone:'unk',note:'Staff could not confirm either way.',sort:3},
    {id:4,key:'nobody_answered',label:'No answer',emoji:'phone-off',color:'#9CA3AF',tone:'unk',note:'',sort:4},
  ],
  '/api/results': (()=>{ const now=Math.floor(Date.now()/1000); return { total:118, rows:[
    { id:1, retailer:'Target Glendale', retailerId:11, category:'Pokémon', status:'completed', confirmed:true, startedAt:now-720, completedAt:now-608, productName:'Prismatic Evolutions boosters', summary:'Staff checked the card aisle and confirmed boosters on the shelf.', transcript:'Agent: Hi! Quick one, any Pokémon cards on the shelf today?\nClerk: Yeah we got the new Prismatic boosters in this morning.\nAgent: Perfect, thank you so much. Have a good one!' },
    { id:2, retailer:"Collector's Toybox", retailerId:12, category:'One Piece TCG', status:'completed', confirmed:false, shipmentDayHeard:'Tuesday', startedAt:now-4200, completedAt:now-4108, transcript:'Agent: Any One Piece boosters in stock?\nClerk: We are sold out, truck comes Tuesday.' },
    { id:3, retailer:'GameStop Burbank', retailerId:13, category:'Pokémon', status:'completed', confirmed:false, startedAt:now-7900, completedAt:now-7801, transcript:'Agent: Got any Pokémon in?\nClerk: No, all gone.' },
    { id:4, retailer:'Hobby Planet', retailerId:14, category:'Pokémon', type:'Hobby', status:'completed', startedAt:now-11600, completedAt:now-11540, transcript:'Agent: Any Pokémon restocks?\nClerk: Umm maybe check back later.' },
    { id:5, retailer:'Walmart Porter Ranch', retailerId:15, category:'Topps NBA', status:'completed', confirmed:true, startedAt:now-93000, completedAt:now-92880, transcript:'Agent: Any Topps NBA cards?\nClerk: Yes, aisle 12.' },
    { id:6, retailer:'Ralphs Sunset', retailerId:16, category:'Pokémon', status:'no_answer', startedAt:now-97000 },
  ]}; })(),
};
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: Number(width)||420, height: 900 }, deviceScaleFactor: 2 });
await page.addInitScript((fix) => {
  const orig = window.fetch;
  window.fetch = async (url, opts) => {
    const u = (typeof url === 'string' ? url : url.url).split('?')[0].replace(/^.*\/\//,'').replace(/^[^/]+/,'');
    for (const k of Object.keys(fix)) { if (u === k || u.endsWith(k)) return new Response(JSON.stringify(fix[k]), { status:200, headers:{'content-type':'application/json'} }); }
    return new Response(JSON.stringify({}), { status:200, headers:{'content-type':'application/json'} });
  };
}, FIX);
await page.route('**/{logos,fonts}/**', route => { // absolute asset paths break under file:// — serve them from public/ (fonts INCLUDED: a render judged in the wrong typeface is a lie)
  const p = new URL(route.request().url()).pathname;
  route.fulfill({ path: process.cwd() + '/public' + p }).catch(() => route.abort());
});
await page.goto('file://' + process.cwd() + '/public/app.html', { waitUntil: 'domcontentloaded' }).catch(e=>console.error('goto', e.message));
await page.waitForTimeout(300);
await page.evaluate((sec) => { try { showSection(sec); } catch(e){} }, section);
await page.waitForTimeout(900);
const full = process.argv[5] === 'full'; // 5th arg 'full' → whole page (shell + section), else section only
if (full) await page.screenshot({ path: out, fullPage: true });
else await page.locator('#' + section).screenshot({ path: out }).catch(async e => { console.error('el shot failed', e.message); await page.screenshot({ path: out, fullPage:true }); });
await browser.close();
console.log('wrote', out);
