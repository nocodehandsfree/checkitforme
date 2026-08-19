// THE LEGO TEST. Every slide-up on the consumer site must be the SAME component: bottom anchored, one
// surface, one corner radius, one grab handle, one entrance. Run it against a local server and it prints
// how many DIFFERENT recipes are in use. The answer must be 1. Anything else means someone rebuilt a
// piece by hand instead of snapping the existing one on.
//   node scripts/sheet-recipe-audit.mjs [url]     (default http://127.0.0.1:8842/r)
// Found on 07-27: 4 recipes. The checkout sheet faded instead of sliding, the upsell had its own smaller
// handle and could not be swiped away, and My checks hand-built a 40x5 grey handle. Now 24 sheets, 1 recipe.
import { createRequire } from 'module';
const require_ = createRequire(import.meta.url);
const { chromium } = require_('playwright-core');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(process.argv[2] || 'http://127.0.0.1:8842/r', { waitUntil: 'networkidle' });

const rows = await page.evaluate(() => {
  // make every sheet exist, including the ones built on demand
  try { editEmail(); } catch (e) {}
  try { openFeatInfo('restock_alerts'); } catch (e) {}
  try { openAlerts(); } catch (e) {}
  // Auto-checks: the list, one store's report and the edit sheet are all built on demand too.
  try { window.SCHEDS = [{ id: 1, retailerId: 1, store: 'Test', storeFull: 'Test — Town', category: 'Pokémon', daysOfWeek: '2,5', timeLocal: '10:00', active: true, paused: false, nextDow: 5 }];
    openAutoChecks(); openAutoReport(1); openAutoEdit(1); } catch (e) {}
  // My checks builds its head (and its handle) only when opened, so open it or it reports a false gap
  try { window.isAuthed = () => true;
    ACCOUNT = { subscription:'active', subTier:'hunter', credits:9, callsMade:4, comp:false, phone:'+13105551234' };
    openAccount(); } catch (e) {}
  const out = [];
  for (const ov of document.querySelectorAll('.overlay')) {
    const m = ov.querySelector('.modal'); if (!m) { out.push({ id: ov.id, note: 'no .modal' }); continue; }
    const was = ov.classList.contains('on');
    ov.classList.add('on');
    const cs = getComputedStyle(m), ovs = getComputedStyle(ov), be = getComputedStyle(m, '::before');
    out.push({
      id: ov.id,
      anchored: ovs.alignItems,                                  // flex-end = bottom sheet
      surface: cs.backgroundColor,
      radius: cs.borderTopLeftRadius,
      // the handle may be a ::before OR a real element (My checks builds one by hand) — accept either
      handle: (() => {
        const fmt = (w, h, bg) => `${Math.round(parseFloat(w))}x${Math.round(parseFloat(h))} ${bg}`;
        if (be.content !== 'none') return fmt(be.width, be.height, be.backgroundColor);
        const pill = [...m.querySelectorAll('*')].find(e => { const b = e.getBoundingClientRect(), c = getComputedStyle(e);
          return b.width > 20 && b.width < 80 && b.height > 2 && b.height < 12 && parseFloat(c.borderRadius) >= 99; });
        if (!pill) return 'NONE';
        const b = pill.getBoundingClientRect(), c = getComputedStyle(pill);
        return fmt(b.width, b.height, c.backgroundColor);
      })(),
      entry: cs.animationName !== 'none' ? cs.animationName : `transition:${cs.transitionProperty}`,
    });
    if (!was) ov.classList.remove('on');
  }
  return out;
});
const key = r => `${r.anchored}|${r.surface}|${r.radius}|${r.handle}|${r.entry}`;
const groups = {};
for (const r of rows) { if (r.note) continue; (groups[key(r)] ||= []).push(r.id); }
const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
console.log('=== how many DIFFERENT slide-up recipes are in use ===');
sorted.forEach(([k, ids], i) => {
  const [anchored, surface, radius, handle, entry] = k.split('|');
  console.log(`\n[${i === 0 ? 'STANDARD' : 'ODD ONE OUT'}] ${ids.length} sheet(s)`);
  console.log(`  anchored:${anchored}  surface:${surface}  topRadius:${radius}`);
  console.log(`  handle:${handle}`);
  console.log(`  entry:${entry}`);
  console.log(`  ${ids.join(', ')}`);
});
console.log('\ntotal recipes:', sorted.length, sorted.length === 1 ? '(PASS)' : '(FAIL: the site is not built from one part)');
await browser.close();
process.exit(sorted.length === 1 ? 0 : 1);
