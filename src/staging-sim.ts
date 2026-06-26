// Simulated calls for the STAGING preview only (config.staging.on). A check produces a realistic,
// time-progressing FAKE call — growing live transcript, then a verdict — so the whole consumer flow
// (pick a store → live screen → result) can be reviewed end-to-end with ZERO real telephony / cost.
// A sim id encodes the start time + verdict; /pub/live and /pub/result derive everything from it.
// Never used in prod (every call site is gated on config.staging.on).

type Verdict = "in" | "out" | "maybe";
const DONE_AT = 22; // seconds — when the simulated call "ends"

// Rotate verdicts so consecutive checks show variety (in → out → maybe → …).
let counter = 0;
const ROTATION: Verdict[] = ["in", "in", "out", "maybe"];

/** Start a simulated call — returns a sim id used as both the bridge "room" and the conversation id. */
export function simStartCall(): { providerCallId: string; status: string } {
  const v = ROTATION[counter++ % ROTATION.length];
  return { providerCallId: `sim_${Date.now()}_${v}`, status: "queued" };
}

export function isSimId(id: string | undefined | null): boolean {
  return !!id && /^sim_\d+_(in|out|maybe)$/.test(id);
}

function parse(id: string): { startMs: number; v: Verdict } {
  const [, ms, v] = id.split("_");
  return { startMs: Number(ms) || Date.now(), v: (v as Verdict) || "in" };
}

/** Scripted transcript lines with the second they "arrive" — mirrors a real ~22s store call. */
function script(v: Verdict): { at: number; line: string }[] {
  const open = [
    { at: 3, line: "Clerk: Thanks for calling, how can I help you?" },
    { at: 7, line: "Agent: Hi! Quick question — do you have any Pokémon trading cards in stock right now?" },
  ];
  if (v === "in") return [...open,
    { at: 12, line: "Clerk: Let me take a look for you… yeah, we just put some out." },
    { at: 17, line: "Clerk: We've got the 3-pack blisters on the shelf by the registers." },
    { at: 20, line: "Agent: Perfect — thank you so much!" }];
  if (v === "out") return [...open,
    { at: 12, line: "Clerk: Let me check… no, we don't have any in stock right now." },
    { at: 16, line: "Agent: No worries at all — thanks so much for checking!" }];
  return [...open,
    { at: 13, line: "Clerk: Hmm, I'm not totally sure — we might have some in the back, hard to say." },
    { at: 18, line: "Agent: Got it — really appreciate you checking!" }];
}

/** Live, mid-call transcript: whatever has been "said" so far. live=false once the call ends. */
export function simLive(id: string): { live: boolean; status: string; transcript: string } {
  const { startMs, v } = parse(id);
  const elapsed = (Date.now() - startMs) / 1000;
  const lines = script(v).filter((l) => l.at <= elapsed).map((l) => l.line);
  const done = elapsed >= DONE_AT;
  return { live: !done, status: done ? "done" : "in_progress", transcript: lines.join("\n") };
}

/** Final outcome once the simulated call has ended; in_progress until then. */
export function simResult(id: string): Record<string, unknown> {
  const { startMs, v } = parse(id);
  const elapsed = (Date.now() - startMs) / 1000;
  const transcript = script(v).map((l) => l.line).join("\n");
  if (elapsed < DONE_AT) {
    return { status: "in_progress", transcript: script(v).filter((l) => l.at <= elapsed).map((l) => l.line).join("\n"), summary: "" };
  }
  const byVerdict: Record<Verdict, Record<string, unknown>> = {
    in:    { confirmed: true,  statusKey: "in_stock",       productName: "3-pack blister", productDetail: "3-pack blister", summary: "Clerk confirmed Pokémon 3-pack blisters are on the shelf by the registers.", shipmentDay: null },
    out:   { confirmed: false, statusKey: "not_in_stock",   productName: null,             productDetail: null,             summary: "Clerk checked — no Pokémon in stock right now.", shipmentDay: null },
    maybe: { confirmed: null,  statusKey: "no_clear_answer", productName: null,            productDetail: null,             summary: "Clerk wasn't sure — possibly some in the back, but wouldn't commit.", shipmentDay: null },
  };
  return { status: "completed", durationSec: DONE_AT, ...byVerdict[v], transcript };
}
