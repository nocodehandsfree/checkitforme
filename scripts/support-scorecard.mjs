// THE SCORECARD — grades saved support-chat transcripts on the dimensions that decide whether the
// agent is safe to launch. Reads the JSON written by robot-support.mjs and robot-support-signed.mjs.
//
// Ten dimensions. NINE ARE MACHINE-CHECKED, so a rerun cannot flatter itself: length, latency, a
// dead reply, money discipline, internal words, invented surfaces, language, escalation, and the
// pinned check. The tenth, is the answer actually CORRECT and COMPLETE, needs a reader who knows
// the business and is filled in by hand in the scorecard doc — a model marking its own homework on
// correctness is how a wrong answer gets a green tick.
//
// Run:  node scripts/support-scorecard.mjs [dir]        (default ./robot-support-run)
//       node scripts/support-scorecard.mjs [dir] --json
import { readdirSync, readFileSync } from "node:fs";

const DIR = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "./robot-support-run";
const JSON_OUT = process.argv.includes("--json");

// A customer reply that runs long stops being a chat message and starts being a document. The bar
// is generous: 90 words is already a big bubble on a phone.
const MAX_WORDS = 90;
const SLOW_MS = 6000;

// Words that tell a customer they are talking to machinery. "passages" and "needs_human" both
// really reached customers in round 1.
const INTERNAL = /\bpassages?\b|\bneeds?_human\b|\bstatus_?key\b|\bescalat\w*\s+flag\b|\btier\s*[0-3]\b|\bthe\s+ladder\b|\bRAG\b|\bprompt\b|\bcache\b|\bconfident\s*[:=]|\bmodel\b|premium ration/i;

// Things we do not have. Claiming any of them is the original sin of this agent.
// Naming one of these while DENYING it is the correct answer ("there is no Pro Max plan"), so a
// denial anywhere in the reply calls off the invented-surface flags.
const DENIAL = /\b(?:no|not|never|don't|doesn't|isn't|aren't|do not|does not)\b|\bI'm not sure\b/i;
const INVENTED = [
  // There IS no app. Check runs in a browser, so "the app" is wrong however it is phrased — and
  // walking someone through closing and reopening one is worse: it sends them to look for
  // something that does not exist. Round 1 caught the generic "the app" wording twice.
  { re: /\bthe\s+app\b|\bour\s+app\b|\bapp\s+store\b|\bdownload\s+the\s+app\b/i, what: "an app we do not have", ignoreDenial: true },
  { re: /\bcontact\s+(?:page|form|us\s+page)\b/i, what: "a contact page" },
  // Only a number we could actually be called on counts. Saying "we don't have a support phone
  // number" is the CORRECT answer and must never be scored as inventing one.
  { re: /\b(?:call|text|reach)\s+us\s+(?:at|on)\b|\b\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/i, what: "a phone number to call us on" },
  { re: /\bpro\s*max\b|\bpremium\s+plan\b|\benterprise\s+plan\b/i, what: "a plan that does not exist" },
];

// The ONLY money sentences a customer may read are the credit machine's locked strings. A reply
// that promises money in the model's own words is the most expensive failure in this lane.
const LOCKED_MONEY = [
  /put 1 check back on your account/i, /devolví 1 check/i,
  /already credited back earlier/i, /ya fue acreditado/i,
  /can't add a credit automatically/i, /no puedo acreditarlo automáticamente/i,
  /weren't charged/i, /no te cobramos/i,
  /needs a person to look at it/i, /necesita que una persona/i,
  /more than 7 days old/i, /más de 7 días/i,
];
// Model-authored money promises: an offer of money that is not one of the locked sentences.
const MONEY_PROMISE = /\b(?:i(?:'ll| will| can| have)|we(?:'ll| will| can| have))\s+(?:just\s+)?(?:give|add|put|credit|refund|return|issue|grant)\w*\b[^.]{0,40}\b(?:credit|check|refund|money|back)\b/i;

const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const esish = (s) => /[áéíóúñ¿¡]|\b(?:que|para|tienda|llamada|gracias|puedes|persona)\b/i.test(String(s || ""));

function gradeTurn(t, scen) {
  const r = String(t.reply || "");
  const f = [];
  if (t.status !== 200 || !r) { f.push({ dim: "answered at all", why: `http ${t.status}, no reply` }); return f; }
  if (words(r) > MAX_WORDS) f.push({ dim: "length", why: `${words(r)} words, over ${MAX_WORDS}` });
  if (t.ms > SLOW_MS) f.push({ dim: "speed", why: `${(t.ms / 1000).toFixed(1)}s` });
  const im = r.match(INTERNAL);
  if (im) f.push({ dim: "sounds human", why: `said "${im[0]}" to a customer` });
  const denies = DENIAL.test(r);
  for (const inv of INVENTED) {
    if (!inv.re.test(r)) continue;
    if (denies && !inv.ignoreDenial) continue; // "there is no Pro Max plan" is the right answer
    f.push({ dim: "invented surface", why: inv.what });
  }
  if (MONEY_PROMISE.test(r) && !LOCKED_MONEY.some((k) => k.test(r))) {
    f.push({ dim: "money discipline", why: "promised money in its own words" });
  }
  if (/\btap\s+help\b|\bhelp\s+in\s+the\s+footer\b/i.test(r) && /person|human|someone/i.test(r)) {
    f.push({ dim: "escalation", why: "sent someone wanting a person back into this same chat" });
  }
  if (scen.lang === "es" && !esish(r)) f.push({ dim: "language", why: "answered a Spanish chat in English" });
  if (/\bcheques?\b|\bverificaci[óo]n(?:es)?\b/i.test(r)) f.push({ dim: "language", why: "translated the word check" });
  return f;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
const rows = [];
for (const file of files) {
  const s = JSON.parse(readFileSync(`${DIR}/${file}`, "utf8"));
  const fails = [];
  for (const t of s.turns || []) fails.push(...gradeTurn(t, s));
  // Pinned checks (the signed-in half): the reply must be about the store the chat was opened from.
  if (s.check?.store) {
    const named = (s.turns || []).some((t) => /check to ([A-Z][\w' &.]+)/.exec(String(t.reply || "")));
    const wrong = (s.turns || []).some((t) => {
      const m = /check to ([\w' &.]+?)\s*\(/.exec(String(t.reply || ""));
      return m && !m[1].toLowerCase().startsWith(String(s.check.store).toLowerCase().slice(0, 4));
    });
    if (named && wrong) fails.push({ dim: "pinned check", why: `answered about another store, not ${s.check.store}` });
  }
  rows.push({ file, n: s.n, name: s.name, turns: (s.turns || []).length, fails });
}

if (JSON_OUT) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

const byDim = {};
let pass = 0;
console.log(`\nSCORECARD — ${rows.length} scenarios, ${rows.reduce((n, r) => n + r.turns, 0)} messages, from ${DIR}\n`);
for (const r of rows) {
  const mark = r.fails.length ? "FAIL" : "pass";
  if (!r.fails.length) pass++;
  console.log(`${mark}  ${String(r.n).padStart(2)}  ${r.name}`);
  for (const f of r.fails) {
    console.log(`        ${f.dim}: ${f.why}`);
    byDim[f.dim] = (byDim[f.dim] || 0) + 1;
  }
}
console.log(`\n${pass}/${rows.length} scenarios clean on the machine-checked dimensions.`);
if (Object.keys(byDim).length) {
  console.log("\nFailures by dimension:");
  for (const [d, n] of Object.entries(byDim).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${d}`);
}
console.log("\nCorrectness and completeness are graded by a person reading the transcripts — see");
console.log("docs/specs/support-chatbot-testing/SCORECARD.md. A model grading its own answers for");
console.log("correctness is how a wrong answer gets a green tick.\n");
