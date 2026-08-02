// What the phone company and the voice service send us while a check is running: the call
// instructions Twilio fetches, the phone-menu navigator's steps, the recorded-clip rehearsal, our
// own AI answering the voice service, and the post-call report. Also the audio-path debug traces.

import type { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { callResults, categories, retailers } from "../db/schema";
import { config } from "../config";
import { getSetting } from "../db/settings";
import { billableOutcome, chargeCallOnce, ingestPending, notifyAfterVerdict, provider, schedulerTick } from "../calls/service";
import { navAskAudio, navEnded, navInitialTwiml, navStep } from "../calls/navigator";
import { closeReceipt, emit, markNow } from "../calls/events";
import { brainCompletion, brainKeyOk, checkBrainRequest } from "../calls/brain";
import { tapedeckEnded, tapedeckStep, tapedeckTwiml, tdClip } from "../calls/tapedeck";
import { consensusFor, productDetailLabel } from "../voice/verdict";
import { bridgeDebug, bridgeLog, takeBridgeDtmf, takeBridgeSay } from "../voice/bridge";
import { isCheckAlive, noteLineEnded } from "../calls/check-life";
import { RAILWAY_HOST, STAGING_HOST, placeBridgeCall, roomCallProgress, roomFinalizers } from "../voice/bridge-place";

// Live-view FLIGHT RECORDER (owner 07-17): the transcript freeze only reproduces on the owner's
// phone — no theory survives remote testing. The page posts its own play-by-play (ws state, poll
// responses, cid resolution, errors) so the next frozen call tells us exactly what the phone saw.
export const lvTraces: { at: number; ua: string; lines: string[] }[] = [];

export function register(app: Hono) {
  // ---- Custom telephony bridge (rebuild milestone 1) ----
  // TwiML Twilio fetches when OUR bridge call connects: stream the call's audio to our WS.
  // Twilio's media stream is pinned to the direct Railway domain (verified WS path; avoids Cloudflare).
  // Hosts live in bridge-place.ts (placeBridgeCall builds its callback URLs from them too).
  // Twilio's own report on the pickup fork (stream-started / stream-stopped / stream-error). Logged
  // into the bridge ring buffer so a silent fork failure names its reason instead of just not playing.
  app.all("/twiml/stream-status", async (c) => {
    const b = await c.req.text().catch(() => "");
    bridgeLog(`stream-status room=${(c.req.query("room") || "").slice(0, 8)} ${b.slice(0, 220)}`);
    return c.body("ok", 200);
  });

  app.all("/twiml/bridge", (c) => {
    const room = c.req.query("room") || "";
    // Chain keypad shortcut (e.g. B&N "0@3"): send it as REAL carrier DTMF via <Play digits>
    // BEFORE connecting the stream. IVRs detect signaling digits (what a phone keypad sends),
    // not in-band audio tones mixed into the stream — a synthesized tone gets ignored.
    // 'w' = 0.5s pause. The stream (agent + live listener) joins right after the press.
    const dtmf = takeBridgeDtmf(room);
    let play = "";
    if (dtmf) {
      let digits = "", prev = 0;
      for (const m of dtmf.matchAll(/([0-9*#])\s*@\s*(\d+(?:\.\d+)?)/g)) {
        const at = Number(m[2]);
        digits += "w".repeat(Math.max(0, Math.round((at - prev) / 0.5))) + m[1];
        prev = at;
      }
      play = `<Play digits="${digits}"/>`;
    }
    // VOICE injection (Bravo, e.g. CVS): speak the learned menu words on a timer via cheap Polly TTS,
    // BEFORE the stream — so the expensive agent never navigates. The spoken twin of <Play digits>.
    const say = takeBridgeSay(room);
    if (say) {
      let prev = 0;
      for (const m of say.matchAll(/([^,@]+?)\s*@\s*(\d+(?:\.\d+)?)/g)) {
        const word = m[1].trim().replace(/[<>&'"]/g, ""); const at = Number(m[2]);
        const wait = Math.max(0, Math.round(at - prev));
        if (wait > 0) play += `<Pause length="${wait}"/>`;
        play += `<Say voice="Polly.Joanna">${word}</Say>`;
        prev = at;
      }
    }
    // Live-listen from PICKUP (owner 07.24): fork the call audio to /twilio-media the moment the
    // store's system answers, so a listener hears the menu, our presses and spoken menu words, and
    // the ring-through to a human WHILE the nav verbs above are still running. <Start> is
    // non-blocking; the fork is listen-only and goes quiet the instant the real bridge socket takes
    // over the room (bridgeLiveRooms), so listeners never hear doubled audio.
    const host = config.staging.on ? STAGING_HOST : RAILWAY_HOST;
    const fork = `<Start><Stream url="wss://${host}/twilio-media?room=${room}" track="both_tracks" statusCallback="https://${host}/twiml/stream-status?room=${room}" statusCallbackMethod="POST"><Parameter name="room" value="${room}" /></Stream></Start>`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${fork}${play}<Connect><Stream url="wss://${host}/bridge?room=${room}"><Parameter name="room" value="${room}" /></Stream></Connect></Response>`;
    return c.body(xml, 200, { "Content-Type": "text/xml" });
  });

  // ---- Tree Trainer v2: cheap-lane phone-tree navigator (Twilio webhooks; session id gates them) ----
  app.all("/nav/twiml", (c) => c.body(navInitialTwiml(c.req.query("session") || ""), 200, { "Content-Type": "text/xml" }));

  app.post("/nav/step", async (c) => {
    const id = c.req.query("session") || "";
    let speech = "";
    try { const b = await c.req.parseBody(); speech = String(b.SpeechResult || ""); } catch { /* silent turn */ }
    return c.body(await navStep(id, speech), 200, { "Content-Type": "text/xml" });
  });

  app.post("/nav/ended", (c) => { navEnded(c.req.query("session") || ""); return c.body("ok", 200); });

  // The confirm-ask mp3 in the workflow's voice (Branson) — Twilio <Play> fetches this mid-call.
  app.get("/nav/ask-audio", (c) => {
    const b = navAskAudio(c.req.query("session") || "");
    if (!b) return c.body("not found", 404);
    return c.body(new Uint8Array(b), 200, { "Content-Type": "audio/mpeg" });
  });

  // ---- Tape deck (D-lane rehearsal): pre-synthesized clips call the OWNER's phone — Fun tab ----
  app.all("/tapedeck/twiml", (c) => c.body(tapedeckTwiml(c.req.query("session") || ""), 200, { "Content-Type": "text/xml" }));

  app.post("/tapedeck/step", async (c) => {
    let speech = "";
    try { const b = await c.req.parseBody(); speech = String(b.SpeechResult || ""); } catch { /* silent turn */ }
    return c.body(await tapedeckStep(c.req.query("session") || "", speech), 200, { "Content-Type": "text/xml" });
  });

  app.post("/tapedeck/ended", (c) => { tapedeckEnded(c.req.query("session") || ""); return c.body("ok", 200); });

  app.get("/tapedeck/clip", (c) => {
    const b = tdClip(c.req.query("session") || "", Number(c.req.query("i") || 0));
    if (!b) return c.body("not found", 404);
    return c.body(new Uint8Array(b), 200, { "Content-Type": "audio/mpeg" });
  });

  // ---- THE BRAIN, ON OUR OWN ACCOUNT (spec: the live call runtime, section 7) ----
  // The voice provider calls THIS mid-conversation when the brain switch is on, instead of using its
  // own hosted model. It speaks the industry-standard streaming chat-completions format, so nothing
  // about the call or the agent changes; only who is billed for the thinking. Measured: the brain is
  // 400 of the 723 credits a minute we burn.
  //
  // Deliberately NOT behind the admin token: the caller is the voice provider's servers, not a person
  // in Admin. It carries its own shared secret from Railway, and with that secret unset the endpoint
  // is closed rather than open.
  //
  // Nothing here is logged or stored. The transcript arrives, produces one line, and is dropped.
  app.post("/api/brain/chat/completions", async (c) => {
    if (!brainKeyOk(c.req.header("authorization") ?? c.req.header("x-api-key") ?? null)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    // The secret proved WHO is calling. This proves WHAT they sent is a real turn and not a replay,
    // a flood, or a shape we never agreed to — checked before a model with our money behind it is
    // ever reached. See the contract at the top of src/calls/brain.ts.
    const raw = await c.req.text();
    const check = checkBrainRequest(raw);
    if (!check.ok) {
      console.error("[brain] refused:", check.why);
      return c.json({ error: check.why }, check.why === "too-many" ? 429 : 400);
    }
    try {
      const { stream } = await brainCompletion(check.body);
      return new Response(stream, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
      });
    } catch (e) {
      // A failure here must be LOUD to the provider so its own retry and our ladder can act. Never a
      // 200 with an apology in it — that would be spoken to the store as though it were an answer.
      console.error("[brain]", e);
      return c.json({ error: "brain unavailable" }, 502);
    }
  });

  // Custom telephony bridge (milestone 1): place OUR own Twilio call; its audio streams to our WS.
  // placeBridgeCall + the room maps live in src/voice/bridge-place.ts so the non-HTTP callers
  // (scheduled checks, zone fires) can ride the bridge too. The TwiML/status routes stay here.
  app.post("/twiml/bridge-status", async (c) => {
    const room = c.req.query("room") || "";
    const form = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
    const status = String((form as Record<string, unknown>).CallStatus || "");
    if (room && status) {
      roomCallProgress.set(room, { status, at: Date.now() });
      // The carrier's own view of the call goes on the receipt — the only truthful source for when the
      // line was actually answered (our sockets open later, and on a menu call much later).
      if (status === "ringing") emit(room, "ringing", "The store's phone is ringing", { leg: "store" });
      if (status === "in-progress") { markNow(room, "answeredMs"); emit(room, "connected", "The line was answered"); }
      if (["completed", "busy", "failed", "no-answer", "canceled"].includes(status)) {
        setTimeout(() => roomCallProgress.delete(room), 60_000);
        // Headless bridge calls (schedules/zones/admin call-now) registered a finalizer so a call
        // that ended without reaching a human still lands a terminal callResults row.
        const fin = roomFinalizers.get(room);
        if (fin) { roomFinalizers.delete(room); try { fin(status); } catch (e) { console.error("bridge finalizer:", e); } }
        // The carrier says the call is over — this is the truthful end, so the receipt closes and
        // persists HERE. The finalizer above may still be writing the verdict; the roll-up is stitched
        // onto the call row by the sink, which looks the row up by room.
        closeReceipt(room, status === "completed" ? "Check ended" : `Check ended (${status})`, status);
        // …and the gatekeeper's row is stamped DIRECTLY, not only through the receipt: after a restart
        // there is no in-memory receipt left to close, and this callback is then the only witness that
        // the line ended. Without this stamp a restarted check would read alive until the hard cap.
        noteLineEnded(room, status);
      }
    }
    return c.body(null, 204);
  });

  app.get("/pub/bridge-debug", (c) => c.json({ log: bridgeDebug() }));

  app.post("/pub/live-debug", async (c) => {
    const b = (await c.req.json().catch(() => ({}))) as { lines?: unknown[] };
    const lines = Array.isArray(b.lines) ? b.lines.slice(0, 100).map((x) => String(x).slice(0, 300)) : [];
    lvTraces.push({ at: Date.now(), ua: (c.req.header("user-agent") || "").slice(0, 90), lines });
    if (lvTraces.length > 20) lvTraces.shift();
    return c.json({ ok: true });
  });

  app.get("/api/admin/live-debug", (c) => c.json(lvTraces));

  app.post("/api/bridge/call", async (c) => {
    const b = await c.req.json();
    if (!b.toNumber) return c.json({ error: "toNumber required" }, 400);
    const category = b.category || "Pokémon";
    const opener = (await getSetting("vt_opening")) || "Heyy! I was just checking to see if you guys got any {category} in?";
    // Ad-hoc dial to an arbitrary number (no store record) — minimal vars, generic IVR handling.
    // Optional dtmf ("digit@seconds,…") lets the bridge press a known keypad path while the agent talks.
    const r = await placeBridgeCall(b.toNumber, {
      internal_call_id: "0", category, retailer_name: b.storeName || "the store", location: "",
      clarification: "", phone_tree: b.phoneTree || "", special_instructions: "",
      voicemail_policy: "If you reach a personal voicemail with no menu, hang up without leaving a message.",
      personality: "", opening_line: opener.replace(/\{category\}/g, category), other_categories: "", ask_shipment_day: "",
    }, undefined, b.dtmf || null, { connectOnHuman: b.connectOnHuman, connectAtSec: b.connectAtSec, timeLimitSec: b.timeLimitSec, say: b.say || null });
    if (r.error) return c.json({ error: r.error }, 502);
    return c.json({ room: r.room, wsHost: config.staging.on ? STAGING_HOST : RAILWAY_HOST });
  });

  app.post("/api/ingest", async (c) => c.json({ finalized: await ingestPending() }));

  app.post("/api/tick", async (c) => c.json({ fired: await schedulerTick() }));

  // ---- ElevenLabs post-call webhook (used once deployed to a public URL) ----
  app.post("/webhooks/elevenlabs", async (c) => {
    try {
      const o = await provider.parseWebhook(c.req.raw);
      if (o.callId) {
        const row = (await db.select().from(callResults).where(eq(callResults.id, o.callId)))[0];
        // A CLOSED CHARLIE IS NOT A FINISHED CHECK. He is closed on every hold, which ends his
        // conversation at the provider, which fires this webhook — so a store saying "give me a second"
        // used to stamp the verdict "we got left on hold", charge for it and send the alerts while the
        // line was still up and Staff were walking back with the answer. The carrier's own end is the
        // only end. The GATEKEEPER answers now, not the in-memory receipt (08-01 audit, family 3): the
        // receipt's fifteen-minute life and every restart made the old guard fail toward "line is
        // down" — and on the old direct path, where the provider carries the line itself, it failed
        // the other way and froze this webhook for the receipt's whole life.
        // ASK WITH WHATEVER NAME THE ROW HAS. A row written by an older build, or by any path that
        // stamped only the provider's id, has no room — and a gate asked about nothing answers "not
        // alive" and finalizes straight through the guard. The gatekeeper resolves a provider id back
        // to the check itself, so handing it both names is belt and braces rather than a second rule.
        if (await isCheckAlive(row?.room ?? row?.providerCallId)) return c.json({ ok: true, skipped: "line still up" });
        // Consensus second read — keep the webhook verdict + billing identical to the poller (ingestPending):
        // two non-conflicting reads → a hard verdict (charge); conflict/ambiguity → "no clear answer", no charge.
        let confirmed = o.confirmed, statusKey = o.statusKey;
        let definitive = o.confirmed === true || o.confirmed === false;
        let productDetail: string | null = null;
        let restockDayHeard: string | null = null;
        if (o.status === "completed") {
          const label = row ? (await db.select({ label: categories.label }).from(categories).where(eq(categories.id, row.categoryId)))[0]?.label : undefined;
          // THE READER RULE (owner 07-29), one shared implementation — consensusFor in
          // src/voice/verdict.ts. It used to consult the reader only when the live read was unclear.
          const { consensus, second } = await consensusFor(
            { confirmed: o.confirmed, soldOut: o.soldOut, doesNotSell: o.doesNotSell, statusKey: o.statusKey },
            o.transcript, label || "the product", undefined, row?.room,
          );
          confirmed = consensus.confirmed; statusKey = consensus.statusKey; definitive = consensus.definitive;
          productDetail = productDetailLabel(second);
          restockDayHeard = second?.restockDay ?? null; // staff-volunteered restock day, captured even unprompted
        }
        const dayHeard = restockDayHeard ?? o.shipmentDay;
        await db.update(callResults).set({
          status: o.status, confirmed, statusKey, shipmentDayHeard: dayHeard, productDetail,
          summary: o.summary, transcript: o.transcript, completedAt: Math.floor(Date.now() / 1000),
        }).where(eq(callResults.id, o.callId));
        if (dayHeard && row) await db.update(retailers).set({ shipmentDay: dayHeard }).where(eq(retailers.id, row.retailerId));
        // Server-side billing: charge on a billable outcome (real answer OR engaged-no-answer, owner
        // 07-22). Idempotent — the poller may also try; charged_at guarantees exactly one charge.
        if (row?.finderUserId && o.status === "completed" && billableOutcome(statusKey, definitive, o.transcript)) {
          await chargeCallOnce(o.callId, row.finderUserId);
        }
        // The webhook path never sent the alerts either — same ONE notifier, claimed once per check.
        await notifyAfterVerdict(o.callId);
      }
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: String(e) }, 400);
    }
  });
}
