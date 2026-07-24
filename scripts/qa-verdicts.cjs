// Render sweep: every verdict state at 390px in ONE contact sheet, so a text/layout change is proven
// across the whole class at once instead of page-by-page gopher whacking (owner 07-22).
// Usage: boot a local server on :8899 (STAGING=1, local DATABASE_URL), then:
//   NODE_PATH=./node_modules node scripts/qa-verdicts.cjs /tmp/verdicts.png
// Prints the shot list as JSON in CASE order — stitch from THAT list, never an alphabetical glob.
// Mocks mirror real /pub/result payload shapes: cats = category LABEL strings (a numeric id here
// once made esc() throw inside fillP and the sweep printed literal {store}/{product} tokens).
const pw = require('playwright-core');
const OUT = process.argv[2] || '/tmp/verdicts.png';
const STORE = { id: 1, name: 'Hot Topic Topanga Mall', address: '6600 Topanga Canyon Blvd', location: 'Canoga Park, CA' };
const BASE = { status: 'completed', summary: 't', ts: Date.now(), durationSecs: 43,
  transcript: 'Clerk: Hello.\nAgent: Heyy, any Pokémon cards in right now?\nClerk: Yes.',
  cats: ['Pokémon cards'],
  steps: [{ n: 1, at: 0 }, { n: 3, at: 4 }, { n: 7, at: 8 }, { n: 8, at: 10 }] };
const CASES = [
  ['in-named-long', { ...BASE, confirmed: true, statusKey: 'in_stock', productName: 'a Chaos Rising booster packs' }],
  ['in-plain', { ...BASE, confirmed: true, statusKey: 'in_stock' }],
  ['restock-time', { ...BASE, confirmed: false, statusKey: 'not_in_stock', shipmentDay: 'tomorrow', shipmentTime: '2:00 PM' }],
  ['restock-part', { ...BASE, confirmed: false, statusKey: 'not_in_stock', shipmentDay: 'Thursday', shipmentTime: 'afternoon' }],
  ['sold-out', { ...BASE, confirmed: false, soldOut: true, statusKey: 'sold_out' }],
  ['not-in', { ...BASE, confirmed: false, statusKey: 'not_in_stock' }],
  ['unclear', { ...BASE, confirmed: null, statusKey: 'no_clear_answer', transcript: 'Clerk: Hello.\nAgent: Heyy, any Pokémon cards in right now?\nClerk: Uh, maybe, hang on—' }],
  ['voicemail', { ...BASE, confirmed: null, statusKey: 'voicemail', transcript: 'Clerk: Please leave a message after the tone.', steps: [{ n: 1, at: 0 }, { n: 3, at: 4 }] }],
  ['nobody', { ...BASE, confirmed: null, statusKey: 'nobody_answered', transcript: '', steps: [{ n: 1, at: 0 }, { n: 3, at: 4 }] }],
  ['hold', { ...BASE, confirmed: null, statusKey: 'left_on_hold' }],
];
(async () => {
  const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  await pg.route('**/', async (route) => {
    const r = await route.fetch(); let body = await r.text();
    body = body.replace('function pickStore(id){', 'window.__setStore=function(s){SEL_STORE=s;};function pickStore(id){');
    await route.fulfill({ response: r, body });
  });
  await pg.goto('http://127.0.0.1:8899/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pg.waitForTimeout(1500);
  const shots = [];
  for (const [name, o] of CASES) {
    await pg.evaluate(([st, oo]) => { window.__setStore(st); showResult(oo, 'sweep-' + Math.random()); }, [STORE, o]);
    await pg.waitForTimeout(1600); // entrance animation (rTitleIn 1s + .2s delay) must SETTLE or the shot is a mid-fade blur
    const f = OUT.replace(/\.png$/, '') + '-' + name + '.png';
    await pg.screenshot({ path: f, clip: { x: 0, y: 60, width: 390, height: 260 } });
    shots.push(f);
  }
  await b.close();
  console.log(JSON.stringify(shots));
})().catch(e => { console.error(e); process.exit(1); });
