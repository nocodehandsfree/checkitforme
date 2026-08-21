// THE REPLAY GATE (owner's order, 08-21, item 1: "build this first").
//
// Run:  ./node_modules/.bin/tsx scripts/replay-gate.ts            — grade every record against the
//       ./node_modules/.bin/tsx scripts/replay-gate.ts --show     — print what each one reads now
//       ./node_modules/.bin/tsx scripts/replay-gate.ts --write    — move the golden ON PURPOSE, then read the diff
//
// WHY IT EXISTS, in his words: "372's order fix broke the timestamps, that fix let Charlie answer
// the advert, the advert fix left him mute 26 seconds. Every one of these lives at the same instant,
// the moment Charlie's turn is released, and four different things read that instant. Nobody
// re-checks the other three."
//
// So every recorded check replays against every change from now on, and each one must still come
// out right on FOUR things, not just the fault being fixed:
//    1 THE WORDS   — the lines that survive, in the store's own words and ours, after our own voice
//                    coming back off the line is killed by the clock.
//    2 THE ORDER   — every line carries its own start and end, nothing files above the line before
//                    it, and no line of his is stamped inside his own previous one.
//    3 THE METER   — what the card's meter half grades: the seconds, the pass, and what failed it.
//    4 THE COST    — the whole cost off the record's own seconds, and the buckets summing to it
//                    exactly.
// Any change that moves one of them fails and does not ship. Moving one ON PURPOSE means editing
// the golden below in the same commit, where the diff shows the owner exactly what moved and why.
//
// The records are whole receipts fetched off staging and committed beside this file, so this runs
// forever with no network and no key (rule 12: his phone never re-finds an old fault).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { meterVerdict, spokeOverTheRecording, wentQuietOnThem } from "../src/calls/meter";
import { ourVoiceWasPlaying, type OurVoiceWindow } from "../src/calls/events";
import { costCall, costBuckets } from "../src/calls/cost";
import { TEST_CARDS } from "../src/calls/behaved";

const dir = process.argv[2] && !process.argv[2].startsWith("--")
  ? process.argv[2]
  : join(import.meta.dirname ?? ".", "replay-records");
const SHOW = process.argv.includes("--show");
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, saw?: unknown) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${saw !== undefined ? `\n      saw ${JSON.stringify(saw)}` : ""}`); }
};

interface Line { who: string; text: string; atMs: number | null; endMs?: number | null }
interface Rec {
  timeline: Array<{ kind: string; atMs?: number | null; detail?: Record<string, unknown> | null }>;
  lines: Line[];
  seconds?: Record<string, number | null>;
  v2?: { profitPct?: number | null };
}
const load = (n: string): Rec => JSON.parse(readFileSync(join(dir, `rep${n}.json`), "utf8")) as Rec;

/** OUR OWN SOUND, AS STRETCHES: every Agent line is a stretch the store heard our voice fill. On a
 *  live call the bridge keeps these as it plays them; on a record they are simply his lines. */
const ourVoice = (r: Rec): OurVoiceWindow[] => r.lines
  .filter((l) => l.who === "Agent" && l.atMs != null)
  .map((l) => ({ fromMs: l.atMs as number, toMs: (l.endMs ?? l.atMs) as number }));

/** 1 THE WORDS: what is really left after our own echo is dropped, each line named by who said it. */
function words(r: Rec): string[] {
  const mine = ourVoice(r);
  return r.lines
    .filter((l) => l.who === "Agent" || !ourVoiceWasPlaying(l.atMs, mine, l.endMs))
    .map((l) => `${l.who}: ${String(l.text).slice(0, 60)}`);
}

/** 2 THE ORDER: the faults 372 and 428 each cost a day, as one sentence per record. */
function order(r: Rec): string[] {
  const bad: string[] = [];
  const timed = r.lines.filter((l) => l.atMs != null);
  for (let i = 1; i < timed.length; i++) {
    if ((timed[i].atMs as number) < (timed[i - 1].atMs as number))
      bad.push(`"${timed[i].text.slice(0, 30)}" files above the line before it`);
  }
  for (const l of r.lines) {
    if (l.atMs == null) bad.push(`"${l.text.slice(0, 30)}" has no start`);
    else if (l.endMs != null && l.endMs < l.atMs) bad.push(`"${l.text.slice(0, 30)}" ends before it starts`);
  }
  // His own line inside his own previous one — 428's goodbye landing inside his own question.
  const his = r.lines.filter((l) => l.who === "Agent" && l.atMs != null && l.endMs != null);
  for (let i = 1; i < his.length; i++) {
    if ((his[i].atMs as number) < (his[i - 1].endMs as number))
      bad.push(`his "${his[i].text.slice(0, 30)}" starts inside his own line before it`);
  }
  return bad;
}

/** 3 THE METER: exactly what the sheet grades, off the record's own numbers. */
function meter(r: Rec) {
  const v = meterVerdict(TEST_CARDS.hold_music_advert, {
    meterSec: r.seconds?.charlieConnectedSeconds ?? null,
    speakingSec: r.seconds?.speakingSecs ?? null,
    listeningSec: r.seconds?.listeningSecs ?? null,
    awakeOnHoldSec: r.seconds?.awakeOnHoldSeconds ?? null,
    profitPct: r.v2?.profitPct ?? null,
    spokeOverRecording: spokeOverTheRecording(r.timeline, r.lines ?? null),
    quietOnThem: wentQuietOnThem(r.timeline, r.lines ?? null),
  })!;
  return { pass: v.pass, shortFails: v.shortFails };
}

/** 4 THE COST: priced the same way the record's own route prices it, and the buckets must sum to it
 *  exactly — the one rule that has caught every bucket change since 08-04. */
function cost(r: Rec) {
  const s = r.seconds ?? {};
  const callSecs = Number(s.callSecs ?? 0);
  const c = costCall({
    callSecs,
    charlieSecs: Number(s.charliePaidSeconds ?? 0),
    avoidableSecs: Number(s.charlieSilentSeconds ?? 0),
    forkSecs: [callSecs, Math.max(0, callSecs - Number(s.menuSeconds ?? 0))],
  });
  const walked = r.timeline.some((e) => e.kind === "alpha_press") ? "alpha" as const
    : r.timeline.some((e) => e.kind === "bravo_say") ? "bravo" as const : null;
  const buckets = costBuckets(c, { callSecs, navSecs: s.navSeconds ?? null, streams: 2,
    speakingSecs: s.speakingSecs ?? null, listeningSecs: s.listeningSecs ?? null, menuWalkedBy: walked });
  const summed = buckets.reduce((t, b) => t + b.usd, 0);
  return { totalUsd: c.totalUsd, summed, buckets: buckets.map((b) => b.key).join(",") };
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// THE RECORDS, AND WHAT EACH ONE IS HERE TO HOLD. Every real check the advert scene and the owner's
// own phone have produced since our own brain shipped.
// ───────────────────────────────────────────────────────────────────────────────────────────────
const RECORDS: Array<[string, string]> = [
  ["427", "our own brain's first advert check: his full reply never played and Staff had to speak first"],
  ["428", "the clean one — the check the owner accepted, and the shape everything else is measured against"],
  ["430", "Charlie answered the store's advert, and the sheet still said TEST PASSED"],
  ["431", "the owner's own Fun store: our own voice came back off his speaker and was written down as Staff"],
  ["432", "the advert is refused, and he then stood mute for 26 seconds while a person waited"],
  ["433", "the first check on the inverted meter: 35 seconds where 432 ran 57, and no mute at all"],
];

// THE GOLDEN: what all four of those things read today, on the fixed engine, for every record. A
// number in here only ever moves in a commit that says why — that is the whole gate.
const goldenPath = join(dir, "golden.json");
const WRITE = process.argv.includes("--write");
type Golden = { words: string[]; meter: { pass: boolean; shortFails: string[] }; cost: { totalUsd: number; buckets: string } };
const GOLDEN: Record<string, Golden> = WRITE ? {} : JSON.parse(readFileSync(goldenPath, "utf8"));

for (const [n, why] of RECORDS) {
  const r = load(n);
  const w = words(r), o = order(r), m = meter(r), c = cost(r);
  if (WRITE) { GOLDEN[n] = { words: w, meter: m, cost: { totalUsd: c.totalUsd, buckets: c.buckets } }; continue; }
  if (SHOW) { console.log(`\n▶ CHECK ${n}`); console.log(JSON.stringify({ words: w, order: o, meter: m, cost: c }, null, 1)); continue; }
  const g = GOLDEN[n];
  console.log(`\n▶ CHECK ${n} — ${why}`);
  if (!g) { ok("this record has a golden to be held to", false, n); continue; }
  ok("1 the words, and only the words really said", JSON.stringify(w) === JSON.stringify(g.words), w);
  ok("2 the order: every line where the store really heard it", o.length === 0, o);
  ok("3 the meter grades the same as it did", JSON.stringify(m) === JSON.stringify(g.meter), m);
  ok("4 the cost is the same, and the buckets sum to it exactly",
    c.totalUsd === g.cost.totalUsd && c.summed === c.totalUsd && c.buckets === g.cost.buckets, c);
}

if (WRITE) {
  writeFileSync(goldenPath, JSON.stringify(GOLDEN, null, 1) + "\n");
  console.log(`wrote ${goldenPath} — READ THE DIFF: anything that moved, moved because of your change.`);
  process.exit(0);
}
if (SHOW) process.exit(0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
