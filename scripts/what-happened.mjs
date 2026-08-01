// WHAT ACTUALLY HAPPENED ON THE OWNER'S LAST CHECK. Read this BEFORE writing a line of code.
//
// WHY THIS EXISTS (owner, 08-01, after the same transcript fault survived three "fixed" claims):
// every one of those fixes passed the engine test rig and failed on his phone. The rig stands up a
// pretend voice provider, and a pretend provider does whatever the person who wrote it assumed —
// so a fix built on a wrong assumption passes its own test forever. The rig can prove OUR OWN
// behaviour (what we buffer, when we open the agent, what we record). It can NEVER prove what the
// real transcriber does with what we send it. That half is only knowable from a real check.
//
// This reads the SAVED RECORD of a real check straight off the live site: the conversation exactly
// as it was written down, the timeline with its real seconds, how much audio was held back and for
// how long, and which build served it. Every fault of 08-01 is visible here in one screen, and every
// one of them was diagnosed by guessing instead.
//
// Run:  node scripts/what-happened.mjs              (the newest check on staging)
//       node scripts/what-happened.mjs 229          (that check)
//       node scripts/what-happened.mjs 229 --prod   (the real site)
//
// The admin key comes from ADMIN_TOKEN, or from Railway (see CLAUDE.md for the one-line curl).
const id = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const prod = process.argv.includes("--prod");
const HOST = prod ? "https://checkitforme.com" : "https://staging.checkitforme.com";
const TOKEN = process.env.ADMIN_TOKEN || "";
if (!TOKEN) {
  console.error("No ADMIN_TOKEN. Pull it from Railway (CLAUDE.md has the curl) and re-run:");
  console.error("  ADMIN_TOKEN=adm_... node scripts/what-happened.mjs");
  process.exit(2);
}
const get = async (path) => {
  const r = await fetch(HOST + path, { headers: { "x-admin-token": TOKEN } });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
};

const checkId = id || (await get("/api/admin/test-calls?limit=1")).rows?.[0]?.id;
if (!checkId) { console.error("No checks found."); process.exit(1); }

const d = await get(`/api/calls/${checkId}/receipt`);
const call = d.call || {};
const timeline = d.timeline || [];
const detailOf = (e) => { let x = e.detail; if (typeof x === "string") { try { x = JSON.parse(x); } catch { /* keep the string */ } } return x || {}; };

console.log(`\n═══ CHECK ${checkId} ═══  ${call.status || "?"}${call.statusKey ? ` · ${call.statusKey}` : ""}`);
console.log(`served by build ${call.engineVersion || "(not stamped)"}${call.chargedAt ? " · CHARGED" : " · not charged"}`);

console.log(`\n─── THE CONVERSATION, exactly as we wrote it down ───`);
const lines = String(call.transcript || "").split("\n").filter(Boolean);
if (!lines.length) console.log("  (nothing was recorded)");
for (const l of lines) console.log("  " + l);

// THE THING TO LOOK AT FIRST. Staff speak first on every check that reaches a person, so their
// greeting is the first line or something is wrong. And two turns welded into one line is the
// transcriber never hearing a pause between them, which is about HOW we send the audio, not about
// what was said.
console.log(`\n─── READ THESE BEFORE ANYTHING ELSE ───`);
const first = lines[0] || "";
console.log(`  first line is ${first.startsWith("Clerk:") ? "STAFF ✓" : `NOT Staff ✗  (${first.slice(0, 40)})`}`);
const staffLines = lines.filter((l) => l.startsWith("Clerk:"));
for (const l of staffLines) {
  const body = l.slice(6).trim();
  // A greeting and an answer in one line is the fault that survived three fixes. Two sentences where
  // one is a greeting and the rest answers a question is worth a second look, every time.
  const sentences = body.split(/(?<=[.!?])\s+/).filter(Boolean);
  const greets = /thank you for calling|this is |hello|hi[,. ]|good (morning|afternoon|evening)/i.test(sentences[0] || "");
  if (greets && sentences.length > 1) console.log(`  ✗ a greeting and an answer are welded into ONE line: "${body}"`);
}

console.log(`\n─── THE TIMELINE, in real seconds ───`);
for (const e of timeline) {
  const det = detailOf(e);
  const extra = [];
  if (det.heldFrames != null) extra.push(`held ${det.heldFrames} frames = ${(det.heldFrames * 20 / 1000).toFixed(2)}s of audio, handed over AT ONCE`);
  if (det.clipMs != null) extra.push(`our question ran ${(det.clipMs / 1000).toFixed(1)}s`);
  if (det.handoverVia) extra.push(det.handoverVia);
  if (det.reason) extra.push(String(det.reason));
  if (det.gapSec != null) extra.push(`gap ${det.gapSec}s${det.maybeNewPerson ? ", may be someone new" : ""}`);
  console.log(`  ${String(e.atSec).padStart(3)}s  ${String(e.kind).padEnd(16)} ${String(e.note || "").slice(0, 58)}${extra.length ? `\n         ↳ ${extra.join(" · ")}` : ""}`);
}

// HOW LONG THE AUDIT AUDIO SAT IN OUR HANDS. This one number explains the transcript faults: audio
// held and then released in a burst reaches the transcriber with no pause anywhere inside it, so it
// comes back as one run-on sentence with the words slurred together.
const join = timeline.find((e) => e.kind === "charlie_join");
const human = timeline.find((e) => e.kind === "human_detected");
if (join && human) {
  const held = detailOf(join).heldFrames || 0;
  const wait = (join.atSec ?? 0) - (human.atSec ?? 0);
  console.log(`\n─── THE HANDOVER ───`);
  console.log(`  Staff heard at ${human.atSec}s, Charlie opened at ${join.atSec}s — ${wait}s where nobody of ours was listening.`);
  console.log(`  ${held} frames (${(held * 20 / 1000).toFixed(2)}s of their voice) were held through that and released in one go.`);
  if (held > 25) console.log(`  ✗ THAT IS THE BUG SHAPE: a burst that big has no pause in it, so it transcribes as one run-on line.`);
  else console.log(`  ✓ small enough that a burst cannot slur it.`);
}
console.log("");
