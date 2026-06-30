// One-off: render 4 verdict-card layout comps to PNG for design review.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/tmp/comps';
mkdirSync(OUT, { recursive: true });

const SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const HEAD = `
<meta charset="utf-8">
<style>
  :root{
    --bg:#08080c; --card:#101017; --line:rgba(255,255,255,.07);
    --txt:#f2f2f6; --muted:#8a8a98; --green:#4ADE80; --red:#EF4444; --yellow:#FFCB05;
  }
  *{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased}
  body{font-family:'SF Pro Display',-apple-system,'Segoe UI',Inter,system-ui,sans-serif;
       background:var(--bg);color:var(--txt)}
  .frame{width:440px;height:820px;background:
        radial-gradient(120% 60% at 50% -10%, rgba(74,222,128,.06), transparent 60%), var(--bg);
        padding:22px 18px;position:relative;overflow:hidden}
  /* top app header (Pokémon pill + You) */
  .appbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
  .pill{display:flex;align-items:center;gap:8px;background:#16161e;border:1px solid var(--line);
        border-radius:999px;padding:8px 14px;font-weight:800;font-size:15px}
  .pball{width:18px;height:18px;border-radius:50%;
        background:linear-gradient(#EE1515 0 50%,#fff 50% 100%);border:2px solid #0C0C12;box-shadow:inset 0 0 0 2px #0C0C12}
  .you{display:flex;align-items:center;gap:7px;background:#16161e;border:1px solid var(--line);
       border-radius:999px;padding:8px 13px;font-weight:800;font-size:14px}
  .ondot{width:9px;height:9px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green)}
  /* monogram */
  .mono{font-family:Georgia,'Times New Roman',serif;font-weight:700;letter-spacing:-1px}
  .mono .amp{color:var(--yellow)}
  /* status icon */
  .xc{width:30px;height:30px;border-radius:50%;border:2.4px solid var(--red);
      display:inline-grid;place-items:center;flex:none}
  .xc:before{content:'✕';color:var(--red);font-size:15px;font-weight:900;line-height:1}
  .cap{font-size:12px;font-weight:800;letter-spacing:1.6px;color:var(--green);text-transform:uppercase}
  .prod{color:var(--yellow);font-weight:800}
  .chip{display:inline-block;background:rgba(255,203,5,.12);color:var(--yellow);
        font-weight:800;font-size:13px;padding:5px 12px;border-radius:999px}
  .label{display:flex;flex-wrap:wrap}
</style>`;

const appbar = `
  <div class="appbar">
    <div class="pill"><span class="pball"></span>Pokémon <span style="opacity:.5">»</span></div>
    <div class="you"><span class="ondot"></span>You <span style="opacity:.45">★ ∞</span></div>
  </div>`;

// glowy card shared by comps that use the "TODAY" gradient look
const glowCard = (inner, extra='') => `
  <div style="position:relative;border-radius:22px;padding:1px;
       background:linear-gradient(160deg, rgba(74,222,128,.55), rgba(74,222,128,.05) 40%, var(--line));${extra}">
    <div style="border-radius:21px;background:
         radial-gradient(120% 80% at 50% -10%, rgba(74,222,128,.10), transparent 55%), var(--card);
         padding:28px 22px">
      ${inner}
    </div>
  </div>`;

// ---- COMP A — Centered hero + gradient. logo in app header. ----
const A = `
  <div class="appbar">
    <div class="pill">
      <span class="mono" style="font-size:14px">B<span class="amp">&amp;</span>N</span>
      <span style="width:1px;height:14px;background:var(--line)"></span>
      <span class="pball"></span>Pokémon <span style="opacity:.5">»</span>
    </div>
    <div class="you"><span class="ondot"></span>You <span style="opacity:.45">★ ∞</span></div>
  </div>
  ${glowCard(`
    <div style="text-align:center">
      <div style="font-size:26px;font-weight:900;letter-spacing:-.5px;line-height:1.1">Barnes &amp; Noble</div>
      <div style="color:var(--muted);font-size:14px;margin-top:7px">160 S. Westlake Blvd Ste M</div>
      <div style="color:#c8c8d4;font-size:13px;font-weight:700;margin-top:6px">Pokémon</div>
      <div style="height:1px;background:var(--line);margin:22px -22px"></div>
      <div style="display:flex;align-items:center;justify-content:center;gap:11px">
        <span class="xc"></span>
        <span style="font-size:22px;font-weight:900;color:var(--red)">Not in stock</span>
      </div>
      <div style="color:var(--muted);font-size:14.5px;margin-top:8px">They don't have it right now.</div>
      <div style="margin-top:14px"><span class="chip">3-pack blister</span></div>
    </div>`)}
  <div style="text-align:center;color:#4a4a57;font-size:11px;margin-top:14px">COMP A · Centered hero + gradient · logo → header</div>`;

// ---- COMP B — Verdict-first. logo = corner monogram. tone-tinted glow (red). ----
const B = `
  ${appbar}
  <div style="position:relative;border-radius:22px;padding:1px;
       background:linear-gradient(160deg, rgba(239,68,68,.55), rgba(239,68,68,.05) 42%, var(--line))">
    <div style="position:absolute;top:16px;left:16px;width:40px;height:40px;border-radius:11px;
         background:#16161e;border:1px solid var(--line);display:grid;place-items:center">
      <span class="mono" style="font-size:15px">B<span class="amp">&amp;</span>N</span>
    </div>
    <div style="border-radius:21px;background:
         radial-gradient(120% 80% at 50% -10%, rgba(239,68,68,.12), transparent 55%), var(--card);
         padding:30px 22px;text-align:center">
      <div style="display:flex;align-items:center;justify-content:center;gap:13px">
        <span class="xc" style="width:34px;height:34px"></span>
        <span style="font-size:27px;font-weight:900;color:var(--red);letter-spacing:-.5px">Not in stock</span>
      </div>
      <div style="color:var(--muted);font-size:15px;margin-top:9px">They don't have it right now.</div>
      <div style="margin-top:13px"><span class="chip">3-pack blister</span></div>
      <div style="height:1px;background:var(--line);margin:22px -22px"></div>
      <div style="font-size:18px;font-weight:800;letter-spacing:-.3px">Barnes &amp; Noble</div>
      <div style="color:var(--muted);font-size:13px;margin-top:4px">160 S. Westlake Blvd · Pokémon</div>
    </div>
  </div>
  <div style="text-align:center;color:#4a4a57;font-size:11px;margin-top:14px">COMP B · Verdict-first · logo → corner monogram</div>`;

// ---- COMP C — Status pill top-left + faint logo watermark. ----
const C = `
  ${appbar}
  ${glowCard(`
    <div style="position:absolute;right:14px;top:44px;font-size:120px;opacity:.05;
         font-family:Georgia,serif;font-weight:700;pointer-events:none;line-height:1">B&amp;N</div>
    <div style="position:relative">
      <span style="display:inline-flex;align-items:center;gap:8px;background:rgba(239,68,68,.12);
           border:1px solid rgba(239,68,68,.35);color:var(--red);font-weight:800;font-size:13px;
           padding:6px 13px 6px 9px;border-radius:999px">
        <span style="width:16px;height:16px;border-radius:50%;border:2px solid var(--red);display:inline-grid;place-items:center;font-size:9px;line-height:1">✕</span>
        Not in stock
      </span>
      <div style="text-align:center;margin-top:26px">
        <div style="font-size:26px;font-weight:900;letter-spacing:-.5px;line-height:1.1">Barnes &amp; Noble</div>
        <div style="color:var(--muted);font-size:14px;margin-top:7px">160 S. Westlake Blvd Ste M</div>
        <div style="color:#c8c8d4;font-size:13px;font-weight:700;margin-top:6px">Pokémon</div>
        <div style="color:var(--muted);font-size:14px;margin-top:16px">They don't have it right now.</div>
        <div style="margin-top:13px"><span class="chip">3-pack blister</span></div>
      </div>
    </div>`, 'overflow:hidden')}
  <div style="text-align:center;color:#4a4a57;font-size:11px;margin-top:14px">COMP C · Status pill + logo watermark</div>`;

// ---- COMP D — Clean store box + tone-tinted status ribbon. logo → rail tabs only. ----
const D = `
  ${appbar}
  <div style="position:relative;border-radius:22px;padding:1px;
       background:linear-gradient(160deg, rgba(74,222,128,.5), rgba(74,222,128,.05) 45%, var(--line));overflow:hidden">
    <div style="border-radius:21px;background:
         radial-gradient(120% 80% at 50% -20%, rgba(74,222,128,.10), transparent 55%), var(--card)">
      <div style="padding:30px 22px 26px;text-align:center">
        <div style="font-size:26px;font-weight:900;letter-spacing:-.5px;line-height:1.1">Barnes &amp; Noble</div>
        <div style="color:var(--muted);font-size:14px;margin-top:7px">160 S. Westlake Blvd Ste M · Pokémon</div>
      </div>
      <div style="background:rgba(239,68,68,.10);border-top:1px solid rgba(239,68,68,.25);
           padding:16px 22px;display:flex;align-items:center;justify-content:center;gap:11px;flex-wrap:wrap">
        <span style="width:22px;height:22px;border-radius:50%;border:2.2px solid var(--red);display:inline-grid;place-items:center;font-size:11px;color:var(--red);font-weight:900">✕</span>
        <span style="font-weight:900;color:var(--red);font-size:17px">Not in stock</span>
        <span style="color:#4a4a57">·</span>
        <span class="prod" style="font-size:15px">3-pack blister</span>
      </div>
    </div>
  </div>
  <div style="color:var(--muted);font-size:13px;margin-top:8px;padding-left:4px">They don't have it right now.</div>
  <div style="text-align:center;color:#4a4a57;font-size:11px;margin-top:14px">COMP D · Status ribbon · logo → rail tabs</div>`;

const comps = { A, B, C, D };

for (const [k, body] of Object.entries(comps)) {
  const html = `<!doctype html><html><head>${HEAD}</head><body><div class="frame">${body}</div></body></html>`;
  const f = `${OUT}/comp${k}.html`;
  writeFileSync(f, html);
  execFileSync(SHELL, [
    '--headless', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=2', '--default-background-color=ff08080c',
    '--window-size=440,820',
    `--screenshot=${OUT}/comp${k}.png`,
    `file://${f}`,
  ], { stdio: 'pipe' });
  console.log('rendered', k);
}
