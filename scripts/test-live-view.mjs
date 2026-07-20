// THE LOCK on the live-call view (owner 07-16: "I've fixed this page 90 times — lock it in").
// Boots nothing itself — test-live-view.sh starts the server in staging-sim mode (no real dials) and
// passes PORT. This drives checkit.html like a thumb would: start a live check, then assert the
// contract that keeps breaking:
//   1. transcript bubbles RENDER while the call runs (the 07-16 freeze),
//   2. the page does NOT finalize early while the sim call is still live (the 07-16 0:18 flip),
//   3. the verdict paints when the call ends (no eternal "Getting the answer…"),
//   4. at PHONE SIZE a long conversation GROWS the page, the view FOLLOWS to the newest bubble and
//      the newest bubble is actually visible (owner 07-17: page clamped/collapsed = dead transcript),
//   5. when the verdict lands the page scrolls BACK TO THE TOP and the step log rolls up (owner 07-17:
//      the instant pending-flip had swallowed the scroll-back).
// Any regression here fails test-all BEFORE it ships. Exit 0 = locked contract holds.
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const PORT = process.env.PORT || "8798";
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
if (!existsSync(EXE)) { console.log("SKIPPED: chromium not found at " + EXE + " — live-view lock did not run"); process.exit(0); }

const fail = (msg) => { console.error("  ✗ " + msg); process.exitCode = 1; };
const ok = (msg) => console.log("  ✓ " + msg);

const b = await chromium.launch({ executablePath: EXE });
// iPhone-size viewport — the clamp/collapse class of bug only shows when content exceeds one screen.
const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
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

// 4: a conversation taller than the screen must GROW the page, FOLLOW down, and keep the newest
// bubble visible. Push lines through the same client path the live socket uses.
await page.evaluate(() => {
  for (let i = 0; i < 12; i++) {
    LIVE_TR.push("Agent: Do you have any Scarlet and Violet booster boxes on the shelf today? line " + i);
    LIVE_TR.push("Clerk: Let me go check the card aisle for you, hold on one second there. line " + i);
  }
  LIVE_TRANSCRIPT = LIVE_TR.join("\n");
  renderLiveMsg();
});
await page.waitForTimeout(900); // smooth follow-scroll settles
const tall = await page.evaluate(() => {
  const bubs = [...document.querySelectorAll("#live_msgbox .ctlv2-bub, #live_msgbox .ctl-bub")];
  const last = bubs[bubs.length - 1];
  const r = last ? last.getBoundingClientRect() : { width: 0, height: 0, top: 0, bottom: 0 };
  return {
    grew: document.scrollingElement.scrollHeight > window.innerHeight + 100,
    followed: window.scrollY > 50,
    lastSized: r.width > 50 && r.height > 20,
    lastVisible: r.top < window.innerHeight && r.bottom > 0,
  };
});
if (tall.grew) ok("long conversation grows the page past one screen"); else fail("page CLAMPED to viewport — long conversation cannot extend it");
if (tall.followed) ok("view follows the conversation down"); else fail("scroll-follow dead (page still at the top with a tall conversation)");
if (tall.lastSized && tall.lastVisible) ok("newest bubble rendered and on screen"); else fail(`newest bubble collapsed/off-screen (sized=${tall.lastSized}, visible=${tall.lastVisible})`);
// The conversation must be REACHABLE, not just in the DOM (owner 07-17: a chrome-tint CSS clamp froze
// the page at viewport height with overflow hidden — bubbles rendered invisibly below the fold and
// auto-scroll aimed at a page that could not grow). The newest bubble must be on-screen, or SOME
// scroller must actually be able to bring it on-screen.
const reach = await page.evaluate(() => {
  const box = document.getElementById("live_msgbox");
  if (!box || !box.lastElementChild) return { ok: false, why: "no msgbox content" };
  const r = box.lastElementChild.getBoundingClientRect();
  if (r.height < 3) return { ok: false, why: "newest conversation node is COLLAPSED (zero-size rect) — content renders but cannot be seen" };
  if (r.top >= 0 && r.bottom <= innerHeight) return { ok: true, why: "newest bubble on-screen" };
  let el = box;
  while (el) { // any ancestor that can actually scroll the bubble into view counts
    if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return { ok: true, why: "scrollable via " + (el.id || el.tagName) };
    el = el.parentElement;
  }
  const de = document.scrollingElement;
  if (de && de.scrollHeight > innerHeight + 4) return { ok: true, why: "page scrolls" };
  return { ok: false, why: "conversation CLIPPED: below the fold and nothing scrolls (page clamped to viewport?)" };
});
if (reach.ok) ok("conversation is reachable (" + reach.why + ")"); else fail(reach.why);

// 3: when the sim ends (~20s total), the verdict must paint — never eternal dots.
await page.waitForTimeout(16000);
const end = await page.evaluate(() => ({
  resultVisible: !document.getElementById("result").classList.contains("hidden"),
  gettingDots: /Getting the answer/i.test(document.body.innerText),
  hasVerdict: /In stock|not in stock|No clear answer|Sold out|answer/i.test(document.body.innerText),
}));
if (end.resultVisible && end.hasVerdict) ok("verdict painted after the call"); else fail(`verdict never painted (result=${end.resultVisible}, dots=${end.gettingDots})`);

// 5: the verdict render brings you back to the top and the step log rolls up.
const settle = await page.evaluate(() => ({
  y: window.scrollY,
  stepsOpen: (() => { const d = document.querySelector("#result .ctlv2 details, #result .ctl details"); return d ? d.open : null; })(),
}));
if (settle.y < 120) ok(`scrolled back to the verdict (y=${Math.round(settle.y)})`); else fail(`stuck down the page after the verdict (y=${Math.round(settle.y)})`);
if (settle.stepsOpen === false) ok("step log rolled up on the result"); else if (settle.stepsOpen === true) fail("step log still expanded on the result"); else ok("no step log details node (nothing to roll up)");

if (jsErrors.length) fail("page JS errors: " + jsErrors.join(" | ")); else ok("zero page JS errors");

await b.close();
console.log(process.exitCode ? "live-view lock: FAILED" : "live-view lock: all held");
