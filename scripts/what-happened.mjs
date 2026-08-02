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
// It is ALSO the robot store harness's one read of a check (`readCheck` / `printCheck` below). The
// harness must never invent its own: two readers of the same record drift, and then a green harness
// and this screen disagree about what happened on the same check.
//
// The admin key comes from ADMIN_TOKEN, or from Railway (see CLAUDE.md for the one-line curl).

/** Every line of a check's record, straight off the live site. */
export async function readCheck(host, token, id) {
  const get = async (path) => {
    const r = await fetch(host + path, { headers: { "x-admin-token": token } });
    if (!r.ok) throw new Error(`${path} → ${r.status}`);
    return r.json();
  };
  const checkId = id || (await get("/api/admin/test-calls?limit=1")).rows?.[0]?.id;
  if (!checkId) return null;
  const d = await get(`/api/calls/${checkId}/receipt`);
  return { id: checkId, call: d.call || {}, timeline: d.timeline || [], raw: d };
}

/** The conversation as it was written down, split into turns. */
export function linesOf(rec) {
  return String(rec?.call?.transcript || "").split("\n").filter(Boolean);
}

/** THE THING TO LOOK AT FIRST. Staff speak first on every check that reaches a person, so their
 *  greeting is the first line or something is wrong. And two turns welded into one line is the
 *  transcriber never hearing a pause between them, which is about HOW we send the audio, not about
 *  what was said. Returned as data so the harness can fail on it, not only print it. */
export function firstLookAt(lines) {
  const first = lines[0] || "";
  const welded = [];
  for (const l of lines.filter((l) => l.startsWith("Clerk:"))) {
    const body = l.slice(6).trim();
    const sentences = body.split(/(?<=[.!?])\s+/).filter(Boolean);
    const greets = /thank you for calling|this is |hello|hi[,. ]|good (morning|afternoon|evening)/i.test(sentences[0] || "");
    if (greets && sentences.length > 1) welded.push(body);
  }
  return { staffFirst: first.startsWith("Clerk:"), first, welded };
}

/** How long their voice sat in our hands before the agent got it. The one number that explains the
 *  transcript faults: audio released in a burst reaches the transcriber with no pause inside it. */
export function handoverOf(rec) {
  const detailOf = (e) => { let x = e.detail; if (typeof x === "string") { try { x = JSON.parse(x); } catch { /* keep the string */ } } return x || {}; };
  const join = rec.timeline.find((e) => e.kind === "charlie_join");
  const human = rec.timeline.find((e) => e.kind === "human_detected");
  if (!join || !human) return null;
  const held = detailOf(join).heldFrames || 0;
  return { held, heldSec: (held * 20) / 1000, humanAt: human.atSec ?? 0, joinAt: join.atSec ?? 0, deafSec: (join.atSec ?? 0) - (human.atSec ?? 0), burst: held > 25 };
}

/** The whole screen, exactly as it has always printed. */
export function printCheck(rec) {
  const { call, timeline } = rec;
  const detailOf = (e) => { let x = e.detail; if (typeof x === "string") { try { x = JSON.parse(x); } catch { /* keep the string */ } } return x || {}; };
  console.log(`\n═══ CHECK ${rec.id} ═══  ${call.status || "?"}${call.statusKey ? ` · ${call.statusKey}` : ""}`);
  console.log(`served by build ${call.engineVersion || "(not stamped)"}${call.chargedAt ? " · CHARGED" : " · not charged"}`);

  console.log(`\n─── THE CONVERSATION, exactly as we wrote it down ───`);
  const lines = linesOf(rec);
  if (!lines.length) console.log("  (nothing was recorded)");
  for (const l of lines) console.log("  " + l);

  console.log(`\n─── READ THESE BEFORE ANYTHING ELSE ───`);
  const look = firstLookAt(lines);
  console.log(`  first line is ${look.staffFirst ? "STAFF ✓" : `NOT Staff ✗  (${look.first.slice(0, 40)})`}`);
  for (const body of look.welded) console.log(`  ✗ a greeting and an answer are welded into ONE line: "${body}"`);

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

  const h = handoverOf(rec);
  if (h) {
    console.log(`\n─── THE HANDOVER ───`);
    console.log(`  Staff heard at ${h.humanAt}s, Charlie opened at ${h.joinAt}s — ${h.deafSec}s where nobody of ours was listening.`);
    console.log(`  ${h.held} frames (${h.heldSec.toFixed(2)}s of their voice) were held through that and released in one go.`);
    if (h.burst) console.log(`  ✗ THAT IS THE BUG SHAPE: a burst that big has no pause in it, so it transcribes as one run-on line.`);
    else console.log(`  ✓ small enough that a burst cannot slur it.`);
  }
  console.log("");
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv.slice(2).find((a) => /^\d+$/.test(a));
  const prod = process.argv.includes("--prod");
  const HOST = prod ? "https://checkitforme.com" : "https://staging.checkitforme.com";
  const TOKEN = process.env.ADMIN_TOKEN || "";
  if (!TOKEN) {
    console.error("No ADMIN_TOKEN. Pull it from Railway (CLAUDE.md has the curl) and re-run:");
    console.error("  ADMIN_TOKEN=adm_... node scripts/what-happened.mjs");
    process.exit(2);
  }
  const rec = await readCheck(HOST, TOKEN, id);
  if (!rec) { console.error("No checks found."); process.exit(1); }
  printCheck(rec);
}
