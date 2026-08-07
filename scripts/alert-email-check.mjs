// ALERT: EMAIL — the one test on the owner's list that is NOT a robot scene (his order, 08-07).
//
// "It is Answer: clear yes run against a store the owner has an alert on, then proving one email
// really arrived."
//
// So there is no script for the robot to read here. The store says exactly what it says on scene 1,
// and what this test watches is what happens AFTER the check lands In stock: the alert fires, one
// email goes out, one arrives, and only one. It is the last unproven link in the restock promise,
// which is the whole product.
//
// IT DIALS THE SAME CHECK THE OWNER DIALS. This runs `robot-check.mjs 1`, the real harness, on the
// real staging site, through the same green button a customer presses. There is no second dialer
// here and there must never be: a copy drifts inside a week and then the test proves the copy.
//
// Run:  ADMIN_TOKEN=adm_... node scripts/alert-email-check.mjs
//
// IT REFUSES TO DIAL rather than spend a check that could not possibly prove anything: the owner has
// to have a confirmed email address and an active email restock alert on the robot store. Both are
// checked first, and if either is missing it says exactly which and stops. A check spent on a test
// that cannot pass is a check wasted, which is the thing this whole round is about.
import { spawn } from "node:child_process";

const HOST = process.env.CHECK_HOST || "https://staging.checkitforme.com";
const TOKEN = process.env.ADMIN_TOKEN || "";
const STORE_ID = Number(process.env.ROBOT_STORE_ID || 106362);
const OWNER_PHONE = process.env.OWNER_PHONE || "+13106662331";

if (!TOKEN) { console.error("No ADMIN_TOKEN. Pull it from Railway (CLAUDE.md has the curl)."); process.exit(2); }

const adm = async (path) => {
  const r = await fetch(HOST + path, { headers: { "x-admin-token": TOKEN, "content-type": "application/json" } });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
};

let bad = 0;
const ok = (m, d) => console.log(`  ✓ ${m}${d ? `\n      ${d}` : ""}`);
const no = (m, d) => { console.error(`  ✗ ${m}${d ? `\n      ${d}` : ""}`); bad++; };

// ---- 1. CAN THIS TEST EVEN PASS? Asked before a single cent is spent. -------------------------
console.log("\n══════ Alert: email ══════");
const before = await adm("/api/alerts/log");
const master = "phone:" + OWNER_PHONE.trim();

// The alert has to be HIS, on THIS store, by email, and switched on. "Any store" alerts count too:
// an alert with no store on it fires for every store, which includes the robot.
const mine = (before.subscribers?.recent || []).filter((s) =>
  s.userId === master && s.channel === "email" && (s.retailerId == null || s.retailerId === STORE_ID));
if (!mine.length) {
  console.error(`\nNOTHING TO PROVE, so nothing was dialed.`);
  console.error(`There is no active email alert on store ${STORE_ID} for ${OWNER_PHONE}.`);
  console.error(`Turn the alert on for the robot store first (tap the alert on its page), then run this again.`);
  process.exit(2);
}
ok(`the owner has an email alert covering this store`, `alert ${mine[0].id}${mine[0].retailerId == null ? " (every store)" : ` (store ${mine[0].retailerId})`}`);

// PRODUCTION HAS NEVER SENT AN EMAIL because no address was ever confirmed there. Say which side of
// that line this run is on, out loud, rather than letting a stubbed send read as a delivered one.
if (!before.delivery?.email) {
  console.error(`\nEMAIL IS NOT LIVE ON ${HOST}, so a send here would be stubbed and would prove nothing.`);
  console.error(`Nothing was dialed. Set the mail key on this environment and run it again.`);
  process.exit(2);
}
ok("email really sends on this environment, so a send here is a real send");

const sentBefore = (before.recent || []).filter((r) => r.event === "restock" && r.channel === "email");
const highWater = sentBefore.length ? Math.max(...sentBefore.map((r) => r.id)) : 0;
console.log(`  · ${sentBefore.length} restock emails on the log before this check (newest id ${highWater})`);

// ---- 2. DIAL THE CHECK, through the harness, exactly as he dials it --------------------------
console.log(`\ndialing Answer: clear yes (scene 1) through the real site…\n`);
const code = await new Promise((done) => {
  const p = spawn(process.execPath, ["scripts/robot-check.mjs", "1"], { stdio: "inherit", env: process.env });
  p.on("close", done);
});
if (code !== 0) no("the check itself ran clean", `the harness exited ${code}, so read its rows above before reading anything below`);
else ok("the check itself ran clean");

// ---- 3. DID ONE EMAIL REALLY GO OUT ----------------------------------------------------------
// The alert fires off the settled verdict, which lands a moment after the check ends, so give it a
// little room rather than reading the log the instant the phone goes down.
console.log("\nwatching the alert log…");
let after = null, fresh = [];
for (let i = 0; i < 24; i++) {
  after = await adm("/api/alerts/log");
  fresh = (after.recent || []).filter((r) => r.event === "restock" && r.channel === "email" && r.id > highWater);
  if (fresh.length) break;
  await new Promise((r) => setTimeout(r, 5000));
}

if (!fresh.length) {
  no("one in stock email was sent", "no restock email at all on the log two minutes after the check. The check landed and nobody was told.");
} else {
  const sent = fresh.filter((r) => r.status === "sent");
  const other = fresh.filter((r) => r.status !== "sent");
  // ONE STORE = ONE EMAIL is the owner's own rule. Two emails for one check is a customer being
  // spammed by the thing that is supposed to be doing them a favour.
  if (fresh.length === 1) ok("exactly ONE email went out for this check", `to ${fresh[0].to} · status ${fresh[0].status} · the mail service's own id ${fresh[0].detail}`);
  else no(`${fresh.length} emails went out for ONE check`, fresh.map((r) => `#${r.id} → ${r.to} (${r.status})`).join(" · "));
  // AND IT REALLY LEFT. "sent" means the mail service accepted it and gave us its own id for it; a
  // stubbed or failed row is our own record saying it never went.
  if (sent.length) ok("the mail service accepted it and gave us its id, so it really left us", `${sent[0].detail}`);
  else no("no email actually left", other.map((r) => `${r.status}: ${r.detail || "no reason recorded"}`).join(" · "));
  console.log(`\n  LAST STEP, AND IT IS YOURS: open ${fresh[0].to} and say whether the email is in the inbox.`);
  console.log(`  Nothing on our side can see inside your inbox, so that is the one part a script cannot prove.`);
}

console.log(bad ? `\nALERT: EMAIL — ${bad} FAILED\n` : "\nALERT: EMAIL — every step held up to your inbox\n");
process.exit(bad ? 1 : 0);
