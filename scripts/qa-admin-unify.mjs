// qa-admin-unify — THE MACHINE GATE for the Admin unify pass (docs/tasks/admin-unify-pass.md).
//
// Six whole-Admin cleanups have died mid-pass and every cleaned page rotted back. So the rules
// became a machine BEFORE any page was touched: once a page passes its unify session it gets
// SEALED here, and from then on a ship fails if that page regrows any of the three problems.
//
//   node scripts/qa-admin-unify.mjs           # the SHIP GATE: sealed pages must be clean
//   node scripts/qa-admin-unify.mjs --audit   # every page, findings listed, nothing enforced
//   node scripts/qa-admin-unify.mjs --all     # enforce on EVERY page (proves it fails today)
//   node scripts/qa-admin-unify.mjs --page X  # one page only (what you run during its session)
//
// Sealing a page is the LAST step of its session, after it is driven at 390px. Add its id to
// SEALED in the same commit. Never seal a page to make this pass.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "../public/app.html"), "utf8");
const argv = process.argv.slice(2);
const MODE = argv.includes("--all") ? "all" : argv.includes("--audit") ? "audit" : "gate";
const ONLY = (() => { const i = argv.indexOf("--page"); return i >= 0 ? argv[i + 1] : null; })();

// ── SEALED: pages that have had their unify pass. Order = the order they were done. ───────────
const SEALED = [
  "dash", // Live — passed 07-30: baseline line in, Call time / Call health / voice credits out, driven at 390px
  // "settings", "calc", …  ← next up, in that order
];

// ── 1. ONE info-icon pattern. The standard is the tap-to-show hint: data-tip + the single ⓘ
//       ::after rule in the stylesheet (hover does not exist on a phone, so title= is dead
//       weight that only ever shows on a desktop). Anything that marks a hint a SECOND way is
//       a competing pattern and fails.
const ICON_RULES = [
  { why: "title= is a hover-only tooltip (dead on a phone) — move the sentence to data-tip",
    re: /\stitle="[^"]+"/g },
  { why: "a literal info glyph in the markup — the ⓘ comes from the one ::after rule, never typed",
    re: /(?<!content:")[ⓘℹ🛈](?!";)/g },
  { why: "a second hint class — the pattern is data-tip, not a bespoke icon",
    re: /class="[^"]*\b(tooltip|infoicon|info-icon|helpicon|help-icon|qmark)\b[^"]*"/g },
];

// ── 2. On-page directional copy. Telling the operator how to operate belongs in the tooltip,
//       never in the page body. (Matches inside a data-tip value are fine — that IS the tooltip.)
const DIRECTIONAL = [
  /\bclick here\b/gi, /\btap here\b/gi, /\bclick the\b/gi, /\buse this to\b/gi,
  /\buse this\b/gi, /\byou can use\b/gi, /\bhere you can\b/gi, /\bpress this\b/gi,
  /\bselect this\b/gi, /\buse the [a-z ]{1,20}\b(below|above)\b/gi, /\bscroll down\b/gi,
  /\bsee below\b/gi, /\bbelow to\b/gi, /\bhover\b/gi, /\bsimply\b/gi,
];

// ── 3. UNTRUE LINES the owner has called out. THIS LIST GROWS — every time he says "that is not
//       true", the line lands here so it can never come back. Keep the reason in the comment.
const UNTRUE = [
  // Delta (recorded clips) is PARKED. No label may read as if it runs today. A mention is fine
  // when the same line says it is parked/off/retired.
  { why: "reads as if Delta (recorded clips) runs today — it is parked",
    re: /\bDelta\b/g, unless: /\b(parked|retired|not running|off today|stopped being|no longer)\b/i },
  // Clerk was ripped out in the rebuild; admin auth is the signed admin_session cookie. Any
  // sign-in / sign-up / cost line naming Clerk is stale and reads as a live dependency.
  { why: "Clerk is gone (admin auth is the signed session cookie) — a Clerk sign-in line is untrue",
    re: /Clerk\s*\((sign|log)[^)]*\)|Clerk sign[- ]?(in|up)|clerk\.(dev|com)/gi },
  // "clerk" the noun: the person at the store is Staff. Owner's word, everywhere.
  { why: 'the person at a store is "Staff", never a clerk', re: /\bclerks?\b(?!Token|\()/g },
  // Cost, time and count numbers are SUMMED off real finished checks now. Nothing about them is
  // an estimate, and calling one an estimate made him distrust the whole card.
  { why: '"estimated" on a number we now sum from real checks',
    re: /\b(estimated|estimate|approx\.?|approximately|roughly)\b[^<"']{0,40}\b(cost|spend|per check|checks?|cents?|¢|\$)/gi },
  { why: 'a number label that hedges — we print what we summed, or we print nothing',
    re: /\b(est\.|~ish|about \$?\d)/gi },
];

// ── 4. HIS WORDS (owner law 07-29). Words he never coined must not appear as an Admin label.
//       A check is a CHECK. The person at a store is Staff. Money is nav time + talk time.
// A word only breaks the law when it is a LABEL the owner reads. Two things are not violations:
// a field or variable name (`r.room`, `/receipt/:room`, `lane:'delta'` — the API's words, not his),
// and ordinary English (a KIOSK receipt a shopper emails in really is a receipt; "room to think"
// is not a room). PROSE is what this catches. `unless:` carries the English exceptions.
const CODE = "(?<![.\\w$:/-])"; // not a property, key, path segment or part of a longer name
const NOT_ID = "(?![\\w$]*\\s*[:=(])"; // not being declared, keyed or called
const BORROWED = [
  { why: 'a check is a "check" — never a room', re: new RegExp(CODE + "rooms?\\b" + NOT_ID, "gi"),
    unless: /room to (think|breathe|talk)|more room|no room|legroom/i },
  { why: 'a check is a "check" — never a lane', re: new RegExp(CODE + "lanes?\\b" + NOT_ID, "gi") },
  { why: 'a check is a "check" — never a receipt', re: new RegExp(CODE + "receipts?\\b" + NOT_ID, "gi"),
    unless: /kiosk|shopper|stripe|invoice|vendor|bill|email|machine id|paper/i },
  { why: '"the thinking" is not his word — say what it is', re: /\bthe thinking\b/gi },
  { why: 'a check is a "check" — never a door', re: new RegExp(CODE + "doors?\\b" + NOT_ID, "gi") },
];

// ── page slicing ───────────────────────────────────────────────────────────────────────────────
// A page = its <section id="…"> markup PLUS the body of the loader TAB_LOADERS names for that tab
// (one hop only — most of the copy on a page is printed by its loader, not the shell). Brace
// matching is naive about braces inside strings, so a region can run long, never short.
function fnBody(name) {
  const i = html.indexOf("function " + name + "(");
  if (i < 0) return "";
  let j = html.indexOf("{", i), d = 0;
  if (j < 0) return "";
  for (let k = j; k < html.length; k++) {
    if (html[k] === "{") d++;
    else if (html[k] === "}" && --d === 0) return html.slice(i, k + 1);
  }
  return html.slice(i);
}
function loadersFor(id) {
  const line = html.match(/const TAB_LOADERS\s*=\s*\{[\s\S]*?\n/);
  if (!line) return [];
  const entry = line[0].match(new RegExp(id + "\\s*:\\s*\\(\\)\\s*=>\\s*(\\{[^}]*\\}|[^,}]+)"));
  return entry ? [...entry[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]) : [];
}
function pages() {
  const out = [];
  for (const m of html.matchAll(/<section id="([A-Za-z0-9_-]+)"/g)) {
    const tag = /<\/?section\b/g; tag.lastIndex = m.index;
    let d = 0, end = html.length, t;
    while ((t = tag.exec(html))) {
      if (html.startsWith("</section", t.index)) { if (--d === 0) { end = t.index + 10; break; } }
      else d++;
    }
    const shell = html.slice(m.index, end);
    const js = loadersFor(m[1]).map(fnBody).join("\n");
    out.push({ id: m[1], line: html.slice(0, m.index).split("\n").length, text: shell + "\n" + js });
  }
  // "chrome" — the shared shell every page wears: the nav, the header, the one sheet. Markup only
  // (the script block is not a page; its copy is reached through each page's loader instead).
  const chrome = html
    .replace(/<section id="[A-Za-z0-9_-]+"[\s\S]*?<\/section>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ");
  out.unshift({ id: "chrome", line: 1, text: chrome });
  return out;
}

// ── running the rules ──────────────────────────────────────────────────────────────────────────
const NO_TIPS = (s) => s.replace(/data-tip="[^"]*"/g, " ").replace(/data-tip=\{?`[^`]*`\}?/g, " ");
const STRIP_COMMENTS = (s) => s.replace(/<!--[\s\S]*?-->/g, " ").replace(/^\s*\/\/.*$/gm, " ");
const snip = (s, i) => s.slice(Math.max(0, i - 45), i + 55).replace(/\s+/g, " ").trim();

function findings(page) {
  const out = [];
  const body = STRIP_COMMENTS(page.text);
  const push = (rule, why, m, src) => out.push({ rule, why, at: snip(src, m.index) });
  for (const r of ICON_RULES) for (const m of body.matchAll(r.re)) push("info-icon", r.why, m, body);
  const spoken = NO_TIPS(body);
  for (const re of DIRECTIONAL)
    for (const m of spoken.matchAll(re))
      push("directional", `on-page directional copy "${m[0]}" — it belongs in the tooltip`, m, spoken);
  for (const r of [...UNTRUE, ...BORROWED]) {
    for (const m of body.matchAll(r.re)) {
      const around = snip(body, m.index);
      if (r.unless && r.unless.test(around)) continue;
      push(r === BORROWED[0] || BORROWED.includes(r) ? "his-words" : "untrue", r.why, m, body);
    }
  }
  return out;
}

// The ⓘ pattern itself is a LOCK, checked once for the whole file: exactly one rule draws it.
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✓ ${m}`); };
const no = (m) => { fail++; console.log(`  ✗ ${m}`); };
const iconRule = html.match(/\[data-tip\]::after\s*\{[^}]*content:\s*"ⓘ"/g) || [];
iconRule.length === 1
  ? ok("ONE info-icon pattern in the stylesheet (data-tip::after draws the only ⓘ)")
  : no(`ONE info-icon pattern expected in the stylesheet, found ${iconRule.length}`);
html.includes("closest('[data-tip]')")
  ? ok("hints are tap-to-show (a phone has no hover)")
  : no("the tap-to-show hint handler is gone — data-tip would be invisible on a phone");

// ── report ─────────────────────────────────────────────────────────────────────────────────────
const all = pages().filter((p) => !ONLY || p.id === ONLY);
if (ONLY && !all.length) { console.error(`✗ no <section id="${ONLY}"> in public/app.html`); process.exit(2); }
const enforced = (id) => MODE === "all" || (MODE === "gate" && SEALED.includes(id)) || ONLY === id;

for (const id of SEALED)
  if (!pages().some((p) => p.id === id)) no(`SEALED page "${id}" no longer exists — the seal drifted`);

let pending = 0;
console.log("");
for (const p of all) {
  const f = findings(p);
  const tag = enforced(p.id) ? "" : " (not sealed yet)";
  if (!f.length) { if (enforced(p.id) || MODE !== "gate") ok(`${p.id} — clean${tag}`); continue; }
  if (!enforced(p.id) && MODE === "gate") { pending += f.length; continue; }
  if (enforced(p.id)) no(`${p.id} — ${f.length} finding${f.length > 1 ? "s" : ""}${tag} (app.html:${p.line})`);
  else console.log(`  · ${p.id} — ${f.length} finding${f.length > 1 ? "s" : ""}${tag} (app.html:${p.line})`);
  const seen = new Set();
  for (const x of f) {
    const k = x.rule + x.why;
    if (seen.has(k) && MODE === "gate") continue;
    seen.add(k);
    console.log(`      [${x.rule}] ${x.why}\n        … ${x.at}`);
  }
}

console.log(`\n  unify-gate PASS: ${pass}  FAIL: ${fail}` +
  (MODE === "gate" && !ONLY
    ? `  ·  sealed: ${SEALED.length}/${pages().length} pages, ${pending} findings still waiting on their pass`
    : ""));
if (fail) {
  console.error(ONLY
    ? `\n✗ "${ONLY}" is not unified yet: clear the findings above, then add it to SEALED in the same commit.`
    : `\n✗ ADMIN UNIFY GATE FAILED. A page that already had its pass grew one of the three problems back` +
      ` (a second way to mark a hint · on-page directional copy · a line the owner has called untrue).` +
      ` Fix the page, or if the rule itself is wrong, change it here in the SAME commit and say why.`);
  process.exit(1);
}
