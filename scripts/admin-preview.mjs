// _preview.mjs <section-id> <out.png> [width] — renders the REAL app.html with stubbed API data.
import { chromium } from '@playwright/test';
const [section, out, width] = process.argv.slice(2);

const FIX = {
  '/api/admin/overview': { today:{ calls:24, confirms:15 }, days:[12,15,9,18,13,20,24], chainStats:[] },
  '/api/admin/metrics': { revenueCents:41200, profitCents:14000, marginPct:34, mrrCents:9900, cogs:{totalCents:27200}, callsMade:118, users:52, subscribers:11, marginPct_:34 },
  '/api/admin/restock-intel': { answerFunnel:{ dialed:118, reachedHuman:73 } },
  '/api/credits': { remaining:31000, limit:100000 },
  '/api/admin/call-timing': { aggregate:{ calls:40, avgTalkSec:80, avgNavSec:108, avgCallSec:150, totalMinutes:100 }, byModel:[{model:'Charlie',type:'direct',n:22,avgNavSec:42,avgTalkSec:70,avgCallSec:120}], byStatus:[], byStore:[{name:'Target Glendale',n:6,avgTalkSec:75,avgNavSec:40,avgCallSec:118}] },
  '/api/admin/pulse': { funnel:{ leads:9, signups:3, paying:4, members:11, revenueCents:41200 }, activity:{ checks:24, checks24h:24, confirms:15, avgTalkSec:80, avgCallSec:150 }, community:{ watches:14, kioskReports:3, posts:1, postsPending:0, newLeads7d:5 }, statsSince:null },
  '/api/admin/call-health': { real:118, seed:12, rehearsal:6, firstReal:'2026-06-01', dialed:118, reached:73 },
  '/api/policy': { flags:{ liveListen:true }, pricing:{}, bail:{} },
  '/api/settings': { vt_workflows: JSON.stringify([{name:'Friendly Sam'},{name:'Direct Dana'},{name:'Hobby Shop Casual'}]), vt_default_workflow:'Friendly Sam' },
  '/api/categories': [ {id:1,label:'Pokémon'}, {id:2,label:'One Piece TCG'}, {id:3,label:'Topps NBA'} ],
  '/api/chains': [],
  '/api/feedback': [],
  '/api/retailers': [],
  '/api/statuses': [
    {key:'in_stock',label:'In stock',emoji:'in_stock',color:'#4ADE80',tone:'in',note:"They've got {product} in. go get it."},
    {key:'not_in_stock',label:'Out',emoji:'circle-x',color:'#EF4444',tone:'out',note:''},
    {key:'no_clear_answer',label:'Unclear',emoji:'circle-help',color:'#FBBF24',tone:'unclear',note:''},
    {key:'nobody_answered',label:'No answer',emoji:'phone-off',color:'#9CA3AF',tone:'unclear',note:''},
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
await page.route('**/logos/**', route => { // absolute asset paths break under file:// — serve them from public/
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
