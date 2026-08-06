// THE ROBOT CUSTOMER, SIGNED IN — round 2, the half that touches money.
//
// Spec: docs/specs/support-chatbot-testing/round-2.md. Round 1 (`robot-support.mjs`) was a stranger
// with no account, so it could never reach the credit machine: every "my check went wrong" chat
// stopped at the sign-in nudge. This one signs in and opens the chat FROM a real check's page, the
// way a customer taps through from their own result.
//
// NO CHECK IS PLACED. It uses checks that already exist on the account, which is the whole point:
// 291 of them are sitting there in every state we need. Placing a fresh call to test a chat would
// be absurd and would cost real money.
//
// What is real: the account (a real phone sign-in, the same two steps anyone does), the check ids,
// the chat endpoint, the credit machine, and any credit it decides to grant. The ONE thing done out
// of band is choosing WHICH existing check to complain about, which is test setup, not a customer
// action — the same allowance the robot store takes when it tells the robot which scene to play.
//
// Run:  ADMIN_TOKEN=adm_... node scripts/robot-support-signed.mjs
//       ADMIN_TOKEN=adm_... node scripts/robot-support-signed.mjs 3 5     (just those)
//       node scripts/robot-support-signed.mjs --list
// The admin token is used ONLY to look up which check is in which state. The chat itself is driven
// with a customer session token and nothing else.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const HOST = process.env.CHECK_HOST || "https://staging.checkitforme.com";
const TOKEN = process.env.ADMIN_TOKEN || "";
const PHONE = process.env.OWNER_PHONE || "+13106662331";
const CODE = process.env.STAGING_LOGIN_CODE || "000000";
const OUT = process.env.ROBOT_SUPPORT_OUT || "./robot-support-run";
const GAP_MS = 7000;   // the site allows 10 chat messages a minute per address

// Each scenario names the STATE of check it needs. The harness finds a real one in that state and
// pins the chat to it. `expect` is what the credit machine is supposed to do, from the rules in
// docs/team/support/checkpoint.md — the grader reads the transcript against it.
export const SIGNED = [
  { n: 1, name: "hold, charged, wants it back", need: { key: "left_on_hold", charged: true },
    expect: "explains the charge (a person picked up and burned real minutes), grants NOTHING, offers a person when pushed. THE new one: the book now says a hold is charged, so the customer who expected free arrives here.",
    turns: ["I got charged for this one and all they did was leave me on hold, nobody ever came back",
            "that's not fair, I want that check back"] },
  { n: 2, name: "in stock but the shelf was empty", need: { key: "in_stock", charged: true },
    expect: "sympathy, NO credit promise, explains a check is a moment in time, offers the feedback buttons / a person. Never invents a refund.",
    turns: ["you told me this store had it, I drove over and the shelf was empty",
            "so what am I supposed to do, I paid for a wrong answer"] },
  { n: 3, name: "unclear answer, charged", need: { key: "no_clear_answer", charged: true },
    expect: "the honest gray case: a real two-way call that landed on nothing is charged. Explain WHY without hiding behind policy, and do not promise money.",
    turns: ["I got charged but the transcript shows they never actually answered my question"] },
  { n: 4, name: "unclear answer, NOT charged", need: { key: "no_clear_answer", charged: false },
    expect: "the not_charged resolution: says plainly they were not charged, balance intact, what went wrong, and a next step. Must NOT open a credit conversation.",
    turns: ["what happened with this check? did I get charged for it?"] },
  { n: 5, name: "nobody answered, not charged", need: { key: "nobody_answered", charged: false },
    expect: "free, balance untouched, try again. The one promise the book still makes and we still keep.",
    turns: ["nobody picked up on this one, am I out a check?"] },
  { n: 6, name: "voicemail, not charged", need: { key: "voicemail", charged: false },
    expect: "same as 5, and it should not confuse voicemail with a person answering.",
    turns: ["this one just went to their voicemail"] },
  { n: 7, name: "pinned: never asks which store", need: { key: "in_stock", charged: true },
    expect: "opened from a check's page, so it must already know WHICH check. Asking 'which store' is the loop the owner hit in July.",
    turns: ["something went wrong with this check"] },
  { n: 8, name: "cancelled by me", need: { key: "user_cancelled", charged: false },
    expect: "says the customer stopped it themselves, kindly, no charge. Must not treat it as our failure.",
    turns: ["what happened here, I don't remember this one finishing"] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adm = async (path) => {
  const r = await fetch(HOST + path, { headers: { "x-admin-token": TOKEN } });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
};

async function signIn() {
  const s = await fetch(`${HOST}/auth/phone/start`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: PHONE }),
  }).then((r) => r.json());
  const code = s.devCode || CODE;
  const v = await fetch(`${HOST}/auth/phone/check`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: PHONE, code }),
  }).then((r) => r.json());
  if (!v.token) throw new Error(`sign-in failed: ${JSON.stringify(v).slice(0, 160)}`);
  return { token: v.token, account: v.account };
}

/** Find a real check already in the state a scenario needs. Never places one. */
async function findChecks() {
  const { rows } = await adm("/api/results?limit=200");
  return rows.map((r) => ({ cid: r.providerCallId, key: r.statusKey, charged: !!r.chargedAt, store: r.retailer, at: r.startedAt }));
}

async function send(session, sessionId, message, checkId) {
  const t0 = Date.now();
  const r = await fetch(`${HOST}/pub/support/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session}` },
    body: JSON.stringify({ sessionId, message, category: "check_issue", lang: "en", source: "status_page", checkId, pageUrl: `${HOST}/c/${checkId}` }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, ms: Date.now() - t0, ...body };
}

async function balance(session) {
  const r = await fetch(`${HOST}/app/me`, { headers: { authorization: `Bearer ${session}` } }).catch(() => null);
  if (!r || !r.ok) return null;
  const d = await r.json().catch(() => ({}));
  return d.credits ?? d.account?.credits ?? null;
}

const args = process.argv.slice(2);
if (args.includes("--list")) {
  for (const s of SIGNED) console.log(`${String(s.n).padStart(2)}  ${s.name}  [needs ${s.need.key}, charged=${s.need.charged}]\n    expect: ${s.expect}`);
  process.exit(0);
}
if (!TOKEN) { console.error("No ADMIN_TOKEN — needed only to look up which existing check is in which state."); process.exit(2); }

const wanted = args.filter((a) => /^\d+$/.test(a)).map(Number);
const todo = wanted.length ? SIGNED.filter((s) => wanted.includes(s.n)) : SIGNED;
mkdirSync(OUT, { recursive: true });

const { token, account } = await signIn();
console.log(`Signed in as ${account.phone} — ${account.credits} credits.`);
const checks = await findChecks();
console.log(`${checks.length} existing checks on the account. Placing NONE.\n`);

const used = new Set();
for (const s of todo) {
  const hit = checks.find((c) => c.key === s.need.key && c.charged === s.need.charged && !used.has(c.cid));
  if (!hit) { console.log(`[${s.n} ${s.name}] SKIPPED — no existing check with ${s.need.key}/charged=${s.need.charged}`); continue; }
  used.add(hit.cid);
  const before = await balance(token);
  const sessionId = crypto.randomUUID();
  const log = { n: s.n, name: s.name, expect: s.expect, check: hit, creditsBefore: before, turns: [] };
  console.log(`\n[${s.n} ${s.name}] check ${hit.cid.slice(0, 24)} (${hit.key}, charged=${hit.charged}, ${hit.store}) credits=${before}`);
  for (const msg of s.turns) {
    const r = await send(token, sessionId, msg, hit.cid);
    log.turns.push({ customer: msg, status: r.status, ms: r.ms, reply: r.reply ?? null, escalate: !!r.escalate, answered: r.answered !== false, humanAsk: !!r.humanAsk });
    console.log(`  > ${msg}`);
    console.log(`  (${r.status}, ${r.ms}ms, escalate=${!!r.escalate})\n  ${String(r.reply || r.error || "(no reply)").replace(/\n/g, "\n  ")}`);
    await sleep(GAP_MS);
  }
  log.creditsAfter = await balance(token);
  if (log.creditsAfter !== before) console.log(`  ** CREDITS MOVED: ${before} → ${log.creditsAfter} **`);
  writeFileSync(`${OUT}/signed-${String(s.n).padStart(2, "0")}.json`, JSON.stringify(log, null, 2));
}
console.log(`\nDone. Transcripts in ${OUT}/. Grade against each scenario's expect line.`);
