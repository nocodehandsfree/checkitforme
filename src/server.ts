// Voice Caller server — REST API for the dashboard, the ElevenLabs post-call
// webhook, a result poller, and the schedule ticker. Runs locally (Node) and
// deploys to Railway/Cloudflare unchanged.
import { existsSync, mkdirSync, readFileSync, readdirSync as fsReaddirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { WebSocketServer, type WebSocket } from "ws";
import { and, desc, eq, gte, inArray, isNull, like, lte, notInArray, or, sql } from "drizzle-orm";
import { db, client } from "./db/client";
import {
  alertSends, alertSubscriptions, callEvents, callResults, categories, chains, communityPosts, customerSchedules, discordChannels, kiosks, kioskReceipts, kioskReports, leads, products, retailers, schedules, scheduleTargets, statuses, storeRequests, supportConversations, supportMessages, supportTickets, waitlist, watches, zones, zoneRetailers,
} from "./db/schema";
import { answerSupport, resolveConversation, warmClose, SUPPORT_MODELS, SUPPORT_CATEGORIES, type SupportCategory } from "./support/ladder";
import { submitTicket } from "./support/tickets";
import { addQa, reindexBook, searchBook, getFaq } from "./support/rag";
import { listCreditGrants } from "./support/credits";
import { config } from "./config";
import { createHash } from "node:crypto";
import { assertProdSecurity } from "./security-checks";
import { bootstrap } from "./db/bootstrap";
import { allSettings, getSetting, setSetting } from "./db/settings";
import { importZonesData, geocodeMissing, backfillDirectChains, isDirectDefaultChain } from "./db/import-data";
import { applyPreset, applySandboxToStores, applySandboxTuning, applyVoiceTuning, backfillHours, backfillPhones, benchTestCall, bridgeCheckCall, buildRestockVars, billableOutcome, callZone, canAffordZone, chargeCallOnce, cloneVoice, deletePreset, getCreditStatus, getLiveVoice, getSandboxTuning, getVoiceTuning, ingestPending, listPresets, listVoices, notifyAfterVerdict, placeAdHocCall, previewStorePrompt, provider, refreshHours, resetRotation, resolveWorkflow, retailersWithStatus, reverifyStampedHours, savePreset, schedulerTick, setActiveVoice, storeOpenInfo, transcriptPatch, triggerCall, findRecentCheck, navPlanFromVersion, zoneQuote } from "./calls/service";
import { applyStoreSync, storeSyncTick, syncStatus, learnedSyncTick, learnedSyncStatus } from "./store-sync";
import { buildSettingsExport, settingsSyncStatus, settingsSyncTick } from "./settings-sync";
import { concurrencyStatus, acquireCallSlot, releaseCallSlot, governorEnabled } from "./calls/concurrency";
import { routeCheck, ticketStatus, drainCheckQueue, type QueueArgs, type PlaceResult } from "./calls/queue";
import { openState } from "./store-hours";
import { resolveBrand, brandSwitcher, brandForPath } from "./brands";
import { simStartCall, isSimId, simLive, simResult } from "./staging-sim";
import { getPolicy, setPolicy, publicPolicy, cachedPolicy } from "./policy";
import { importStores, backfillRegions } from "./stores-import";
import { runAdminAgent, AGENT_MODELS } from "./agent/admin-agent";
import { queueTreeRelearn, TREE_MODEL } from "./calls/tree-learn";
import { placeNavCall, navInitialTwiml, navStep, navEnded, navMediaFeed, getNavSession, latestNavSessionForChain, NAV_MODEL, confirmAskedStores, navAskAudio } from "./calls/navigator";
import { listenNavFeed, endListenNav } from "./calls/listen-nav";
// THE CALL RECEIPT (owner 07-26): every runtime decision, with its real second, on every call.
import { emit, markNow, closeReceipt, linkCall, rollup, rollupFromRow, getReceipt, transcriptOf, setLineHook, normSaid, type Rollup } from "./calls/events";
import { installReceiptStore, currentRates, onReceiptClosed } from "./calls/receipt-store";
import { brainCompletion, brainKeyOk, checkBrainRequest } from "./calls/brain";
import { costCall, money } from "./calls/cost";
import { behaved, agentLinesFrom } from "./calls/behaved";
import { opsRollup, type CheckRow } from "./calls/ops";
import { startMapper, stopMapper, mapperState, resumeMapperRuns } from "./calls/mapper";
import { activeMap, resetChainHistory, graphSummary, chainDetail, approveVersion, rejectVersion, openUnknowns, resolveUnknown, proposeVersion, versionsFor, pathSignature, reshareUnsent, graphFor, learnFromReceipt, navSecondsOf, type MapRecipe, type EvidenceCall } from "./calls/mapgraph";
import { recipeFromCall, evidenceFromCall, type CapturedStep } from "./calls/map-capture";
import { startSweep, stopSweep, sweepStatus, buildQueue } from "./calls/sweep";
import { tapedeckCall, tapedeckTwiml, tapedeckStep, tapedeckEnded, tdClip, tdSession, tdTranscript, setDeltaBarge, setDeltaRelay } from "./calls/tapedeck";
import { startBatch, batchStatus, stopBatch, resumeBatchIfFlagged, lockRecipeToChain } from "./calls/trainer-batch";
import { isDirect, recipeToTreeText, recipeToDtmf, recipeAnswerPath, connectAtSecFor, chainDialable, chainNavPlan, type Recipe } from "./calls/recipe";
import { llm, heli } from "./llm";
import { opsAlert, watchdogTick, watchdogState, backupTick, backupNow, backupState } from "./ops-watch";
import { harvestHoursTick } from "./hours-harvest";
import { createSchedule, listSchedulesDetailed, deleteSchedule, customerScheduleTick } from "./customer-schedules";
import { cachedCategories, cachedChains, cachedRetailers, categoryLabelMap, retailerMap, invalidateRefCache } from "./refcache";
import { haversineMi, bboxAround } from "./geo";
import { ingestSignals, recentStockNear, latestForRetailer } from "./stock/signals";
import { classifyVerdict, reconcile, consensusFor, productDetailLabel } from "./voice/verdict";
import { armLiveRead, noteLiveLine, dropLiveRead } from "./voice/live-read";
import { seedStockCheckIntel } from "./stock/intel";
import { seedSellMethods } from "./stock/sellmethods";
import { r2Config, presignPut, photoKey } from "./r2";
import { check as rlCheck, clientIp, LIMITS } from "./ratelimit";
import { isGmailConfigured, gmailReceiptTick, debugRecentInbox } from "./gmail-receipts";
import { rankBets } from "./best-bet";
import { referralStatus, claimReferral } from "./referrals";
import { sendAlert, sendAnonEmail, sendTestAlert, sendOwnerInStockEmail, sendConfirmEmail, checkEmailToken, alertSubscribe, myAlerts, alertMute, pauseAllAlerts, alertSlotsUsed, alertExists, ALERT_SLOT_CAP, getAlertTemplatesPublic, setAlertTemplates, monthKey, fanoutRestock } from "./alerts";
import { ownerAlertPrefs, notifyContact } from "./calls/notify";
import { getAccount, getAccountByPhone, phoneAccountExists, chargeOneCredit, createCheckout, createCheckoutIntent, verifyStripeSig, handleStripeEvent, isComp, isCompAccount, grantCredits, spendableCredits, SUB, PACKS } from "./billing";
import { getPlans, savePlans, publishPlansToStripe, plansSyncView, publicPlans, normalizePlans, accountFeatures } from "./plans";
import { e164 as authE164, signSession, verifySession, startPhoneVerify, checkPhoneVerify, startCallerIdVerify, isCallerIdVerified } from "./auth";
import { brevoUpsertContact } from "./brevo";
import { accounts } from "./db/schema";
import { settings as settingsTbl } from "./db/schema";
import { handleTwilioBridge, setBridgeContext, bridgeConversationId, bridgeRoomForConversation, bridgeDebug, bridgeLog, takeBridgeDtmf, takeBridgeSay, activeBridgeCalls } from "./voice/bridge";
import { installCheckLife, isCheckAlive, noteLineEnded, resolveRoom as lifeRoom } from "./calls/check-life";
import { placeBridgeCall, attachListenFork, roomCallSids, roomCallProgress, roomFinalizers, RAILWAY_HOST, STAGING_HOST } from "./voice/bridge-place";
import { isCallingPaused, setCallingPaused, spendTodayCents, withLock } from "./redis";

assertProdSecurity(); // refuse to boot in prod with an open admin / forgeable sessions
installReceiptStore(); // every finished call writes its timeline + seconds + cost to the database
// THE GATEKEEPER (08-01 audit): every check's life mirrored to the database as it happens, so
// "is this check alive?" is answerable after a restart and after every in-memory map has expired.
// The carrier's line-end is the only end; every finalize path asks check-life, never the provider.
installCheckLife();
// READ AS IT GOES (owner 07-30): every line reaches the reader the moment it is spoken, so the
// verdict is ready at hang-up instead of being started then. Registered, not imported, because
// calls/events.ts stays free of model/db code by design. See src/voice/live-read.ts.
setLineHook(noteLiveLine);
// …and every finished call also teaches the map (owner 07-27: "one customer calling up Franklin's and
// we had a voice menu — those aren't just lost"). Mapper READS the receipt the Ear already wrote; it
// never opens a second listener. A check can flag a store, never rewrite a route: that still takes a
// mapping call. Wrapped so a map hiccup can never cost us a receipt.
onReceiptClosed(async (r) => {
  const room = r.room;
  const callId = r.callId;
  const row = callId ? (await db.select().from(callResults).where(eq(callResults.id, callId)))[0] : null;
  const store = row?.retailerId ? (await db.select().from(retailers).where(eq(retailers.id, row.retailerId)))[0] : null;
  if (!store?.chainId) return;
  const res = await learnFromReceipt({
    room, callId, chainId: store.chainId, storeId: store.id,
    events: r.events.map((e) => ({ kind: String(e.kind), atSec: e.atSec, detail: e.detail })),
  });
  if (res.learned.length) console.log(`[map] learned from call ${callId ?? room}: ${res.learned.join(" · ")}`);
});
await bootstrap(); // apply migrations + seed catalog if empty

// A redeploy must not kill a mapping run (owner 07-30): any run mid-flight when the old process died
// resumes from its saved memory here. Delayed past the old process's drain window so the outgoing
// process and this one never dial stores at the same time.
setTimeout(() => {
  resumeMapperRuns()
    .then((n) => { if (n) console.log(`[mapper] resumed ${n} mapping run(s) after restart`); })
    .catch((e) => console.error("[mapper] resume failed:", e));
}, 90_000);
const app = new Hono();

// ---- Baseline security headers (OWASP-safe subset) ----
// Applied to every response. Deliberately conservative so nothing breaks: no frame-ancestors/CSP that
// could block the embedded Stripe checkout, the live-call WebSocket, or a white-label embed. HSTS is
// prod-only (Railway/Cloudflare already force HTTPS). nosniff + Referrer-Policy are universally safe.
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.RAILWAY_ENVIRONMENT) c.header("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
});

// ---- Build stamp (REBUILD_PLAN 2026-07-22) ----
// Every served HTML page carries the git SHA Railway built from, so scripts/verify-live.sh can
// PROVE what a site is actually serving. "Shipped/pushed/fixed" claims paste that script's output.
const BUILD_SHA = (process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 12) || "local";
app.use("*", async (c, next) => {
  await next();
  const ct = c.res.headers.get("content-type") || "";
  if (!ct.includes("text/html") || c.res.status === 101 || !c.res.body) return;
  const body = await c.res.text();
  const stamped = body.includes("</head>")
    ? body.replace("</head>", `<meta name="build" content="${BUILD_SHA}">\n</head>`)
    : body;
  const headers = new Headers(c.res.headers);
  headers.delete("content-length");
  c.res = new Response(stamped, { status: c.res.status, headers });
});

// ---- Staging (STAGING=1) — a private replica, NOT password-walled ----
// Staging used to sit behind an HTTP Basic / login-form gate, but it was constant friction (iOS
// re-prompting) for no real benefit: you log in with your phone exactly like prod. So the gate is
// gone — staging behaves like production (phone login gates account features). We only keep it out
// of search results. Prod leaves STAGING unset, so this no-ops entirely.
if (config.staging.on) {
  app.use("*", async (c, next) => {
    c.header("X-Robots-Tag", "noindex, nofollow"); // never index the preview, even if a crawler slips in
    return next();
  });
}
// Paths that must stay live even while the coming-soon splash is up: assets (incl. the splash's own
// logos), consumer + admin APIs, telephony webhooks, admin login. Everything else on a consumer host
// is a page and gets the splash (unless the browser has a valid peek).
const GATE_SKIP = /^\/(api|pub|app|auth|webhooks|logos|og|fonts|media|sw\.js|manifest|robots|favicon|\.well-known|twiml|nav|tapedeck|bridge|listen|twilio-media|admin-login|admin-logout|health|s)\b/; // `s` = the share landing: link-preview bots must see the unfurl cards even while the splash is up (owner 07-14)
app.use("*", async (c, next) => {
  const code = c.req.query("peek");
  if (code && config.peekCode && code === config.peekCode) {
    const domain = cookieRootDomain(c.req.header("host"));
    setCookie(c, "peek", config.peekCode, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 180, ...(domain ? { domain } : {}) });
  }
  // ONE coming-soon decision point: gate consumer page loads here so the peek bypass is reliable. A
  // valid ?peek code (instant, on the magic link) or the peek cookie skips it for that browser only.
  if (config.comingSoon && c.req.method === "GET" && !peekOk(code, getCookie(c, "peek"))) {
    const host = (c.req.header("host") || "").toLowerCase();
    // Consumer-vs-admin here MUST mirror rootHandler's decision exactly. In prod, Admin traffic can
    // reach the app on hosts that don't literally start with admin./caller. (edge routing) — those
    // resolve to the default "runner" brand, which is how rootHandler serves them app.html. A naive
    // startsWith() check here served the coming-soon splash to THE Admin (2026-07-15).
    const override = c.req.query("brand");
    const consumerHost = config.staging.on
      ? (!(host.startsWith("caller.") || host.startsWith("admin.")) || !!override)
      : (host.startsWith("runner.") || resolveBrand(host, override).key !== "runner" || !!override);
    if (consumerHost && !GATE_SKIP.test(c.req.path)) return c.html(renderComingSoon(host, !!c.req.query("ref")));
  }
  return next();
});

// THE Admin (admin.checkitforme.com) can read this service's /api/* cross-origin — how the Testing
// and Feedback pages flip to the staging site's Fun-store data. Auth still applies: the admin_session
// cookie is minted on the registrable root (.checkitforme.com) with a shared secret, so the owner's
// one Admin login already works here; this middleware only opens the browser's CORS gate for it.
const ADMIN_ORIGIN = "https://admin.checkitforme.com";
app.use("/api/*", async (c, next) => {
  if (c.req.header("origin") !== ADMIN_ORIGIN) return next();
  c.header("Access-Control-Allow-Origin", ADMIN_ORIGIN);
  c.header("Access-Control-Allow-Credentials", "true");
  c.header("Vary", "Origin");
  if (c.req.method === "OPTIONS") {
    c.header("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    c.header("Access-Control-Allow-Headers", "content-type,x-admin-token");
    c.header("Access-Control-Max-Age", "86400");
    return c.body(null, 204);
  }
  return next();
});
// /api/* = the operator dashboard. Admin auth only: the x-admin-token header (server-to-server) or the
// signed `admin_session` cookie minted by /admin-login. (Consumer endpoints live under /pub + /app.)
app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/health") return next();
  // The brain endpoint is called by the VOICE PROVIDER'S servers mid-conversation, not by a person
  // in Admin, so an admin token is the wrong key for it and would have to be shipped to a third
  // party to work. It carries its own shared secret instead, checked inside the route, and with that
  // secret unset the route is closed rather than open. Exempted here for the same reason /api/health
  // is: it is not part of the operator dashboard.
  if (c.req.path === "/api/brain/chat/completions") return next();
  if (config.adminToken && c.req.header("x-admin-token") === config.adminToken) return next();
  const adminCookie = getCookie(c, "admin_session");
  if (adminCookie) { const s = await verifySession(adminCookie); if (s && s.id === "admin") return next(); }
  if (!config.adminToken) return next(); // no admin token configured → open (dev only)
  return c.json({ error: "unauthorized" }, 401);
});
// /pub/* per-IP ceiling (data-exposure lockdown): generous enough that a real session — live-call
// polling every ~1s plus browsing — never feels it, but a scraper rapidly walking the public read
// surface hits the wall fast. Tighter, surface-specific limits live on the endpoints themselves.
app.use("/pub/*", async (c, next) => {
  const rl = rlCheck("pubRead", clientIp(c.req.raw.headers), LIMITS.pubRead);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  return next();
});

// ---- Every route, by area. src/routes/README.md says which file holds what. ----
registerSigningIn(app);
registerWebsitePages(app);
registerTwilioAndElevenlabs(app);
registerAdminChains(app);
registerAdminChecks(app);
registerAdminSettings(app);
registerMyAccount(app);
registerStoreLogos(app);
registerStoreData(app);
registerCommunity(app);
registerAdminStores(app);
registerRunningACheck(app);
registerManageZones(app);
registerSubscriptionMgmt(app);
registerAdminMoney(app);
registerStripe(app);
registerAdminRestock(app);
registerAdminUsers(app);
registerSupportChat(app);
registerInStockAlerts(app);
registerAdminVoice(app);

// ---- Charlie barge-in: when a store-mode Delta call gets an off-script question it can't handle with
// a clip, hand the SAME live call to the paid agent. We open a bridge room with the store's normal
// restock vars, connect immediately (a human is already talking), point the call_results row at the new
// EL conversation so ingestPending finalizes the verdict, and return <Connect><Stream> TwiML. Any error
// returns null so the D-lane falls back to a graceful escalate-clip wrap (fail-safe, never a dead call).
setDeltaBarge(async (s, _speech) => {
  const chk = s.check;
  if (!chk) return null;
  try {
    const v = await buildRestockVars(chk.retailerId, chk.categoryId, undefined, [], undefined, chk.finderUserId ?? null);
    if (!v || !v.retailer?.phone) return null;
    const pol = await getPolicy();
    // Reuse the D-lane listen room ("delta:<session>") so a consumer watching the call live keeps
    // getting transcript lines + audio when Charlie takes over mid-call.
    const room = "delta:" + s.id;
    setBridgeContext(room, {
      agentId: config.voice.agentId,
      dynamicVars: v.dynamicVars,
      connectOnHuman: false, // the clerk is already on the line — open the agent right away
      holdMaxSeconds: pol.bail.holdMaxSeconds,
      voiceId: v.voiceId || undefined,
      voiceTuning: v.voiceTuning || undefined,
      onConversationId: (convId) => {
        // Charlie's EL conversation now owns the verdict: point the existing row at it so ingestPending finalizes.
        db.update(callResults).set({ providerCallId: convId, status: "in_progress" })
          .where(eq(callResults.id, chk.callId)).catch((e) => console.error("[delta] barge row link", e));
      },
    });
    const host = config.staging.on ? STAGING_HOST : RAILWAY_HOST;
    // Stop the D-lane audio fork first — the bridge fans out the same audio to the same listen room,
    // so leaving the fork running would double every frame in the listener's ear.
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Stop><Stream name="deltatap"/></Stop><Connect><Stream url="wss://${host}/bridge?room=${room}"><Parameter name="room" value="${room}" /></Stream></Connect></Response>`;
  } catch (e) {
    console.error("[delta] barge setup failed", e);
    return null;
  }
});

// ---- Health ----
app.get("/api/health", (c) => c.json({ ok: true, commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null }));
// Chain logo registry: drop transparent PNGs into public/logos/chains/<slug>.png (slug = chain
// name lowercased, non-alphanumerics → "-"). Stores pick them up automatically on every surface.
import { readdirSync } from "node:fs";
import { cookieRootDomain, peekOk, refreshChainLogoDb } from "./routes/shared-helpers";
import { renderComingSoon } from "./routes/website-pages";
import { placeLive } from "./routes/running-a-check";
import { register as registerSigningIn } from "./routes/signing-in";
import { register as registerWebsitePages } from "./routes/website-pages";
import { register as registerTwilioAndElevenlabs } from "./routes/twilio-and-elevenlabs";
import { register as registerAdminChains } from "./routes/admin-chains";
import { register as registerAdminChecks } from "./routes/admin-checks";
import { register as registerAdminSettings } from "./routes/admin-settings";
import { register as registerMyAccount } from "./routes/my-account";
import { register as registerStoreLogos } from "./routes/store-logos";
import { register as registerStoreData } from "./routes/store-data";
import { register as registerCommunity } from "./routes/community";
import { register as registerAdminStores } from "./routes/admin-stores";
import { register as registerRunningACheck } from "./routes/running-a-check";
import { register as registerManageZones } from "./routes/manage-zones";
import { register as registerSubscriptionMgmt } from "./routes/subscription-mgmt";
import { register as registerAdminMoney } from "./routes/admin-money";
import { register as registerStripe } from "./routes/stripe";
import { register as registerAdminRestock } from "./routes/admin-restock";
import { register as registerAdminUsers } from "./routes/admin-users";
import { register as registerSupportChat } from "./routes/support-chat";
import { register as registerInStockAlerts } from "./routes/in-stock-alerts";
import { register as registerAdminVoice } from "./routes/admin-voice";

const httpServer = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Voice Caller on http://localhost:${info.port}`);
});

// If an overnight trainer batch was mid-run when this process last died (e.g. a redeploy), resume the
// remaining chains. No-op when no batch flag is set. Best-effort, fire-and-forget.
void resumeBatchIfFlagged();

// BRAIN SYNC (owner 07-16/17: "why do things keep reverting?"). The agent's system prompt is a stored
// copy inside ElevenLabs — a code deploy alone never reaches it, so prompt fixes silently didn't ship
// three times this week. Every boot now pushes the canonical prompt (prompts.ts) to this env's agent:
// deploy the code = the talking agent runs it, staging and prod alike. Best-effort; a failed push
// logs loudly but never blocks serving.
applyVoiceTuning({ pushPrompt: true })
  .then(() => console.log("[boot] agent brain synced to the canonical prompt"))
  .catch((e) => console.error("[boot] AGENT BRAIN SYNC FAILED — the live agent may be running an OLD prompt:", String(e).slice(0, 200)));

// Keep-warm: a tiny periodic query so the DB connection doesn't go cold between visits — kills the
// "first open is slow" cold start. Cheap (one row), every 4 minutes.
setInterval(() => {
  void (async () => { try { await db.select({ n: sql<number>`1` }).from(retailers).limit(1); } catch { /* keep-warm best-effort */ } })();
}, 4 * 60 * 1000);

// ---- Live audio relay: Twilio media stream -> in-memory rooms -> browser listeners ----
// Nothing is persisted: μ-law frames are fanned out to listeners and dropped.
const rooms = new Map<string, Set<WebSocket>>();
const addListener = (room: string, ws: WebSocket) => {
  let set = rooms.get(room); if (!set) { set = new Set(); rooms.set(room, set); }
  set.add(ws);
  try { ws.send(JSON.stringify({ hello: true })); } catch { /* diag: prove server->client frames reach the listener through the proxy */ }
  bridgeLog(`listener JOINED room=${room.slice(0, 8)} listeners=${set.size}`);
  ws.on("close", () => { set!.delete(ws); bridgeLog(`listener LEFT room=${room.slice(0, 8)} listeners=${set!.size}`); if (set!.size === 0) rooms.delete(room); });
};
const fanout = (room: string, payloadB64: string, track: string) => {
  const set = rooms.get(room); if (!set) return;
  const msg = JSON.stringify({ audio: payloadB64, track });
  for (const ws of set) if (ws.readyState === 1) ws.send(msg);
};
// Real-time transcript lines from the agent bridge → browser listeners, so the chat bubbles populate
// AS the call happens (ElevenLabs only returns the full transcript post-call).
// ONE SENTENCE REACHES THE PAGE ONCE (08-01 audit, open fault 4): the relay had no memory at all, so
// an echoed or replayed line always printed again however carefully it was recorded. Same fuzzy rule
// as the record's own dedupe (normSaid), last few lines within ten seconds, per room, every lane.
const relaySeen = new Map<string, Array<{ k: string; at: number }>>();
const relayLine = (room: string, role: string, text: string) => {
  const set = rooms.get(room);
  bridgeLog(`relayLine ${role}: ${String(text).slice(0, 32)} listeners=${set ? set.size : 0}`); // diagnose live-transcript delivery
  const rk = `${role}:${normSaid(String(text))}`;
  const seen = relaySeen.get(room) ?? [];
  const nowMs = Date.now();
  if (seen.some((s) => s.k === rk && nowMs - s.at < 10_000)) { bridgeLog(`relayLine dropped a duplicate ${role} line`); return; }
  seen.push({ k: rk, at: nowMs });
  if (seen.length > 6) seen.shift();
  relaySeen.set(room, seen);
  if (!set) return;
  const msg = JSON.stringify({ line: { role, text } });
  for (const ws of set) if (ws.readyState === 1) ws.send(msg);
};
// Tell browser listeners the moment the bridge tears down (agent/clerk hung up) so the UI flips to
// the result instantly instead of waiting on the next poll + ElevenLabs status lag.
const relayEnd = (room: string) => {
  relaySeen.delete(room); // the check is over — its relay memory goes with it
  const set = rooms.get(room);
  bridgeLog(`relayEnd room=${room.slice(0, 8)} listeners=${set ? set.size : 0}`); // diagnose hang-up→flip
  if (!set) return;
  const msg = JSON.stringify({ ended: true });
  for (const ws of set) if (ws.readyState === 1) ws.send(msg);
};
// D-lane live view: stream every Delta turn + the hang-up into the same listen room the browser
// watches ("delta:<session>"), so a D-lane check streams like an EL call. Registered here (not in
// the engine) so tapedeck stays free of WebSocket imports.
setDeltaRelay(
  (s, role, text) => relayLine("delta:" + s.id, role, text),
  (s) => relayEnd("delta:" + s.id),
);
const wssTwilio = new WebSocketServer({ noServer: true });
const wssListen = new WebSocketServer({ noServer: true });
const wssBridge = new WebSocketServer({ noServer: true });

// Rooms whose REAL bridge socket is up. The pickup fork (/twilio-media) keeps streaming for the
// whole call, so once the bridge owns the room's audio the fork must go quiet, or every listener
// hears the store twice (two jitter buffers a beat apart).
// Live STAGE events from the bridge (the ladder step the page shows). The bridge is the only thing
// that hears the desk ringing after a transfer — that phase happens before ElevenLabs ever joins, so
// it can never come from the transcript. Pushing it live keeps the log honest (owner 07-24).
const relayStage = (room: string, n: number, atSec: number) => {
  const set = rooms.get(room);
  bridgeLog(`relayStage ${n} at ${atSec}s listeners=${set ? set.size : 0}`);
  if (!set) return;
  const msg = JSON.stringify({ stage: { n, at: atSec } });
  for (const ws of set) if (ws.readyState === 1) ws.send(msg);
};
const bridgeLiveRooms = new Set<string>();
// Full agent bridge: Twilio call audio <-> ElevenLabs ConvAI WS, forked to browser listeners.
wssBridge.on("connection", (ws: WebSocket, _req: unknown, room: string) => {
  if (room) { bridgeLiveRooms.add(room); ws.on("close", () => bridgeLiveRooms.delete(room)); }
  handleTwilioBridge(ws, room, fanout, relayLine, relayEnd, relayStage); // fanout(audio) + relayLine(live transcript) + relayEnd(call-over) + relayStage(ladder step) — bridge passes its resolved room
});
wssListen.on("connection", (ws: WebSocket, _req: unknown, room: string) => { if (room) addListener(room, ws); else bridgeLog("listen socket connected with NO room — audio cannot be routed"); });
wssTwilio.on("connection", (ws: WebSocket, _req: unknown, qRoom: string) => {
  let room = qRoom || "";
  ws.on("message", (data: Buffer) => {
    let m: { event?: string; start?: { customParameters?: { room?: string }; streamSid?: string }; media?: { payload?: string; track?: string } };
    try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.event === "start") room = m.start?.customParameters?.room || room || m.start?.streamSid || "";
    else if (m.event === "media" && m.media?.payload && room) {
      // LISTENING NAV: this fork is the ONLY audio we have while the phone menu plays (the agent
      // bridge doesn't exist yet), so it feeds the prompt detector that decides when each mapped
      // step fires. Free — it is the same fork live-listen already runs. Must come before the
      // bridgeLiveRooms gate, which only silences the LISTENER fanout, not our own ear.
      listenNavFeed(room, m.media.payload, m.media.track);
      // MAPPING CALLS listen on the SAME fork with the SAME two classes (runtime spec §1: the Ear
      // owns the whole call, dial to hangup; §10: there is exactly one of them). The room is the nav
      // session id, so only a mapping call's own frames ever reach it, and a room that is not a
      // mapping call is ignored.
      navMediaFeed(room, m.media.payload, m.media.track);
      if (!bridgeLiveRooms.has(room)) fanout(room, m.media.payload, m.media.track || "inbound");
    }
  });
  ws.on("close", () => { if (room) endListenNav(room); });
});

(httpServer as unknown as import("node:http").Server).on("upgrade", (req, socket, head) => {
  let pathname = "/", room = "";
  try { const u = new URL(req.url || "/", "http://x"); pathname = u.pathname; room = u.searchParams.get("room") || ""; } catch { /* ignore */ }
  if (pathname === "/twilio-media") wssTwilio.handleUpgrade(req, socket, head, (ws) => wssTwilio.emit("connection", ws, req, room));
  else if (pathname === "/bridge") wssBridge.handleUpgrade(req, socket, head, (ws) => wssBridge.emit("connection", ws, req, room));
  else if (pathname === "/listen") wssListen.handleUpgrade(req, socket, head, (ws) => wssListen.emit("connection", ws, req, room));
  else socket.destroy();
});

// Poll for finished calls every 8s; fire due schedules every 60s; geocode 1 store / 3s.
// Background tickers wrapped in single-leader locks (withLock): with >1 app instance only ONE runs
// each tick, so scheduled calls / charges / receipts never double-fire. No Redis (single instance) =
// runs normally. The lock TTL is a crash failsafe; withLock releases as soon as the work finishes.
setInterval(() => withLock("ingest", 30, ingestPending).catch((e) => console.error("ingest:", e)), 8_000);
setInterval(() => withLock("tick", 55, schedulerTick).catch((e) => console.error("tick:", e)), 60_000);
setInterval(() => withLock("geocode", 10, () => geocodeMissing(1)).catch((e) => console.error("geocode:", e)), 3_000);
setInterval(() => withLock("store-sync", 280, storeSyncTick).catch((e) => console.error("store-sync:", e)), 300_000); // staging→prod curated store data (inert until STORE_SYNC_URL/TOKEN set)
setInterval(() => withLock("learned-sync", 160, learnedSyncTick).catch((e) => console.error("learned-sync:", e)), 180_000); // prod→staging learned phone-nav (mirror of store-sync; inert off-staging)
setInterval(() => withLock("settings-sync", 55, settingsSyncTick).catch((e) => console.error("settings-sync:", e)), 60_000); // prod→staging owner settings mirror (staging pulls; inert elsewhere)
setInterval(() => withLock("check-queue", 2, () => drainCheckQueue(triggerCall, bridgeCheckCall, placeLive)).catch((e) => console.error("check-queue:", e)), 1_000); // waiting-screen: place queued checks as slots free (inert unless the governor is on)
setInterval(() => withLock("harvest", 110, harvestHoursTick).catch((e) => console.error("harvest:", e)), 120_000); // self-updating hours (policy-gated, off by default)
setInterval(() => withLock("cust-sched", 85, customerScheduleTick).catch((e) => console.error("cust-sched:", e)), 90_000); // subscriber auto-checks (policy-gated)
setInterval(() => withLock("gmail-receipts", 25, gmailReceiptTick).catch((e) => console.error("gmail-receipts:", e)), 30_000); // ingest kiosk receipts (policy-gated + creds)
setInterval(() => withLock("ops-watch", 55, watchdogTick).catch((e) => console.error("ops-watch:", e)), 60_000); // cross-env down detector → owner alert
setInterval(() => withLock("ops-backup", 3500, backupTick).catch((e) => console.error("ops-backup:", e)), 3_600_000); // daily encrypted DB backup → R2
refreshChainLogoDb().catch(() => {}); // DB-first chain-logo cache: initial load + refresh (no lock — read-only, idempotent)
setInterval(() => refreshChainLogoDb().catch(() => {}), 60_000);

// ---- Graceful deploy drain ----
// A deploy restart once killed the owner's live call mid-air (EL "Client disconnected: 1006",
// 2026-07-02): Railway SIGTERMs the old instance while its Twilio<->EL bridge sockets are still
// carrying audio. Now: on SIGTERM, stop when the last live bridge call ends (checked every 2s),
// hard cap 240s (under railway.json drainingSeconds). New calls land on the new instance; the old
// one just finishes what it's carrying. Registering the handler defers Node's default exit.
// ---- Last-resort crash guard (added after the 2026-07-09 outage) ----
// A Gmail IMAP socket timeout emitted an unhandled 'error' event and killed the WHOLE process —
// site, admin, and live calls. Background integrations (IMAP, webhooks, ticks) must never be able
// to take the service down: log loudly, keep serving. Truly broken state still surfaces in logs.
process.on("uncaughtException", (e) => { console.error("[FATAL-CAUGHT] uncaughtException (service kept alive):", e?.stack || String(e)); void opsAlert("crash", "uncaughtException (kept alive)", String(e?.stack || e).slice(0, 500)); });
process.on("unhandledRejection", (e) => { console.error("[FATAL-CAUGHT] unhandledRejection (service kept alive):", (e as Error)?.stack || String(e)); void opsAlert("crash", "unhandledRejection (kept alive)", String((e as Error)?.stack || e).slice(0, 500)); });

process.once("SIGTERM", () => {
  const started = Date.now();
  const n = activeBridgeCalls();
  console.log(`[drain] SIGTERM: ${n} live bridge call(s); draining before exit`);
  if (n === 0) process.exit(0);
  const t = setInterval(() => {
    const left = activeBridgeCalls();
    const waited = Math.round((Date.now() - started) / 1000);
    if (left === 0 || waited >= 240) {
      console.log(`[drain] exiting after ${waited}s (${left} call(s) left)`);
      clearInterval(t);
      process.exit(0);
    }
  }, 2000);
});
