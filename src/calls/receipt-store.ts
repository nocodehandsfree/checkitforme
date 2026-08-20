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
import { eq, or, and, inArray, sql } from "drizzle-orm";
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
/** THE TWO CHARGES THAT ARE BILLED BY THE PIECE, NOT BY THE SECOND (owner's order, 08-20, fix 3).
 *  ElevenLabs charges per character to say his words and Anthropic charges per token to write them.
 *  Both were spent on every check our own brain ran and neither was ever counted, which is why the
 *  sheet printed 0.0¢ for Charlie on check 427. The counts are measured live on the call; the model
 *  that wrote the words is read off the check's own `brain_reply` rows, so a check is priced by the
 *  brain that really answered it. */
function brainAndSpeech(r: Receipt, sums: ReturnType<typeof rollup>): { ttsChars: number; brainInTokens: number; brainOutTokens: number; brainModel: string | null } {
  let brainModel: string | null = null;
  for (const e of r.events) {
    const d = (e.detail || {}) as { step?: string; model?: string };
    if (d.step === "brain_reply" && d.model) brainModel = d.model;
  }
  return {
    ttsChars: sums.spokenChars,
    brainInTokens: sums.brainInTokens,
    brainOutTokens: sums.brainOutTokens,
    brainModel,
  };
}

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
    // ONE CLOCK, IN MILLISECONDS (owner 08-06, fix 1 on the Testing sheet). The steps keep their real
    // milliseconds; the spoken lines were rounded to whole seconds right here, so the sheet had two
    // rounded lists and could only splice them by comparing seconds — which is how three rows six
    // seconds apart all drew at 58s and Delta's recording drew after the Staff line answering it.
    // `atMs` is the same call clock the steps are stamped on (events.ts: Date.now() - startMs), so
    // order comes off ONE list. `atSec` stays beside it for every older reader.
    if (r.events.length && r.transcript.length) {
      const last = r.events[r.events.length - 1];
      last.detail = { ...(last.detail ?? {}),
        lines: r.transcript.slice(0, 16).map((l) => ({ who: l.who, text: l.text.slice(0, 100), atSec: Math.round(l.atMs / 1000), atMs: l.atMs, endMs: l.endMs })) };
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
        callSecs: sums.callSecs, charlieSecs: sums.charliePaidSeconds,
        avoidableSecs: sums.charlieSilentSeconds,
        forkSecs: [sums.callSecs, Math.max(0, sums.callSecs - (sums.menuSeconds ?? 0))],
        ...brainAndSpeech(r, sums),
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
      charlieSecs: sums.charliePaidSeconds,
      avoidableSecs: sums.charlieSilentSeconds,
      forkSecs: [sums.callSecs, Math.max(0, sums.callSecs - (sums.menuSeconds ?? 0))],
      ...brainAndSpeech(r, sums),
    }, rates);

    await db.update(callResults).set({
      room: r.room,
      lane: sums.lane,
      // The WHOLE conversation with its clock, uncapped in count (300-char lines, 200 lines is far
      // past any real call): the record holds everything, especially the unexpected (owner 08-05).
      // The 16-line copy on the last event stays for UNATTACHED calls, which have no row to carry it.
      // `atMs` is the line's real place on the call's own clock, the same clock every step is
      // stamped on, so the sheet can order steps and spoken lines as ONE list (owner 08-06).
      ...(r.transcript.length ? { transcriptTimed: JSON.stringify(r.transcript.slice(0, 200).map((l) => ({ who: l.who, text: l.text.slice(0, 300), atSec: Math.round(l.atMs / 1000), atMs: l.atMs, endMs: l.endMs }))) } : {}),
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
      awakeOnHoldSeconds: sums.awakeOnHoldSeconds,
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
      costBrainUsd: cost.brainUsd,
      costSttUsd: cost.sttUsd,
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
/**
 * A CHECK OUR OWN BRAIN RAN, READ BACK AFTER THE PROCESS THAT RAN IT IS GONE (owner's order, 08-20).
 *
 * On the hosted lane a settling door asks the voice provider what happened, and their answer outlives
 * our restarts. On our own lane there is no conversation of theirs to ask about, so the door reads
 * OUR record — and it only ever read the in-memory one. A deploy, a crash or simply an hour passing
 * empties that, and from then on the check answered "still in progress" for ever: that is what left
 * checks 425 and 426 unsettled on the Testing list with their whole conversations written down.
 *
 * The database's answer outlives the process, which is the rule this door already states out loud a
 * few lines further down. So this is the same record, read from where it is kept. NULL when there is
 * genuinely no row, and never a verdict of its own: the same reader that decides every other check
 * decides this one from the words.
 */
export async function finishedRecordFromDb(room: string): Promise<
  { callId: number; transcript: string; durationSecs: number; navSecs: number | null; over: boolean } | null> {
  try {
    const row = (await db.select({
      id: callResults.id, transcript: callResults.transcript, callSeconds: callResults.callSeconds,
      navSeconds: callResults.navSeconds, status: callResults.status,
    }).from(callResults).where(eq(callResults.room, room)).limit(1))[0];
    if (!row) return null;
    // OVER MEANS THE RECORD SAYS THE PHONE WENT DOWN, never a clock and never a guess: the check's
    // own timeline ends with the hang-up row every finished check writes.
    const ended = await db.select({ id: callEvents.id }).from(callEvents)
      .where(and(eq(callEvents.room, room), eq(callEvents.kind, "hangup"))).limit(1);
    return {
      callId: row.id,
      transcript: row.transcript ?? "",
      durationSecs: row.callSeconds ?? 0,
      navSecs: row.navSeconds ?? null,
      over: ended.length > 0,
    };
  } catch { return null; }
}

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
    // THE TAIL IS STAMPED AT ITS TRUE PLACE: AFTER EVERYTHING ELSE (owner 08-05). Callers pass the
    // provider's session length as atSec, and Charlie's session is SHORTER than the phone call, so
    // the double check, the verdict and the charge were drawn MID call, before the goodbye and the
    // hang up they actually follow. The settle only ever runs once the check is over, so the tail
    // clamps to the last second already on the record and can never draw before its causes.
    const lastRow = (await db.select({ m: sql<number>`max(${callEvents.atMs})` })
      .from(callEvents).where(eq(callEvents.callId, callId)))[0];
    // Clamped in MILLISECONDS: clamping to the same second still let the tail sort before the
    // "Check ended" row that shares it (check 295). Strictly after everything, always.
    const baseMs = Math.max(0, atSec * 1000, Number(lastRow?.m ?? 0) + 1);
    const at = Math.round(baseMs / 1000);
    const rowFor = (kind: string, note: string, detail: Record<string, unknown>, order: number) => ({
      // The same final second, a breath of milliseconds apart, so the three read in this order and
      // never shuffle under an ORDER BY on the clock.
      callId, room: room ?? "", atMs: baseMs + order, atSec: at, kind, note: note.slice(0, 300), detail: JSON.stringify(detail),
    });
    // CHARGED IS A FACT, NOT A FORECAST (owner 08-06). Callers hand us what they decided to bill;
    // the check's own row carries whether the charge was really stamped, and that is what the step
    // says. A caller that decided nothing still writes no charge step at all.
    let charged = extra?.charged ?? null;
    if (charged != null) {
      try {
        const paid = (await db.select({ at: callResults.chargedAt }).from(callResults).where(eq(callResults.id, callId)))[0];
        charged = paid?.at != null;
      } catch { /* the row would not answer: keep what the door decided */ }
    }
    const rows = [];
    if (extra?.secondReadModel) rows.push(rowFor("unknown", "The answer was double checked", { step: "second_read", model: extra.secondReadModel, costUsd: extra.secondReadUsd ?? 0 }, 0));
    rows.push(rowFor("verdict", summary?.slice(0, 300) || `Answer: ${statusKey ?? "unclear"}`, { statusKey, ...(extra?.decidedBy ? { decidedBy: String(extra.decidedBy).slice(0, 200) } : {}) }, 1));
    if (charged != null) rows.push(rowFor("unknown", charged ? "Customer charged" : "Customer not charged", { step: "charged", charged }, 2));
    await db.insert(callEvents).values(rows);
    console.log(`[receipt] verdict tail written for check ${callId}: ${rows.length} row(s)`);
    // WAS ANY OF THAT A RECORDING? (owner's box, 08-18 night, item 7.) Asked here because this is
    // the one place a check settles exactly once, whichever of the three doors won the race. It
    // runs AFTER the tail is written and nothing waits on it: a check's answer, its charge and the
    // customer's screen are all already done by the time this asks. A wrong answer costs one line
    // on the record and nothing else, and it can never stop a live call — his rule.
    void judgeTheVoices(callId, room ?? "", baseMs + 3, at);
  } catch (e) {
    console.error("[receipt] verdict not recorded:", e);
    // The verdict is the one row the customer's answer lives on. If the batch failed, write it
    // alone the way this function always used to, so a decoration can never cost the answer.
    try {
      await db.insert(callEvents).values({ callId, room: "", atMs: Math.max(0, atSec) * 1000, atSec: Math.max(0, atSec), kind: "verdict", note: (summary?.slice(0, 300) || `Answer: ${statusKey ?? "unclear"}`), detail: JSON.stringify({ statusKey }) });
    } catch (e2) { console.error("[receipt] even the bare verdict failed:", e2); }
  }
}

/**
 * WHO REALLY SAID EACH LINE, decided after the check is over and written onto its record.
 *
 * THE FAULT IT ANSWERS (check 383, the advert mixed into hold music): a recorded voice is the one
 * thing on a phone line that no listening rule can refuse, because it IS a voice. Only the words
 * say it, and only a model reads words in any language — which is the same reason this is the
 * honest answer to a wait announced in Spanish (check 376). Best effort, always: no key, a refused
 * model or a slow one simply leaves this line off the record.
 */
async function judgeTheVoices(callId: number, room: string, atMs: number, atSec: number): Promise<void> {
  try {
    const row = (await db.select({ t: callResults.transcript }).from(callResults).where(eq(callResults.id, callId)))[0];
    const lines = String(row?.t || "").split("\n").map((l) => {
      const m = /^(Clerk|Staff|Agent):\s*(.*)$/i.exec(l.trim());
      return m ? { who: /agent/i.test(m[1]) ? "Agent" : "Clerk", text: m[2] } : null;
    }).filter((l): l is { who: string; text: string } => !!l && l.text.length > 2);
    if (lines.filter((l) => l.who === "Clerk").length < 2) return;   // nothing worth a read
    const { judgeHoldVoice } = await import("../voice/verdict");
    const read = await judgeHoldVoice(lines);
    if (!read) return;
    const played = read.filter((r) => r.voice === "recording");
    if (!played.length) return;   // everybody who spoke was a person: nothing to say
    await db.insert(callEvents).values({
      callId, room, atMs, atSec, kind: "unknown",
      note: played.length === 1
        ? "One thing Staff seemed to say was really a recording the store played"
        : `${played.length} things Staff seemed to say were really recordings the store played`,
      detail: JSON.stringify({
        step: "played_at_us",
        lines: played.map((p) => ({ line: p.line.slice(0, 160), why: p.why, announcesWait: p.announcesWait })),
      }),
    });
  } catch (e) { console.error("[receipt] who-said-it not recorded:", e); }
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
