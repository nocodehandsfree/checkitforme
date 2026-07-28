// EYES for agents: render the design comps and live views to PNGs, then LOOK at them (open the
// image files). The comp board loads React from a CDN that is BLOCKED in agent sandboxes — it
// renders as a BLACK PAGE with "[bundle] error" (that's how the 2026-07-02 paint-not-structure
// failure happened: the implementer could never see the design). This tool serves the vendored
// React in docs/design/comps/vendor/ instead, so the board renders offline.
// Usage:
//   ./node_modules/.bin/tsx scripts/render-comps.ts board                     # master board, sliced
//   ./node_modules/.bin/tsx scripts/render-comps.ts url <url> <name> [width]  # any (local) URL
// Output: loops/site-redesign/render/*.png — gitignored; view locally, never commit.
import { createServer } from "node:http";
import { readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const DESIGN = join(here, "../docs/design/comps");
const OUT = join(here, "../loops/site-redesign/render");

function chromePath(): string {
  if (process.env.CHROME_EXE) return process.env.CHROME_EXE;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  for (const d of readdirSync(root)) {
    const p = join(root, d, "chrome-linux", "chrome");
    if (d.startsWith("chromium") && existsSync(p)) return p;
  }
  throw new Error("no chromium found — set CHROME_EXE=<path to chrome>");
}

/** Tiny static server for docs/design/comps (the board misbehaves under file://). */
function serveDesign(): Promise<{ port: number; close: () => void }> {
  return new Promise((res) => {
    const srv = createServer((req, r) => {
      try {
        const f = join(DESIGN, decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, ""));
        if (!f.startsWith(DESIGN)) { r.writeHead(403); r.end(); return; }
        // READ FIRST, then send. A missing file used to throw after the 200 header had already gone
        // out, and the catch below crashed the whole renderer trying to send a 404 on top of it — so
        // one absent asset meant an agent could never see the comp at all (07-28).
        const body = readFileSync(f);
        r.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : "application/octet-stream" });
        r.end(body);
      } catch { r.writeHead(404); r.end(); }
    });
    srv.listen(0, "127.0.0.1", () => res({ port: (srv.address() as { port: number }).port, close: () => srv.close() }));
  });
}

async function main() {
  const [mode, a1, a2, a3] = process.argv.slice(2);
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath(), args: ["--no-sandbox"] });
  const width = mode === "board" ? 1500 : Number(a3 || 390);
  const ctx = await browser.newContext({ viewport: { width, height: 1100 }, deviceScaleFactor: mode === "board" ? 1 : 2 });
  // CDN React and the fonts come from docs/design/comps/vendor/ when it is there. It is NOT there
  // after the rebuild, and the admin board is plain HTML that needs neither — so a missing vendor
  // file now aborts the request quietly instead of throwing, which used to kill the whole render and
  // leave an agent unable to see any comp at all (07-28).
  const vendored = (rel: string): Buffer | null => {
    try { return readFileSync(join(DESIGN, "vendor", rel)); } catch { return null; }
  };
  await ctx.route("**://unpkg.com/**", (route) => {
    const f = route.request().url().includes("react-dom") ? "react-dom.production.min.js" : "react.production.min.js";
    const body = vendored(f);
    if (body) route.fulfill({ body: body.toString("utf8"), contentType: "application/javascript" }); else route.abort();
  });
  // Fonts render TRUTHFULLY from the vendored files when present (aborting them hid font/weight
  // crimes from verification — the 2026-07-02 "wrong font, no pop" miss). Logos always abort.
  await ctx.route(/https:\/\/fonts\.googleapis\.com\//, (r) => {
    const body = vendored("fonts/inter.css");
    if (body) r.fulfill({ body: body.toString("utf8"), contentType: "text/css" }); else r.abort();
  });
  await ctx.route(/https:\/\/fonts\.gstatic\.com\//, (r) => r.abort());
  await ctx.route(/\/inter-\d+\.woff2$/, (r) => {
    const body = vendored(`fonts/${r.request().url().split("/").pop()}`);
    if (body) r.fulfill({ body, contentType: "font/woff2" }); else r.abort();
  });
  await ctx.route(/https:\/\/(checkitforme\.com|logos\.)/, (r) => r.abort());
  // Signed-in renders: CIFM_TOKEN=<phone-session JWT> (localStorage key the app reads is cifm_token).
  if (process.env.CIFM_TOKEN) await ctx.addInitScript((t: string) => { try { localStorage.setItem("cifm_token", t); } catch { /* no storage */ } }, process.env.CIFM_TOKEN);
  const page = await ctx.newPage();

  if (mode === "board") {
    const srv = await serveDesign();
    // The consumer boards moved to docs/archive/ in the rebuild; ADMIN_COMPS is the one active board.
    // Name it as the argument to render a different one: `render-comps.ts board ADMIN_COMPS.dc.html`.
    const board = a1 || (existsSync(join(DESIGN, "WEBSITE_COMPS.dc.html")) ? "WEBSITE_COMPS.dc.html" : "ADMIN_COMPS.dc.html");
    await page.goto(`http://127.0.0.1:${srv.port}/${board}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(6000);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    const n = Math.min(20, Math.ceil(h / 1100));
    for (let i = 0; i < n; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 1100);
      await page.waitForTimeout(350);
      await page.screenshot({ path: join(OUT, `board-${String(i).padStart(2, "0")}.png`) });
    }
    console.log(`board rendered: height ${h}px -> ${n} slices in loops/site-redesign/render/`);
    srv.close();
  } else if (mode === "url") {
    await page.goto(a1, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(OUT, `${a2 || "view"}.png`) });
    console.log(`rendered ${a1} -> loops/site-redesign/render/${a2 || "view"}.png`);
  } else {
    console.log("usage: render-comps.ts board | url <url> <name> [width]");
    process.exit(1);
  }
  await browser.close();
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
