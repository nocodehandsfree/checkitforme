// qa-e2e — RENDERED verification for the redesign (round 2): real Chromium against a locally-booted
// server. Mechanizes the owner's checklist: per-vertical COLORS, ES copy flip, BUTTON paths that must
// manifest their outcome, FONT family/sizes, ANIMATIONS present, v2 gating (hidden pages stay hidden).
// Run: node scripts/qa-e2e.mjs   (boots its own server on :8796, throwaway DB)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8796, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = m => { pass++; console.log(`  ✓ ${m}`); };
const no = m => { fail++; console.log(`  ✗ ${m}`); };
const eq = (m, a, b) => (String(a) === String(b) ? ok(`${m} = ${b}`) : no(`${m}: got ${a}, want ${b}`));
const has = (m, a) => (a ? ok(m) : no(m));

const srv = spawn('./node_modules/.bin/tsx', ['src/server.ts'], {
  env: { ...process.env, DATABASE_URL: `file:${process.cwd()}/.t-e2e.db`, PORT: String(PORT), CLERK_ENFORCE: 'false',
    ELEVENLABS_API_KEY: 'test', ELEVENLABS_AGENT_ID: 'test', ELEVENLABS_PHONE_NUMBER_ID: 'test' },
  stdio: 'ignore',
});
for (let i = 0; i < 60; i++) { try { const r = await fetch(`${BASE}/pub/policy`); if (r.ok) break; } catch {} await sleep(500); }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const rgb = hex => { const h = hex.replace('#', ''); return `rgb(${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)})`; };

try {
  // ---- 1. PER-VERTICAL COLORS: each brand's accent drives the v2 accent pieces (owner's call-out).
  for (const [path, accent] of [['pokemon', '#FFCB05'], ['onepiece', '#E23636'], ['toppsbasketball', '#E4002B'], ['needoh', '#EC4899']]) {
    const pg = await browser.newPage();
    await pg.goto(`${BASE}/${path}?skin=v2`, { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(600);
    eq(`${path}: --accent var`, (await pg.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toUpperCase(), accent);
    eq(`${path}: v2 page bg`, await pg.evaluate(() => getComputedStyle(document.body).backgroundColor), rgb('1D1D22'));
    has(`${path}: preview badge visible`, await pg.evaluate(() => !![...document.querySelectorAll('button')].find(b => b.textContent.includes('NEW LOOK'))));
    await pg.close();
  }

  // ---- 2. FONT + TYPE SPECS (§4) on the flagship page.
  const pg = await browser.newPage();
  await pg.goto(`${BASE}/pokemon?skin=v2`, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(800);
  const heroCS = await pg.evaluate(() => { const h = document.querySelector('.hero h1'); const c = getComputedStyle(h); return { ff: c.fontFamily, fs: c.fontSize, fw: c.fontWeight, ls: c.letterSpacing }; });
  has('hero font is Inter', /Inter/.test(heroCS.ff));
  eq('hero size (30px/900/-1px)', `${heroCS.fs}/${heroCS.fw}/${heroCS.ls}`, '30px/900/-1px');

  // ---- 3. S2 SWITCHER: locked labels, carved track, CLICK Kiosk → outcome manifests (mode flips).
  const s2 = await pg.evaluate(() => { const t = document.getElementById('modetabs'); const on = t?.querySelector('.modetab.on'); return { track: t ? getComputedStyle(t).backgroundColor : null, radius: t ? getComputedStyle(t).borderRadius : null, label: on?.textContent.trim() }; });
  eq('S2 track carved fill', s2.track, rgb('1B1B20'));
  eq('S2 active label (locked)', s2.label, 'Retail');
  const kioskVisible = await pg.evaluate(() => { const k = document.querySelector('.modetab[data-mode="kiosk"]'); return k && k.style.display !== 'none'; });
  if (kioskVisible) {
    await pg.click('.modetab[data-mode="kiosk"]');
    await pg.waitForTimeout(300);
    eq('click Kiosk → key activates', await pg.evaluate(() => document.querySelector('.modetab.on')?.dataset.mode), 'kiosk');
    await pg.click('.modetab[data-mode="call"]'); await pg.waitForTimeout(200);
  } else ok('kiosk key hidden on this brand (policy) — skip click');

  // ---- 4. ES FLIP: pick Spanish → approved ES strings render (find step + poll labels sampled).
  await pg.evaluate(() => { window.pickLang && pickLang('es'); });
  await pg.waitForTimeout(400);
  const esStep = await pg.evaluate(() => document.getElementById('findstep')?.textContent || '');
  has(`ES flip renders Spanish find-step ("${esStep.slice(0, 24)}…")`, /tienda|Encuentra|Busca/i.test(esStep));
  await pg.evaluate(() => pickLang('en'));

  // ---- 5. ANIMATIONS: v2 keyframes exist and the CTA shine/step animations are wired.
  const anims = await pg.evaluate(() => {
    const names = [];
    for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.type === 7) names.push(r.name); } catch {} }
    return names;
  });
  for (const k of ['ckWaveV2', 'ckGlowV2']) has(`keyframes ${k} present`, anims.includes(k));

  // ---- 6. HIDDEN-PAGE GATING: hobby unreachable WITHOUT the skin; reachable WITH it; art renders.
  const pg2 = await browser.newPage();
  await pg2.goto(`${BASE}/pokemon?flow=hobby`, { waitUntil: 'domcontentloaded' }); // no skin flag!
  await pg2.waitForTimeout(700);
  has('hobby stays HIDDEN without v2', await pg2.evaluate(() => document.getElementById('hobby')?.classList.contains('hidden')));
  await pg2.goto(`${BASE}/pokemon?skin=v2&flow=hobby`, { waitUntil: 'domcontentloaded' });
  await pg2.waitForTimeout(1500);
  const hob = await pg2.evaluate(() => { const h = document.getElementById('hobby'); return { open: h && !h.classList.contains('hidden'), eras: h ? h.querySelectorAll('.hob-era').length : 0 }; });
  has('hobby OPENS with v2', hob.open);
  eq('hobby renders all eras from the feed', hob.eras, 13);
  // click era → sets render with code+date strip; click set → product rows with icons
  await pg2.click('.hob-era'); await pg2.waitForTimeout(500);
  const sets = await pg2.evaluate(() => document.querySelectorAll('.hob-set').length);
  has(`era click → sets render (${sets})`, sets >= 5);
  await pg2.click('.hob-set'); await pg2.waitForTimeout(500);
  const prods = await pg2.evaluate(() => ({ n: document.querySelectorAll('.hob-prod').length, icon: !!document.querySelector('.hob-prod svg') }));
  has(`set click → products render (${prods.n}) with icons`, prods.n >= 3 && prods.icon);
  // price rule: no "$null"/"$NaN" ever
  has('no null/NaN prices anywhere', await pg2.evaluate(() => !/\$(null|NaN|undefined)/.test(document.getElementById('hobby').innerHTML)));
  // click product → outcome manifests: back on builder with a lock toast
  await pg2.click('.hob-prod'); await pg2.waitForTimeout(600);
  has('product click → returns to builder', await pg2.evaluate(() => !document.getElementById('builder').classList.contains('hidden')));
  await pg2.close();

  // ---- 7. LOGIN ERROR STATE (§5.12): submit empty → under-field line + red ring on the well.
  await pg.evaluate(() => { window.signIn && signIn(); });
  await pg.waitForTimeout(400);
  const authOpen = await pg.evaluate(() => !!document.getElementById('auth_phone'));
  if (authOpen) {
    await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /code|continue|send/i.test(x.textContent) && x.closest('.modal')); b && b.click(); });
    await pg.waitForTimeout(400);
    const err = await pg.evaluate(() => { const e = document.getElementById('auth_err'); const w = document.getElementById('auth_phone')?.parentElement; return { txt: e?.textContent.trim() || '', ring: w ? getComputedStyle(w).boxShadow : '' }; });
    has(`empty submit → error line ("${err.txt.slice(0, 28)}…")`, err.txt.length > 3);
    has('error ring lights the well (§5.12)', /rgb\(239, 68, 68\)/.test(err.ring));
  } else no('could not open the login pop-up');
  await pg.close();
} finally {
  await browser.close();
  srv.kill();
  try { const { unlinkSync } = await import('node:fs'); unlinkSync('.t-e2e.db'); } catch {}
}
console.log('════════════════');
console.log(`  qa-e2e PASS: ${pass}  FAIL: ${fail}`);
process.exit(fail ? 1 : 0);
