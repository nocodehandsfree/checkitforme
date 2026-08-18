// READ AS IT GOES (owner 2026-07-30).
//
// The reader used to start only AFTER the check ended, so the customer sat on "Getting the answer…"
// while a model that takes about a second read words we had already had for a while. Nothing forced
// that: ElevenLabs streams every line to us the moment it is spoken (bridge.ts user_transcript /
// agent_response), and we write each one down ourselves in calls/events.ts recordLine.
//
// So the read now runs DURING the check, off our own live record. It costs nothing on the line —
// Charlie never knows it happened and hangs up exactly as fast as before. By the time he hangs up,
// the read is already sitting here and the finalize paths pick it up instead of spending a fresh one.
//
// Nothing about the verdict RULE changes: consensusFor still merges this read with ElevenLabs' own,
// and a disagreement is still an honest "no clear answer" with no charge. This only moves WHEN our
// half of that pair is computed.
import { classifyVerdict, type ClerkVerdict } from "./verdict";
import { nudgeSignoff, bridgeLog } from "./bridge";

interface LiveRead {
  category: string;
  specificProduct?: string;
  lines: { who: "Agent" | "Clerk"; text: string }[];
  asked: boolean;          // Charlie has put the stock question — before that there is nothing to read
  running: boolean;        // one read in flight at a time; a newer line re-runs when it lands
  dirty: boolean;          // a line arrived while a read was running → read again when it finishes
  verdict: ClerkVerdict | null;
  readAtMs: number;        // when the newest read finished (0 = none yet)
  retried: boolean;        // one failed read gets ONE second try, never a loop
}

const reads = new Map<string, LiveRead>();

// The stock question, the same shape the site uses to decide a person is really on the line.
const ASKED_RE = /\b(in stock|got any|have any|carry|checking to see|any .{0,30}(cards|boxes|packs|tins))\b/i;
// A store-side line is worth reading only when it carries actual words — ringback and hold silence
// come through speech to text as stray dots and would just burn a read.
const HAS_WORDS = /[a-zA-ZÀ-ɏ]{2,}/;

/** A check has started on this room. Call once, at dial. */
export function armLiveRead(room: string, category: string, specificProduct?: string): void {
  if (!room) return;
  reads.set(room, { category, specificProduct, lines: [], asked: false, running: false, dirty: false, verdict: null, readAtMs: 0, retried: false });
  bridgeLog(`reader: armed for ${room.slice(0, 8)} (${category})`);
}

/** Every line, both sides, as it is spoken. Wired into calls/events.ts recordLine. */
export function noteLiveLine(room: string, who: "Agent" | "Clerk", text: string): void {
  const r = reads.get(room);
  if (!r) return;
  const t = String(text || "").trim();
  if (!t) return;
  r.lines.push({ who, text: t.slice(0, 1000) });
  if (r.lines.length > 300) r.lines.splice(0, r.lines.length - 300);
  if (who === "Agent") { if (!r.asked && ASKED_RE.test(t)) { r.asked = true; bridgeLog(`reader: the question is on the record for ${room.slice(0, 8)}`); } return; }
  // Staff just said something. Read the conversation so far.
  if (!r.asked || !HAS_WORDS.test(t)) { if (!r.asked) bridgeLog(`reader: Staff spoke before the question for ${room.slice(0, 8)}, nothing to read yet`); return; }
  if (r.running) { r.dirty = true; return; }
  bridgeLog(`reader: reading ${room.slice(0, 8)} after "${t.slice(0, 40)}"`);
  void runRead(room);
}

async function runRead(room: string): Promise<void> {
  const r = reads.get(room);
  if (!r || r.running) return;
  r.running = true;
  try {
    const v = await classifyVerdict(transcriptSoFar(r), r.category, r.specificProduct)
      .catch((e) => { bridgeLog(`reader: the read FAILED for ${room.slice(0, 8)}: ${String(e).slice(0, 90)}`); return null; });
    const cur = reads.get(room);
    if (cur && v) {
      cur.verdict = v; cur.readAtMs = Date.now();
      // THE SIGNOFF (owner 08-04): the moment a check has its answer, Charlie is told to thank them
      // and end. A definitive read is the moment; an unsure one is not an answer and nudges nothing.
      bridgeLog(`reader: read landed for ${room.slice(0, 8)}: ${v.inStock} (confidence ${v.confidence})`);
      // …AND SURE OF ITSELF. The reader answers with how sure it is, and a zero means it had nothing
      // to go on. On check 354 the one word "Pokemon?" came back "not in stock" at confidence zero,
      // which told Charlie at 14 seconds that the answer was in hand and to wrap up while Staff had
      // not even gone to look yet. A read the reader itself is not sure about is not an answer.
      // WHAT THE CHECK ALREADY HOLDS rides with the knock (owner, 08-17 late): the reader has just
      // pulled the set, the packaging and the restock day and time out of the record, so Charlie can
      // be told to ask only for what is genuinely still missing, and never for what Staff just said.
      if ((v.inStock === "yes" || v.inStock === "no") && v.confidence > 0) {
        nudgeSignoff(room, v.inStock === "yes" ? "in stock" : "not in stock",
          { set: v.set, productForm: v.productForm, restockDay: v.restockDay, restockTime: v.restockTime });
      }
      else if (v.inStock === "yes" || v.inStock === "no") bridgeLog(`reader: ${v.inStock} at confidence zero is not an answer, Charlie is not told to wrap up`);
    } else if (cur && !v) {
      bridgeLog(`reader: no verdict for ${room.slice(0, 8)}${cur.retried ? " (second try spent)" : ", one second try in 4s"}`);
    }
    if (cur && !v && !cur.retried) {
      // The reader's model can fail mid check (a rate limit on check 276 among others) and Staff may
      // never say another line, so a failed read used to mean no read at all — and no signoff, so
      // Charlie never said goodbye. ONE second try a few seconds later, never a loop: if it fails
      // twice the finalize's own read still owns the verdict, only the goodbye moment is lost.
      cur.retried = true;
      setTimeout(() => { const c2 = reads.get(room); if (c2 && !c2.verdict) void runRead(room); }, 4000);
    }
  } finally {
    const cur = reads.get(room);
    if (cur) {
      cur.running = false;
      // Staff said something else while we were reading — read again so the last word wins.
      if (cur.dirty) { cur.dirty = false; void runRead(room); }
    }
  }
}

function transcriptSoFar(r: LiveRead): string {
  return r.lines.map((l) => `${l.who}: ${l.text}`).join("\n");
}

/**
 * The read for this room, if one finished. `null` means read it the old way (nothing was armed, the
 * check was too short to read, or the process restarted mid-check) — every caller must still work
 * without this.
 */
export function liveReadFor(room: string | null | undefined): ClerkVerdict | null {
  if (!room) return null;
  return reads.get(room)?.verdict ?? null;
}

/** How many lines the newest read covered, for the call log. */
export function liveReadDepth(room: string | null | undefined): number {
  if (!room) return 0;
  return room && reads.get(room)?.readAtMs ? reads.get(room)!.lines.length : 0;
}

/** The check is over and its verdict is written. Drop the room so memory can't creep. */
export function dropLiveRead(room: string | null | undefined): void {
  if (room) reads.delete(room);
}

/** Rooms currently held, for a health check. */
export function liveReadCount(): number { return reads.size; }
