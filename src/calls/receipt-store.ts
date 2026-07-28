// Where the receipt lands. This is the ONLY file in the receipt chain that touches the database —
// events.ts stays pure so the bridge and the navigator can record without importing db, and so every
// timing rule is unit-testable without booting the app.
//
// Registered as the sink at boot (server.ts). Two jobs, both best-effort — a failure here must never
// affect a live call or a verdict:
//   1. Write the timeline to call_events.
//   2. Roll it up (seconds + cost) onto the call_results row so reports never replay the timeline.
//
// Finding the row: the receipt opens at DIAL, before any row exists, so it is keyed by `room`. By the
// time it closes the row does exist, and it can be found three ways — the `room` column, the
// placeholder provider id we stamp at dial (`bridge:<room>`), or the real conversation id the voice
// provider handed us mid-call. Belt and braces, because a receipt that cannot find its call is a
// receipt nobody will ever read.
import { eq, or, and, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { callEvents, callResults } from "../db/schema";
import { rollup, setEventSink, type Receipt } from "./events";
import { costCall, MEASURED_RATES, type Rates } from "./cost";
import { getSetting } from "../db/settings";

/** Rates in force right now. Admin can correct any of them without a deploy (setting `call_rates`,
 *  a JSON object of overrides) — a re-measure should never need an engineer. */
export async function currentRates(): Promise<Rates> {
  try {
    const raw = await getSetting("call_rates");
    if (!raw) return MEASURED_RATES;
    const over = JSON.parse(raw) as Partial<Rates>;
    const out = { ...MEASURED_RATES };
    for (const k of Object.keys(MEASURED_RATES) as Array<keyof Rates>) {
      const v = over[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    }
    return out;
  } catch { return MEASURED_RATES; }
}

/** Find the call_results row this receipt belongs to. Null when the call never got a row (a bench
 *  call, or a dial the carrier refused) — the timeline is still written, just unattached. */
async function findCallId(r: Receipt): Promise<number | null> {
  if (r.callId) return r.callId;
  const ids = [`bridge:${r.room}`, r.providerCallId].filter(Boolean) as string[];
  try {
    const rows = await db.select({ id: callResults.id }).from(callResults).where(
      ids.length ? or(eq(callResults.room, r.room), inArray(callResults.providerCallId, ids)) : eq(callResults.room, r.room),
    ).limit(1);
    return rows[0]?.id ?? null;
  } catch { return null; }
}

/** Persist one finished receipt. Never throws. */
export async function persistReceipt(r: Receipt): Promise<void> {
  try {
    const callId = await findCallId(r);
    if (r.events.length) {
      await db.insert(callEvents).values(r.events.map((e) => ({
        callId, room: r.room, atMs: e.atMs, atSec: e.atSec, kind: e.kind,
        note: e.note ?? null, detail: e.detail ? JSON.stringify(e.detail).slice(0, 4000) : null,
      })));
    }
    const sums = rollup(r);
    const rates = await currentRates();
    // An ADMIN call (mapping, a rehearsal, the store button) deliberately has no call_results row —
    // it is not a customer's check and must never land in the customer numbers. It still needs its
    // seconds and its cost, and there is no row to roll them onto, so they ride the LAST event's
    // detail. NOT a seventeenth event kind: the dashboard is built against the closed sixteen, so a
    // new kind would silently fall off the screen (`docs/specs/call-receipt/README.md`).
    if (callId == null) {
      const last = r.events[r.events.length - 1];
      if (!last) return;
      const c0 = costCall({
        callSecs: sums.callSecs, charlieSecs: sums.charlieConnectedSeconds,
        avoidableSecs: sums.charlieSilentSeconds,
        forkSecs: [sums.callSecs, Math.max(0, sums.callSecs - (sums.menuSeconds ?? 0))],
      }, rates);
      await db.update(callEvents)
        .set({ detail: JSON.stringify({ ...(last.detail ?? {}), seconds: sums, cost: c0 }).slice(0, 4000) })
        .where(and(eq(callEvents.room, r.room), eq(callEvents.atMs, last.atMs), eq(callEvents.kind, last.kind)));
      return;
    }
    // Both audio forks are billed: the live-listen fork runs the whole call, and the bridge stream
    // runs from the hand-off to the end. Counting only one of them was undercounting every call.
    const cost = costCall({
      callSecs: sums.callSecs,
      charlieSecs: sums.charlieConnectedSeconds,
      avoidableSecs: sums.charlieSilentSeconds,
      forkSecs: [sums.callSecs, Math.max(0, sums.callSecs - (sums.menuSeconds ?? 0))],
    }, rates);

    await db.update(callResults).set({
      room: r.room,
      lane: sums.lane,
      // navSeconds = dial -> a person is on the line. Only overwrite when the receipt actually
      // measured it; the provider's own figure stays if we never heard a human.
      ...(sums.navSeconds !== null ? { navSeconds: sums.navSeconds } : {}),
      talkSeconds: sums.talkSeconds,
      charlieConnectedSeconds: sums.charlieConnectedSeconds,
      charlieTalkingSeconds: sums.charlieTalkingSeconds,
      charlieSpeakingSeconds: sums.speakingSecs,
      charlieListeningSeconds: sums.listeningSecs,
      charlieSilentSeconds: sums.charlieSilentSeconds,
      ringSeconds: sums.ringSeconds,
      holdSeconds: sums.holdSeconds,
      billedMinutes: sums.billedMinutes,
      menuSeconds: sums.menuSeconds,
      // Which build served this call, so a regression is findable without guessing.
      engineVersion: (process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 12) || null,
      costLineUsd: cost.lineUsd,
      costForkUsd: cost.forkUsd,
      costCharlieUsd: cost.charlieUsd,
      costClipsUsd: cost.clipsUsd,
      costTotalUsd: cost.totalUsd,
      costAvoidableUsd: cost.avoidableUsd,
    }).where(eq(callResults.id, callId));
  } catch (e) {
    console.error("[receipt] persist failed:", e);
  }
}

/**
 * The verdict, written straight onto the timeline. This one event cannot go through the in-memory
 * receipt: the answer is extracted from the transcript AFTER the line has already dropped, so by the
 * time we know what the clerk said the receipt is closed and flushed. It is appended directly, at
 * the second the call ended, so a replay finishes with the answer the customer got. Never throws.
 */
export async function recordVerdict(callId: number, statusKey: string | null, summary: string | null, atSec: number): Promise<void> {
  try {
    const room = (await db.select({ room: callResults.room }).from(callResults).where(eq(callResults.id, callId)))[0]?.room;
    await db.insert(callEvents).values({
      callId, room: room ?? "", atMs: Math.max(0, atSec) * 1000, atSec: Math.max(0, atSec),
      kind: "verdict",
      note: summary?.slice(0, 300) || `Answer: ${statusKey ?? "unclear"}`,
      detail: JSON.stringify({ statusKey }),
    });
  } catch (e) { console.error("[receipt] verdict not recorded:", e); }
}

/** Wire the recorder to the database. Called once at boot. */
export function installReceiptStore(): void {
  setEventSink((r) => { void persistReceipt(r); });
}
