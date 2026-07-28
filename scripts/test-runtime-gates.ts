// THE RULES THAT ONLY EXISTED AS WORDS, TURNED INTO A TEST THAT FAILS.
// Run: env … ./node_modules/.bin/tsx scripts/test-runtime-gates.ts
//
// WHY THIS FILE EXISTS (owner + both engineers, 2026-07-28). Look at what actually held on the night
// this was built: nobody edited a locked file, nobody shipped a dash inside a sentence, nobody pushed
// a doc over its size cap. Those held because a hook stops you. EVERY rule that got broken was one
// that was only written down — two engineers each built their own audio detection, and a dialling
// path shipped with no receipt.
//
// So the fix is not a better spec. It is this: the three rules that matter most are now checked by
// something that fails, and nobody has to remember them.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

/** Every .ts file under src/, recursively. */
function sources(dir = "src", out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}
const files = sources();
const read = (f: string) => readFileSync(f, "utf8");

// ================================================================================================
console.log("▶ ONE EAR. Audio detection lives in the shared file, and nowhere else.");
{
  // The failure this catches: a second engineer, working from the same spec, quietly building their
  // own listener. Two ears drift, disagree about what counts as sound, and then nobody can say why
  // one call behaved differently from another. The spec says it in words; this says it in a failure.
  const ALLOWED = new Set([
    "src/calls/listen-nav.ts",   // THE ear. Pure, dependency-free, unit-testable.
    "src/voice/bridge.ts",       // the bridge's own copy, machine-locked and predating the shared one
  ]);
  // The signatures of somebody decoding phone audio or measuring what is on the line.
  const MARKS = [/ulawByteToLinear/, /ULAW_BIAS/, /function\s+frameEnergy/, /function\s+toneShare/, /Goertzel|goertzel/];
  const offenders = files.filter((f) => !ALLOWED.has(f) && MARKS.some((m) => m.test(read(f))));
  ok(offenders.length === 0, offenders.length
    ? `a SECOND EAR exists in: ${offenders.join(", ")} — move it into src/calls/listen-nav.ts`
    : "no second ear: only the shared file and the locked bridge decode audio");
  // …and the allowed list itself must not quietly grow.
  ok(ALLOWED.size === 2, "the allow-list is still exactly two files — adding a third needs a decision, not an edit");
}

console.log("\n▶ EVERY PATH THAT DIALS A STORE OPENS A RECEIPT.");
{
  // Hard rule 4: "A call that does not produce a receipt is a bug, not a special case." The old
  // direct lane shipped for months with no receipt at all, so with the new engine switched off every
  // real check was invisible. Anything that asks a carrier to dial has to leave a record.
  // PLACING a call, not reading about one. A POST to .../Calls.json with no query string is a dial;
  // the same URL with ?PageSize=200 is the billing report reading history back, and a gate that
  // flags that is a gate somebody switches off.
  const DIALS = [
    /Accounts\/\$\{[^}]+\}\/Calls\.json`/,
    /provider\.startCall/,
  ];
  const opensReceipt = /openReceipt\s*\(/;
  const dialers = files.filter((f) => DIALS.some((d) => d.test(read(f))));
  ok(dialers.length > 0, `found the dialling paths (${dialers.length}) — this gate is not silently passing on zero files`);
  const silent = dialers.filter((f) => !opensReceipt.test(read(f)));
  ok(silent.length === 0, silent.length
    ? `these dial a store and open NO receipt: ${silent.join(", ")}`
    : `all ${dialers.length} dialling paths open a receipt: ${dialers.map((f) => f.replace("src/", "")).join(", ")}`);
}

console.log("\n▶ NO CONVERSATION AUDIO IS EVER PERSISTED.");
{
  // The rule that must never bend, and the one most likely to be broken by someone being helpful.
  // Our own synthesized clips are the single deliberate exception (rule 3) and are cached in memory
  // by clip-cache.ts, which is why it is named here rather than caught.
  // PER LINE, not per file. server.ts writes the Admin shell to disk and also mentions audio
  // elsewhere in nine thousand lines; flagging that teaches everyone to ignore this gate. What
  // matters is a single statement that writes AND is handling audio.
  const WRITES = /writeFileSync|createWriteStream|fs\.promises\.writeFile|PutObjectCommand|\.upload\(|putObject/;
  const AUDIOISH = /ulaw|mulaw|audio_base_?64|media\.payload|\.wav\b|\.mp3\b|audioBuffer|clip\.audio/i;
  const risky = files.filter((f) => f !== "src/calls/clip-cache.ts"
    && read(f).split("\n").some((line) => WRITES.test(line) && AUDIOISH.test(line)));
  ok(risky.length === 0, risky.length
    ? `these write to disk or object storage AND handle audio: ${risky.join(", ")} — check rule 3 before shipping`
    : "nothing writes audio to disk or object storage");
}

console.log("\n▶ THE CLOSED SET OF SIXTEEN EVENT KINDS HAS NOT GROWN.");
{
  // Addie's dashboard is built against exactly this list, so a seventeenth kind silently falls off
  // her screen. Finer detail goes in `detail`, never in a new kind.
  const src = read("src/calls/events.ts");
  const block = src.slice(src.indexOf("export type EventKind"), src.indexOf("/** Which lane walked"));
  // Only the union members themselves: a line that STARTS with `| "..."`. Anything quoted inside a
  // trailing comment (detail.leg: "store" | "desk") is documentation, not a kind.
  const kinds = block.split("\n")
    .map((l) => /^\s*\|\s*"([a-z_]+)"/.exec(l)?.[1])
    .filter((k): k is string => !!k);
  ok(kinds.length === 16, `${kinds.length} event kinds (must be exactly 16): ${kinds.join(" ")}`);
}

console.log(`\n════════════════════════════════\n  PASS: ${pass}   FAIL: ${fail}\n════════════════════════════════`);
process.exit(fail === 0 ? 0 : 1);
