// SCORING A REPLACEMENT READER BEFORE IT IS TRUSTED (08-13, Groq's letter).
//
// Groq is decommissioning llama-3.1-8b-instant on 2026-08-16, and that model IS the reader: it
// turns Staff's words into the status the customer is charged for (VERDICT_MODEL, verdict.ts).
// The rule when it was picked (08-06) was a measurement, not a vibe: 6 of 6 on the robot store's
// own conversations, judged against the scenes' known right answers. A replacement clears the SAME
// bar or it is not the replacement.
//
// The conversations below are the robot store's approved scripts (tapedeck.ts), assembled into the
// transcript shape the reader is really handed on a check, each with the verdict its scene expects.
// Run: npx tsx scripts/reader-eval.ts   (needs GROQ_API_KEY; no phone, no store, no dial)
import { classifyVerdict, VERDICT_MODEL } from "../src/voice/verdict";

const CANDIDATE = process.env.READER_CANDIDATE || "groq:openai/gpt-oss-20b";

const Q = "Hi there! I was just checking, do you have any Pokémon cards in stock right now?";
const CASES: Array<{ name: string; want: boolean; transcript: string; product?: string }> = [
  { name: "scene 1, the clear yes", want: true, transcript:
`Clerk: Larry Vasquez, how can I help you?
Agent: ${Q}
Clerk: Yeah.
Agent: Oh nice, do you know the name of the set, and is it packs or a box or a tin?
Clerk: Uh yeah, it's the Pitch Black booster boxes.` },
  { name: "scene 2, the plain no", want: false, transcript:
`Clerk: Larry Vasquez, how can I help you?
Agent: ${Q}
Clerk: We did not.
Agent: Do you know when more are coming in?
Clerk: Uh, probably Tuesday, that's when the truck comes.
Agent: What time do they usually get there?
Clerk: Uh, morning usually, before we open.` },
  { name: "scene 3, the softened no", want: false, transcript:
`Clerk: Larry Vasquez, how can I help you?
Agent: ${Q}
Clerk: No, I'm sorry. I haven't seen any yet.
Agent: Any idea when more might come in?
Clerk: Not sure, honestly. Soon, I'd think.` },
  { name: "scene 5, no after a hold", want: false, transcript:
`Clerk: Larry Vasquez, how can I help you?
Agent: ${Q}
Clerk: Uh, Pokémon? Uh, let me check. Okay, let me just put you on hold.
Clerk: Okay, thank you for holding. Yeah, I did not see any, unfortunately.` },
  { name: "scene 7, the yes hidden inside a no", want: true, transcript:
`Clerk: Larry Vasquez, how can I help you?
Agent: ${Q}
Clerk: We did, but it's not out yet, so... uh, or I don't think it's out. Let me see.
Clerk: It's like a box with, like, three packs in it, I think, or something like that.` },
  { name: "scene 8, the vague yes after a check", want: true, transcript:
`Clerk: Larry Vasquez, how can I help you?
Agent: ${Q}
Clerk: We haven't, as a matter of fact. Uh, let me double-check though. Hold on just a moment.
Clerk: Yeah, we've got a few.
Agent: Do you know the set name?
Clerk: Uh, the Pitch Black boxes I think.` },
  { name: "scene 18, the Spanish yes", want: true, transcript:
`Clerk: MVP's, buenas tardes. ¿En qué le puedo ayudar?
Agent: Hola, buenas. Estaba viendo si tienen cartas de Pokémon en stock ahora mismo.
Clerk: Sí, tenemos algunos.
Agent: ¿Sabe de qué colección son?
Clerk: Son las cajas de Pitch Black.` },
  { name: "scene 19, the exact item confirmed", want: true, product: "Mega Evolution Pitch Black Booster Display Box", transcript:
`Clerk: Larry Vasquez, how can I help you?
Agent: Hi there! Do you have a Mega Evolution Pitch Black Booster Display Box in stock right now?
Clerk: Uh, Pokemon, yeah, we've got some stuff.
Agent: This one is the Pitch Black display box specifically, do you have that one?
Clerk: Oh, the Pitch Black boxes? Yeah, we've got a couple of those.` },
];

/** A beat between calls, INSIDE one foreground run, so Groq's free tier does not 429 the eval.
 *  Not a watcher and not a poll: the script makes its sixteen calls and exits. */
const pace = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function score(model: string): Promise<number> {
  console.log(`\n── ${model} ──`);
  let right = 0;
  for (const c of CASES) {
    await pace(4000);
    const v = await classifyVerdict(c.transcript, "Pokémon", c.product, model).catch(() => null);
    // inStock is the reader's own three words: "yes" | "no" | "unclear". An unclear or a failed
    // read is a miss here on purpose: every one of these scenes has a definite right answer.
    const got = v ? v.inStock : null;
    const ok = got === (c.want ? "yes" : "no");
    if (ok) right++;
    console.log(`  ${ok ? "✓" : "✗"} ${c.name}: want ${c.want ? "yes" : "no"}, read ${got ?? "NOTHING (failed)"}`);
  }
  console.log(`  ${right} of ${CASES.length}`);
  return right;
}

// Run with OPENAI_API_KEY UNSET. The live path falls back to gpt-4o-mini when a vendor hiccups,
// which is right on a real check and wrong here: a candidate quietly rescued by the fallback would
// score the fallback, not the candidate. With no key the fallback throws and reads as a miss.
if (process.env.OPENAI_API_KEY) {
  console.error("Unset OPENAI_API_KEY for this eval, or the fallback scores instead of the candidate.");
  process.exit(2);
}
const a = await score(VERDICT_MODEL);
const b = await score(CANDIDATE);
console.log(`\ntoday's reader ${a}/${CASES.length} · candidate ${b}/${CASES.length}`);
process.exit(b >= CASES.length && b >= a ? 0 : 1);
