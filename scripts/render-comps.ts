// EYES for agents: render the design comps and live views to PNGs, then LOOK at them (open the
// image files). The comp board loads React from a CDN that is BLOCKED in agent sandboxes — it
// renders as a BLACK PAGE with "[bundle] error" (that's how the 2026-07-02 paint-not-structure
// failure happened: the implementer could never see the design). This tool serves the vendored
// React in docs/design/vendor/ instead, so the board renders offline.
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
const DESIGN = join(here, "../docs/design");
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

/** Tiny static server for docs/design (the board misbehaves under file://). */
function serveDesign(): Promise<{ port: number; close: () => void }> {
  return new Promise((res) => {
    const srv = createServer((req, r) => {
      try {
        const f = join(DESIGN, decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, ""));
        if (!f.startsWith(DESIGN)) { r.writeHead(403); r.end(); return; }
        r.writeHead(200, { "content-type": f.endsWith(".html") ? "text/html" : "application/octet-stream" });
        r.end(readFileSync(f));
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
  // CDN React -> the vendored copies; external fonts/logos abort quietly (offline sandbox).
  await ctx.route("**://unpkg.com/**", (route) => {
    const f = route.request().url().includes("react-dom") ? "react-dom.production.min.js" : "react.production.min.js";
    route.fulfill({ body: readFileSync(join(DESIGN, "vendor", f), "utf8"), contentType: "application/javascript" });
  });
  // Fonts render TRUTHFULLY from the vendored files (aborting them hid font/weight crimes from
  // verification — the 2026-07-02 "wrong font, no pop" miss). Logos still abort (offline sandbox).
  await ctx.route(/https:\/\/fonts\.googleapis\.com\//, (r) =>
    r.fulfill({ body: readFileSync(join(DESIGN, "vendor/fonts/inter.css"), "utf8"), contentType: "text/css" }));
  await ctx.route(/https:\/\/fonts\.gstatic\.com\//, (r) => r.abort());
  await ctx.route(/\/inter-\d+\.woff2$/, (r) =>
    r.fulfill({ body: readFileSync(join(DESIGN, "vendor/fonts", r.request().url().split("/").pop() as string)), contentType: "font/woff2" }));
  await ctx.route(/https:\/\/(checkitforme\.com|logos\.)/, (r) => r.abort());
  // Signed-in renders: CIFM_TOKEN=<phone-session JWT> (localStorage key the app reads is cifm_token).
  if (process.env.CIFM_TOKEN) await ctx.addInitScript((t: string) => { try { localStorage.setItem("cifm_token", t); } catch { /* no storage */ } }, process.env.CIFM_TOKEN);
  const page = await ctx.newPage();

  if (mode === "board") {
    const srv = await serveDesign();
    await page.goto(`http://127.0.0.1:${srv.port}/NEW_CHECK_COMPS.html`, { waitUntil: "load", timeout: 60000 });
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
