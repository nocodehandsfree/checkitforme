// Running a check, from the customer's side: start one, wait in the queue, watch it live, read the
// answer, hang up, charge for it, leave feedback. bridgeStoreCall is the one path every check takes
// to the phone — the zone runs and the queue drainer both come through it.

import type { Hono } from "hono";
import { and, eq, inArray, or } from "drizzle-orm";
import { client, db } from "../db/client";
import { accounts, callResults, categories, chains, retailers } from "../db/schema";
import { config } from "../config";
import { setSetting } from "../db/settings";
import { billableOutcome, bridgeCheckCall, buildRestockVars, chargeCallOnce, findRecentCheck, notifyAfterVerdict, provider, resolveWorkflow, transcriptPatch, triggerCall } from "../calls/service";
import { acquireCallSlot, governorEnabled, releaseCallSlot } from "../calls/concurrency";
import { routeCheck, ticketStatus, type PlaceResult, type QueueArgs } from "../calls/queue";
import { isSimId, simLive, simResult, simStartCall } from "../staging-sim";
import { getPolicy } from "../policy";
import { getReceipt, linkCall, transcriptOf } from "../calls/events";
import { tdSession, tdTranscript } from "../calls/tapedeck";
import { chainNavPlan } from "../calls/recipe";
import { heli } from "../llm";
import { consensusFor, productDetailLabel } from "../voice/verdict";
import { armLiveRead, dropLiveRead } from "../voice/live-read";
import { LIMITS, check as rlCheck, clientIp } from "../ratelimit";
import { getAccount, isComp, isCompAccount, spendableCredits } from "../billing";
import { bridgeConversationId, bridgeRoomForConversation } from "../voice/bridge";
import { isCheckAlive, resolveRoom as lifeRoom } from "../calls/check-life";
import { RAILWAY_HOST, STAGING_HOST, placeBridgeCall, roomCallProgress, roomCallSids, roomFinalizers } from "../voice/bridge-place";
import { isCallingPaused } from "../redis";
import { canReadTranscript, charged, closedGate, isFinderPrivate, isOwnerOnlyStore, pubCredits, verifyClerkToken } from "./shared-helpers";

// Resolve a store + category, then place a bridge call to it. Used by Runnr "Listen live".
export async function bridgeStoreCall(retailerId: number, categoryIds: number[], specificProduct?: string, finder?: { userId?: string; isPrivate?: boolean }, kioskMode?: boolean, opts?: { zoneRunId?: string; priority?: "interactive" | "batch" }): Promise<{ room?: string; error?: string }> {
  if (await isCallingPaused()) return { error: "calling_paused" }; // global spend kill-switch
  const primary = categoryIds[0];
  const extras = categoryIds.slice(1);
  // D-lane routing (the gap that sent the owner's 07-09 Fun tests to Charlie): when the store's
  // assigned workflow runs lane "delta", the LIVE check path must run the recorded-clip engine too,
  // not just triggerCall's non-live path. The synthetic "delta:<session>" id doubles as the room —
  // the live view follows it through /pub/bridge + /pub/live + the same listen-room WebSocket.
  try {
    const ret = (await db.select().from(retailers).where(eq(retailers.id, retailerId)))[0];
    const wf = ret ? await resolveWorkflow(ret.id, ret.chainId ?? null).catch(() => null) : null;
    if (wf?.lane === "delta") {
      const r = await triggerCall({ retailerId, categoryId: primary, mode: "restock", specificProduct, finderUserId: finder?.userId ?? undefined, isPrivate: finder?.isPrivate ?? false, kioskMode, zoneRunId: opts?.zoneRunId });
      if (r.providerCallId) return { room: r.providerCallId };
      return { error: "delta call did not start" };
    }
  } catch (e) { return { error: String((e as Error)?.message || e) }; }
  // Resolve the SAME three-tier vars (global + chain + store phone tree, clarification, etc.) the
  // scheduled calls use — Listen-live was previously running on the bare global prompt only.
  const v = await buildRestockVars(retailerId, primary, specificProduct, extras, kioskMode, finder?.userId ?? null);
  if (!v || !v.retailer.phone) return { error: "store not found" };
  // Phone-first: dial AS the finder's own VERIFIED number (caller_id) when present. Plus the hard
  // duration cap from policy (the cost guarantee).
  const pol = await getPolicy();
  let from: string | undefined;
  if (finder?.userId) {
    const acct = (await db.select().from(accounts).where(eq(accounts.clerkUserId, finder.userId)))[0];
    if (acct?.callerId) from = acct.callerId; // only set after Twilio caller-ID verification
  }
  // ROLLBACK of the 07-18 "first-word capture" instant-connect (owner order 07-21): connecting the
  // agent AT ANSWER on "direct" stores made Charlie talk over any store that only LOOKS direct but
  // plays a recording first (Box Lunch, Hot Topic, B&N Thousand Oaks — billed from second one).
  // Every store now waits for a voice before the paid agent joins (connect-on-human default), the
  // exact behavior of the trusted pre-07-18 era. Cost accepted by the owner: a true direct clerk's
  // first words can get clipped again. The REAL fix (ears open at pickup, mouth held until the words
  // read human, never-silent cap) is Echo's boxed build — do NOT re-enable instant-connect here.

  // ONE ROW, WRITTEN BEFORE THE DIAL, ON EVERY PATH (08-01 audit follow-up — the family rule).
  //
  // This used to fork: governed and zone checks pre-inserted a row, and the ORDINARY WEBSITE CHECK
  // inserted its row only inside the connect callback below — with the provider's conversation id and
  // NO room. Nothing ever backfilled it, so on the customer's own path the two finalize gates (the
  // provider's end-of-call report and the sweeper) asked "is this check alive?" about nothing at all,
  // were told no, and stamped a verdict + CHARGED while the phone was still in somebody's hand. That
  // is precisely the fault of the owner's second test run, still open on the ONE path he actually
  // uses, because the fix was made on the paths that already had a room. A refused dial on that path
  // was worse still: the row is only written at connect, so the check left no record anywhere.
  //
  // So the room is minted here, before anything is dialled, and the row carries it from the first
  // instant. The governor decides only whether a SLOT is held, which is what it was ever about.
  const room = crypto.randomUUID();
  const governed = await governorEnabled();
  const [row] = await db.insert(callResults).values({
    retailerId, categoryId: primary, mode: "restock", status: "dialing",
    room, providerCallId: `bridge:${room}`,
    finderUserId: finder?.userId ?? null, isPrivate: finder?.isPrivate ?? false, zoneRunId: opts?.zoneRunId ?? null,
  }).returning();
  const rid = row.id;
  if (governed) {
    const slot = await acquireCallSlot({ key: `call:${rid}`, priority: opts?.priority ?? "interactive", userId: finder?.userId ?? undefined, ttlSec: (pol.bail.maxCallSeconds || 180) + 120 });
    if (slot === null) {
      await db.update(callResults).set({ status: "failed", statusKey: "system_busy", summary: "All lines busy — the check will be retried." }).where(eq(callResults.id, rid));
      return { error: "calls_busy" }; // routeCheck sees this and queues the check instead of failing
    }
  }
  linkCall(room, rid); // the stable key for the timeline (providerCallId gets replaced mid-call)
  // READ AS IT GOES (owner 07-30). Armed on THIS path too — it never was, so the one path a customer
  // actually watches was still reading the conversation from scratch at hang-up, which is the wait on
  // "Getting the answer" that order existed to delete.
  armLiveRead(room, v.dynamicVars.category || "the product", specificProduct);

  // The conversation id lands mid-call and REPLACES the placeholder id on the same row — the room
  // stays put, so every gate can still find this check by name whichever id it is asked about.
  const result = await placeBridgeCall(v.retailer.phone, v.dynamicVars, (convId) => {
    db.update(callResults).set({ providerCallId: convId, status: "in_progress" }).where(eq(callResults.id, rid))
      .catch((e) => console.error("bridge call log update:", e));
    // Per-store talk cap (chains.maxTalkSeconds) wins over the global bail ceiling when set, so a
    // store the owner marked "wrap fast" gets a tighter Twilio TimeLimit — the cost guarantee.
  }, v.dtmf, { from, room, timeLimitSec: v.maxTalk ?? pol.bail.maxCallSeconds, say: v.say, connectAtSec: v.connectAtSec ?? undefined, voiceId: v.voiceId, voiceTuning: v.voiceTuning, listenNav: v.listenNav });

  if (result.error || !result.room) {
    if (governed) await releaseCallSlot(`call:${rid}`);
    await db.update(callResults).set({ status: "failed", summary: result.error || "bridge call failed", completedAt: Math.floor(Date.now() / 1000) }).where(eq(callResults.id, rid));
    return result;
  }
  // A CHECK NOBODY ANSWERS MUST STILL END. The sweeper deliberately skips a row still carrying our own
  // placeholder id, and this path registered no terminal hook at all — so pre-writing the row without
  // this would leave every unanswered website check sitting on "dialing" forever, which is a worse
  // fault than the one above. The carrier's terminal status closes it, exactly as on the other paths.
  roomFinalizers.set(result.room, (twilioStatus) => {
    void (async () => {
      const cur = (await db.select().from(callResults).where(eq(callResults.id, rid)))[0];
      if (!cur || cur.status !== "dialing") return; // conv id landed → the normal verdict path owns it
      const statusKey = ({ busy: "busy", failed: "bad_number" } as Record<string, string>)[twilioStatus] ?? "nobody_answered";
      await db.update(callResults).set({
        status: "no_answer", confirmed: null, statusKey,
        summary: `Bridge call ended before a human answered (${twilioStatus}).`,
        completedAt: Math.floor(Date.now() / 1000),
      }).where(eq(callResults.id, rid));
      if (governed) await releaseCallSlot(`call:${rid}`); // never reached a human → free the slot (idempotent)
    })().catch((e) => console.error("live bridge finalize:", e));
  });
  return result;
}

// Queue adapter for the live lane: reconstruct a live check from a ticket's args and return the
// waiting-screen PlaceResult shape ({ room, wsHost } or { error }). Used both when a check is placed
// immediately (routeCheck) and when the drainer places a queued one as a slot frees.
export const LIVE_WS_HOST = config.staging.on ? STAGING_HOST : RAILWAY_HOST;

export const placeLive = (args: QueueArgs): Promise<PlaceResult> =>
  bridgeStoreCall(
    Number(args.retailerId),
    args.categoryIds?.length ? args.categoryIds.map(Number) : [Number(args.categoryId)],
    args.specificProduct,
    args.finderUserId ? { userId: args.finderUserId, isPrivate: args.isPrivate } : undefined,
    args.kioskMode,
  ).then((rr) => ({ room: rr.room ?? null, wsHost: LIVE_WS_HOST, error: rr.error }));

export function register(app: Hono) {
  // Anonymous FREE check (1 per device, client-tracked; bounded globally by the demo pool).
  app.post("/pub/check", async (c) => {
    const rl = rlCheck("check", clientIp(c.req.raw.headers), LIMITS.check);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const b = await c.req.json();
    // Phone-first model: no anonymous calls — every call must come from a verified-phone account.
    if ((await getPolicy()).flags.requirePhoneSignup) return c.json({ error: "signin_required" }, 401);
    if ((await pubCredits()) <= 0) return c.json({ error: "no_credits" }, 402);
    const { retailerId, categoryId, specificProduct, kioskMode } = b;
    if (!retailerId || !categoryId) return c.json({ error: "retailerId and categoryId required" }, 400);
    if (config.staging.on && !config.callsEnabled) return c.json(simStartCall()); // preview: simulated call, no real dial
    const closed = await closedGate(Number(retailerId)); if (closed) return c.json(closed, 409);
    try {
      // Cheap lane when flagged: same response contract — the bridge:<room> id polls /pub/result like any cid.
      const bridge = (await getPolicy()).flags.cheapBridgeAll;
      const place = bridge ? bridgeCheckCall : triggerCall;
      const r = await routeCheck(bridge ? "bridge" : "direct", (args) => place({ ...args, mode: "restock" }),
        { retailerId, categoryId, specificProduct, kioskMode });
      if ("queued" in r) return c.json(r);
      return c.json({ providerCallId: r.providerCallId, status: r.status });
    } catch (e) { return c.json({ error: String(e) }, 400); }
  });

  // Waiting-screen poll (docs/specs/queue-feed/CONTRACT.md): place-in-line + real ETA while queued,
  // then the live call id once a slot frees so the page flips to the transcript. No auth beyond the
  // ticket id (same model as a cid). Inert unless the concurrency governor is on.
  app.get("/pub/queue/:ticketId", async (c) => c.json(await ticketStatus(c.req.param("ticketId"))));

  // Free check WITH live audio (bridged through our Twilio). Returns a room to listen on.
  app.post("/pub/check-live", async (c) => {
    const rl = rlCheck("check", clientIp(c.req.raw.headers), LIMITS.check);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    if ((await getPolicy()).flags.requirePhoneSignup) return c.json({ error: "signin_required" }, 401);
    if ((await pubCredits()) <= 0) return c.json({ error: "no_credits" }, 402);
    const b = await c.req.json();
    const catIds = (Array.isArray(b.categoryIds) ? b.categoryIds : [b.categoryId]).map(Number).filter(Boolean);
    if (!b.retailerId || !catIds.length) return c.json({ error: "retailerId and categoryId(s) required" }, 400);
    if (config.staging.on && !config.callsEnabled) return c.json({ room: simStartCall().providerCallId, wsHost: STAGING_HOST }); // preview: simulated live call
    const closed = await closedGate(Number(b.retailerId)); if (closed) return c.json(closed, 409);
    // Governor ON + pool full → routeCheck queues (waiting-screen ticket); else places now (today's
    // shape). Governor OFF → straight through to placeLive, unchanged.
    const r = await routeCheck("live", placeLive, { retailerId: Number(b.retailerId), categoryId: catIds[0], categoryIds: catIds, specificProduct: b.specificProduct, kioskMode: b.kioskMode, live: true });
    if ("queued" in r) return c.json(r);
    if (r.error) return c.json({ error: r.error }, 502);
    return c.json({ room: r.room, wsHost: r.wsHost ?? (config.staging.on ? STAGING_HOST : RAILWAY_HOST) });
  });

  app.get("/pub/result/:cid", async (c) => {
    let cid = c.req.param("cid");
    if (!(await canReadTranscript(c, cid))) return c.json({ error: "unauthorized" }, 401);
    if (config.staging.on && isSimId(cid)) return c.json(simResult(cid)); // preview: simulated verdict
    // Headless bridge check ("bridge:<room>"): pre-connect the row rides the room id; at connect it is
    // repointed at the EL conversation. Resolve room → conv id and fall through to the normal EL path;
    // before/without a connect, report the row's own state (dialing, or the finalizer's no_answer).
    if (cid.startsWith("bridge:")) {
      const convId = bridgeConversationId(cid.slice(7));
      if (convId) cid = convId;
      else {
        const row = (await db.select().from(callResults).where(eq(callResults.providerCallId, cid)))[0];
        if (row && row.status !== "dialing" && row.status !== "in_progress" && row.status !== "queued") {
          // ts rides EVERY result branch — the verdict page shows the call's date/time on all statuses (owner 07-16).
          return c.json({ status: row.status, confirmed: row.confirmed, statusKey: row.statusKey, productDetail: row.productDetail, summary: row.summary ?? "", transcript: row.transcript ?? "", ts: (row.startedAt || 0) * 1000 });
        }
        return c.json({ status: "in_progress", transcript: "", summary: "" });
      }
    }
    // D-lane call ("delta:<session>"): the verdict lives in OUR row (written by the Delta finalize hook),
    // never in ElevenLabs. A Charlie barge-in repoints the row's providerCallId at the EL conversation,
    // so fall back to resolving the row through the live session's callId.
    if (cid.startsWith("delta:")) {
      const s = tdSession(cid.slice(6));
      let row = (await db.select().from(callResults).where(eq(callResults.providerCallId, cid)))[0];
      if (!row && s?.check) row = (await db.select().from(callResults).where(eq(callResults.id, s.check.callId)))[0];
      // THE D-LANE NEVER GOT THE RUN-1 FIX (08-01 audit, family 1): this branch answered from the row
      // alone, so anything stamped early could hand out a verdict with the phone still in somebody's
      // hand. Same gate as every other door now: no result while the line is up.
      if (await isCheckAlive(cid)) return c.json({ status: "in_progress", transcript: row?.transcript ?? (s ? tdTranscript(s) : ""), summary: "" });
      if (row && row.status && row.status !== "in_progress" && row.status !== "dialing") {
        return c.json({
          status: row.status, confirmed: row.confirmed, statusKey: row.statusKey,
          productDetail: row.productDetail, shipmentDay: row.shipmentDayHeard ?? null, shipmentTime: row.shipmentTimeHeard ?? null,
          charged: !!row.chargedAt, // the page must say "1 check used" only when a check REALLY was spent
          summary: row.summary ?? "", transcript: row.transcript ?? "",
          durationSecs: row.callSeconds ?? undefined,
        });
      }
      return c.json({ status: "in_progress", transcript: row?.transcript ?? (s ? tdTranscript(s) : ""), summary: "" });
    }
    // THE LINE IS STILL UP, SO THERE IS NO RESULT YET. Charlie's session ends every time he is dropped
    // for a wait, and asking the provider about a finished session gets "done" — which this page reads
    // as the check being over. It then settled a no-answer verdict and hung the phone up on Staff who
    // were walking back with the answer (owner, live check 07-31). Our own record knows the difference:
    // it stays open until the CARRIER ends the call. Same guard as /pub/live, on the other poll.
    {
      const liveRoom = bridgeRoomForConversation(cid);
      const held = liveRoom ? getReceipt(liveRoom) : null;
      if (held && !held.closed) return c.json({ status: "in_progress", transcript: transcriptOf(held), summary: "" });
      // MEMORY IS NOT THE GUARD, THE GATEKEEPER IS (08-01 audit, family 1). After a restart, or once
      // the in-memory receipt and the conversation-to-room map expire, the lookups above know nothing —
      // and this door then finalized, CHARGED and alerted off the provider's word while the phone was
      // still in somebody's hand. The database's answer outlives the process; the row's own transcript
      // is our record of the conversation so far.
      if (!held && (await isCheckAlive(cid))) {
        const r0 = (await db.select().from(callResults).where(eq(callResults.providerCallId, cid)))[0];
        return c.json({ status: "in_progress", transcript: r0?.transcript ?? "", summary: "" });
      }
    }
    const o = await provider.getConversation(cid);
    // Prefer the FINALIZED row once it exists — it carries the consensus verdict (the reconciled
    // status_key/confirmed) and the captured product detail, which the live outcome does not. While the
    // call is still in flight, fall back to the live outcome so the consumer sees progress immediately.
    const row = (await db.select().from(callResults).where(eq(callResults.providerCallId, cid)))[0];
    // The ladder tells the WHOLE story (owner 07-22): nav runs as TwiML BEFORE the media stream
    // exists, so the EL transcript can never narrate the menu phase. But the nav plan is FACT — we
    // know the menu started at pickup and when every press/word fired (the learned schedule the TwiML
    // reproduced). Rebase the ladder onto the wall clock: ring (row) → menu + presses (recipe) → the
    // agent's own steps (EL clock, shifted past the nav TwiML). Direct chains: untouched.
    if (o && Array.isArray((o as { steps?: { n: number; at: number }[] }).steps) && row?.retailerId != null) {
      try {
        const ret = (await db.select({ chainId: retailers.chainId }).from(retailers).where(eq(retailers.id, row.retailerId)))[0];
        const ch = ret?.chainId != null ? (await db.select().from(chains).where(eq(chains.id, ret.chainId)))[0] : null;
        const plan = chainNavPlan(ch);
        if (plan) {
          const oo = o as unknown as { steps: { n: number; at: number }[]; durationSecs?: number };
          const wall = row.completedAt && row.startedAt ? row.completedAt - row.startedAt : null;
          const el = typeof oo.durationSecs === "number" ? oo.durationSecs : null;
          const ring = wall != null && el != null ? Math.max(1, Math.round(wall - el - plan.len)) : 2;
          const ladder: { n: number; at: number }[] = [{ n: 1, at: 0 }, { n: 3, at: ring }];
          for (const s of plan.steps) ladder.push({ n: s.n, at: ring + s.at });
          for (const s of oo.steps) if (s.n >= 7) ladder.push({ n: s.n, at: Math.round(ring + plan.len + s.at) });
          ladder.sort((a, b) => a.at - b.at || a.n - b.n);
          const out: { n: number; at: number }[] = [];
          for (const s of ladder) if (!out.length || s.n > out[out.length - 1].n) out.push(s);
          oo.steps = out;
          if (wall != null) oo.durationSecs = wall; // header total = the real wall clock the ladder spans
        }
      } catch { /* narration is best-effort — never block a result on it */ }
    }
    if (row && row.status === "completed") {
      return c.json({
        ...(o ?? {}),
        status: row.status,
        confirmed: row.confirmed,
        statusKey: row.statusKey,
        ts: (row.startedAt || 0) * 1000,       // call start (ms) — the status page shows date + time (owner 07-10)
        productDetail: row.productDetail,      // e.g. "3-pack blister · Surging Sparks" — null if not captured
        shipmentDay: row.shipmentDayHeard ?? (o?.shipmentDay ?? null),
        shipmentTime: row.shipmentTimeHeard ?? (o?.shipmentTime ?? null),
        charged: !!row.chargedAt, // the page must say "1 check used" only when a check REALLY was spent
        summary: row.summary ?? o?.summary ?? "",
        transcript: row.transcript ?? o?.transcript ?? "",
      });
    }
    // EL flips its status to "done" BEFORE its own analysis is ready, so the raw outcome here can carry a
    // premature verdict (confirmed=null → a wrong key) that then flips once the consensus row lands — the
    // "nobody answered → restock incoming" flicker. When the call has actually ended, finalize on-demand
    // with the SAME second-read consensus the webhook/poller use (it reads the transcript directly, so it
    // doesn't wait on EL's lagging data_collection), persist it, and return the reconciled verdict — so the
    // first verdict the UI ever shows is already the final one.
    if (row && o && o.status === "completed") {
      const label = (await db.select({ label: categories.label }).from(categories).where(eq(categories.id, row.categoryId)))[0]?.label;
      // THE READER RULE (owner 07-29), one shared implementation — consensusFor in src/voice/verdict.ts.
      // This is the FIRST verdict a customer ever sees, and it used to consult the second reader only
      // when the live read had no opinion, so a disagreement with a confirmed IN STOCK never landed here.
      const { consensus, second } = await consensusFor(
        { confirmed: o.confirmed, soldOut: o.soldOut, doesNotSell: o.doesNotSell, statusKey: o.statusKey },
        o.transcript, label || "the product", undefined, row.room,
      );
      const productDetail = productDetailLabel(second);
      await db.update(callResults).set({
        status: o.status, confirmed: consensus.confirmed, statusKey: consensus.statusKey,
        shipmentDayHeard: o.shipmentDay, shipmentTimeHeard: (second?.restockTime ?? o.shipmentTime) ?? null, productDetail, summary: o.summary,
        // Ours if we recorded any, theirs only when we did not (transcriptPatch). This on-demand
        // finalize is what a customer refreshing the page hits, so it was blanking the transcript
        // the receipt had already written the second they looked.
        ...(await transcriptPatch(row.id, o.transcript)),
        completedAt: Math.floor(Date.now() / 1000),
      }).where(eq(callResults.id, row.id));
      if (row.finderUserId && billableOutcome(consensus.statusKey, consensus.definitive, o.transcript)) await chargeCallOnce(row.id, row.finderUserId);
      dropLiveRead(row.room); // verdict written — let the room's live read go
      // This on-demand settle used to be the ONE finalize path that never sent the alerts, so a check
      // the customer watched to the end produced no in-stock email (owner 07-30). Same notifier as the
      // poller and the webhook, claimed once per check. Fire-and-forget: the verdict response never
      // waits on an email provider.
      void notifyAfterVerdict(row.id);
      return c.json({ ...(o ?? {}), status: o.status, confirmed: consensus.confirmed, statusKey: consensus.statusKey, ts: (row.startedAt || 0) * 1000, productDetail, shipmentDay: o.shipmentDay, shipmentTime: (second?.restockTime ?? o.shipmentTime) ?? null, charged: row.finderUserId ? consensus.definitive : false, summary: o.summary, transcript: (row.transcript && row.transcript.trim()) || o.transcript });
    }
    // Truly mid-call → progress only, never a verdict (so a wrong key can't flash before the real one).
    return c.json(o ? { ...o, ts: row?.startedAt ? row.startedAt * 1000 : undefined } : { status: "in_progress", transcript: "", summary: "", ts: row?.startedAt ? row.startedAt * 1000 : undefined });
  });

  // Live, mid-call transcript: returns whatever the agent + clerk have said SO FAR (no audio needed).
  app.get("/pub/live/:cid", async (c) => {
    if (!(await canReadTranscript(c, c.req.param("cid")))) return c.json({ error: "unauthorized" }, 401);
    if (config.staging.on && isSimId(c.req.param("cid"))) return c.json(simLive(c.req.param("cid"))); // preview: simulated live transcript
    // D-lane call: the live transcript is the session's own step log (no ElevenLabs). After a Charlie
    // barge-in, EL owns the rest of the call — proxy its live lines and append them to the clip turns.
    let dcid = c.req.param("cid");
    // Headless bridge check: same room → conv-id resolution as /pub/result. No conv yet = still dialing.
    if (dcid.startsWith("bridge:")) {
      const room = dcid.slice(7);
      // OUR OWN RECORD, NEVER THE PROVIDER'S SESSION STATUS. Charlie is CLOSED on every hold — that is
      // the only thing that stops the meter — which ENDS his conversation at the provider. Asking them
      // "is this still running?" therefore answered "finished" the instant Staff said "hold on, let me
      // go check", so the customer's page flipped to Getting results and settled a no-answer verdict
      // while the phone was still in somebody's hand (owner, test 1 on 07-31). It also wiped the
      // conversation off the page, because the reconnected Charlie is a NEW conversation over there and
      // the old one's lines are not in it.
      //
      // Our receipt is open until the LINE ends and carries every line both sides said across every one
      // of Charlie's stretches, so it answers both questions truthfully. It lives 15 minutes, well past
      // any check; if it is gone (a restart, or an old check being reopened) fall through to the
      // provider exactly as before.
      const held = getReceipt(room);
      if (held) return c.json({ live: !held.closed, status: held.closed ? "done" : "in_progress", transcript: transcriptOf(held) });
      // After a restart the in-memory receipt is gone but the check may be mid-call. The gatekeeper's
      // database answer keeps the page truthful; the row's transcript is what we hold of the talk so far.
      if (await isCheckAlive(room)) {
        const r0 = (await db.select().from(callResults).where(eq(callResults.room, room)))[0];
        return c.json({ live: true, status: "in_progress", transcript: r0?.transcript ?? "" });
      }
      const convId = bridgeConversationId(room);
      if (convId) dcid = convId;
      else return c.json({ status: "in_progress", transcript: "", summary: "" });
    }
    // …AND THE SAME CHECK ASKED ABOUT BY CHARLIE'S SESSION ID. The page swaps to that id the moment his
    // session exists, so guarding only our own name for the check protected the first few seconds and
    // nothing after. His session ENDS on every hold, the page read that as the check being finished,
    // settled a no-answer verdict and hung up the phone on Staff who were coming back with the answer.
    {
      const room = bridgeRoomForConversation(dcid);
      const held = room ? getReceipt(room) : null;
      if (held) return c.json({ live: !held.closed, status: held.closed ? "done" : "in_progress", transcript: transcriptOf(held) });
      // …and the same question answered from the DATABASE when memory is gone (08-01 audit, family 1):
      // the conversation-to-room map dies after ten minutes and dies with every restart, and this poll
      // then fell through to the provider — whose "done" only means Charlie was dropped for a wait.
      if (!held) {
        const room2 = await lifeRoom(dcid);
        if (room2 && !room2.startsWith("delta:") && (await isCheckAlive(room2))) {
          const r0 = (await db.select().from(callResults).where(eq(callResults.room, room2)))[0];
          return c.json({ live: true, status: "in_progress", transcript: r0?.transcript ?? "" });
        }
      }
    }
    if (dcid.startsWith("delta:")) {
      const s = tdSession(dcid.slice(6));
      if (s) {
        let tail = "";
        let elLive: boolean | null = null;
        if (s.escalated && s.check) {
          try {
            const row = (await db.select().from(callResults).where(eq(callResults.id, s.check.callId)))[0];
            const conv = row?.providerCallId && !row.providerCallId.startsWith("delta:") ? row.providerCallId : null;
            if (conv) {
              const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conv}`, { headers: { "xi-api-key": config.voice.apiKey } });
              if (r.ok) {
                const d = (await r.json()) as { status?: string; transcript?: { role: string; message: string | null }[] };
                tail = (d.transcript ?? []).filter((t) => t.message).map((t) => `${t.role === "agent" ? "Agent" : "Clerk"}: ${t.message}`).join("\n");
                elLive = !["done", "completed", "failed"].includes(d.status ?? "");
              }
            }
          } catch { /* keep the clip turns only */ }
        }
        // OUR OWN SESSION IS THE AUTHORITY; the provider's status is only a tie-break when we hold
        // nothing (08-01 audit, family 1). A Charlie closed for a hold reads as finished over there
        // while the phone is still in somebody's hand — the provider used to OVERRIDE our session here.
        const aliveOurs = await isCheckAlive(dcid);
        const done = aliveOurs ? false : (elLive === null ? (s.status === "done" || s.status === "failed") : !elLive);
        return c.json({ live: !done, status: done ? "done" : "in_progress", transcript: [tdTranscript(s), tail].filter(Boolean).join("\n") });
      }
      const row = (await db.select().from(callResults).where(eq(callResults.providerCallId, dcid)))[0];
      return c.json({ live: false, status: row?.status || "done", transcript: row?.transcript || "" });
    }
    // THE LAST DOOR STILL ASKING THE PROVIDER (08-01 audit, family 1): this branch turned the raw
    // session status into live:false with no look at our own record at all. The gatekeeper answers
    // first; the provider's copy is only consulted for a check we genuinely hold nothing on.
    if (await isCheckAlive(dcid)) {
      const r0 = (await db.select().from(callResults).where(eq(callResults.providerCallId, dcid)))[0];
      return c.json({ live: true, status: "in_progress", transcript: r0?.transcript ?? "" });
    }
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${dcid}`, { headers: { "xi-api-key": config.voice.apiKey } });
      if (!r.ok) return c.json({ live: true, status: "in_progress", transcript: "" });
      const d = (await r.json()) as { status?: string; transcript?: { role: string; message: string | null }[] };
      const transcript = (d.transcript ?? []).filter((t) => t.message).map((t) => `${t.role === "agent" ? "Agent" : "Clerk"}: ${t.message}`).join("\n");
      const done = ["done", "completed", "failed"].includes(d.status ?? "");
      return c.json({ live: !done, status: d.status ?? "in_progress", transcript });
    } catch { return c.json({ live: true, status: "in_progress", transcript: "" }); }
  });

  app.post("/pub/charge", async (c) => {
    const { cid } = await c.req.json();
    let bal = await pubCredits();
    if (cid && !charged.has(cid) && bal > 0) { charged.add(cid); bal -= 1; await setSetting("pub_credits", String(bal)); }
    return c.json({ balance: bal, charged: true });
  });

  // Human feedback on a call's verdict — what the answer ACTUALLY was, per the person who read the transcript.
  // Most valuable on the "no clear answer" verdicts; it's the labeled data we use to tune the consensus.
  app.post("/pub/feedback", async (c) => {
    const rl = rlCheck("watch", clientIp(c.req.raw.headers), LIMITS.watch);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
    const b = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const cid = String(b.cid ?? "").slice(0, 128);
    const verdict = String(b.verdict ?? "");
    if (!cid || !["in", "out", "soon", "unsure"].includes(verdict)) return c.json({ error: "bad_request" }, 400);
    const shown = String(b.shown ?? "").slice(0, 40);
    try { await client.execute({ sql: "INSERT INTO call_feedback (cid, user_verdict, shown_status) VALUES (?, ?, ?)", args: [cid, verdict, shown] }); }
    catch (e) { return c.json({ error: "store_failed" }, 500); }
    return c.json({ ok: true });
  });

  app.post("/pub/translate", async (c) => {
    const { text, to } = await c.req.json();
    if (!text || !String(text).trim()) return c.json({ translated: "" });
    const key = process.env.OPENAI_API_KEY;
    if (!key) return c.json({ error: "translation unavailable" }, 503);
    // Target language: English by default; Spanish when the UI is in Spanish mode.
    const lang = to === "es" ? "Spanish" : "English";
    try {
      const r = await fetch("https://oai.helicone.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", ...heli("translate") },
        body: JSON.stringify({
          model: "gpt-4o-mini", max_tokens: 800, temperature: 0,
          messages: [{ role: "user", content: `Translate this phone-call transcript to natural ${lang}. Keep each "Agent:" and "Clerk:" speaker label on its own line, exactly as given. If it's already ${lang}, return it unchanged. Output only the translation, no preamble.\n\n${text}` }],
        }),
      });
      const d = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      return c.json({ translated: (d.choices?.[0]?.message?.content ?? "").trim() });
    } catch (e) { return c.json({ error: String(e) }, 500); }
  });

  // Authenticated check — verifies the user has credits, places the call. Charged only on a real answer.
  app.post("/app/check", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const { retailerId, categoryId, specificProduct, kioskMode } = await c.req.json();
    if (!retailerId || !categoryId) return c.json({ error: "retailerId and categoryId required" }, 400);
    if (config.staging.on && !config.callsEnabled) return c.json(simStartCall()); // preview: simulated call, no real dial
    const closed = await closedGate(Number(retailerId)); if (closed) return c.json(closed, 409);
    const a = await getAccount(u.id, u.email);
    const comp = isCompAccount(a) || isComp(u.email || undefined);
    // Per-IP rate limit on the money surface (bypassed for comp/owner — they test call-by-call).
    if (!comp) { const rl = rlCheck("check", clientIp(c.req.raw.headers), LIMITS.check); if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429); }
    // Owner-only demo store ("Fun") — only the master/comp account may call it (404 so we never reveal it).
    if (!comp && await isOwnerOnlyStore(Number(retailerId))) return c.json({ error: "not_found" }, 404);
    if (!comp && (!a || spendableCredits(a) <= 0)) return c.json({ error: "no_credits" }, 402);
    // Hard block: no second check of the same store+product within the HOUR (customers only; comp/owner
    // exempt so the Fun store can be re-tested). The front end already shows a 24h "you've checked this"
    // reminder; this stops rapid re-dials — a store that said "no shipment yet" can be re-checked later,
    // just not spammed. Website renders the notice on this 429 (error:"too_soon", retryAfterMin).
    if (!comp) {
      const recent = await findRecentCheck(u.id, Number(retailerId), Number(categoryId), 1);
      if (recent) {
        const mins = Math.max(1, 60 - Math.floor((Date.now() / 1000 - (recent.startedAt || 0)) / 60));
        return c.json({ error: "too_soon", retryAfterMin: mins, message: `You just checked this store — you can check again in about ${mins} min.` }, 429);
      }
    }
    try {
      // Cheap lane when flagged: same response contract — the bridge:<room> id polls /pub/result like any cid.
      const bridge = (await getPolicy()).flags.cheapBridgeAll;
      const place = bridge ? bridgeCheckCall : triggerCall;
      const isPrivate = await isFinderPrivate(a);
      // Governor ON + pool full → routeCheck queues (returns {queued,ticketId,position,etaSeconds});
      // else it places now (today's shape). Governor OFF → straight through, unchanged.
      const r = await routeCheck(bridge ? "bridge" : "direct", (args) => place({ ...args, mode: "restock" }),
        { retailerId, categoryId, specificProduct, finderUserId: u.id, isPrivate, kioskMode });
      if ("queued" in r) return c.json(r);
      return c.json({ providerCallId: r.providerCallId, status: r.status });
    } catch (e) { return c.json({ error: String(e) }, 400); }
  });

  // Authed check WITH live audio (bridged). Charged on a real answer, like /app/check.
  app.post("/app/check-live", async (c) => {
    const u = await verifyClerkToken(c.req.header("Authorization"));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    const b = await c.req.json();
    const catIds = (Array.isArray(b.categoryIds) ? b.categoryIds : [b.categoryId]).map(Number).filter(Boolean);
    if (!b.retailerId || !catIds.length) return c.json({ error: "retailerId and categoryId(s) required" }, 400);
    if (config.staging.on && !config.callsEnabled) return c.json({ room: simStartCall().providerCallId, wsHost: STAGING_HOST }); // preview: simulated live call
    const closed = await closedGate(Number(b.retailerId)); if (closed) return c.json(closed, 409);
    const a = await getAccount(u.id, u.email);
    const comp = isCompAccount(a) || isComp(u.email || undefined);
    // Per-IP rate limit on the money surface (bypassed for comp/owner — they test call-by-call).
    if (!comp) { const rl = rlCheck("check", clientIp(c.req.raw.headers), LIMITS.check); if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429); }
    // Owner-only demo store ("Fun") — only the master/comp account may call it (404 so we never reveal it).
    if (!comp && await isOwnerOnlyStore(Number(b.retailerId))) return c.json({ error: "not_found" }, 404);
    if (!comp && (!a || spendableCredits(a) <= 0)) return c.json({ error: "no_credits" }, 402);
    // Hard block: one check per store+product per hour (customers only; comp/owner exempt). See /app/check.
    if (!comp) {
      const recent = await findRecentCheck(u.id, Number(b.retailerId), catIds[0], 1);
      if (recent) {
        const mins = Math.max(1, 60 - Math.floor((Date.now() / 1000 - (recent.startedAt || 0)) / 60));
        return c.json({ error: "too_soon", retryAfterMin: mins, message: `You just checked this store — you can check again in about ${mins} min.` }, 429);
      }
    }
    // Governor ON + pool full → routeCheck queues (waiting-screen ticket); else places now (today's
    // shape). Governor OFF → straight through to placeLive, unchanged.
    const isPrivate = await isFinderPrivate(a);
    const r = await routeCheck("live", placeLive, { retailerId: Number(b.retailerId), categoryId: catIds[0], categoryIds: catIds, specificProduct: b.specificProduct, finderUserId: u.id, isPrivate, kioskMode: b.kioskMode, live: true });
    if ("queued" in r) return c.json(r);
    if (r.error) return c.json({ error: r.error }, 502);
    return c.json({ room: r.room, wsHost: r.wsHost ?? (config.staging.on ? STAGING_HOST : RAILWAY_HOST) });
  });

  // End the live bridged call (user pressed "Stop & hang up").
  app.post("/pub/bridge-hangup", async (c) => {
    const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
    const { room } = await c.req.json();
    const callSid = roomCallSids.get(room);
    // Master Stop & hang-up = WE ended it, not the store. Stamp the call as a non-result ('admin_hangup',
    // confirmed=null) so it's never mislabeled "nobody answered". Because this status is NOT in the
    // ingest pending set (dialing/in_progress/queued), the verdict + charge path skips it automatically.
    // statusKey drives the display pill (verdictKey reads statusKey first), so set both.
    // Customer-initiated stop -> statusKey user_cancelled ("Check cancelled"); status stays
    // admin_hangup so the non-result/no-charge semantics are byte-identical (owner 07-21).
    //
    // MATCH ON THE ROOM, NOT ONLY THE CONVERSATION ID. This used to run only when the voice provider
    // had already handed us a conversation id, which on the new runtime may never happen — the agent
    // opens late, behind the recorded question. So pressing Stop before then stamped nothing, the
    // finalizer later wrote "nobody answered", and the owner was told a call he had personally
    // answered and cancelled had gone unanswered (live Fun call, 07-28). The room exists from before
    // the phone rings and never changes, so it always matches.
    const convId = bridgeConversationId(room);
    const ids = [`bridge:${room}`, convId].filter(Boolean) as string[];
    await db.update(callResults)
      .set({ status: "admin_hangup", statusKey: "user_cancelled", confirmed: null, completedAt: Math.floor(Date.now() / 1000) })
      .where(and(
        or(eq(callResults.room, room), inArray(callResults.providerCallId, ids)),
        inArray(callResults.status, ["dialing", "in_progress", "queued"])))
      .catch((e) => console.error("admin_hangup stamp:", e));
    if (sid && tok && callSid) {
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
        body: "Status=completed",
      }).catch(() => {});
    }
    return c.json({ ok: true });
  });

  app.get("/pub/bridge/:room", (c) => {
    const room = c.req.param("room");
    if (config.staging.on && isSimId(room)) return c.json({ conversationId: room, wsHost: STAGING_HOST }); // sim: room IS the conversation id
    // D-lane room: the room IS the conversation id, but only hand it out once the store PICKED UP
    // (session leaves "dialing" when Twilio fetches the answer TwiML) — mirrors EL, where the conv id
    // lands at engage, so the UI's "We've connected" step fires at the real pickup. A finished/expired
    // session returns the id straight away so a reopened call can still resolve its result.
    if (room.startsWith("delta:")) {
      const s = tdSession(room.slice(6));
      const answered = !s || s.status !== "dialing";
      return c.json({
        conversationId: answered ? room : null,
        wsHost: config.staging.on ? STAGING_HOST : RAILWAY_HOST,
        callProgress: s ? { status: s.status === "dialing" ? "ringing" : s.status === "live" ? "in-progress" : "completed", at: Date.now() } : null,
      });
    }
    // Instant-connection (EL-native) call: the room IS the ElevenLabs conversation id — resolve it to
    // itself so the live view's transcript poll engages immediately (no bridge, no Twilio callbacks).
    if (room.startsWith("conv")) return c.json({ conversationId: room, wsHost: config.staging.on ? STAGING_HOST : RAILWAY_HOST, callProgress: null });
    // callProgress = the REAL Twilio state (ringing/answered/…) so the live timeline shows what's actually
    // happening, not an inferred guess. null until the first status callback lands.
    return c.json({ conversationId: bridgeConversationId(room), wsHost: config.staging.on ? STAGING_HOST : RAILWAY_HOST, callProgress: roomCallProgress.get(room) ?? null });
  });
}
