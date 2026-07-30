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

interface LiveRead {
  category: string;
  specificProduct?: string;
  lines: { who: "Agent" | "Clerk"; text: string }[];
  asked: boolean;          // Charlie has put the stock question — before that there is nothing to read
  running: boolean;        // one read in flight at a time; a newer line re-runs when it lands
  dirty: boolean;          // a line arrived while a read was running → read again when it finishes
  verdict: ClerkVerdict | null;
  readAtMs: number;        // when the newest read finished (0 = none yet)
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
  reads.set(room, { category, specificProduct, lines: [], asked: false, running: false, dirty: false, verdict: null, readAtMs: 0 });
}

/** Every line, both sides, as it is spoken. Wired into calls/events.ts recordLine. */
export function noteLiveLine(room: string, who: "Agent" | "Clerk", text: string): void {
  const r = reads.get(room);
  if (!r) return;
  const t = String(text || "").trim();
  if (!t) return;
  r.lines.push({ who, text: t.slice(0, 1000) });
  if (r.lines.length > 300) r.lines.splice(0, r.lines.length - 300);
  if (who === "Agent") { if (ASKED_RE.test(t)) r.asked = true; return; }
  // Staff just said something. Read the conversation so far.
  if (!r.asked || !HAS_WORDS.test(t)) return;
  if (r.running) { r.dirty = true; return; }
  void runRead(room);
}

async function runRead(room: string): Promise<void> {
  const r = reads.get(room);
  if (!r || r.running) return;
  r.running = true;
  try {
    const v = await classifyVerdict(transcriptSoFar(r), r.category, r.specificProduct).catch(() => null);
    const cur = reads.get(room);
    if (cur && v) { cur.verdict = v; cur.readAtMs = Date.now(); }
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
