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
import { rollup, transcriptOf, setEventSink, type Receipt } from "./events";
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
    // THE CONVERSATION KEEPS ITS CLOCK (owner 08-05, fix 1 on the Testing sheet). The spoken lines
    // live on the receipt with real times, but the only thing that survived the call was the flat
    // transcript text — so a finished check's sheet could only print the conversation at the end of
    // the log instead of in line where each thing was said. The timed lines ride the LAST event's
    // detail, the same place an unattached call's seconds and cost already ride (and deliberately
    // NOT a seventeenth event kind — the closed sixteen is law). Capped hard, because detail is
    // truncated at 4000 characters and a torn JSON reads as no detail at all.
    if (r.events.length && r.transcript.length) {
      const last = r.events[r.events.length - 1];
      last.detail = { ...(last.detail ?? {}),
        lines: r.transcript.slice(0, 16).map((l) => ({ who: l.who, text: l.text.slice(0, 100), atSec: Math.round(l.atMs / 1000) })) };
    }
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
      // WHICH saved menu version walked this call, and which check it retries. Both columns have
      // existed since the receipt shipped and both sat empty; a map that misbehaved on a paying
      // customer was untraceable to the version somebody approved. Only written when we actually
      // know — never a 0 or an empty string standing in for "we never checked".
      ...(r.mapVersion != null ? { mapVersion: String(r.mapVersion) } : {}),
      ...(r.attemptOf != null ? { attemptOf: r.attemptOf } : {}),
      // Which brain answered (null when he never joined — never a stand-in for "we didn't look"),
      // what the walk to a person achieved, and how many stretches he was open for.
      // WHAT WE HEARD, as the record (hard rule 2). Only written when we actually captured lines —
      // a call the provider transcribed and we did not must keep the provider's copy rather than be
      // blanked by ours. Text only; no audio reaches disk on any path.
      ...(r.transcript.length ? { transcript: transcriptOf(r) } : {}),
      brain: sums.brain,
      navOutcome: sums.navOutcome,
      charlieSegments: sums.charlieSegments || null,
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
/** The last thing Staff actually said with real words in it — the line the status was decided by,
 *  quoted on the verdict step. ONE copy, used by every door that settles a verdict. */
export function lastClerkLine(transcript: string | null | undefined): string | null {
  return [...String(transcript || "").split("\n")]
    .reverse().map((l) => /^(?:Clerk|Staff):\s*(.*)$/i.exec(l.trim())?.[1] || "")
    .find((t) => /[a-zA-ZÀ-ɏ]{2,}/.test(t)) || null;
}

export async function recordVerdict(
  callId: number, statusKey: string | null, summary: string | null, atSec: number,
  // WHAT THE TESTING SCREEN READS AND NOTHING WROTE (owner 08-04): the second read as its own step
  // before the status, with the model that read it and what it cost; whose words decided the
  // status; and charged or not charged as the LAST step of the check. All optional, so every older
  // caller keeps writing exactly the verdict it always wrote.
  extra?: { secondReadModel?: string | null; secondReadUsd?: number; decidedBy?: string | null; charged?: boolean | null },
): Promise<void> {
  try {
    // THREE DOORS CAN SETTLE ONE CHECK and they race (the sweep, the on-demand settle, the webhook).
    // Whichever wins writes the tail; the others find it written and leave the record alone, so a
    // check can never end twice.
    const already = await db.select({ id: callEvents.id }).from(callEvents)
      .where(and(eq(callEvents.callId, callId), eq(callEvents.kind, "verdict"))).limit(1);
    if (already.length) return;
    const room = (await db.select({ room: callResults.room }).from(callResults).where(eq(callResults.id, callId)))[0]?.room;
    const at = Math.max(0, atSec);
    const rowFor = (kind: string, note: string, detail: Record<string, unknown>, order: number) => ({
      // The same final second, a breath of milliseconds apart, so the three read in this order and
      // never shuffle under an ORDER BY on the clock.
      callId, room: room ?? "", atMs: at * 1000 + order, atSec: at, kind, note: note.slice(0, 300), detail: JSON.stringify(detail),
    });
    const rows = [];
    if (extra?.secondReadModel) rows.push(rowFor("unknown", "The answer was double checked", { step: "second_read", model: extra.secondReadModel, costUsd: extra.secondReadUsd ?? 0 }, 0));
    rows.push(rowFor("verdict", summary?.slice(0, 300) || `Answer: ${statusKey ?? "unclear"}`, { statusKey, ...(extra?.decidedBy ? { decidedBy: String(extra.decidedBy).slice(0, 200) } : {}) }, 1));
    if (extra?.charged != null) rows.push(rowFor("unknown", extra.charged ? "Customer charged" : "Customer not charged", { step: "charged", charged: extra.charged }, 2));
    await db.insert(callEvents).values(rows);
    console.log(`[receipt] verdict tail written for check ${callId}: ${rows.length} row(s)`);
  } catch (e) {
    console.error("[receipt] verdict not recorded:", e);
    // The verdict is the one row the customer's answer lives on. If the batch failed, write it
    // alone the way this function always used to, so a decoration can never cost the answer.
    try {
      await db.insert(callEvents).values({ callId, room: "", atMs: Math.max(0, atSec) * 1000, atSec: Math.max(0, atSec), kind: "verdict", note: (summary?.slice(0, 300) || `Answer: ${statusKey ?? "unclear"}`), detail: JSON.stringify({ statusKey }) });
    } catch (e2) { console.error("[receipt] even the bare verdict failed:", e2); }
  }
}

/** Wire the recorder to the database. Called once at boot. */
/** Anyone who wants to READ a finished call — the map learns from ordinary checks this way, without
 *  opening a listener of its own. Watchers never block the receipt and can never break it. */
type Watcher = (r: Receipt) => void | Promise<void>;
const watchers: Watcher[] = [];
export function onReceiptClosed(fn: Watcher): void { watchers.push(fn); }

export function installReceiptStore(): void {
  setEventSink((r) => {
    void persistReceipt(r);
    for (const w of watchers) {
      try { void Promise.resolve(w(r)).catch((e) => console.error("receipt watcher:", String(e).slice(0, 160))); }
      catch (e) { console.error("receipt watcher:", String(e).slice(0, 160)); }
    }
  });
}
