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
//   TEST     30 seconds where the store puts us on hold, then comes back.
//
// WHAT THE TEST CONDITION MEANS NOW (owner, 2026-07-28). He deleted the switch: hanging the thinking
// up on a hold is simply how the system works, always, because it is the basis of the whole design.
// So a held call no longer keeps one session open and gated. It CLOSES the session for the wait and
// opens a fresh segment of the same call when somebody comes back. The question these six calls
// answer is therefore the one that is left: does the meter really stop while nobody is talking, and
// does he come back without greeting them all over again.
//
// A HELD CALL OPENS MORE THAN ONE CONVERSATION ON THE ACCOUNT. Each segment is its own conversation
// id, so reading "the last conversation" would price the tail of the call and miss the rest. Every
// conversation the call opened is summed, which is what makes control and test comparable at all.
//
// The tool exists because the numbers have to be comparable. Reading a dashboard by eye across six
// calls, at night, is how a 5% saving and a 0% saving look the same. This reads the account itself
// and does the arithmetic.
//
// PER-CONVERSATION FIRST, DIFFERENCE SECOND. The spec is explicit: check for a per-conversation cost
// before falling back to reading the account total before and after. A per-call figure is immune to
// anything else dialling; the difference method is not, which is why it prints a warning telling you
// to run in a quiet window. The provider does expose it, on the conversation itself rather than in
// the list, and it splits the voice charge from the brain charge. Both are recorded.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";

const KEY = process.env.ELEVENLABS_API_KEY || "";
if (!KEY) { console.error("need ELEVENLABS_API_KEY (Railway → Variables)"); process.exit(1); }

const DIR = ".gate-zero";
const FILE = `${DIR}/runs.json`;
type Run = { kind: "control" | "test"; at: number; startedCredits: number; endedCredits?: number;
  conversationId?: string; conversationIds?: string[]; perCall?: number; voiceCredits?: number;
  brainCredits?: number; connectedSecs?: number; note?: string };

const load = (): Run[] => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) as Run[] : []);
const save = (r: Run[]) => { mkdirSync(DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(r, null, 2)); };

/** Total credits used on the account right now. The difference method's input. */
async function accountCredits(): Promise<number> {
  const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": KEY } });
  if (!r.ok) throw new Error(`subscription ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const d = await r.json() as { character_count?: number };
  return Number(d.character_count ?? 0);
}

/** EVERY conversation this call opened, and what each one cost. A call that was held closes its
 *  session and opens another, so one call is one or more conversations and only the sum is the call.
 *  The cost lives on the conversation itself, not on the list row, which is why each one is fetched. */
async function conversationsSince(startedAt: number): Promise<{ ids: string[]; cost: number | null; voice: number; brain: number; secs: number } | null> {
  const r = await fetch("https://api.elevenlabs.io/v1/convai/conversations?page_size=30", { headers: { "xi-api-key": KEY } });
  if (!r.ok) return null;
  const d = await r.json() as { conversations?: Array<Record<string, unknown>> };
  // A few seconds of slack: the conversation opens fractionally before or after the arming call.
  const mine = (d.conversations ?? []).filter((c) => Number(c.start_time_unix_secs ?? 0) >= startedAt - 5);
  if (!mine.length) return null;
  const ids: string[] = []; let cost = 0, voice = 0, brain = 0, secs = 0, priced = 0;
  for (const c of mine) {
    const id = String(c.conversation_id ?? ""); if (!id) continue;
    ids.push(id);
    const dr = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}`, { headers: { "xi-api-key": KEY } });
    if (!dr.ok) continue;
    const m = ((await dr.json()) as { metadata?: Record<string, unknown> }).metadata ?? {};
    const ch = (m.charging ?? {}) as Record<string, unknown>;
    // Providers name this differently and add to it over time, so look for any of the shapes rather
    // than reporting "no per-call cost" because one key was missing.
    const one = [m.cost, ch.call_charge].find((v) => typeof v === "number") as number | undefined;
    if (typeof one === "number") { cost += one; priced++; }
    if (typeof ch.platform_charge === "number") voice += ch.platform_charge;
    if (typeof ch.llm_charge === "number") brain += ch.llm_charge;
    if (typeof m.call_duration_secs === "number") secs += m.call_duration_secs;
  }
  return { ids, cost: priced ? cost : null, voice, brain, secs };
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
    console.log(`  Place the call now. ${kind === "control" ? "Talk normally for about 30 seconds." : "Put us on hold for about 30 seconds, then come back and answer."}`);
    console.log(`  Then: ./node_modules/.bin/tsx scripts/gate-zero.ts done ${kind}`);
    return;
  }

  if (cmd === "done") {
    const runs = load();
    const open = [...runs].reverse().find((r) => r.endedCredits === undefined);
    if (!open) { console.error("nothing armed — run `mark control` or `mark test` first"); process.exit(1); }
    open.endedCredits = await accountCredits();
    const conv = await conversationsSince(open.at);
    if (conv) {
      open.conversationIds = conv.ids; open.conversationId = conv.ids[0];
      open.perCall = conv.cost ?? undefined; open.voiceCredits = conv.voice; open.brainCredits = conv.brain;
      open.connectedSecs = conv.secs;
    }
    save(runs);
    const diff = open.endedCredits - open.startedCredits;
    console.log(`✓ ${open.kind} run recorded. Account moved ${diff} credits.`);
    if (conv) console.log(`  ${conv.ids.length} conversation(s) in this call: ${conv.ids.join(", ")}`);
    if (open.perCall != null) console.log(`  Per-conversation cost: ${open.perCall} credits (voice ${open.voiceCredits}, brain ${open.brainCredits}). That is the number the report uses.`);
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
    console.log("\nGATE ZERO. Does the meter really stop while nobody is talking?\n");
    const c = show("control");
    const t = show("test");
    const split = (kind: "control" | "test") => {
      const rs = runs.filter((r) => r.kind === kind && r.voiceCredits != null);
      if (!rs.length) return;
      const avg = (f: (r: Run) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
      console.log(`  ${kind.padEnd(8)} voice ${avg((r) => r.voiceCredits ?? 0).toFixed(0)} credits · brain ${avg((r) => r.brainCredits ?? 0).toFixed(0)} credits`);
    };
    split("control"); split("test");
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
      ? `\n  PASSES the billing half of the bar (about 5% was the target, anything near it is a real saving).\n  Hanging the thinking up for the wait is doing what it was built to do.`
      : `\n  FAILS the billing half of the bar. A held call still bills close to a talking one, so the wait is\n  costing money it should not. Read the voice and brain split above: whichever of the two did not\n  drop is the one still running while nobody is there, and that is the next thing to fix.`);
    console.log(`\n  The OTHER half of the bar is not a number and this tool cannot judge it:`);
    console.log(`  did the agent come back naturally, with no second greeting, no lost context, and no talking`);
    console.log(`  over Staff? If that half fails, the result is FAIL whatever the credits say.\n`);
    return;
  }

  console.log(`usage:
  gate-zero.ts mark control|test   arm a run, then place the call
  gate-zero.ts done control|test   record what it cost
  gate-zero.ts report              the verdict, once there are three of each`);
}
void main().catch((e) => { console.error(e); process.exit(1); });
