// Minimal pass — one card, gradient kept, noise removed. 3 calm variants.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/tmp/comps';
mkdirSync(OUT, { recursive: true });
const SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const HEAD = `
<meta charset="utf-8">
<style>
  :root{
    --bg:#08080c; --card:#0e0e15; --line:rgba(255,255,255,.06);
    --txt:#f4f4f8; --muted:#7c7c8a; --green:#4ADE80; --red:#F4634E; --yellow:#FFCB05;
  }
  *{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased}
  body{font-family:'SF Pro Display',-apple-system,'Segoe UI',Inter,system-ui,sans-serif;background:var(--bg);color:var(--txt)}
  .frame{width:440px;height:820px;background:var(--bg);padding:26px 20px}
  .appbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:30px}
  .pill{display:flex;align-items:center;gap:8px;background:#14141b;border:1px solid var(--line);border-radius:999px;padding:8px 14px;font-weight:800;font-size:15px}
  .pball{width:17px;height:17px;border-radius:50%;background:linear-gradient(#EE1515 0 50%,#fff 50% 100%);box-shadow:inset 0 0 0 1.5px #0C0C12}
  .you{display:flex;align-items:center;gap:7px;background:#14141b;border:1px solid var(--line);border-radius:999px;padding:8px 13px;font-weight:800;font-size:14px}
  .ondot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green)}
  .dot{width:9px;height:9px;border-radius:50%;flex:none}
  .note{font-size:12px}
</style>`;

const appbar = `
  <div class="appbar">
    <div class="pill"><span class="pball"></span>Pokémon <span style="opacity:.4">»</span></div>
    <div class="you"><span class="ondot"></span>You</div>
  </div>`;

// ---- E — Quiet. soft top glow, lots of air, status = dot + word, product = small yellow line ----
const E = `
  ${appbar}
  <div style="border-radius:24px;background:
        radial-gradient(130% 70% at 50% 0%, rgba(244,99,78,.14), transparent 58%), var(--card);
        border:1px solid var(--line);padding:54px 28px;text-align:center">
    <div style="font-size:25px;font-weight:800;letter-spacing:-.4px">Barnes &amp; Noble</div>
    <div style="color:var(--muted);font-size:13px;margin-top:8px">160 S. Westlake Blvd · Pokémon</div>

    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:46px">
      <span class="dot" style="background:var(--red)"></span>
      <span style="font-size:28px;font-weight:800;color:var(--red);letter-spacing:-.4px">Not in stock</span>
    </div>
    <div style="color:#a0a0ac;font-size:14px;margin-top:18px;font-weight:600">3-pack blister</div>
  </div>
  <div style="text-align:center;color:#3c3c47;font-size:11px;margin-top:16px">E · Quiet — dot + word, soft glow</div>`;

// ---- F — Single focus. store tiny up top, verdict is the whole card, product chip subtle ----
const F = `
  ${appbar}
  <div style="border-radius:24px;background:
        radial-gradient(130% 75% at 50% 0%, rgba(244,99,78,.16), transparent 60%), var(--card);
        border:1px solid var(--line);padding:46px 28px;text-align:center">
    <div style="color:var(--muted);font-size:13px;font-weight:600;letter-spacing:.2px">Barnes &amp; Noble · 160 S. Westlake Blvd</div>
    <div style="font-size:34px;font-weight:800;color:var(--red);letter-spacing:-.6px;margin-top:34px;line-height:1.05">Not in stock</div>
    <div style="margin-top:22px">
      <span style="display:inline-block;background:rgba(255,203,5,.10);color:var(--yellow);font-weight:700;font-size:13px;padding:6px 14px;border-radius:999px">3-pack blister</span>
    </div>
  </div>
  <div style="text-align:center;color:#3c3c47;font-size:11px;margin-top:16px">F · Single focus — verdict is the card</div>`;

// ---- G — Left rail accent. thin colored bar carries the status meaning, text stays calm/left ----
const G = `
  ${appbar}
  <div style="border-radius:24px;background:
        radial-gradient(120% 80% at 0% 0%, rgba(244,99,78,.13), transparent 55%), var(--card);
        border:1px solid var(--line);overflow:hidden;display:flex">
    <div style="width:5px;background:var(--red);flex:none"></div>
    <div style="padding:40px 30px;flex:1">
      <div style="font-size:24px;font-weight:800;letter-spacing:-.4px">Barnes &amp; Noble</div>
      <div style="color:var(--muted);font-size:13px;margin-top:7px">160 S. Westlake Blvd · Pokémon</div>
      <div style="font-size:23px;font-weight:800;color:var(--red);margin-top:40px;letter-spacing:-.3px">Not in stock</div>
      <div style="color:var(--yellow);font-size:14px;font-weight:700;margin-top:12px">3-pack blister</div>
    </div>
  </div>
  <div style="text-align:center;color:#3c3c47;font-size:11px;margin-top:16px">G · Left rail accent — calm, left-aligned</div>`;

const comps = { E, F, G };
for (const [k, body] of Object.entries(comps)) {
  const html = `<!doctype html><html><head>${HEAD}</head><body><div class="frame">${body}</div></body></html>`;
  const f = `${OUT}/comp${k}.html`;
  writeFileSync(f, html);
  execFileSync(SHELL, ['--headless','--no-sandbox','--hide-scrollbars','--force-device-scale-factor=2',
    '--default-background-color=ff08080c','--window-size=440,820',
    `--screenshot=${OUT}/comp${k}.png`, `file://${f}`], { stdio: 'pipe' });
  console.log('rendered', k);
}
