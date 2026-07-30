// THE WORKFLOW THE OWNER'S SIX TEST CALLS RUN: "Test — One Question".
//
// Run: env ADMIN_BASE=https://staging.checkitforme.com ADMIN_TOKEN=… \
//        ./node_modules/.bin/tsx scripts/make-test-workflow.ts [--apply] [--assign <retailerId>]
//   without --apply it prints what it WOULD change and writes nothing.
//
// WHY IT EXISTS (owner 07-29). Gate Zero's method says "same store, same agent configuration, same
// approximate call length every time". The live default workflow rotates FOUR openers, so six test
// calls would be six slightly different calls and the numbers would not be comparable. This one asks
// the identical question every time.
//
// EVERY WORD IN IT IS ALREADY HIS. It is Branson Global — the live default — with the opener rotation
// collapsed to the single approved question, the one that actually ran on staging receipts 199 and
// 204. The voice, the speed, the model, the turn-taking and both follow-up lines are copied
// unchanged. Nothing here is newly written copy, deliberately: a test that runs different words from
// production measures the wrong thing.
//
// ONE QUESTION is declared by the DATA, not a flag: an empty `type` list means the set and the format
// are folded into the single `set` line (declaresOneTurn, src/calls/tapedeck.ts). `set` fires when the
// store HAS stock and `no` fires when it does not, so only ever one of them runs on a call.
//
// SAFE BY CONSTRUCTION: `vt_*` workflow keys are deliberately NOT in the settings-sync whitelist
// (src/settings-sync.ts), so this touches staging only and prod never sees a byte of it. It also
// APPENDS to the library and replaces only an entry of the same name, so no existing workflow and no
// other store's assignment can be lost.

/** Branson HD. The same voice every real check runs on, in both environments. */
const BRANSON_HD = "1P1JhCcLzeMmkvLi1BkG";
/** His approved question, word for word — the line that ran on receipts 199 and 204. */
const APPROVED_QUESTION = "Hi there! I was just checking, do you have any {category} cards in stock right now?";

export const TEST_ONE_QUESTION = {
  name: "Test — One Question",
  voiceId: BRANSON_HD,
  voices: [BRANSON_HD],
  lane: "charlie",
  persona: "",
  // ONE opener. This is the whole point of the workflow.
  openers: [APPROVED_QUESTION],
  followups: {
    // The set and the format in ONE line: this is what makes it one question.
    set: ["Do you know the name of the set, like Chaos Rising, and if it comes in a box or pack?"],
    // Fires instead of the above when the store has none. Still one question.
    no: ["Do you know what day or time you're getting your next shipment?"],
    // EMPTY on purpose — an empty type list IS the declaration. Never delete this key.
    type: [] as string[],
  },
  tuning: {
    speed: 0.91,
    stability: 0.25,
    latency: 1,
    modelId: "eleven_turbo_v2",
    turnEagerness: "normal",
    turnTimeout: 45,
    softTimeoutSecs: -1,
    softTimeoutMsg: "Hhmmmm...yeah.",
    llm: "claude-sonnet-4-6",
    // The voice's own opening line has to match the opener, or the two drift and the store hears one
    // question while the log records another.
    opening: APPROVED_QUESTION,
  },
};

// ---- the writer (skipped entirely when this file is imported by a test) ----------------------
const isMain = process.argv[1]?.endsWith("make-test-workflow.ts");
if (isMain) {
  const base = (process.env.ADMIN_BASE || "").replace(/\/$/, "");
  const token = process.env.ADMIN_TOKEN || "";
  const apply = process.argv.includes("--apply");
  const assignAt = process.argv.indexOf("--assign");
  const assign = assignAt >= 0 ? process.argv[assignAt + 1] : "";
  if (!base || !token) { console.error("need ADMIN_BASE and ADMIN_TOKEN"); process.exit(1); }

  const h = { "x-admin-token": token, "content-type": "application/json" };
  const settings = await fetch(`${base}/api/settings`, { headers: h }).then((r) => r.json()) as Record<string, string>;
  const jp = <T>(s: string | undefined, fb: T): T => { try { return s ? JSON.parse(s) as T : fb; } catch { return fb; } };

  const library = jp<Array<Record<string, unknown>>>(settings.vt_workflows, []);
  const had = library.findIndex((w) => w && w.name === TEST_ONE_QUESTION.name);
  const next = [...library];
  const entry = { ...TEST_ONE_QUESTION, savedAt: Number(process.env.SAVED_AT || 0) || undefined };
  if (had >= 0) next[had] = entry; else next.push(entry);

  const byStore = jp<Record<string, string>>(settings.vt_store_workflows, {});
  const nextByStore = { ...byStore };
  if (assign) nextByStore[assign] = TEST_ONE_QUESTION.name;

  console.log(`library: ${library.length} workflow(s) → ${next.length} (${had >= 0 ? "refreshed" : "added"} "${TEST_ONE_QUESTION.name}")`);
  console.log(`  one opener: ${APPROVED_QUESTION}`);
  console.log(`  follow-ups: set 1 · no 1 · type 0 (one question)`);
  if (assign) console.log(`store ${assign}: "${byStore[assign] ?? "(none)"}" → "${TEST_ONE_QUESTION.name}"`);
  if (!apply) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); process.exit(0); }

  const body: Record<string, string> = { workflows: JSON.stringify(next) };
  if (assign) body.storeWorkflows = JSON.stringify(nextByStore);
  const r = await fetch(`${base}/api/settings`, { method: "PATCH", headers: h, body: JSON.stringify(body) });
  if (!r.ok) { console.error(`PATCH /api/settings ${r.status}: ${(await r.text()).slice(0, 200)}`); process.exit(1); }
  const after = await r.json() as Record<string, string>;
  const lib2 = jp<Array<Record<string, unknown>>>(after.vt_workflows, []);
  const mine = lib2.find((w) => w && w.name === TEST_ONE_QUESTION.name);
  const store2 = jp<Record<string, string>>(after.vt_store_workflows, {});
  console.log(`\nwritten. library now ${lib2.length}; "${TEST_ONE_QUESTION.name}" present: ${!!mine}`);
  if (assign) console.log(`store ${assign} runs: ${store2[assign]}`);
  if (!mine) process.exit(1);
}
