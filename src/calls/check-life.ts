// THE GATEKEEPER — the one owner of every question about a check's life.
//
// WHY (owner + the check-life audit, 08-01): 84 code sites could touch a live check's life and 20 of
// them decided for themselves — 8 still asked the voice provider whether a check was alive, and every
// guard that answered correctly lived in ONE process's memory with a timer on it. Charlie is closed on
// every hold (the only thing that stops his meter), which ends his conversation at the provider, so
// "ask the provider" reads a held check as a finished one. Five of the owner's live test calls died to
// doors of that one fault, each fixed one door at a time. This file is the last door: every question
// below is answered ONLY from our own record and the carrier, with the state kept in the DATABASE so
// a restart or an expired in-memory map can never flip the answer back to the provider's.
//
// THE QUESTIONS THIS FILE OWNS (nobody else may decide them):
//   isCheckAlive(id)    — is the phone still in somebody's hand? The carrier's line-end is the ONLY end.
//                         Every finalize asks THIS and negates it; there is deliberately no second
//                         wrapper saying the same thing in other words, because two names for one
//                         rule is how a rule drifts.
//   resolveRoom(id)     — which check does this name (room, bridge:<room>, delta:<id>, or the
//                         provider's conversation id) belong to?
//
// "May Charlie open now?" — the fourth question — is enforced INSIDE the bridge at its one door
// (connectEleven), because it must be answered synchronously on the call path where the live hold
// state is. The rule is the same one, written there: no timer may open Charlie once a real person
// was found; only somebody coming back reopens him. This file is the authority for every question
// asked from OUTSIDE the call (the customer's page, the webhook, the poller, Admin).
//
// HOW STATE GETS HERE: events.ts (pure, sink-registered like everything else in the receipt chain)
// exposes setLifeHook; installCheckLife registers a mirror that copies the life-relevant moments of
// every receipt into the check_life table as they happen.
//
// The carrier's own status callback (/twiml/bridge-status) stamps the line end directly — it is the
// truthful end even after a restart, when no in-memory receipt exists to close.
//
// WHERE IT IS THIN, SAID PLAINLY (round 2, item 6): the recorded-clips lane barely writes here. It
// opens and closes its own record and owns its own finalize, so almost none of the moments above
// ever fire for it, and a question asked about one of those checks falls through to the in-memory
// answer or to "not alive". That is the behaviour that lane had before any of this was built, so it
// is safe rather than wrong. Written down because the paragraph above would otherwise read as full
// cover, and a comment claiming cover it does not have is how the next reader gets caught.
import { eq, lt, or } from "drizzle-orm";
import { db } from "../db/client";
import { checkLife, callResults } from "../db/schema";
import { getReceipt, setLifeHook } from "./events";
import { bridgeRoomForConversation } from "../voice/bridge";

/** No check lives longer than the carrier's own time limit (300s staging) plus generous slack. Past
 *  this, a row with no recorded line-end means the carrier's callback was lost (a restart mid-call),
 *  not that a call is still running — so the answer fails toward "finished", never toward a check
 *  that can never finalize. This is a backstop against a LOST callback, not a timer on a live call. */
export const LIFE_HARD_CAP_SECS = 30 * 60;

/**
 * …AND IT HAS TO STAY FAR PAST THE LONGEST CHECK THE CARRIER WILL ALLOW (round 2, item 6). Both this
 * and the bridge's own thirty-minute memory are constants, while the cap they have to clear lives in
 * Admin and can be raised without a deploy. At today's values there is a tenfold margin, so nothing
 * is wrong — but a raised setting would silently walk a live check past a backstop that then reports
 * it as finished, which is the entire class of fault the gatekeeper exists to end. Called wherever a
 * check is placed; it complains loudly and never blocks a check, because a noisy log is the right
 * price and a refused check is not. Returns nothing on purpose: a boolean here was read as "is this
 * fine?" by its name and answered the opposite, and nobody was reading it anyway.
 */
export function warnIfCapTooLow(maxCallSeconds: number | null | undefined): void {
  const cap = Number(maxCallSeconds) || 0;
  if (cap > 0 && cap * 2 > LIFE_HARD_CAP_SECS) {
    console.error(`[check-life] THE LONGEST ALLOWED CHECK (${cap}s) IS NOW CLOSE TO THE ${LIFE_HARD_CAP_SECS}s BACKSTOP. `
      + "Raise LIFE_HARD_CAP_SECS in src/calls/check-life.ts AND the context expiry in src/voice/bridge.ts, "
      + "or a long check will be reported as finished while it is still on the phone.");
  }
}

/** Rows older than this are pruned — the table holds live checks, not history (call_events is history). */
const LIFE_KEEP_SECS = 24 * 3600;

export interface LifeRow {
  dialedAt: number;
  lineEndedAt: number | null;
}

/** The one aliveness rule, pure so the rig can prove it without a database: alive = the carrier has
 *  not said the line ended, and the check is young enough that the callback cannot have been lost. */
export function aliveFromRow(row: LifeRow | null | undefined, nowSec: number): boolean {
  if (!row) return false;
  if (row.lineEndedAt != null) return false;
  return nowSec - row.dialedAt < LIFE_HARD_CAP_SECS;
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** Which check a name belongs to. Accepts a room, "bridge:<room>", a delta room ("delta:<id>" IS its
 *  room), or the provider's conversation id — resolved through memory first, then the database, so
 *  the answer survives a restart and the 10-minute life of the in-memory map. */
export async function resolveRoom(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  if (id.startsWith("bridge:")) return id.slice(7);
  // A CHECK WE ARE HOLDING RIGHT NOW IS A CHECK, WHATEVER THE DATABASE SAYS. Every lookup below can
  // throw — an unreachable database, a table not there yet — and every one of those throws is caught
  // and ends with "we do not know this name", which the caller reads as "not alive" and takes as
  // permission to stamp a verdict on a check that is still on the phone. The one answer that needs
  // no database at all is the one in front of us, so it is asked first and the risky lookups only
  // ever run for a check this process is not holding.
  if (getReceipt(id)) return id;
  // A delta room and a plain bridge room are already room names — a row under that key settles it.
  try {
    const direct = await db.select({ room: checkLife.room }).from(checkLife).where(eq(checkLife.room, id)).limit(1);
    if (direct[0]) return direct[0].room;
  } catch { /* fall through */ }
  // The provider's conversation id: the live map knows it while this process held the call…
  const mem = bridgeRoomForConversation(id);
  if (mem) return mem;
  // …and the database knows it after a restart: the id was mirrored at link time, and the call row
  // carries it too once the connect update landed.
  try {
    const byLink = await db.select({ room: checkLife.room }).from(checkLife).where(eq(checkLife.providerCallId, id)).limit(1);
    if (byLink[0]) return byLink[0].room;
    const byRow = await db.select({ room: callResults.room }).from(callResults).where(eq(callResults.providerCallId, id)).limit(1);
    if (byRow[0]?.room) return byRow[0].room;
  } catch { /* no database answer */ }
  return null;
}

/**
 * IS THE PHONE STILL IN SOMEBODY'S HAND? The in-memory receipt is freshest and wins while it exists;
 * the database answers when memory is gone (a restart, an expired receipt, a check reopened from
 * history). A name nobody recognizes is not a live call.
 */
export async function isCheckAlive(id: string | null | undefined): Promise<boolean> {
  const room = await resolveRoom(id);
  if (!room) return false;
  // THE OLD DIRECT PATH IS THE PROVIDER'S OWN LINE. On `direct:` checks the provider dials the store
  // itself: no media reaches us, no status callback of ours fires, and Charlie is never dropped for a
  // hold there — so the provider's "conversation over" genuinely IS the line ending on that lane, and
  // WE have no witness of our own. Its thin receipt stays open until a finalize closes it, which made
  // the aliveness guards read every old-path check as forever-live: the webhook and the poller were
  // silently frozen for the receipt's whole 15 minutes, and only the page's unguarded finalize door —
  // the exact door the 08-01 audit orders shut — kept prod checks settling. Found while closing it.
  if (room.startsWith("direct:")) return false;
  const held = getReceipt(room);
  if (held) return !held.closed;
  try {
    const rows = await db.select({ dialedAt: checkLife.dialedAt, lineEndedAt: checkLife.lineEndedAt })
      .from(checkLife).where(eq(checkLife.room, room)).limit(1);
    return aliveFromRow(rows[0], nowSec());
  } catch { return false; }
}


// ---- the writers ----------------------------------------------------------------------------

async function upsert(room: string, patch: Partial<{ callId: number | null; providerCallId: string | null; answeredAt: number; humanAt: number; onHold: number; charlieOpen: number; segments: number; lineEndedAt: number; endReason: string }>): Promise<void> {
  const t = nowSec();
  try {
    const existing = await db.select({ room: checkLife.room }).from(checkLife).where(eq(checkLife.room, room)).limit(1);
    if (existing[0]) await db.update(checkLife).set({ ...patch, updatedAt: t }).where(eq(checkLife.room, room));
    else await db.insert(checkLife).values({ room, dialedAt: t, updatedAt: t, ...patch });
  } catch (e) { console.error("[check-life] write failed:", String(e).slice(0, 160)); }
}

/** The carrier said the line ended. Called by the status callback DIRECTLY — the one writer that
 *  must work even when no in-memory receipt survived to close (a restart mid-call). */
export function noteLineEnded(room: string, reason: string): void {
  void upsert(room, { lineEndedAt: nowSec(), endReason: reason.slice(0, 40) });
}

/** Wire the mirror. Called once at boot, beside installReceiptStore. Every write is fire-and-forget
 *  and wrapped — recording a check's life must never touch the call carrying it. */
export function installCheckLife(): void {
  setLifeHook((room, kind, detail) => {
    try {
      switch (kind) {
        case "dialed": void upsert(room, {}); break;
        case "connected": void upsert(room, { answeredAt: nowSec() }); break;
        case "human_detected": void upsert(room, { humanAt: nowSec() }); break;
        case "hold_start": void upsert(room, { onHold: 1 }); break;
        case "hold_end": void upsert(room, { onHold: 0 }); break;
        case "charlie_join": void upsert(room, { charlieOpen: 1, segments: Number(detail?.segment ?? 1) || 1 }); break;
        case "charlie_leave": void upsert(room, { charlieOpen: 0 }); break;
        // The receipt closing carries the carrier's reason when the status callback closed it; a
        // hangup emitted mid-call (voicemail, give-up) also ends the line — the socket is torn down.
        case "hangup": { const reason = String(detail?.reason ?? "").slice(0, 40); void upsert(room, { lineEndedAt: nowSec(), ...(reason ? { endReason: reason } : {}) }); break; }
        case "provider_linked": if (detail?.providerCallId) void upsert(room, { providerCallId: String(detail.providerCallId) }); break;
        case "call_linked": if (detail?.callId != null) void upsert(room, { callId: Number(detail.callId) || null }); break;
      }
    } catch { /* never on the call path */ }
  });
  // The table holds live checks, not history. Prune on boot, quietly.
  void db.delete(checkLife).where(or(lt(checkLife.dialedAt, nowSec() - LIFE_KEEP_SECS), lt(checkLife.updatedAt, nowSec() - LIFE_KEEP_SECS)))
    .catch(() => { /* pruning is hygiene, never required */ });
}
