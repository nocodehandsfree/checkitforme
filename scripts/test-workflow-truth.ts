// WORKFLOW TRUTH: everything saved on a workflow in Admin MUST land on the real call (owner 07-17:
// "how do we make sure everything set up in Admin under workflow is truly working and applying?").
// Seeds a workflow exactly the way the Admin writes it (vt_personas / vt_workflows /
// vt_store_workflows), then composes the SAME prompt + vars a live call would get and asserts every
// field arrived: persona tone + role clamp + name-echo bit, workflow opener, restock-day push,
// premium follow-up wording, voice strip resolution, tuning passthrough. A field the call path
// silently drops (07-16 found: ask_shipment_day blanked, Delta tuning unread) now FAILS the suite.
// Run: DATABASE_URL=file:./.t-wt.db ELEVENLABS_API_KEY=test ELEVENLABS_AGENT_ID=test ELEVENLABS_PHONE_NUMBER_ID=test tsx scripts/test-workflow-truth.ts
import { bootstrap } from "../src/db/bootstrap";
import { db } from "../src/db/client";
import { retailers, categories } from "../src/db/schema";
import { setSetting } from "../src/db/settings";
import { buildRestockVars, previewStorePrompt, resolveWorkflow } from "../src/calls/service";
import { resolveTapedeckWorkflow, deltaTurnTuning, DEFAULT_FOLLOWUPS } from "../src/calls/tapedeck";
import { RESTOCK_PROMPT, kioskNote, departmentNote, SOFT_TIMEOUT_FALLBACK } from "../src/voice/prompts";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  await bootstrap();
  const cat = (await db.select().from(categories))[0];
  const [store] = await db.insert(retailers).values({
    name: "Truth Test — Calabasas", phone: "+13105550000", location: "Calabasas, CA", state: "CA",
  }).returning();

  // Seed EXACTLY the shapes the Admin UI writes.
  await setSetting("vt_personas", JSON.stringify([{
    name: "Truth Kid", base: "Custom", tone: "TRUTH_TONE_MARKER excited and polite.",
    slang: true, swear: false, affection: true, greet: "",
  }]));
  await setSetting("vt_workflows", JSON.stringify([{
    name: "Truth WF", voiceId: "voice_A", voices: ["voice_A", "voice_B"],
    openers: ["TRUTH_OPENER_ONE any {category} in?", "TRUTH_OPENER_TWO got {category} today?"],
    persona: "Truth Kid", lane: "charlie",
    tuning: { speed: 0.91, stability: 0.55, turnEagerness: "patient", turnTimeout: 12, modelId: "eleven_turbo_v2" },
    followups: { type: ["TRUTH_TYPE_LINE booster pack, a box or a tin?"] },
  }]));
  await setSetting("vt_store_workflows", JSON.stringify({ [String(store.id)]: "Truth WF" }));
  await setSetting("vt_default_workflow", "Truth WF");

  console.log("▶ workflow → live-call prompt (the Charlie path every real check uses)");
  const p = await previewStorePrompt(store.id, cat.id);
  const prompt = p?.prompt || "";
  ok(!!p, "prompt composes for the assigned store");
  ok(prompt.includes("TRUTH_TONE_MARKER"), "persona tone lands in the prompt");
  ok(prompt.includes("ALWAYS the caller"), "persona role clamp is appended");
  ok(prompt.includes("greet them right back"), "name-echo (Affectionate) instruction lands");
  // THE OPENER MOVED OUT OF CHARLIE'S WORDS (the owner's rewrite, approved 08-04 and 08-05): Delta
  // plays the recorded question now, so Charlie never opens a check and his prompt must NOT carry the
  // opener. It still has to be the workflow's own, so it is asserted where it actually rides.
  const vars = await buildRestockVars(store.id, cat.id);
  ok(/TRUTH_OPENER_(ONE|TWO)/.test(vars?.dynamicVars.opening_line || ""), "workflow opener (not the global fallback) is what the check opens with");
  ok(!/TRUTH_OPENER_(ONE|TWO)/.test(prompt), "…and it is NOT in Charlie's words, because Delta asks it, not him");
  // The restock question and the set question are FIXED sections now, not swappable instruction
  // blocks: every check asks them, in the owner's approved wording.
  ok(prompt.includes("what day and time more might come in"), "the restock question is in EVERY live check");
  ok(prompt.includes("is it a pack or a box?"), "the set question carries the owner's package wording");
  ok(!prompt.includes("{{set_example}}") && /like [A-Z]/.test(prompt), "…and a real set name off the site's catalog is filled into it");
  // Copy law: dashes are banned in anything the agent SAYS. Instruction prose may use them; the
  // quoted example lines (what the model imitates) may not — except the explicit "don't do this" sample.
  const spoken = (prompt.replace('no "thanks so much — have a good one"', "").match(/"[^"\n]{4,120}"/g) || []).filter((q) => q.includes("—"));
  ok(spoken.length === 0, `no em-dash in quoted SPOKEN examples${spoken.length ? " (found: " + spoken[0] + ")" : ""}`);

  console.log("▶ workflow → resolved voice + persona (what the bridge applies)");
  const wf = await resolveWorkflow(store.id);
  ok(wf?.name === "Truth WF", "store assignment resolves to the workflow");
  ok(["voice_A", "voice_B"].includes(wf?.voiceId || ""), "voice comes from the workflow's strip");
  ok((wf?.personality || "").includes("TRUTH_TONE_MARKER"), "personality composed for the bridge");
  ok((wf?.tuning as Record<string, unknown>)?.speed === 0.91, "tuning rides along untouched");

  console.log("▶ workflow → Delta engine reads the same record (shelved lane stays truthful)");
  const td = await resolveTapedeckWorkflow("Truth WF");
  ok(td.followups.type[0].startsWith("TRUTH_TYPE_LINE"), "Delta line slots read the workflow's saved lines");
  const turn = deltaTurnTuning(td.tuning);
  ok(turn.endpoint === "5" && turn.waitSecs === 12, "Beat + Reply timeout map to the phone line (patient=5s, 12s wait)");

  console.log("▶ dash sweep — EVERY line the agent can say, from EVERY source (owner 07-17: the dash");
  console.log("  came back three times from three different hiding spots; this closes the class)");
  const anyDash = (t: string) => /—|–/.test(t) || / - /.test(t);
  // Pure spoken strings: the whole string must be clean.
  const pureSpoken: [string, string][] = [
    ["soft-timeout fallback line", SOFT_TIMEOUT_FALLBACK],
    ...Object.entries(DEFAULT_FOLLOWUPS).flatMap(([slot, arr]) => arr.map((t, i) => [`Delta default ${slot}[${i}]`, t] as [string, string])),
  ];
  for (const [label, t] of pureSpoken) ok(!anyDash(t), `no dash: ${label}`);
  // Charlie's own words. The three follow-up instruction blocks that used to be swept here are
  // RETIRED (the owner's rewrite, approved 08-04 and 08-05): sections 10 and 11 are fixed words every
  // check gets, so the words themselves are what gets swept now. The bar is higher than it was, too:
  // his rewrite forbids a dash ANYWHERE in what Charlie reads, not only inside a quoted example.
  for (const [label, block] of [
    ["Charlie's words", RESTOCK_PROMPT],
    ["the kiosk insert", kioskNote("Pokémon", true)],
    ["the wrong-department insert", departmentNote("Pokémon", true)],
    ["the no-transfer line", departmentNote("Pokémon", false)],
  ] as [string, string][]) {
    ok(!anyDash(block), `no dash anywhere in: ${label}`);
  }
  // The workflow's own saved lines (what the Admin writes) — the data shape the calls actually read.
  const dataLines = [...(td.followups ? Object.values(td.followups).flat() : []), ...(wf?.openers || [])];
  ok(!dataLines.some(anyDash), "no dash in the workflow's saved openers + Delta lines");

  console.log(fail ? `workflow-truth: ${fail} FAILED` : "workflow-truth: all applied");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
