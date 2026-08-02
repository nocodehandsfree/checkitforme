// THE ROBOT STORE HARNESS — one command, and every scenario is proven end to end.
//
// Spec: docs/specs/robot-store/README.md. Read section 1 before changing anything here.
//
// EXACTLY ONE THING IN THIS RUN IS FAKE: the person who answers the phone. The website is the REAL
// staging site in a real browser, the dial and the carrier and the transcriber are real, and the
// Admin record is the real one. There is NO replica of the site anywhere in here and there must
// never be: a copy drifts from the real thing inside a week, and then the test proves the copy.
//
// It only ever taps what a customer can tap. No test-only button, no link that skips a screen, no
// seeded state. It signs in the way anyone signs in, searches the way anyone searches, and presses
// the same green button. The one thing it does out of band is tell the ROBOT which scene to play,
// which is the robot's dial, not the site's.
//
// Run:  ADMIN_TOKEN=adm_... node scripts/robot-check.mjs           (all ten)
//       ADMIN_TOKEN=adm_... node scripts/robot-check.mjs 7 8       (just those)
// Every phase is photographed, because a description of a screen is not a screen.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readCheck, linesOf, printCheck } from "./what-happened.mjs";

const HOST = process.env.CHECK_HOST || "https://staging.checkitforme.com";
const TOKEN = process.env.ADMIN_TOKEN || "";
const PHONE = process.env.OWNER_PHONE || "+13106662331";
const CODE = process.env.STAGING_LOGIN_CODE || "000000";
const STORE = process.env.ROBOT_STORE_NAME || "MVPs";
const OUT = process.env.ROBOT_OUT || "./robot-run";
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const wanted = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);

// Driving the site needs a key and a browser; reading the word comparison (which the robot store's
// own test does, to prove the comparison really fails on a mangled transcript) needs neither.
let SITE = HOST;
const CLI = import.meta.url === `file://${process.argv[1]}`;
if (CLI) {
  if (!TOKEN) { console.error("No ADMIN_TOKEN. Pull it from Railway (CLAUDE.md has the curl)."); process.exit(2); }
  if (!existsSync(EXE)) { console.error("No browser at " + EXE + " — the harness cannot drive the real site without one."); process.exit(2); }
  mkdirSync(OUT, { recursive: true });
}

const adm = async (path, opts = {}) => {
  const r = await fetch(HOST + path, { ...opts, headers: { "x-admin-token": TOKEN, "content-type": "application/json", ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ---- a plain pipe to the real site, for machines whose browser cannot open an encrypted connection
// Some build machines (this repo's own agent sandbox is one) let a script reach the internet but
// block the browser from making an encrypted connection. That must NEVER become an excuse to point
// the harness at a copy of the site: a copy drifts inside a week and then the test proves the copy.
// So the browser is pointed at a pipe that forwards every single request, byte for byte, to the REAL
// staging site and hands back exactly what it says. Every page, every script, every answer is the
// real server's. On a normal machine there is no pipe at all and the browser goes straight there.
async function browserCanReach(url) {
  const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
  try {
    const p = await (await b.newContext({ ignoreHTTPSErrors: true })).newPage();
    const r = await p.goto(url + "/api/health", { timeout: 15000 });
    return !!r && r.status() < 500;
  } catch { return false; } finally { await b.close(); }
}

function startPipe(target) {
  const srv = createServer(async (req, res) => {
    try {
      const headers = { ...req.headers };
      delete headers.host; delete headers.connection; delete headers["accept-encoding"];
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const r = await fetch(target + req.url, {
        method: req.method, headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
        redirect: "manual",
      });
      const out = {};
      r.headers.forEach((v, k) => { if (!["content-encoding", "content-length", "transfer-encoding", "strict-transport-security"].includes(k)) out[k] = v; });
      res.writeHead(r.status, out);
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.writeHead(502); res.end(String(e).slice(0, 200)); }
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}

// ---- the report ---------------------------------------------------------------------------------
const runs = [];
let current = null;
const item = (n, name, pass, detail) => { current.items.push({ n, name, pass, detail }); };
const shot = async (page, name) => {
  const f = `${OUT}/${String(current.scenario).padStart(2, "0")}-${name}.png`;
  try { await page.screenshot({ path: f, fullPage: false }); current.shots.push(f); } catch (e) { current.shots.push(`(failed: ${String(e).slice(0, 60)})`); }
};

// ---- the site, tapped like a thumb --------------------------------------------------------------
async function signInIfNeeded(page) {
  const overlay = await page.$("#authOverlay.on");
  if (!overlay) return false;
  await page.fill("#auth_phone", PHONE.replace(/^\+1/, ""));
  await page.click("#auth_send");
  await page.waitForSelector("#auth_step_code", { state: "visible", timeout: 20000 });
  await page.fill("#auth_code", CODE);
  await page.waitForFunction(() => !document.getElementById("authOverlay").classList.contains("on"), null, { timeout: 25000 });
  return true;
}

async function findAndCheck(page) {
  await page.goto(SITE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  await page.fill("#search", STORE);
  await page.waitForTimeout(1600);
  const row = page.locator(`#storelist .store`, { hasText: STORE }).first();
  await row.waitFor({ state: "visible", timeout: 20000 });
  await row.click();
  await page.waitForTimeout(900);
  await shot(page, "store-found");
  const tap = async () => {
    const sheet = page.locator("#cs_call");
    if (await sheet.isVisible().catch(() => false)) return sheet.click();
    return page.locator("#checkBtn").click();
  };
  await tap();
  await page.waitForTimeout(1200);
  if (await signInIfNeeded(page)) { // signed in mid tap: the sheet comes back and the button is pressed again
    await page.waitForTimeout(2500);
    await tap();
    await page.waitForTimeout(1200);
  }
  // THE ONE HOUR WARNING. It only shows when this device really did check this store recently, which
  // is exactly what happens from the second scenario onward. Never seeded.
  const again = await page.$("#againOverlay.on");
  if (again) {
    await shot(page, "checked-recently");
    const body = (await page.textContent("#again_body").catch(() => "")) || "";
    await page.click("#again_yes");
    await page.waitForTimeout(800);
    return { warned: true, warning: body.trim() };
  }
  return { warned: false, warning: null };
}

/** Watch the check happen. Samples the header, the conversation on screen, and the scroll, so the
 *  order of the phases, the greeting on the LIVE view and the bouncing are all measured, not guessed. */
async function watchLive(page, maxMs) {
  const t0 = Date.now();
  const phases = [];
  let firstStaff = null, bounces = 0, lastHtml = null, lastY = null, pinTop = null, ticks = 0, sawLive = false;
  while (Date.now() - t0 < maxMs) {
    const s = await page.evaluate(() => {
      const live = document.getElementById("live");
      const on = live && !live.classList.contains("hidden");
      const head = (document.getElementById("lh_state") || document.getElementById("phase") || {}).textContent || "";
      const bubs = [...document.querySelectorAll("#live_msgbox .ctlv2-bub, #live_msgbox .ctl-bub")].map((b) => ({
        who: (b.querySelector(".who") || {}).textContent || "",
        tx: (b.querySelector(".tx") || {}).textContent || "",
      }));
      const pin = document.getElementById("live_pin");
      return {
        on, head: head.trim(), bubs,
        html: (document.getElementById("live_msgbox") || {}).innerHTML || "",
        y: Math.round(window.scrollY),
        pinTop: pin ? Math.round(pin.getBoundingClientRect().top) : null,
        resultUp: !document.getElementById("result").classList.contains("hidden"),
      };
    }).catch(() => null);
    if (!s) { await sleep(700); continue; }
    ticks++;
    if (s.on) sawLive = true;
    if (s.head && phases[phases.length - 1] !== s.head) phases.push(s.head);
    if (s.on && s.pinTop != null) pinTop = pinTop == null ? s.pinTop : Math.min(pinTop, s.pinTop);
    // BOUNCING: the page moved while the conversation did not change. That is the 08-01 fault.
    if (s.on && lastHtml != null && s.html === lastHtml && lastY != null && Math.abs(s.y - lastY) > 8) bounces++;
    lastHtml = s.html; lastY = s.y;
    if (!firstStaff) {
      const st = s.bubs.filter((b) => /STAFF|ASOC/i.test(b.who));
      if (st.length) firstStaff = { bubs: s.bubs.map((b) => ({ who: b.who.trim(), tx: b.tx.trim() })), atMs: Date.now() - t0 };
    }
    if (s.resultUp && !s.on) return { phases, firstStaff, bounces, pinTop, ticks, sawLive, finished: true };
    await sleep(700);
  }
  return { phases, firstStaff, bounces, pinTop, ticks, sawLive, finished: false };
}

// ---- word for word ------------------------------------------------------------------------------
// The robot's script is known exactly, so this is arithmetic, not opinion. Our own history is full of
// what it catches: "CVS" written down as "CBS", as "CDS there" and as "Seabass"; four turns welded
// into one line with no space between them; a whole store menu recorded as one 181 second line.
export function compareWords(said, lines) {
  const staffLines = lines.filter((l) => l.startsWith("Clerk:")).map((l) => l.slice(6).trim());
  const misses = [];
  for (const s of said) {
    const want = norm(s.text);
    const hit = staffLines.some((l) => norm(l) === want) ? "exact"
      : staffLines.some((l) => norm(l).includes(want)) ? "swallowed by a longer line"
      : staffLines.some((l) => want.includes(norm(l)) && norm(l).length > 8) ? "written down only in part"
      : "missing";
    if (hit !== "exact") misses.push({ said: s.text, how: hit });
  }
  const extra = staffLines.filter((l) => !said.some((s) => norm(s.text) === norm(l)));
  return { misses, extra, staffLines };
}

// ---- one scenario -------------------------------------------------------------------------------
async function runOne(page, scene, greetingIdx) {
  current = { scenario: scene.n, name: scene.name, items: [], shots: [], startedAt: Date.now() };
  runs.push(current);
  console.log(`\n══════ scenario ${scene.n} · ${scene.name} ══════`);
  await adm("/api/admin/robot-store", { method: "POST", body: JSON.stringify({ scenario: scene.n, greeting: greetingIdx }) });

  const found = await findAndCheck(page);
  item(1, "the store is found from the main page and Check it is tapped", true, `searched "${STORE}"`);
  item(2, "the one hour warning, then Check again", found.warned, found.warned ? `it said: ${found.warning}` : "not shown (this device had not checked this store within the hour)");

  await page.waitForTimeout(2500);
  await shot(page, "checking");
  const maxMs = scene.n === 6 ? 260000 : 200000;
  const live = await watchLive(page, maxMs);
  await shot(page, "live");

  // 3. the header moves through its phases IN ORDER and never backwards.
  const seen = new Set(); let backwards = null;
  for (const p of live.phases) { if (seen.has(p)) backwards = p; seen.add(p); }
  item(3, "the header moves through its phases in order, never backwards", !backwards && live.phases.length > 1,
    backwards ? `it went back to "${backwards}"` : live.phases.join(" → ") || "(no header seen)");

  // 4 + 5. Staff's greeting, on the LIVE view, first and on its own.
  const robot = await adm(`/api/admin/robot-store`);
  const said = robot.run?.said || [];
  const greeting = robot.run?.greeting || "";
  const lv = live.firstStaff;
  if (!lv) item(4, "Staff's greeting is the first line, on the live view", false, "no Staff line ever appeared on the live view");
  else {
    const firstStaffIx = lv.bubs.findIndex((b) => /STAFF|ASOC/i.test(b.who));
    const firstStaffTx = lv.bubs[firstStaffIx]?.tx || "";
    item(4, "Staff's greeting is the first line, on the live view", norm(firstStaffTx) === norm(greeting),
      `live view showed: "${firstStaffTx}"  ·  robot said: "${greeting}"`);
    item(5, "the greeting is its own line, never welded to their answer", norm(firstStaffTx) === norm(greeting),
      norm(firstStaffTx) === norm(greeting) ? "one line, nothing else in it" : `it carries more than the greeting: "${firstStaffTx}"`);
  }

  // wait for the record, then read it through the ONE reader.
  await page.waitForTimeout(4000);
  await shot(page, "result");
  const resultText = (await page.textContent("#result").catch(() => "")) || "";
  let rec = null;
  for (let i = 0; i < 12 && !rec; i++) {
    const r = await readCheck(HOST, TOKEN, null).catch(() => null);
    if (r && (r.call.startedAt || 0) * 1000 > current.startedAt - 120000) rec = r; else await sleep(5000);
  }
  if (!rec) { item(6, "the words match what the robot actually said", false, "the check never reached the record"); return; }
  const lines = linesOf(rec);
  current.checkId = rec.id;
  current.cost = rec.call.costTotalUsd ?? null;
  current.charged = !!rec.call.chargedAt;
  current.statusKey = rec.call.statusKey || rec.call.status;

  // 4b. the same greeting rule at the END, not only live.
  const firstLine = lines[0] || "";
  const firstStaffWritten = (lines.find((l) => l.startsWith("Clerk:")) || "").slice(6).trim();
  item(4.1, "Staff's greeting is the first line of the written conversation", firstLine.startsWith("Clerk:") && norm(firstStaffWritten) === norm(greeting),
    `first written line: "${firstLine.slice(0, 80)}"`);
  item(5.1, "the written greeting is its own line", norm(firstStaffWritten) === norm(greeting),
    `written: "${firstStaffWritten}"  ·  said: "${greeting}"`);

  // 6. word for word.
  const cmp = compareWords(said, lines);
  item(6, "the words match what the robot actually said, word for word", cmp.misses.length === 0,
    cmp.misses.length ? cmp.misses.map((m) => `"${m.said}" → ${m.how}`).join(" | ") : `${said.length} lines, all exact`);

  // 7 + 8. the page itself.
  item(7, "the conversation scrolls under the header and does not bounce when nothing is new",
    live.bounces === 0 && (live.pinTop == null || live.pinTop >= -2),
    `${live.bounces} bounce(s) over ${live.ticks} looks · header held at ${live.pinTop}px`);
  const log = await page.evaluate(() => {
    const d = document.querySelector("#result details");
    if (!d) return { has: false };
    const before = d.getBoundingClientRect().height;
    d.querySelector("summary")?.click();
    return { has: true, before, after: d.getBoundingClientRect().height, open: d.open };
  }).catch(() => ({ has: false }));
  item(8, "the log expands", !!log.has && !!log.open && log.after > log.before, log.has ? `${Math.round(log.before)}px → ${Math.round(log.after)}px` : "no log on the result");

  // 9 + 11. the verdict.
  const verdictShown = /in stock|not in stock|no clear answer|sold out|nobody|didn't answer|did not answer/i.test(resultText);
  item(9, "the result appears with a status", verdictShown, resultText.replace(/\s+/g, " ").slice(0, 120));
  item(11, "the verdict is RIGHT for this scenario", current.statusKey === scene.expect,
    `got ${current.statusKey} · this scenario is ${scene.expect}`);

  // 10. money.
  const mustNotCharge = scene.n === 9; // they hung up without ever hearing us: there is no answer to sell
  item(10, "nothing is charged that should not be, and a charged check says so",
    !(mustNotCharge && current.charged),
    `${current.charged ? "CHARGED" : "not charged"} · ${current.cost != null ? "$" + Number(current.cost).toFixed(4) : "not priced"}`);

  printCheck(rec);
}

// ---- go -----------------------------------------------------------------------------------------
if (CLI) {
const cfg = await adm("/api/admin/robot-store");
const scenes = cfg.scenes.filter((s) => !wanted.length || wanted.includes(s.n));
const direct = await browserCanReach(HOST);
const pipe = direct ? null : await startPipe(HOST);
SITE = direct ? HOST : pipe.url;
console.log(direct ? `browser goes straight to ${HOST}` : `this machine's browser cannot open an encrypted connection, so it reaches the REAL ${HOST} through a local pipe (${pipe.url}). Every page and every answer is still the real server's.`);
const b = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(String(e).slice(0, 160)));

for (let i = 0; i < scenes.length; i++) {
  try { await runOne(page, scenes[i], i % cfg.greetings.length); }
  catch (e) { item(0, "the walk itself", false, String(e).slice(0, 200)); await shot(page, "crash"); }
}
await b.close();
pipe?.close();

// ---- what happened ------------------------------------------------------------------------------
let failed = 0;
console.log("\n\n══════════ THE ROBOT STORE RUN ══════════");
for (const r of runs) {
  const bad = r.items.filter((x) => !x.pass);
  failed += bad.length;
  console.log(`\nscenario ${r.scenario} · ${r.name}${r.checkId ? ` · check ${r.checkId}` : ""} — ${bad.length ? `${bad.length} FAILED` : "all held"}`);
  for (const x of r.items) console.log(`  ${x.pass ? "✓" : "✗"} ${x.name}\n      ${x.detail}`);
  console.log(`  photos: ${r.shots.length}`);
}
const priced = runs.filter((r) => r.cost != null);
const total = priced.reduce((a, r) => a + Number(r.cost), 0);
console.log(`\ncost, measured off the checks themselves: ${priced.length} of ${runs.length} priced · $${total.toFixed(4)} total · $${priced.length ? (total / priced.length).toFixed(4) : "0"} each`);
if (jsErrors.length) { failed++; console.log(`✗ the page threw: ${jsErrors.join(" | ")}`); }
writeFileSync(`${OUT}/run.json`, JSON.stringify({ at: new Date().toISOString(), host: HOST, runs, jsErrors }, null, 2));
console.log(`the whole run: ${OUT}/run.json · photos in ${OUT}/`);
console.log(failed ? `\nROBOT STORE: ${failed} FAILED\n` : "\nROBOT STORE: every scenario held\n");
process.exit(failed ? 1 : 0);
}
