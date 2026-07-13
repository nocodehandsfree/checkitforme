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
  '/api/policy': { flags:{}, pricing:{}, bail:{} },
  '/api/settings': {},
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
