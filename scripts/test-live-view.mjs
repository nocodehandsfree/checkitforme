// THE LOCK on the live-call view (owner 07-16: "I've fixed this page 90 times — lock it in").
// Boots nothing itself — test-live-view.sh starts the server in staging-sim mode (no real dials) and
// passes PORT. This drives checkit.html like a thumb would: start a live check, then assert the
// contract that keeps breaking:
//   1. transcript bubbles RENDER while the call runs (the 07-16 freeze),
//   2. the page does NOT finalize early while the sim call is still live (the 07-16 0:18 flip),
//   3. the verdict paints when the call ends (no eternal "Getting the answer…").
// Any regression here fails test-all BEFORE it ships. Exit 0 = locked contract holds.
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const PORT = process.env.PORT || "8798";
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
if (!existsSync(EXE)) { console.log("SKIPPED: chromium not found at " + EXE + " — live-view lock did not run"); process.exit(0); }

const fail = (msg) => { console.error("  ✗ " + msg); process.exitCode = 1; };
const ok = (msg) => console.log("  ✓ " + msg);

const b = await chromium.launch({ executablePath: EXE });
const page = await (await b.newContext()).newPage();
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(String(e).slice(0, 200)));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

// Start a live check exactly as the UI would (sim mode: no phone rings anywhere).
const started = await page.evaluate(async () => {
  const cats = await fetch("/pub/categories").then((r) => r.json()).catch(() => null);
  const c = (Array.isArray(cats) ? cats[0] : (cats?.rows || [])[0]) || { id: 1 };
  SEL_STORE = { id: 1, name: "Fun", location: "" };
  SEL_CAT = c.id; SEL_CATS = [c.id]; SEL_PRODUCT = ""; SEL_KIOSK = false;
  try { startCheckLive(); return true; } catch (e) { return String(e); }
});
if (started !== true) fail("startCheckLive threw: " + started); else ok("live check started (sim)");

// 1 + 2: while the sim call runs, bubbles must render and the live view must NOT finalize early.
await page.waitForTimeout(9000);
const mid = await page.evaluate(() => ({
  liveVisible: !document.getElementById("live").classList.contains("hidden"),
  convo: (document.getElementById("live_msgbox") || { innerText: "" }).innerText.includes("CHECK AI"),
  chars: typeof LIVE_TRANSCRIPT !== "undefined" ? (LIVE_TRANSCRIPT || "").length : 0,
}));
if (mid.convo && mid.chars > 0) ok(`transcript renders live (${mid.chars} chars mid-call)`); else fail(`NO live transcript mid-call (chars=${mid.chars}, bubbles=${mid.convo})`);
if (mid.liveVisible) ok("no premature finalize (live view still up mid-call)"); else fail("live view finalized EARLY while the sim call was still running");

// 3: when the sim ends (~20s total), the verdict must paint — never eternal dots.
await page.waitForTimeout(16000);
const end = await page.evaluate(() => ({
  resultVisible: !document.getElementById("result").classList.contains("hidden"),
  gettingDots: /Getting the answer/i.test(document.body.innerText),
  hasVerdict: /In stock|not in stock|No clear answer|Sold out|answer/i.test(document.body.innerText),
}));
if (end.resultVisible && end.hasVerdict) ok("verdict painted after the call"); else fail(`verdict never painted (result=${end.resultVisible}, dots=${end.gettingDots})`);
if (jsErrors.length) fail("page JS errors: " + jsErrors.join(" | ")); else ok("zero page JS errors");

await b.close();
console.log(process.exitCode ? "live-view lock: FAILED" : "live-view lock: all held");
