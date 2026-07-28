// GATE ZERO — THE SILENCE BILLING TEST (spec: the live call runtime, section 3).
//
// Run:  ./node_modules/.bin/tsx scripts/gate-zero.ts mark control
//       …place the call, hang up…
//       ./node_modules/.bin/tsx scripts/gate-zero.ts done control
//       (repeat for `test`, three runs of each)
//       ./node_modules/.bin/tsx scripts/gate-zero.ts report
//
// THE QUESTION IS NOT whether the provider discounts silence. It is whether OUR GATED STREAM counts
// as qualifying silence — which is why this cannot be answered from a price list and has to be six
// real calls.
//
//   CONTROL  30 seconds of normal back-and-forth conversation.
//   TEST     30 seconds where the store is on hold, the agent's session STAYS OPEN, and the hold
//            audio is gated exactly the way production gates it.
//
// The tool exists because the numbers have to be comparable. Reading a dashboard by eye across six
// calls, at night, is how a 5% saving and a 0% saving look the same. This reads the account itself
// before and after each call and does the subtraction.
//
// PER-CONVERSATION FIRST, DIFFERENCE SECOND. The spec is explicit: check for a per-conversation cost
// before falling back to reading the account total before and after. A per-call figure is immune to
// anything else dialling; the difference method is not, which is why it prints a warning telling you
// to run in a quiet window.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";

const KEY = process.env.ELEVENLABS_API_KEY || "";
if (!KEY) { console.error("need ELEVENLABS_API_KEY (Railway → Variables)"); process.exit(1); }

const DIR = ".gate-zero";
const FILE = `${DIR}/runs.json`;
type Run = { kind: "control" | "test"; at: number; startedCredits: number; endedCredits?: number;
  conversationId?: string; perCall?: number; connectedSecs?: number; note?: string };

const load = (): Run[] => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) as Run[] : []);
const save = (r: Run[]) => { mkdirSync(DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(r, null, 2)); };

/** Total credits used on the account right now. The difference method's input. */
async function accountCredits(): Promise<number> {
  const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": KEY } });
  if (!r.ok) throw new Error(`subscription ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const d = await r.json() as { character_count?: number };
  return Number(d.character_count ?? 0);
}

/** The most recent conversation, and its own cost if the provider exposes one. This is the figure
 *  the spec asks us to look for FIRST, because it cannot be polluted by another call running. */
async function latestConversation(): Promise<{ id: string; cost: number | null; secs: number | null } | null> {
  const r = await fetch("https://api.elevenlabs.io/v1/convai/conversations?page_size=1", { headers: { "xi-api-key": KEY } });
  if (!r.ok) return null;
  const d = await r.json() as { conversations?: Array<Record<string, unknown>> };
  const c = d.conversations?.[0];
  if (!c) return null;
  const id = String(c.conversation_id ?? "");
  // Providers name this differently and add it over time, so look for any of the shapes rather than
  // reporting "no per-call cost" because one key was missing.
  const cost = [c.cost, c.credits_used, (c.metadata as { cost?: number } | undefined)?.cost]
    .find((v) => typeof v === "number") as number | undefined;
  const secs = [c.call_duration_secs, (c.metadata as { call_duration_secs?: number } | undefined)?.call_duration_secs]
    .find((v) => typeof v === "number") as number | undefined;
  return { id, cost: cost ?? null, secs: secs ?? null };
}

const [, , cmd, arg] = process.argv;

async function main() {
  if (cmd === "mark") {
    const kind = arg === "test" ? "test" : "control";
    const startedCredits = await accountCredits();
    const runs = load();
    runs.push({ kind, at: Math.floor(Date.now() / 1000), startedCredits });
    save(runs);
    console.log(`▶ ${kind.toUpperCase()} run ${runs.filter((r) => r.kind === kind).length} armed. Account at ${startedCredits} credits.`);
    console.log(`  Place the call now. ${kind === "control" ? "Talk normally for about 30 seconds." : "Put us on hold for about 30 seconds, then come back."}`);
    console.log(`  Then: ./node_modules/.bin/tsx scripts/gate-zero.ts done ${kind}`);
    return;
  }

  if (cmd === "done") {
    const runs = load();
    const open = [...runs].reverse().find((r) => r.endedCredits === undefined);
    if (!open) { console.error("nothing armed — run `mark control` or `mark test` first"); process.exit(1); }
    open.endedCredits = await accountCredits();
    const conv = await latestConversation();
    if (conv) { open.conversationId = conv.id; open.perCall = conv.cost ?? undefined; open.connectedSecs = conv.secs ?? undefined; }
    save(runs);
    const diff = open.endedCredits - open.startedCredits;
    console.log(`✓ ${open.kind} run recorded. Account moved ${diff} credits.`);
    if (open.perCall != null) console.log(`  Per-conversation cost was exposed: ${open.perCall} credits — that is the number the report will use.`);
    else console.log(`  No per-conversation cost exposed, so the report uses the account difference. Make sure nothing else was dialling.`);
    return;
  }

  if (cmd === "report") {
    const runs = load().filter((r) => r.endedCredits !== undefined);
    if (!runs.length) { console.log("no completed runs yet"); return; }
    const creditsOf = (r: Run) => (r.perCall != null ? r.perCall : (r.endedCredits ?? 0) - r.startedCredits);
    const show = (kind: "control" | "test") => {
      const rs = runs.filter((r) => r.kind === kind);
      const vals = rs.map(creditsOf);
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      console.log(`  ${kind.padEnd(8)} ${rs.length} run(s): ${vals.join(", ")}  → average ${mean.toFixed(0)} credits`);
      return { mean, n: rs.length, vals };
    };
    console.log("\nGATE ZERO — does OUR gated stream bill as silence?\n");
    const c = show("control");
    const t = show("test");
    const method = runs.every((r) => r.perCall != null) ? "per-conversation cost" : "account difference";
    console.log(`\n  measured by: ${method}`);
    if (c.n < 3 || t.n < 3) {
      console.log(`\n  NOT ENOUGH EVIDENCE — the spec asks for three runs of each and there are ${c.n} and ${t.n}.`);
      console.log(`  One odd call must not decide this. Do the remaining runs before reading anything into it.`);
      return;
    }
    const ratio = c.mean > 0 ? t.mean / c.mean : 1;
    console.log(`\n  a held 30 seconds costs ${(ratio * 100).toFixed(0)}% of a talking 30 seconds`);
    console.log(ratio <= 0.15
      ? `\n  PASSES the billing half of the bar (about 5% was the target, anything near it is a real saving).\n  → keep ONE session alive through holds: set hold_strategy = "gate".`
      : `\n  FAILS the billing half of the bar. A gated stream bills much like a talking one, so muting saves nothing.\n  → close the session for the hold and reopen it as a new segment: set hold_strategy = "reopen".`);
    console.log(`\n  The OTHER half of the bar is not a number and this tool cannot judge it:`);
    console.log(`  did the agent come back naturally — no second greeting, no lost context, no talking over the clerk?`);
    console.log(`  If that half fails, the result is FAIL whatever the credits say.\n`);
    return;
  }

  console.log(`usage:
  gate-zero.ts mark control|test   arm a run, then place the call
  gate-zero.ts done control|test   record what it cost
  gate-zero.ts report              the verdict, once there are three of each`);
}
void main().catch((e) => { console.error(e); process.exit(1); });
