// F-refined, rendered ON the real checkit page chrome with the real palette.
// Shows the new verdict card in BOTH states (out = message, in = yellow product)
// so the "(message / product)" slot is visible. Smaller status, store-name-only, shorter box.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/tmp/comps';
mkdirSync(OUT, { recursive: true });
const SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

// real palette + chrome lifted from public/checkit.html
const PAGE = (cards) => `<!doctype html><html><head><meta charset="utf-8">
<style>
  :root{
    --bg:#0C0C12; --sheet:#1A1A24; --terminal:#0A0A0E;
    --green:#4ADE80; --green-dark:#22C55E; --yellow:#FBBF24;
    --orange:#E89A4A; --red:#EF4444; --muted:#6B6B7B; --border:rgba(255,255,255,.08);
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;max-width:100%;overflow-x:hidden}
  body{background:var(--bg);color:#fff;font-family:Inter,-apple-system,system-ui,sans-serif;
       background-image:radial-gradient(1200px 500px at 50% -100px,rgba(74,222,128,.10),transparent 70%);
       background-repeat:no-repeat}
  header{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;
         background:rgba(12,12,18,.85);backdrop-filter:blur(10px)}
  .vsw-trig{display:inline-flex;align-items:center;gap:7px;background:var(--sheet);border:1px solid var(--border);
            color:#fff;font-weight:800;font-size:13px;padding:6px 11px 6px 10px;border-radius:22px}
  .pball{width:18px;height:18px;border-radius:50%;background:linear-gradient(#EE1515 0 50%,#fff 50% 100%);
         box-shadow:inset 0 0 0 1.5px #0C0C12}
  .pill{display:inline-flex;align-items:center;gap:7px;background:var(--sheet);border:1px solid var(--border);
        border-radius:20px;padding:7px 12px;font-size:13px;font-weight:700;margin-left:auto}
  .pill .dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green)}
  main{padding:22px 20px 26px;max-width:520px;margin:0 auto;width:100%}

  /* ---- NEW verdict card (F-refined) ---- */
  .rcard{background:var(--sheet);border:1px solid var(--border);border-radius:18px;
         padding:22px 22px 24px;text-align:center;position:relative;overflow:hidden;margin-bottom:16px}
  .rcard::before{content:'';position:absolute;left:0;right:0;top:0;height:120px;pointer-events:none}
  .rcard.out::before{background:radial-gradient(120% 100% at 50% 0%,rgba(239,68,68,.16),transparent 62%)}
  .rcard.in::before {background:radial-gradient(120% 100% at 50% 0%,rgba(74,222,128,.18),transparent 62%)}
  .rcard>*{position:relative}
  .rstore{font-weight:800;font-size:16px;letter-spacing:-.2px;color:#fff}
  .rstore .br{color:#9a9aac;font-weight:600}
  .rtitle{font-size:21px;font-weight:900;letter-spacing:-.4px;margin-top:18px;line-height:1.1}
  .rcard.out .rtitle{color:var(--red)} .rcard.in .rtitle{color:var(--green)}
  .rmsg{color:var(--muted);font-size:13.5px;line-height:1.5;margin:9px auto 0;max-width:300px}
  .rprod{color:var(--yellow);font-weight:800;font-size:14px;margin-top:11px}
  .lbl{text-align:center;color:#3c3c47;font-size:11px;margin:-6px 0 18px}
</style></head><body>
<header>
  <div class="vsw-trig"><span class="pball"></span>Pokémon <span style="opacity:.45;font-size:11px">▾</span></div>
  <div class="pill"><span class="dot"></span>1 free</div>
</header>
<main>${cards}</main>
</body></html>`;

const cardOut = `
  <div class="rcard out">
    <div class="rstore">Barnes &amp; Noble <span class="br">Westlake</span></div>
    <div class="rtitle">Not in stock</div>
    <div class="rmsg">They don't have it right now.</div>
  </div>
  <div class="lbl">↑ not in stock — slot shows the message</div>`;

const cardIn = `
  <div class="rcard in">
    <div class="rstore">Barnes &amp; Noble <span class="br">Westlake</span></div>
    <div class="rtitle">In stock!</div>
    <div class="rprod">3-pack blister</div>
  </div>
  <div class="lbl">↑ in stock — same slot shows the product, in yellow</div>`;

const f = `${OUT}/page.html`;
writeFileSync(f, PAGE(cardOut + cardIn));
execFileSync(SHELL, ['--headless','--no-sandbox','--hide-scrollbars','--force-device-scale-factor=2',
  '--default-background-color=ff0C0C12','--window-size=440,640',
  `--screenshot=${OUT}/page.png`, `file://${f}`], { stdio:'pipe' });
console.log('rendered page');
