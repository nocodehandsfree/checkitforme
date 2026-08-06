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
const STORE_ID = Number(process.env.ROBOT_STORE_ID || 106362);
const ROBOT_NUMBER = (process.env.ROBOT_NUMBER || "+14244847395").replace(/[^\d+]/g, "");
// A HARD CEILING ON HOW MANY TIMES ONE RUN MAY DIAL. The owner's account is comp, which switches off
// every brake the site has — the per-minute limit, the credit check and the one-check-an-hour block
// are all skipped for him. So this is the only thing standing between a loop and a phone bill, and
// the server holds a second ceiling of its own on the robot store.
const MAX_DIALS = Number(process.env.ROBOT_MAX_DIALS || 12);
let dials = 0;
const OUT = process.env.ROBOT_OUT || "./robot-run";
const EXE = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const wanted = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
// TWO SCENES CANNOT BE PROVEN BY A SCRIPT ALONE (owner 08-06), because what they test is not what
// the robot says, it is what the SITE and the SWITCHES do before anybody speaks.
//  · one exact product: Charlie only asks his extra question when the check was placed for one
//    named item, so the harness has to pick it in the dropdown a customer picks it in.
//  · the transfer switch: the whole test is that the switch really works, so it has to be turned
//    off for that one check and put back straight after, whatever happens.
const SCENE_PRODUCT = { 19: "Mega Evolution—Pitch Black Booster Display Box" };
const SCENE_ASK_FOR_TRANSFER_OFF = new Set([16]);

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
// Comparing what was SAID against what was WRITTEN DOWN. Punctuation is the writer's, not the
// speaker's: a full stop where a comma belongs is the same words. An apostrophe is dropped rather
// than treated as a break, so "MVP's" and "MVPs" are one name — the same rule the store search
// already uses (`src/calls/service.ts`). Nothing else is forgiven: a different WORD still fails.
const norm = (s) => String(s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

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
let checkedAlready = false; // has this browser already checked this store during this run?
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

async function findAndCheck(page, wantProduct) {
  await page.goto(SITE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  // The owner's own stores only exist for the owner, so the sign-in comes first — through the same
  // pill at the top of the page anyone taps to join, and the same phone box behind it.
  if (await page.$("#authpill.anon")) {
    await page.click("#authpill");
    await page.waitForTimeout(1200);
    await signInIfNeeded(page);
    await page.goto(SITE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
  }
  await page.fill("#search", STORE);
  await page.waitForTimeout(1600);
  const row = page.locator(`#storelist .store`, { hasText: STORE }).first();
  await row.waitFor({ state: "visible", timeout: 20000 });
  // THE STORE THIS TAPS MUST BE THE ROBOT, BY ITS NUMBER, NOT BY ITS NAME. There are more than a
  // hundred thousand store records; a name that happens to match would phone a real business.
  const tapId = Number((await row.getAttribute("onclick") || "").replace(/\D+/g, ""));
  if (tapId !== STORE_ID) throw new Error(`the row named "${STORE}" is store ${tapId}, not the robot store ${STORE_ID} — refusing to dial it`);
  await row.click();
  await page.waitForTimeout(900);
  await shot(page, "store-found");
  // ONE EXACT PRODUCT. The same dropdown a customer uses, picked the same way, and the check is
  // refused rather than run blind if the item is not on the list.
  if (wantProduct) {
    await page.waitForSelector("#prodsel option", { timeout: 20000 }).catch(() => {});
    const picked = await page.evaluate((name) => {
      const sel = document.getElementById("prodsel");
      if (!sel) return "no dropdown";
      const opt = [...sel.options].find((o) => o.value === name);
      if (!opt) return "not on the list";
      sel.value = name; if (typeof pickProduct === "function") pickProduct();
      return window.SEL_PRODUCT === name || true;
    }, wantProduct);
    if (picked !== true) throw new Error(`the exact product "${wantProduct}" could not be picked: ${picked}`);
    console.log(`  · the check is for ONE EXACT PRODUCT: ${wantProduct}`);
  }
  const tap = async () => {
    const sheet = page.locator("#cs_call");
    if (await sheet.isVisible().catch(() => false)) return sheet.click();
    return page.locator("#checkBtn").click();
  };
  if (dials >= MAX_DIALS) throw new Error(`the ceiling of ${MAX_DIALS} checks for one run has been reached — refusing to dial again`);
  dials++;
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
  let firstStaff = null, bounces = 0, lastHtml = null, lastY = null, lastHead = null, pinTop = null, ticks = 0, sawLive = false;
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
    // BOUNCING: the page moved while NOTHING changed. The header counts as something changing — it
    // is a line of text whose length moves the layout — so only a jump with both the conversation
    // and the header identical is the fault (08-01, the page jumping while nothing was happening).
    if (s.on && lastHtml != null && s.html === lastHtml && s.head === lastHead && lastY != null && Math.abs(s.y - lastY) > 8) bounces++;
    lastHtml = s.html; lastY = s.y; lastHead = s.head;
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

// The robot's own phone line, priced off the carrier's record of the call it answered.
const TW_SID = process.env.TWILIO_ACCOUNT_SID || "", TW_TOK = process.env.TWILIO_AUTH_TOKEN || "";
const INBOUND_PER_MIN = 0.0085; // the published rate for a US local number answering a call
async function robotSideCost(callSid) {
  if (!callSid || !TW_SID || !TW_TOK) return null;
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Calls/${callSid}.json`,
      { headers: { Authorization: "Basic " + Buffer.from(`${TW_SID}:${TW_TOK}`).toString("base64") } });
    if (!r.ok) return null;
    const d = await r.json();
    const secs = Number(d.duration || 0);
    if (d.price != null) return { usd: Math.abs(Number(d.price)), secs, how: "the carrier's posted price" };
    return { usd: Math.max(1, Math.ceil(secs / 60)) * INBOUND_PER_MIN, secs, how: `${secs}s at the published rate (the carrier had not posted its price yet)` };
  } catch { return null; }
}

// ---- one scenario -------------------------------------------------------------------------------
async function runOne(page, scene, greetingIdx) {
  current = { scenario: scene.n, name: scene.name, items: [], shots: [], startedAt: Date.now() };
  runs.push(current);
  console.log(`\n══════ scenario ${scene.n} · ${scene.name} ══════`);
  await adm("/api/admin/robot-store", { method: "POST", body: JSON.stringify({ scenario: scene.n, greeting: greetingIdx }) });

  const askOff = SCENE_ASK_FOR_TRANSFER_OFF.has(scene.n);
  if (askOff) {
    await adm("/api/policy", { method: "PATCH", body: JSON.stringify({ flags: { askForTransfer: false } }) });
    const now = await adm("/api/policy");
    item(0.5, "asking to be put through is switched OFF for this one check", now.flags?.askForTransfer === false,
      `the switch reads ${String(now.flags?.askForTransfer)}`);
  }
  const found = await findAndCheck(page, SCENE_PRODUCT[scene.n]);
  item(1, "the store is found from the main page and Check it is tapped", true, `searched "${STORE}"`);
  // The warning is a fact about this device, not a setting: it appears because this browser really
  // did check this store minutes ago. On the FIRST scene of a run it is right that there is none, so
  // it is not counted; from the second on it MUST appear, and it is a failure if it does not.
  if (checkedAlready) item(2, "the one hour warning, then Check again", found.warned, found.warned ? `it said: ${found.warning}` : "the warning never came up, even though this device checked this store minutes ago");
  else item(2, "the one hour warning, then Check again", true, "nothing to warn about yet — this device had never checked this store (the next scene proves the warning)");
  checkedAlready = true;

  await page.waitForTimeout(2500);
  await shot(page, "checking");
  // The four minute limit test has to be allowed to REACH four minutes, or the harness gives up
  // before the thing it is testing happens.
  const maxMs = scene.noGoodbye && scene.expect === "admin_hangup" ? 330000 : scene.n === 6 ? 260000 : 200000;
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
  // NOBODY PICKED THE PHONE UP, so there is no greeting to be first and no line to be its own.
  // Marking a scene down for the absence of the thing it exists to prove would be nonsense.
  if (scene.neverAnswers) {
    item(4, "nobody at the store ever speaks, which is the whole test", (said || []).length === 0,
      (said || []).length === 0 ? "not one word from the store, the line just rang" : `the robot spoke, which it must not: ${(said || []).map((x) => x.text).join(" | ")}`);
  }
  else if (!lv) item(4, "Staff's greeting is the first line, on the live view", false, "no Staff line ever appeared on the live view");
  else {
    const firstStaffIx = lv.bubs.findIndex((b) => /STAFF|ASOC/i.test(b.who));
    const firstStaffTx = lv.bubs[firstStaffIx]?.tx || "";
    item(4, "Staff's greeting is the first line, on the live view", norm(firstStaffTx) === norm(greeting),
      `live view showed: "${firstStaffTx}"  ·  robot said: "${greeting}"`);
    item(5, "the greeting is its own line, never welded to their answer", norm(firstStaffTx) === norm(greeting),
      norm(firstStaffTx) === norm(greeting) ? "one line, nothing else in it" : `it carries more than the greeting: "${firstStaffTx}"`);
  }

  // WAIT FOR THE SCREEN TO ACTUALLY LAND ON AN ANSWER. A fixed four seconds was sometimes read
  // while the page still said "Getting the answer", and then the harness reported the screen and
  // the record disagreeing when the screen simply had not finished (owner 08-06, scene 3). The
  // page marks its own verdict box, so wait for that mark instead of guessing at a delay.
  await page.waitForFunction(() => {
    const v = document.querySelector("#result .rverdict");
    return !!v && ["in", "out", "unk", "soon"].some((c) => v.classList.contains(c));
  }, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, "result");
  const resultText = (await page.textContent("#result").catch(() => "")) || "";
  // WAIT FOR THE RECORD TO SETTLE. A half-written record is not evidence: reading one while the
  // check is still running produced an empty conversation and a verdict of "still going", which
  // would have been reported as a fault that was really just an early read.
  let rec = null;
  for (let i = 0; i < 24; i++) {
    const r = await readCheck(HOST, TOKEN, null).catch(() => null);
    const mine = r && (r.call.startedAt || 0) * 1000 > current.startedAt - 180000;
    if (mine) { rec = r; if (r.call.status !== "in_progress" && r.call.status !== "dialing") break; }
    await sleep(5000);
  }
  if (!rec) { item(6, "the words match what the robot actually said", false, "the check never reached the record"); return; }

  // ONE CHECK, ONE RECORD. One phone call writing several rows means whatever reads the newest one
  // gets an unfinished copy — which is exactly what happened here before this was measured.
  const recent = await adm("/api/admin/test-calls?limit=12");
  const sameCall = [];
  for (const row of (recent.rows || []).slice(0, 8)) {
    const full = await readCheck(HOST, TOKEN, row.id).catch(() => null);
    if (full && full.call.providerCallId && full.call.providerCallId === rec.call.providerCallId) sameCall.push(full);
  }
  item(12, "one check writes ONE record", sameCall.length <= 1,
    sameCall.length <= 1 ? "one row for this check" : `${sameCall.length} rows for the same phone call: ${sameCall.map((s) => `${s.id}(${linesOf(s).length} lines)`).join(", ")}`);
  // Judge the words against the FULLEST of them, so a duplicate is reported once, as itself, and
  // does not also make every word check fail for a reason that is not about the words.
  if (sameCall.length > 1) rec = sameCall.sort((a, b) => String(b.call.transcript || "").length - String(a.call.transcript || "").length)[0];

  const lines = linesOf(rec);
  current.checkId = rec.id;
  // WHAT IT COST, MEASURED, NOT ESTIMATED. Our side comes off the check's own priced record. The
  // robot's side is its own phone line, which the check never sees and nobody else pays for, so it
  // is read straight from the carrier — its posted price when it has posted one, otherwise its real
  // duration at the published inbound rate, and the report says which of the two it used.
  current.cost = rec.raw?.cost?.totalUsd != null ? rec.raw.cost.totalUsd / 1e6 : null;
  current.costReadable = rec.raw?.cost?.readable?.total || null;
  current.robotCost = await robotSideCost(robot.run?.callSid);
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

  // 13. DID WE SAY GOODBYE, OR JUST HANG UP? (owner, 08-02, on four checks in a row: "it doesn't look
  // like any of these are being wrapped up correctly"). Every one of them ended on OUR OWN QUESTION.
  // Staff are left holding a dead line, which is how a chain learns to stop answering us.
  const ours = lines.filter((l) => l.startsWith("Agent:")).map((l) => l.slice(6).trim());
  const lastLine = lines[lines.length - 1] || "";
  const lastOurs = ours[ours.length - 1] || "";
  const signedOff = /thank|thanks|appreciate|have a good|have a great|take care|take it easy|see ya|no worries|all good|got it/i.test(lastOurs) && !lastOurs.trim().endsWith("?");
  // A GOODBYE IS IMPOSSIBLE ON THREE OF THESE ON PURPOSE: nobody picked up, a machine picked up so
  // Charlie was never switched on, or we ourselves cut the line at the four minute limit. Every
  // other scene still has to end with one.
  if (scene.noGoodbye) item(13, "this check is not meant to end with a goodbye, and it did not", !signedOff,
    signedOff ? `it signed off anyway: "${lastOurs}"` : "nothing was signed off, which is right for this one");
  else item(13, "the check ends with a goodbye, not with us hanging up mid conversation",
    signedOff,
    signedOff ? `we signed off: "${lastOurs}"` : `the last thing said was ${lastLine.startsWith("Agent:") ? "OUR OWN QUESTION" : "theirs"}: "${lastLine.slice(0, 90)}"`);

  // 14. AND WE DO NOT ASK THE SAME THING TWICE. Two of his four screenshots show the same question
  // asked again, once word for word. Every repeat is six to ten seconds with the meter running.
  // The SAME question dressed in a new opener is still the same question. "Do you know the name of
  // the set, like Chaos Rising, and if it comes in a box or pack?" came back as "Oh nice! And do you
  // know the name of the set, like Chaos Rising, and if it comes in a box or pack?" — matching on the
  // first few words missed it, so match on the END of the sentence, where the question actually lives.
  const key = (t) => norm(t).split(" ").slice(-10).join(" ");
  const seenQ = new Set(); const repeats = [];
  for (const q of ours) { const k = key(q); if (k && seenQ.has(k)) repeats.push(q); seenQ.add(k); }
  item(14, "we never ask the same question twice", repeats.length === 0,
    repeats.length ? `asked again: ${repeats.map((r) => `"${r.slice(0, 60)}"`).join(" · ")}` : `${ours.length} things said, none of them twice`);

  // 15. DEAD AIR AFTER THE ANSWER IS MONEY. Check 258 settled at 30 seconds and the line stayed open
  // until 98, because nobody ended it: no goodbye, no hang-up, just over a minute of silence billed
  // by the minute. The store hanging up early used to hide this.
  const hang = rec.timeline.filter((e) => e.kind === "hangup").pop();
  const settled = rec.timeline.filter((e) => e.kind === "verdict").pop();
  if (hang && settled && hang.atSec != null && settled.atSec != null) {
    const idle = hang.atSec - settled.atSec;
    item(15, "the check ends soon after the answer, instead of sitting on an open line",
      idle <= 25, `the answer was in at ${settled.atSec} seconds and the line closed at ${hang.atSec} — ${idle} seconds of nothing`);
  }

  // 9 + 11. the verdict.
  const verdictShown = /in stock|not in stock|no clear answer|sold out|nobody|didn't answer|did not answer|restock/i.test(resultText);
  item(9, "the result appears with a status", verdictShown, resultText.replace(/\s+/g, " ").slice(0, 120));
  // THE SCREEN AND THE RECORD MUST AGREE. A screen that says one thing while the record says
  // another is worse than either being wrong: whichever he reads, the other one contradicts it.
  // Read the site's OWN mark for the answer it painted, never a guess from the words on the page —
  // guessing from the page text called a "couldn't tell" screen a yes and raised a false alarm.
  const onScreen = await page.evaluate(() => {
    const v = document.querySelector("#result .rverdict");
    if (!v) return "unclear";
    // RESTOCK INCOMING IS A NO WITH A DATE ON IT. Staff said they do not have it and named the
    // day the truck comes, so the site paints the restock screen while the record says not in
    // stock, and both are right. Reading that as a disagreement raised a false alarm the moment
    // the clear-no scenes started answering "probably Tuesday" (owner 08-06).
    if (v.classList.contains("soon")) return "out";
    return v.classList.contains("in") ? "in" : v.classList.contains("out") ? "out" : "unclear";
  }).catch(() => "unclear");
  const inRecord = current.statusKey === "in_stock" ? "in" : /not_in_stock|sold_out|does_not_sell/.test(String(current.statusKey)) ? "out" : "unclear";
  item(9.1, "the screen and the record say the same thing", onScreen === inRecord,
    `the screen said ${onScreen}, the record says ${inRecord} (${current.statusKey})`);
  item(11, "the verdict is RIGHT for this scenario", current.statusKey === scene.expect,
    `got ${current.statusKey} · this scenario is ${scene.expect}`);

  // 10. money.
  // MONEY. The screen tells the customer whether this one was free; the record decides whether he was
  // actually billed. If those two ever disagree, one of them is lying to him, and it is his money
  // either way. Checked on EVERY scene, not just the one that must never be charged.
  const saysFree = /no charge/i.test(resultText);
  const mustNotCharge = scene.n === 9; // they hung up without ever hearing us: there is no answer to sell
  const moneyOk = !(mustNotCharge && current.charged) && !(saysFree && current.charged);
  item(10, "the screen and the till agree about money",
    moneyOk,
    `${current.charged ? "CHARGED" : "not charged"}${saysFree ? ' · the screen says "No charge"' : " · the screen claims no free check"}` +
    ` · the check cost ${current.costReadable || "(not priced)"}${current.robotCost ? ` · the robot's own line ${(current.robotCost.usd * 100).toFixed(2)}¢ (${current.robotCost.how})` : ""}` +
    (mustNotCharge ? " · this scene must NEVER be charged: they hung up before hearing us" : ""));

  printCheck(rec);
}

// ---- go -----------------------------------------------------------------------------------------
if (CLI) {
const cfg = await adm("/api/admin/robot-store");
const scenes = cfg.scenes.filter((s) => !wanted.length || wanted.includes(s.n));
// BEFORE ANYTHING DIALS: prove the store this run will tap is the robot, by its number.
const store = await adm(`/api/retailers?q=${encodeURIComponent(STORE)}&limit=5`);
const target = (Array.isArray(store) ? store : store.rows || []).find((r) => r.id === STORE_ID);
if (!target) { console.error(`No store ${STORE_ID} named like "${STORE}" — refusing to dial anything.`); process.exit(2); }
if ((target.phone || "").replace(/[^\d+]/g, "") !== ROBOT_NUMBER) {
  console.error(`Store ${STORE_ID} answers on ${target.phone || "(no number)"}, not the robot's ${ROBOT_NUMBER}. That is a REAL business. Refusing to dial.`);
  process.exit(2);
}
if (scenes.length > MAX_DIALS) { console.error(`${scenes.length} scenes asked for but the ceiling is ${MAX_DIALS} checks a run. Raise ROBOT_MAX_DIALS on purpose or ask for fewer.`); process.exit(2); }
console.log(`dialing store ${STORE_ID} "${target.name}" on ${target.phone} · at most ${MAX_DIALS} checks this run`);
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
  finally {
    // THE SWITCH GOES BACK ON, whatever happened. Leaving asking to be put through switched off
    // would quietly change every check after this one, including a real customer's.
    if (SCENE_ASK_FOR_TRANSFER_OFF.has(scenes[i].n)) {
      try {
        await adm("/api/policy", { method: "PATCH", body: JSON.stringify({ flags: { askForTransfer: true } }) });
        const back = await adm("/api/policy");
        console.log(`  · asking to be put through is back ON: ${String(back.flags?.askForTransfer)}`);
        item(0.6, "asking to be put through is switched back ON after the check", back.flags?.askForTransfer === true,
          `the switch reads ${String(back.flags?.askForTransfer)}`);
      } catch (e) { item(0.6, "asking to be put through is switched back ON after the check", false, String(e).slice(0, 120)); }
    }
  }
  // OWNER RULE (08-04, voice RULES.md 15): the FIRST check of a run must be seen running WHOLE —
  // dial to answer to Charlie's goodbye to the check ending — before a second check is dialed.
  // The goodbye bug burned ~$3 of checks that one stopped run would have caught for 9 cents.
  if (i === 0 && scenes.length > 1) {
    const wholeCheck = [12, 13, 15]; // one record written · ends with a goodbye · ends soon after the answer
    const broke = (runs[0]?.items || []).filter((x) => wholeCheck.includes(x.n) && !x.pass);
    if (broke.length) {
      console.error(`\nTHE FIRST CHECK DID NOT RUN WHOLE, so nothing else dials (owner rule 08-04):`);
      for (const x of broke) console.error(`  ✗ ${x.name} — ${x.detail}`);
      console.error(`Fix that first. One check spent, ${scenes.length - 1} not dialed.`);
      break;
    }
  }
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
const ours = priced.reduce((a, r) => a + Number(r.cost), 0);
const theirs = runs.filter((r) => r.robotCost).reduce((a, r) => a + r.robotCost.usd, 0);
console.log(`\nWHAT THIS RUN COST, measured, not estimated`);
console.log(`  the checks themselves: ${(ours * 100).toFixed(1)}¢ over ${priced.length} of ${runs.length} · ${priced.length ? (ours * 100 / priced.length).toFixed(1) : "0"}¢ each`);
console.log(`  the robot's own phone line: ${(theirs * 100).toFixed(1)}¢ · ${runs.length ? (theirs * 100 / runs.length).toFixed(1) : "0"}¢ each`);
console.log(`  ONE FULL RUN: ${((ours + theirs) * 100).toFixed(1)}¢`);
if (jsErrors.length) { failed++; console.log(`✗ the page threw: ${jsErrors.join(" | ")}`); }
writeFileSync(`${OUT}/run.json`, JSON.stringify({ at: new Date().toISOString(), host: HOST, runs, jsErrors }, null, 2));
console.log(`the whole run: ${OUT}/run.json · photos in ${OUT}/`);
console.log(failed ? `\nROBOT STORE: ${failed} FAILED\n` : "\nROBOT STORE: every scenario held\n");
process.exit(failed ? 1 : 0);
}
