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
import { previewStorePrompt, resolveWorkflow } from "../src/calls/service";
import { resolveTapedeckWorkflow, deltaTurnTuning } from "../src/calls/tapedeck";

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
  ok(/TRUTH_OPENER_(ONE|TWO)/.test(prompt), "workflow opener (not the global fallback) is the opening line");
  ok(prompt.includes("next shipment or restock"), "restock-day push is in EVERY live check");
  ok(prompt.includes("package looks like"), "premium follow-up carries the owner's package-question wording");
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

  console.log(fail ? `workflow-truth: ${fail} FAILED` : "workflow-truth: all applied");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
