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
  alertSends, alertSubscriptions, callResults, categories, chains, communityPosts, customerSchedules, discordChannels, kiosks, kioskReceipts, kioskReports, leads, products, retailers, schedules, scheduleTargets, statuses, storeRequests, supportConversations, supportMessages, supportTickets, waitlist, watches, zones, zoneRetailers,
} from "./db/schema";
import { answerSupport, resolveConversation, SUPPORT_MODELS, SUPPORT_CATEGORIES, type SupportCategory } from "./support/ladder";
import { submitTicket } from "./support/tickets";
import { addQa, reindexBook, searchBook, getFaq } from "./support/rag";
import { listCreditGrants } from "./support/credits";
import { config } from "./config";
import { assertProdSecurity } from "./security-checks";
import { bootstrap } from "./db/bootstrap";
import { allSettings, getSetting, setSetting } from "./db/settings";
import { importZonesData, geocodeMissing, backfillDirectChains, isDirectDefaultChain } from "./db/import-data";
import { applyPreset, applySandboxToStores, applySandboxTuning, applyVoiceTuning, backfillHours, backfillPhones, benchTestCall, bridgeCheckCall, buildRestockVars, callZone, canAffordZone, chargeCallOnce, cloneVoice, deletePreset, getCreditStatus, getLiveVoice, getSandboxTuning, getVoiceTuning, ingestPending, listPresets, listVoices, placeAdHocCall, previewStorePrompt, provider, refreshHours, resetRotation, resolveWorkflow, retailersWithStatus, reverifyStampedHours, savePreset, schedulerTick, setActiveVoice, storeOpenInfo, triggerCall, findRecentCheck, zoneQuote } from "./calls/service";
import { applyStoreSync, storeSyncTick, syncStatus, learnedSyncTick, learnedSyncStatus } from "./store-sync";
import { buildSettingsExport, settingsSyncStatus, settingsSyncTick } from "./settings-sync";
import { concurrencyStatus } from "./calls/concurrency";
import { routeCheck, ticketStatus, drainCheckQueue } from "./calls/queue";
import { openState } from "./store-hours";
import { resolveBrand, brandSwitcher, brandForPath } from "./brands";
import { simStartCall, isSimId, simLive, simResult } from "./staging-sim";
import { getPolicy, setPolicy, publicPolicy } from "./policy";
import { importStores, backfillRegions } from "./stores-import";
import { runAdminAgent, AGENT_MODELS } from "./agent/admin-agent";
import { queueTreeRelearn, TREE_MODEL } from "./calls/tree-learn";
import { placeNavCall, navInitialTwiml, navStep, navEnded, getNavSession, NAV_MODEL, confirmAskedStores, navAskAudio } from "./calls/navigator";
import { startMapper, stopMapper, mapperState } from "./calls/mapper";
import { tapedeckCall, tapedeckTwiml, tapedeckStep, tapedeckEnded, tdClip, tdSession, tdTranscript, setDeltaBarge, setDeltaRelay } from "./calls/tapedeck";
import { startBatch, batchStatus, stopBatch, resumeBatchIfFlagged } from "./calls/trainer-batch";
import { isDirect, recipeToTreeText, recipeToDtmf, recipeAnswerPath, connectAtSecFor, chainDialable, type Recipe } from "./calls/recipe";
import { llm, heli } from "./llm";
import { opsAlert, watchdogTick, watchdogState, backupTick, backupNow, backupState } from "./ops-watch";
import { harvestHoursTick } from "./hours-harvest";
import { createSchedule, listSchedulesDetailed, deleteSchedule, customerScheduleTick } from "./customer-schedules";
import { cachedCategories, cachedChains, cachedRetailers, categoryLabelMap, retailerMap, invalidateRefCache } from "./refcache";
import { haversineMi, bboxAround } from "./geo";
import { ingestSignals, recentStockNear, latestForRetailer } from "./stock/signals";
import { classifyVerdict, reconcile, productDetailLabel } from "./voice/verdict";
import { seedStockCheckIntel } from "./stock/intel";
import { seedSellMethods } from "./stock/sellmethods";
import { r2Config, presignPut, photoKey } from "./r2";
import { check as rlCheck, clientIp, LIMITS } from "./ratelimit";
import { isGmailConfigured, gmailReceiptTick, debugRecentInbox } from "./gmail-receipts";
import { rankBets } from "./best-bet";
import { referralStatus, claimReferral } from "./referrals";
import { sendAlert, sendAnonEmail, sendTestAlert, sendOwnerInStockEmail, sendConfirmEmail, checkEmailToken, alertSubscribe, myAlerts, alertMute, getAlertTemplatesPublic, setAlertTemplates, monthKey, fanoutRestock } from "./alerts";
import { ownerAlertPrefs } from "./calls/notify";

/** 409-style gate: returns a closed payload if we KNOW the store is closed right now, else null. */
async function closedGate(retailerId: number): Promise<{ error: string; label: string } | null> {
  const os = await storeOpenInfo(retailerId);
  return os && os.known && !os.open ? { error: "store_closed", label: os.label } : null;
}

/** Subscribers' finds stay private forever (a membership perk, never an upsell). */
async function isFinderPrivate(acct: { subscription?: string | null } | null | undefined): Promise<boolean> {
  const pol = await getPolicy();
  return !!(acct && acct.subscription === "active" && pol.finds.subscriberPrivateAlways);
}

/** Optional-auth comp check for public endpoints: anonymous visitors return false with no token
 *  verification overhead; a signed-in master/comp account is recognized so the owner-only demo store
 *  ("Fun") surfaces for the owner only. */
async function requesterIsComp(authHeader?: string): Promise<boolean> {
  if (!authHeader) return false;
  try {
    const u = await verifyClerkToken(authHeader);
    if (!u) return false;
    const a = await getAccount(u.id, u.email);
    return isCompAccount(a) || isComp(u.email || undefined);
  } catch { return false; }
}

/** Premium feature map for the requester (empty when signed-out / PAYG). `any_town` = search past the
 *  free radius cap (Check Plus). Comp/owner → all features on. */
async function requesterFeatures(authHeader?: string): Promise<Record<string, boolean>> {
  if (!authHeader) return {};
  try {
    const u = await verifyClerkToken(authHeader);
    if (!u) return {};
    const a = await getAccount(u.id, u.email);
    const comp = isCompAccount(a) || isComp(u.email || undefined);
    return await accountFeatures(a?.subTier, comp);
  } catch { return {}; }
}

/** Is this an owner-only demo store ("Fun")? Used to 404 it for everyone but the master account. */
async function isOwnerOnlyStore(retailerId: number): Promise<boolean> {
  const r = (await db.select({ ownerOnly: retailers.ownerOnly }).from(retailers).where(eq(retailers.id, retailerId)))[0];
  return !!r?.ownerOnly;
}
/** Retailer IDs of owner-only stores (the "Fun" rehearsal store). Excluded from every admin report/
 *  metric that aggregates call_results — exactly like they're hidden from /pub/finds + the store lists. */
async function ownerOnlyRetailerIds(): Promise<Set<number>> {
  const rows = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.ownerOnly, true));
  return new Set(rows.map((r) => r.id));
}
// retailerId -> learned time-to-human (the chain's LOCKED nav recipe seconds): how long we spend in the
// phone tree / on hold before a person picks up. Subtracting this from a call's connected time yields
// the REAL human-talk time (the old code subtracted the IVR's first-words timestamp ~2s, so "talk" was
// the whole call). null when the chain has no locked recipe → caller falls back to the per-call nav.
async function retailerTimeToHuman(): Promise<Map<number, number>> {
  const [rets, chRows] = await Promise.all([
    db.select({ id: retailers.id, chainId: retailers.chainId }).from(retailers),
    db.select({ id: chains.id, navSeconds: chains.navSeconds, navStatus: chains.navStatus }).from(chains),
  ]);
  const ch = new Map(chRows.map((c) => [c.id, c]));
  const m = new Map<number, number>();
  for (const r of rets) {
    const c = r.chainId != null ? ch.get(r.chainId) : null;
    if (c && c.navStatus === "locked" && c.navSeconds != null) m.set(r.id, c.navSeconds);
  }
  return m;
}
// "Start fresh" cutoff (unix secs): real-call stats only count calls placed at/after it. 0 = count all.
async function getStatsSince(): Promise<number> {
  const v = await getSetting("stats_since");
  const n = v ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}
import { getAccount, getAccountByPhone, phoneAccountExists, chargeOneCredit, createCheckout, createCheckoutIntent, verifyStripeSig, handleStripeEvent, isComp, isCompAccount, grantCredits, spendableCredits, SUB, PACKS } from "./billing";
import { getPlans, savePlans, publishPlansToStripe, plansSyncView, publicPlans, normalizePlans, accountFeatures } from "./plans";
import { e164 as authE164, signSession, verifySession, startPhoneVerify, checkPhoneVerify, startCallerIdVerify, isCallerIdVerified } from "./auth";
import { brevoUpsertContact } from "./brevo";
import { accounts } from "./db/schema";
import { settings as settingsTbl } from "./db/schema";
import { handleTwilioBridge, setBridgeContext, bridgeConversationId, bridgeDebug, bridgeLog, takeBridgeDtmf, takeBridgeSay, activeBridgeCalls } from "./voice/bridge";
import { placeBridgeCall, attachListenFork, roomCallSids, roomCallProgress, roomFinalizers, RAILWAY_HOST, STAGING_HOST } from "./voice/bridge-place";
import { isCallingPaused, setCallingPaused, spendTodayCents, withLock } from "./redis";

assertProdSecurity(); // refuse to boot in prod with an open admin / forgeable sessions
await bootstrap(); // apply migrations + seed catalog if empty

const here = dirname(fileURLToPath(import.meta.url));
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

// ---- Peek door ----
// A secret ?peek=<PEEK_CODE> link (code lives in Railway) skips the coming-soon splash for THAT browser
// only: matching the code sets a root-domain cookie (shared across every brand subdomain), so the owner
// can browse prod as a real customer while the public still sees the splash. peekOk() = code present in
// the query (instant bypass on the magic link) OR the cookie already set. Rotate PEEK_CODE to revoke all.
const peekOk = (peekQ?: string, peekCookie?: string): boolean =>
  !!config.peekCode && (peekQ === config.peekCode || peekCookie === config.peekCode);
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

// ---- Auth — phone/SMS sessions only (Clerk fully removed). ----
// Owner phones that double as admin login: signing into the consumer site with one of these ALSO
// authenticates the operator dashboard (which runs on a sibling subdomain). Set ADMIN_PHONES on
// Railway, comma-separated, e.g. "+13106662331,+14243126356".
const ADMIN_PHONES = (process.env.ADMIN_PHONES || "").split(",").map((s) => authE164(s.trim())).filter(Boolean);
const isAdminPhone = (e: string) => !!e && ADMIN_PHONES.includes(e);
// Cross-subdomain admin SSO: a cookie set on the registrable root is shared by every subdomain under
// it (consumer site + admin). Match it to the request host's root or the browser drops the cookie.
function cookieRootDomain(host: string | undefined): string | undefined {
  const h = (host || "").split(":")[0].toLowerCase();
  if (/localhost|127\.0\.0\.1/.test(h)) return undefined;   // dev → host-only cookie
  if (h.endsWith("fungibles.com")) return ".fungibles.com"; // direct fungibles hit (no worker)
  // Behind the Cloudflare worker the origin Host is the Railway service domain, so we can't read the
  // real host. The browser validates the Domain attr against ITS url (the *.checkitforme.com the user
  // is actually on), so default to the canonical admin root — this is what makes site→admin SSO work.
  return ".checkitforme.com";
}

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

// Clerk-free admin login: visit /admin-login?token=ADMIN_TOKEN once → sets a signed httpOnly
// session cookie the /api/* gate accepts. No Clerk. The existing app.html then loads unchanged.
app.get("/admin-login", async (c) => {
  const token = c.req.query("token") || "";
  if (!config.adminToken || token !== config.adminToken) return c.text("unauthorized", 401);
  const jwt = await signSession("admin", "");
  const domain = cookieRootDomain(c.req.header("host"));
  setCookie(c, "admin_session", jwt, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 30, ...(domain ? { domain } : {}) });
  return c.redirect("/");
});
app.get("/admin-logout", (c) => {
  setCookie(c, "admin_session", "", { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 0 });
  return c.redirect("/");
});

// Verify a signed-in customer from their phone-session token (our own JWT). `id` is the account key
// (sub = "phone:+E164"); `phone` is carried in the token. Name kept for the many call-sites.
async function verifyClerkToken(authHeader: string | undefined): Promise<{ id: string; email?: string; phone?: string } | null> {
  const tok = (authHeader || "").startsWith("Bearer ") ? (authHeader as string).slice(7) : "";
  if (!tok) return null;
  const s = await verifySession(tok);
  return s ? { id: s.id, phone: s.phone } : null;
}

// ---- Pages ----
// Operator dashboard at caller.* ; consumer "pay-per-check" app at runner.* (or /r preview).
// Clerk fully removed — no __CLERK_* placeholders to inject; auth is phone-session (consumer) and the
// admin_session cookie (operator dashboard).
const page = (file: string) => readFileSync(join(here, `../public/${file}`), "utf8");
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- Admin UI decoupled ship path (owner 2026-07-15) ----
// THE Admin (admin.checkitforme.com) is served by THIS prod service (the DB is SQLite on this
// service's volume — no second service can read it), but its UI no longer waits on a full
// staging→main promote: scripts/ship-admin.sh POSTs public/app.html straight here and the file
// lands on the persistent volume, served immediately. The repo copy bundled at the last promote
// stays the FALLBACK — a missing/corrupt override can only ever degrade to "older but working".
// Shared server code still ships ONLY via the normal promote train; this moves the admin UI alone.
const ADMIN_UI_DIR = join(process.env.RAILWAY_VOLUME_MOUNT_PATH || ".", "admin-ui");
const ADMIN_UI_LIVE = join(ADMIN_UI_DIR, "app.html");
const ADMIN_UI_META = join(ADMIN_UI_DIR, "meta.json");
const ADMIN_UI_KEEP = 5; // archived previous versions for rollback
/** The admin shell: volume override if present + sane, else the repo copy from the last promote. */
function adminUiHtml(): string {
  try {
    const html = readFileSync(ADMIN_UI_LIVE, "utf8");
    if (html.includes("</html>") && html.includes("grpnav")) return html; // sanity: complete + really the admin shell
  } catch { /* no override staged — bundled copy serves */ }
  return page("app.html");
}

// ---- PostHog (product analytics) — activates from Railway vars alone (POSTHOG_KEY [+ POSTHOG_HOST]);
// no key baked in the repo, key absent = no-op. Injected server-side before </body> on every served
// page (all consumer brand domains + admin) so one place covers every page; the dated `defaults`
// turns on history-change pageviews, which the SPA needs for per-view tracking.
const PH_SNIPPET = process.env.POSTHOG_KEY
  ? `<script>!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(process.env.POSTHOG_KEY)},{api_host:${JSON.stringify(process.env.POSTHOG_HOST || "https://us.i.posthog.com")},defaults:"2025-05-24"})</script>`
  : "";
const withAnalytics = (html: string) => (PH_SNIPPET && html.includes("</body>")) ? html.replace("</body>", `${PH_SNIPPET}</body>`) : html;

/** FAQ + HowTo structured data per vertical — Google rich-result eligibility for the PPC/SEO push. */
function seoGraph(brand: ReturnType<typeof resolveBrand>, plainName: string) {
  const prod = brand.category || "trading cards & collectibles";
  const qa = (q: string, a: string) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } });
  return [
    { "@type": "FAQPage", mainEntity: [
      qa(`How does ${plainName} work?`, `Pick a store near you and ${plainName} calls it by phone, asks a real associate whether ${prod} is in stock, and texts you the answer with proof — usually in about two minutes.`),
      qa(`Is it accurate?`, `Yes. Instead of trusting store websites and apps that are wrong roughly 40% of the time, ${plainName} calls the store so a real person checks the shelf. You get the transcript as proof.`),
      qa(`How much does ${plainName} cost?`, `Your first store check is free, with no card required. After that you can pay per call or join the membership for a lower per-call rate and premium features.`),
      qa(`Which stores can you call?`, `Big-box chains and local retailers near you — including Target, Walmart, GameStop, pharmacies, and hobby shops — anywhere that might stock ${prod}.`),
      qa(`Can you tell me when ${prod} is back in stock?`, `Yes. Set a free restock alert and ${plainName} notifies you the moment a call confirms ${prod} is back on the shelf.`),
    ] },
    { "@type": "HowTo", name: `How to find ${prod} in stock near you`, description: `Use ${plainName} to find ${prod} in stock at a real store near you without driving around.`, step: [
      { "@type": "HowToStep", position: 1, name: "Find stores near you", text: "Tap Find me and set your radius — we show the stores open right now." },
      { "@type": "HowToStep", position: 2, name: "We call it, live", text: `${plainName} phones the store and asks a real associate if ${prod} is in stock — you can listen in.` },
      { "@type": "HowToStep", position: 3, name: "Get the answer with proof", text: "In about two minutes you get a clear yes or no, plus the transcript of what the clerk said." },
    ] },
  ];
}

// Behind the staging/prod Cloudflare worker the origin Host header is the INTERNAL *.railway.app
// service hostname, not the domain the visitor actually used. Any absolute URL we hand a link-preview
// bot (og:image, og:url, canonical) MUST carry the public domain — iMessage/Facebook can't fetch the
// internal host, so the unfurl card renders blank (owner 07-18: shared find showed no image). Mirrors
// the og:title fix that already lived inline in renderRunner; now the single source for every render.
const publicHost = (host: string): string =>
  /railway\.app$/i.test(host) ? (config.staging.on ? "staging.checkitforme.com" : "checkitforme.com") : host.replace(/^www\./, "");

// Coming-soon splash: the ONLY public HTML while config.comingSoon is on. Check wordmark + the owner's
// launch line + the four product-type icons. Standalone (no app JS), dark on-brand, noindex.
const COMING_SOON_ICONS = ["pokemon", "onepiece", "topps", "needoh"];
function renderComingSoon(_host: string, refShare = false): string {
  const line = "Find insanely hard to get products on the shelves at retail prices.";
  // Even gated, a shared link must unfurl right: bots read these tags while humans see the splash.
  const ogImage = `https://${publicHost(_host)}/og/${refShare ? "card-refer" : "runner"}.png`;
  const ogTitle = refShare ? "We both get a free check." : "Check — coming soon";
  const og = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(ogTitle)}">`,
    `<meta property="og:description" content="${esc(line)}">`,
    `<meta property="og:image" content="${ogImage}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${ogImage}">`,
  ].join("\n");
  const icons = COMING_SOON_ICONS.map(
    (k) => `<img src="/logos/products/${k}.png" alt="" width="60" height="60" loading="eager">`
  ).join("");
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Check — coming soon</title>
${og}
<link rel="icon" type="image/png" href="/logos/brand/check-icon.png?v=3">
<link rel="apple-touch-icon" href="/logos/brand/check-icon.png?v=3">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:#0C0C12;color:#fff;font-family:Inter,-apple-system,system-ui,sans-serif;
  min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:34px;padding:40px 24px calc(40px + env(safe-area-inset-bottom));text-align:center}
.cs-logo{width:min(240px,60vw);height:auto;display:block}
.cs-line{font-size:19px;line-height:1.45;font-weight:700;letter-spacing:-.2px;
  max-width:340px;text-wrap:balance;color:#EDEDF2}
.cs-icons{display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap}
.cs-icons img{width:60px;height:60px;object-fit:contain;
  filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))}
.cs-soon{position:fixed;left:0;right:0;bottom:calc(30px + env(safe-area-inset-bottom));
  text-align:center;font-size:12px;font-weight:700;letter-spacing:.22em;
  text-transform:uppercase;color:#6E6E7A}
@media(max-width:360px){.cs-icons{gap:14px}.cs-icons img{width:52px;height:52px}}
</style></head><body>
<img class="cs-logo" src="/logos/brand/check.png?v=2" alt="Check">
<p class="cs-line">${esc(line)}</p>
<div class="cs-icons">${icons}</div>
<div class="cs-soon">Coming soon</div>
</body></html>`;
}

/** Render the consumer page branded for a vertical micro-site (resolved from the subdomain). */
function renderRunner(brand: ReturnType<typeof resolveBrand>, host: string, file = "checkit.html", tone = "", peek = false, refShare = false): string {
  void peek; // coming-soon gate now lives in the single middleware above (peek bypass handled there)
  const pub = publicHost(host); // never the internal railway host in emitted URLs (see publicHost)
  const canonical = `https://${pub}/`;
  const plainName = brand.name.replace(/<[^>]+>/g, "");
  // Invite links (?ref=CODE) unfurl with the referral card (owner 07-14) — the page itself is the app.
  const ogImage = refShare ? `https://${pub}/og/card-refer.png` : `https://${pub}/og/${brand.key}.png`;
  const head = [
    `<title>${esc(brand.title)}</title>`,
    `<meta name="description" content="${esc(brand.desc)}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta name="robots" content="index,follow,max-image-preview:large">`,
    // NB: NO theme-color meta here — and none in checkit.html either, ON PURPOSE. One theme-color
    // tints BOTH iOS Safari bars (green bottom toolbar) and overrides the per-edge page sampling we
    // rely on. The status bar takes its colour from the painted page instead: the html/body verdict
    // gradient (rv-* classes) in-page, and for ?tone= deep-links the tone-* class this renderer
    // bakes onto the served <html> tag below. Do not add a theme-color meta back.
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(plainName)}">`,
    // Apex/invite embeds (owner): the CARD IMAGE carries the headline, so the visible link title is
    // just the address — no repeated "Is it in stock?" under the image. publicHost keeps the internal
    // Railway hostname out of the visible title behind the proxy.
    `<meta property="og:title" content="${esc(brand.key === "runner" ? pub : brand.title)}">`,
    `<meta property="og:description" content="${esc(brand.desc)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${ogImage}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(brand.key === "runner" ? pub : brand.title)}">`,
    `<meta name="twitter:description" content="${esc(brand.desc)}">`,
    `<meta name="twitter:image" content="${ogImage}">`,
    `<style>:root{--accent:${brand.accent};--accent2:${brand.accent2 || brand.accent};--logo-scale:${brand.logoScale || 1}}</style>`,
    `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [
      { "@type": "WebSite", name: plainName, url: canonical, description: brand.desc },
      { "@type": "Service", name: plainName, serviceType: "Retail in-stock phone check", areaServed: "US",
        description: brand.desc, provider: { "@type": "Organization", name: plainName, url: canonical } },
      ...seoGraph(brand, plainName),
    ] })}</script>`,
  ].join("\n");
  // Status-bar tone for verdict deep-links (?call=…&tone=in|out|unk|soon): baked as a CLASS on the
  // literal served <html> tag (the html.tone-* static CSS lives in checkit.html). iOS samples the page
  // background for the status bar at FIRST PAINT — a tone applied later by script (boot/fetch timing)
  // often misses that sample and leaves the bar dark in plain Safari. Baking the class server-side makes
  // the very first paint the verdict colour with zero JS dependency; the in-page rv-* class system takes
  // over (and drops the baked class via dropBakedTone) as soon as the app renders a view.
  const toneClass = /^(in|out|unk|soon)$/.test(tone) ? ` class="tone-${tone}"` : "";
  return withAnalytics(page(file))
    .replace('<html lang="en">', `<html lang="en"${toneClass}>`)
    .replace(/__BRAND_HEAD__/g, head)
    .replace(/__BRAND_JSON__/g, JSON.stringify({ key: brand.key, name: brand.name, category: brand.category, accent: brand.accent, accent2: brand.accent2 || brand.accent, logoUrl: brand.logoUrl || "", emoji: brand.emoji }))
    .replace(/__BRAND_LOGO__/g, brand.logo || `${brand.emoji} ${brand.name}`)
    .replace(/__BRAND_ART__/g, brand.logoUrl ? `<img src="${brand.logoUrl}" alt="${esc(brand.short)}">` : (brand.art || ""))
    .replace(/__BRAND_SWITCHER__/g, JSON.stringify({ current: brand.key, list: brandSwitcher() }))
    .replace(/__BRAND_HEADLINE__/g, brand.headline)
    .replace(/__BRAND_SUB__/g, brand.sub);
}

// ---- Share landing: a find-specific page that unfurls richly on socials and converts the visitor.
// Bots read the dynamic OG title/description (brand image stays static = reliable on every platform);
// humans see a styled card + a CTA back into the app. Pure string render — no deps, cache-friendly.
function renderShare(brand: ReturnType<typeof resolveBrand>, host: string, q: Record<string, string>, peek = false): string {
  void peek; // coming-soon gate now lives in the single middleware above (peek bypass handled there)
  // Bilingual: the sharer's app appends &lang=; a cold recipient with no lang param falls back to their
  // browser's Accept-Language. Friend-to-friend is almost always the same language, so lang wins.
  const lang = q.lang === "es" || (!q.lang && /^\s*es/i.test(q.al || "")) ? "es" : "en";
  const L = (en: string, es: string) => (lang === "es" ? es : en);
  const zone = q.k === "zone"; // zone-sweep share: "{i} of {n} stores had it"
  const inStock = (q.v || "in") === "in";
  const store = (q.store || "").slice(0, 80);
  const cat = (q.cat || brand.category || "cards").slice(0, 60);
  const plainName = brand.name.replace(/<[^>]+>/g, "");
  const pub = publicHost(host); // never the internal railway host in emitted URLs (see publicHost)
  const site = `https://${pub}/`;
  const zN = Math.max(0, Number(q.n) || 0), zI = Math.max(0, Number(q.i) || 0);
  // State drives every branch. Zone with hits → "zonein"; zone with zero hits collapses to the
  // store-less watch copy (owner: "none yet, Check catches the restock").
  const state: "in" | "watch" | "zonein" = zone ? (zI > 0 ? "zonein" : "watch") : inStock ? "in" : "watch";
  const positive = state === "in" || state === "zonein";
  const showStore = state !== "zonein" && !(state === "watch" && zone) && !!store; // no single store on a zone card
  // In-stock stores for the zone logo row (owner): client passes st=<json [{l:logoUrl,n:name}]>. Cap 6.
  let zStores: Array<{ l: string; n: string }> = [];
  if (state === "zonein" && q.st) { try { const a = JSON.parse(q.st); if (Array.isArray(a)) zStores = a.slice(0, 6).map((s) => ({ l: String(s.l || ""), n: String(s.n || "") })); } catch { /* ignore malformed */ } }
  const mono = (n: string) => (n.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "?").toUpperCase();

  // Unfurl cards (owner 07-14): baked images with the brandmark + copy. Zone → zone card; in-stock →
  // per-brand find card; watch → brand hero card.
  const ogImage = state === "zonein" ? `https://${pub}/og/card-zone.png` : state === "in" ? `https://${pub}/og/card-find-${brand.key}.png` : `https://${pub}/og/${brand.key}.png`;

  const catHl = `<span class="hl">${esc(cat)}</span>`;
  // Badge icon: comp P6 in-stock RESULT pill uses a glowing dot; watch keeps the bell.
  const dot = `<span class="gdot"></span>`;
  const bell = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;
  const badgeIcon = positive ? dot : bell;
  const badge = state === "in" ? L("IN STOCK", "EN STOCK")
    : state === "zonein" ? L(`${zI} OF ${zN} HAD IT`, `${zI} DE ${zN} LO TENÍAN`)
    : L("ON WATCH", "EN SEGUIMIENTO");
  const headline = state === "in" ? catHl
    : state === "zonein" ? L(`${catHl} is on shelves nearby`, `${catHl} está en estantes cerca`)
    : L(`We're tracking ${catHl}`, `Estamos rastreando ${catHl}`);
  const zoneMsg = L(`Check called ${zN} stores at once. ${esc(cat)} is on the shelf at these:`,
                    `Check llamó a ${zN} tiendas a la vez. ${esc(cat)} está en el estante en estas:`);
  const whatIsIt = state === "in"
    ? L("Your friend used Check AI to find viral products on the shelves at retail prices.", "Tu amigo usó Check AI para encontrar productos virales en los estantes a precio de tienda.")
    : state === "zonein" ? "" // the zone message + logo row carry it
    : zone ? L("None yet. Check catches the restock.", "Ninguna aún. Check atrapa la reposición.")
    : L("Not in yet. Check catches the restock.", "Aún no. Check atrapa la reposición.");
  const hook = L("First one's on us!", "¡La primera va por nuestra cuenta!");
  const button = L("YOUR TURN", "TE TOCA");
  // The full store name prints as "@ Name" under the headline, right-aligned to the headline's edge.
  const atName = showStore && store ? `<div class="satname">@ ${esc(store)}</div>` : "";

  const green = "#4ADE80", amber = "#F59E0B";
  const accent = positive ? green : amber;
  const brandColor = brand.accent || green; // the product's own color (Pokémon yellow, One Piece red…)
  const title = state === "in" ? L(`${cat} is in stock at ${store}`, `${cat} está en stock en ${store}`)
    : state === "zonein" ? L(`${cat} is in stock nearby`, `${cat} está en stock cerca`)
    : L(`We're tracking ${cat}`, `Estamos rastreando ${cat}`);
  const desc = whatIsIt || L(`Check called ${zN} stores at once. ${cat} is on the shelf nearby.`,
                             `Check llamó a ${zN} tiendas a la vez. ${cat} está en el estante cerca.`);
  const shareUrl = `https://${pub}/s?${new URLSearchParams({ ...(store ? { store } : {}), cat, v: inStock ? "in" : "out", ...(zone ? { k: "zone", n: String(zN), i: String(zI) } : {}), lang }).toString()}`;
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="robots" content="index,follow,max-image-preview:large">`,
    `<meta name="theme-color" content="#1D1D22">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(plainName)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(shareUrl)}">`,
    `<meta property="og:image" content="${ogImage}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${ogImage}">`,
  ].join("\n");
  const logoRow = state === "zonein" && zStores.length
    ? `<div class="logos">${zStores.map((s) => s.l
        ? `<div class="ltile"><img src="${esc(s.l)}" alt="" onerror="this.style.display='none';this.parentNode.classList.add('lmono');this.parentNode.textContent='${esc(mono(s.n))}'"></div>`
        : `<span class="lmono">${esc(mono(s.n))}</span>`).join("")}</div>`
    : "";
  // Rebuilt 2026-07-18 element-for-element from the P6 IN-STOCK comp (docs/design/comps/
  // WEBSITE_COMPS.dc.html, ~L448-471): green-wash card (r40), glow-dot IN STOCK pill, 56px store
  // hero tile, and the "Check another store" capsule CTA with the ckShine sweep + ckGlow dot.
  // The CP / CPEND markers fence this <style> as a CONSUMER PAGE: qa-design holds everything inside
  // to the STYLE_GUIDE token set + Inter-only, same as the homepage. ANY new consumer landing/share
  // page's <style> MUST be fenced the same way so it can't ship off-system.
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${head}
<link rel="icon" type="image/png" href="/logos/brand/check-icon.png?v=3">
<link rel="preload" href="/fonts/inter-var-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>/*CP*/
  @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(/fonts/inter-var-latin.woff2) format('woff2')}
  *{box-sizing:border-box;margin:0} :root{--green:${green};--amber:${amber}}
  body{background:#1D1D22;color:#fff;font-family:Inter,-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;min-height:100dvh;display:grid;place-items:center;padding:24px}
  .wrap{max-width:430px;width:100%;text-align:center}
  .card{position:relative;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:40px;padding:40px 27px 34px;box-shadow:0 24px 48px -12px rgba(0,0,0,.7)}
  .card.pos{background:linear-gradient(180deg,#266440 0%,#20202A 46%)}
  .card.neg{background:#26262B}
  .cwmwrap{position:absolute;inset:0;border-radius:40px;overflow:hidden;z-index:0;pointer-events:none}
  .cwm{position:absolute;top:-40px;right:-44px;width:180px;height:180px;opacity:.16}
  .cbody{position:relative;z-index:1}
  .cact{margin-top:38px}
  .chead{margin-bottom:30px}
  .badge{display:inline-flex;align-items:center;gap:7px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.13em;color:${accent};background:rgba(255,255,255,.06);border:1px solid ${accent}66;padding:6px 12px;border-radius:999px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
  .gdot{width:8px;height:8px;border-radius:50%;background:${accent};box-shadow:0 0 8px ${accent};animation:ckGlow 2s ease-in-out infinite}
  .title{display:inline-block;max-width:100%;align-self:flex-start}
  .big{font-size:44px;font-weight:900;line-height:1;letter-spacing:-1.6px;margin:0} .big .hl{color:${brandColor}}
  .satname{display:block;text-align:right;font-size:16px;font-weight:700;letter-spacing:-.2px;color:#fff;margin-top:7px}
  .zmsg{color:rgba(255,255,255,.78);font-size:14.5px;font-weight:500;line-height:1.5;margin:6px auto 4px;max-width:330px}
  .logos{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:14px 0 6px}
  .ltile,.lmono{width:40px;height:40px;border-radius:11px;flex:0 0 auto}
  .ltile{background:#1F1F25;display:grid;place-items:center;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)} .ltile img{width:30px;height:30px;object-fit:contain}
  .lmono{background:linear-gradient(145deg,#34343D,#23232B);display:grid;place-items:center;color:#CDCDD8;font-weight:900;font-size:14px}
  .what{color:rgba(255,255,255,.82);font-size:15px;font-weight:500;line-height:1.55;margin:24px 0 0}
  .cta{display:block;text-decoration:none;border-radius:999px;padding:2.5px;background:linear-gradient(120deg,#5BEA93 0%,#19B145 55%,#0B5A2C 100%);box-shadow:0 10px 22px -12px rgba(0,0,0,.55)}
  .cin{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:9px;border-radius:999px;background:#20202A;padding:13px 22px}
  .shine{position:absolute;top:0;bottom:0;left:-45%;width:45%;background:linear-gradient(105deg,transparent 0%,rgba(140,255,185,.25) 50%,transparent 100%);animation:ckShine 2.8s ease-in-out infinite}
  .ctxt{position:relative;font-size:12.5px;font-weight:800;letter-spacing:.13em;color:#fff}
  .arw{position:relative;flex:0 0 auto}
  .foot{color:#8A8A96;font-size:12.5px;font-weight:600;margin-top:14px;text-align:center}
  @keyframes ckShine{0%{left:-45%}55%,100%{left:110%}}
  @keyframes ckGlow{0%,100%{opacity:.4}50%{opacity:1}}
  @media (prefers-reduced-motion:reduce){.shine,.gdot{animation:none}}
/*CPEND*/</style></head><body><div class="wrap">
  <div class="card ${positive ? "pos" : "neg"}">
    ${positive ? `<div class="cwmwrap"><svg class="cwm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#8CF7B4"/><path d="M6.5 12.4 L10.3 16 L17.5 8" stroke="#20693F" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>` : ""}
    <div class="cbody">
    <div class="chead"><div class="badge">${badgeIcon} ${badge}</div></div>
    <div class="title"><h1 class="big">${headline}</h1>${atName}</div>
    ${state === "zonein" ? `<div class="zmsg">${zoneMsg}</div>${logoRow}` : ""}
    ${whatIsIt ? `<div class="what">${whatIsIt}</div>` : ""}
    <div class="cact">
    <a class="cta" href="${site}"><span class="cin"><span class="shine"></span><span class="ctxt">${button}</span><svg class="arw" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></span></a>
    <div class="foot">${hook}</div>
    </div>
    </div>
  </div>
</div></body></html>`;
}
app.get("/s", (c) => {
  c.header("Cache-Control", "public, max-age=30");
  const host = (c.req.header("host") || "").toLowerCase();
  const brand = resolveBrand(host, c.req.query("brand"));
  const q = { store: c.req.query("store") || "", cat: c.req.query("cat") || "", v: c.req.query("v") || "in", k: c.req.query("k") || "", n: c.req.query("n") || "", i: c.req.query("i") || "", st: c.req.query("st") || "", slogo: c.req.query("slogo") || "", lang: c.req.query("lang") || "", al: c.req.header("accept-language") || "" };
  return c.html(renderShare(brand, host, q, peekOk(c.req.query("peek"), getCookie(c, "peek"))));
});

// Static content pages (about/contact/terms/privacy) — branded, owner-editable via policy.pages.
// (FAQ retired → the book / the messenger FAQ tab; see the /p/faq redirect below.)
const PAGE_TITLES: Record<string, string> = { about: "About", contact: "Get help", terms: "Terms of Service", privacy: "Privacy Policy" };
// Real, shipped content for the legal/info pages so none of them read "coming soon". Owner-overridable
// per brand via policy.pages (a non-empty override wins); this is the version-controlled fallback that
// serves on every brand + environment. Rendered inside .body — plain HTML (<h2>/<p>/<ul>) only.
const H2 = 'style="font-size:19px;font-weight:800;color:#e9e9f0;margin:26px 0 8px"';
const RM = "https://checkitforme.readme.io"; // the source-of-truth docs (how it works, full FAQ)
const DEFAULT_PAGES: Record<string, string> = {
  about: `<p><b>Check It For Me</b> finds out if the thing you want is actually on the shelf. By phone. So you don't drive across town for nothing.</p>
<p>You pick a store and a product. Check AI calls the store, asks a real person, and sends you the answer. Real call, straight answer. No bots pretending to be you, no camping a refresh page at midnight.</p>
<h2 ${H2}>Why we built it</h2>
<p>We're collectors. We lived the same broken hunt everyone lives: a set drops, every website says sold out in the time it takes to blink, and somewhere across town a truck just dropped a case nobody has found yet. The shelf has it. The internet has no idea.</p>
<p>So we did the one thing that actually works. We called the store. It worked every single time. The problem was never the information. It was that calling twelve stores, sitting through twelve phone trees, to ask one tiny question, is nobody's idea of a good night.</p>
<p>So we taught an AI to make that call. Wait through the hold music, work the menu, reach a real human, ask the one question that matters. Then we made it one tap. That's the whole company: the annoying part, done for you, with the receipt to prove it.</p>
<p>We only cover the stuff that truly sells out and rewards the hunt: Pokémon, One Piece, Topps NBA, and NeeDoh. And you only pay when we get you a real answer. No answer, no charge. That one is wired into the system, not printed on a poster.</p>
<h2 ${H2}>Want the deep version?</h2>
<p>How it all works, top to bottom, lives in the book: <a href="${RM}" target="_blank" rel="noopener">checkitforme.readme.io</a>.</p>`,
  contact: `<p>Two fast ways to reach a human. Tap <b>Help</b> in the footer to open the chat, or hop into our <b>Discord</b>. The support bot answers the common stuff in seconds, any time, and a person picks up the rest.</p>
<p>Want a store added? Do it right in the app. Account, then Earn, then <i>Add your store</i>. When a store you asked for goes live, your next check is on us.</p>
<p>We skip phone and email support on purpose. Low overhead is how checks stay cheap.</p>`,
  terms: `<p>By using <b>Check It For Me</b> (checkitforme.com) you're good with these terms. If not, no hard feelings. Just don't use it.</p>
<h2 ${H2}>What we do</h2>
<p>We call stores and ask if something's in stock, then tell you what they said. Answers are a snapshot. Stores get it wrong sometimes, so we can't promise the item is there, or the price, or that it'll still be there when you show up.</p>
<h2 ${H2}>Checks and payments</h2>
<p>You pay with checks, bought in packs or included in a plan. Stripe handles the card. A check is spent when it places a call. Unused checks can be refunded if you ask. Spent ones can't. Plans renew until you cancel, and you can cancel any time for the next round.</p>
<h2 ${H2}>Who can use it</h2>
<p>You need to be at least 18 and in the United States. You're responsible for the checks placed on your account.</p>
<h2 ${H2}>Play nice</h2>
<p>Don't use us to harass a store, place calls you've got no real reason for, resell the service, or break the law. We can pause accounts that abuse the service or the stores we call.</p>
<h2 ${H2}>The fine print</h2>
<p>The service is "as is." As far as the law allows, we're not on the hook for a missed item, a wrong answer, or a wasted trip. If it ever comes to it, our max liability is what you paid us in the last 30 days.</p>
<h2 ${H2}>Changes</h2>
<p>We may update these terms. Keep using the app and that's a yes. Questions? Ask us in the app chat or on Discord.</p>
<p style="margin-top:22px"><a href="/p/privacy" onclick="if(window.openPage){openPage('privacy');return false}">Privacy Policy →</a></p>`,
  privacy: `<p>Here's what <b>Check It For Me</b> (checkitforme.com) collects, why, and what you can do about it. Short version: we take only what we need to run your checks, we keep it only as long as we need it, and we never sell it.</p>
<h2 ${H2}>What we collect</h2>
<ul>
<li><b>Your cell number.</b> It's how you sign in, and we call stores on your behalf, so a verified number is required. No number, no checks.</li>
<li><b>Your checks.</b> The store, the product, the result, and the written conversation we bring back as your proof.</li>
<li><b>Rough location.</b> Only if you allow it, to show stores near you. Say no and search by ZIP instead.</li>
<li><b>Payment info.</b> Stripe handles your card. We never see the full number.</li>
<li><b>Basic usage.</b> Enough to keep the app running, fix bugs, and stop abuse.</li>
</ul>
<h2 ${H2}>How we use it</h2>
<p>To place your calls, show your history, take payment, keep the service safe, and make the answers more accurate. That is the whole list.</p>
<h2 ${H2}>Who we share it with</h2>
<p>Only the vendors that make Check work, and only so they can do their job. Our AI voice provider places and transcribes the calls. Twilio sends your login codes and alert texts, and carries the calls. Stripe processes payments. They handle your info under their own terms, on our behalf. We do not sell your personal information, and we never will.</p>
<h2 ${H2}>How long we keep it</h2>
<p>We keep your account, your checks, and their conversations until you ask us to delete them, or until we no longer need them to run the service. Delete your account and we remove your personal data, apart from the little the law requires us to hold.</p>
<h2 ${H2}>Your rights</h2>
<p>You can see your data, correct it, download a copy, or delete it. Turn off location any time in your browser. Turn off alert texts and emails from your account. Want a copy or a deletion? Ask us in the app chat or on Discord and we will take care of it.</p>
<h2 ${H2}>Kids</h2>
<p>Check is made for adults in the United States. It is not meant for children under 13, and we do not knowingly collect their information.</p>
<p style="margin-top:22px"><a href="/p/terms" onclick="if(window.openPage){openPage('terms');return false}">Terms of Service &rarr;</a></p>`,
};
// Hand-written Spanish for the footer pages (copy law 3: every string ships its Spanish). Same voice,
// no dashes, fewest words. Served whenever the app asks with ?lang=es; the owner's policy.pages
// overrides are English-only, so Spanish always comes from here.
const PAGE_TITLES_ES: Record<string, string> = { about: "Acerca de", contact: "Ayuda", terms: "Términos del servicio", privacy: "Política de privacidad" };
const DEFAULT_PAGES_ES: Record<string, string> = {
  about: `<p><b>Check It For Me</b> averigua si lo que buscas de verdad está en el estante. Por teléfono. Para que no cruces la ciudad por nada.</p>
<p>Eliges una tienda y un producto. Check AI llama a la tienda, pregunta a una persona real y te manda la respuesta. Llamada real, respuesta directa. Sin bots que se hacen pasar por ti, sin refrescar una página toda la noche.</p>
<h2 ${H2}>Por qué lo hicimos</h2>
<p>Somos coleccionistas. Vivimos la misma cacería rota que todos: sale un set, cada página dice agotado en lo que dura un parpadeo, y en algún lugar de la ciudad un camión acaba de dejar una caja que nadie ha encontrado. El estante lo tiene. El internet no tiene idea.</p>
<p>Así que hicimos lo único que funciona. Llamamos a la tienda. Funcionó siempre. El problema nunca fue la información. Era que llamar a doce tiendas, aguantar doce menús de teléfono, para hacer una sola preguntita, no es idea de nadie de una buena noche.</p>
<p>Así que le enseñamos a una IA a hacer esa llamada. Aguantar la música de espera, navegar el menú, llegar a una persona real, hacer la única pregunta que importa. Y lo hicimos de un toque. Esa es toda la empresa: la parte molesta, hecha por ti, con la prueba en mano.</p>
<p>Solo cubrimos lo que de verdad se agota y premia la cacería: Pokémon, One Piece, Topps NBA y NeeDoh. Y solo pagas cuando te conseguimos una respuesta real. Sin respuesta, sin cargo. Eso está en el sistema, no en un póster.</p>
<h2 ${H2}>¿Quieres la versión completa?</h2>
<p>Cómo funciona todo, de arriba a abajo, está en el libro: <a href="${RM}" target="_blank" rel="noopener">checkitforme.readme.io</a>.</p>`,
  contact: `<p>Dos formas rápidas de hablar con una persona. Toca <b>Ayuda</b> en el pie para abrir el chat, o entra a nuestro <b>Discord</b>. El bot de soporte responde lo común en segundos, a cualquier hora, y una persona atiende el resto.</p>
<p>¿Quieres agregar una tienda? Hazlo en la app. Cuenta, luego Gana, luego <i>Agrega tu tienda</i>. Cuando tu tienda esté disponible, tu próxima verificación va por nuestra cuenta.</p>
<p>No damos soporte por teléfono ni correo a propósito. Con gastos bajos, las verificaciones siguen baratas.</p>`,
  terms: `<p>Al usar <b>Check It For Me</b> (checkitforme.com) aceptas estos términos. Si no, no pasa nada. Solo no lo uses.</p>
<h2 ${H2}>Qué hacemos</h2>
<p>Llamamos a tiendas y preguntamos si algo está en stock, luego te contamos lo que dijeron. Las respuestas son una foto del momento. Las tiendas a veces se equivocan, así que no podemos garantizar que el artículo esté, ni el precio, ni que siga ahí cuando llegues.</p>
<h2 ${H2}>Verificaciones y pagos</h2>
<p>Pagas con verificaciones, en paquetes o incluidas en un plan. Stripe procesa la tarjeta. Una verificación se gasta cuando coloca una llamada. Las que no uses se pueden reembolsar si lo pides. Las gastadas no. Los planes se renuevan hasta que canceles, y puedes cancelar cuando quieras para el siguiente ciclo.</p>
<h2 ${H2}>Quién puede usarlo</h2>
<p>Debes tener al menos 18 años y estar en Estados Unidos. Eres responsable de las verificaciones hechas en tu cuenta.</p>
<h2 ${H2}>Juega limpio</h2>
<p>No nos uses para acosar a una tienda, hacer llamadas sin motivo real, revender el servicio o romper la ley. Podemos pausar cuentas que abusen del servicio o de las tiendas.</p>
<h2 ${H2}>La letra chica</h2>
<p>El servicio se ofrece "tal cual". Hasta donde la ley lo permite, no respondemos por un artículo perdido, una respuesta equivocada o un viaje en vano. Si llegara el caso, nuestra responsabilidad máxima es lo que nos pagaste en los últimos 30 días.</p>
<h2 ${H2}>Cambios</h2>
<p>Podemos actualizar estos términos. Si sigues usando la app, es un sí. ¿Preguntas? Escríbenos en el chat de la app o en Discord.</p>
<p style="margin-top:22px"><a href="/p/privacy" onclick="if(window.openPage){openPage('privacy');return false}">Política de privacidad →</a></p>`,
  privacy: `<p>Esto es lo que <b>Check It For Me</b> (checkitforme.com) recopila, por qué, y qué puedes hacer al respecto. Versión corta: tomamos solo lo necesario para hacer tus verificaciones, lo guardamos solo el tiempo que haga falta, y nunca lo vendemos.</p>
<h2 ${H2}>Qué recopilamos</h2>
<ul>
<li><b>Tu número de celular.</b> Es tu forma de iniciar sesión, y llamamos a tiendas en tu nombre, así que se requiere un número verificado. Sin número, no hay verificaciones.</li>
<li><b>Tus verificaciones.</b> La tienda, el producto, el resultado, y la conversación escrita que te traemos como prueba.</li>
<li><b>Ubicación aproximada.</b> Solo si la permites, para mostrarte tiendas cerca. Di que no y busca por código postal.</li>
<li><b>Datos de pago.</b> Stripe procesa tu tarjeta. Nunca vemos el número completo.</li>
<li><b>Uso básico.</b> Lo justo para que la app funcione, corregir errores y frenar abusos.</li>
</ul>
<h2 ${H2}>Cómo la usamos</h2>
<p>Para colocar tus llamadas, mostrar tu historial, cobrar, mantener el servicio seguro y hacer las respuestas más precisas. Esa es toda la lista.</p>
<h2 ${H2}>Con quién la compartimos</h2>
<p>Solo con los proveedores que hacen funcionar a Check, y solo para que hagan su trabajo. Nuestro proveedor de voz con IA coloca y transcribe las llamadas. Twilio envía tus códigos de acceso y tus textos de alerta, y transporta las llamadas. Stripe procesa los pagos. Manejan tu información bajo sus propios términos, por nosotros. No vendemos tu información personal, y nunca lo haremos.</p>
<h2 ${H2}>Cuánto tiempo la guardamos</h2>
<p>Guardamos tu cuenta, tus verificaciones y sus conversaciones hasta que pidas borrarlas, o hasta que ya no las necesitemos para el servicio. Borra tu cuenta y eliminamos tus datos personales, salvo lo poco que la ley nos obliga a conservar.</p>
<h2 ${H2}>Tus derechos</h2>
<p>Puedes ver tus datos, corregirlos, descargar una copia o borrarlos. Apaga la ubicación cuando quieras en tu navegador. Desactiva los textos y correos de alerta desde tu cuenta. ¿Quieres una copia o un borrado? Escríbenos en el chat de la app o en Discord y lo resolvemos.</p>
<h2 ${H2}>Niños</h2>
<p>Check es para adultos en Estados Unidos. No es para menores de 13 años, y no recopilamos su información a sabiendas.</p>
<p style="margin-top:22px"><a href="/p/terms" onclick="if(window.openPage){openPage('terms');return false}">Términos del servicio &rarr;</a></p>`,
};
// FAQ retired → the book (the one FAQ source of truth; the messenger FAQ tab reads it too).
// Registered before /p/:slug so it wins.
app.get("/p/faq", (c) => c.redirect(RM, 301));
app.get("/p/:slug", async (c) => {
  const slug = c.req.param("slug").toLowerCase();
  if (!(slug in PAGE_TITLES)) return c.notFound();
  c.header("Cache-Control", "public, max-age=120");
  const host = (c.req.header("host") || "").toLowerCase();
  const brand = resolveBrand(host, c.req.query("brand"));
  const pol = await getPolicy();
  const plain = brand.name.replace(/<[^>]+>/g, "");
  const es = (c.req.query("lang") || "").toLowerCase() === "es";
  const title = es ? (PAGE_TITLES_ES[slug] || PAGE_TITLES[slug]) : PAGE_TITLES[slug];
  const body = (es && DEFAULT_PAGES_ES[slug])
    || ((pol.pages as Record<string, string>)[slug] || "").trim()
    || DEFAULT_PAGES[slug]
    || `<p>This page is on the way. Check back soon.</p>`;
  // In-app sheet: the consumer page fetches the content instead of navigating away from the app.
  if (c.req.query("partial")) return c.json({ title, body });
  return c.html(`<!doctype html><html lang="${es ? "es" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(plain)}</title><meta name="robots" content="index,follow">
<style>*{box-sizing:border-box}body{margin:0;background:#0A0A0E;color:#e9e9f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.65}
.wrap{max-width:680px;margin:0 auto;padding:28px 22px 80px}a.home{color:${brand.accent};text-decoration:none;font-weight:800;font-size:15px}
h1{font-size:30px;margin:26px 0 14px}.body{color:#c2c2cf;font-size:16px}.body a{color:${brand.accent}}.muted{color:#7a7a88;font-size:13px;margin-top:40px}</style></head>
<style>.fab{position:fixed;right:18px;bottom:22px;width:58px;height:58px;border-radius:50%;background:${brand.accent};color:#06210f;border:none;display:grid;place-items:center;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.5);z-index:60;text-decoration:none}</style>
<body><div class="wrap"><a class="home" href="/">← ${esc(plain)}</a><h1>${esc(title)}</h1><div class="body">${body}</div>
<div class="muted">© ${new Date().getFullYear()} ${esc(plain)}</div></div>
<a class="fab" href="/" title="Back" aria-label="Back to ${esc(plain)}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M14.5 5L8 12l6.5 7" stroke="#06210f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
</body></html>`);
});

const rootHandler = (c: Context) => {
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  const host = (c.req.header("host") || "").toLowerCase();
  const override = c.req.query("brand");
  const brand = resolveBrand(host, override);
  // Admin (caller.*) keeps app.html; every other host is a consumer micro-site (branded by subdomain).
  // On a STAGING preview the bare root defaults to the CONSUMER site (what we're reviewing) instead of
  // the admin app — the staging host resolves to the default brand, which would otherwise show admin.
  // Admin stays reachable on caller.*/admin.* hosts. Prod (STAGING unset) keeps its original logic.
  const consumer = config.staging.on
    ? (!(host.startsWith("caller.") || host.startsWith("admin.")) || !!override)
    : (host.startsWith("runner.") || brand.key !== "runner" || !!override);
  return c.html(consumer ? renderRunner(brand, host, "checkit.html", c.req.query("tone") || "", peekOk(c.req.query("peek"), getCookie(c, "peek")), !!c.req.query("ref")) : withAnalytics(adminUiHtml()));
};
app.get("/", rootHandler);
// Clean admin deep-links (/feedback, /trees, …): one STATIC route per admin section, all serving the same
// SPA; the client reads location.pathname to pick the section. Static-only on purpose — the earlier
// :param{regex} attempt crashed Hono's router on boot. These names never collide with /api, /pub, /r, /s, etc.
for (const s of ["dash","users","restock","growth","calc","plans","retailers","search","add","zones","receipts","results","schedules","feedback","statuses","trees","settings","designer","workflows","testing","fun","gtm"]) app.get("/" + s, rootHandler);
app.get("/r", (c) => { c.header("Cache-Control", "no-store"); const h=(c.req.header("host") || "").toLowerCase(); return c.html(renderRunner(resolveBrand(h, c.req.query("brand")), h, "checkit.html", c.req.query("tone") || "", peekOk(c.req.query("peek"), getCookie(c, "peek")))); });
// SANDBOX (owner 07-16): /sheetpeek — standalone slide-up chrome test, touches NOTHING on the real site.
// v2-look homepage; tap a store → sheet slides up (transform + dim, real mechanics); drag down to close.
// Implementation under test: the root colour NEVER changes, so the close-drag can never sample a wrong
// chrome colour. "Bug mode" toggle re-enables the legacy recolor to reproduce the poisoning on demand.
app.get("/sheetpeek", (c) => {
  c.header("Cache-Control", "no-store");
  return c.html(`<!doctype html><html lang="en" style="background:#1D1D22"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>sheet peek 2</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:160dvh;background:#1D1D22;color:#fff;font-family:-apple-system,system-ui,sans-serif}
header{padding:14px 16px;display:flex;align-items:center;gap:8px}
.logo{font-size:19px;font-weight:900}.logo b{color:#4ADE80}
main{padding:10px 20px 40px;max-width:520px;margin:0 auto}
.hint{font-size:13px;color:#8A8A96;margin:4px 0 14px;line-height:1.5}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.t{background:#26262B;border:0;border-radius:18px;color:#fff;padding:9px 13px;font-weight:800;font-size:13px}
.t.on{background:#4ADE80;color:#06210F}
.store{display:flex;align-items:center;gap:12px;background:linear-gradient(180deg,#2D2D34 0%,#27272D 100%);border-radius:14px;box-shadow:0 8px 14px -8px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07);padding:14px;margin-bottom:10px}
.store .ic{width:44px;height:44px;border-radius:12px;background:#1B1B20;display:grid;place-items:center;font-weight:900}
.store .nm{font-weight:800}.store .ad{font-size:12.5px;color:#8A8A96}
/* the moving parts, each independently toggleable */
#dim{position:fixed;inset:0;background:rgba(5,6,9,.66);display:none;z-index:79}
#sheet{position:fixed;left:0;right:0;bottom:0;z-index:80;background:#26262B;border-radius:28px 28px 0 0;display:none;height:86dvh;flex-direction:column;overflow:hidden}
#sheet .grab{touch-action:none;padding:10px 0 4px;flex:0 0 auto}
#sheet .body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 20px 6px} /* NO big bottom padding: the sheet's rows must run UNDER the toolbar so the glass has content to ghost — the old padding left an empty panel strip = the solid slab. A scroll-end spacer keeps the last row reachable. */
#sheet .body::after{content:"";display:block;height:calc(70px + env(safe-area-inset-bottom))}
.mychk{background:linear-gradient(135deg,#2E7D4F,#3E9D63);border-radius:20px;padding:18px;margin-bottom:14px}
.mychk .k{font-size:11px;letter-spacing:2px;font-weight:800;opacity:.85}
.mychk .ph{font-size:28px;font-weight:900;margin-top:6px}
.stats{display:flex;gap:10px;margin-bottom:14px}
.stat{flex:1;background:#1F1F25;border-radius:16px;padding:16px;text-align:center}
.stat b{font-size:22px}
.stat i{display:block;font-style:normal;font-size:11px;letter-spacing:1.5px;color:#8A8A96;margin-top:4px}
.rowc{display:flex;justify-content:space-between;align-items:center;background:#1F1F25;border-radius:14px;padding:16px;margin-bottom:10px;font-weight:700}
.rowc span{color:#8A8A96;font-weight:500;font-size:12.5px;display:block;margin-top:3px}
.runbtn{display:block;width:100%;background:transparent;border:1.5px solid #4ADE80;color:#4ADE80;border-radius:999px;padding:15px;font-weight:900;font-size:14px;letter-spacing:1px;margin:8px 0 20px}
#sheet[style*="display: flex"]{display:flex}
#sheet.frost{background:rgba(38,38,43,.28);backdrop-filter:blur(22px) saturate(1.3);-webkit-backdrop-filter:blur(22px) saturate(1.3)} /* F: frosted-glass sheet — the dimmed page shows THROUGH it, native-style */
#sheet.frost .mychk, #sheet.frost .mychk{background:linear-gradient(135deg,rgba(46,125,79,.75),rgba(62,157,99,.75))}
#sheet.frost .stat,#sheet.frost .rowc{background:rgba(31,31,37,.38)}
/* bright rows on the PAGE so there is something to ghost through the frost */
.brite{background:linear-gradient(90deg,#4ADE80,#A7F3D0);border-radius:14px;color:#06210F;font-weight:900;padding:16px;margin-bottom:10px;text-align:center}
.brite.b2{background:linear-gradient(90deg,#FBBF24,#FDE68A)}
.brite.b3{background:linear-gradient(90deg,#818CF8,#C7D2FE)}
#sheet .handle{width:44px;height:5px;border-radius:3px;background:#3A3A42;margin:0 auto 14px}
body.filterdim main,body.filterdim header{filter:brightness(.45)}
body.frostdim main,body.frostdim header{filter:brightness(.8) saturate(1.05)} /* F: barely dim — the frost does the separating, the page must stay bright enough to ghost through */ /* dim WITHOUT covering: the page itself darkens, keeps scrolling under the glass */
</style></head><body>
<header><span class="logo">Check <b>it</b></span></header>
<main>
<div id="mainwrap">
<div class="hint"><b>Scroll first</b> so the header slides under the clock (that's the translucency). Then tap each test and scroll again — report which letters KEEP it. Tap the letter again to turn it off.</div>
<div class="row">
<button class="t" id="A" onclick="T('A')">A dim overlay</button>
<button class="t" id="B" onclick="T('B')">B sheet only</button>
<button class="t" id="C" onclick="T('C')">C sheet+dim</button>
<button class="t" id="D" onclick="T('D')">D filter dim</button>
<button class="t" id="E" onclick="T('E')">E sheet+filter</button>
<button class="t" id="F" onclick="T('F')">F frosted sheet</button>
<button class="t" id="G" onclick="T('G')">G sheet as page</button>
<button class="t" id="H" onclick="T('H')">H page-layer sheet</button>
</div>
<div class="store"><div class="ic">B&N</div><div><div class="nm">Barnes &amp; Noble Calabasas</div><div class="ad">4735 Commons Way · till 9 PM</div></div></div>
<div class="store"><div class="ic">CVS</div><div><div class="nm">CVS Ventura Blvd</div><div class="ad">22050 Ventura Blvd. · till 11 PM</div></div></div>
<div class="store"><div class="ic">F</div><div><div class="nm">Fun</div><div class="ad">123 Fun Lane, Calabasas, CA</div></div></div>
<div class="brite">IN STOCK at CVS Mulholland</div>
<div class="brite b2">Restock incoming · Sunday</div>
<div class="brite b3">3 zones watched · 39 stores</div>
<div class="brite">CHECK ANOTHER STORE →</div>
<div style="height:40dvh"></div>
<div class="store"><div class="ic">↑</div><div><div class="nm">Scroll runway</div><div class="ad">so the top can slide under the clock</div></div></div>
</div>
<div id="pagemode" style="display:none">
<div class="mychk"><div class="k">MY CHECKS</div><div class="ph">(310) 666-2331</div></div>
<div class="stats"><div class="stat"><b>∞</b><i>CHECKS LEFT</i></div><div class="stat"><b>4</b><i>CHECKS TODAY</i></div></div>
<div class="rowc">Manage plan<span>Unlimited · billed monthly</span></div>
<div class="rowc">Check history<span>31 checks in July</span></div>
<div class="rowc">Alerts<span>Restock and auto check pings.</span></div>
<div class="rowc">Manage Zones<span>Check a whole area in one tap.</span></div>
<div class="rowc">Earn free checks<span>4 ways. Open to everyone.</span></div>
<div class="rowc">Language<span>English</span></div>
<div class="rowc">Sign out<span>See you soon.</span></div>
<button class="runbtn">RUN A CHECK →</button>
<div class="rowc">More rows so it scrolls<span>keep going</span></div>
<div class="rowc">Even more<span>almost there</span></div>
<div class="rowc">Last row<span>tap G again to exit</span></div>
</div>
</main>
<div id="dim" onclick="T(cur)"></div>
<div id="sheet"><div class="grab"><div class="handle"></div></div><div class="body">
<div class="mychk"><div class="k">MY CHECKS</div><div class="ph">(310) 666-2331</div></div>
<div class="stats"><div class="stat"><b>∞</b><i>CHECKS LEFT</i></div><div class="stat"><b>4</b><i>CHECKS TODAY</i></div></div>
<div class="rowc">Manage plan<span>Unlimited · billed monthly</span></div>
<div class="rowc">Check history<span>31 checks in July</span></div>
<div class="rowc">Alerts<span>Restock and auto check pings.</span></div>
<div class="rowc">Manage Zones<span>Check a whole area in one tap.</span></div>
<div class="rowc">Earn free checks<span>4 ways. Open to everyone.</span></div>
<div class="rowc">Language<span>English</span></div>
<div class="rowc">Sign out<span>See you soon.</span></div>
<button class="runbtn">RUN A CHECK →</button>
</div></div>
<script>
var cur='';
function T(k){
  var same=(cur===k); cur=same?'':k;
  ['A','B','C','D','E','F','G','H'].forEach(function(x){document.getElementById(x).classList.toggle('on',x===cur);});
  var dim=document.getElementById('dim'),sheet=document.getElementById('sheet');
  dim.style.display=(cur==='A'||cur==='C')?'block':'none';
  sheet.style.display=(cur==='B'||cur==='C'||cur==='E'||cur==='F'||cur==='H')?'flex':'none';
  // H: same sheet but ABSOLUTE in the document (page paint layer, not UI layer). Background scroll is
  // locked while open (like real sheets), so absolute == fixed visually — but the glass can ghost it.
  if(cur==='H'){
    var top=window.scrollY+window.innerHeight*0.14;
    sheet.style.position='absolute'; sheet.style.top=top+'px'; sheet.style.bottom='auto'; sheet.style.height=(window.innerHeight*0.86+120)+'px';
    document.body.style.overflow='hidden'; document.documentElement.style.overflow='hidden';
  } else {
    sheet.style.position='fixed'; sheet.style.top='auto'; sheet.style.bottom='0'; sheet.style.height='86dvh';
    document.body.style.overflow=''; document.documentElement.style.overflow='';
  }
  sheet.classList.toggle('frost',cur==='F');
  sheet.style.transform='';
  document.body.classList.toggle('filterdim',cur==='D'||cur==='E'||cur==='H');
  document.body.classList.toggle('frostdim',cur==='F');
  // G: same content as a PAGE-STATE — document scroll, so the glass ghosts it top AND bottom.
  var pg=document.getElementById('pagemode');
  pg.style.display=(cur==='G')?'block':'none';
  document.getElementById('mainwrap').style.display=(cur==='G')?'none':'block';
  if(cur==='G') window.scrollTo(0,0);
}
// Drag the sheet down to close (like the real thing) — closing clears the whole test state so the
// owner can check the after-close translucency.
var sheet=document.getElementById('sheet'),grab=sheet.querySelector('.grab'),y0=null;
grab.addEventListener('touchstart',function(e){y0=e.touches[0].clientY;sheet.style.transition='none';},{passive:true});
grab.addEventListener('touchmove',function(e){if(y0==null)return;var d=Math.max(0,e.touches[0].clientY-y0);sheet.style.transform='translateY('+d+'px)';},{passive:true});
grab.addEventListener('touchend',function(e){sheet.style.transition='';var d=(e.changedTouches[0].clientY-(y0||0));y0=null;if(d>90){T(cur);}else{sheet.style.transform='';}});
</script>
</body></html>`);
});
// Verticals as PATHS on the apex (checkitforme.com/pokemon, /onepiece, /toppsbasketball, /needoh) —
// same brand resolution as the subdomains, keyed off the slug. This is what lets the product switcher
// link to clean same-domain paths instead of subdomain hops.
for (const slug of ["pokemon", "onepiece", "toppsbasketball", "needoh"]) {
  app.get(`/${slug}`, (c) => {
    c.header("Cache-Control", "no-cache"); // see "/" — bfcache-friendly, still always revalidated
    const host = (c.req.header("host") || "").toLowerCase();
    return c.html(renderRunner(resolveBrand(host, slug), host, "checkit.html", c.req.query("tone") || "", false, !!c.req.query("ref")));
  });
}
// Minimal "first-time visitor" preview of the apex homepage — same page; the client (body.peek)
// strips it down to just the hero + the check card so the owner can eyeball the bare layout.
app.get("/peek", (c) => {
  c.header("Cache-Control", "no-store");
  const host = (c.req.header("host") || "").toLowerCase();
  return c.html(renderRunner(resolveBrand(host), host, "checkit.html", "", peekOk(c.req.query("peek"), getCookie(c, "peek"))));
});
// Branded share cards (1200×630 PNGs) — what X/iMessage/Discord unfurl for every link.
app.get("/og/:file", (c) => {
  const file = (c.req.param("file") || "").replace(/[^a-z0-9._-]/gi, "");
  try {
    const buf = readFileSync(join(here, `../public/og/${file}`));
    c.header("Cache-Control", "public, max-age=86400");
    return c.body(buf, 200, { "Content-Type": "image/png" });
  } catch { return c.notFound(); }
});
// Brand logo images (transparent PNGs served to the per-vertical micro-sites).
// PWA: service worker (scope "/" — must be served from root) + web app manifest.
app.get("/sw.js", (c) => {
  try {
    const buf = readFileSync(join(here, "../public/sw.js"));
    c.header("Cache-Control", "no-cache"); // always revalidate the SW so updates roll out
    c.header("Service-Worker-Allowed", "/");
    return c.body(buf, 200, { "Content-Type": "text/javascript; charset=utf-8" });
  } catch { return c.notFound(); }
});
app.get("/manifest.webmanifest", (c) => {
  try {
    const buf = readFileSync(join(here, "../public/manifest.webmanifest"));
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(buf, 200, { "Content-Type": "application/manifest+json; charset=utf-8" });
  } catch { return c.notFound(); }
});
app.get("/logos/:file", (c) => {
  const file = (c.req.param("file") || "").replace(/[^a-z0-9._-]/gi, "");
  try {
    const buf = readFileSync(join(here, `../public/logos/${file}`));
    const ext = file.split(".").pop()?.toLowerCase();
    const ct = ext === "png" ? "image/png" : ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/jpeg";
    c.header("Cache-Control", "public, max-age=86400");
    return c.body(buf, 200, { "Content-Type": ct });
  } catch { return c.notFound(); }
});
// Logo folders (logos-restructure, 07-10): brand/ = Check marks, products/ = the four
// product-brand logos, pokemon/{eras,sets,banners} = the Pokémon set system (banners = the old
// set-banners + sets/banners merged). The pre-restructure flat tree (root-level marks, eras/,
// sets/, set-banners/) and its routes were deleted after the owner's staging sign-off.
for (const dir of ["brand", "products", "pokemon/eras", "pokemon/sets", "pokemon/banners"]) {
  app.get(`/logos/${dir}/:file`, (c) => {
    const send = (rel: string) => {
      const buf = readFileSync(join(here, `../public/logos/${dir}/${rel}`));
      const ext = rel.split(".").pop()?.toLowerCase();
      const ct = ext === "png" ? "image/png" : ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/jpeg";
      c.header("Cache-Control", "public, max-age=86400");
      return c.body(buf, 200, { "Content-Type": ct });
    };
    const file = (c.req.param("file") || "").replace(/[^a-z0-9._-]/gi, "");
    try { return send(file); }
    catch {
      // banners keep the old set-banners contract: a missing set banner serves the shared
      // Pokémon fallback so a card never shows a broken image; everything else 404s.
      if (dir === "pokemon/banners") { try { return send("_fallback.png"); } catch { return c.notFound(); } }
      return c.notFound();
    }
  });
}
// Self-hosted webfonts (Inter variable) — Google Fonts is unreachable for users behind DNS
// ad-blockers, and the design only reads as the design in Inter. One origin, one file.
app.get("/fonts/:file", (c) => {
  const file = (c.req.param("file") || "").replace(/[^a-z0-9._-]/gi, "");
  if (!file.endsWith(".woff2")) return c.notFound();
  try {
    const buf = readFileSync(join(here, `../public/fonts/${file}`));
    c.header("Cache-Control", "public, max-age=31536000, immutable");
    return c.body(buf, 200, { "Content-Type": "font/woff2" });
  } catch { return c.notFound(); }
});
app.get("/robots.txt", (c) => {
  const host = (c.req.header("host") || "").toLowerCase();
  return c.text(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /app/\nDisallow: /pub/\nSitemap: https://${host}/sitemap.xml\n`);
});
app.get("/sitemap.xml", (c) => {
  const host = (c.req.header("host") || "").toLowerCase();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>https://${host}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n</urlset>`;
  return c.body(xml, 200, { "Content-Type": "application/xml" });
});

// ---- Custom telephony bridge (rebuild milestone 1) ----
// TwiML Twilio fetches when OUR bridge call connects: stream the call's audio to our WS.
// Twilio's media stream is pinned to the direct Railway domain (verified WS path; avoids Cloudflare).
// Hosts live in bridge-place.ts (placeBridgeCall builds its callback URLs from them too).
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
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${play}<Connect><Stream url="wss://${config.staging.on ? STAGING_HOST : RAILWAY_HOST}/bridge?room=${room}"><Parameter name="room" value="${room}" /></Stream></Connect></Response>`;
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
app.post("/api/admin/tapedeck/call", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { phone?: string; workflow?: string };
  return c.json(await tapedeckCall(String(b.phone || ""), b.workflow ? String(b.workflow) : undefined));
});
app.get("/api/admin/tapedeck/session/:id", (c) => {
  const s = tdSession(c.req.param("id"));
  if (!s) return c.json({ error: "not found" }, 404);
  return c.json({ id: s.id, status: s.status, steps: s.steps, clipText: s.clipText });
});

// ---- Charlie barge-in: when a store-mode Delta call gets an off-script question it can't handle with
// a clip, hand the SAME live call to the paid agent. We open a bridge room with the store's normal
// restock vars, connect immediately (a human is already talking), point the call_results row at the new
// EL conversation so ingestPending finalizes the verdict, and return <Connect><Stream> TwiML. Any error
// returns null so the D-lane falls back to a graceful escalate-clip wrap (fail-safe, never a dead call).
setDeltaBarge(async (s, _speech) => {
  const chk = s.check;
  if (!chk) return null;
  try {
    const v = await buildRestockVars(chk.retailerId, chk.categoryId, undefined, [], undefined);
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

// ---- Ops (admin-gated by the /api/* wall): watchdog + backup visibility, manual backup trigger ----
app.get("/api/ops/status", (c) => c.json({ env: config.staging.on ? "staging" : "production", watchdog: watchdogState(), backup: backupState() }));
app.post("/api/ops/backup-now", async (c) => c.json(await backupNow()));

// ---- Phone-first auth (Clerk-free): SMS code → our session → caller-ID verify call ----
// Step 1: send an SMS code to the cell (browser auto-fills it). Rate-limited (SMS costs money).
app.post("/auth/phone/start", async (c) => {
  const rl = rlCheck("lead", clientIp(c.req.raw.headers), LIMITS.lead);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const { phone } = await c.req.json().catch(() => ({}));
  const e = authE164(String(phone || ""));
  if (!/^\+1\d{10}$/.test(e)) return c.json({ error: "us_number_required" }, 400); // US only for now
  const r = await startPhoneVerify(e);
  return r.ok ? c.json({ ok: true, dev: !!r.dev, devCode: r.devCode }) : c.json({ error: r.error }, 400);
});
// Read-only: is this number a returning account? Lets the login screen show "Welcome back" vs
// "First check's on us" before they submit. Rate-limited (anti-enumeration); never creates an account.
app.post("/auth/phone/known", async (c) => {
  const rl = rlCheck("lead", clientIp(c.req.raw.headers), LIMITS.lead);
  if (!rl.ok) return c.json({ error: "rate_limited" }, 429);
  const { phone } = await c.req.json().catch(() => ({}));
  const e = authE164(String(phone || ""));
  if (!/^\+1\d{10}$/.test(e)) return c.json({ known: false });
  return c.json({ known: await phoneAccountExists(e) });
});
// Step 2: confirm the code → find/create the phone account → issue our session token.
app.post("/auth/phone/check", async (c) => {
  const { phone, code } = await c.req.json().catch(() => ({}));
  const e = authE164(String(phone || ""));
  if (!/^\+1\d{10}$/.test(e) || !code) return c.json({ error: "phone_and_code_required" }, 400);
  if (!(await checkPhoneVerify(e, String(code)))) return c.json({ error: "bad_code" }, 401);
  const a = await getAccountByPhone(e);
  if (!a) return c.json({ error: "account_error" }, 500);
  const token = await signSession(a.clerkUserId, e);
  // Owner phone → also mint the admin session on the shared root domain, so signing into the site
  // logs the operator into the admin (a sibling subdomain). No effect for non-owner numbers.
  if (isAdminPhone(e)) {
    const adminJwt = await signSession("admin", "");
    const domain = cookieRootDomain(c.req.header("host"));
    setCookie(c, "admin_session", adminJwt, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 30, ...(domain ? { domain } : {}) });
  }
  return c.json({ token, account: { phone: e, credits: spendableCredits(a), subscription: a.subscription, callerIdReady: !!a.callerId && a.callerId === e } });
});
// Step 3 (after login): kick off the caller-ID verification CALL; show the code to enter.
app.post("/auth/callerid/start", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u || !u.phone) return c.json({ error: "unauthorized" }, 401);
  const r = await startCallerIdVerify(u.phone);
  return r.ok ? c.json({ validationCode: r.validationCode }) : c.json({ error: r.error }, 400);
});
// Poll whether the caller-ID call finished; on success, mark it on the account.
app.get("/auth/callerid/status", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u || !u.phone) return c.json({ error: "unauthorized" }, 401);
  const verified = await isCallerIdVerified(u.phone);
  if (verified) await db.update(accounts).set({ callerId: u.phone }).where(eq(accounts.clerkUserId, u.id));
  return c.json({ verified });
});
// Set/clear the optional email for alerts + newsletter (Brevo). Collected in the You section only.
app.post("/app/email", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const { email, lang } = await c.req.json().catch(() => ({}));
  const e = String(email || "").trim().toLowerCase();
  if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return c.json({ error: "invalid_email" }, 400);
  const language = lang === "es" ? "es" : lang === "en" ? "en" : undefined; // the site sends its LANG; keep whatever's there otherwise
  const before = await getAccount(u.id);
  const changed = e !== (before?.email || ""); // new or different address → it needs confirming again
  const resend = !!e && !changed && !before?.emailVerifiedAt; // same still-pending address submitted again = "send the confirmation again" (owner 07-16)
  await db.update(accounts).set({ email: e || null, ...(language ? { language } : {}), ...(changed ? { emailVerifiedAt: null } : {}) }).where(eq(accounts.clerkUserId, u.id));
  // Opt-in email → Brevo (newsletter/alerts). Fire-and-forget so the UI isn't blocked on Brevo.
  if (e) brevoUpsertContact(e, { PHONE: u.phone || "" }).catch(() => {});
  // New/changed address (or a pending resend) → the confirm email goes out in their language.
  if (e && (changed || resend)) { try { await sendConfirmEmail(u.id, e, language || (before?.language === "es" ? "es" : "en")); } catch { /* never block saving the email */ } }
  return c.json({ ok: true, email: e || null, verified: !changed && !!before?.emailVerifiedAt, resent: resend });
});

// ---- Email confirm + one-click unsubscribe (the two live links every alert email carries) ----
// Tiny branded landing page (dark board, wordmark, one line + Spanish, one CTA back to the site).
function emailLandingPage(title: string, line: string, lineEs: string, cta: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Check It For Me</title>
<style>body{margin:0;background:#08090D;color:#fff;font-family:Inter,'Segoe UI',Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.card{max-width:420px;margin:16px;background:#14141A;border-radius:26px;padding:34px 36px}
h1{font-size:30px;font-weight:900;letter-spacing:-1px;margin:18px 0 0}p{color:#B9B9C4;font-size:15px;line-height:1.5;margin:14px 0 0}.es{color:#8A8A96;font-size:13px}
a.cta{display:block;text-align:center;margin-top:26px;background:#16161C;border:2px solid #4ADE80;border-radius:999px;padding:17px 24px;color:#fff;font-weight:800;font-size:13px;letter-spacing:1.6px;text-decoration:none;text-transform:uppercase}</style></head>
<body><div class="card"><img src="/logos/brand/check.png" alt="Check" style="height:26px;display:block">
<h1>${title}</h1><p>${line}</p><p class="es">${lineEs}</p><a class="cta" href="/">${cta}&nbsp;&nbsp;&rarr;</a></div></body></html>`;
}
// Confirm: the signed link from the confirm email. Marks every account carrying this address verified.
// No landing page (owner 07-16): confirm, then drop them straight back on the site — My checks opens
// with a pill saying the email is confirmed (emconf=1) or that the link didn't work (emconf=0).
app.get("/confirm-email", async (c) => {
  const e = String(c.req.query("e") || "").trim().toLowerCase();
  if (!e || !checkEmailToken(e, String(c.req.query("t") || ""))) return c.redirect("/?emconf=0");
  await db.update(accounts).set({ emailVerifiedAt: Math.floor(Date.now() / 1000) }).where(eq(accounts.email, e));
  return c.redirect("/?emconf=1");
});
// Unsubscribe: signed one-click. Kills every EMAIL alert for this address (subscriptions + watches)
// and un-verifies it so nothing else emails them until they re-confirm. GET renders the page;
// POST serves RFC 8058 one-click (the List-Unsubscribe-Post header) — same effect, no body needed.
async function unsubscribeEmail(e: string): Promise<void> {
  const owners = await db.select().from(accounts).where(eq(accounts.email, e));
  for (const a of owners) {
    await db.update(alertSubscriptions).set({ active: 0 }).where(and(eq(alertSubscriptions.userId, a.clerkUserId), eq(alertSubscriptions.channel, "email")));
  }
  await db.update(accounts).set({ emailVerifiedAt: null }).where(eq(accounts.email, e));
  await db.update(watches).set({ active: false }).where(eq(watches.contact, e));
}
// The human unsubscribe click goes straight to the Alerts sheet — they mute or stop the exact alert
// there (owner 07-16: no unsubscribe landing page, no blanket kill). The POST below stays: it's the
// RFC 8058 one-click header path mail apps call machine-to-machine.
app.get("/unsubscribe", async (c) => c.redirect("/?alerts=1"));
app.post("/unsubscribe", async (c) => {
  const e = String(c.req.query("e") || "").trim().toLowerCase();
  if (!e || !checkEmailToken(e, String(c.req.query("t") || ""))) return c.json({ error: "bad_token" }, 400);
  await unsubscribeEmail(e);
  return c.json({ ok: true });
});

// Clerk-free admin login: visit /admin-login?token=ADMIN_TOKEN once → sets a signed httpOnly
// session cookie the /api/* gate accepts. No Clerk. The existing app.html then loads unchanged.
app.get("/admin-login", async (c) => {
  const token = c.req.query("token") || "";
  if (!config.adminToken || token !== config.adminToken) return c.text("unauthorized", 401);
  const jwt = await signSession("admin", "");
  setCookie(c, "admin_session", jwt, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return c.redirect("/");
});
app.get("/admin-logout", (c) => {
  setCookie(c, "admin_session", "", { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 0 });
  return c.redirect("/");
});

// ---- Consumer (Runnr) public API — pay-per-check. Bypasses the /api/* Clerk gate by design. ----
const charged = new Set<string>(); // idempotent per-call charging (only on a definitive answer)
const pubCredits = async () => {
  const v = await getSetting("pub_credits");
  return v == null || v === "" ? 20 : Math.max(0, Number(v) || 0); // 20 free demo checks by default
};
app.get("/pub/credits", async (c) => c.json({ balance: await pubCredits() }));
// Temporary shared-password gate (until Clerk signup ships). Empty PUB_PASSWORD = open.
app.get("/pub/protected", (c) => c.json({ protected: !!process.env.PUB_PASSWORD }));
app.post("/pub/gate", async (c) => {
  const { password } = await c.req.json().catch(() => ({}));
  return c.json({ ok: !process.env.PUB_PASSWORD || password === process.env.PUB_PASSWORD });
});
// Chain logo registry: drop transparent PNGs into public/logos/chains/<slug>.png (slug = chain
// name lowercased, non-alphanumerics → "-"). Stores pick them up automatically on every surface.
import { readdirSync } from "node:fs";
let chainLogoCache: { t: number; v: Set<string> } | null = null;
function chainLogoFiles(): Set<string> {
  if (chainLogoCache && Date.now() - chainLogoCache.t < 60_000) return chainLogoCache.v;
  let v = new Set<string>();
  try { v = new Set(readdirSync(join(here, "../public/logos/chains")).filter((f) => /\.(png|webp|svg)$/i.test(f))); } catch { /* dir not there yet */ }
  if (v.size) chainLogoCache = { t: Date.now(), v }; // never cache an empty read — self-heal on the next call
  return v;
}
const chainSlug = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
let logoMetaCache: { t: number; v: Record<string, { w: number; d: number }> } | null = null;
function logoMeta(): Record<string, { w: number; d: number }> {
  if (logoMetaCache && Date.now() - logoMetaCache.t < 60_000) return logoMetaCache.v;
  let v: Record<string, { w: number; d: number }> = {};
  try { v = JSON.parse(readFileSync(join(here, "../public/logos/chains/_meta.json"), "utf8")); } catch { /* none yet */ }
  logoMetaCache = { t: Date.now(), v };
  return v;
}
function chainLogoFile(name: string | null | undefined): string | null {
  if (!name) return null;
  const files = chainLogoFiles();
  const d = chainSlug(name);
  const cands = [...new Set([d, d.replace(/-and-/g, "-"), d.replace(/-/g, "_"), d.replace(/-and-/g, "-").replace(/-/g, "_")])];
  for (const slug of cands) for (const ext of ["png", "webp", "svg"]) {
    if (files.has(`${slug}.${ext}`)) return `${slug}.${ext}`;
  }
  // Deliberately NO fuzzy stem-in-name fallback: it was a footgun that could hand a future chain an
  // unrelated brand's logo (e.g. a "Pak N Save" picking up another file whose stem appears in the name).
  // Resolution is now explicit only — DB logoUrl (chainLogoInfo, first) then exact chain-slug variants
  // above. If a chain ever genuinely needs aliasing, add a curated alias→file map, never substring guessing.
  return null;
}
// DB-first logo (logo-r2-keystone spec, git history): chains.logo_url (shared R2) wins over the per-branch
// filesystem, so a chain's logo travels to every environment and can't drift. Cached name→logo map,
// refreshed on a timer + immediately after an upload/migration. Empty cache (cold start, or a chain
// with no logo_url yet) simply falls through to the filesystem resolver — fully backward-compatible.
let chainLogoDbCache = new Map<string, { url: string; wide: boolean; dark: boolean }>();
async function refreshChainLogoDb(): Promise<void> {
  try {
    const rows = await db.select({ name: chains.name, logoUrl: chains.logoUrl, logoWide: chains.logoWide, logoDark: chains.logoDark })
      .from(chains).where(sql`${chains.logoUrl} is not null and ${chains.logoUrl} != ''`);
    const m = new Map<string, { url: string; wide: boolean; dark: boolean }>();
    for (const r of rows) if (r.logoUrl) m.set((r.name || "").toLowerCase(), { url: r.logoUrl, wide: r.logoWide === true, dark: r.logoDark === true });
    chainLogoDbCache = m;
  } catch (e) { console.error("refreshChainLogoDb", e); }
}
let chainLogoDbLoading = false;
// Lazy-load the DB-backed logo cache on first use (pure DB query, no file read) so logos resolve even if
// the startup load didn't run in this container — prod resilience for the file-read anomaly.
function ensureChainLogoDb(): void {
  if (chainLogoDbCache.size || chainLogoDbLoading) return;
  chainLogoDbLoading = true;
  refreshChainLogoDb().finally(() => { chainLogoDbLoading = false; });
}
function chainLogoInfo(name: string | null | undefined): { url: string | null; wide: boolean; dark: boolean } {
  if (name) {
    ensureChainLogoDb();
    const hit = chainLogoDbCache.get(name.toLowerCase()); // DB-first: shared-R2 URL travels across envs
    if (hit) return hit;
  }
  const f = chainLogoFile(name); // filesystem fallback (pre-migration, and unchained store names)
  if (!f) return { url: null, wide: false, dark: false };
  const m = logoMeta()[f] || { w: 0, d: 0 };
  return { url: `/logos/chains/${f}?v=78`, wide: m.w === 1, dark: m.d === 1 };
}

// ---- Distributor-driven carries (data/distributors.json) ----
// A store's product list is DERIVED at serve-time from its chain's distributor(s) — the union of each
// distributor's products. The config lives in code, so it's identical on every environment (Admin/
// staging/prod) and a newly-imported store gets the right carries with zero per-store stamping. Same
// shared-source idea as the R2 logo: derive from one source, never store a per-DB copy that can drift.
// Inlined fallback = source of truth in code, so carries derive even when the deployed container can't
// read data/distributors.json (a prod-image file-read anomaly seen after a staging→prod merge). The file
// is still preferred when readable (keeps it the editable source); the inline keeps prod resilient.
// `chains` DERIVE carries (products = union of the distributor lists). `labels` are DISPLAY-ONLY —
// they fill the Admin "Distro" field for chains whose distributor we know but whose products were
// curated by hand (Excell accounts), WITHOUT re-deriving/replacing those products. Keep the two apart.
type DistCfg = { products: Record<string, string[]>; chains: Record<string, string[]>; labels?: Record<string, string[]> };
const DISTRIBUTORS_FALLBACK: DistCfg = {
  products: {
    Excell: ["Pokemon TCG", "Disney Lorcana", "Magic: The Gathering", "One Piece TCG", "Yu-Gi-Oh", "Sports Cards (Topps/Panini)"],
    Schylling: ["NeeDoh (Schylling)"],
    Jazwares: ["Squishmallows"],
  },
  chains: {
    "CVS": ["Excell", "Schylling", "Jazwares"],
    "Walgreens": ["Excell", "Schylling", "Jazwares"],
    "Target": ["Excell", "Schylling", "Jazwares"],
    "Walmart": ["Excell", "Schylling", "Jazwares"],
    "Barnes & Noble": ["Excell", "Schylling", "Jazwares"],
  },
  labels: {
    "Five Below": ["Excell"], "Hot Topic": ["Excell"], "BoxLunch": ["Excell"],
    "Claire's": ["Excell"], "Hobby Lobby": ["Excell"], "H-E-B": ["Excell"],
  },
};
let distCache: DistCfg | null = null;
function distConfig(): DistCfg {
  if (distCache) return distCache;
  try {
    const c = JSON.parse(readFileSync(join(here, "../data/distributors.json"), "utf8"));
    if (c && c.chains && Object.keys(c.chains).length) { distCache = c; return c; }
  } catch { /* file unreadable in this container — use the inlined fallback below */ }
  return DISTRIBUTORS_FALLBACK; // never cache the fallback, so the file self-heals if it becomes readable
}
/** Products a chain carries, derived from its distributor(s). null = chain not mapped (fall back to the stored column). */
function carriesForChain(name: string | null | undefined): string[] | null {
  if (!name) return null;
  const cfg = distConfig();
  const dists = cfg.chains[name];
  if (!dists || !dists.length) return null;
  const set = new Set<string>();
  for (const d of dists) for (const p of (cfg.products[d] || [])) set.add(p);
  return set.size ? [...set] : null;
}
/** The carries a store actually shows: distributor-derived for mapped chains, else its stored per-store list. */
function storeCarriesList(chainName: string | null | undefined, stored: string | null | undefined): string[] {
  return carriesForChain(chainName) ?? (stored ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}
/** Distributor name(s) serving a chain, for display in the Admin (e.g. "Excell · Schylling"). Reads the
 *  carries-deriving `chains` map first, then the display-only `labels` map — so a hand-curated Excell
 *  account shows its distributor without its products being re-derived. null = we don't know the distributor. */
function distributorsForChain(name: string | null | undefined): string | null {
  if (!name) return null;
  const cfg = distConfig();
  const dists = cfg.chains[name] ?? (cfg.labels && cfg.labels[name]);
  return (dists && dists.length) ? dists.join(" · ") : null;
}

// Owner preview: every chain logo rendered EXACTLY as the consumer store list renders it — the
// same .ic tile (52px, plate + wide handling from _meta.json), ONE mark each (no 2x detail), so
// the page mirrors the real website. Filter by the chain's admin "type" (Big Box, Pharmacy,
// Grocer…), pulled live from the chains table. No auth — leaks nothing but public logos.
// Admin gate for the internal logo walls (owner: never public). Same check as /api/*: x-admin-token
// header or the admin_session cookie (owner-phone login mints it). Open only in dev with no token set.
async function adminOk(c: any): Promise<boolean> {
  if (!config.adminToken) return true;
  if (c.req.header("x-admin-token") === config.adminToken) return true;
  const ck = getCookie(c, "admin_session");
  if (ck) { const s = await verifySession(ck); if (s && s.id === "admin") return true; }
  return false;
}
app.get("/logo-wall", async (c) => {
  if (!(await adminOk(c))) return c.notFound(); // private: not a public page
  const files = [...chainLogoFiles()].sort();
  const meta = logoMeta();
  // Pair each logo file to its chain's admin store-type (chains = the Admin source of truth).
  const fileInfo = new Map<string, { type: string; name: string }>();
  for (const ch of await cachedChains()) {
    const f = chainLogoFile(ch.name);
    if (f && !fileInfo.has(f)) fileInfo.set(f, { type: (ch.type || "").trim() || "Other", name: ch.name });
  }
  const pretty = (f: string) => f.replace(/\.(png|webp|svg)$/i, "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  const types = [...new Set(files.map((f) => fileInfo.get(f)?.type || "Other"))]
    .sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  // Render treatments: every logo resolves to exactly one, from its _meta w/d flags (no entry → standard).
  const treatKey = (m: { w: number; d: number }) => (m.w === 1 && m.d === 1 ? "both" : m.w === 1 ? "wide" : m.d === 1 ? "plate" : "std");
  const TREAT: Array<{ k: string; label: string }> = [
    { k: "std", label: "Standard" }, { k: "wide", label: "Wide" },
    { k: "plate", label: "Plated" }, { k: "both", label: "Wide + Plated" },
  ];
  const tCount: Record<string, number> = { std: 0, wide: 0, plate: 0, both: 0 };
  for (const f of files) tCount[treatKey(meta[f] || { w: 0, d: 0 })]++;
  const tile = (f: string) => {
    const m = meta[f] || { w: 0, d: 0 };
    const info = fileInfo.get(f);
    const cls = (m.d === 1 ? " lite" : "") + (m.w === 1 ? " widelogo" : "");
    return `<div class="cell" data-type="${esc(info?.type || "Other")}" data-treat="${treatKey(m)}"><div class="ic${cls}"><img src="/logos/chains/${f}?v=78" alt=""></div><div class="nm">${esc(info?.name || pretty(f))}</div></div>`;
  };
  // ── Pokémon set & era logos — same repo/logo-wall system as chains, but shown BIG (owner 2026-07-03:
  //    "take up the box, be the main attraction"): these are wordmark logos, not 52px store marks.
  //    Grouped by era; a set with no logo file yet shows a striped gap so the wall reveals what's missing.
  const listPng = (dir: string) => { try { return new Set(readdirSync(join(here, dir)).filter((f) => /\.png$/i.test(f))); } catch { return new Set<string>(); } };
  const setLogoFiles = listPng("../public/logos/pokemon/sets"), eraLogoFiles = listPng("../public/logos/pokemon/eras"), bannerFiles = listPng("../public/logos/pokemon/banners");
  const pslug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let pokeEras: Array<{ era: string; slug: string; hasEra: boolean; sets: Array<{ code: string; name: string; key: string; has: boolean; banner: boolean }> }> = [];
  try {
    const pj = JSON.parse(readFileSync(join(here, "../data/pokemon-sets.json"), "utf8")) as { eras: Array<{ era: string; sets: Array<{ code: string; name?: string }> }> };
    pokeEras = pj.eras.map((e) => ({ era: e.era, slug: pslug(e.era), hasEra: eraLogoFiles.has(pslug(e.era) + ".png"),
      sets: e.sets.map((s) => { const key = pslug(String(s.code)); return { code: String(s.code), name: String(s.name || ""), key, has: setLogoFiles.has(key + ".png"), banner: bannerFiles.has(key + ".png") }; }) }));
  } catch { /* no data file → section stays empty */ }
  const pokeSetCount = pokeEras.reduce((n, e) => n + e.sets.filter((s) => s.has).length, 0);
  const pokeSection = pokeEras.length ? `
  <div id="pokeArea" hidden>
    <h2>Pokémon set tiles · ${pokeSetCount} sets</h2>
    <div class="sub">The exact composite the hobby wall renders — set art (<code>/logos/pokemon/banners</code>) with the set logo (<code>/logos/pokemon/sets</code>) raised on top, area-normalized. Grouped by era.</div>
    ${pokeEras.map((e) => `
    <div class="pera">${e.hasEra ? `<img src="/logos/pokemon/eras/${e.slug}.png?v=73" alt="">` : ""}<span class="en">${esc(e.era)}</span><span class="ec">${e.sets.filter((s) => s.has).length}/${e.sets.length}</span></div>
    <div class="pgrid">${e.sets.map((s) => s.has
      ? `<div class="pset"><div class="ptile">${s.banner ? `<img class="pbg" src="/logos/pokemon/banners/${s.key}.png?v=73" alt="">` : ""}<img class="plogo" src="/logos/pokemon/sets/${s.key}.png?v=73" alt="" onload="pnorm(this)"></div><div class="pnm">${esc(s.code)}<span>${esc(s.name)}</span></div></div>`
      : `<div class="pset"><div class="ptile pmiss"><span class="pcode">${esc(s.code)}</span></div><div class="pnm" style="opacity:.5">${esc(s.code)}<span>no logo yet</span></div></div>`).join("")}</div>`).join("")}
  </div>` : "";
  return c.html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *{box-sizing:border-box}
    body{background:#0C0C12;font-family:-apple-system,system-ui,sans-serif;color:#fff;padding:20px;margin:0}
    h2{font-weight:900;margin:0 0 4px}
    .sub{color:#9a9aac;font-size:12px;margin-bottom:6px}
    .bar{position:sticky;top:0;background:#0C0C12;padding:12px 0 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;z-index:5;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:18px}
    .fld{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a8a98;display:flex;align-items:center;gap:8px;font-weight:700}
    select,.ms-btn{appearance:none;-webkit-appearance:none;background:#1a1a22;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:9px 32px 9px 12px;font-size:14px;font-weight:600;cursor:pointer;text-transform:none;letter-spacing:normal}
    select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23aaa' stroke-width='2'%3E%3Cpath d='M2 4l4 4 4-4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 11px center}
    .ms{position:relative}
    .ms-btn{display:flex;align-items:center;gap:8px;padding-right:12px}
    .ms-btn .chev{opacity:.7}
    .ms-pop{position:absolute;top:calc(100% + 6px);left:0;background:#16161e;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:6px;min-width:230px;box-shadow:0 14px 34px rgba(0,0,0,.55);z-index:30}
    .ms-pop[hidden]{display:none}
    .ms-row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;text-transform:none;letter-spacing:normal;color:#e6e6ee}
    .ms-row:hover{background:rgba(255,255,255,.06)}
    .ms-row input{width:17px;height:17px;accent-color:#22c55e;cursor:pointer;margin:0;flex-shrink:0}
    .ms-ct{margin-left:auto;font-size:12px;color:#8a8a98;font-weight:600}
    #count{font-size:12px;color:#8a8a98;margin-left:auto}
    .grid{display:flex;flex-wrap:wrap;gap:18px}
    .cell{width:72px;display:flex;flex-direction:column;align-items:center;gap:7px}
    .cell.hide{display:none}
    .nm{font-size:10px;color:#9a9aac;text-align:center;line-height:1.25;overflow-wrap:anywhere}
    /* —— EXACT copy of the consumer store-list tile (.ic) from checkit.html —— */
    .ic{width:52px;height:52px;border-radius:15px;background:linear-gradient(145deg,#34343d,#23232b);box-shadow:inset 0 1px 0 rgba(255,255,255,.09),inset 0 -2px 3px rgba(0,0,0,.4),0 3px 7px -1px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .ic img{width:40px;height:40px;object-fit:contain}
    .ic.widelogo img{width:44px;height:auto;max-height:34px}
    .ic.lite{background:#f2f2f5;border-color:rgba(255,255,255,.28)}
    /* —— tabs: Store logos | Pokémon sets (separate areas on this private wall) —— */
    .tabs{display:flex;gap:8px;margin-bottom:16px}
    .tab{appearance:none;background:#1a1a22;color:#c7c7d4;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer}
    .tab.on{background:#4ADE80;color:#06210f;border-color:transparent}
    /* —— Pokémon set tiles — composited: set art + logo raised on top (exactly like the hobby wall) —— */
    .pera{display:flex;align-items:center;gap:13px;margin:26px 0 14px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08)}
    .pera img{height:38px;width:auto;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5))}
    .pera .en{font-size:13px;font-weight:800;letter-spacing:.03em;color:#c7c7d4}
    .pera .ec{margin-left:auto;font-size:12px;color:#8a8a98;font-variant-numeric:tabular-nums}
    .pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:16px}
    .pset{display:flex;flex-direction:column;gap:8px}
    .ptile{position:relative;aspect-ratio:1/1;border-radius:16px;overflow:hidden;background:#1b1b20;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 6px 14px -6px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.05)}
    .ptile .pbg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.6)}
    .ptile .plogo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:82%;height:auto;filter:drop-shadow(0 5px 8px rgba(0,0,0,.6))}
    .ptile.pmiss{background:repeating-linear-gradient(45deg,#2B2B33 0 12px,#25252C 12px 24px);display:grid;place-items:center}
    .pcode{font-size:12px;color:#8a8a98;font-weight:800}
    .pnm{font-size:11px;color:#c7c7d4;text-align:center;font-weight:700;line-height:1.3}
    .pnm span{display:block;color:#8a8a98;font-weight:500;font-size:10px;overflow-wrap:anywhere}
  </style>
  <script>
    // Area-normalized logo sizing (equal visual footprint, filling the tile) — matches the hobby wall.
    // Defined before <body> so img onload always resolves it.
    function pnorm(img){var box=img.parentElement;if(!box)return;var W=box.clientWidth,H=box.clientHeight;if(!W||!H){requestAnimationFrame(function(){pnorm(img);});return;}var nw=img.naturalWidth,nh=img.naturalHeight;if(!nw||!nh)return;var tA=0.40*W*H,mW=0.92*W,mH=0.74*H,sc=Math.sqrt(tA/(nw*nh));if(nw*sc>mW)sc=mW/nw;if(nh*sc>mH)sc=mH/nh;img.style.width=(100*nw*sc/W)+'%';}
  </script>
  <body>
  <div class="tabs"><button class="tab on" data-area="storeArea">Store logos · ${files.length}</button><button class="tab" data-area="pokeArea">Pokémon sets · ${pokeSetCount}</button></div>
  <div id="storeArea">
  <h2>Logo wall · ${files.length} marks</h2>
  <div class="sub">Each mark exactly as the store list renders it — same 52px tile, plate &amp; wide handling from _meta.json.</div>
  <div class="bar">
    <label class="fld">Store type
      <select id="type"><option value="">All stores</option>${types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>
    </label>
    <span class="fld">Treatment
      <span class="ms">
        <button type="button" class="ms-btn" id="treatBtn" aria-expanded="false"><span id="treatSum">All treatments</span><svg class="chev" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#aaa" stroke-width="2"><path d="M2 4l4 4 4-4"/></svg></button>
        <div class="ms-pop" id="treatPop" hidden>${TREAT.map((t) => `<label class="ms-row"><input type="checkbox" value="${t.k}" checked>${t.label}<span class="ms-ct">${tCount[t.k]}</span></label>`).join("")}</div>
      </span>
    </span>
    <span id="count"></span>
  </div>
  <div class="grid" id="grid">${files.map(tile).join("")}</div>
  </div>
  ${pokeSection}
  <script>
    var sel=document.getElementById('type'),grid=document.getElementById('grid'),count=document.getElementById('count');
    var treatBtn=document.getElementById('treatBtn'),treatPop=document.getElementById('treatPop'),treatSum=document.getElementById('treatSum');
    var boxes=[].slice.call(treatPop.querySelectorAll('input[type=checkbox]'));
    function apply(){
      var v=sel.value,sel2={},nc=0;
      boxes.forEach(function(b){if(b.checked){sel2[b.value]=1;nc++;}});
      var n=0,k=grid.children;
      for(var i=0;i<k.length;i++){var el=k[i];var show=(!v||el.getAttribute('data-type')===v)&&sel2[el.getAttribute('data-treat')]===1;el.classList.toggle('hide',!show);if(show)n++;}
      count.textContent=n+(n===1?' logo':' logos');
      treatSum.textContent=nc===boxes.length?'All treatments':(nc===0?'None':nc+' of '+boxes.length);
    }
    treatBtn.addEventListener('click',function(e){e.stopPropagation();var h=treatPop.hasAttribute('hidden');if(h){treatPop.removeAttribute('hidden');}else{treatPop.setAttribute('hidden','');}treatBtn.setAttribute('aria-expanded',h?'true':'false');});
    treatPop.addEventListener('click',function(e){e.stopPropagation();});
    // Never allow zero treatments — unchecking the last one snaps back (an empty wall is a dead end).
    boxes.forEach(function(b){b.addEventListener('change',function(){if(!boxes.some(function(x){return x.checked;})){b.checked=true;return;}apply();});});
    document.addEventListener('click',function(){treatPop.setAttribute('hidden','');treatBtn.setAttribute('aria-expanded','false');});
    sel.addEventListener('change',apply);apply();
    document.querySelectorAll('.tab').forEach(function(t){t.addEventListener('click',function(){document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('on');});t.classList.add('on');['storeArea','pokeArea'].forEach(function(id){var el=document.getElementById(id);if(el)el.hidden=(id!==t.dataset.area);});});});
  </script>
  </body>`);
});
// Pokémon TCG set logos — the "swap-to" wall for the Hobby picker. Era pills → set cards
// ([logo] · code · name · release), data-driven from data/pokemon-sets.json (data-dev's catalog)
// + the downloaded logos in public/logos/pokemon/sets/. QA page only; no auth (public logos + set names).
app.get("/logo-wall/sets", async (c) => {
  const nslug = (x: any) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  // Asset lookup by set NAME (logos + dominant colour) from the full pokemontcg.io catalog — so
  // logos/banners resolve no matter which data source drives the list.
  const logoByName = new Map<string, string | null>();
  let catalog: any = { eras: [] };
  try {
    catalog = JSON.parse(readFileSync(join(here, "../public/logos/pokemon/sets/_catalog.json"), "utf8"));
    for (const e of catalog.eras || []) for (const s of e.sets || []) logoByName.set(nslug(s.name), s.logoFile);
  } catch { /* not built yet */ }
  // Data source: prefer website-dev's expanded feed catalog (data/pokemon-sets.json) the moment it
  // lands (13 eras / 129 sets, presentation-ordered); until then use the full pokemontcg.io catalog.
  let cat: any = catalog;
  // Pull the canonical feed FRESH (owner: "ONE PULL, EVERYTHING" — GET /pub/pokemon-sets) from this
  // same origin. Falls back to the local data file, then the full card catalog, if the feed isn't on
  // this deployment yet (e.g. prod before it's promoted).
  try {
    const r = await fetch(new URL(c.req.url).origin + "/pub/pokemon-sets", { signal: AbortSignal.timeout(5000) });
    if (r.ok) { const feed: any = await r.json(); if ((feed.eras || []).length >= 5) cat = feed; }
  } catch { /* feed not reachable on this deployment yet */ }
  if (cat === catalog) { try { const f = JSON.parse(readFileSync(join(here, "../data/pokemon-sets.json"), "utf8")); if ((f.eras || []).length >= 5) cat = f; } catch { /* keep catalog */ } }
  const eras = (cat.eras || []) as Array<{ era: string; short?: string; years?: string; sets: Array<{ code: string; name: string; release: string; logoFile?: string | null }> }>;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmt = (r: string) => { const m = /^(\d{4})[-/](\d{2})/.exec(r || ""); return m ? `${MON[+m[2] - 1]} ${m[1]}` : (r || "TBA"); };
  const logoOf = (s: any) => s.logoFile || logoByName.get(nslug(s.name)) || null;
  // Real banner key-art in public/logos/sets/banners/<name>.<ext>; else the shared Pokémon fallback.
  let bannerFiles = new Set<string>();
  try { bannerFiles = new Set(readdirSync(join(here, "../public/logos/pokemon/banners")).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))); } catch { /* none yet */ }
  const bannerFor = (s: any) => { for (const k of [nslug(s.name), nslug(s.code), nslug(s.apiId)]) { if (!k) continue; for (const ext of ["jpeg", "jpg", "png", "webp"]) if (bannerFiles.has(k + "." + ext)) return k + "." + ext; } return null; };
  const fallbackBanner = bannerFiles.has("_fallback.jpeg") ? "/logos/pokemon/banners/_fallback.jpeg" : null;
  const totalSets = eras.reduce((n, e) => n + e.sets.length, 0);
  const withLogo = eras.reduce((n, e) => n + e.sets.filter((s) => logoOf(s)).length, 0);
  const withBanner = eras.reduce((n, e) => n + e.sets.filter((s) => bannerFor(s)).length, 0);
  const def = Math.max(0, eras.length - 1); // newest era shown first
  const logoCard = (s: any) => {
    const lf = logoOf(s);
    const art = lf
      ? `<div class="setart"><img src="/logos/pokemon/sets/${lf}?v=2" alt="" loading="lazy"></div>`
      : `<div class="setart noimg"><span>${esc(s.name)}</span><small>logo coming soon</small></div>`;
    return `<div class="setcard">${art}<div class="setname">${esc(s.name)}</div><div class="setmeta">${esc(s.code)} · ${esc(fmt(s.release))}</div></div>`;
  };
  const bannerCard = (s: any) => {
    const bf = bannerFor(s);
    const art = bf ? `/logos/pokemon/banners/${bf}` : fallbackBanner;
    if (!art) return `<div class="banner noimg"><span>${esc(s.name)}</span><small>banner coming soon</small></div>`;
    const lf = logoOf(s);
    const logo = lf ? `<img class="blogo" src="/logos/pokemon/sets/${lf}?v=2" alt="" loading="lazy">` : "";
    return `<div class="banner${bf ? "" : " fb"}"><img class="bart" src="${art}" alt="" loading="lazy">${logo}<div class="bcap"><b>${esc(s.name)}</b><span>${esc(s.code)} · ${esc(fmt(s.release))}</span></div></div>`;
  };
  const pills = eras.map((e, i) => `<button type="button" class="pill${i === def ? " on" : ""}" data-era="${i}">${esc(e.era)} <small>${e.sets.length}</small></button>`).join("");
  const sections = eras.map((e, i) => `<section class="era${i === def ? " on" : ""}" data-era="${i}"><h3 class="sech">Logos <small>${e.sets.length} sets</small></h3><div class="grid">${e.sets.map(logoCard).join("")}</div><h3 class="sech">Banners <small>enlarged logo · muted background</small></h3><div class="bgrid">${e.sets.map(bannerCard).join("")}</div></section>`).join("");
  return c.html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *{box-sizing:border-box}
    body{background:#0C0C12;font-family:-apple-system,system-ui,sans-serif;color:#fff;padding:20px;margin:0}
    .nav{display:flex;gap:8px;margin-bottom:14px}
    .nav a{padding:8px 14px;border-radius:999px;font-size:13px;font-weight:700;text-decoration:none;background:#1a1a22;color:#cfcfd6;border:1px solid rgba(255,255,255,.14)}
    .nav a.on{background:#22c55e;color:#06210f;border-color:transparent}
    h2{font-weight:900;margin:0 0 4px}
    .sub{color:#9a9aac;font-size:12px;margin-bottom:16px}
    .pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
    .pill{background:#16161e;color:#cfcfd6;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer}
    .pill small{color:#8a8a98;font-weight:600;margin-left:4px}
    .pill.on{border-color:#eab308;color:#fff;box-shadow:0 0 0 1px #eab308,0 0 18px rgba(234,179,8,.25)}
    .era{display:none} .era.on{display:block}
    .sech{font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:#8a8a98;margin:24px 0 12px;border-top:1px solid rgba(255,255,255,.07);padding-top:18px}
    .sech small{font-weight:600;text-transform:none;letter-spacing:0;color:#6f6f80;margin-left:8px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
    .setcard{background:#16161e;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:2px}
    .setart{height:100px;display:flex;align-items:center;justify-content:center;margin-bottom:10px}
    .setart img{max-width:100%;max-height:92px;object-fit:contain}
    .setart.noimg{flex-direction:column;gap:4px;border:1px dashed rgba(255,255,255,.14);border-radius:12px;color:#9a9aac;text-align:center;padding:8px;width:100%}
    .setart.noimg span{font-weight:800;font-size:13px;color:#cfcfd6} .setart.noimg small{font-size:11px;color:#6f6f80}
    .setname{font-weight:800;font-size:15px;line-height:1.2}
    .setmeta{font-size:12px;color:#8a8a98}
    .bgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
    .banner{position:relative;aspect-ratio:16/9;border-radius:16px;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.08);background:#0b0b11}
    .bart{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.4) saturate(.92)}
    .banner.fb .bart{filter:brightness(.28) saturate(.55)}
    .blogo{position:relative;max-width:82%;max-height:66%;object-fit:contain;filter:drop-shadow(0 10px 26px rgba(0,0,0,.85))}
    .bcap{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:1px;padding:12px 12px 9px;background:linear-gradient(transparent,rgba(0,0,0,.82))}
    .bcap b{font-size:14px;font-weight:800} .bcap span{font-size:11px;color:#c9c9d4}
    .banner.noimg{flex-direction:column;gap:5px;background:#141019;border:1px dashed rgba(255,255,255,.14);color:#9a9aac}
    .banner.noimg span{font-weight:800;font-size:15px;color:#cfcfd6;text-align:center;padding:0 12px} .banner.noimg small{font-size:11px;color:#6f6f80}
  </style>
  <body>
  <div class="nav"><a href="/logo-wall">Store logos</a><a class="on" href="/logo-wall/sets">Pokémon sets</a></div>
  <h2>Pokémon sets · ${eras.length} eras · ${totalSets} sets</h2>
  <div class="sub">${withLogo}/${totalSets} logos · ${withBanner}/${totalSets} real banners (rest use the shared Pokémon fallback) · Base Set → newest. Each era has a <b>Logos</b> and a <b>Banners</b> section — banner = enlarged logo on the muted key art. Pick an era.</div>
  <div class="pills">${pills}</div>
  ${sections}
  <script>
    var pills=[].slice.call(document.querySelectorAll('.pill'));
    var eras=[].slice.call(document.querySelectorAll('.era'));
    pills.forEach(function(p){p.addEventListener('click',function(){var e=p.getAttribute('data-era');
      pills.forEach(function(x){x.classList.toggle('on',x===p);});
      eras.forEach(function(s){s.classList.toggle('on',s.getAttribute('data-era')===e);});
      window.scrollTo(0,0);});});
  </script>
  </body>`);
});
// Owner preview: "the check" — a SOLID gradient disc with a white check CENTERED inside it, tip
// reaching the top-right edge (never past it), exactly like the reference. 4 to choose:
// flat / raised × purple / green. The winner becomes FCHK() everywhere (ticker, footer, verdicts).
app.get("/check-lab", (c) => {
  const RAMP: Record<string, [string, string]> = { purple: ["#5B1E99", "#A65CED"], green: ["#15803D", "#4ADE80"] };
  // Small, CENTERED check with clear margin from the rim (Reminders-style) — never touches/breaks the edge.
  const CHECK = "M8.1 12.2 L10.9 15.0 L16.0 8.9", SW = "2.3";
  const flat = (hue: string) => (sz: number) => { const [a, b] = RAMP[hue]; const id = `f${hue}${sz}`;
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" style="vertical-align:middle"><defs><linearGradient id="${id}" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <circle cx="12" cy="12" r="10" fill="url(#${id})"/>
      <path d="${CHECK}" stroke="#fff" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/></svg>`; };
  const raised = (hue: string) => (sz: number) => { const [a, b] = RAMP[hue]; const id = `r${hue}${sz}`, g = `gl${hue}${sz}`;
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" style="vertical-align:middle"><defs><linearGradient id="${id}" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <radialGradient id="${g}" cx="0.38" cy="0.28" r="0.8"><stop stop-color="#fff" stop-opacity="0.5"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
      <circle cx="12" cy="12" r="10" fill="url(#${id})"/>
      <circle cx="12" cy="12" r="10" fill="url(#${g})"/>
      <path d="${CHECK}" stroke="#000" stroke-opacity="0.2" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,0.6)"/>
      <path d="${CHECK}" stroke="#fff" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/></svg>`; };
  const MARKS: Record<string, { name: string; svg: (sz: number) => string }> = {
    "1": { name: "Flat · purple", svg: flat("purple") },
    "2": { name: "Raised · purple", svg: raised("purple") },
    "3": { name: "Flat · green", svg: flat("green") },
    "4": { name: "Raised · green", svg: raised("green") },
  };
  const row = (key: string) => { const m = MARKS[key]; return `
    <div style="background:#15151c;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:18px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      <div style="width:88px;text-align:center">${m.svg(72)}<div style="font-weight:900;font-size:16px;margin-top:8px">#${key}</div></div>
      <div style="flex:1;min-width:210px">
        <div style="font-weight:800;font-size:16px;margin-bottom:10px">${m.name}</div>
        <div style="display:flex;flex-direction:column;gap:9px">
          <div style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:#cfcfd8">${m.svg(15)}<b style="color:#4ADE80">Found!</b> · Target — Sunset Blvd <span style="color:#56566a;margin-left:auto">ticker</span></div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#cfcfd8">${m.svg(22)}<b>Fungibles</b> <span style="color:#56566a;margin-left:auto">footer</span></div>
          <div style="display:flex;align-items:center;gap:8px;font-weight:900;font-size:16px;color:#4ADE80">${m.svg(34)} In stock! <span style="color:#56566a;font-weight:400;font-size:12px;margin-left:auto">verdict</span></div>
        </div>
      </div>
    </div>`; };
  return c.html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#0C0C12;font-family:-apple-system,sans-serif;color:#fff;padding:20px;max-width:560px;margin:0 auto">
  <h2 style="font-weight:900;margin:0 0 4px">The Check</h2>
  <div style="color:#9a9aac;font-size:12.5px;margin-bottom:14px">Solid disc · white check centered inside, tip at the edge. Flat &amp; raised, purple &amp; green. Reply <b>1</b>, <b>2</b>, <b>3</b>, or <b>4</b>.</div>
  <div style="display:flex;flex-direction:column;gap:12px">${["1", "2", "3", "4"].map(row).join("")}</div></body>`);
});
app.get("/logos/chains/:file", (c) => {
  const file = (c.req.param("file") || "").replace(/[^a-z0-9._-]/gi, "");
  try {
    const buf = readFileSync(join(here, `../public/logos/chains/${file}`));
    const ext = file.split(".").pop()?.toLowerCase();
    c.header("Cache-Control", "public, max-age=86400");
    return c.body(buf, 200, { "Content-Type": ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/png" });
  } catch { return c.notFound(); }
});
// ---- Chain logo upload + migration (logo-r2-keystone spec, git history) ----
// Upload a chain's logo straight to shared R2 and point the chain row at it (logo_url). Server-side PUT
// via a presigned URL — one request from the Admin. ?wide=1 / ?dark=1 set the render flags. After this
// the logo travels to every environment through the DB row and can't drift.
app.post("/api/chains/:id/logo", async (c) => {
  const cfg = r2Config();
  if (!cfg) return c.json({ error: "R2 not configured (R2_* env)" }, 503);
  const id = Number(c.req.param("id"));
  const ch = (await db.select().from(chains).where(eq(chains.id, id)))[0];
  if (!ch) return c.json({ error: "chain not found" }, 404);
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength < 64) return c.json({ error: "empty or tiny image body" }, 400);
  const ct = c.req.header("content-type") || "image/png";
  const ext = /webp/i.test(ct) ? "webp" : /svg/i.test(ct) ? "svg" : "png";
  const key = `chain-logos/${chainSlug(ch.name)}.${ext}`;
  const { uploadUrl, publicUrl } = await presignPut(key, cfg, ct);
  const put = await fetch(uploadUrl, { method: "PUT", body: bytes, headers: { "content-type": ct } });
  if (!put.ok) return c.json({ error: `R2 PUT failed: ${put.status}` }, 502);
  const wide = c.req.query("wide") === "1", dark = c.req.query("dark") === "1";
  await db.update(chains).set({ logoUrl: publicUrl, logoWide: wide, logoDark: dark }).where(eq(chains.id, id));
  await refreshChainLogoDb();
  return c.json({ id, name: ch.name, logoUrl: publicUrl, wide, dark });
});

// One-time migration: push every chain's existing file logo to R2 (chain-logos/<file>) and set logo_url
// on the row. Resolves each chain through the SAME fuzzy matcher the app uses, so franchise/variant
// chains that borrow a shared file ("Franklin's Ace Hardware" → ace_hardware.png) all get pointed at it.
// Dedupes uploads by filename. ?dryRun=1 returns the plan. Fire-and-forget + resumable (re-run is safe).
let logoMigrating = false;
app.post("/api/admin/migrate-logos-to-r2", async (c) => {
  const cfg = r2Config();
  if (!cfg) return c.json({ error: "R2 not configured (R2_* env)" }, 503);
  const allChains = await db.select({ id: chains.id, name: chains.name }).from(chains);
  const plan = allChains
    .map((ch) => ({ id: ch.id, name: ch.name, file: chainLogoFile(ch.name) }))
    .filter((p): p is { id: number; name: string; file: string } => !!p.file);
  if (c.req.query("dryRun") === "1") {
    return c.json({ dryRun: true, chains: plan.length, uniqueFiles: new Set(plan.map((p) => p.file)).size, sample: plan.slice(0, 8) });
  }
  if (logoMigrating) return c.json({ started: false, running: true, chains: plan.length });
  logoMigrating = true;
  (async () => {
    const uploaded = new Set<string>();
    for (const p of plan) {
      try {
        const key = `chain-logos/${p.file}`;
        if (!uploaded.has(p.file)) {
          const buf = readFileSync(join(here, `../public/logos/chains/${p.file}`));
          const ct = p.file.endsWith(".webp") ? "image/webp" : p.file.endsWith(".svg") ? "image/svg+xml" : "image/png";
          const { uploadUrl } = await presignPut(key, cfg, ct);
          const put = await fetch(uploadUrl, { method: "PUT", body: new Uint8Array(buf), headers: { "content-type": ct } });
          if (!put.ok) { console.error("logo migrate PUT", p.file, put.status); continue; }
          uploaded.add(p.file);
        }
        const meta = logoMeta()[p.file] || { w: 0, d: 0 };
        await db.update(chains).set({ logoUrl: `${cfg.publicBase}/${key}`, logoWide: meta.w === 1, logoDark: meta.d === 1 }).where(eq(chains.id, p.id));
      } catch (e) { console.error("logo migrate", p.name, e); }
    }
    await refreshChainLogoDb();
    logoMigrating = false;
  })().catch(() => { logoMigrating = false; });
  return c.json({ started: true, chains: plan.length, uniqueFiles: new Set(plan.map((p) => p.file)).size });
});

app.get("/pub/stores", async (c) => {
  // 🔒 ADMIN-ONLY (data-exposure lockdown): this hands back the ENTIRE store table in one response.
  // The consumer site never calls it (it uses /pub/stores/near exclusively); the only legit caller is
  // admin tooling, which authenticates exactly like /api/* — x-admin-token header OR admin_session
  // cookie — so the Admin page keeps working with zero changes on its side.
  const okTok = !!config.adminToken && c.req.header("x-admin-token") === config.adminToken;
  let okCookie = false;
  if (!okTok) { const ck = getCookie(c, "admin_session"); if (ck) { const s = await verifySession(ck); okCookie = !!(s && s.id === "admin"); } }
  if (config.adminToken && !okTok && !okCookie) return c.json({ error: "unauthorized" }, 401);
  const rs = await cachedRetailers();
  const chainRows = await db.select().from(chains);
  const types = new Map(chainRows.map((x) => [x.id, x.type]));
  const names = new Map(chainRows.map((x) => [x.id, x.name]));
  // Muted chains (owner toggle, incl. repack-only stores like Fairfield) never reach consumers.
  const mutedChains = new Set(chainRows.filter((x) => x.muted === true).map((x) => x.id));
  return c.json(rs
    .filter((r) => r.phone && r.active !== false)
    .filter((r) => !r.ownerOnly) // owner-only demo store ("Fun") never appears in the admin logo map
    .filter((r) => !(r.chainId && mutedChains.has(r.chainId)))
    .map((r) => ({ id: r.id, name: r.name, location: r.location, storeType: (r.chainId && types.get(r.chainId)) || "Other",
      ...((l)=>({ logoUrl: l.url, logoWide: l.wide, logoDark: l.dark }))(chainLogoInfo((r.chainId && names.get(r.chainId)) || r.name.split(/—|–| - /)[0])),
      carries: storeCarriesList((r.chainId && names.get(r.chainId)) || null, r.carries),
      lat: r.lat, lng: r.lng, region: r.region, state: r.state, shipmentDay: r.shipmentDay || null,
      sellsPacks: r.sellsPacks !== false, hasKiosk: r.hasKiosk === true })));
});

// ---- Geo-paginated store list — THE consumer path at 100k-store scale ----
// /pub/stores ships every row (fine at ~100 stores, a page-killer at 102k). This endpoint returns
// only stores near the user: the bounding box rides the retailers(lat,lng) index, distance sorts,
// and pages. Falls back to ?state= or ?q= (SQL-side) when the visitor hasn't shared location.
// Token-AND matcher shared by the /pub/stores/near text paths: every word must hit the store's
// name-or-city; words of 5+ chars shed their last letter to absorb trailing typos ("barns" -> "barn").
function qTokenMatch(hay: string, q: string): boolean {
  const h = hay.toLowerCase();
  const toks = q.split(/\s+/).filter((t) => t.length >= 2).slice(0, 5);
  if (!toks.length) return h.includes(q);
  return toks.every((t) => h.includes(t) || (t.length >= 5 && h.includes(t.slice(0, -1))));
}
app.get("/pub/stores/near", async (c) => {
  const lat = Number(c.req.query("lat")), lng = Number(c.req.query("lng"));
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
  const state = (c.req.query("state") || "").trim().toUpperCase();
  const q = (c.req.query("q") || "").trim().toLowerCase();
  if (!hasLoc && !state && !q) return c.json({ error: "lat+lng (or state / q) required" }, 400);
  // Radius ladder (owner 2026-07-11): 0.5 / 1 / 2 / 5 / 10 mi. Free + PAYG cap at 10mi; the "any_town"
  // entitlement (Check Plus) unlocks the full range (zoom anywhere). A capped request that finds nothing
  // dialable still gets the single nearest callable store (rural fallback below) so the screen isn't blank.
  const anyTown = ((await requesterFeatures(c.req.header("Authorization"))).any_town === true);
  const FREE_MAX_MI = 10, HARD_MAX_MI = 150, DEFAULT_MI = 5;
  const maxRadius = anyTown ? HARD_MAX_MI : FREE_MAX_MI;
  const wantRadius = Math.max(Number(c.req.query("radius") || DEFAULT_MI), 0.5);
  const radius = Math.min(wantRadius, maxRadius);
  const radiusCapped = wantRadius > maxRadius; // UI surfaces the Check Plus upsell when true
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 60), 1), 200);
  const offset = Math.max(Number(c.req.query("offset") || 0), 0);
  // 🔒 Text-search hardening (data-exposure lockdown): the q-only path is the one way to page the store
  // table without a location, so it gets its own tight per-IP limit, a 2-char minimum (single letters
  // enumerate everything), and a paging-depth cap. Location/state search behavior is unchanged.
  if (!hasLoc && !state) {
    if (q.length < 2) return c.json({ error: "q must be at least 2 characters" }, 400);
    if (offset > 600) return c.json({ error: "paging too deep for text search" }, 400);
    const rl = rlCheck("storeSearch", clientIp(c.req.raw.headers), LIMITS.storeSearch);
    if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  }
  const mode = c.req.query("mode") || ""; // call | kiosk | site | "" = all
  // Store-type filter (the home chips): ?type=Hobby returns ONLY that type, SERVER-side — in a dense
  // metro the nearest-200 page is wall-to-wall Retail, so client-side filtering would starve the
  // Hobby/Thrift chips. Matches the chain's admin type exactly ("Hobby", "Thrift", …).
  let typeF = (c.req.query("type") || "").trim();
  // Thrift opt-in (Website ask): Thrift chains stay MUTED in every general feed; the Thrift chip
  // requests them EXPLICITLY with ?section=thrift, which lifts the muted filter for Thrift-type
  // chains only and pins the type filter so nothing else rides along. The global thrift master
  // switch (policy.flags.thrift) still wins — flag off = the opt-in is ignored.
  const thriftOptIn = (c.req.query("section") || "").trim().toLowerCase() === "thrift"
    && (await getPolicy()).flags.thrift !== false;
  if (thriftOptIn) typeF = "Thrift";

  const chainRows = await cachedChains();
  const types = new Map(chainRows.map((x) => [x.id, x.type]));
  const names = new Map(chainRows.map((x) => [x.id, x.name]));
  const stockMethod = new Map(chainRows.map((x) => [x.id, x.stockCheckMethod]));
  const sellMethodsByChain = new Map(chainRows.map((x) => [x.id, x.sellMethods]));
  const isMSRPByChain = new Map(chainRows.map((x) => [x.id, x.isMSRP]));
  const mutedChains = new Set(chainRows.filter((x) => x.muted === true).map((x) => x.id));
  // Call-readiness (launch "no dead-end / no wasted paid call" gate): a chain is call-ready if it rings
  // straight to a human OR its phone-tree is mapped. Consumer-direct types (Hobby/Thrift/independent)
  // ring to a person and are ready by nature. Everything else callable-but-unmapped is shown GREYED
  // ("coming soon") and never dialed — no wasted call/$. Mapping a chain (treeStatus/ringsDirect via the
  // admin) flips it ready automatically, so the greyed set shrinks as the mapping lane works.
  const ringsDirectChain = new Set(chainRows.filter((x) => x.ringsDirect === true).map((x) => x.id));
  const treeMappedChain = new Set(chainRows.filter((x) => x.treeStatus === "learned" || x.treeStatus === "verified").map((x) => x.id));
  const READY_TYPES = new Set(["Hobby", "Thrift"]);
  // Time-to-a-human for the consumer UI ("manage the expectation before the call"). Three honest
  // states, EVIDENCE-only — never a guess: {kind:"direct"} = the chain is known to ring straight to a
  // person · {kind:"menu", seconds} = mapped phone tree, seconds from the same guarded number the live
  // call uses (connectAtSecFor — bogus/stray avgTreeSeconds can never leak here) · null = not mapped
  // yet, the front-end shows nothing.
  const chainById = new Map(chainRows.map((x) => [x.id, x]));
  const reachFor = (chainId: number | null): { kind: "direct" } | { kind: "menu"; seconds: number } | null => {
    const ch = chainId != null ? chainById.get(chainId) : null;
    if (!ch) return null;
    if (ch.navType === "direct" || ch.ringsDirect === true || ch.answerPath === "direct_human") return { kind: "direct" };
    const s = connectAtSecFor(ch);
    return s != null ? { kind: "menu", seconds: s } : null;
  };

  let rows: (typeof retailers.$inferSelect)[];
  if (hasLoc) {
    const bb = bboxAround(lat, lng, radius);
    rows = await db.select().from(retailers).where(and(
      eq(retailers.active, true),
      gte(retailers.lat, bb.latMin), lte(retailers.lat, bb.latMax),
      gte(retailers.lng, bb.lngMin), lte(retailers.lng, bb.lngMax),
    ));
  } else if (state) {
    rows = await db.select().from(retailers).where(and(eq(retailers.active, true), eq(retailers.state, state)));
  } else {
    // Token-AND search so "barnes westlake" (or the typo "barns westlake") finds "Barnes & Noble
    // Westlake Village": every word must hit name OR city; words 5+ chars drop their last letter to
    // absorb trailing typos/plurals.
    const toks = q.split(/\s+/).filter((t) => t.length >= 2).slice(0, 5);
    const conds = toks.map((t) => {
      const pat = `%${t.length >= 5 ? t.slice(0, -1) : t}%`;
      return or(like(retailers.name, pat), like(retailers.location, pat));
    });
    rows = await db.select().from(retailers)
      .where(and(eq(retailers.active, true), ...(conds.length ? conds : [like(retailers.name, `%${q}%`)]))).limit(2000);
  }

  // Callable = a line we can dial at THIS store. Kiosk stores count too: even with no shelf packs
  // (sellsPacks:false) we call to verify the machine is on and stocked — kiosks go down a lot
  // (owner 2026-07-06). The shelf-only surfaces still gate on sellsPacks, so this doesn't add
  // kiosk-only stores to "most likely on the shelf".
  const callable = (r: typeof retailers.$inferSelect) => (r.sellsPacks !== false || r.hasKiosk === true) && !!r.phone && !r.phone.startsWith("nophone:");
  // callReady = safe to place a paid call (we reach a human). callable-but-not-ready → front-end greys it
  // "coming soon" and disables the call button (never dialed). Site-check stores are handled separately via
  // stockCheckMethod; the front-end precedence is muted(hidden) > site("check online") > !callReady(grey) > call.
  const callReady = (r: typeof retailers.$inferSelect) => callable(r) && (
    r.chainId == null
    || ringsDirectChain.has(r.chainId)
    || treeMappedChain.has(r.chainId)
    || READY_TYPES.has(((r.chainId && types.get(r.chainId)) || "Other") as string)
  );
  // inStock badge = a confirmed in-stock call in the last 7 days (drives the brand-check pin/row).
  const inStockSince = Math.floor(Date.now() / 1000) - 7 * 86400;
  const confirmedSet = new Set(
    (await db.select({ rid: callResults.retailerId }).from(callResults)
      .where(and(eq(callResults.confirmed, true), eq(callResults.status, "completed"), gte(callResults.completedAt, inStockSince)))
    ).map((x) => x.rid),
  );
  // Owner-only demo store ("Fun") surfaces only for the signed-in master account.
  const comp = await requesterIsComp(c.req.header("Authorization"));
  // …and for the owner it surfaces from ANYWHERE — owner-only stores (the "Fun" rehearsal store) are
  // merged in regardless of location, so the owner can test from any location, not just near it.
  if (comp) {
    const have = new Set(rows.map((r) => r.id));
    const ownerStores = await db.select().from(retailers).where(and(eq(retailers.active, true), eq(retailers.ownerOnly, true)));
    for (const o of ownerStores) if (!have.has(o.id)) rows.push(o);
  }
  // Per-store consumer shape — shared by the main list and the rural fallback so both emit identical rows.
  const shape = (r: typeof retailers.$inferSelect) => {
      const miles = hasLoc && r.lat != null && r.lng != null ? Math.round(haversineMi(lat, lng, r.lat, r.lng) * 10) / 10 : null;
      const chainName = (r.chainId && names.get(r.chainId)) || r.name.split(/—|–| - /)[0];
      return { id: r.id, chainId: r.chainId, name: r.name, location: r.location, address: r.address || null, storeType: (r.chainId && types.get(r.chainId)) || "Other",
        ...((l) => ({ logoUrl: l.url, logoWide: l.wide, logoDark: l.dark }))(chainLogoInfo(chainName)),
        carries: storeCarriesList(chainName, r.carries),
        // shipmentDay is deliberately NOT sent to consumers: it's unverified (auto-learned, junk values
        // like "every single week" rendered as "drops eve"). It returns confidence-gated once a store
        // has 2+ confirmed calls agreeing (learnedShipDow). Admin surfaces still see it via /api paths.
        lat: r.lat, lng: r.lng, region: r.region, state: r.state,
        sellsPacks: r.sellsPacks !== false, hasKiosk: r.hasKiosk === true,
        tier: r.hasKiosk === true ? 5 : (r.tier ?? null), inStock: confirmedSet.has(r.id), // any kiosk store = tier 5; inStock = brand-check pin
        callable: callable(r), callReady: callReady(r), ownerOnly: r.ownerOnly === true, // callReady:false → grey "coming soon", don't dial. ownerOnly → client shows it regardless of radius
        stockCheckMethod: (r.chainId && stockMethod.get(r.chainId)) || "call", // site = check their site, no call needed
        // Sell-methods taxonomy: how to get it (chain default), online flag, and price/source.
        sellMethods: (((r.chainId && sellMethodsByChain.get(r.chainId)) || "in_store").split(",").map((s) => s.trim()).filter(Boolean)),
        online: r.online === true,
        isMSRP: r.chainId ? isMSRPByChain.get(r.chainId) !== false : true, // false = third-party, may exceed MSRP
        mapsUri: r.mapsUri || null,
        reach: reachFor(r.chainId), // time-to-a-human: {kind:"direct"} | {kind:"menu",seconds} | null (unmapped → show nothing)
        beyondRadius: false as boolean, // set true only on the rural-fallback store (nearest dialable past the radius)
        miles, openState: openState(r.hours, r.timezone) };
  };
  const shaped = rows
    .filter((r) => comp || !r.ownerOnly)
    // Muted chains never surface — except Thrift-type chains when the Thrift chip explicitly opted in.
    .filter((r) => !(r.chainId && mutedChains.has(r.chainId)) || (thriftOptIn && r.chainId != null && types.get(r.chainId) === "Thrift"))
    .filter((r) => !mode
      || (mode === "call" && callable(r))
      || (mode === "kiosk" && r.hasKiosk === true)
      || (mode === "site" && r.chainId != null && stockMethod.get(r.chainId) === "site"))
    .filter((r) => !typeF || (((r.chainId && types.get(r.chainId)) || "Other") === typeF))
    .filter((r) => !q || qTokenMatch(`${r.name} ${r.location || ""}`, q))
    .map(shape)
    .filter((r) => r.ownerOnly || !hasLoc || r.miles == null || r.miles <= radius); // owner-only store is never distance-filtered
  // OPEN NOW ONLY (owner law 2026-07-16): a store that's closed at this moment never reaches the list —
  // a shopper can't buy from a closed door, so listing it is dead weight ("it's stupid that it even
  // shows up"). openState already folds in real hours, midnight wraps, and the closed-overnight default
  // for unknown-hours stores. Owner-only test stores are exempt (the owner tests at any hour).
  // hiddenClosed rides the response so the UI can explain a thin/empty night list instead of looking broken.
  const hiddenClosed = shaped.filter((r) => !r.ownerOnly && r.openState.open === false).length;
  const all = shaped
    .filter((r) => r.ownerOnly || r.openState.open !== false)
    .sort((a, b) => (a.miles ?? 9e9) - (b.miles ?? 9e9) || a.name.localeCompare(b.name));
  // Rural fallback: nothing dialable inside the radius → surface the single NEAREST callable+ready store
  // (up to 40mi out) so a rural screen is never blank. Only runs when the in-radius set has none, so it's
  // free in dense metros. Flagged beyondRadius so the UI can badge the distance / prompt Check Plus.
  let fallbackStore: ReturnType<typeof shape> | null = null;
  if (hasLoc && !mode && !all.some((r) => r.callable && r.callReady)) {
    const wide = bboxAround(lat, lng, 40);
    const near = (await db.select().from(retailers).where(and(
      eq(retailers.active, true),
      gte(retailers.lat, wide.latMin), lte(retailers.lat, wide.latMax),
      gte(retailers.lng, wide.lngMin), lte(retailers.lng, wide.lngMax),
    )))
      .filter((r) => !(r.chainId && mutedChains.has(r.chainId)) && callable(r) && r.lat != null && r.lng != null)
      .map((r) => ({ r, mi: haversineMi(lat, lng, r.lat as number, r.lng as number) }))
      .filter((x) => x.mi > radius)
      .sort((a, b) => a.mi - b.mi);
    for (const x of near) { const s = shape(x.r); if (s.callReady && s.openState.open !== false) { s.beyondRadius = true; fallbackStore = s; break; } } // open-now law applies to the fallback too
  }
  // Owner-only stores are pinned into the response (never lost to the distance sort + page limit),
  // so the owner always gets the "Fun" store no matter how far away they are.
  const owned = all.filter((r) => r.ownerOnly);
  // Pin the NEAREST store of each tier-5 ("green group") chain so a far green-group store always
  // surfaces. In a dense metro a 20-mile radius can hold 400+ stores (200+ of them tier-5); the page
  // limit then drops a sparse, far chain like Dollar General (its nearest store sat ~19mi out, past
  // the cut) even though it's in range. `all` is distance-sorted + radius-filtered, so the first store
  // seen per chainId is its nearest. Pinned once, on the first page only (offset 0), to avoid dupes.
  const nearestT5: typeof all = [];
  if (offset === 0) {
    const seen = new Set<number>();
    for (const r of all) {
      if (r.ownerOnly || r.tier !== 5 || r.chainId == null || seen.has(r.chainId)) continue;
      seen.add(r.chainId); nearestT5.push(r);
    }
  }
  const pinIds = new Set([...owned, ...nearestT5].map((r) => r.id));
  const rest = all.filter((r) => !r.ownerOnly && !pinIds.has(r.id));
  const stores = [...owned, ...nearestT5, ...rest.slice(offset, offset + limit)];
  if (fallbackStore && !stores.some((s) => s.id === fallbackStore!.id)) stores.push(fallbackStore);
  // radiusMax + radiusCapped let the UI cap the picker and prompt Check Plus; beyondRadius flags the rural pin.
  // hiddenClosed = in-radius stores suppressed because they're closed right now (UI: explain a thin night list).
  return c.json({ total: all.length + (fallbackStore ? 1 : 0), offset, limit, radiusMax: maxRadius, radiusCapped, hiddenClosed, stores });
});

// Single-store fetch (consumer): backfills address/logo/hours for a REOPENED call whose store sits
// outside the current nearby slice (only near-slice stores carry address on the client). Same
// per-store shape /pub/stores/near emits; owner-only stores need the comp check; muted stay hidden.
app.get("/pub/store/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const r = (await db.select().from(retailers).where(eq(retailers.id, id)))[0];
  if (!r || r.active === false) return c.json({ error: "not_found" }, 404);
  const chain = r.chainId ? (await cachedChains()).find((x) => x.id === r.chainId) : undefined;
  if (chain?.muted === true) return c.json({ error: "not_found" }, 404);
  if (r.ownerOnly && !(await requesterIsComp(c.req.header("Authorization")))) return c.json({ error: "not_found" }, 404);
  const chainName = chain?.name || r.name.split(/—|–| - /)[0];
  return c.json({ id: r.id, chainId: r.chainId, name: r.name, location: r.location, address: r.address || null,
    storeType: chain?.type || "Other",
    ...((l) => ({ logoUrl: l.url, logoWide: l.wide, logoDark: l.dark }))(chainLogoInfo(chainName)),
    carries: storeCarriesList(chainName, r.carries),
    lat: r.lat, lng: r.lng, region: r.region, state: r.state, shipmentDay: r.shipmentDay || null,
    sellsPacks: r.sellsPacks !== false, hasKiosk: r.hasKiosk === true,
    tier: r.hasKiosk === true ? 5 : (r.tier ?? null),
    // Kiosk stores are callable too (verify the machine is on) — see the near-feed note above.
    callable: (r.sellsPacks !== false || r.hasKiosk === true) && !!r.phone && !r.phone.startsWith("nophone:"),
    ownerOnly: r.ownerOnly === true,
    stockCheckMethod: chain?.stockCheckMethod || "call",
    sellMethods: (chain?.sellMethods || "in_store").split(",").map((s) => s.trim()).filter(Boolean),
    online: r.online === true, isMSRP: chain ? chain.isMSRP !== false : true,
    mapsUri: r.mapsUri || null, miles: null, openState: openState(r.hours, r.timezone) });
});

// Master/dev location override: resolve a ZIP (or free-text "city, ST") to a lat/lng using OUR OWN
// store coordinates — zero external dependency. Averages the coords of matching stores = a usable
// center to "stand" in. (Drop-a-pin on the map is the always-available alternative.)
app.get("/pub/geocode", async (c) => {
  const zip = (c.req.query("zip") || "").trim();
  const q = (c.req.query("q") || "").trim();
  if (!zip && !q) return c.json({ error: "zip or q required" }, 400);
  // ZIP matches the real zip column (exact); free text matches the human location label or zip prefix.
  const where = zip && /^\d{5}$/.test(zip)
    ? and(eq(retailers.active, true), eq(retailers.zip, zip))
    : and(eq(retailers.active, true), or(like(retailers.location, `%${q || zip}%`), like(retailers.zip, `${q || zip}%`)));
  const rows = await db.select({ lat: retailers.lat, lng: retailers.lng }).from(retailers).where(where).limit(60);
  const pts = rows.filter((r) => r.lat != null && r.lng != null) as { lat: number; lng: number }[];
  if (!pts.length) return c.json({ error: "not_found", hint: "no stores match that ZIP yet" }, 404);
  // Median is more robust than mean against a stray far-away match.
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return c.json({ lat: med(pts.map((p) => p.lat)), lng: med(pts.map((p) => p.lng)), n: pts.length, zip: zip || undefined });
});

// Pre-location UI: generic store TYPES with counts ("Pharmacy · 8,900 stores") shown before the
// visitor shares location — the cheap national overview that never ships the store table.
app.get("/pub/store-types", async (c) => {
  const chainRows = await cachedChains();
  const muted = new Set(chainRows.filter((x) => x.muted === true).map((x) => x.id));
  const counts = await db.select({ chainId: retailers.chainId, n: sql<number>`count(*)` })
    .from(retailers).where(eq(retailers.active, true)).groupBy(retailers.chainId);
  const byType = new Map<string, { type: string; stores: number; chains: string[] }>();
  for (const row of counts) {
    const ch = row.chainId != null ? chainRows.find((x) => x.id === row.chainId) : undefined;
    if (ch && muted.has(ch.id)) continue;
    const type = ch?.type || "Other";
    const e = byType.get(type) || { type, stores: 0, chains: [] };
    e.stores += Number(row.n);
    if (ch) e.chains.push(ch.name);
    byType.set(type, e);
  }
  return c.json([...byType.values()].sort((a, b) => b.stores - a.stores));
});

// ---- Stock-signal rail: shelf intel WITHOUT a call ----
// Site checkers (chains whose sites mirror the shelf — Micro Center, Best Buy, Target…) and the
// Discord cook-group listener write here via /api/stock/ingest; the consumer UI reads the
// freshest signal per store. The phone rail stays the ground truth for everything else.
app.get("/pub/stock/near", async (c) => {
  const lat = Number(c.req.query("lat")), lng = Number(c.req.query("lng"));
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
  const radius = Math.min(Math.max(Number(c.req.query("radius") || 25), 1), 150);
  const sinceHours = Math.min(Math.max(Number(c.req.query("sinceHours") || 48), 1), 24 * 14);
  const categoryId = Number(c.req.query("categoryId") || 0) || undefined;
  return c.json(await recentStockNear(hasLoc ? lat : null, hasLoc ? lng : null, radius, sinceHours, categoryId));
});
app.get("/pub/stock/store/:id", async (c) => c.json(await latestForRetailer(Number(c.req.param("id")))));
app.post("/api/stock/ingest", async (c) => {
  const b = await c.req.json();
  const items = Array.isArray(b) ? b : b?.signals;
  if (!Array.isArray(items) || !items.length) return c.json({ error: "signals[] required" }, 400);
  const out = await ingestSignals(items);
  // A confirmed restock at a known store → text everyone watching it (cap + cooldown enforced in fanoutRestock).
  let notified = 0;
  for (const it of items) {
    if (it?.status !== "in_stock" || !it?.retailerId) continue;
    const st = (await db.select({ name: retailers.name }).from(retailers).where(eq(retailers.id, Number(it.retailerId))))[0];
    const r = await fanoutRestock(Number(it.retailerId), { storeName: (st?.name || "the store").split("—")[0].trim(), product: it.product, categoryId: it.categoryId ?? null });
    notified += r.notified;
  }
  return c.json({ ...out, restockNotified: notified });
});
// New intel revision landed in data/stock_check_intel.json → push it over already-classified
// chains (the boot seed only fills blanks). Deliberate owner action, hence force.
app.post("/api/stock/intel/reapply", async (c) => {
  const applied = await seedStockCheckIntel(true);
  invalidateRefCache();
  return c.json({ applied });
});
// Reapply the sell-methods taxonomy (data/sell_methods_intel.json) over already-seeded chains.
app.post("/api/sell-methods/reapply", async (c) => {
  const applied = await seedSellMethods(true);
  invalidateRefCache();
  return c.json({ applied });
});

// Discord cook-group channel registry — which channels the listener watches, and what chain each maps to.
app.get("/api/discord/channels", async (c) => c.json(await db.select().from(discordChannels).orderBy(desc(discordChannels.createdAt))));
app.post("/api/discord/channels", async (c) => {
  const b = await c.req.json();
  const items: Array<{ channelId?: string; label?: string; chain?: string; category?: string; note?: string; active?: boolean }> = Array.isArray(b) ? b : [b];
  let upserted = 0;
  for (const it of items) {
    if (!it.channelId) continue;
    await db.insert(discordChannels)
      .values({ channelId: String(it.channelId), label: it.label ?? null, chain: it.chain ?? null,
        category: it.category || "Pokémon", note: it.note ?? null, active: it.active !== false })
      .onConflictDoUpdate({ target: discordChannels.channelId,
        set: { label: it.label ?? null, chain: it.chain ?? null, category: it.category || "Pokémon", note: it.note ?? null, active: it.active !== false } });
    upserted++;
  }
  invalidateRefCache();
  return c.json({ upserted });
});
app.delete("/api/discord/channels/:id", async (c) => {
  await db.delete(discordChannels).where(eq(discordChannels.id, Number(c.req.param("id"))));
  return c.json({ ok: true });
});

// "Best bet near you" — rank nearby open stores by how likely a check pays off now (shipment-day
// timing + confirm history/recency + proximity). The recommendation layer over the restock database.
function tzDow(tz: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz || "America/Chicago", weekday: "short" }).format(new Date());
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[wd] ?? 0;
}
// Accepts full names, abbreviations, and plurals ("Thursday" / "Thu" / "thursdays") — shipmentDay is
// stored raw from the call transcript, so normalize the same way the rest of the codebase does.
const SHIP_DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
function shipDow(s: string | null | undefined): number | null {
  if (!s) return null;
  const k = s.trim().toLowerCase().replace(/s$/, "").slice(0, 3);
  return SHIP_DOW[k] ?? null;
}
// Weekday (0=Sun … 6=Sat) of a PAST timestamp in a store's local time — for the empirical "which day
// did product actually land" histogram (vs tzDow, which is only today).
function dowAt(epochSec: number, tz: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz || "America/Chicago", weekday: "short" }).format(new Date(epochSec * 1000));
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[wd] ?? 0;
}
// The LEARNED restock weekday: the MODE of every shipment day staff have given across this store's
// confirmed calls — robust to one wrong answer, unlike the last-write-wins shipmentDay column —
// falling back to the stored shipmentDay when there's no call history yet. How best-bet "learns" the
// day from all the calls instead of just the most recent one.
function learnedShipDow(days: Record<string, number> | undefined, fallback: string | null | undefined): number | null {
  if (days) {
    const top = Object.entries(days).sort((a, b) => b[1] - a[1])[0]?.[0];
    const d = shipDow(top);
    if (d != null) return d;
  }
  return shipDow(fallback);
}
// ---- Canonical Pokémon era/set registry (the Hobby picker's data) ----
// data/pokemon-sets.json is the source of truth: every era back to Base Set 1999, sets with official
// codes + release dates, newest first (Data Dev keeps it current; upcoming sets ship early with future
// dates so the front end can badge them). Serve-time we attach each set's known PRODUCT TYPES + retail
// anchors from the products catalog (recent sets only) — one pull powers era → set → type. Sets with
// no catalog rows return products: [] (front end falls back to generic types). Cached 5 min.
let pokemonSetsCache: { t: number; v: unknown } | null = null;
// Display polish for the set → product picker: spell out cryptic type codes, and order the cards the way
// a shop lists them (packs → boxes → blisters → ETBs → collections) instead of DB insertion order.
const PRETTY_TYPE: Record<string, string> = {
  "PC ETB": "Pokémon Center Elite Trainer Box", "Pokémon Center ETB": "Pokémon Center Elite Trainer Box",
  "ETB": "Elite Trainer Box", "Three-Pack Blister": "3-Pack Blister", "Prerelease Kit": "Pre-Release Kit",
};
const prettyType = (t: string): string => PRETTY_TYPE[t] ?? t;
const TYPE_ORDER = ["Booster Pack", "Booster Bundle", "Booster Box", "Single-Pack Blister", "1-Pack Blister",
  "2-Pack Blister", "3-Pack Blister", "Checklane Blister", "Elite Trainer Box", "Pokémon Center Elite Trainer Box",
  "Build & Battle", "Build & Battle Stadium", "Theme Deck", "Starter Deck", "Starter Set", "Starter Kit",
  "Trainer Kit", "Pre-Release Kit", "Premium Collection", "Ultra-Premium Collection", "Super-Premium Collection",
  "Special Collection", "Collection Box", "Surprise Box", "Collector Chest", "Standard Tin", "Mini Tin",
  "Stacking Tin", "Poster Collection", "Binder Collection", "Sticker Collection"];
const orderProducts = (ps: Array<{ type: string; retail: number | null }>) => {
  const seen = new Set<string>();
  return ps.filter((p) => !seen.has(p.type) && !!seen.add(p.type)) // dedup by display label
    .sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a.type), ib = TYPE_ORDER.indexOf(b.type);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.type.localeCompare(b.type);
    });
};
app.get("/pub/pokemon-sets", async (c) => {
  if (pokemonSetsCache && Date.now() - pokemonSetsCache.t < 300_000) return c.json(pokemonSetsCache.v);
  const file = JSON.parse(readFileSync(join(here, "../data/pokemon-sets.json"), "utf8")) as
    { v: number; updated: string; category: string; eras: Array<{ era: string; code: string; years: string; sets: Array<Record<string, unknown>> }> };
  // Catalog series names vary slightly from registry names ("Mega Evolution (base)", "Black Bolt/White
  // Flare") — normalize both sides before matching.
  const norm = (s: string) => s.toLowerCase().replace(/\s*\(base\)\s*/g, "").replace(/\s*\/\s*/g, " & ").trim();
  const pokeCats = new Set([...(await categoryLabelMap()).entries()].filter(([, l]) => /pok/i.test(l)).map(([id]) => id));
  const rows = (await db.select().from(products))
    .filter((p) => p.active !== false && pokeCats.has(p.categoryId) && p.series && p.type && p.type !== "Single");
  const bySet = new Map<string, Map<string, number | null>>();
  for (const p of rows) {
    const k = norm(p.series as string);
    let m = bySet.get(k); if (!m) { m = new Map(); bySet.set(k, m); }
    // one entry per type; keep the first real price seen (retailer copies share the same retail price)
    if (!m.has(p.type as string) || (m.get(p.type as string) == null && p.msrp != null)) m.set(p.type as string, p.msrp ?? null);
  }
  // Logo/banner CONTRACT: asset URLs are derived from the set code (stable, verified) as SAME-ORIGIN
  // paths under public/logos/ — the same repo folder + /logo-wall system the logo dev already works
  // in for chains (NOT the R2 bucket). Logo dev drops files at exactly these paths, the front end
  // renders feed.logo/banner with a text fallback until each asset lands, and the images ship with
  // the same branch/promotion as the code. Zero coordination.
  //   set logo  -> public/logos/pokemon/sets/<logoKey>.png    (served at /logos/pokemon/sets/…)
  //   set banner-> public/logos/pokemon/banners/<logoKey>.png (served at /logos/pokemon/banners/…)
  //   era logo  -> public/logos/pokemon/eras/<era-slug>.png   (served at /logos/pokemon/eras/…)
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Cache-bust: the service worker caches /logos/* cache-first, so bump this whenever the set assets
  // are re-cut and the front end will request fresh URLs (old cached copies are orphaned harmlessly).
  const av = "?v=9";
  const v = { ...file, logoBase: "/logos/pokemon", eras: file.eras.map((e) => ({ ...e,
    slug: slug(e.era), logo: `/logos/pokemon/eras/${slug(e.era)}.png${av}`,
    sets: e.sets.map((s) => ({ ...s,
      logoKey: slug(String(s.code)),
      logo: `/logos/pokemon/sets/${slug(String(s.code))}.png${av}`,
      banner: `/logos/pokemon/banners/${slug(String(s.code))}.png${av}`,
      products: orderProducts([...(bySet.get(norm(String(s.name))) ?? new Map<string, number | null>()).entries()].map(([type, retail]) => ({ type: prettyType(type), retail }))) })) })) };
  pokemonSetsCache = { t: Date.now(), v };
  return c.json(v);
});

// Product FORM ("how it's sold") classifier over the free-text productDetail we capture per call
// (staff name it: "booster box", "Surging Sparks ETB", "3-pack blister"). The verdict extractor
// already pulls form+set separately but persists only the combined label, so we re-derive the form
// here at serve time for reporting. Order matters — the more specific pattern wins (hobby/mega/retail
// box before a plain "box"; blister/pack before a bare "pack").
const PRODUCT_FORMS: Array<[RegExp, string]> = [
  [/hobby\s*box/i, "Hobby box"],
  [/booster\s*box/i, "Booster box"],
  [/mega\s*box/i, "Mega box"],
  [/retail\s*box|gravity\s*feed/i, "Retail box"],
  [/elite\s*trainer|\betb\b/i, "ETB"],
  [/blister|\b\d\s*-?\s*pack\b|three-?pack/i, "Blister/pack"],
  [/booster\s*(pack|bundle)|\bpacks?\b/i, "Booster packs"],
  [/\btins?\b/i, "Tin"],
  [/sleeve/i, "Sleeve"],
  [/hanger/i, "Hanger"],
  [/bundle/i, "Bundle"],
  [/collection|\bbox\s*set\b|\bbox\b/i, "Box/collection"],
];
function productForm(detail: string | null | undefined): string | null {
  if (!detail) return null;
  for (const [re, label] of PRODUCT_FORMS) if (re.test(detail)) return label;
  return null;
}
// Best-effort SET name from the same free text. productDetailLabel formats "form · set", so the part
// after "·" is the set; a single token that isn't a known form is treated as a set/name hint. Honest
// caveat: clean set-level reporting needs the extractor's `set` field persisted as its own column.
function productSet(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const parts = detail.split("·").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  return productForm(detail) ? null : parts[0] || null;
}
const tallyArr = (m: Record<string, number>, key: string) =>
  Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ [key]: k, n }));
app.get("/pub/best-bet", async (c) => {
  const lat = Number(c.req.query("lat")), lng = Number(c.req.query("lng"));
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
  const categoryId = Number(c.req.query("categoryId") || 0);
  const radius = Number(c.req.query("radius") || 25);
  const cat = categoryId ? (await categoryLabelMap()).get(categoryId) : null;
  // Confirm history per store — filter in SQL (confirmed+completed) and pull only the columns we need,
  // so this public path never loads the whole call_results table (transcripts included) into memory.
  const confirmed = (await db.select({ retailerId: callResults.retailerId, categoryId: callResults.categoryId, completedAt: callResults.completedAt, startedAt: callResults.startedAt, shipmentDayHeard: callResults.shipmentDayHeard })
    .from(callResults).where(and(eq(callResults.confirmed, true), eq(callResults.status, "completed"))))
    .filter((r) => !categoryId || r.categoryId === categoryId);
  const byStore = new Map<number, { confirms: number; last: number; days: Record<string, number> }>();
  for (const r of confirmed) {
    const e = byStore.get(r.retailerId) || { confirms: 0, last: 0, days: {} };
    e.confirms++; const at = r.completedAt ?? r.startedAt; if (at > e.last) e.last = at;
    // Tally the restock day staff gave on each confirmed call. The mode is the LEARNED day.
    if (r.shipmentDayHeard) e.days[r.shipmentDayHeard] = (e.days[r.shipmentDayHeard] || 0) + 1;
    byStore.set(r.retailerId, e);
  }
  const now = Math.floor(Date.now() / 1000);
  // Pull only the stores in the search box from the DB (rides the lat/lng filter) — never load the
  // whole 100k table into memory here. No location → no best-bet (the consumer only calls with coords).
  if (!hasLoc) return c.json([]);
  const bb = bboxAround(lat, lng, radius);
  const near = await db.select().from(retailers).where(and(
    eq(retailers.active, true),
    gte(retailers.lat, bb.latMin), lte(retailers.lat, bb.latMax),
    gte(retailers.lng, bb.lngMin), lte(retailers.lng, bb.lngMax),
  )).limit(1500);
  const comp = await requesterIsComp(c.req.header("Authorization"));
  const cands = near
    .filter((r) => comp || !r.ownerOnly) // owner-only demo store ("Fun") only for the master account
    .filter((r) => r.phone && r.active !== false)
    .filter((r) => r.sellsPacks !== false) // "most likely to have it on the SHELF" — exclude kiosk-only stores (e.g. Pavilions)
    .filter((r) => openState(r.hours, r.timezone).open !== false) // open or unknown, never closed
    .filter((r) => !cat || !(r.carries) || r.carries.toLowerCase().includes(cat.toLowerCase()))
    .map((r) => {
      const miles = (hasLoc && r.lat != null && r.lng != null) ? haversineMi(lat, lng, r.lat, r.lng) : null;
      const hist = byStore.get(r.id);
      return { id: r.id, name: r.name.split("—")[0].trim(), miles, signals: {
        // shipmentDow stays OFF for consumers: restock day is unverified data, so it neither ranks
        // nor labels a best bet ("usually restocks Friday" is gone) until a store's day is confirmed
        // by 2+ agreeing calls (owner rule, 2026-07-02). learnedShipDow is the comeback path.
        miles, todayDow: tzDow(r.timezone), shipmentDow: null,
        confirms: hist?.confirms ?? 0, lastConfirmAgoHrs: hist ? Math.round((now - hist.last) / 3600) : null,
      } };
    })
    .filter((r) => r.miles == null || r.miles <= radius);
  const top = rankBets(cands, 3).map((t) => ({ id: t.id, name: t.name, miles: t.miles, score: t.bet.score, tag: t.bet.tag, why: t.bet.reasons.join(" · ") }));
  return c.json(top);
});

// Recently confirmed in-stock finds (real social proof for the Runnr home screen).
app.get("/pub/finds", async (c) => {
  const pol = await getPolicy();
  if (!pol.finds.publicFeed) return c.json([]);
  const cats = await categoryLabelMap();
  const stores = await retailerMap();
  // Location: once the visitor has shared where they are, only show finds NEAR them — never finds from
  // hundreds of miles away. Before location is shared, the national feed stands in as social proof.
  const flat = Number(c.req.query("lat")), flng = Number(c.req.query("lng"));
  const fradius = Number(c.req.query("radius")) || 25;
  const fHasLoc = Number.isFinite(flat) && Number.isFinite(flng);
  const ownerOnly = await ownerOnlyRetailerIds(); // Fun / MVP's etc. are rehearsal stores — never real finds
  // Headstart: a paid finder's result stays off the public feed for headstartMin minutes.
  const cutoff = Date.now() - pol.finds.headstartMin * 60_000;
  const rows = (await db.select().from(callResults)
    .where(and(eq(callResults.confirmed, true), eq(callResults.status, "completed")))
    .orderBy(desc(callResults.completedAt)).limit(60))
    // Owner-only rehearsal stores (Fun, MVP's, …) are never genuine finds → keep them out of the banner.
    .filter((r) => !ownerOnly.has(r.retailerId))
    // Privacy: never surface a find marked private (subscriber perk / paid privacy).
    .filter((r) => r.isPrivate !== true)
    // Headstart: only after the finder's lead time has elapsed.
    .filter((r) => (r.completedAt ?? r.startedAt) <= cutoff)
    // Near the visitor only (when they've shared location). No location on the store → can't confirm it's
    // local → leave it out of a localized feed.
    .filter((r) => { if (!fHasLoc) return true; const st = stores.get(r.retailerId); return !!st && st.lat != null && st.lng != null && haversineMi(flat, flng, st.lat, st.lng) <= fradius; })
    .slice(0, 10);
  return c.json(rows.map((r) => ({
    store: (stores.get(r.retailerId)?.name || "A store").split("—")[0].trim(),
    category: cats.get(r.categoryId) || "cards",
    at: r.completedAt ?? r.startedAt,
  })));
});
app.get("/pub/categories", async (c) => c.json(await cachedCategories()));

// ---- Community: kiosks (crowd-sourced refresh intel → free checks) + restock watches ----
function kioskSummary(minutesCsv: string, interval?: number | null): string {
  const mins = minutesCsv.split(",").map((s) => s.trim()).filter(Boolean);
  const at = mins.length ? mins.map((m) => ":" + m.padStart(2, "0")).join(" & ") : "";
  const every = interval ? ` — every ${interval} min` : "";
  return (at + every).trim() || "timing reported";
}
// Social proof: how many people are actively waiting on this store+category (FOMO + network effect).
app.get("/pub/watch-count", async (c) => {
  const retailerId = Number(c.req.query("retailerId") || 0), categoryId = Number(c.req.query("categoryId") || 0);
  if (!retailerId || !categoryId) return c.json({ count: 0 });
  const rows = await db.select().from(watches)
    .where(and(eq(watches.retailerId, retailerId), eq(watches.categoryId, categoryId), eq(watches.active, true)));
  return c.json({ count: rows.length });
});
// ---- Kiosk receipt verification: email your receipt → verified intel + a free call ----
app.get("/pub/kiosk-receipt/start", async (c) => {
  const pol = await getPolicy();
  if (!pol.flags.kioskReceipts) return c.json({ error: "off" }, 403);
  return c.json({ email: process.env.GMAIL_USER || "restocktimer@gmail.com", since: Date.now(), live: isGmailConfigured() });
});
app.get("/pub/kiosk-receipt/poll", async (c) => {
  const pol = await getPolicy();
  if (!pol.flags.kioskReceipts) return c.json({ error: "off" }, 403);
  const since = Math.floor(Number(c.req.query("since") || 0) / 1000);
  const device = (c.req.query("device") || clientIp(c.req.raw.headers)).slice(0, 80);
  // Newest unclaimed receipt ingested since this widget opened.
  const cand = (await db.select().from(kioskReceipts)
    .where(and(gte(kioskReceipts.createdAt, since), isNull(kioskReceipts.claimedBy)))
    .orderBy(desc(kioskReceipts.createdAt)).limit(1))[0];
  if (!cand) return c.json({ found: false });
  await db.update(kioskReceipts).set({ claimedBy: device }).where(eq(kioskReceipts.id, cand.id));
  // Reward: logged-in → credits; anon → free device check.
  const reward = pol.rewards.kioskRefreshChecks;
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (u && reward > 0) { await getAccount(u.id, u.email); await grantCredits(u.id, reward); }
  return c.json({ found: true, receipt: { product: cand.product, machineId: cand.machineId, at: cand.txnAt }, reward: u ? { credits: reward } : { freeCheck: reward > 0, checks: reward } });
});
app.get("/api/kiosk-receipts", async (c) => c.json(await db.select().from(kioskReceipts).orderBy(desc(kioskReceipts.createdAt))));
// Diagnostic: read the ingest inbox + show the parser's verdict per email (incl. rejects) so we can see
// why a receipt did/didn't land. Read-only, gated by the /api/* admin auth. hours=1..168 (default 72).
app.get("/api/admin/receipts/inbox-debug", async (c) => {
  const hours = Math.min(168, Math.max(1, Number(c.req.query("hours")) || 72));
  try { return c.json({ ok: true, configured: isGmailConfigured(), rows: await debugRecentInbox(hours * 3600_000) }); }
  catch (e) { return c.json({ ok: false, error: String((e as Error)?.message || e) }, 500); }
});
app.get("/pub/kiosks", async (c) => {
  const lat = Number(c.req.query("lat")), lng = Number(c.req.query("lng")), radius = Number(c.req.query("radius") || 25);
  let rows = await db.select().from(kiosks);
  if (lat && lng) rows = rows.filter((k) => k.lat != null && k.lng != null && haversineMi(lat, lng, k.lat, k.lng) <= radius)
    .sort((x, y) => haversineMi(lat, lng, x.lat!, x.lng!) - haversineMi(lat, lng, y.lat!, y.lng!));
  return c.json(rows.map((k) => ({ id: k.id, label: k.label, category: k.category, refreshSummary: k.refreshSummary, reports: k.reports, lat: k.lat, lng: k.lng })));
});
app.post("/pub/kiosks/report", async (c) => {
  const rl = rlCheck("reward", clientIp(c.req.raw.headers), LIMITS.reward);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const b = await c.req.json();
  const cat = b.category || "Pokémon";
  let kioskId = Number(b.kioskId) || 0;
  if (!kioskId) {
    if (b.retailerId) {
      const r = (await db.select().from(retailers).where(eq(retailers.id, Number(b.retailerId))))[0];
      if (!r) return c.json({ error: "store not found" }, 400);
      const ex = (await db.select().from(kiosks).where(and(eq(kiosks.retailerId, r.id), eq(kiosks.category, cat))))[0];
      if (ex) kioskId = ex.id;
      else { const [k] = await db.insert(kiosks).values({ retailerId: r.id, label: `${cat} kiosk — ${r.name}`, category: cat, lat: r.lat, lng: r.lng, state: r.state, region: r.region }).returning(); kioskId = k.id; }
    } else if (b.label) {
      const [k] = await db.insert(kiosks).values({ label: b.label, category: cat, lat: b.lat ?? null, lng: b.lng ?? null }).returning(); kioskId = k.id;
    } else return c.json({ error: "need kioskId, retailerId, or label" }, 400);
  }
  const minutes = Array.isArray(b.minutes) ? b.minutes.join(",") : String(b.minutes || "");
  await db.insert(kioskReports).values({ kioskId, minutes, intervalMin: b.intervalMin ?? null, note: b.note ?? null, contact: b.contact ?? null });
  const count = (await db.select().from(kioskReports).where(eq(kioskReports.kioskId, kioskId))).length;
  await db.update(kiosks).set({ refreshSummary: kioskSummary(minutes, b.intervalMin), reports: count }).where(eq(kiosks.id, kioskId));
  // Reward: logged-in → credits; anonymous → unlock a free check on the device.
  const reward = (await getPolicy()).rewards.kioskRefreshChecks;
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (u && reward > 0) { await getAccount(u.id, u.email); await grantCredits(u.id, reward); return c.json({ ok: true, kioskId, reward: { credits: reward } }); }
  return c.json({ ok: true, kioskId, reward: { freeCheck: reward > 0, checks: reward } });
});
app.get("/api/kiosks", async (c) => c.json(await db.select().from(kiosks)));

app.post("/pub/watch", async (c) => {
  const rl = rlCheck("watch", clientIp(c.req.raw.headers), LIMITS.watch);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const b = await c.req.json();
  if (!b.contact || !b.retailerId || !b.categoryId) return c.json({ error: "contact, retailerId, categoryId required" }, 400);
  const channel = String(b.contact).includes("@") ? "email" : "sms";
  await db.insert(watches).values({ contact: b.contact, channel, retailerId: Number(b.retailerId), categoryId: Number(b.categoryId) });
  return c.json({ ok: true });
});
app.get("/api/watches", async (c) => c.json(await db.select().from(watches).orderBy(desc(watches.createdAt))));

// ---- Community "I scored!" wall (moderated, flag-gated) ----
app.get("/pub/community", async (c) => {
  const pol = await getPolicy();
  if (!pol.flags.community) return c.json([]);
  const cats = await categoryLabelMap();
  const stores = await retailerMap();
  // Modular per vertical: a brand site (?categoryId=) shows only ITS scores; the "all" site shows everything.
  const catId = Number(c.req.query("categoryId") || 0);
  const where = catId ? and(eq(communityPosts.approved, true), eq(communityPosts.categoryId, catId)) : eq(communityPosts.approved, true);
  const rows = (await db.select().from(communityPosts).where(where)
    .orderBy(desc(communityPosts.createdAt)).limit(60));
  return c.json(rows.map((p) => ({
    // Inline base64 photos are megabytes each — serve them via a tiny image endpoint so the feed JSON
    // stays small (it was 1MB+ for 4 posts, which left the feed slow/empty). Real URLs pass through.
    id: p.id, handle: p.handle || null, caption: p.caption,
    imageUrl: (p.imageUrl || "").startsWith("data:") ? `/pub/community/${p.id}/image` : p.imageUrl,
    retailerId: p.retailerId ?? null,
    store: p.retailerId ? (stores.get(p.retailerId)?.name || "").split("—")[0].trim() : null,
    storeFull: p.retailerId ? (stores.get(p.retailerId)?.name ?? null) : null,
    location: p.retailerId ? (stores.get(p.retailerId)?.location ?? null) : null,
    region: p.retailerId ? (stores.get(p.retailerId)?.region ?? null) : null,
    state: p.retailerId ? (stores.get(p.retailerId)?.state ?? null) : null,
    category: p.categoryId ? cats.get(p.categoryId) : null, likes: p.likes, at: p.createdAt,
  })));
});
// Serve a score photo (decodes the stored base64 data-URI to real image bytes; cached). Keeps the
// feed JSON tiny while photos load on demand.
app.get("/pub/community/:id/image", async (c) => {
  const id = Number(c.req.param("id"));
  const row = (await db.select().from(communityPosts).where(eq(communityPosts.id, id)))[0];
  const u = row?.imageUrl || "";
  if (!u) return c.notFound();
  if (!u.startsWith("data:")) return c.redirect(u, 302);
  const m = u.match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) return c.notFound();
  const buf = Buffer.from(m[2], "base64");
  // XSS guard: never serve user content as a script-capable type (e.g. image/svg+xml can carry
  // <script>). Whitelist raster types; anything else is forced to a non-renderable download, with
  // no-sniff + a locked-down CSP so the browser can't execute it.
  const SAFE_IMG = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
  const ct = SAFE_IMG.has((m[1] || "").toLowerCase()) ? m[1] : "application/octet-stream";
  c.header("Cache-Control", "public, max-age=86400");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Security-Policy", "default-src 'none'; sandbox");
  return c.body(buf, 200, { "Content-Type": ct });
});
// Hand the phone a presigned R2 URL so it uploads the photo directly (bytes never hit our server).
app.post("/pub/community/upload-url", async (c) => {
  const pol = await getPolicy();
  if (!pol.flags.community) return c.json({ error: "community_off" }, 403);
  const rl = rlCheck("communityUpload", clientIp(c.req.raw.headers), LIMITS.communityUpload);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const cfg = r2Config();
  if (!cfg) return c.json({ error: "uploads_not_configured" }, 503);
  const b = await c.req.json().catch(() => ({}));
  const ext = String(b.ext || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 4);
  const key = photoKey(ext);
  const { uploadUrl, publicUrl } = await presignPut(key, cfg, b.contentType || "image/jpeg");
  return c.json({ uploadUrl, publicUrl, key });
});
app.post("/pub/community/post", async (c) => {
  const pol = await getPolicy();
  if (!pol.flags.community) return c.json({ error: "community_off" }, 403);
  const rl = rlCheck("community", clientIp(c.req.raw.headers), LIMITS.community);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const b = await c.req.json();
  if (!b.imageUrl || typeof b.imageUrl !== "string") return c.json({ error: "imageUrl required" }, 400);
  // Accept: our R2 public base, our own /uploads, or a small inline data-URL image (pre-R2 fallback).
  const allowed = (process.env.R2_PUBLIC_BASE || "").replace(/\/$/, "");
  const okHost = (allowed && b.imageUrl.startsWith(allowed)) || b.imageUrl.startsWith("/uploads/")
    || (b.imageUrl.startsWith("data:image/") && !/^data:image\/svg/i.test(b.imageUrl) && b.imageUrl.length <= 500_000);
  if (!okHost) return c.json({ error: "image must be uploaded via our upload URL" }, 400);
  const u = await verifyClerkToken(c.req.header("Authorization"));
  const [row] = await db.insert(communityPosts).values({
    finderUserId: u?.id ?? null, handle: (b.handle || "").slice(0, 40) || null,
    retailerId: b.retailerId ? Number(b.retailerId) : null, categoryId: b.categoryId ? Number(b.categoryId) : null,
    caption: (b.caption || "").slice(0, 240) || null, imageUrl: b.imageUrl, imageKey: b.imageKey || null,
    approved: pol.flags.communityAutoApprove,
  }).returning();
  return c.json({ ok: true, id: row.id, pending: !pol.flags.communityAutoApprove });
});
app.post("/pub/community/:id/like", async (c) => {
  const pol = await getPolicy();
  if (!pol.flags.community) return c.json({ error: "community_off" }, 403);
  const rl = rlCheck("write", clientIp(c.req.raw.headers), LIMITS.write);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const id = Number(c.req.param("id"));
  const p = (await db.select().from(communityPosts).where(eq(communityPosts.id, id)))[0];
  if (!p || !p.approved) return c.json({ error: "not found" }, 404);
  // Atomic increment — avoids the lost-update race of read-then-write under concurrency.
  await db.update(communityPosts).set({ likes: sql`${communityPosts.likes} + 1` }).where(eq(communityPosts.id, id));
  return c.json({ ok: true, likes: p.likes + 1 });
});
// Admin moderation: list all, approve/unapprove, delete.
app.get("/api/community", async (c) => c.json(await db.select().from(communityPosts).orderBy(desc(communityPosts.createdAt))));
app.patch("/api/community/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json();
  if (typeof b.approved === "boolean") await db.update(communityPosts).set({ approved: b.approved }).where(eq(communityPosts.id, id));
  return c.json({ ok: true });
});
app.delete("/api/community/:id", async (c) => {
  await db.delete(communityPosts).where(eq(communityPosts.id, Number(c.req.param("id"))));
  return c.json({ ok: true });
});

// ---- Policy: owner-tunable pricing / headstart / privacy / feature flags ----
app.get("/pub/policy", async (c) => c.json(await publicPolicy()));
app.get("/api/policy", async (c) => c.json({ ...(await getPolicy()), catalog: { sub: SUB, packs: PACKS } }));
app.patch("/api/policy", async (c) => {
  try { return c.json(await setPolicy(await c.req.json())); } catch (e) { return c.json({ error: String(e) }, 400); }
});

// ---- Store CMS: import / update / soft-remove from a JSON file ----
app.post("/api/stores/import", async (c) => {
  const b = await c.req.json();
  const items = Array.isArray(b) ? b : (b.stores || b.items);
  if (!Array.isArray(items)) return c.json({ error: "expected an array of stores, or { stores: [...] }" }, 400);
  try { const r = await importStores(items); invalidateRefCache(); return c.json(r); } catch (e) { return c.json({ error: String(e) }, 400); }
});
app.post("/api/stores/backfill-regions", async (c) => { const updated = await backfillRegions(); invalidateRefCache(); return c.json({ updated }); });
// Soft-remove stores whose name or chain matches any term (e.g. chains that don't sell at MSRP).
app.post("/api/stores/deactivate", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  // Phone-precise mode: deactivate exact rows by E.164 phone (surgical cleanup, reversible).
  const phones: string[] = (Array.isArray(b.phones) ? b.phones : []).map((p: unknown) => String(p).trim()).filter(Boolean);
  if (phones.length) {
    let deactivated = 0;
    for (let i = 0; i < phones.length; i += 500) {
      const batch = phones.slice(i, i + 500);
      const r = await db.update(retailers).set({ active: false }).where(and(inArray(retailers.phone, batch), eq(retailers.active, true)));
      deactivated += r.rowsAffected ?? 0;
    }
    invalidateRefCache();
    return c.json({ deactivated, by: "phone" });
  }
  const terms: string[] = (Array.isArray(b.terms) ? b.terms : []).map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean);
  if (!terms.length) return c.json({ error: "terms[] or phones[] required" }, 400);
  const chainName = new Map((await db.select().from(chains)).map((x) => [x.id, (x.name || "").toLowerCase()]));
  let deactivated = 0;
  for (const r of await db.select().from(retailers)) {
    const hay = `${r.name || ""} ${r.chainId ? chainName.get(r.chainId) || "" : ""}`.toLowerCase();
    if (terms.some((t) => hay.includes(t)) && r.active !== false) {
      await db.update(retailers).set({ active: false }).where(eq(retailers.id, r.id)); deactivated++;
    }
  }
  invalidateRefCache();
  return c.json({ deactivated });
});
// Flag matching stores as kiosks and/or (non-)callable (e.g. mark Vons/Albertsons/Pavilions kiosk-only).
// Field-safe BULK patch (Data Dev cleanup): updates ONLY the provided fields on matching stores —
// filter by id list, chain name, and/or state — without touching anything else. `clearHours` blanks
// fake/placeholder hours. `dryRun` returns the match count + a sample and writes nothing. Admin-gated.
app.post("/api/stores/patch", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const where = b.where || {};
  const conds: ReturnType<typeof eq>[] = [];
  if (Array.isArray(where.ids) && where.ids.length) conds.push(inArray(retailers.id, where.ids.map(Number)));
  if (where.chain) {
    const ch = (await db.select().from(chains).where(eq(chains.name, String(where.chain))))[0];
    if (!ch) return c.json({ error: "chain not found" }, 404);
    conds.push(eq(retailers.chainId, ch.id));
  }
  if (where.state) conds.push(eq(retailers.state, String(where.state).toUpperCase()));
  if (!conds.length) return c.json({ error: "a where filter (ids | chain | state) is required" }, 400);
  const filter = conds.length === 1 ? conds[0] : and(...conds);
  const set: Record<string, unknown> = { ...(b.set && typeof b.set === "object" ? b.set : {}) };
  if (b.clearHours) { set.hours = null; set.hoursUpdatedAt = null; }
  if (!Object.keys(set).length) return c.json({ error: "set{} or clearHours required" }, 400);
  const matched = await db.select({ id: retailers.id, name: retailers.name }).from(retailers).where(filter);
  if (b.dryRun) return c.json({ dryRun: true, matched: matched.length, sample: matched.slice(0, 5), willSet: Object.keys(set) });
  await db.update(retailers).set(set).where(filter);
  invalidateRefCache();
  return c.json({ patched: matched.length, set: Object.keys(set) });
});
app.post("/api/stores/flag", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const terms: string[] = (Array.isArray(b.terms) ? b.terms : []).map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean);
  if (!terms.length) return c.json({ error: "terms[] required" }, 400);
  const set: Record<string, boolean> = {};
  if (typeof b.hasKiosk === "boolean") set.hasKiosk = b.hasKiosk;
  if (typeof b.sellsPacks === "boolean") set.sellsPacks = b.sellsPacks;
  if (!Object.keys(set).length) return c.json({ error: "hasKiosk or sellsPacks required" }, 400);
  const chainName = new Map((await db.select().from(chains)).map((x) => [x.id, (x.name || "").toLowerCase()]));
  // Whole-word match so "vons" doesn't catch "Devonshire".
  const rx = new RegExp("\\b(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "i");
  let updated = 0;
  for (const r of await db.select().from(retailers)) {
    const hay = `${r.name || ""} ${r.chainId ? chainName.get(r.chainId) || "" : ""}`;
    if (rx.test(hay)) { await db.update(retailers).set(set).where(eq(retailers.id, r.id)); updated++; }
  }
  invalidateRefCache();
  return c.json({ updated });
});
// ---- Admin: table dump / load — the staging↔prod DATA MIRROR (STAGING doc, git history). Dump is
// read-only and works anywhere; load REPLACES a table and is staging-ONLY, so prod can never be
// wiped by it. Used to make staging an exact data replica of prod (chains/retailers/catalog). ----
const MIRROR_TABLES: Record<string, typeof retailers> = { categories: categories as never, chains: chains as never, products: products as never, retailers, statuses: statuses as never, kiosks: kiosks as never, settings: settingsTbl as never };
// table-load is staging-only (403 on prod), so it may write a FEW extra tables that we deliberately
// keep OUT of the public, unauthenticated table-dump above — e.g. call_results, used to seed the
// staging finds ticker / in-stock badges from prod's already-public /pub/finds (no transcripts/PII).
const LOAD_TABLES: Record<string, typeof retailers> = { ...MIRROR_TABLES, callResults: callResults as never };
app.get("/api/admin/table-dump", async (c) => {
  const name = String(c.req.query("name") || "");
  const tbl = MIRROR_TABLES[name];
  if (!tbl) return c.json({ error: "unknown table", tables: Object.keys(MIRROR_TABLES) }, 400);
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 5000), 1), 20000);
  const offset = Math.max(Number(c.req.query("offset") || 0), 0);
  const rows = await db.select().from(tbl).limit(limit).offset(offset);
  return c.json({ table: name, offset, count: rows.length, rows });
});
app.post("/api/admin/table-load", async (c) => {
  if (!config.staging.on) return c.json({ error: "table-load is staging-only (never wipes prod)" }, 403);
  const b = await c.req.json().catch(() => ({}));
  const name = String(b.name || "");
  const tbl = LOAD_TABLES[name];
  const rows: Record<string, unknown>[] | null = Array.isArray(b.rows) ? b.rows : null;
  if (!tbl || !rows) return c.json({ error: "name + rows[] required" }, 400);
  if (b.mode === "replace") await db.delete(tbl);
  for (let i = 0; i < rows.length; i += 500) await db.insert(tbl).values(rows.slice(i, i + 500) as never);
  invalidateRefCache();
  // The mirror pulls prod's LEARNED nav (Ace's "press 4 @ 10s") into staging's chains. Re-enforce the
  // curated direct default right here so it wins over the mirror — a table-load is a runtime action, so
  // relying on the boot pass alone would leave these chains clobbered until the next redeploy.
  if (name === "chains") await backfillDirectChains();
  return c.json({ table: name, mode: b.mode || "append", inserted: rows.length, ...(name === "chains" ? { directEnforced: true } : {}) });
});
// NOTE: there is deliberately NO staging→prod data promote. PROD is the source of truth for live
// business data (calls, customers, reports); the Admin manages it directly. CONFIG/feature work flows
// staging→prod via CODE branches, and staging is refreshed FROM prod (table-dump→table-load, above) —
// one-way, prod→staging only. We never write staging's data over prod (that once cascade-wiped call
// history). See STAGING doc, git history "Data direction".

// RECOVERY: rebuild call_results from ElevenLabs conversation history (the source of truth for what was
// actually said on each call). Insert-only + idempotent by providerCallId, so it's safe to re-run and
// can never delete. Maps each call's store/category from the dynamic vars it was placed with, and
// classifies the verdict from the transcript via the same path live ingest uses. ?dry=1 to preview.
app.post("/api/admin/restore-calls-from-el", async (c) => {
  const key = config.voice.apiKey, agentId = config.voice.agentId;
  if (!key || !agentId) return c.json({ error: "elevenlabs not configured" }, 503);
  const dry = c.req.query("dry") === "1";
  const fallbackRetailer = Number(c.req.query("fallback")) || null; // unmatched (e.g. Fun test calls) → this store
  const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ""); // punctuation/space-insensitive
  const retByName = new Map<string, number>();
  const retByNorm = new Map<string, number>();
  for (const r of await db.select({ id: retailers.id, name: retailers.name }).from(retailers))
    if (r.name) { retByName.set(r.name.trim().toLowerCase(), r.id); retByNorm.set(normName(r.name), r.id); }
  const catByLabel = new Map<string, number>();
  for (const cat of await db.select({ id: categories.id, label: categories.label }).from(categories))
    catByLabel.set((cat.label || "").trim().toLowerCase(), cat.id);
  const existing = new Set((await db.select({ p: callResults.providerCallId }).from(callResults)).map((r) => r.p).filter(Boolean));
  let cursor = "", restored = 0, scanned = 0, skipped = 0, unmatched = 0;
  for (let page = 0; page < 60; page++) {
    const lr = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=100${cursor ? `&cursor=${cursor}` : ""}`, { headers: { "xi-api-key": key } });
    if (!lr.ok) break;
    const lj = await lr.json() as { conversations?: Array<Record<string, unknown>>; has_more?: boolean; next_cursor?: string };
    for (const conv of (lj.conversations || [])) {
      scanned++;
      const cid = String(conv.conversation_id || "");
      const status = String(conv.status || "");
      if (!cid || existing.has(cid) || (status !== "done" && status !== "completed")) { skipped++; continue; }
      const dr = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${cid}`, { headers: { "xi-api-key": key } });
      if (!dr.ok) { skipped++; continue; }
      const d = await dr.json() as { conversation_initiation_client_data?: { dynamic_variables?: Record<string, string> }; metadata?: { start_time_unix_secs?: number; call_duration_secs?: number } };
      const dv = d.conversation_initiation_client_data?.dynamic_variables || {};
      const rn = String(dv.retailer_name || "").trim();
      let retailerId = retByName.get(rn.toLowerCase()) ?? retByNorm.get(normName(rn)) ?? null; // exact → normalized
      if (retailerId == null) { unmatched++; retailerId = fallbackRetailer; } // leftover (Fun tests) → fallback store
      if (retailerId == null) { skipped++; continue; } // no store + no fallback → can't insert (retailer_id required)
      const categoryId = catByLabel.get(String(dv.category || "").trim().toLowerCase()) ?? null;
      const startedAt = Number(conv.start_time_unix_secs) || d.metadata?.start_time_unix_secs || null;
      const callSeconds = (conv.call_duration_secs as number) ?? d.metadata?.call_duration_secs ?? null;
      const o = await provider.getConversation(cid); // CallOutcome: verdict + transcript + summary
      if (dry) { restored++; existing.add(cid); continue; }
      await db.insert(callResults).values({
        retailerId, categoryId: categoryId ?? undefined, mode: "restock",
        status: o?.status ?? "completed", confirmed: o?.confirmed ?? null, statusKey: o?.statusKey ?? null,
        summary: o?.summary ?? null, transcript: o?.transcript ?? null, providerCallId: cid,
        startedAt: startedAt ?? undefined, completedAt: startedAt && callSeconds ? startedAt + callSeconds : startedAt ?? undefined,
        callSeconds: callSeconds ?? null, navSeconds: o?.navSecs ?? null, isPrivate: false,
      } as never).catch((e) => console.error("restore insert", cid, e));
      existing.add(cid); restored++;
    }
    if (!lj.has_more || !lj.next_cursor) break;
    cursor = lj.next_cursor;
  }
  return c.json({ restored, scanned, skipped, unmatchedStore: unmatched, dry });
});
// Bulk display-name cleanup (Data Dev) in ONE DB pass:
//  (0) hygiene: strip store numbers ("Burlington West Hills (#264)" -> "Burlington West Hills"),
//      Title-Case all-caps streets ("NORTH DEMAREE STREET" -> "North Demaree Street"), and rebuild
//      junk/HTML-corrupt names from chain + city.
//  (1) separator normalization: "CVS — Visalia" -> "CVS Visalia". An em/en-dash or a spaced hyphen
//      between words collapses to a single space; in-word hyphens ("Jewel-Osco", "H-E-B") are preserved.
//  (2) same-city disambiguation: stores are grouped by (chain, city). A city with one store keeps its
//      "<chain> <city>" name; a city with several gets each renamed to "<chain> <street>" per the owner's
//      rule ("Big 5 Victory Blvd"). Streets are compared on a NORMALIZED key (N./North, Blvd/Boulevard,
//      Rd/Road all fold together) so two stores on the same road are detected even when the raw address
//      punctuation differs — and the house number is added to tell them apart. Grouping by (chain, city)
//      rather than by exact name makes the pass idempotent (safe to re-run). Scope with body.state (run a
//      finished region first to avoid racing a live relabel). dryRun reports counts + a sample, no writes.
app.post("/api/stores/dedupe", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const stateF = b.state ? String(b.state).toUpperCase() : null;
  const conds = [eq(retailers.active, true)];
  if (stateF) conds.push(eq(retailers.state, stateF));
  // Optional: scope to ONE chain and force-normalize its names to "Chain City"/"Chain Street" even when
  // the current name isn't "corrupt". Franchise imports (e.g. Hallmark's "Trudy's Hallmark Shop Location")
  // are <80 chars, so the default pass preserves them — this forces them onto the house naming scheme.
  let forceChain = false;
  if (b.chain) {
    const ch = (await db.select().from(chains).where(eq(chains.name, String(b.chain))))[0];
    if (!ch) return c.json({ error: "chain not found" }, 404);
    conds.push(eq(retailers.chainId, ch.id));
    forceChain = true;
  }
  const rows = await db.select({ id: retailers.id, name: retailers.name, location: retailers.location, address: retailers.address, chainId: retailers.chainId })
    .from(retailers).where(and(...conds));
  const chainName = new Map((await db.select().from(chains)).map((x) => [x.id, x.name || ""]));
  const normSep = (s: string) => (s || "")
    .replace(/\s*\(#\s*\d+\)/g, " ")                         // drop "(#264)" store numbers
    .replace(/\s+#\s*\d+\b/g, " ")                           // drop " #264" store numbers
    .replace(/\s*[—–]\s*/g, " ").replace(/\s+-\s+/g, " ").replace(/\s{2,}/g, " ").trim();
  // all-caps street from raw data ("NORTH DEMAREE STREET") -> Title Case; mixed-case left untouched.
  const fixCaps = (s: string) => /[a-z]/.test(s) ? s : s.replace(/\b[A-Z]{2,}\b/g, (w) => w[0] + w.slice(1).toLowerCase());
  // Scraped-HTML/markup detector. Names are also "junk" when absurdly long; addresses are NOT length-judged
  // (real street addresses can be long) — only markup makes an address corrupt. This keeps garbage from a
  // corrupt address field from ever flowing into a display name via the street() disambiguator.
  const MARKUP = /[<>]|&#|&lt;|&gt;|Self-Service|Return Policy|Help Center|\bid=|style=|https?:/i;
  const corruptName = (s: string) => MARKUP.test(s || "") || (s || "").length > 80;
  const corruptAddr = (s: string | null) => MARKUP.test(s || "");
  const cityOf = (r: { location: string | null }) => (r.location || "").split(",")[0].trim();
  const street = (addr: string | null) => {
    let a = (addr || "").trim();
    if (!a || corruptAddr(a)) return "";                    // empty or scraped-HTML address -> no street name
    a = a.split(",")[0].trim();                              // drop city/state/zip
    a = a.replace(/^\d+[A-Za-z]?\s+/, "");                   // drop leading house number
    a = a.replace(/\s+(?:Ste|Suite|Unit|Apt|#|Bldg|Fl|Floor)\b.*$/i, "").trim(); // drop suite/unit
    return a.replace(/\s+/g, " ").replace(/\.+$/, "").trim();
  };
  const SUF: Record<string, string> = { street: "st", avenue: "ave", av: "ave", boulevard: "blvd", road: "rd", drive: "dr", lane: "ln", court: "ct", place: "pl", parkway: "pkwy", pkway: "pkwy", highway: "hwy", terrace: "ter", circle: "cir", square: "sq", trail: "trl", plaza: "plz" };
  const DIR: Record<string, string> = { north: "n", south: "s", east: "e", west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw" };
  const streetKey = (addr: string | null) => street(addr).toLowerCase().replace(/[.,]/g, "").split(/\s+/).map((w) => DIR[w] || SUF[w] || w).filter(Boolean).join(" ");
  const houseNum = (addr: string | null) => { if (corruptAddr(addr)) return ""; const m = (addr || "").trim().match(/^(\d+[A-Za-z]?)/); return m ? m[1] : ""; };
  // final tiebreaker for two stores in the same building (same house # + street) — the suite/unit, e.g. "#183".
  // Keywords are word-bounded so a street like "Old Steese Hwy" can't false-match "Ste" -> "#ese".
  const suite = (addr: string | null) => { if (corruptAddr(addr)) return ""; const m = (addr || "").match(/(?:\b(?:Ste|Suite|Unit|Apt)\b\.?|#)\s*#?\s*([A-Za-z0-9-]+)/i); return m ? `#${m[1]}` : ""; };

  // default name = separator-normalized current name (preserves curated mall/neighborhood names on singles)
  const proposed = new Map<number, string>();
  for (const r of rows) proposed.set(r.id, normSep(r.name || ""));
  // rebuild junk/corrupt names from chain + city (collision pass below may further street-name them).
  // base = the chain name; if a junk row has no chainId, recover the chain from the clean text before the
  // markup begins ("Dollar General 1. Self-Service…" -> "Dollar General"). A long-but-clean independent
  // name with no chain is left alone rather than mangled.
  const namePrefix = (s: string) => (s || "").split(/[<&]|\b\d+\.\s|Self-Service|Return Policy|Help Center|style=|\bid=/i)[0].replace(/\s+/g, " ").trim();
  for (const r of rows) if (corruptName(r.name) || (forceChain && r.chainId)) {
    let base = (r.chainId && chainName.get(r.chainId)) || "";
    if (!base && MARKUP.test(r.name || "")) base = namePrefix(r.name);
    if (!base) continue;
    proposed.set(r.id, cityOf(r) ? `${base} ${cityOf(r)}` : base);
  }
  const baseOf = (r: { chainId: number | null; id: number }) =>
    (r.chainId && chainName.get(r.chainId)) ? chainName.get(r.chainId)! : (proposed.get(r.id) || "");

  // group by (chain | normalized-name, city) so re-runs regroup correctly regardless of prior names
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const gk = (r.chainId ? `c${r.chainId}` : `n:${proposed.get(r.id)}`) + "|||" + (r.location || "");
    let g = groups.get(gk); if (!g) { g = []; groups.set(gk, g); } g.push(r);
  }
  for (const grp of groups.values()) {
    if (grp.length < 2) continue;                            // one store in this city -> keep its name
    const keyCount = new Map<string, number>();
    for (const r of grp) { const k = streetKey(r.address); if (k) keyCount.set(k, (keyCount.get(k) || 0) + 1); }
    for (const r of grp) {
      const disp = fixCaps(street(r.address));
      if (!disp) continue;                                   // no usable address -> can't street-name
      const sameStreet = (keyCount.get(streetKey(r.address)) || 0) > 1;
      const hn = houseNum(r.address);
      proposed.set(r.id, sameStreet && hn ? `${baseOf(r)} ${hn} ${disp}` : `${baseOf(r)} ${disp}`);
    }
    // residual collision (same building, e.g. two mall units) -> append the suite/unit number
    const nmCount = new Map<string, number>();
    for (const r of grp) nmCount.set(proposed.get(r.id)!, (nmCount.get(proposed.get(r.id)!) || 0) + 1);
    for (const r of grp) {
      if ((nmCount.get(proposed.get(r.id)!) || 0) > 1) {
        const su = suite(r.address);
        if (su) proposed.set(r.id, `${proposed.get(r.id)} ${su}`);
      }
    }
  }

  const changes = rows.filter((r) => proposed.get(r.id) && proposed.get(r.id) !== (r.name || ""));
  const addrBad = rows.filter((r) => corruptAddr(r.address));   // scraped-HTML addresses -> blanked
  if (b.dryRun) {
    return c.json({ dryRun: true, scope: stateF || "ALL", active: rows.length, changed: changes.length, addrBlank: addrBad.length,
      sample: changes.slice(0, 24).map((r) => ({ id: r.id, from: r.name, to: proposed.get(r.id), city: r.location })) });
  }
  for (const r of changes) await db.update(retailers).set({ name: proposed.get(r.id)! }).where(eq(retailers.id, r.id));
  for (const r of addrBad) await db.update(retailers).set({ address: null }).where(eq(retailers.id, r.id));
  invalidateRefCache();
  return c.json({ scope: stateF || "ALL", active: rows.length, changed: changes.length, addrBlanked: addrBad.length,
    sample: changes.slice(0, 12).map((r) => ({ from: r.name, to: proposed.get(r.id) })) });
});
// Quarantine CVS-inside-Target: the CVS pharmacy counters that live inside a Target share that Target's
// exact street address — they don't carry cards and must never be called. Match every CVS against every
// Target by normalized street address (+ a <250m proximity guard so identical addresses in different towns
// don't collide), then move the matches into a MUTED "CVS Pharmacy at Target" chain (and set sellsPacks
// false as a hard non-callable backstop) so they drop out of the consumer list and the call workflow.
// dryRun returns the count + a sample and writes nothing. Admin-gated.
app.post("/api/stores/quarantine-cvs-in-target", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const allChains = await db.select().from(chains);
  const cvsChain = allChains.find((x) => x.name === "CVS");
  const targetChain = allChains.find((x) => x.name === "Target");
  if (!cvsChain || !targetChain) return c.json({ error: "CVS or Target chain not found" }, 404);
  const SUF: Record<string, string> = { street: "st", avenue: "ave", av: "ave", boulevard: "blvd", road: "rd", drive: "dr", lane: "ln", highway: "hwy", parkway: "pkwy", place: "pl", court: "ct", circle: "cir", terrace: "ter", trail: "trl" };
  const DIR: Record<string, string> = { north: "n", south: "s", east: "e", west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw" };
  const akey = (addr: string | null) =>
    (addr || "").split(",")[0].toLowerCase().replace(/\b(ste|suite|unit|apt|#|bldg|fl)\b.*$/, "").replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/).filter(Boolean).map((t) => DIR[t] || SUF[t] || t).join(" ").trim();
  const meters = (a: { lat: number | null; lng: number | null }, t: { lat: number | null; lng: number | null }) => {
    if (a.lat == null || a.lng == null || t.lat == null || t.lng == null) return 9e9;
    const R = 6371000, p1 = a.lat * Math.PI / 180, p2 = t.lat * Math.PI / 180;
    const dp = (t.lat - a.lat) * Math.PI / 180, dl = (t.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  const targets = (await db.select().from(retailers).where(and(eq(retailers.chainId, targetChain.id), eq(retailers.active, true))))
    .filter((t) => t.address && t.lat != null);
  const byAddr = new Map<string, typeof targets>();
  for (const t of targets) { const k = akey(t.address); if (!k) continue; const g = byAddr.get(k); if (g) g.push(t); else byAddr.set(k, [t]); }
  const cvs = await db.select().from(retailers).where(and(eq(retailers.chainId, cvsChain.id), eq(retailers.active, true)));
  const matched: { id: number; name: string; address: string | null; target: string }[] = [];
  for (const s of cvs) {
    const k = akey(s.address);
    const hit = k ? (byAddr.get(k) || []).find((t) => meters(s, t) < 250) : undefined;
    const addrSaysTarget = /\btarget\b/i.test(s.address || "");
    if (hit || addrSaysTarget) matched.push({ id: s.id, name: s.name, address: s.address, target: hit ? hit.name : "addr:Target" });
  }
  if (b.dryRun) return c.json({ dryRun: true, cvsTotal: cvs.length, targetTotal: targets.length, matched: matched.length, sample: matched.slice(0, 25) });
  let q = allChains.find((x) => x.name === "CVS Pharmacy at Target");
  if (!q) { const [row] = await db.insert(chains).values({ name: "CVS Pharmacy at Target", type: "Pharmacy", muted: true }).returning(); q = row; }
  else if (!q.muted) await db.update(chains).set({ muted: true }).where(eq(chains.id, q.id));
  const ids = matched.map((m) => m.id);
  for (let i = 0; i < ids.length; i += 500) await db.update(retailers).set({ chainId: q.id, sellsPacks: false }).where(inArray(retailers.id, ids.slice(i, i + 500)));
  invalidateRefCache();
  return c.json({ moved: ids.length, intoChain: "CVS Pharmacy at Target", muted: true, chainId: q.id, sample: matched.slice(0, 12) });
});
// Re-link orphan stores (active rows with chainId NULL) to an existing chain by their display name.
// An orphan has no chain → no logo, no chain tier, no phone-tree default. But the name still leads with
// the brand ("Burlington Jewelry District" → "Burlington"), so we re-attach by matching the LONGEST
// chain name that is a whole-word prefix of the store name (so "Barnes & Noble" wins over "Barnes").
// Apostrophes/periods are normalized away ("Sam's Club" ≡ "Sams Club"). Hidden "_…" buckets (merged /
// quarantined chains) are never a target. No prefix match → the row is left alone. dryRun reports the
// counts + a per-chain breakdown + samples so the match set can be eyeballed before applying.
app.post("/api/stores/relink-orphans", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const norm = (s: string) => (s || "").toLowerCase().replace(/[.'‘’]/g, "").replace(/\s+/g, " ").trim();
  const cand = (await db.select({ id: chains.id, name: chains.name }).from(chains))
    .filter((ch) => ch.name && !ch.name.startsWith("_"))
    .map((ch) => ({ id: ch.id, name: ch.name as string, key: norm(ch.name as string) }))
    .filter((ch) => ch.key.length >= 2)
    .sort((a, z) => z.key.length - a.key.length); // longest first → most specific match wins
  const matchChain = (storeName: string) => {
    const n = norm(storeName);
    for (const ch of cand) if (n === ch.key || n.startsWith(ch.key + " ")) return ch;
    return null;
  };
  const orphans = await db.select({ id: retailers.id, name: retailers.name }).from(retailers)
    .where(and(eq(retailers.active, true), isNull(retailers.chainId)));
  const byChain = new Map<string, { chainId: number; n: number; sample: string[] }>();
  const groups = new Map<number, number[]>();
  const unmatched: string[] = [];
  for (const o of orphans) {
    const m = matchChain(o.name);
    if (!m) { if (unmatched.length < 30) unmatched.push(o.name); continue; }
    const arr = groups.get(m.id) ?? []; arr.push(o.id); groups.set(m.id, arr);
    const g = byChain.get(m.name) || { chainId: m.id, n: 0, sample: [] };
    g.n++; if (g.sample.length < 3) g.sample.push(o.name);
    byChain.set(m.name, g);
  }
  const linked = [...groups.values()].reduce((s, a) => s + a.length, 0);
  const breakdown = [...byChain.entries()].map(([chain, v]) => ({ chain, n: v.n, sample: v.sample })).sort((a, z) => z.n - a.n);
  if (b.dryRun) return c.json({ dryRun: true, orphans: orphans.length, willLink: linked, unmatched: unmatched.length, unmatchedSample: unmatched, breakdown: breakdown.slice(0, 50) });
  for (const [chainId, ids] of groups)
    for (let i = 0; i < ids.length; i += 500) await db.update(retailers).set({ chainId }).where(inArray(retailers.id, ids.slice(i, i + 500)));
  invalidateRefCache();
  return c.json({ orphans: orphans.length, linked, unmatched: unmatched.length, chains: breakdown.length, breakdown: breakdown.slice(0, 50) });
});
// Close the "ungraded tail": fill retailers.tier ONLY where it is NULL, per chain, from a supplied
// { chainName: tier } map (the chain_scores_final.csv values). It NEVER overwrites an existing tier, so
// deliberate per-store voice overrides and owner tier calls (e.g. TJ Maxx = 3) are preserved — this only
// grades stores that have no tier yet. Chains absent from the DB are reported as unmatched (no guess).
// dryRun reports, per scored chain, how many null-tier stores it WOULD fill.
app.post("/api/stores/grade-from-defaults", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const defaults = (b.defaults && typeof b.defaults === "object") ? b.defaults as Record<string, unknown> : null;
  if (!defaults) return c.json({ error: "defaults{ chainName: tier } required" }, 400);
  const byName = new Map((await db.select({ id: chains.id, name: chains.name }).from(chains)).map((x) => [x.name, x.id]));
  const out: { chain: string; tier: number; filled: number }[] = [];
  const unmatched: string[] = [];
  for (const [name, tierRaw] of Object.entries(defaults)) {
    const tier = Number(tierRaw);
    if (!Number.isInteger(tier) || tier < 1 || tier > 5) continue;
    const cid = byName.get(name);
    if (!cid) { unmatched.push(name); continue; }
    const nulls = await db.select({ id: retailers.id }).from(retailers)
      .where(and(eq(retailers.chainId, cid), eq(retailers.active, true), isNull(retailers.tier)));
    if (!b.dryRun && nulls.length) {
      const ids = nulls.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 500) await db.update(retailers).set({ tier }).where(inArray(retailers.id, ids.slice(i, i + 500)));
    }
    out.push({ chain: name, tier, filled: nulls.length });
  }
  if (!b.dryRun) invalidateRefCache();
  const detail = out.filter((o) => o.filled > 0).sort((a, z) => z.filled - a.filled);
  return c.json({ dryRun: !!b.dryRun, scoredChains: out.length, chainsWithGaps: detail.length, totalFilled: detail.reduce((s, o) => s + o.filled, 0), unmatched, detail });
});
// Name normalizer: fixes the junk the dedupe doesn't (ALL-CAPS words, `&amp;` entities, " - "
// separators) across ALL active stores server-side — reaching names past the read API's 1000-row cap.
// Title-cases all-caps WORDS of length ≥4 (so true brand/dir acronyms — CVS, AFB, NE, plus a keep-set
// AAFES/IKEA — stay upper, not "Cvs"/"Aafes"). Scoped to names that actually look junk so it never
// touches a clean name. dryRun previews the rename set.
app.post("/api/stores/fix-caps", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const KEEP = new Set(["AAFES", "IKEA", "NEX", "MCX", "AMC", "BBQ"]);
  const fix = (n: string): string => {
    let s = n.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#?[a-z0-9]+;/gi, "");
    s = s.replace(/\s+-\s+/g, " ");
    s = s.split(/\s+/).map((w) => (!KEEP.has(w) && w.length >= 4 && w === w.toUpperCase() && /[A-Z]/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w)).join(" ");
    return s.replace(/\s+/g, " ").trim();
  };
  const junky = (n: string) => /&\w+;|<[a-z/]|style=|\(#\d| - | Shop Location/i.test(n) || /\b[A-Z]{4,}\s+[A-Z]{4,}\b/.test(n) || n.length > 80;
  const rows = await db.select({ id: retailers.id, name: retailers.name }).from(retailers).where(eq(retailers.active, true)).limit(200000);
  const changes = rows.map((r) => ({ id: r.id, from: r.name || "", to: fix(r.name || "") })).filter((x) => junky(x.from) && x.to && x.to !== x.from);
  if (b.dryRun) return c.json({ dryRun: true, willFix: changes.length, sample: changes.slice(0, 25) });
  for (const ch of changes) await db.update(retailers).set({ name: ch.to }).where(eq(retailers.id, ch.id));
  invalidateRefCache();
  return c.json({ fixed: changes.length, sample: changes.slice(0, 25) });
});
// Kiosk overlay: reconcile the official TPCi vending list against our stores. For each machine, flag
// the matching store (same chain, within ~0.3 mi) as a tier-5 kiosk (hasKiosk:true, tier:5) — leaving
// sellsPacks untouched so a store that also sells on the shelf still shows in both tabs. Machines at a
// location we don't have yet are inserted as new kiosk rows. `dryRun` returns counts only (no writes).
app.post("/api/kiosks/overlay", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const machines: Record<string, unknown>[] = Array.isArray(b.machines) ? b.machines : [];
  if (!machines.length) return c.json({ error: "machines[] required" }, 400);
  const dryRun = !!b.dryRun;
  const norm = (s: unknown) => String(s || "").toLowerCase().replace(/['’.]/g, "").replace(/\s+/g, " ").trim();
  const chainRows = await db.select({ id: chains.id, name: chains.name }).from(chains);
  const chainByNorm = new Map<string, number>();
  for (const ch of chainRows) chainByNorm.set(norm(ch.name), ch.id);
  const chainNorms = [...chainByNorm.keys()];
  const resolveChain = (retailer: unknown): number | null => {
    const n = norm(retailer);
    if (!n) return null;
    if (chainByNorm.has(n)) return chainByNorm.get(n)!;
    const hit = chainNorms.find((cn) => cn.length >= 4 && (cn.startsWith(n) || n.startsWith(cn)));
    return hit ? chainByNorm.get(hit)! : null;
  };
  const stores = await db.select({ id: retailers.id, chainId: retailers.chainId, lat: retailers.lat, lng: retailers.lng, zip: retailers.zip }).from(retailers);
  const byChain = new Map<number, typeof stores>();
  for (const s of stores) { if (s.chainId == null) continue; const arr = byChain.get(s.chainId) || []; arr.push(s); byChain.set(s.chainId, arr); }
  let matched = 0, inserted = 0;
  const unresolved: Record<string, number> = {};
  const toInsert: Parameters<typeof importStores>[0] = [];
  for (const m of machines) {
    const retailer = m.retailer ?? m.chain;
    const lat = Number(m.lat), lng = Number(m.lng);
    const zip = String(m.zipPostalCode ?? m.zip ?? "") || null;
    const cid = resolveChain(retailer);
    let hit: { id: number } | null = null;
    if (cid != null) {
      let best: { id: number } | null = null, bestD = Infinity;
      for (const s of byChain.get(cid) || []) {
        if (s.lat != null && s.lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
          const d = haversineMi(lat, lng, s.lat, s.lng);
          if (d < bestD) { bestD = d; best = { id: s.id }; }
        } else if (zip && s.zip && s.zip === zip) { best = { id: s.id }; bestD = 0; break; }
      }
      if (best && bestD <= 0.3) hit = best;
    } else {
      unresolved[norm(retailer)] = (unresolved[norm(retailer)] || 0) + 1;
    }
    if (hit) {
      matched++;
      if (!dryRun) await db.update(retailers).set({ hasKiosk: true, tier: 5, ...(m.name ? { externalStoreId: String(m.name) } : {}) }).where(eq(retailers.id, hit.id));
    } else {
      inserted++;
      toInsert.push({
        chain: String(retailer || "Pokémon Vending"),
        name: `${retailer || "Pokémon Vending"} ${m.city || m.stateProvince || ""}`.trim(),
        category: "Grocery",
        address: (m.street as string) || undefined, city: (m.city as string) || undefined,
        state: (m.stateProvince as string) || undefined, zip: zip || undefined,
        lat: Number.isFinite(lat) ? lat : undefined, lng: Number.isFinite(lng) ? lng : undefined,
        phone: "", carries: "Pokémon", sellsPacks: false, hasKiosk: true, tier: 5,
        store_id: m.name ? String(m.name) : undefined,
      });
    }
  }
  if (!dryRun && toInsert.length) await importStores(toInsert);
  invalidateRefCache();
  return c.json({ machines: machines.length, matched, inserted, dryRun, unresolved });
});
// Kiosk reconcile — ENFORCE the rule "a store is a Pokémon kiosk ONLY if it's on the official TPCi
// vending list" (the store_ids from vending.pokemon.com). Pass the official store_ids; any active
// hasKiosk store whose externalStoreId is NOT one of them gets hasKiosk:false + tier cleared. This
// strips over-flagging from non-official sources (e.g. a store-locator scrape, stale numeric codes).
// dryRun returns counts + a sample of what would be de-kiosked. Admin-gated.
app.post("/api/kiosks/reconcile", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const official = new Set((Array.isArray(b.officialIds) ? b.officialIds : []).map((s: unknown) => String(s)));
  if (!official.size) return c.json({ error: "officialIds[] required (the store_ids from the vending list)" }, 400);
  const kiosks = await db.select().from(retailers).where(and(eq(retailers.active, true), eq(retailers.hasKiosk, true)));
  const bad = kiosks.filter((r) => !r.externalStoreId || !official.has(String(r.externalStoreId)));
  if (b.dryRun) {
    return c.json({ dryRun: true, totalKiosks: kiosks.length, onOfficialList: kiosks.length - bad.length, willDeKiosk: bad.length,
      sample: bad.slice(0, 24).map((r) => ({ id: r.id, name: r.name, extId: r.externalStoreId })) });
  }
  for (let i = 0; i < bad.length; i += 500) {
    await db.update(retailers).set({ hasKiosk: false, tier: null }).where(inArray(retailers.id, bad.slice(i, i + 500).map((r) => r.id)));
  }
  invalidateRefCache();
  return c.json({ totalKiosks: kiosks.length, kept: kiosks.length - bad.length, deKiosked: bad.length });
});

// ---- Store hours: backfill all (background) + refresh one + re-verify unverified stamps ----
app.post("/api/hours/backfill", async (c) => c.json(await backfillHours()));
// Phone backfill for call-rail stores imported address-only (nophone: sentinel). Scope to a chain
// via ?chainId= (required in practice — never run unscoped over site-rail chains). ?dryRun=1 previews.
app.post("/api/phones/backfill", async (c) =>
  c.json(await backfillPhones({ chainId: c.req.query("chainId") ? Number(c.req.query("chainId")) : undefined, dryRun: c.req.query("dryRun") === "1" })));
app.post("/api/hours/:id/refresh", async (c) => {
  const r = await refreshHours(Number(c.req.param("id")));
  return r ? c.json(r) : c.json({ error: "no address / lookup failed" }, 400);
});
// Re-verify stores carrying an UNVERIFIED hours stamp (hours set, hoursUpdatedAt null) so nothing shows
// open on a guess. dryRun returns the count + sample; otherwise kicks a fire-and-forget background sweep.
app.post("/api/hours/reverify-stamps", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  return c.json(await reverifyStampedHours({ dryRun: !!b.dryRun }));
});
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
  const r = await bridgeStoreCall(Number(b.retailerId), catIds, b.specificProduct, undefined, b.kioskMode);
  if (r.error) return c.json({ error: r.error }, 502);
  return c.json({ room: r.room, wsHost: config.staging.on ? STAGING_HOST : RAILWAY_HOST });
});
// Transcript privacy (flags.transcriptAuth): a call placed by a signed-in finder is readable only by
// that finder (phone-session Bearer token) or the admin. Anonymous calls stay readable by cid — the
// cid was only ever handed to the caller's own browser. Flag OFF = today's open behavior, so the
// consumer UI can start sending the token before enforcement flips on.
async function canReadTranscript(c: { req: { header: (n: string) => string | undefined; raw: Request } }, cid: string): Promise<boolean> {
  if (!(await getPolicy()).flags.transcriptAuth) return true;
  const row = (await db.select().from(callResults).where(eq(callResults.providerCallId, cid)))[0];
  if (!row?.finderUserId) return true;
  if (config.adminToken && c.req.header("x-admin-token") === config.adminToken) return true;
  const cookie = (c.req.header("cookie") || "").match(/(?:^|;\s*)admin_session=([^;]+)/)?.[1];
  if (cookie) { const s = await verifySession(decodeURIComponent(cookie)); if (s?.id === "admin") return true; }
  const u = await verifyClerkToken(c.req.header("authorization"));
  return !!u && u.id === row.finderUserId;
}
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
    if (row && row.status && row.status !== "in_progress" && row.status !== "dialing") {
      return c.json({
        status: row.status, confirmed: row.confirmed, statusKey: row.statusKey,
        productDetail: row.productDetail, shipmentDay: row.shipmentDayHeard ?? null,
        summary: row.summary ?? "", transcript: row.transcript ?? "",
        durationSecs: row.callSeconds ?? undefined,
      });
    }
    return c.json({ status: "in_progress", transcript: row?.transcript ?? (s ? tdTranscript(s) : ""), summary: "" });
  }
  const o = await provider.getConversation(cid);
  // Prefer the FINALIZED row once it exists — it carries the consensus verdict (the reconciled
  // status_key/confirmed) and the captured product detail, which the live outcome does not. While the
  // call is still in flight, fall back to the live outcome so the consumer sees progress immediately.
  const row = (await db.select().from(callResults).where(eq(callResults.providerCallId, cid)))[0];
  if (row && row.status === "completed") {
    return c.json({
      ...(o ?? {}),
      status: row.status,
      confirmed: row.confirmed,
      statusKey: row.statusKey,
      ts: (row.startedAt || 0) * 1000,       // call start (ms) — the status page shows date + time (owner 07-10)
      productDetail: row.productDetail,      // e.g. "3-pack blister · Surging Sparks" — null if not captured
      shipmentDay: row.shipmentDayHeard ?? (o?.shipmentDay ?? null),
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
    // Speed: only spend the verdict-DECIDING second read when ElevenLabs was UNCLEAR (the case it
    // actually rescues). A decisive yes still gets an extraction-only read for the set/product form.
    const needSecond = o.confirmed === null && !o.soldOut && !o.doesNotSell;
    const second = (needSecond || o.confirmed === true) ? await classifyVerdict(o.transcript, label || "the product") : null;
    const consensus = reconcile({ confirmed: o.confirmed, soldOut: o.soldOut, doesNotSell: o.doesNotSell, statusKey: o.statusKey }, needSecond ? second : null);
    const productDetail = productDetailLabel(second);
    await db.update(callResults).set({
      status: o.status, confirmed: consensus.confirmed, statusKey: consensus.statusKey,
      shipmentDayHeard: o.shipmentDay, productDetail, summary: o.summary, transcript: o.transcript,
      completedAt: Math.floor(Date.now() / 1000),
    }).where(eq(callResults.id, row.id));
    if (row.finderUserId && consensus.definitive) await chargeCallOnce(row.id, row.finderUserId);
    return c.json({ ...(o ?? {}), status: o.status, confirmed: consensus.confirmed, statusKey: consensus.statusKey, ts: (row.startedAt || 0) * 1000, productDetail, shipmentDay: o.shipmentDay, summary: o.summary, transcript: o.transcript });
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
    const convId = bridgeConversationId(dcid.slice(7));
    if (convId) dcid = convId;
    else return c.json({ status: "in_progress", transcript: "", summary: "" });
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
      const done = elLive === null ? (s.status === "done" || s.status === "failed") : !elLive;
      return c.json({ live: !done, status: done ? "done" : "in_progress", transcript: [tdTranscript(s), tail].filter(Boolean).join("\n") });
    }
    const row = (await db.select().from(callResults).where(eq(callResults.providerCallId, dcid)))[0];
    return c.json({ live: false, status: row?.status || "done", transcript: row?.transcript || "" });
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
// Admin: recent feedback joined with what we showed + the transcript — the review/training surface.
app.get("/api/feedback", async (c) => {
  const stores = await retailerMap();
  const r = await client.execute(
    `SELECT f.id, f.cid, f.user_verdict, f.shown_status, f.created_at, f.reviewed, r.confirmed, r.status_key, r.transcript, r.summary, r.retailer_id
     FROM call_feedback f LEFT JOIN call_results r ON r.provider_call_id = f.cid
     ORDER BY f.created_at DESC LIMIT 200`);
  // Flag the disagreements (where the human verdict contradicts what we showed) — the cases to learn from.
  const rows = r.rows.map((x: Record<string, unknown>) => {
    const uv = x.user_verdict, conf = x.confirmed == null ? null : Number(x.confirmed), shownIn = conf === 1, shownOut = conf === 0;
    const disagree = (uv === "in" && !shownIn) || (uv === "out" && !shownOut);
    const rid = x.retailer_id == null ? null : Number(x.retailer_id);
    const store = rid != null ? (stores.get(rid)?.name?.split("—")[0].trim() ?? null) : null;
    return { ...x, store, reviewed: Number(x.reviewed || 0) === 1, disagree };
  });
  return c.json(rows);
});
// Triage a poll response: mark it reviewed, and optionally CORRECT our verdict on the underlying call so
// the record (and the training signal we learn from) reflects what the customer actually saw. id = call_feedback row.
app.post("/api/feedback/:id/review", async (c) => {
  const id = Number(c.req.param("id")); if (!id) return c.json({ error: "id required" }, 400);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  await client.execute({ sql: "UPDATE call_feedback SET reviewed = 1 WHERE id = ?", args: [id] });
  const correct = String(b.correct ?? "");
  if (correct === "in" || correct === "out") {
    const fb = (await client.execute({ sql: "SELECT cid FROM call_feedback WHERE id = ?", args: [id] })).rows[0];
    const cid = fb ? String(fb.cid) : "";
    if (cid) await client.execute({ sql: "UPDATE call_results SET confirmed = ?, status_key = ? WHERE provider_call_id = ?", args: [correct === "in" ? 1 : 0, correct === "in" ? "in_stock" : "sold_out", cid] });
  }
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

// ---- Runnr customer accounts + billing (Clerk-authenticated, any signed-in user) ----
app.get("/app/me", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  // getAccount maps the owner phone → master email, so comp/master resolves from the account itself.
  const a = await getAccount(u.id, u.email || undefined);
  const comp = isCompAccount(a) || isComp(u.email || undefined);
  // Phone-first: store the verified cell straight from the session token (can't be spoofed) and default
  // the caller ID to it.
  if (a && !a.phone && u.phone) {
    await db.update(accounts).set({ phone: u.phone }).where(eq(accounts.clerkUserId, u.id)); a.phone = u.phone;
  }
  // Premium entitlements (subscription-only): per-feature map the UI gates on. premiumAsks (exact
  // set/product/price questions on the call) is for EVERY account since 2026-07-15 (owner).
  const features = await accountFeatures(a?.subTier, comp);
  const premiumAsks = true;
  return c.json({
    // Displayed balance = subscription quota + PAYG (both spendable). quota/payg broken out for the UI.
    credits: comp ? 9999 : spendableCredits(a), subscription: comp ? "active" : (a?.subscription ?? "none"),
    subTier: comp ? "founder" : (a?.subTier ?? null), quota: comp ? 9999 : (a?.quotaCredits ?? 0), payg: comp ? 9999 : (a?.credits ?? 0), premiumAsks, features,
    comp, callsMade: a?.callsMade ?? 0, phone: a?.phone ?? null,
    // Alerts email UI (Addie 07-15): the saved address + whether the confirm link was tapped.
    email: a?.email ?? null, emailVerified: !!a?.emailVerifiedAt,
    // caller_id is only set after Twilio's caller-ID verify call → the "create your agent" panel uses
    // callerIdReady to know whether to prompt for it.
    callerId: a?.callerId ?? null, callerIdReady: !!a?.callerId,
    catalog: { sub: SUB, packs: PACKS },
  });
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
  const r = await bridgeStoreCall(Number(b.retailerId), catIds, b.specificProduct, { userId: u.id, isPrivate: await isFinderPrivate(a) }, b.kioskMode);
  if (r.error) return c.json({ error: r.error }, 502);
  return c.json({ room: r.room, wsHost: config.staging.on ? STAGING_HOST : RAILWAY_HOST });
});

// ============ Manage Zones (consumer, premium `zone_sweeps`) — spec docs/archive/manage-zones-SHIPPED.md ============
const zoneRunSids = new Map<string, string[]>(); // runId -> Twilio callSids (in-memory, for "Stop all")

/** Bearer auth + zone_sweeps entitlement. ok:false short-circuits with the right status. */
async function zoneAuth(authHeader?: string): Promise<
  { ok: true; u: { id: string; email?: string; phone?: string }; a: Awaited<ReturnType<typeof getAccount>>; comp: boolean }
  | { ok: false; status: 401 | 403; error: string }> {
  const u = await verifyClerkToken(authHeader);
  if (!u) return { ok: false, status: 401, error: "unauthorized" };
  const a = await getAccount(u.id, u.email);
  const comp = isCompAccount(a) || isComp(u.email || undefined);
  const feats = await accountFeatures(a?.subTier, comp);
  if (!feats.zone_sweeps) return { ok: false, status: 403, error: "not_entitled" };
  return { ok: true, u, a, comp };
}
/** API shape for one zone: its stores, callable check count, and last-run summary. */
async function zoneView(z: typeof zones.$inferSelect) {
  const links = await db.select().from(zoneRetailers).where(eq(zoneRetailers.zoneId, z.id));
  const rows = links.length ? await db.select().from(retailers).where(inArray(retailers.id, links.map((l) => l.retailerId))) : [];
  // Zone cards show the member stores' logos + open state (owner 07-10): same chainLogoInfo + openState
  // the consumer store list rides, so the card and the check-all gate agree with the rest of the app.
  const chainNames = rows.length ? new Map((await db.select().from(chains)).map((x) => [x.id, x.name])) : new Map();
  const stores = rows.map((r) => {
    const chainName = (r.chainId && chainNames.get(r.chainId)) || null;
    const l = chainLogoInfo(chainName || r.name.split(/—|–| - /)[0]);
    return { retailerId: r.id, name: r.name, location: r.location || "", callable: r.sellsPacks !== false,
      logoUrl: l.url, logoWide: l.wide, logoDark: l.dark, openState: openState(r.hours, r.timezone) };
  });
  const last = (await db.select().from(callResults).where(like(callResults.zoneRunId, `z${z.id}-%`)).orderBy(desc(callResults.startedAt)).limit(1))[0];
  let lastRun = null;
  if (last?.zoneRunId) {
    const rr = await db.select().from(callResults).where(eq(callResults.zoneRunId, last.zoneRunId));
    lastRun = { at: last.startedAt, inStock: rr.filter((r) => r.statusKey === "in_stock").length, total: rr.length };
  }
  return { id: z.id, name: z.name, stores, checkCount: stores.filter((s) => s.callable).length, lastRun };
}

app.get("/app/zones", async (c) => {
  const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
  const zs = await db.select().from(zones).where(eq(zones.ownerUserId, g.u.id)).orderBy(desc(zones.createdAt));
  return c.json(await Promise.all(zs.map(zoneView)));
});
app.post("/app/zones", async (c) => {
  const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
  const b = await c.req.json();
  const retailerIds = (Array.isArray(b.retailerIds) ? b.retailerIds : []).map(Number).filter(Boolean);
  if (!retailerIds.length) return c.json({ error: "no_stores" }, 400);
  const [z] = await db.insert(zones).values({ name: String(b.name || "").trim().slice(0, 60) || "My zone", ownerUserId: g.u.id, centerZip: b.centerZip ?? null, radiusMiles: b.radiusMiles ?? null }).returning();
  await db.insert(zoneRetailers).values(retailerIds.map((rid: number) => ({ zoneId: z.id, retailerId: rid })));
  return c.json(await zoneView(z), 201);
});
app.patch("/app/zones/:id", async (c) => {
  const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
  const id = Number(c.req.param("id"));
  const z = (await db.select().from(zones).where(and(eq(zones.id, id), eq(zones.ownerUserId, g.u.id))))[0];
  if (!z) return c.json({ error: "not_found" }, 404);
  const b = await c.req.json();
  if (typeof b.name === "string") await db.update(zones).set({ name: b.name.trim().slice(0, 60) || z.name }).where(eq(zones.id, id));
  if (Array.isArray(b.retailerIds)) {
    const ids = b.retailerIds.map(Number).filter(Boolean);
    await db.delete(zoneRetailers).where(eq(zoneRetailers.zoneId, id));
    if (ids.length) await db.insert(zoneRetailers).values(ids.map((rid: number) => ({ zoneId: id, retailerId: rid })));
  }
  return c.json(await zoneView((await db.select().from(zones).where(eq(zones.id, id)))[0]));
});
app.delete("/app/zones/:id", async (c) => {
  const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
  const id = Number(c.req.param("id"));
  const z = (await db.select().from(zones).where(and(eq(zones.id, id), eq(zones.ownerUserId, g.u.id))))[0];
  if (!z) return c.json({ error: "not_found" }, 404);
  await db.delete(zones).where(eq(zones.id, id));
  return c.json({ ok: true });
});
app.get("/app/zones/quote", async (c) => {
  const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
  const ids = (c.req.query("retailerIds") || "").split(",").map(Number).filter(Boolean);
  const rows = ids.length ? await db.select().from(retailers).where(inArray(retailers.id, ids)) : [];
  const checks = rows.filter((r) => r.sellsPacks !== false).length;
  return c.json({ stores: checks, checks, cents: checks * (await getPolicy()).pricing.perCallCents });
});
app.post("/app/zones/:id/check", async (c) => {
  const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
  if (await isCallingPaused()) return c.json({ error: "calling_paused" }, 503);
  const id = Number(c.req.param("id"));
  const z = (await db.select().from(zones).where(and(eq(zones.id, id), eq(zones.ownerUserId, g.u.id))))[0];
  if (!z) return c.json({ error: "not_found" }, 404);
  const afford = await canAffordZone({ zoneId: id, credits: spendableCredits(g.a), comp: g.comp });
  if (!afford.ok) return c.json({ error: "no_credits", need: afford.creditsNeeded, have: afford.have, short: afford.short }, 402);
  const b = await c.req.json().catch(() => ({}));
  const cat = b.categoryId
    ? (await db.select().from(categories).where(eq(categories.id, Number(b.categoryId))))[0]
    : (await db.select().from(categories).where(eq(categories.key, "pokemon")))[0];
  if (!cat) return c.json({ error: "category_not_found" }, 400);
  const links = await db.select().from(zoneRetailers).where(eq(zoneRetailers.zoneId, id));
  // Sweep cap (owner 07-14): one tap never places more than 25 calls — protects telephony/agent
  // concurrency for everyone else. The builder caps selection at 25 too; legacy bigger zones get a
  // clean error instead of a silent partial sweep.
  if (links.length > 25) return c.json({ error: "zone_too_big", max: 25 }, 400);
  const allRows = (await db.select().from(retailers).where(inArray(retailers.id, links.map((l) => l.retailerId)))).filter((r) => r.sellsPacks !== false);
  // Skip stores we KNOW are closed right now — a closed store can't be reached, so don't burn the
  // check on it (owner 07-11: "STORE XYZ is closed but we can still call STORE ABC"). Unknown hours
  // still get called. The confirm sheet already warned the user which ones we're skipping.
  const rows = [];
  for (const r of allRows) {
    const os = openState(r.hours, r.timezone);
    if (os.known && !os.open) continue;
    rows.push(r);
  }
  const runId = `z${id}-${crypto.randomUUID()}`;
  const isPrivate = await isFinderPrivate(g.a);
  const placed: { retailerId: number; cid: string | null }[] = [];
  const sids: string[] = [];
  const viaBridge = (await getPolicy()).flags.cheapBridgeAll; // cheap lane: recipe nav + agent only on human
  for (const s of rows) {
    try {
      const r = await (viaBridge ? bridgeCheckCall : triggerCall)({ retailerId: s.id, categoryId: cat.id, mode: "restock", finderUserId: g.u.id, isPrivate, zoneRunId: runId });
      placed.push({ retailerId: s.id, cid: (r as { providerCallId?: string }).providerCallId ?? null });
      const sid = (r as { callSid?: string }).callSid; if (sid) sids.push(sid);
    } catch (e) { console.error("zone check failed", s.id, e); placed.push({ retailerId: s.id, cid: null }); }
  }
  zoneRunSids.set(runId, sids); setTimeout(() => zoneRunSids.delete(runId), 30 * 60 * 1000);
  return c.json({ runId, stores: placed });
});
app.get("/app/zones/run/:runId", async (c) => {
  const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
  const rows = await db.select().from(callResults).where(and(eq(callResults.zoneRunId, c.req.param("runId")), eq(callResults.finderUserId, g.u.id)));
  const stores = await retailerMap();
  const results = rows.map((r) => { const nm = stores.get(r.retailerId)?.name || "A store"; return { retailerId: r.retailerId, name: nm, logoUrl: chainLogoInfo(nm.split(/—|–| - /)[0]).url || "", cid: r.providerCallId, status: r.status, statusKey: r.statusKey, confirmed: r.confirmed, summary: r.summary }; });
  const live = (st: string) => st === "in_progress" || st === "queued";
  const summary = {
    inStock: results.filter((r) => r.statusKey === "in_stock").length,
    no: results.filter((r) => r.statusKey === "not_in_stock" || r.statusKey === "does_not_sell" || r.statusKey === "sold_out").length,
    noAnswer: results.filter((r) => r.statusKey === "nobody_answered" || r.status === "no_answer").length,
    checking: results.filter((r) => live(r.status)).length,
  };
  return c.json({ done: results.filter((r) => !live(r.status)).length, total: results.length, summary, results });
});
app.post("/app/zones/run/:runId/stop", async (c) => {
  const g = await zoneAuth(c.req.header("Authorization")); if (!g.ok) return c.json({ error: g.error }, g.status);
  const sids = zoneRunSids.get(c.req.param("runId")) || [];
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (sid && tok) for (const callSid of sids) {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`, {
      method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" }, body: "Status=completed",
    }).catch(() => {});
  }
  return c.json({ ok: true, stopped: sids.length });
});

// ---- Subscriber auto-checks (scheduled shipment-day calls) ----
app.get("/app/schedules", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  return c.json(await listSchedulesDetailed(u.id));
});
app.post("/app/schedule", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const pol = await getPolicy();
  if (!pol.flags.scheduling) return c.json({ error: "scheduling_off" }, 403);
  const a = await getAccount(u.id, u.email);
  if (!isCompAccount(a) && a?.subscription !== "active") return c.json({ error: "members_only" }, 402);
  const b = await c.req.json();
  if (!b.retailerId || !b.categoryId) return c.json({ error: "retailerId and categoryId required" }, 400);
  // The site sends its language with the signup — store it so this account's alerts go out in it.
  const schedLang = b.lang === "es" ? "es" : b.lang === "en" ? "en" : undefined;
  if (schedLang) await db.update(accounts).set({ language: schedLang }).where(eq(accounts.clerkUserId, u.id));
  const row = await createSchedule(u.id, { ...b, contact: b.contact || a?.email || undefined });
  return c.json({ ok: true, schedule: row });
});
app.delete("/app/schedules/:id", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  return c.json(await deleteSchedule(u.id, Number(c.req.param("id"))));
});

// ---- Referrals: give free checks, get free checks ----
app.get("/app/referral", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  return c.json(await referralStatus(u.id, u.email));
});
app.post("/app/referral/claim", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const { code } = await c.req.json().catch(() => ({}));
  const r = await claimReferral(u.id, code, u.email);
  if (!r.ok) return c.json({ error: r.reason }, r.reason === "disabled" ? 403 : 400);
  const a = await getAccount(u.id, u.email);
  return c.json({ ok: true, reward: r.reward, credits: a?.credits ?? 0 });
});

// The signed-in user's past checks — server-side, so history survives devices AND the Clerk
// instance migration: rows are matched by every clerk id that ever used this email, not just
// the current session's id (old-instance calls keep showing for the same person).
app.get("/app/history", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  let email = (u.email || c.req.query("email") || "").toLowerCase();
  // Phone-session tokens carry no email — resolve it from the account so the master's history
  // (calls made under the email/Clerk account) unifies with the phone login.
  if (!email) { const a = await getAccount(u.id); email = (a?.email || "").toLowerCase(); }
  const ids = new Set<string>([u.id]);
  if (email) {
    // Match by email with a WHERE clause (was a full accounts-table scan on every load — slow on the file DB).
    for (const a of await db.select({ clerkUserId: accounts.clerkUserId }).from(accounts).where(eq(accounts.email, email))) ids.add(a.clerkUserId);
  }
  const stores = await retailerMap();
  const cats = await categoryLabelMap();
  const rows = (await db.select().from(callResults)
    .where(inArray(callResults.finderUserId, [...ids]))
    .orderBy(desc(callResults.startedAt)).limit(80))
    .filter((r) => r.providerCallId);
  return c.json(rows.map((r) => {
    const sName = stores.get(r.retailerId)?.name || "A store";
    const l = chainLogoInfo(sName);
    return {
      cid: r.providerCallId, storeId: r.retailerId, storeName: sName,
      categoryId: r.categoryId, category: cats.get(r.categoryId) || "",
      ts: (r.startedAt || 0) * 1000, status: r.status, confirmed: r.confirmed,
      statusKey: r.statusKey, productDetail: r.productDetail, shipmentDay: r.shipmentDayHeard,
      logoUrl: l.url, logoWide: l.wide, logoDark: l.dark,
    };
  }));
});

// Charge one credit for a definitive answer (idempotent per call id).
app.post("/app/charge", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  // Charging is now SERVER-SIDE on call completion (ingestPending, atomic + idempotent). This
  // endpoint no longer trusts the client to bill itself — it just returns the live balance.
  const a = await getAccount(u.id, u.email);
  return c.json({ credits: isCompAccount(a) ? 9999 : spendableCredits(a) });
});
// Create a Stripe Checkout session (kind = "sub" | pack key). Returns a redirect URL.
app.post("/app/checkout", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const { kind, email, annual } = await c.req.json();
  const origin = (c.req.header("origin") || "https://runner.fungibles.com").replace(/\/$/, "");
  const url = await createCheckout(u.id, u.email || email, kind, origin, !!annual);
  if (!url) return c.json({ error: "checkout_failed" }, 400);
  return c.json({ url });
});
// Embedded checkout (Stripe Elements — the custom BRANDED on-site page). Returns the client_secret +
// publishable key the Website confirms with Elements. kind = tier key or "payg:<checks>".
app.post("/app/checkout-intent", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const { kind, annual } = await c.req.json();
  try {
    const intent = await createCheckoutIntent(u.id, u.email || undefined, String(kind || ""), !!annual);
    if (!intent) return c.json({ error: "checkout_unavailable" }, 400);
    return c.json(intent);
  } catch (e) { return c.json({ error: String(e).slice(0, 200) }, 400); }
});

// Public: the live tiers + PAYG ladder for the consumer checkout sheet (Website's lane renders it).
app.get("/pub/plans", async (c) => c.json(publicPlans(await getPlans())));
// Freshness marker for the long-lived SPA tab (owner 07-17: his Safari tab ran days-old JS through a
// whole broken-then-fixed cycle because nothing ever told the page it was stale). One value per boot —
// a deploy restarts the service, so a changed rev == a newer build is live. Client checks on tab-return.
const BOOT_REV = String(Date.now());
app.get("/pub/rev", (c) => { c.header("Cache-Control", "no-store"); return c.json({ rev: BOOT_REV }); });

// ---- Admin Plans manager (God View → Plans): edit tiers/PAYG, publish to Stripe. Admin-gated by /api/*. ----
app.get("/api/admin/plans", async (c) => c.json(plansSyncView(await getPlans())));
app.post("/api/admin/plans", async (c) => {
  try {
    const body = await c.req.json();
    // The editor sends names/prices/quotas/flags; preserve Stripe ids + publish snapshots server-side.
    const cur = await getPlans();
    const merged = normalizePlans({
      tiers: (body.tiers || []).map((t: Record<string, unknown>) => {
        const ex = cur.tiers.find((x) => x.key === t.key);
        return { ...ex, ...t, stripeProductId: ex?.stripeProductId ?? null, monthlyPriceId: ex?.monthlyPriceId ?? null, annualPriceId: ex?.annualPriceId ?? null, pub: ex?.pub ?? null };
      }),
      payg: { stripeProductId: cur.payg.stripeProductId, bundles: (body.payg || []).map((b: Record<string, unknown>) => {
        const ex = cur.payg.bundles.find((x) => x.checks === Number(b.checks));
        return { ...b, priceId: ex?.priceId ?? null, pubCents: ex?.pubCents ?? null };
      }) },
    });
    return c.json(plansSyncView(await savePlans(merged)));
  } catch (e) { return c.json({ error: String(e) }, 400); }
});
app.post("/api/admin/plans/publish", async (c) => {
  if (!process.env.STRIPE_SECRET_KEY) return c.json({ error: "stripe_key_missing" }, 400);
  try {
    const published = await publishPlansToStripe(await getPlans());
    return c.json(plansSyncView(await savePlans(published)));
  } catch (e) { return c.json({ error: String(e) }, 400); }
});

// ---- Stripe webhook (public, signature-verified) ----
app.post("/webhooks/stripe", async (c) => {
  const raw = await c.req.text();
  if (!(await verifyStripeSig(raw, c.req.header("stripe-signature") ?? null))) return c.json({ error: "bad signature" }, 400);
  try { await handleStripeEvent(JSON.parse(raw)); } catch (e) { console.error("stripe webhook:", e); }
  return c.json({ received: true });
});

// ---- Admin: real-time COGS / margin (owner-gated via the /api/* Clerk middleware) ----
app.get("/api/admin/metrics", async (c) => {
  const accs = await db.select().from(accounts);
  const revenueCents = accs.reduce((s, a) => s + a.totalSpentCents, 0);
  const subs = accs.filter((a) => a.subscription === "active").length;
  const creditsOutstanding = accs.reduce((s, a) => s + a.credits, 0);
  const callsMade = accs.reduce((s, a) => s + a.callsMade, 0);
  const credit = await getCreditStatus(); // ElevenLabs usage
  // COGS estimate: ElevenLabs credits used so far valued at $1.82 / 10k credits + Stripe fees (2.9% + $0.30/charge).
  const elevenCostCents = Math.round((credit.used / 10000) * 182);
  const stripeFeeCents = Math.round(revenueCents * 0.029) + accs.filter((a) => a.totalSpentCents > 0).length * 30;
  const cogsCents = elevenCostCents + stripeFeeCents;
  return c.json({
    users: accs.length, subscribers: subs, mrrCents: subs * SUB.cents,
    revenueCents, creditsOutstanding, callsMade,
    cogs: { elevenLabsCents: elevenCostCents, stripeFeesCents: stripeFeeCents, totalCents: cogsCents },
    profitCents: revenueCents - cogsCents,
    marginPct: revenueCents > 0 ? Math.round(((revenueCents - cogsCents) / revenueCents) * 100) : 0,
    elevenLabsCreditsUsed: credit.used,
  });
});

// Support diagnostic: does this email have any checks on record? (admin-gated). Mirrors the
// /app/history join (all accounts sharing the email → their finderUserId calls) so we can answer
// "do I have history?" without the user's Clerk token.
app.get("/api/admin/user-history", async (c) => {
  const email = (c.req.query("email") || "").toLowerCase();
  if (!email) return c.json({ error: "email required" }, 400);
  const accs = (await db.select().from(accounts)).filter((a) => (a.email || "").toLowerCase() === email);
  const ids = accs.map((a) => a.clerkUserId);
  const stores = await retailerMap();
  const cats = await categoryLabelMap();
  const ownerOnly = await ownerOnlyRetailerIds();
  const rows = (ids.length
    ? (await db.select().from(callResults).where(inArray(callResults.finderUserId, ids)).orderBy(desc(callResults.startedAt)).limit(80))
    : []).filter((r) => !ownerOnly.has(r.retailerId) && r.status !== "admin_hangup");
  const withCid = rows.filter((r) => r.providerCallId);
  return c.json({
    email,
    accounts: accs.map((a) => ({ clerkUserId: a.clerkUserId, credits: a.credits, subscription: a.subscription, callsMade: a.callsMade, totalSpentCents: a.totalSpentCents })),
    totalCalls: rows.length, replayable: withCid.length,
    calls: withCid.map((r) => ({ cid: r.providerCallId, store: stores.get(r.retailerId)?.name || r.retailerId, category: cats.get(r.categoryId) || r.categoryId, status: r.status, confirmed: r.confirmed, at: r.startedAt })),
  });
});

// ---- Restock intel: the compounding payoff — where/when product actually lands ----
// Restock product intel, derived at serve time from callResults.productDetail ("form · set", built by
// productDetailLabel). Splits it back into forms / sets / raw details. Exact columns are a DevOps follow-up.
function topTally(m: Map<string, number>, key: string, lim?: number) {
  const a = [...m.entries()].sort((x, y) => y[1] - x[1]).map(([v, n]) => ({ [key]: v, n }));
  return lim ? a.slice(0, lim) : a;
}
function parseProducts(rows: { productDetail: string | null }[]) {
  const forms = new Map<string, number>(), sets = new Map<string, number>(), details = new Map<string, number>();
  const bump = (mp: Map<string, number>, k: string) => mp.set(k, (mp.get(k) || 0) + 1);
  for (const r of rows) {
    const d = (r.productDetail || "").trim(); if (!d) continue;
    bump(details, d);
    const parts = d.split("·").map((x) => x.trim()).filter(Boolean);
    if (parts[0]) bump(forms, /etb/i.test(parts[0]) ? "ETB" : parts[0].charAt(0).toUpperCase() + parts[0].slice(1));
    if (parts[1]) bump(sets, parts[1]);
  }
  return { forms: topTally(forms, "form"), sets: topTally(sets, "set", 25), details: topTally(details, "detail") };
}
// What ACTUALLY happened on a call, read from the transcript words — the persisted status conflated
// "stuck in the phone tree" with "nobody answered", which hid the real story: most calls never reach a
// human. Buckets: in_stock | got_some (shipment landed, not shelved) | not_in | reached_no_answer
// (a person picked up but the call dropped before an answer) | never_reached (died in an IVR / pharmacy
// virtual assistant / on hold). Validated against a hand audit of every real-store call.
type CallReality = "in_stock" | "got_some" | "not_in" | "reached_no_answer" | "never_reached";
function classifyCallReality(transcript: string | null): CallReality {
  const s = (transcript || "").toLowerCase().replace(/\s+/g, " ");
  if (/\bwe do\b(?!\s*not)|got some in stock|you'?ve got some in stock|we have some|we have a few|yeah[.,]? (we|so you)/.test(s)) return "in_stock";
  if (/we did get some|we did,? but it'?s not out|got some.* not out|not out yet,? but we did/.test(s)) return "got_some";
  if (/we did not\b|we don'?t have|we haven'?t\b|haven'?t seen any|i did not see any|no,? i'?m sorry|no,? we don'?t|not (in|for) this shipment|did not receive any|didn'?t get any|clerk: no[.,]/.test(s)) return "not_in";
  if (/how can i help|can i help you|may i help you|welcome to cvs|this is (cvs|staples|cbs|cds)|hello,? seabass|thanks for calling barnes|hello\? hello\?|can'?t hear you|gonna have to call again/.test(s)) return "reached_no_answer";
  return "never_reached";
}
// The chain a store belongs to, for the per-chain reach breakdown (B&N answers direct; CVS/Walgreens
// hide behind a phone bot). Falls back to the store's own name when it isn't one of the known chains.
function chainLabel(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cvs")) return "CVS";
  if (n.includes("walgreens")) return "Walgreens";
  if (n.includes("target")) return "Target";
  if (n.includes("barnes")) return "Barnes & Noble";
  if (n.includes("franklin") || n.includes("ace hardware")) return "Ace Hardware";
  if (n.includes("staples")) return "Staples";
  return name.split("—")[0].trim();
}
app.get("/api/admin/restock-intel", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const d7 = now - 7 * 86400, d30 = now - 30 * 86400;
  const stores = await retailerMap();
  const cats = await categoryLabelMap();
  const ownerOnly = await ownerOnlyRetailerIds();
  const statsSince = await getStatsSince();
  const rows = (await db.select().from(callResults).where(eq(callResults.status, "completed"))).filter((r) => !ownerOnly.has(r.retailerId) && (r.startedAt || 0) >= statsSince);
  const confirmed = rows.filter((r) => r.confirmed === true);
  // Per-store: how often a confirmation lands + the shipment day staff gave (the gold).
  const byStore = new Map<number, { id: number; store: string; location: string | null; chain: string; region: string | null; confirms: number; last: number; days: Record<string, number> }>();
  for (const r of confirmed) {
    const s = stores.get(r.retailerId); if (!s) continue;
    let e = byStore.get(r.retailerId);
    if (!e) { e = { id: r.retailerId, store: s.name.split("—")[0].trim(), location: s.location ?? null, chain: "", region: s.region ?? null, confirms: 0, last: 0, days: {} }; byStore.set(r.retailerId, e); }
    e.confirms++;
    const at = r.completedAt ?? r.startedAt; if (at > e.last) e.last = at;
    if (r.shipmentDayHeard) e.days[r.shipmentDayHeard] = (e.days[r.shipmentDayHeard] || 0) + 1;
  }
  // Per-shipment-day across the whole network (e.g. "Thursday" dominates) — drives scheduled calls.
  const dayTally: Record<string, number> = {};
  for (const r of confirmed) if (r.shipmentDayHeard) dayTally[r.shipmentDayHeard] = (dayTally[r.shipmentDayHeard] || 0) + 1;
  // Network product mix — which FORMS (booster/hobby box, tin, ETB, pack…) and SETS land most, from
  // the free-text productDetail staff named. Same derivation as the per-store endpoint.
  const formTally: Record<string, number> = {}, setTally: Record<string, number> = {};
  for (const r of confirmed) {
    const f = productForm(r.productDetail); if (f) formTally[f] = (formTally[f] || 0) + 1;
    const s = productSet(r.productDetail); if (s) setTally[s] = (setTally[s] || 0) + 1;
  }
  // Per-category split (which brand line lands most).
  const catTally: Record<string, number> = {};
  for (const r of confirmed) { const label = cats.get(r.categoryId) || String(r.categoryId); catTally[label] = (catTally[label] || 0) + 1; }
  const topStores = [...byStore.values()].sort((a, b) => b.confirms - a.confirms || b.last - a.last).slice(0, 25)
    .map((e) => ({ ...e, bestDay: Object.entries(e.days).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }));
  const prodNet = parseProducts(confirmed);
  const catNet: Record<string, number> = {};
  for (const r of confirmed) { const cl = cats.get(r.categoryId) || "?"; catNet[cl] = (catNet[cl] || 0) + 1; }
  // Answer funnel — the honest "what did these calls actually achieve" read. Most real-store calls die
  // in a phone tree before a human ever picks up; this surfaces that (and the per-chain reach gap).
  const buckets = { in_stock: 0, got_some: 0, not_in: 0, reached_no_answer: 0, never_reached: 0 };
  const chainFn = new Map<string, { chain: string; dialed: number; reached: number; answered: number }>();
  for (const r of rows) {
    const b = classifyCallReality(r.transcript);
    buckets[b]++;
    const s = stores.get(r.retailerId);
    const ch = s ? chainLabel(s.name) : "?";
    let cf = chainFn.get(ch); if (!cf) { cf = { chain: ch, dialed: 0, reached: 0, answered: 0 }; chainFn.set(ch, cf); }
    cf.dialed++;
    if (b !== "never_reached") cf.reached++;
    if (b === "in_stock" || b === "got_some" || b === "not_in") cf.answered++;
  }
  const firstReal = rows.reduce((m, r) => Math.min(m, r.startedAt || Infinity), Infinity);
  const answerFunnel = {
    dialed: rows.length,
    reachedHuman: rows.length - buckets.never_reached,
    gotAnswer: buckets.in_stock + buckets.got_some + buckets.not_in,
    firstCall: isFinite(firstReal) ? firstReal : null,
    buckets,
    byChain: [...chainFn.values()].sort((a, b) => b.dialed - a.dialed),
  };
  return c.json({
    totals: {
      checks: rows.length, confirms: confirmed.length,
      confirmRate: rows.length ? Math.round((confirmed.length / rows.length) * 100) : 0,
      confirms7d: confirmed.filter((r) => (r.completedAt ?? r.startedAt) >= d7).length,
      confirms30d: confirmed.filter((r) => (r.completedAt ?? r.startedAt) >= d30).length,
    },
    shipmentDays: Object.entries(dayTally).sort((a, b) => b[1] - a[1]).map(([day, n]) => ({ day, n })),
    productForms: prodNet.forms,
    productSets: prodNet.sets,
    byCategory: Object.entries(catNet).sort((a, b) => b[1] - a[1]).map(([category, n]) => ({ category, n })),
    topStores: topStores.map((e) => ({ id: e.id, store: e.store, location: e.location, region: e.region, confirms: e.confirms, last: e.last, bestDay: e.bestDay })),
    answerFunnel,
    statsSince,
  });
});

// Per-store restock intel (one store's own page) — same serve-time derivation, scoped to this store.
app.get("/api/admin/store-restock/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const store = (await db.select().from(retailers).where(eq(retailers.id, id)))[0];
  if (!store) return c.json({ error: "not found" }, 404);
  const cats = await categoryLabelMap();
  const rows = await db.select().from(callResults).where(and(eq(callResults.retailerId, id), eq(callResults.status, "completed")));
  const confirmed = rows.filter((r) => r.confirmed === true);
  const tz = store.timezone || "America/Los_Angeles";
  const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  // what staff said (the gold): the shipment day staff gave, across all completed calls
  const staffT: Record<string, number> = {};
  for (const r of rows) if (r.shipmentDayHeard) staffT[r.shipmentDayHeard] = (staffT[r.shipmentDayHeard] || 0) + 1;
  const staffTally = Object.entries(staffT).sort((a, b) => b[1] - a[1]).map(([day, n]) => ({ day, n }));
  const staffMode = staffTally[0]?.day ?? null;
  // empirical — confirmed-in-stock by weekday, in the store's local time
  const wd: Record<string, number> = Object.fromEntries(WD.map((d) => [d, 0]));
  for (const r of confirmed) {
    const at = r.completedAt ?? r.startedAt;
    const day = new Date(at * 1000).toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
    if (day in wd) wd[day]++;
  }
  const byWeekday = WD.map((day) => ({ day, confirms: wd[day] }));
  const empBest = [...byWeekday].sort((a, b) => b.confirms - a.confirms)[0];
  const empiricalBestDay = empBest && empBest.confirms > 0 ? empBest.day : null;
  const catT: Record<string, number> = {};
  for (const r of confirmed) { const cl = cats.get(r.categoryId) || "?"; catT[cl] = (catT[cl] || 0) + 1; }
  return c.json({
    store: store.name,
    location: store.location || null,
    timezone: tz,
    storedShipmentDay: store.shipmentDay || null,
    staffSaid: { mode: staffMode, tally: staffTally },
    empirical: { bestDay: empiricalBestDay, byWeekday },
    bestDay: staffMode || empiricalBestDay,           // prefer what staff said; else the empirical peak
    confidence: confirmed.length,                     // # confirmed calls behind it
    confirms: confirmed.length,
    lastConfirm: confirmed.reduce((m, r) => Math.max(m, r.completedAt ?? r.startedAt), 0) || null,
    byCategory: Object.entries(catT).sort((a, b) => b[1] - a[1]).map(([category, n]) => ({ category, n })),
    products: parseProducts(confirmed),
  });
});

// Re-scan stored transcripts with the CURRENT consensus verdict — retroactively applies the fix for
// mis-classified statuses AND recovers the staff-volunteered restock day + product form the old ingest
// dropped. Reports true before/after counts + the first real call. Real stores only (skips Fun/MVPs).
app.post("/api/admin/restock-backfill", async (c) => {
  const ownerOnly = await ownerOnlyRetailerIds();
  const cats = await categoryLabelMap();
  const all = await db.select().from(callResults).where(eq(callResults.status, "completed"));
  const rows = all.filter((r) => r.transcript && r.transcript.length > 12 && !ownerOnly.has(r.retailerId));
  const cat = (confirmed: boolean | null, day: string | null) =>
    confirmed === true ? "in_stock" : day ? "restock_coming" : confirmed === false ? "not_in" : "unclear";
  const blank = () => ({ in_stock: 0, restock_coming: 0, not_in: 0, unclear: 0 });
  const before = blank(), after = blank();
  let scanned = 0, flipped = 0, dayAdded = 0, prodAdded = 0;
  for (const r of rows) {
    before[cat(r.confirmed, r.shipmentDayHeard) as keyof ReturnType<typeof blank>]++;
    const second = await classifyVerdict(r.transcript ?? "", cats.get(r.categoryId) || "the product");
    if (!second) { after[cat(r.confirmed, r.shipmentDayHeard) as keyof ReturnType<typeof blank>]++; continue; }
    const consensus = reconcile({ confirmed: r.confirmed, soldOut: r.statusKey === "sold_out", doesNotSell: r.statusKey === "does_not_sell", statusKey: r.statusKey ?? undefined }, second);
    const day = second.restockDay ?? r.shipmentDayHeard;
    const detail = productDetailLabel(second) ?? r.productDetail;
    if (consensus.confirmed !== r.confirmed) flipped++;
    if (day && !r.shipmentDayHeard) dayAdded++;
    if (detail && !r.productDetail) prodAdded++;
    await db.update(callResults).set({ confirmed: consensus.confirmed, statusKey: consensus.statusKey, shipmentDayHeard: day, productDetail: detail }).where(eq(callResults.id, r.id));
    scanned++;
    after[cat(consensus.confirmed, day) as keyof ReturnType<typeof blank>]++;
  }
  const firstReal = all.filter((r) => !ownerOnly.has(r.retailerId)).reduce((m, r) => Math.min(m, r.startedAt || Infinity), Infinity);
  return c.json({ scanned, flipped, dayAdded, prodAdded, before, after, firstRealCall: isFinite(firstReal) ? firstReal : null });
});

// Read-only ground-truth audit: every real-store completed call with a transcript head/tail, so we can
// hand-classify "reached a human" vs "stuck in the phone tree" and tally the true in-stock / not-in /
// restock-coming numbers (the persisted statusKey was sometimes wrong — this reads the actual words).
app.get("/api/admin/restock-audit", async (c) => {
  const ownerOnly = await ownerOnlyRetailerIds();
  const cats = await categoryLabelMap();
  const rmap = new Map((await db.select({ id: retailers.id, name: retailers.name, location: retailers.location, region: retailers.region, state: retailers.state }).from(retailers)).map((r) => [r.id, r]));
  const all = (await db.select().from(callResults).where(eq(callResults.status, "completed")))
    .filter((r) => !ownerOnly.has(r.retailerId))
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  const rows = all.map((r) => {
    const t = (r.transcript || "").replace(/\s+/g, " ").trim();
    const ret = rmap.get(r.retailerId);
    return {
      id: r.id, started: r.startedAt, store: ret?.name || `#${r.retailerId}`, location: ret?.location || null,
      region: ret?.region || null, state: ret?.state || null, category: cats.get(r.categoryId) || null,
      statusKey: r.statusKey, confirmed: r.confirmed, day: r.shipmentDayHeard, product: r.productDetail,
      navSec: r.navSeconds, callSec: r.callSeconds, len: t.length,
      head: t.slice(0, 900), tail: t.length > 1400 ? t.slice(-500) : "",
    };
  });
  return c.json({ total: rows.length, rows });
});

// ---- Call-data integrity: the unfiltered truth about call_results, for the Call-data-health panel ----
// Full, unfiltered view of every row so the owner can see what's real vs. seed/rehearsal/never-dialed.
// A call that actually dialed a store has a providerCallId (an ElevenLabs conversation); seed/manual
// rows don't, and the owner-only "Fun" store is rehearsal — so firstDialedCall is the true first call.
app.get("/api/admin/calls-audit", async (c) => {
  const ownerOnly = await ownerOnlyRetailerIds();
  const stores = await retailerMap();
  const rows = await db.select({
    id: callResults.id, retailerId: callResults.retailerId, status: callResults.status,
    statusKey: callResults.statusKey, confirmed: callResults.confirmed, providerCallId: callResults.providerCallId,
    startedAt: callResults.startedAt, completedAt: callResults.completedAt,
  }).from(callResults);
  const tally = (f: (r: (typeof rows)[number]) => string | null | undefined) => {
    const t: Record<string, number> = {};
    for (const r of rows) { const k = String(f(r) ?? "—"); t[k] = (t[k] || 0) + 1; }
    return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ k, n }));
  };
  const withTs = rows.filter((r) => r.startedAt).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  const dialed = withTs.filter((r) => r.providerCallId && !ownerOnly.has(r.retailerId));
  const desc = (r?: (typeof rows)[number]) => (r ? {
    id: r.id, store: stores.get(r.retailerId)?.name?.split("—")[0].trim() || `#${r.retailerId}`,
    at: r.startedAt, status: r.status, statusKey: r.statusKey, confirmed: r.confirmed, hasProviderCall: !!r.providerCallId,
  } : null);
  const cidCounts: Record<string, number> = {};
  for (const r of rows) if (r.providerCallId) cidCounts[r.providerCallId] = (cidCounts[r.providerCallId] || 0) + 1;
  return c.json({
    total: rows.length,
    ownerOnlyTest: rows.filter((r) => ownerOnly.has(r.retailerId)).length, // "Fun"/rehearsal store calls
    neverDialed: rows.filter((r) => !r.providerCallId).length,             // no EL conversation → never reached a store
    adminHangup: rows.filter((r) => r.status === "admin_hangup").length,   // aborted from the dashboard
    confirmedInStock: rows.filter((r) => r.confirmed === true).length,
    duplicateProviderCalls: Object.values(cidCounts).filter((n) => n > 1).length, // double-ingested = integrity red flag
    byStatus: tally((r) => r.status),
    byStatusKey: tally((r) => r.statusKey),
    firstCall: desc(withTs[0]),                 // earliest row of any kind (may be a seed/manual row)
    firstDialedCall: desc(dialed[0]),           // the true first REAL call into a store
    lastCall: desc(withTs[withTs.length - 1]),
  });
});

// Remove un-provable call rows (no ElevenLabs conversation, or never reached a true outcome). Dry-run by
// default (?dry=0 to actually delete); billed calls are protected and everything is restorable from
// ElevenLabs. Admin-token gated. The Call-data-health panel calls this dry-run only (preview, no delete).
app.post("/api/admin/purge-undefined-calls", async (c) => {
  const dry = c.req.query("dry") !== "0";
  const includeOwner = c.req.query("includeOwner") === "1"; // also drop "Fun" rehearsal calls if asked
  const ownerOnly = await ownerOnlyRetailerIds();
  const rows = await db.select({
    id: callResults.id, status: callResults.status, providerCallId: callResults.providerCallId,
    chargedAt: callResults.chargedAt, retailerId: callResults.retailerId,
  }).from(callResults);
  const TRUE_STATUS = new Set(["completed", "no_answer"]); // a placed call that reached a real outcome
  const reasonFor = (r: (typeof rows)[number]): string | null => {
    if (r.chargedAt) return null;                                  // billed → never delete (protected)
    if (!r.providerCallId) return "never_placed";                  // no EL conversation → can't prove we called
    if (!TRUE_STATUS.has(r.status)) return "no_true_status";       // admin_hangup / failed / queued / dialing…
    if (includeOwner && ownerOnly.has(r.retailerId)) return "owner_test"; // optional: drop Fun rehearsal calls
    return null;                                                   // keep
  };
  const doomed = rows.map((r) => ({ r, reason: reasonFor(r) })).filter((x) => x.reason) as Array<{ r: (typeof rows)[number]; reason: string }>;
  const byReason: Record<string, number> = {};
  for (const x of doomed) byReason[x.reason] = (byReason[x.reason] || 0) + 1;
  let deleted = 0;
  if (!dry && doomed.length) {
    const ids = doomed.map((x) => x.r.id);
    for (let i = 0; i < ids.length; i += 200) await db.delete(callResults).where(inArray(callResults.id, ids.slice(i, i + 200)));
    deleted = ids.length;
  }
  return c.json({
    dry, total: rows.length, flagged: doomed.length, keptDefinitive: rows.length - doomed.length,
    byReason, deleted,
    rule: "keep only providerCallId + status in {completed,no_answer}; billed calls protected; restorable from ElevenLabs",
  });
});

// Read-only: does the LIVE ElevenLabs agent prompt still carry the dynamic-variable slots? Confirms a
// workflow's persona / opener actually reach the agent (a stale prompt would silently drop {{personality}}).
app.get("/api/admin/agent-prompt", async (c) => {
  const key = config.voice.apiKey, agentId = config.voice.agentId;
  if (!key || !agentId) return c.json({ error: "elevenlabs not configured" }, 503);
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, { headers: { "xi-api-key": key } });
  if (!r.ok) return c.json({ error: `agent GET ${r.status}` }, 502);
  const d = await r.json() as { conversation_config?: { agent?: { prompt?: { prompt?: string } } } };
  const prompt = d?.conversation_config?.agent?.prompt?.prompt || "";
  const has = (v: string) => prompt.includes(v);
  return c.json({
    agentId, promptLen: prompt.length,
    hasPersonality: has("{{personality}}"), hasOpeningLine: has("{{opening_line}}"),
    hasCategory: has("{{category}}"), hasClarification: has("{{clarification}}"),
    prompt: c.req.query("full") === "1" ? prompt : undefined,
  });
});

// Which stores / chains each workflow is assigned to — by NAME, so the Workflows cards can show
// "Branson Test → Fun" instead of just a count.
app.get("/api/admin/workflow-assignments", async (c) => {
  const [storeS, chainS] = await Promise.all([getSetting("vt_store_workflows"), getSetting("vt_chain_workflows")]);
  const parse = (s: string | null): Record<string, string> => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
  const byStore = parse(storeS), byChain = parse(chainS);
  const storeIds = Object.keys(byStore).map(Number).filter((n) => !isNaN(n));
  const chainIds = Object.keys(byChain).map(Number).filter((n) => !isNaN(n));
  const storeRows = storeIds.length ? await db.select({ id: retailers.id, name: retailers.name, location: retailers.location }).from(retailers).where(inArray(retailers.id, storeIds)) : [];
  const chainRows = chainIds.length ? await db.select({ id: chains.id, name: chains.name }).from(chains).where(inArray(chains.id, chainIds)) : [];
  const sName = new Map(storeRows.map((r) => [r.id, r])), cName = new Map(chainRows.map((r) => [r.id, r]));
  const out: Record<string, { stores: Array<{ id: number; name: string; location: string | null }>; chains: Array<{ id: number; name: string }> }> = {};
  const slot = (wf: string) => (out[wf] ??= { stores: [], chains: [] });
  for (const [id, wf] of Object.entries(byStore)) { const r = sName.get(Number(id)); if (r) slot(wf).stores.push({ id: r.id, name: r.name.split("—")[0].trim(), location: r.location ?? null }); }
  for (const [id, wf] of Object.entries(byChain)) { const r = cName.get(Number(id)); if (r) slot(wf).chains.push({ id: r.id, name: r.name }); }
  return c.json(out);
});

// Reset a workflow's opener rotation so the NEXT call to it starts at opener #1 (predictable A→B→C
// testing). No workflow name → resets the shared global opener rotation.
app.post("/api/admin/reset-rotation", async (c) => {
  const b = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const wf = typeof b.workflow === "string" && b.workflow.trim() ? b.workflow.trim() : "";
  // Reset the workflow's own counters (bridge / listen-live path) AND the global ones (scheduled path),
  // so the next call starts at opener #1 AND voice #1 no matter which path places it. Delta shares the
  // same opener/voice counters and adds one per line slot (fu:<wf>:<slot>) — reset those too.
  const FU_SLOTS = ["set", "type", "no", "wrap", "wrapNo", "clarify", "hello", "escalate"];
  const keys = wf ? ["opener:" + wf, "opener", "voice:" + wf, "voice", ...FU_SLOTS.map((s) => `fu:${wf}:${s}`)] : ["opener", "voice"];
  keys.forEach(resetRotation);
  return c.json({ ok: true, keys, workflow: wf || null });
});

// Testing log — owner-only / "Fun" rehearsal stores ONLY (never the real-store stats). Per-call: the
// workflow applied, the opener actually used (pulled from the transcript + matched to its rotation slot),
// the call status, and the nav / talk / total timing. The owner's working log while messing with the agent.
app.get("/api/admin/test-calls", async (c) => {
  const ownerOnly = await ownerOnlyRetailerIds();
  const stores = await retailerMap();
  const cats = await categoryLabelMap();
  const [storeS, chainS, defS, libS] = await Promise.all([
    getSetting("vt_store_workflows"), getSetting("vt_chain_workflows"), getSetting("vt_default_workflow"), getSetting("vt_workflows"),
  ]);
  const parseObj = (s: string | null): Record<string, string> => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
  const byStore = parseObj(storeS), byChain = parseObj(chainS);
  let lib: Array<{ name: string; openers?: string[] }> = []; try { lib = libS ? JSON.parse(libS) : []; } catch { lib = []; }
  const wfFor = (rid: number) => {
    const s = stores.get(rid);
    const name = byStore[String(rid)] || (s && s.chainId != null ? byChain[String(s.chainId)] : "") || (defS || "");
    return name ? (lib.find((w) => w && w.name === name) || null) : null;
  };
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const firstAgentLine = (t: string) => {
    const segs = String(t || "").split(/(?=(?:Clerk|Agent):\s)/);
    const a = segs.find((s) => /^Agent:/.test(s.trim()));
    return a ? a.replace(/^Agent:\s*/, "").trim() : "";
  };
  // Match the spoken opener back to a workflow rotation slot (A/B/C…) by word overlap.
  const matchOpener = (transcript: string | null, wf: ReturnType<typeof wfFor>, cat: string) => {
    const line = firstAgentLine(transcript || "");
    const openers = wf?.openers || [];
    if (!line || !openers.length) return { label: null as string | null, said: line || null, template: null as string | null };
    const nl = norm(line);
    let best = -1, bestScore = 0;
    openers.forEach((o, i) => {
      const ow = norm(String(o).replace(/\{category\}/g, cat)).split(" ").filter((w) => w.length > 2);
      const hit = ow.filter((w) => nl.includes(w)).length;
      const score = ow.length ? hit / ow.length : 0;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    const label = best >= 0 && bestScore >= 0.5 ? String.fromCharCode(65 + best) : null;
    return { label, said: line, template: best >= 0 ? openers[best] : null };
  };
  const all = (await db.select().from(callResults))
    .filter((r) => ownerOnly.has(r.retailerId))
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  const rows = all.map((r) => {
    const wf = wfFor(r.retailerId);
    const cat = cats.get(r.categoryId) || "";
    const nav = r.navSeconds, call = r.callSeconds;
    return {
      id: r.id, started: r.startedAt,
      store: stores.get(r.retailerId)?.name?.split("—")[0].trim() || `#${r.retailerId}`,
      category: cat, status: r.statusKey || r.status, confirmed: r.confirmed,
      workflow: wf?.name || null, opener: matchOpener(r.transcript, wf, cat),
      navSec: nav ?? null, callSec: call ?? null,
      talkSec: call != null && nav != null ? Math.max(0, call - nav) : null,
      summary: r.summary || null,
    };
  });
  const timed = rows.filter((r) => r.callSec != null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
  return c.json({
    count: rows.length,
    summary: {
      calls: timed.length,
      avgNavSec: avg(timed.map((r) => r.navSec || 0)),
      avgTalkSec: avg(timed.filter((r) => r.talkSec != null).map((r) => r.talkSec as number)),
      avgCallSec: avg(timed.map((r) => r.callSec as number)),
    },
    rows,
  });
});

// "Start fresh": stamp a cutoff so real-call stats only count calls from now on (e.g. after going live
// on real stores). GET reads it; POST sets it to now (or {clear:true} to count everything again).
app.get("/api/admin/stats-since", async (c) => c.json({ statsSince: await getStatsSince() }));
app.post("/api/admin/stats-since", async (c) => {
  const b = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const now = Math.floor(Date.now() / 1000);
  const ts = b.clear === true ? 0 : (typeof b.at === "number" && b.at > 0 ? Math.floor(b.at) : now);
  await setSetting("stats_since", String(ts));
  return c.json({ ok: true, statsSince: ts });
});

// ---- Growth pulse: the funnel + engagement snapshot the owner reads each morning ----
// Manually-flagged admin/test accounts (Clerk-free, so we can't rely on email domains). These are
// non-customers — excluded from signups/activity like the comp/owner accounts.
async function staffAccountIds(): Promise<Set<string>> {
  try { const raw = await getSetting("staff_accounts"); const arr = raw ? JSON.parse(raw) : []; return new Set(Array.isArray(arr) ? arr.map(String) : []); } catch { return new Set<string>(); }
}
// Is this account a non-customer (owner/comp by email, or manually flagged admin/test)?
const isStaffAcct = (a: typeof accounts.$inferSelect, flagged: Set<string>) => isComp(a.email) || isCompAccount(a) || flagged.has(a.clerkUserId);
// User dashboard — everyone who's signed up (phone-first accounts, Clerk-free). Newest first.
app.get("/api/admin/users", async (c) => {
  const accs = await db.select().from(accounts).orderBy(desc(accounts.createdAt));
  const flagged = await staffAccountIds();
  return c.json(accs.map((a) => {
    const comp = isComp(a.email) || isCompAccount(a);
    const staff = comp || flagged.has(a.clerkUserId);
    const plan = a.subscription === "active" ? "Subscriber" : (a.totalSpentCents > 0 ? "Pay-as-you-go" : (staff ? (comp ? "Comp / owner" : "Admin / test") : "Free"));
    return {
      id: a.clerkUserId,
      phone: a.phone || (a.clerkUserId?.startsWith("phone:") ? a.clerkUserId.slice(6) : null),
      email: a.email || null,
      plan, subscription: a.subscription, comp, staff, manualStaff: flagged.has(a.clerkUserId),
      credits: a.credits, callsMade: a.callsMade, spentCents: a.totalSpentCents,
      callerIdVerified: !!a.callerId, referredBy: a.referredBy || null,
      createdAt: a.createdAt, renewsAt: a.subRenewsAt || null,
    };
  }));
});
// ---- Admin UI ship path (see adminUiHtml above). All under the /api/* admin wall. ----
// Deploy: raw text/html body = the new app.html. Atomic (tmp + rename); the outgoing version is
// archived for rollback (last 5 kept). x-commit header stamps provenance into meta.json.
app.post("/api/admin/ui-deploy", async (c) => {
  const html = await c.req.text();
  if (html.length > 8_000_000) return c.json({ error: "too_large" }, 413);
  if (!html.includes("</html>") || !html.includes("grpnav")) return c.json({ error: "not_the_admin_shell", hint: "body must be the complete public/app.html" }, 400);
  mkdirSync(ADMIN_UI_DIR, { recursive: true });
  const now = Math.floor(Date.now() / 1000);
  if (existsSync(ADMIN_UI_LIVE)) renameSync(ADMIN_UI_LIVE, join(ADMIN_UI_DIR, `app.${now}.html`));
  const archives = fsReaddirSync(ADMIN_UI_DIR).filter((f) => /^app\.\d+\.html$/.test(f)).sort();
  for (const f of archives.slice(0, Math.max(0, archives.length - ADMIN_UI_KEEP))) unlinkSync(join(ADMIN_UI_DIR, f));
  const tmp = join(ADMIN_UI_DIR, "app.html.tmp");
  writeFileSync(tmp, html);
  renameSync(tmp, ADMIN_UI_LIVE); // atomic swap — in-flight requests see old or new, never partial
  const meta = { commit: c.req.header("x-commit") || null, at: now, bytes: html.length };
  writeFileSync(ADMIN_UI_META, JSON.stringify(meta));
  return c.json({ ok: true, ...meta });
});
// Roll back to the most recently archived version (repeatable while archives remain).
app.post("/api/admin/ui-rollback", async (c) => {
  const archives = existsSync(ADMIN_UI_DIR) ? fsReaddirSync(ADMIN_UI_DIR).filter((f) => /^app\.\d+\.html$/.test(f)).sort() : [];
  const prev = archives[archives.length - 1];
  if (!prev) return c.json({ error: "nothing_to_roll_back_to", hint: "no archived versions — the bundled repo copy is what serves without an override" }, 404);
  renameSync(join(ADMIN_UI_DIR, prev), ADMIN_UI_LIVE);
  writeFileSync(ADMIN_UI_META, JSON.stringify({ commit: null, at: Math.floor(Date.now() / 1000), bytes: readFileSync(ADMIN_UI_LIVE, "utf8").length, rolledBackFrom: prev }));
  return c.json({ ok: true, restored: prev });
});
// What's live: override (with provenance) or the bundled repo copy.
app.get("/api/admin/ui-version", async (c) => {
  const override = existsSync(ADMIN_UI_LIVE);
  let meta: Record<string, unknown> | null = null;
  try { meta = JSON.parse(readFileSync(ADMIN_UI_META, "utf8")); } catch { /* no meta */ }
  const archives = existsSync(ADMIN_UI_DIR) ? fsReaddirSync(ADMIN_UI_DIR).filter((f) => /^app\.\d+\.html$/.test(f)).sort() : [];
  return c.json({ source: override ? "override" : "bundled", meta: override ? meta : null, archived: archives.length });
});

// Per-customer detail view (docs/specs/admin-user-view.md): everything one account is set up
// with, in one call — identity/plan/entitlements/credits, their zones + schedules, last 20 checks.
app.get("/api/admin/users/:id", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const a = (await db.select().from(accounts).where(eq(accounts.clerkUserId, id)))[0];
  if (!a) return c.json({ error: "not_found" }, 404);
  const comp = isComp(a.email) || isCompAccount(a);
  const staff = comp || (await staffAccountIds()).has(a.clerkUserId);
  const features = await accountFeatures(a.subTier, comp);
  const tier = a.subTier ? (await getPlans()).tiers.find((t) => t.key === a.subTier) ?? null : null;

  const zs = await db.select().from(zones).where(eq(zones.ownerUserId, id));
  const zoneLinks = zs.length ? await db.select().from(zoneRetailers).where(inArray(zoneRetailers.zoneId, zs.map((z) => z.id))) : [];
  const lastRunByZone = new Map<number, number>();
  if (zs.length) {
    for (const z of zs) {
      const last = (await db.select().from(callResults).where(like(callResults.zoneRunId, `z${z.id}-%`)).orderBy(desc(callResults.startedAt)).limit(1))[0];
      if (last?.startedAt) lastRunByZone.set(z.id, last.startedAt);
    }
  }
  const scheds = (await db.select().from(customerSchedules).where(eq(customerSchedules.finderUserId, id))).filter((s) => s.active);
  const recent = await db.select().from(callResults).where(eq(callResults.finderUserId, id)).orderBy(desc(callResults.startedAt)).limit(20);
  const stores = await retailerMap();
  const cats = new Map((await db.select().from(categories)).map((x) => [x.id, x.label]));
  const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return c.json({
    id: a.clerkUserId,
    phone: a.phone || (a.clerkUserId.startsWith("phone:") ? a.clerkUserId.slice(6) : null),
    email: a.email || null,
    createdAt: a.createdAt, comp, staff,
    subscription: {
      status: comp ? "active" : (a.subscription ?? "none"),
      tier: comp ? "founder" : (a.subTier ?? null),
      tierName: comp ? "Founder" : (tier?.name ?? null),
      priceCents: tier?.monthlyCents ?? null,
      renewsAt: a.subRenewsAt || null,
    },
    entitlements: features,
    credits: {
      quota: comp ? 9999 : (a.quotaCredits ?? 0),
      payg: comp ? 9999 : (a.credits ?? 0),
      total: comp ? 9999 : spendableCredits(a),
      checksMade: a.callsMade ?? 0,
      lifetimeSpendCents: a.totalSpentCents ?? 0,
    },
    zones: zs.map((z) => ({ id: z.id, name: z.name, stores: zoneLinks.filter((l) => l.zoneId === z.id).length, lastRun: lastRunByZone.get(z.id) ?? null })),
    schedules: scheds.map((s) => ({
      id: s.id,
      target: (stores.get(s.retailerId)?.name || "A store").split("—")[0].trim(),
      category: cats.get(s.categoryId) || "cards",
      days: (s.daysOfWeek || "").split(",").filter(Boolean).map((d) => DOWS[Number(d)] ?? d).join(", ") || "shipment day",
      time: s.timeLocal || "10:00",
    })),
    recentChecks: recent.map((r) => ({
      cid: r.providerCallId, store: stores.get(r.retailerId)?.name || "A store",
      category: cats.get(r.categoryId) || "cards", status: r.status, statusKey: r.statusKey, at: r.startedAt,
    })),
  });
});
// Grant free checks to an account (support/ops action from the detail panel).
app.post("/api/admin/users/:id/grant", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const { checks } = await c.req.json().catch(() => ({}));
  const n = Math.round(Number(checks));
  if (!n || n < 1 || n > 1000) return c.json({ error: "checks must be 1-1000" }, 400);
  const a = (await db.select().from(accounts).where(eq(accounts.clerkUserId, id)))[0];
  if (!a) return c.json({ error: "not_found" }, 404);
  await grantCredits(id, n, 0);
  const after = (await db.select().from(accounts).where(eq(accounts.clerkUserId, id)))[0];
  return c.json({ ok: true, granted: n, credits: after?.credits ?? null });
});
// Flag / unflag an account as admin/test (won't count as a customer).
app.post("/api/admin/users/staff", async (c) => {
  const { id, on } = await c.req.json().catch(() => ({}));
  if (!id) return c.json({ error: "id required" }, 400);
  const set = await staffAccountIds();
  if (on) set.add(String(id)); else set.delete(String(id));
  await setSetting("staff_accounts", JSON.stringify([...set]));
  return c.json({ ok: true });
});
// Delete/reset an account: wipe an account and everything it owns so a phone can re-sign-up as a
// brand-new user (free check regranted on next login). Cancels any live Stripe subscription first so
// a reset customer isn't still billed. `?dry=1` reports what WOULD be removed without deleting.
// The account row itself is the "reset" — getAccountByPhone recreates it fresh on next login.
app.post("/api/admin/users/:id/delete", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const dry = c.req.query("dry") === "1";
  const acc = (await db.select().from(accounts).where(eq(accounts.clerkUserId, id)))[0];
  if (!acc) return c.json({ error: "no such account", id }, 404);
  const contacts = [acc.phone, acc.email].filter(Boolean) as string[];
  // Count everything owned (by userId, plus watches/leads by contact) so the response is auditable.
  const ownedZones = await db.select({ id: zones.id }).from(zones).where(eq(zones.ownerUserId, id));
  const zoneIds = ownedZones.map((z) => z.id);
  const counts = {
    account: 1,
    callResults: (await db.select({ id: callResults.id }).from(callResults).where(eq(callResults.finderUserId, id))).length,
    customerSchedules: (await db.select({ id: customerSchedules.id }).from(customerSchedules).where(eq(customerSchedules.finderUserId, id))).length,
    alertSubscriptions: (await db.select({ id: alertSubscriptions.id }).from(alertSubscriptions).where(eq(alertSubscriptions.userId, id))).length,
    storeRequests: (await db.select({ id: storeRequests.id }).from(storeRequests).where(eq(storeRequests.userId, id))).length,
    communityPosts: (await db.select({ id: communityPosts.id }).from(communityPosts).where(eq(communityPosts.finderUserId, id))).length,
    zones: zoneIds.length,
    watches: contacts.length ? (await db.select({ id: watches.id }).from(watches).where(inArray(watches.contact, contacts))).length : 0,
  };
  // Cancel any live Stripe subscription so the reset customer stops being billed.
  let stripeCanceled: string[] = [];
  if (acc.stripeCustomerId && (process.env.STRIPE_SECRET_KEY || "")) {
    try {
      const sk = process.env.STRIPE_SECRET_KEY!;
      const list = await fetch(`https://api.stripe.com/v1/subscriptions?customer=${acc.stripeCustomerId}&status=active&limit=100`, { headers: { Authorization: `Bearer ${sk}` } });
      const subs = (await list.json()) as { data?: { id: string }[] };
      for (const s of subs.data || []) {
        if (!dry) await fetch(`https://api.stripe.com/v1/subscriptions/${s.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${sk}` } });
        stripeCanceled.push(s.id);
      }
    } catch (e) { return c.json({ error: `stripe cancel failed — aborted before any local delete: ${String(e).slice(0, 160)}` }, 502); }
  }
  if (dry) return c.json({ dry: true, id, phone: acc.phone, wouldRemove: counts, stripeSubsToCancel: stripeCanceled });
  // Delete owned rows first (children before the account), then the account itself.
  if (zoneIds.length) await db.delete(zoneRetailers).where(inArray(zoneRetailers.zoneId, zoneIds));
  await db.delete(zones).where(eq(zones.ownerUserId, id));
  await db.delete(callResults).where(eq(callResults.finderUserId, id));
  await db.delete(customerSchedules).where(eq(customerSchedules.finderUserId, id));
  await db.delete(alertSubscriptions).where(eq(alertSubscriptions.userId, id));
  await db.delete(storeRequests).where(eq(storeRequests.userId, id));
  await db.delete(communityPosts).where(eq(communityPosts.finderUserId, id));
  if (contacts.length) await db.delete(watches).where(inArray(watches.contact, contacts));
  await db.delete(accounts).where(eq(accounts.clerkUserId, id));
  console.log(`[admin] account deleted ${id} — removed ${JSON.stringify(counts)} stripeCanceled=${stripeCanceled.join(",") || "none"}`);
  return c.json({ ok: true, deleted: id, phone: acc.phone, removed: counts, stripeCanceled });
});
app.get("/api/admin/pulse", async (c) => {
  const now = Math.floor(Date.now() / 1000), d1 = now - 86400, d7 = now - 7 * 86400;
  const [accts, leadRows, watchRows, kReports, posts, calls] = await Promise.all([
    db.select().from(accounts), db.select().from(leads), db.select().from(watches),
    db.select().from(kioskReports), db.select().from(communityPosts), db.select().from(callResults),
  ]);
  const since = (ts: number, at: (r: { createdAt?: number | null; startedAt?: number | null }) => number | null | undefined, rows: Array<Record<string, unknown>>) =>
    rows.filter((r) => (at(r as never) ?? 0) >= ts).length;
  const ownerOnly = await ownerOnlyRetailerIds();
  // Real calls only: drop the Fun/MVPs demo stores, the owner's own admin test calls (attributed to the
  // master account), and admin-canceled calls — so the Pulse reflects genuine consumer activity.
  const masterUid = "phone:" + (process.env.OWNER_PHONE || "+13106662331").trim();
  const flagged = await staffAccountIds();
  const statsSince = await getStatsSince();
  const real = calls.filter((r) => !ownerOnly.has(r.retailerId) && r.finderUserId !== masterUid && !(r.finderUserId && flagged.has(r.finderUserId)) && r.status !== "admin_hangup" && (r.startedAt || 0) >= statsSince);
  const completed = real.filter((r) => r.status === "completed");
  // Real human-talk = connected seconds MINUS the learned time-to-human (chain recipe), counted ONLY for
  // calls that actually reached a person. Never-reached IVR calls have zero human-talk. (The old code
  // subtracted ~2s — the IVR's first words — over every call, so "talk" was really the whole call.)
  const tthMap = await retailerTimeToHuman();
  const timed = real.filter((r) => r.callSeconds != null);
  const reachedT = timed.filter((r) => classifyCallReality(r.transcript) !== "never_reached");
  const talkOf = (r: (typeof reachedT)[number]) => Math.max(0, (r.callSeconds || 0) - (tthMap.get(r.retailerId) ?? r.navSeconds ?? 0));
  const avgTalkSec = reachedT.length ? Math.round(reachedT.reduce((s, r) => s + talkOf(r), 0) / reachedT.length) : 0;
  const avgCallSec = timed.length ? Math.round(timed.reduce((s, r) => s + (r.callSeconds || 0), 0) / timed.length) : 0;
  return c.json({
    funnel: {
      leads: leadRows.length,
      signups: accts.filter((a) => !isStaffAcct(a, flagged)).length, // real signups — not owner/comp or flagged admin/test
      paying: accts.filter((a) => a.totalSpentCents > 0).length,
      members: accts.filter((a) => a.subscription === "active").length,
      revenueCents: accts.reduce((s, a) => s + (a.totalSpentCents || 0), 0),
    },
    activity: {
      checks: completed.length,
      checks24h: since(d1, (r) => r.startedAt, completed),
      checks7d: since(d7, (r) => r.startedAt, completed),
      confirms: completed.filter((r) => r.confirmed === true).length,
      callsBilled: accts.reduce((s, a) => s + (a.callsMade || 0), 0),
      avgTalkSec, avgCallSec, callsTimed: timed.length, callsReached: reachedT.length,
    },
    community: {
      watches: watchRows.filter((w) => w.active !== false).length,
      kioskReports: kReports.length,
      posts: posts.length, postsPending: posts.filter((p) => !p.approved).length,
      newLeads7d: since(d7, (r) => r.createdAt, leadRows),
    },
    statsSince,
  });
});

// ---- God view: one read of everything moving right now (live calls, outcomes, cost signals) ----
app.get("/api/admin/overview", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const d1 = now - 86400, d7 = now - 7 * 86400, d30 = now - 30 * 86400;
  const stores = await retailerMap();
  const cats = await categoryLabelMap();
  const ownerOnly = await ownerOnlyRetailerIds();
  // Production-only: the god view is the launch dashboard, so it counts REAL customer demand — exclude
  // owner-only stores (Fun/MVP), the master/owner account's own test checks, and flagged staff/test
  // accounts. (Same "real" definition the Metrics view uses.)
  const masterUid = "phone:" + (process.env.OWNER_PHONE || "+13106662331").trim();
  const flagged = await staffAccountIds();
  const recent = (await db.select().from(callResults).where(gte(callResults.startedAt, d30)).orderBy(desc(callResults.startedAt)))
    .filter((r) => !ownerOnly.has(r.retailerId) && r.status !== "admin_hangup" && r.finderUserId !== masterUid && !(r.finderUserId && flagged.has(r.finderUserId)));
  // Live: anything started in the last 30 min that hasn't finished.
  const live = recent.filter((r) => ["queued", "dialing", "in_progress"].includes(r.status) && r.startedAt >= now - 1800)
    .map((r) => ({ id: r.id, store: stores.get(r.retailerId)?.name || "?", category: cats.get(r.categoryId) || "", secs: now - r.startedAt, cid: r.providerCallId }));
  const finished = recent.filter((r) => r.completedAt != null);
  const durs = finished.map((r) => (r.completedAt as number) - r.startedAt).filter((s) => s > 0 && s < 1200);
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
  const tally = (rows: typeof recent) => {
    const t: Record<string, number> = {};
    for (const r of rows) t[r.status] = (t[r.status] || 0) + 1;
    return t;
  };
  const slice = (since: number) => {
    const rows = recent.filter((r) => r.startedAt >= since);
    const done = rows.filter((r) => r.completedAt != null);
    return {
      calls: rows.length,
      confirms: rows.filter((r) => r.confirmed === true).length,
      byStatus: tally(rows),
      avgCallSeconds: avg(done.map((r) => (r.completedAt as number) - r.startedAt).filter((s) => s > 0 && s < 1200)),
      minutes: Math.round(done.reduce((s, r) => s + Math.max(0, Math.min(1200, (r.completedAt as number) - r.startedAt)), 0) / 60),
    };
  };
  // Per-chain rollup (30d) — feeds the answer-path classification screen.
  const chainRows = await db.select().from(chains);
  const chainOf = new Map<number, number>(); // retailerId -> chainId
  for (const [id, s] of stores) if (s.chainId != null) chainOf.set(id, s.chainId);
  const byChain = new Map<number, { calls: number; confirms: number; durs: number[] }>();
  for (const r of recent) {
    const cid = chainOf.get(r.retailerId); if (!cid) continue;
    const e = byChain.get(cid) || { calls: 0, confirms: 0, durs: [] };
    e.calls++; if (r.confirmed === true) e.confirms++;
    if (r.completedAt) { const s = r.completedAt - r.startedAt; if (s > 0 && s < 1200) e.durs.push(s); }
    byChain.set(cid, e);
  }
  const chainStats = chainRows.map((ch) => {
    const e = byChain.get(ch.id);
    return { id: ch.id, name: ch.name, type: ch.type, answerPath: ch.answerPath, avgTreeSeconds: ch.avgTreeSeconds,
      repackOnly: ch.repackOnly === true, muted: ch.muted === true, hasTree: !!ch.phoneTreeDefault, dtmf: ch.dtmfShortcut || null,
      calls30d: e?.calls ?? 0, confirms30d: e?.confirms ?? 0, avgCallSeconds: e ? avg(e.durs) : 0 };
  }).sort((a, b) => b.calls30d - a.calls30d);
  const recentCalls = recent.slice(0, 12).map((r) => ({
    id: r.id, store: (stores.get(r.retailerId)?.name || "?").split("—")[0].trim(), category: cats.get(r.categoryId) || "",
    status: r.status, confirmed: r.confirmed, at: r.startedAt, secs: r.completedAt ? r.completedAt - r.startedAt : null, cid: r.providerCallId,
  }));
  // Seven trailing 24h buckets (oldest first) — feeds the dashboard's trend chip + sparkline.
  // days[6] matches today (last 24h); days[5] is "yesterday" for the vs-yesterday delta.
  const days = Array.from({ length: 7 }, (_, i) => {
    const from = now - (7 - i) * 86400, to = now - (6 - i) * 86400;
    return recent.filter((r) => r.startedAt >= from && r.startedAt < to).length;
  });
  return c.json({ live, today: slice(d1), week: slice(d7), month: slice(d30), days, avgCallSeconds30d: avg(durs), chainStats, recentCalls });
});

// ---- Settings (master toggles) ----
app.get("/api/settings", async (c) => c.json(await allSettings()));
app.patch("/api/settings", async (c) => {
  const b = await c.req.json();
  if (typeof b.voicemailHangup === "boolean") await setSetting("voicemail_hangup", String(b.voicemailHangup));
  if (b.creditLimit !== undefined) await setSetting("el_credit_limit", String(Math.max(0, Number(b.creditLimit) || 0)));
  if (b.openerVariants !== undefined) await setSetting("vt_opener_variants", String(b.openerVariants || ""));
  if (b.openerLibrary !== undefined) await setSetting("vt_opener_library", String(b.openerLibrary || ""));
  if (b.voicePool !== undefined) await setSetting("vt_voice_pool", String(b.voicePool || ""));
  // Voice → Designer library + cascade assignment. The "Save workflow"/"Save persona" steps write
  // these; the call bridge resolves a store's workflow as store → chain → default and applies it.
  if (b.personas !== undefined) await setSetting("vt_personas", String(b.personas || ""));
  if (b.workflows !== undefined) await setSetting("vt_workflows", String(b.workflows || ""));
  if (b.defaultWorkflow !== undefined) await setSetting("vt_default_workflow", String(b.defaultWorkflow || ""));
  if (b.chainWorkflows !== undefined) await setSetting("vt_chain_workflows", String(b.chainWorkflows || ""));
  if (b.storeWorkflows !== undefined) await setSetting("vt_store_workflows", String(b.storeWorkflows || ""));
  return c.json(await allSettings());
});

// ---- ElevenLabs credit status (live if the key has user_read, else estimated) ----
app.get("/api/credits", async (c) => c.json(await getCreditStatus()));

// ---- Go-to-Market launch checklist (owner + agents track go-live readiness) ----
// Persisted as one JSON blob in settings ("gtm_checklist"), seeded on first read. The admin renders it
// with area (backend/frontend/ops) + agent filters; each item is a status the owner ticks off. The
// frontend owns the edits and POSTs the full list back — race-safe enough for a single operator.
const GTM_SEED: { id: string; title: string; detail: string; area: "backend" | "frontend" | "ops"; agent: string; critical: boolean; status: "todo" | "doing" | "done" }[] = [
  { id: "support-agent", title: "Customer-service agent on the site", detail: "A support bot users can talk to on the front end; reads the ReadMe to answer.", area: "backend", agent: "support", critical: true, status: "todo" },
  { id: "readme-copy", title: "Copy agent owns + fully updates the ReadMe", detail: "Spin up a copy agent with access to the ReadMe repo (+ Fungibles); fully write/polish the Check ReadMe. Solve the cross-repo access.", area: "ops", agent: "copy", critical: true, status: "todo" },
  { id: "discord-support", title: "Discord support agent + FAQ routing (Helicone)", detail: "Working Discord; same support agent. Cheap-model FAQ from the ReadMe → escalate to a smart model → ticket to a support email if unresolved.", area: "backend", agent: "discord", critical: true, status: "todo" },
  { id: "alerts-forms", title: "Every alert form works end-to-end", detail: "Email/SMS restock alerts actually send; branded email; Twilio A2P 10DLC live for texts; user can view/edit their email + cell in My Checks.", area: "backend", agent: "devops", critical: true, status: "todo" },
  { id: "zones-test", title: "Zones tested at scale", detail: "Call many stores at once and watch the combined multi-store report render correctly.", area: "backend", agent: "devops", critical: true, status: "todo" },
  { id: "store-request-form", title: "Store-request form lands in the backend", detail: "A store submitted from the site shows up in the admin queue.", area: "backend", agent: "devops", critical: true, status: "todo" },
  { id: "referrals", title: "Refer-a-friend works + is tracked", detail: "Track who referred whom; both parties actually receive their free checks, everywhere a free check is promised.", area: "backend", agent: "devops", critical: true, status: "todo" },
  { id: "voice-rotation", title: "Workflows / persona / script + voice rotation", detail: "Rotate scripts and voices, confirm they work well, and lock the voice you like.", area: "ops", agent: "website", critical: false, status: "todo" },
  { id: "thrift-hobby-workflows", title: "Thrift + hobby call workflows built", detail: "Done and ready (gated off until launch, even for paid).", area: "ops", agent: "website", critical: false, status: "todo" },
  { id: "multibrand-scripts", title: "One Piece / NeeDoh / Topps NBA call scripts", detail: "Set up retailer call scripts for these product types just like Pokémon — the agent calls and asks for One Piece TCG, NeeDoh, and Topps NBA at the right stores.", area: "ops", agent: "website", critical: false, status: "todo" },
  { id: "paid-plans-e2e", title: "Paid plans — full real-card end-to-end test", detail: "Sign up with a real credit card and confirm the whole flow: checkout → Stripe → entitlement → credits.", area: "backend", agent: "devops", critical: true, status: "todo" },
  { id: "site-paths-tested", title: "Every website path tested pre-launch", detail: "Walk every page/flow and confirm it behaves exactly as built.", area: "frontend", agent: "website", critical: true, status: "todo" },
  { id: "copy-color-sweep", title: "Copy sweep + product-page colors", detail: "Copy reads well everywhere; product-page colors render right per brand (Pokémon vs NeeDoh, etc.).", area: "frontend", agent: "copy", critical: true, status: "todo" },
  { id: "multi-brand-workflows", title: "Non-Pokémon call workflows", detail: "Workflows set up so the agent can call and ask for Topps NBA, One Piece, etc. — not just Pokémon.", area: "ops", agent: "data", critical: true, status: "todo" },
  { id: "discord-plan", title: "Discord community set up + planned", detail: "Free area vs. flagged paid-customer community; channel plan (share scores, talk stores). Stand up a planning agent.", area: "ops", agent: "discord", critical: false, status: "todo" },
  { id: "spanish", title: "Spanish + live translation button", detail: "Confirm Spanish works and the translate button engages when a store speaks Spanish.", area: "frontend", agent: "website", critical: true, status: "todo" },
  { id: "statuses-new", title: "New call statuses surface in Admin", detail: "When a never-seen status comes back, it shows up in the Admin statuses area so we can build it into behavior.", area: "backend", agent: "admin", critical: false, status: "todo" },
  { id: "hobby-thrift-data", title: "Populate hobby + thrift stores nationwide", detail: "Data: hobby stores with open/close times; a nationwide thrift + hobby search (like the main-chain sweep) to populate many more.", area: "backend", agent: "data", critical: false, status: "todo" },
  { id: "x-autopost", title: "X account + daily auto-posting agent", detail: "Create the X account; an agent posts cool info daily. Keep the business hands-free.", area: "ops", agent: "social", critical: false, status: "todo" },
  { id: "store-data-one-source", title: "Store data: one dataset everywhere", detail: "Staging is the curation home; curated store data auto-syncs to prod (field-scoped, diffs-only). LIVE: STORE_SYNC set, full catch-up done, a chain edit proven flowing staging to prod.", area: "backend", agent: "devops", critical: true, status: "done" },
  { id: "admin-redesign-reports", title: "Admin redesign — reports tell a story", detail: "Audit every report/card for performance, necessity, and placement: there are so many it feels like false positives. Cut or merge the noise, regroup what's left into one beginning-to-end story of the business (pulse -> calls -> money -> growth). Owner runs 5 Design comps off docs/design/STYLE_GUIDE.md; Design delivers comps, Admin implements.", area: "frontend", agent: "design", critical: false, status: "todo" },
  { id: "repo-split", title: "Extract Check into its own repo", detail: "Done 2026-07 — you are in it (nocodehandsfree/checkitforme, branches staging/main). Full history kept.", area: "ops", agent: "devops", critical: false, status: "done" },
  { id: "db-backups", title: "Database backups + tested restore", detail: "Nightly encrypted DB backup to R2 (AES-256-GCM) on both envs; restore SCRIPT proven end to end (integrity check + row counts). scripts/restore-backup.mjs.", area: "backend", agent: "devops", critical: true, status: "done" },
  { id: "error-monitoring", title: "Error monitoring + alerting on prod", detail: "Cross-env watchdog (staging and prod ping each other, 3 misses = owner email+SMS) + crash guards that alert. LIVE both envs.", area: "backend", agent: "devops", critical: true, status: "done" },
  { id: "posthog-live", title: "PostHog wired + verified capturing", detail: "Server-side snippet on every page; keys set both envs; capture VERIFIED live on all consumer domains + admin.", area: "backend", agent: "devops", critical: true, status: "done" },
  { id: "helicone-live", title: "Helicone set up + verified", detail: "Every model call routed through the Helicone gateway with per-job tags; VERIFIED logging in the dashboard.", area: "backend", agent: "devops", critical: false, status: "done" },
  { id: "legal-consent", title: "Legal pages + call-recording consent", detail: "Real ToS + Privacy (the /p/privacy page currently 404s an asset), plus a reviewed consent/disclosure story for AI calls + recordings (TCPA / two-party states). Gates public marketing.", area: "ops", agent: "owner", critical: true, status: "todo" },
  { id: "admin-redesign", title: "Admin matches the website design", detail: "Restyle app.html to the approved website comp/tokens (one design system) — after Design finishes the comp↔site gap analysis.", area: "frontend", agent: "design", critical: false, status: "todo" },
  { id: "deck-video", title: "Finalize the check deck + share video", detail: "Not critical for launch.", area: "ops", agent: "owner", critical: false, status: "todo" },
  { id: "analytics", title: "Analytics ready on production", detail: "The non-GA analytics tool (API key already set) is live on prod tracking every page, so we can see paths + optimize after launch.", area: "backend", agent: "devops", critical: true, status: "todo" },
  // DevOps-surfaced items (my lane) —
  { id: "cheap-lane-wiring", title: "Move leftover call paths onto the cheap bridge lane", detail: "Scheduled checks, zone fires, admin call-now, and the /pub/check fallback still ride the pricey direct-agent path. Wiring, not a build — straight cost cut. (COST_MODEL Part II §2)", area: "backend", agent: "devops", critical: false, status: "todo" },
  { id: "price-editor", title: "Admin price-editor → Stripe", detail: "Change any monthly price / PAYG rate in admin and push straight to Stripe, no code change.", area: "backend", agent: "devops", critical: false, status: "todo" },
  { id: "money-endpoint-guard", title: "Money-endpoint rate limits + security headers", detail: "Per-IP limits on the four call-placing endpoints + baseline security headers. Shipped.", area: "backend", agent: "devops", critical: true, status: "done" },
];
// ---- Store-data sync (one dataset): staging pushes curated store data here; see src/store-sync.ts ----
app.post("/api/store-sync", async (c) => {
  if (config.staging.on) return c.json({ error: "staging_is_the_source" }, 400); // only prod receives
  const p = await c.req.json().catch(() => null);
  if (!p) return c.json({ error: "bad_payload" }, 400);
  try { return c.json({ ok: true, ...(await applyStoreSync(p)) }); }
  catch (e) { return c.json({ error: String((e as { code?: string }).code || e).slice(0, 80) }, (e as { code?: string }).code === "batch_too_large" ? 413 : 500); }
});
app.get("/api/store-sync/status", async (c) => c.json(await syncStatus()));

// Settings sync (src/settings-sync.ts): PROD serves this read-only export; STAGING pulls it every
// minute and mirrors the owner's Admin edits (policy/plans/banners/statuses — field-scoped).
// One-way by construction: this endpoint is the only prod side, and it writes nothing.
app.get("/api/settings-sync/export", async (c) => c.json(await buildSettingsExport()));
app.get("/api/settings-sync/status", async (c) => c.json(await settingsSyncStatus()));

// Call concurrency governor readout (Admin + the Phase-2 load test): live pool utilization,
// per-account used/cap, the interactive reserve, and the per-user cap. Enabled reflects the flag.
app.get("/api/concurrency", async (c) => c.json(await concurrencyStatus()));

app.get("/api/gtm", async (c) => {
  let items = GTM_SEED;
  try { const raw = await getSetting("gtm_checklist"); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p?.items)) items = p.items; } }
  catch { /* fall back to seed */ }
  // FINISHED WORK IS NEVER LOST: a completed default (seed status "done") that's missing from the saved
  // list is auto-restored here — as done — and persisted. So a done item always shows on the board as
  // Done and can NEVER sit in the dismissible "missing" bar (where an X could bury it). This is the fix
  // for "completed tasks weren't showing as done, and clicking X felt like it lost finished work."
  const have0 = new Set(items.map((i: { id?: string }) => i.id));
  const healed = GTM_SEED.filter((s) => s.status === "done" && !have0.has(s.id));
  if (healed.length) { items = [...items, ...healed]; await setSetting("gtm_checklist", JSON.stringify({ items, updatedAt: Date.now() })); }
  // Report only NOT-done seeded defaults still missing (genuine deletes the owner may restore/dismiss).
  // Items the owner DISMISSED stay gone. Done items are handled above, never offered here.
  const dismissed = new Set<string>(JSON.parse((await getSetting("gtm_dismissed_defaults")) || "[]"));
  const have = new Set(items.map((i: { id?: string }) => i.id));
  const missingDefaults = GTM_SEED.filter((s) => s.status !== "done" && !have.has(s.id) && !dismissed.has(s.id)).map((s) => ({ id: s.id, title: s.title }));
  return c.json({ items, missingDefaults });
});
// X on the restore bar: mark the currently-missing defaults as intentionally gone — the bar never
// offers them again. An explicit restore-defaults still resurrects them (it ignores dismissals).
app.post("/api/gtm/dismiss-defaults", async (c) => {
  let items: typeof GTM_SEED = GTM_SEED;
  try { const raw = await getSetting("gtm_checklist"); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p?.items)) items = p.items; } }
  catch { /* seed */ }
  const have = new Set(items.map((i) => i.id));
  const prev = new Set<string>(JSON.parse((await getSetting("gtm_dismissed_defaults")) || "[]"));
  // NEVER dismiss a COMPLETED default — finished work can't be thrown away by the X. Only not-done
  // missing defaults are dismissable (done ones are auto-restored by GET /api/gtm anyway).
  for (const s of GTM_SEED) if (s.status !== "done" && !have.has(s.id)) prev.add(s.id);
  await setSetting("gtm_dismissed_defaults", JSON.stringify([...prev]));
  return c.json({ ok: true, dismissed: prev.size });
});
// One-tap restore: re-append any seeded defaults missing from the saved list, KEEPING the seed's real
// status (a completed default comes back as done, not reset to todo — otherwise Restore would erase
// that it was finished).
app.post("/api/gtm/restore-defaults", async (c) => {
  let items: typeof GTM_SEED = GTM_SEED;
  try { const raw = await getSetting("gtm_checklist"); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p?.items)) items = p.items; } }
  catch { /* seed */ }
  const have = new Set(items.map((i) => i.id));
  const restored = GTM_SEED.filter((s) => !have.has(s.id));
  const next = [...items, ...restored];
  await setSetting("gtm_checklist", JSON.stringify({ items: next, updatedAt: Date.now() }));
  return c.json({ ok: true, restored: restored.length, items: next });
});
app.post("/api/gtm", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!Array.isArray(b.items)) return c.json({ error: "items[] required" }, 400);
  // Keep the shape tight so a bad client can't bloat the blob.
  const clean = b.items.slice(0, 300).map((it: Record<string, unknown>) => ({
    id: String(it.id || crypto.randomUUID()).slice(0, 60),
    title: String(it.title || "").slice(0, 200),
    detail: String(it.detail || "").slice(0, 600),
    area: (["backend", "frontend", "ops"] as const).includes(it.area as never) ? it.area : "ops",
    agent: String(it.agent || "owner").slice(0, 24),
    critical: !!it.critical,
    status: (["todo", "doing", "done"] as const).includes(it.status as never) ? it.status : "todo",
  })).filter((it: { title: string }) => it.title);
  await setSetting("gtm_checklist", JSON.stringify({ items: clean, updatedAt: Date.now() }));
  return c.json({ ok: true, items: clean });
});

// ---- Global calling kill-switch (cost runaway protection) ----
app.get("/api/admin/calling/status", async (c) => c.json({ paused: await isCallingPaused(), spendTodayCents: await spendTodayCents() }));
app.post("/api/admin/calling/pause", async (c) => {
  const { paused } = await c.req.json().catch(() => ({}));
  await setCallingPaused(paused !== false); // default to pausing
  return c.json({ paused: await isCallingPaused() });
});
app.post("/api/admin/calling/resume", async (c) => { await setCallingPaused(false); return c.json({ paused: false }); });

// ---- Reference data ----
app.get("/api/categories", async (c) => c.json(await db.select().from(categories)));
app.get("/api/chains", async (c) => {
  const rows = await db.select().from(chains);
  // Representative tier per chain = the most common retailers.tier among its active, graded stores
  // (the rating is stored PER STORE; there is no chains.tier column — see docs/data/scoring.md).
  const tr = await db.select({ cid: retailers.chainId, tier: retailers.tier, n: sql<number>`count(*)` })
    .from(retailers).where(and(eq(retailers.active, true), sql`${retailers.tier} is not null`)).groupBy(retailers.chainId, retailers.tier);
  const tierByChain = new Map<number, number>(), bestN = new Map<number, number>();
  for (const r of tr) { const n = Number(r.n || 0); if (r.cid != null && r.tier != null && n > (bestN.get(r.cid) || 0)) { bestN.set(r.cid, n); tierByChain.set(r.cid, r.tier); } }
  // Per-store fields (callable/kiosk/online/stock) vary by location — surface counts so the panel can
  // show the majority state + bulk-set them across the chain.
  const ag = await db.select({ cid: retailers.chainId, n: sql<number>`count(*)`,
    callable: sql<number>`sum(case when ${retailers.sellsPacks} then 1 else 0 end)`,
    kiosk: sql<number>`sum(case when ${retailers.hasKiosk} then 1 else 0 end)`,
    onl: sql<number>`sum(case when ${retailers.online} then 1 else 0 end)`,
    verified: sql<number>`sum(case when ${retailers.stockStatus}='verified' then 1 else 0 end)` })
    .from(retailers).where(eq(retailers.active, true)).groupBy(retailers.chainId);
  const aggByChain = new Map(ag.map((r) => [r.cid, { n: Number(r.n || 0), callable: Number(r.callable || 0), kiosk: Number(r.kiosk || 0), online: Number(r.onl || 0), verified: Number(r.verified || 0) }]));
  return c.json(rows.map((ch) => {
    const l = chainLogoInfo(ch.name);
    return { ...ch, logoUrl: l.url, logoWide: l.wide, logoDark: l.dark, tier: tierByChain.get(ch.id) ?? null, stores: aggByChain.get(ch.id) ?? { n: 0, callable: 0, kiosk: 0, online: 0, verified: 0 } };
  }));
});
// Compact store list for the Voice → Test picker: ONE callable store per supported (app-visible) chain
// — ~80 rows, not the 105k national import. Mirrors the consumer visibility rule (non-muted chain with
// an active, real-phone store) so the test calls a store that's actually in the product.
app.get("/api/test-stores", async (c) => {
  const chainRows = await db.select().from(chains);
  const muted = new Set(chainRows.filter((x) => x.muted === true).map((x) => x.id));
  const name = new Map(chainRows.map((x) => [x.id, x.name]));
  const rows = await db.select({ id: retailers.id, name: retailers.name, location: retailers.location, chainId: retailers.chainId, phone: retailers.phone })
    .from(retailers).where(eq(retailers.active, true));
  const seen = new Set<number>();
  const out: Array<{ id: number; name: string; location: string | null; chainName: string | null }> = [];
  for (const r of rows) {
    if (!r.chainId || muted.has(r.chainId) || seen.has(r.chainId)) continue;
    if (!r.phone || r.phone.startsWith("nophone:") || !/\d{7}/.test(r.phone)) continue;
    seen.add(r.chainId);
    out.push({ id: r.id, name: r.name, location: r.location, chainName: name.get(r.chainId) ?? null });
  }
  out.sort((a, b) => (a.chainName || a.name).localeCompare(b.chainName || b.name));
  return c.json(out);
});
// Edit a chain's default phone tree (the CHAIN tier of the rule system). Admin-gated via middleware.
app.patch("/api/chains/:id", async (c) => {
  const b = await c.req.json();
  const patch: Record<string, unknown> = {};
  if (b.phoneTreeDefault !== undefined) patch.phoneTreeDefault = b.phoneTreeDefault || null;
  if (b.dtmfShortcut !== undefined) patch.dtmfShortcut = b.dtmfShortcut || null;
  if (b.name !== undefined) patch.name = b.name;
  if (b.type !== undefined) patch.type = b.type;
  // Answer-path classification + consumer mute (god-view + per-chain cost control).
  if (b.answerPath !== undefined) patch.answerPath = b.answerPath || null;
  if (typeof b.callTarget === "boolean") patch.callTarget = b.callTarget;
  if (typeof b.ringsDirect === "boolean") patch.ringsDirect = b.ringsDirect;
  if (b.stockCheckMethod !== undefined) patch.stockCheckMethod = b.stockCheckMethod || null;
  if (b.avgTreeSeconds !== undefined) patch.avgTreeSeconds = Number.isFinite(Number(b.avgTreeSeconds)) && Number(b.avgTreeSeconds) > 0 ? Number(b.avgTreeSeconds) : null;
  if (typeof b.repackOnly === "boolean") patch.repackOnly = b.repackOnly;
  if (typeof b.muted === "boolean") patch.muted = b.muted;
  if (b.unmappableReason !== undefined) patch.unmappableReason = b.unmappableReason || null; // stored mute reason (online-only / no store line / …)
  // Per-store call settings (Settings page): talk-time cap + voicemail/closed auto-hangup.
  if (b.maxTalkSeconds !== undefined) patch.maxTalkSeconds = Number.isFinite(Number(b.maxTalkSeconds)) && Number(b.maxTalkSeconds) > 0 ? Number(b.maxTalkSeconds) : null;
  if (typeof b.hangupOnVoicemail === "boolean") patch.hangupOnVoicemail = b.hangupOnVoicemail;
  if (b.stockCheckConfidence !== undefined) patch.stockCheckConfidence = b.stockCheckConfidence || null; // e.g. "spotty" = inconsistent stock (off-price/thrift), not a reliable MSRP source
  if (b.sellMethods !== undefined) patch.sellMethods = b.sellMethods || null; // CSV: in_store|pickup|ship
  if (typeof b.isMSRP === "boolean") patch.isMSRP = b.isMSRP;
  // Logo pointer repoint (logos-restructure): accepts a shared-R2 URL or a same-origin /logos/… path;
  // null/"" clears it back to the filesystem resolver. Flags ride along like POST /api/chains/:id/logo.
  if (b.logoUrl !== undefined) patch.logoUrl = b.logoUrl || null;
  if (typeof b.logoWide === "boolean") patch.logoWide = b.logoWide;
  if (typeof b.logoDark === "boolean") patch.logoDark = b.logoDark;
  // Invariant: a direct-answer chain has no menu, so it must carry NO tree-seconds — a stray value arms
  // the connect-timer and mutes the agent (silent-agent bug). Enforce it here too, so a manual admin edit
  // that flips a chain to direct can't recreate it (the learn/trainer paths already guard this).
  if (patch.ringsDirect === true || patch.answerPath === "direct_human") patch.avgTreeSeconds = null;
  const [row] = await db.update(chains).set(patch).where(eq(chains.id, Number(c.req.param("id")))).returning();
  invalidateRefCache();
  if (patch.logoUrl !== undefined || patch.logoWide !== undefined || patch.logoDark !== undefined) await refreshChainLogoDb();
  return c.json(row);
});

// ---- Products (catalog → SKU-level checks) ----
app.get("/api/products", async (c) => {
  const cat = c.req.query("categoryId");
  const rows = cat
    ? await db.select().from(products).where(eq(products.categoryId, Number(cat)))
    : await db.select().from(products);
  return c.json(rows);
});
// Public: product list for the Runnr consumer selector (active only, lean fields).
app.get("/pub/products", async (c) => {
  const cat = Number(c.req.query("categoryId") || 0);
  if (!cat) return c.json([]);
  const rows = (await db.select().from(products).where(eq(products.categoryId, cat)))
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name, series: p.series, type: p.type }));
  return c.json(rows);
});

// ---- Preview: the exact instructions a store's call will run (Global + Chain + Store) ----
app.get("/api/preview/:retailerId", async (c) => {
  const rid = Number(c.req.param("retailerId"));
  const cid = Number(c.req.query("categoryId") || 1);
  const product = c.req.query("product") || undefined;
  const p = await previewStorePrompt(rid, cid, product);
  if (!p) return c.json({ error: "store or category not found" }, 404);
  return c.json(p);
});

// ---- Email lead capture (public Runnr gate: one free call requires an email) ----
app.post("/pub/lead", async (c) => {
  const rl = rlCheck("lead", clientIp(c.req.raw.headers), LIMITS.lead);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const { email, source } = await c.req.json();
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return c.json({ error: "invalid_email" }, 400);
  await db.insert(leads).values({ email: e, source: source || "runner_free" }).onConflictDoNothing();
  return c.json({ ok: true });
});
// Admin: list captured email leads (newest first).
app.get("/api/leads", async (c) => c.json(await db.select().from(leads).orderBy(desc(leads.createdAt))));

// ---- Launch waitlist: capture out-of-area visitors + demand-by-region intel for rollout ----
app.post("/pub/waitlist", async (c) => {
  const rl = rlCheck("lead", clientIp(c.req.raw.headers), LIMITS.lead);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const b = await c.req.json().catch(() => ({}));
  const contact = String(b.contact || "").trim();
  const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact), isPhone = /^[+()\d][-()\s\d]{6,}$/.test(contact);
  if (!isEmail && !isPhone) return c.json({ error: "invalid_contact" }, 400);
  const lat = Number(b.lat), lng = Number(b.lng);
  await db.insert(waitlist).values({
    contact, lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null,
    area: (b.area ? String(b.area) : "").slice(0, 120) || null,
    region: b.region ? String(b.region).slice(0, 40) : null,
  });
  return c.json({ ok: true });
});
// "Don't see your store?" — submit a store to be added.
app.post("/pub/store-request", async (c) => {
  const rl = rlCheck("lead", clientIp(c.req.raw.headers), LIMITS.lead);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const b = await c.req.json().catch(() => ({}));
  const storeName = String(b.storeName || "").trim();
  if (!storeName) return c.json({ error: "storeName required" }, 400);
  // Attribute the submitter when they're signed in, so we can grant their free check the moment the store
  // goes live (see the PATCH below). Anonymous submissions still land — they just can't be auto-rewarded.
  const u = await verifyClerkToken(c.req.header("Authorization")).catch(() => null);
  await db.insert(storeRequests).values({
    contact: (b.contact ? String(b.contact) : "").slice(0, 120) || null,
    storeName: storeName.slice(0, 160), chain: (b.chain ? String(b.chain) : "").slice(0, 80) || null,
    address: (b.address ? String(b.address) : "").slice(0, 200) || null,
    city: (b.city ? String(b.city) : "").slice(0, 80) || null,
    state: (b.state ? String(b.state) : "").slice(0, 20) || null,
    note: (b.note ? String(b.note) : "").slice(0, 400) || null,
    userId: u?.id || null,
  });
  return c.json({ ok: true });
});
// Consumer: the signed-in user's own store submissions + their live/earned state (Earn-tab "stores you added").
app.get("/app/my-store-requests", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const rows = await db.select().from(storeRequests).where(eq(storeRequests.userId, u.id)).orderBy(desc(storeRequests.createdAt));
  const reward = (await getPolicy()).rewards.storeAddChecks;
  return c.json({
    reward,
    requests: rows.map((r) => ({ id: r.id, storeName: r.storeName, city: r.city, status: r.status, rewarded: !!r.rewardedAt, createdAt: r.createdAt })),
  });
});

// ---- Support agent (the ladder: cache → free → cheap → big → escalation form) ----
// Public chat. sessionId is a widget-held uuid; the ladder answers from the book + approved Q&As.
app.post("/pub/support/chat", async (c) => {
  const rl = rlCheck("support", clientIp(c.req.raw.headers), LIMITS.support);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const b = await c.req.json().catch(() => ({}));
  const message = String(b.message || "").trim();
  if (!message) return c.json({ error: "message required" }, 400);
  const sessionId = /^[\w-]{8,64}$/.test(String(b.sessionId || "")) ? String(b.sessionId) : crypto.randomUUID();
  const lang = b.lang === "es" ? "es" : "en";
  const category = SUPPORT_CATEGORIES.includes(b.category) ? (b.category as SupportCategory) : "other";
  // Attribute to the signed-in account when a phone-session bearer is present (anonymous still works).
  const u = await verifyClerkToken(c.req.header("Authorization")).catch(() => null);
  try {
    const r = await answerSupport(sessionId, message, {
      lang, category, account: u ? { id: u.id, phone: (u as { phone?: string }).phone } : null,
    });
    return c.json({ sessionId, reply: r.reply, escalate: r.escalate });
  } catch (e) {
    console.error("[support] chat", e);
    return c.json({ sessionId, reply: null, escalate: true, error: "unavailable" }, 500);
  }
});
// Instant answers over the book (Help tab search + search-ahead) — no model spend, just retrieval.
app.post("/pub/support/search", async (c) => {
  const rl = rlCheck("support", clientIp(c.req.raw.headers), LIMITS.support);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const b = await c.req.json().catch(() => ({}));
  const q = String(b.q || "").trim();
  if (q.length < 2) return c.json({ hits: [] });
  try { return c.json({ hits: await searchBook(q, 5) }); }
  catch (e) { console.error("[support] search", e); return c.json({ hits: [] }); }
});
// FAQ tab — Copper's top-15 questions from the ReadMe, parsed server-side (cached). No chat needed.
app.get("/pub/support/faq", async (c) => {
  try { return c.json({ items: await getFaq() }); }
  catch (e) { console.error("[support] faq", e); return c.json({ items: [] }); }
});
// Known-issue banner shown at the top of the Messenger home. Admin sets it; public reads it.
app.get("/pub/support/banner", async (c) => {
  const en = (await getSetting("support_banner_en")) || "";
  const es = (await getSetting("support_banner_es")) || "";
  return c.json({ en, es });
});
app.post("/api/support/banner", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  await setSetting("support_banner_en", String(b.en || "").slice(0, 240));
  await setSetting("support_banner_es", String(b.es || "").slice(0, 240));
  return c.json({ ok: true });
});
// Presigned R2 URL for a bug screenshot (bytes go straight to R2, never our server). Not gated by
// the community flag — this is the bug-report attach path.
app.post("/pub/support/upload-url", async (c) => {
  const rl = rlCheck("supportTicket", clientIp(c.req.raw.headers), LIMITS.supportTicket);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const cfg = r2Config();
  if (!cfg) return c.json({ error: "uploads_not_configured" }, 503);
  const b = await c.req.json().catch(() => ({}));
  const ext = String(b.ext || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 4);
  const key = photoKey(ext).replace(/^community\//, "support/");
  const { uploadUrl, publicUrl } = await presignPut(key, cfg, b.contentType || "image/jpeg");
  return c.json({ uploadUrl, publicUrl, key });
});
// The signed-in user's own past conversations (the Messages tab), newest first.
app.get("/app/support/conversations", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ conversations: [] });
  const rows = await db.select().from(supportConversations)
    .where(eq(supportConversations.accountId, u.id))
    .orderBy(desc(supportConversations.updatedAt)).limit(30);
  return c.json({ conversations: rows.map((r) => ({ id: r.id, sessionId: r.sessionId, category: r.category, title: r.title, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt })) });
});
// Re-open one conversation's transcript (owner of the session, by sessionId — no account needed for guests).
app.get("/pub/support/conversation/:sessionId", async (c) => {
  const sid = c.req.param("sessionId");
  if (!/^[\w-]{8,64}$/.test(sid)) return c.json({ error: "bad_session" }, 400);
  const cv = (await db.select().from(supportConversations).where(eq(supportConversations.sessionId, sid)).limit(1))[0];
  if (!cv) return c.json({ error: "not_found" }, 404);
  const msgs = await db.select().from(supportMessages).where(eq(supportMessages.conversationId, cv.id)).orderBy(supportMessages.id);
  return c.json({ sessionId: cv.sessionId, category: cv.category, status: cv.status, createdAt: cv.createdAt,
    messages: msgs.map((m) => ({ role: m.role, content: m.content })) });
});
// Thumbs up/down at the end of a chat. helped=true → review queue (the knowledge loop's intake).
app.post("/pub/support/resolve", async (c) => {
  const rl = rlCheck("support", clientIp(c.req.raw.headers), LIMITS.support);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const b = await c.req.json().catch(() => ({}));
  const ok = await resolveConversation(String(b.sessionId || ""), !!b.helped);
  return c.json({ ok });
});
// Escalation form — the only path to a human. Emails the transcript to the support inbox.
app.post("/pub/support/ticket", async (c) => {
  const rl = rlCheck("supportTicket", clientIp(c.req.raw.headers), LIMITS.supportTicket);
  if (!rl.ok) return c.json({ error: "rate_limited", retryAfter: rl.retryAfter }, 429);
  const b = await c.req.json().catch(() => ({}));
  const name = String(b.name || "").trim(), email = String(b.email || "").trim(), message = String(b.message || "").trim();
  if (!name || !message) return c.json({ error: "name and message required" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: "invalid_email" }, 400);
  const sessionId = /^[\w-]{8,64}$/.test(String(b.sessionId || "")) ? String(b.sessionId) : null;
  const category = SUPPORT_CATEGORIES.includes(b.category) ? String(b.category) : undefined;
  const screenshotUrl = typeof b.screenshotUrl === "string" && /^https?:\/\//.test(b.screenshotUrl) ? b.screenshotUrl : null;
  const debug = b.debug && typeof b.debug === "object" ? b.debug : null;
  const t = await submitTicket(sessionId, name, email, message, { category, screenshotUrl, debug });
  return c.json({ ok: true, ticketId: t.id });
});
// Admin: credit-machine audit — every auto-grant with the telemetry evidence that justified it,
// plus the suggested replacement phone when the background re-lookup disagreed with our record.
app.get("/api/support/credits", async (c) => {
  const grants = await listCreditGrants(Number(c.req.query("limit")) || 50);
  return c.json({ grants });
});
// Admin: rebuild the book index in qdrant (run after Copper edits the book).
app.post("/api/support/reindex", async (c) => {
  try {
    const pages = await reindexBook();
    return c.json({ ok: true, pages });
  } catch (e) {
    return c.json({ error: String((e as Error).message).slice(0, 200) }, 500);
  }
});
// Admin: review queue — resolved conversations awaiting approve/reject into the answer cache.
app.get("/api/support/review", async (c) => {
  const convos = await db.select().from(supportConversations)
    .where(eq(supportConversations.reviewStatus, "pending"))
    .orderBy(desc(supportConversations.updatedAt)).limit(50);
  const out = [];
  for (const cv of convos) {
    const msgs = await db.select().from(supportMessages)
      .where(eq(supportMessages.conversationId, cv.id)).orderBy(supportMessages.id);
    out.push({ id: cv.id, lang: cv.lang, maxTier: cv.maxTier, costUsd: cv.costUsd, updatedAt: cv.updatedAt,
      messages: msgs.map((m) => ({ role: m.role, content: m.content, tier: m.tier })) });
  }
  return c.json({ conversations: out });
});
// Admin: approve embeds the Q&A into the qdrant answer cache; reject just clears it from the queue.
app.post("/api/support/review/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const convo = (await db.select().from(supportConversations).where(eq(supportConversations.id, id)).limit(1))[0];
  if (!convo) return c.json({ error: "not_found" }, 404);
  if (b.action === "approve") {
    const msgs = await db.select().from(supportMessages)
      .where(eq(supportMessages.conversationId, id)).orderBy(supportMessages.id);
    const question = String(b.question || msgs.find((m) => m.role === "user")?.content || "").trim();
    const answer = String(b.answer || [...msgs].reverse().find((m) => m.role === "assistant")?.content || "").trim();
    if (!question || !answer) return c.json({ error: "no_qa_pair" }, 400);
    await addQa(question, answer, id);
    await db.update(supportConversations).set({ reviewStatus: "approved" }).where(eq(supportConversations.id, id));
    return c.json({ ok: true, embedded: true });
  }
  await db.update(supportConversations).set({ reviewStatus: "rejected" }).where(eq(supportConversations.id, id));
  return c.json({ ok: true, embedded: false });
});
// Admin: live-chats list for the dashboard. Filters: category, account (all|members|guests),
// since/until (unix seconds), q (title/message contains). Newest first.
app.get("/api/support/chats", async (c) => {
  const q = c.req.query();
  const conds: Array<ReturnType<typeof eq>> = [];
  if (q.category && SUPPORT_CATEGORIES.includes(q.category as SupportCategory)) conds.push(eq(supportConversations.category, q.category));
  if (q.account === "members") conds.push(sql`${supportConversations.accountId} is not null` as never);
  else if (q.account === "guests") conds.push(sql`${supportConversations.accountId} is null` as never);
  const since = Number(q.since), until = Number(q.until);
  if (Number.isFinite(since) && since > 0) conds.push(sql`${supportConversations.updatedAt} >= ${since}` as never);
  if (Number.isFinite(until) && until > 0) conds.push(sql`${supportConversations.updatedAt} <= ${until}` as never);
  if (q.q) conds.push(sql`${supportConversations.title} like ${"%" + q.q + "%"}` as never);
  let sel = db.select().from(supportConversations).$dynamic();
  if (conds.length) sel = sel.where(and(...conds));
  const rows = await sel.orderBy(desc(supportConversations.updatedAt)).limit(Math.min(Number(q.limit) || 100, 200));
  const counts = new Map<number, number>();
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    for (const mc of await db.select({ cid: supportMessages.conversationId, n: sql<number>`count(*)` }).from(supportMessages)
      .where(inArray(supportMessages.conversationId, ids)).groupBy(supportMessages.conversationId)) counts.set(mc.cid, Number(mc.n));
  }
  return c.json({ chats: rows.map((r) => ({
    id: r.id, category: r.category, accountId: r.accountId, accountPhone: r.accountPhone,
    title: r.title, maxTier: r.maxTier, status: r.status, escalated: r.status === "escalated",
    msgCount: counts.get(r.id) || 0, createdAt: r.createdAt, updatedAt: r.updatedAt,
  })) });
});
// Admin: one chat's full transcript + any escalation ticket (screenshot/debug) + account summary.
app.get("/api/support/chats/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const cv = (await db.select().from(supportConversations).where(eq(supportConversations.id, id)).limit(1))[0];
  if (!cv) return c.json({ error: "not_found" }, 404);
  const msgs = await db.select().from(supportMessages).where(eq(supportMessages.conversationId, id)).orderBy(supportMessages.id);
  const ticket = (await db.select().from(supportTickets).where(eq(supportTickets.conversationId, id)).orderBy(desc(supportTickets.id)).limit(1))[0] || null;
  return c.json({
    id: cv.id, category: cv.category, status: cv.status, lang: cv.lang, maxTier: cv.maxTier, costUsd: cv.costUsd,
    account: cv.accountId ? { id: cv.accountId, phone: cv.accountPhone } : null,
    createdAt: cv.createdAt, updatedAt: cv.updatedAt,
    messages: msgs.map((m) => ({ role: m.role, content: m.content, tier: m.tier, model: m.model, createdAt: m.createdAt })),
    ticket: ticket ? { id: ticket.id, name: ticket.name, email: ticket.email, message: ticket.message,
      screenshotUrl: ticket.screenshotUrl, debug: ticket.debug ? JSON.parse(ticket.debug) : null, emailedOk: ticket.emailedOk } : null,
  });
});
// Admin: the dashboard numbers — volume, category mix, who answered, escalation, CSAT, spend.
app.get("/api/support/stats", async (c) => {
  const range = c.req.query("range");
  const cutoff = range === "today" ? Math.floor(Date.now() / 1000) - 86400
    : range === "7d" ? Math.floor(Date.now() / 1000) - 7 * 86400
    : range === "30d" ? Math.floor(Date.now() / 1000) - 30 * 86400 : 0;
  const all = await db.select().from(supportConversations);
  const convos = cutoff ? all.filter((cv) => cv.updatedAt >= cutoff) : all;
  const tickets = await db.select({ n: sql<number>`count(*)` }).from(supportTickets);
  const byTier: Record<number, number> = {}, byCategory: Record<string, number> = {};
  let cost = 0;
  for (const cv of convos) {
    byTier[cv.maxTier] = (byTier[cv.maxTier] || 0) + 1;
    byCategory[cv.category] = (byCategory[cv.category] || 0) + 1;
    cost += cv.costUsd;
  }
  const escalated = convos.filter((cv) => cv.status === "escalated").length;
  const resolved = convos.filter((cv) => cv.status === "resolved").length;
  return c.json({
    models: SUPPORT_MODELS, range: range || "all",
    conversations: convos.length,
    members: convos.filter((cv) => cv.accountId).length,
    guests: convos.filter((cv) => !cv.accountId).length,
    byMaxTier: byTier, byCategory,
    escalated, resolved,
    escalationRate: convos.length ? Math.round((escalated / convos.length) * 100) : 0,
    selfServed: convos.length - escalated,
    pendingReview: all.filter((cv) => cv.reviewStatus === "pending").length,
    tickets: tickets[0]?.n || 0,
    estCostUsd: Math.round(cost * 10000) / 10000,
  });
});

// ---- Customer alerts (restock opt-in + status) ----
app.post("/app/alerts/subscribe", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const b = await c.req.json().catch(() => ({}));
  await getAccount(u.id, u.email || undefined);
  // The site sends its language with the signup — store it so this account's alerts go out in it.
  const subLang = b.lang === "es" ? "es" : b.lang === "en" ? "en" : undefined;
  if (subLang) await db.update(accounts).set({ language: subLang }).where(eq(accounts.clerkUserId, u.id));
  const r = await alertSubscribe(u.id, {
    kind: b.kind ? String(b.kind) : "restock",
    retailerId: b.retailerId != null ? Number(b.retailerId) : null,
    categoryId: b.categoryId != null ? Number(b.categoryId) : null,
    productLabel: b.productLabel ? String(b.productLabel).slice(0, 120) : null,
    channel: b.channel === "email" ? "email" : "sms",
  });
  return c.json(r);
});
app.get("/app/alerts/me", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  return c.json(await myAlerts(u.id));
});
// Turn one alert off (the My Checks alerts sheet). Only the caller's own subscriptions.
app.post("/app/alerts/unsubscribe", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const { id } = await c.req.json().catch(() => ({}));
  if (!id) return c.json({ error: "id required" }, 400);
  await db.update(alertSubscriptions).set({ active: 0 }).where(and(eq(alertSubscriptions.id, Number(id)), eq(alertSubscriptions.userId, u.id)));
  return c.json(await myAlerts(u.id));
});
// Mute = pause without losing the alert (owner 07-16): stays on the sheet, never sends until unmuted.
app.post("/app/alerts/mute", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const { id, muted } = await c.req.json().catch(() => ({}));
  if (!id) return c.json({ error: "id required" }, 400);
  return c.json(await alertMute(u.id, Number(id), !!muted));
});

// ---- Admin: editable alert message templates + the send log (tracking) ----
app.get("/api/alerts/templates", async (c) => c.json(await getAlertTemplatesPublic()));
// Admin: fire one template to yourself with sample data — the fastest way to eyeball a real send.
app.post("/api/alerts/test", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const event = String(b.event || "confirm_email");
  const to = String(b.to || "").trim();
  const channel = b.channel === "email" ? "email" as const : b.channel === "sms" ? "sms" as const : undefined;
  if (!to) return c.json({ error: "recipient required" }, 400);
  // The hands-free owner ping (call confirmed stock) is its own template, email only.
  if (event === "instock_owner") {
    return c.json(await sendOwnerInStockEmail(to, { store: "Target Glendale", product: "151 Booster Box", day: "Tuesdays", url: "https://checkitforme.com" }, { test: true }));
  }
  if (!["restock", "store_added", "waitlist", "confirm_email", "auto_check"].includes(event)) return c.json({ error: "bad_event" }, 400);
  const r = await sendTestAlert(event as "restock" | "store_added" | "waitlist" | "confirm_email" | "auto_check", to, channel);
  return c.json(r);
});
// Owner's hands-free in-stock ping: address + channel, editable live (settings beat the env defaults).
app.get("/api/admin/owner-alert", async (c) => c.json(await ownerAlertPrefs()));
app.post("/api/admin/owner-alert", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (b.email !== undefined) {
    const e = String(b.email || "").trim().toLowerCase();
    if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return c.json({ error: "invalid_email" }, 400);
    await setSetting("owner_alert_email", e);
  }
  if (b.channel !== undefined) {
    const ch = String(b.channel);
    if (!["email", "sms"].includes(ch)) return c.json({ error: "bad_channel" }, 400); // owner: text or email, nothing else
    await setSetting("owner_alert_channel", ch);
  }
  return c.json(await ownerAlertPrefs());
});
// Set/clear an account's email from Admin (support action). Admin-set addresses count as confirmed.
app.post("/api/admin/users/:id/email", async (c) => {
  const id = decodeURIComponent(c.req.param("id"));
  const b = await c.req.json().catch(() => ({}));
  const e = String(b.email || "").trim().toLowerCase();
  if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return c.json({ error: "invalid_email" }, 400);
  const a = (await db.select().from(accounts).where(eq(accounts.clerkUserId, id)))[0];
  if (!a) return c.json({ error: "not_found" }, 404);
  await db.update(accounts).set({ email: e || null, emailVerifiedAt: e ? Math.floor(Date.now() / 1000) : null }).where(eq(accounts.clerkUserId, id));
  return c.json({ ok: true, email: e || null });
});
app.patch("/api/alerts/templates", async (c) => {
  try { return c.json(await setAlertTemplates(await c.req.json())); } catch (e) { return c.json({ error: String(e) }, 400); }
});
app.get("/api/alerts/log", async (c) => {
  const rows = await db.select().from(alertSends).orderBy(desc(alertSends.createdAt)).limit(200);
  // Rollup: sends this month by event+channel+status, so the dashboard can show volume at a glance.
  const mk = monthKey(); const roll: Record<string, number> = {};
  for (const r of rows) { if (r.monthKey === mk) { const k = `${r.event}.${r.channel}.${r.status}`; roll[k] = (roll[k] || 0) + 1; } }
  // Who's signed up (active restock opt-ins), newest first — so Admin sees the customer list.
  const subs = await db.select().from(alertSubscriptions).where(eq(alertSubscriptions.active, 1)).orderBy(desc(alertSubscriptions.createdAt));
  const subUsers = new Set(subs.map((s) => s.userId));
  // Delivery readiness: are the provider creds actually set? (drives the "live vs stubbed" banner in Admin)
  const smsLive = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_SMS_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID));
  const emailLive = !!process.env.BREVO_API_KEY;
  return c.json({
    month: mk, rollup: roll,
    delivery: { sms: smsLive, email: emailLive },
    subscribers: { total: subUsers.size, subscriptions: subs.length, recent: subs.slice(0, 50).map((s) => ({ id: s.id, userId: s.userId, kind: s.kind, retailerId: s.retailerId, productLabel: s.productLabel, channel: s.channel, at: s.createdAt })) },
    recent: rows.map((r) => ({ id: r.id, userId: r.userId, event: r.event, channel: r.channel, to: r.toAddr, status: r.status, detail: r.detail, at: r.createdAt })),
  });
});
app.get("/api/store-requests", async (c) => c.json(await db.select().from(storeRequests).orderBy(desc(storeRequests.createdAt))));
app.patch("/api/store-requests/:id", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = Number(c.req.param("id"));
  if (b.status) {
    const status = String(b.status);
    await db.update(storeRequests).set({ status }).where(eq(storeRequests.id, id));
    // Go-live reward: when a request is marked 'added', grant the submitter their free check(s) — ONCE
    // (rewardedAt guards double-grants across repeated PATCHes). Amount is Admin-tunable (rewards.storeAddChecks).
    if (status === "added") {
      const row = (await db.select().from(storeRequests).where(eq(storeRequests.id, id)))[0];
      const reward = (await getPolicy()).rewards.storeAddChecks;
      if (row && row.userId && !row.rewardedAt && reward > 0) {
        await getAccount(row.userId);
        await grantCredits(row.userId, reward);
        await db.update(storeRequests).set({ rewardedAt: Date.now() }).where(eq(storeRequests.id, id));
        // Tell the submitter their store is live (email — never SMS for this event).
        try { await sendAlert(row.userId, "store_added", { store: row.storeName, city: row.city || "" }); } catch { /* never block the grant */ }
        return c.json({ ok: true, granted: { userId: row.userId, checks: reward } });
      }
    }
  }
  return c.json({ ok: true });
});

app.get("/api/waitlist", async (c) => {
  const rows = await db.select().from(waitlist).orderBy(desc(waitlist.createdAt));
  // Group by region (or 'Unknown') for the rollout view.
  const byRegion: Record<string, number> = {};
  for (const r of rows) byRegion[r.region || "Unknown"] = (byRegion[r.region || "Unknown"] || 0) + 1;
  return c.json({ total: rows.length, byRegion: Object.entries(byRegion).sort((a, b) => b[1] - a[1]).map(([region, n]) => ({ region, n })), recent: rows.slice(0, 50) });
});
// Admin: "we're live in your area" — email every not-yet-notified waitlist signup in a region, then mark
// them notified so nobody gets it twice. Email-only (owner: never text the waitlist). Preview with dry=1.
app.post("/api/waitlist/notify", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const region = String(b.region || "").trim();
  if (!region) return c.json({ error: "region required" }, 400);
  const rows = (await db.select().from(waitlist).where(and(eq(waitlist.region, region), eq(waitlist.notified, false))))
    .filter((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.contact)); // email-only
  if (b.dry) return c.json({ dry: true, region, would_notify: rows.length });
  let sent = 0;
  for (const r of rows) {
    try { await sendAnonEmail("waitlist", { city: r.area || region }, r.contact); sent++; } catch { /* keep going */ }
    await db.update(waitlist).set({ notified: true }).where(eq(waitlist.id, r.id));
  }
  return c.json({ ok: true, region, notified: sent });
});

// ---- Retailers (with green status) ----
app.get("/api/retailers", async (c) => {
  const rows = await retailersWithStatus({
    q: c.req.query("q") || undefined, state: c.req.query("state") || undefined,
    type: c.req.query("type") || undefined, region: c.req.query("region") || undefined,
    carries: c.req.query("carries") || undefined, online: c.req.query("online") === "1" || undefined,
    chainId: c.req.query("chainId") ? Number(c.req.query("chainId")) : undefined,
    limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
  });
  // Attach the same chain-logo info the consumer surfaces use, so the admin Stores list renders
  // the exact /logos/chains files (per public/logos/chains/README.md) — muted chains included.
  const names = new Map((await db.select().from(chains)).map((x) => [x.id, x.name]));
  return c.json(rows.map((r) => {
    const chainName = (r.chainId && names.get(r.chainId)) || null;
    const l = chainLogoInfo(chainName || r.name.split(/—|–| - /)[0]);
    return { ...r, carries: storeCarriesList(chainName, r.carries).join(","), distributor: distributorsForChain(chainName), logoUrl: l.url, logoWide: l.wide, logoDark: l.dark };
  }));
});
// Store Intel — the headline numbers on the Stores tab (cached 60s). The database, at a glance.
let storeIntelCache: { t: number; v: unknown } | null = null;
app.get("/api/admin/store-intel", async (c) => {
  if (storeIntelCache && Date.now() - storeIntelCache.t < 60_000) return c.json(storeIntelCache.v);
  const countWhere = async (w: ReturnType<typeof and> | ReturnType<typeof eq>) =>
    Number((await db.select({ n: sql<number>`count(*)` }).from(retailers).where(w))[0]?.n || 0);
  const active = eq(retailers.active, true);
  const total = await countWhere(active);
  // "Callable" = a REAL dialable line. Exclude the "nophone:" sentinel (address-only / site-check
  // imports) — those have a non-empty phone field but nothing to dial, so they were inflating the count.
  const callable = await countWhere(and(active, sql`${retailers.phone} is not null and ${retailers.phone} != '' and ${retailers.phone} not like 'nophone:%'`));
  const PRODUCTS = ["Pokemon", "One Piece", "Topps", "NeeDoh", "Magic", "Yu-Gi-Oh", "Lorcana", "Sports Cards", "Squishmallows"];
  const byProduct: Record<string, number> = {};
  for (const p of PRODUCTS) byProduct[p] = await countWhere(and(active, like(retailers.carries, `%${p}%`)));
  const stateRows = await db.select({ s: retailers.state }).from(retailers).where(active).groupBy(retailers.state);
  const states = stateRows.filter((r) => r.s).length;
  const chainRows = await cachedChains();
  const types = [...new Set(chainRows.map((x) => x.type).filter(Boolean))].sort();

  // ---- Reports (cached with the rest, 60s) ----
  // Stores by type: group by chain, fold chain → its type ("Other" for chain-less rows).
  const chainTypeOf = new Map(chainRows.map((x) => [x.id, x.type || "Other"]));
  const byChain = await db.select({ cid: retailers.chainId, n: sql<number>`count(*)` }).from(retailers).where(active).groupBy(retailers.chainId);
  const typeTotals: Record<string, number> = {};
  for (const r of byChain) { const t = (r.cid && chainTypeOf.get(r.cid)) || "Other"; typeTotals[t] = (typeTotals[t] || 0) + Number(r.n || 0); }
  const byType = Object.entries(typeTotals).map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n);
  // Top regions by store count.
  const topRegions = (await db.select({ region: retailers.region, n: sql<number>`count(*)` }).from(retailers)
    .where(and(active, sql`${retailers.region} is not null and ${retailers.region} != ''`))
    .groupBy(retailers.region).orderBy(desc(sql`count(*)`)).limit(10))
    .map((r) => ({ region: r.region as string, n: Number(r.n || 0) }));
  // Most-checked stores (most call results recorded against them).
  const funIds = [...(await ownerOnlyRetailerIds())]; // owner-only "Fun" store: never counted in reports
  const checkRows = await db.select({ rid: callResults.retailerId, n: sql<number>`count(*)` }).from(callResults)
    .where(and(sql`${callResults.retailerId} is not null`, sql`coalesce(${callResults.status},'') != 'admin_hangup'`, funIds.length ? notInArray(callResults.retailerId, funIds) : undefined))
    .groupBy(callResults.retailerId).orderBy(desc(sql`count(*)`)).limit(10);
  const checkIds = checkRows.map((r) => r.rid).filter((x): x is number => x != null);
  const checkNames = checkIds.length
    ? new Map((await db.select({ id: retailers.id, name: retailers.name, location: retailers.location }).from(retailers).where(inArray(retailers.id, checkIds))).map((r) => [r.id, r]))
    : new Map();
  const topChecks = checkRows.map((r) => ({ name: (r.rid != null && checkNames.get(r.rid)?.name) || `#${r.rid}`, location: (r.rid != null && checkNames.get(r.rid)?.location) || "", n: Number(r.n || 0) }));

  const v = { total, callable, byProduct, states, chains: chainRows.length, types, byType, topRegions, topChecks };
  storeIntelCache = { t: Date.now(), v };
  return c.json(v);
});
// Pokémon-MSRP coverage: what fraction of the genuine-MSRP chains' NATIONAL store footprint we've
// loaded. Denominator = the per-chain US store counts from the scored-chain dataset (tiers 3-5 =
// genuine MSRP); numerator = our active stores of those chains (capped per chain so a stale count
// can't push a chain over 100%). This is chain-FOOTPRINT coverage — how many of the chains' locations
// we hold — NOT a claim every one stocks Pokémon (a tier-3 chain carries, but varies by location).
// There is no national registry of "stores that stock Pokémon," so the scored-chain footprint is the
// benchmark. Read from the committed CSV (cached 5 min).
let coverageRefCache: { t: number; v: Array<{ chain: string; tier: number; national: number }> } | null = null;
function coverageRef() {
  if (coverageRefCache && Date.now() - coverageRefCache.t < 300_000) return coverageRefCache.v;
  const out: Array<{ chain: string; tier: number; national: number }> = [];
  try {
    const txt = readFileSync(join(here, "../data/source/chain-scoring-2026-06/chain_scores_final.csv"), "utf8");
    const lines = txt.split(/\r?\n/).filter((l) => l.trim());
    const head = lines[0].replace(/^﻿/, "").split(",");
    const iN = head.indexOf("chain_name_exact"), iT = head.indexOf("tier_1_5"), iS = head.indexOf("stores");
    // Columns 0-7 (name/tier/…/stores) have no embedded commas — only the trailing score_note does —
    // so a plain split is safe for the indices we read.
    for (const ln of lines.slice(1)) {
      const cols = ln.split(",");
      const chain = (cols[iN] || "").trim();
      const tier = parseInt((cols[iT] || "").trim(), 10);
      const national = parseInt((cols[iS] || "").trim(), 10) || 0;
      if (chain && tier >= 1 && tier <= 5) out.push({ chain, tier, national });
    }
  } catch { /* CSV missing in this build — return empty, coverage reads 0 */ }
  coverageRefCache = { t: Date.now(), v: out };
  return out;
}
app.get("/api/admin/coverage", async (c) => {
  const ref = coverageRef();
  const byChain = await db.select({ cid: retailers.chainId, n: sql<number>`count(*)` }).from(retailers)
    .where(eq(retailers.active, true)).groupBy(retailers.chainId);
  const idByName = new Map((await db.select({ id: chains.id, name: chains.name }).from(chains)).map((x) => [x.name, x.id]));
  const ourByCid = new Map(byChain.map((r) => [r.cid, Number(r.n || 0)]));
  const msrp = ref.filter((r) => r.tier >= 3 && r.tier <= 5 && r.national > 0);
  let loaded = 0, national = 0;
  const rows = msrp.map((r) => {
    const cid = idByName.get(r.chain);
    const ours = cid != null ? (ourByCid.get(cid) || 0) : 0;
    loaded += Math.min(ours, r.national); national += r.national;
    return { chain: r.chain, tier: r.tier, national: r.national, ours, pct: Math.round(100 * ours / r.national) };
  });
  return c.json({
    coveragePct: national ? Math.round(1000 * loaded / national) / 10 : 0,
    loaded, national, msrpChains: msrp.length,
    gaps: rows.filter((g) => g.pct < 100).sort((a, b) => a.pct - b.pct).slice(0, 25),
    note: "Coverage = the % of the national store footprint of the retail chains we know carry Pokémon at MSRP (tiers 3-5) that we've loaded. It measures chains/locations that CAN carry it — not that every store has it in stock right now (a 'spotty' tier-3 chain carries, but varies by location).",
  });
});
// Data-health monitor: ONE pass over active stores flags the gaps that silently break things —
// missing phone, missing hours, junk/markup names, no chain link, and **mis-chained** stores (name
// doesn't start with its chain's name — the exact failure the broken chainId filter used to hide).
// Returns overall counts + the worst chains per issue + samples to eyeball. Cached 5 min (full scan).
let dataHealthCache: { t: number; v: unknown } | null = null;
app.get("/api/admin/data-health", async (c) => {
  if (!c.req.query("fresh") && dataHealthCache && Date.now() - dataHealthCache.t < 300_000) return c.json(dataHealthCache.v);
  const chainName = new Map((await db.select({ id: chains.id, name: chains.name }).from(chains)).map((x) => [x.id, x.name || ""]));
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  // Mis-chain = store name and chain name share NO significant word. Shared-token (not prefix) so a
  // store correctly chained but named with a franchise prefix / short brand / variant ("Franklin's Ace
  // Hardware" ∈ "Ace Hardware", "Big 5 Reseda" ∈ "Big 5 Sporting Goods", "CVS West Hills" ∈ "_CVS
  // Pharmacy at Target") is NOT flagged — only a genuinely foreign brand (a Savers row under Dick's) is.
  const STOP = new Set(["the", "and", "of", "at", "for", "store", "shop", "inc", "llc"]);
  // Stem a trailing possessive/plural -s so the chain "Mariano's"/"Lowe's"/"Smith's" (tokens mariano/lowe/smith)
  // matches its real stores spelled "Marianos …"/"… Lowes"/"Smiths …". Without this the apostrophe makes
  // mariano ≠ marianos and ~30 correctly-chained grocery stores get false-flagged as mis-chained.
  const stem = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);
  const sig = (s: string) => new Set(norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t)).map(stem)); // keep 2-char brands (BJ's, etc.)
  const junkRx = /&lt;|&gt;|style=|<[a-z/]|\(#\d|—| - | Shop Location|Holiday (Décor|Greeting)/i;
  const allCaps = /\b[A-Z]{4,}\s+[A-Z]{4,}\b/;
  const rows = await db.select({ id: retailers.id, name: retailers.name, chainId: retailers.chainId, phone: retailers.phone, hours: retailers.hours, ownerOnly: retailers.ownerOnly })
    .from(retailers).where(eq(retailers.active, true)).limit(200000);
  let missingPhone = 0, missingHours = 0, junk = 0, noChain = 0, misChain = 0;
  const byHours = new Map<number, number>(), byMis = new Map<number, number>();
  const junkSample: string[] = [], misSample: string[] = [];
  for (const r of rows) {
    const nm = r.name || "";
    if (r.ownerOnly) continue; // owner-only demo stores (Fun/MVPs) are intentional fixtures — never "problems"
    if (!r.phone || r.phone.startsWith("nophone:")) missingPhone++;
    if (!r.hours) { missingHours++; if (r.chainId) byHours.set(r.chainId, (byHours.get(r.chainId) || 0) + 1); }
    if (junkRx.test(nm) || allCaps.test(nm) || nm.length > 80) { junk++; if (junkSample.length < 15) junkSample.push(nm.slice(0, 70)); }
    if (!r.chainId) { noChain++; continue; }
    const cn = chainName.get(r.chainId);
    if (cn) {
      const ct = sig(cn), st = sig(nm);
      if (ct.size && st.size && ![...st].some((t) => ct.has(t))) {
        misChain++; byMis.set(r.chainId, (byMis.get(r.chainId) || 0) + 1);
        if (misSample.length < 15) misSample.push(`${nm.slice(0, 40)}  → chain: ${cn}`);
      }
    }
  }
  const top = (m: Map<number, number>) => [...m.entries()].map(([cid, n]) => ({ chain: chainName.get(cid) || `#${cid}`, n })).sort((a, b) => b.n - a.n).slice(0, 20);
  const v = {
    total: rows.length, missingPhone, missingHours, junkNames: junk, noChain, misChained: misChain,
    worstHours: top(byHours), worstMisChain: top(byMis), junkSample, misSample,
    note: "One pass over active stores. misChained = store name shares NO significant word with its chain (possessive -s stemmed, so real Mariano's/Lowe's/Smith's stores no longer false-flag). Remaining hits are independents auto-filed under a big chain by name prefix (e.g. 'Lee Harrison' under Harris Teeter) — real stores wearing the wrong logo, re-home not delete; eyeball misSample. missingHours concentrated in thrift (openState treats blank hours as closed-overnight only). Pass ?fresh=1 to bypass the 5-min cache.",
  };
  dataHealthCache = { t: Date.now(), v };
  return c.json(v);
});
// In-admin Claude agent ("Admin dev"): chat to manage the store DB. Client sends the running
// transcript [{role,text}]; the server runs one turn (with an internal tool loop) and returns
// the reply + a list of actions taken. Admin-gated like the rest of /api/*.
// Call-timing breakdown for the God view: total / time-to-human (nav) / talk, aggregate + per store.
app.get("/api/admin/call-timing", async (c) => {
  const ownerOnly = await ownerOnlyRetailerIds(); // owner-only "Fun"/MVP store excluded from timings
  const stores = await retailerMap();
  const chRows = await db.select({ id: chains.id, navType: chains.navType, navSeconds: chains.navSeconds, navStatus: chains.navStatus }).from(chains);
  const chainById = new Map(chRows.map((c) => [c.id, c]));
  const chainOf = (rid: number) => { const r = stores.get(rid); return r && r.chainId != null ? chainById.get(r.chainId) : null; };
  // time-to-human = the chain's LOCKED nav recipe (phone-tree + hold before a person). REAL talk =
  // callSeconds − this, counted only for calls that reached a person. Falls back to per-call nav.
  const tthOf = (rid: number) => { const ch = chainOf(rid); return (ch && ch.navStatus === "locked" && ch.navSeconds != null) ? ch.navSeconds : null; };
  const all = await db.select().from(callResults);
  const statsSince = await getStatsSince();
  const rows = all.filter((r) => r.callSeconds != null && r.status !== "admin_hangup" && !ownerOnly.has(r.retailerId) && (r.startedAt || 0) >= statsSince);
  // Reached a human (transcript-classified) — ring / voicemail / IVR-only calls have NO human-talk.
  const reachedIds = new Set(rows.filter((r) => classifyCallReality(r.transcript) !== "never_reached").map((r) => r.id));
  const reached = rows.filter((r) => reachedIds.has(r.id));
  const r0 = (n: unknown) => Math.round(Number(n || 0));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const navOf = (r: (typeof rows)[number]) => tthOf(r.retailerId) ?? r.navSeconds ?? 0;
  const talkOf = (r: (typeof rows)[number]) => Math.max(0, (r.callSeconds || 0) - navOf(r));
  const aggregate = {
    calls: rows.length, reached: reached.length,
    avgCallSec: r0(avg(rows.map((r) => r.callSeconds || 0))),
    avgNavSec: r0(avg(reached.map((r) => navOf(r)))),
    avgTalkSec: r0(avg(reached.map((r) => talkOf(r)))),
    totalMinutes: r0(rows.reduce((s, r) => s + (r.callSeconds || 0), 0) / 60),
  };
  // By MODEL — Charlie (direct), Alpha (keypad tree), Bravo (voice tree) — by the chain's nav type, over reached calls.
  const modelOf = (nt: string | null | undefined) => (nt === "direct" ? "Charlie" : nt === "keypad" ? "Alpha" : nt === "voice" ? "Bravo" : "Unknown");
  const typeOf = (m: string) => (m === "Charlie" ? "direct" : m === "Alpha" ? "tone tree" : m === "Bravo" ? "voice tree" : "unmapped");
  const mAgg = new Map<string, { call: number[]; nav: number[]; talk: number[] }>();
  for (const r of reached) {
    const m = modelOf(chainOf(r.retailerId)?.navType);
    const cur = mAgg.get(m) ?? { call: [], nav: [], talk: [] };
    cur.call.push(r.callSeconds || 0); cur.nav.push(navOf(r)); cur.talk.push(talkOf(r));
    mAgg.set(m, cur);
  }
  const byModel = ["Charlie", "Alpha", "Bravo", "Unknown"].filter((m) => mAgg.has(m)).map((m) => {
    const v = mAgg.get(m)!; return { model: m, type: typeOf(m), n: v.call.length, avgCallSec: r0(avg(v.call)), avgNavSec: r0(avg(v.nav)), avgTalkSec: r0(avg(v.talk)) };
  });
  // Talk per verdict (statusKey → status), over reached calls.
  const sAgg = new Map<string, { call: number[]; talk: number[] }>();
  for (const r of reached) {
    const k = String(r.statusKey ?? r.status ?? "unknown");
    const cur = sAgg.get(k) ?? { call: [], talk: [] };
    cur.call.push(r.callSeconds || 0); cur.talk.push(talkOf(r));
    sAgg.set(k, cur);
  }
  const byStatus = [...sAgg.entries()].map(([key, v]) => ({ key, n: v.call.length, avgTalkSec: r0(avg(v.talk)), avgCallSec: r0(avg(v.call)) })).sort((a, b) => b.n - a.n);
  // Per store: connected time over ALL its timed calls (cost), but talk/nav only over the ones that reached a human.
  const stAgg = new Map<number, { call: number[]; navR: number[]; talkR: number[] }>();
  for (const r of rows) {
    const cur = stAgg.get(r.retailerId) ?? { call: [], navR: [], talkR: [] };
    cur.call.push(r.callSeconds || 0);
    if (reachedIds.has(r.id)) { cur.navR.push(navOf(r)); cur.talkR.push(talkOf(r)); }
    stAgg.set(r.retailerId, cur);
  }
  const byStore = [...stAgg.entries()].map(([rid, v]) => ({
    name: stores.get(rid)?.name?.split("—")[0].trim() || `#${rid}`, n: v.call.length,
    avgCallSec: r0(avg(v.call)), avgNavSec: r0(avg(v.navR)), avgTalkSec: r0(avg(v.talkR)),
    totalMin: r0(v.call.reduce((s, x) => s + x, 0) / 60),
  })).sort((a, b) => b.n - a.n).slice(0, 12);
  return c.json({ aggregate, byModel, byStatus, byStore, statsSince });
});
// ---- Phone Tree Lab: discover + document + verify the route-to-a-human per brand ----
// Place a normal call to one open, callable store of a chain; its transcript feeds the tree learner in ingest.
async function placeChainTreeCall(chainId: number): Promise<{ ok: boolean; error?: string; retailer?: string }> {
  const stores = await db.select().from(retailers).where(and(eq(retailers.chainId, chainId), eq(retailers.active, true))).limit(40);
  const callable = stores.filter((s) => s.phone && !s.phone.startsWith("nophone:"));
  if (!callable.length) return { ok: false, error: "no callable store" };
  const cats = await cachedCategories();
  const catId = cats[0]?.id;
  if (!catId) return { ok: false, error: "no categories" };
  for (const s of callable) {
    try { await triggerCall({ retailerId: s.id, categoryId: catId }); return { ok: true, retailer: s.name }; }
    catch { /* closed / no line — try the next store */ }
  }
  return { ok: false, error: "no open store right now (all closed?)" };
}
// Sync LEARNED chain-nav fields PROD → STAGING. Nav is learned from real calls on prod; staging is a
// curation copy that goes stale ("mapped on prod, gray COMING SOON on staging"). The promotion rule:
// learned fields refresh prod→staging. Keyed by NAME (chain ids differ per env). SKIPS the curated
// DIRECT_DEFAULT_CHAINS so a stale prod tree (e.g. Ace's old "press 4") can never clobber the
// independent/co-op direct default. Silent-agent invariant enforced. Admin-gated. `dryRun:true` reports.
app.post("/api/admin/chains/nav-sync", async (c) => {
  const b = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const incoming = (Array.isArray(b) ? b : ((b as Record<string, unknown>).chains as unknown[])) || [];
  if (!Array.isArray(incoming) || !incoming.length) return c.json({ error: "expected { chains: [{name, …nav}] }" }, 400);
  const NAV = ["navStatus", "navRecipe", "navType", "navSeconds", "ringsDirect", "treeStatus", "treeNote",
    "phoneTreeDefault", "dtmfShortcut", "answerPath", "avgTreeSeconds", "treeLearnedAt", "treeVerifiedAt"] as const;
  const dry = (b as Record<string, unknown>).dryRun === true;
  const byName = new Map((await db.select().from(chains)).map((x) => [x.name, x]));
  let updated = 0, skippedDirect = 0, missing = 0;
  for (const inc of incoming as Record<string, unknown>[]) {
    const row = inc && typeof inc.name === "string" ? byName.get(inc.name) : null;
    if (!row) { missing++; continue; }
    if (isDirectDefaultChain(row.name)) { skippedDirect++; continue; } // never clobber the curated direct default
    const patch: Record<string, unknown> = {};
    for (const k of NAV) if (k in inc) patch[k] = inc[k];
    if (!Object.keys(patch).length) continue;
    // silent-agent invariant: a direct chain must carry NO tree-seconds
    if (patch.ringsDirect === true || patch.answerPath === "direct_human") patch.avgTreeSeconds = null;
    if (!dry) await db.update(chains).set(patch).where(eq(chains.id, row.id));
    updated++;
  }
  if (!dry) invalidateRefCache();
  return c.json({ [dry ? "wouldUpdate" : "updated"]: updated, skippedDirect, missing, received: incoming.length });
});
// Manual "refresh staging from prod" — the same pull the learned-sync tick runs every 3 min, on demand.
// Learned phone-nav is born on prod (real calls); this drags it back so staging never lags. Staging-only
// (prod is the source and returns not_staging). GET reports the last run without pulling.
app.get("/api/admin/learned-sync", async (c) => c.json(await learnedSyncStatus()));
app.post("/api/admin/learned-sync", async (c) => c.json(await learnedSyncTick()));
app.get("/api/admin/tree/list", async (c) => {
  const chs = await db.select().from(chains).orderBy(chains.name);
  const rows = await db.select({ cid: retailers.chainId, n: sql<number>`count(*)` }).from(retailers).where(eq(retailers.active, true)).groupBy(retailers.chainId);
  const cnt = new Map(rows.map((r) => [r.cid, Number(r.n || 0)]));
  // Per-chain count of stores we can ACTUALLY dial (real phone, not a `nophone:` placeholder). A chain
  // with stores but 0 phones can never be mapped no matter how many calls we throw at it — the blocker is
  // a DATA gap (missing phone numbers), not a phone tree. Surfacing this stops the "all stores closed"
  // misdiagnosis (e.g. the verified-kiosk groceries — H-E-B et al. — are 100% kiosks with 0 phones on file).
  const prows = await db.select({ cid: retailers.chainId, n: sql<number>`count(*)` }).from(retailers)
    .where(and(eq(retailers.active, true), sql`${retailers.phone} is not null and ${retailers.phone} not like 'nophone:%'`)).groupBy(retailers.chainId);
  const pcnt = new Map(prows.map((r) => [r.cid, Number(r.n || 0)]));
  // The mapping board must MATCH the store data: only real, DIALABLE chains. chainDialable() is the ONE
  // shared rule (recipe.ts) the board, the overnight batch, and single-chain map all read — a muted,
  // call-center (callTarget=false), or site-check chain (stockCheckMethod=site, e.g. Micro Center) is
  // never dialed, so it must not look callable here either. Plus board-only clutter filters: a chain
  // with 0 active stores has nothing to call, and a "_" name is a retired merge-stub. `?all=1` = unfiltered.
  const showAll = c.req.query("all") === "1";
  const visible = showAll ? chs : chs.filter((ch) => chainDialable(ch) && !(ch.name || "").startsWith("_") && (cnt.get(ch.id) || 0) > 0);
  return c.json({ model: TREE_MODEL, chains: visible.map((ch) => {
    const stores = cnt.get(ch.id) || 0, phones = pcnt.get(ch.id) || 0;
    // blocker = why this chain can't be mapped even though it's a call target. Today: a data gap where
    // stores exist but none carry a real phone number (the board shows it so nobody chases hours/trees).
    const blocker = stores > 0 && phones === 0 ? "no phone numbers on file (data gap)" : null;
    return { id: ch.id, name: ch.name, type: ch.type, stores, phones, blocker, distributor: distributorsForChain(ch.name), treeStatus: ch.treeStatus, ringsDirect: ch.ringsDirect, dtmf: ch.dtmfShortcut, answerPath: ch.answerPath, avgTreeSeconds: ch.avgTreeSeconds, note: ch.treeNote || ch.phoneTreeDefault, learnedAt: ch.treeLearnedAt, verifiedAt: ch.treeVerifiedAt, muted: ch.muted };
  }) });
});
app.post("/api/admin/tree/discover", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { chainId?: number; count?: number };
  if (b.chainId) return c.json(await placeChainTreeCall(Number(b.chainId)));
  const count = Math.min(Math.max(Number(b.count) || 5, 1), 25);
  const chs = await db.select().from(chains).where(isNull(chains.treeStatus)).limit(300);
  const names: string[] = []; let placed = 0;
  for (const ch of chs) { if (placed >= count) break; const r = await placeChainTreeCall(ch.id); if (r.ok) { placed++; names.push(ch.name); } }
  return c.json({ placed, names });
});
app.post("/api/admin/tree/verify", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { chainId?: number; count?: number };
  if (b.chainId) { queueTreeRelearn(Number(b.chainId)); return c.json(await placeChainTreeCall(Number(b.chainId))); }
  const count = Math.min(Math.max(Number(b.count) || 5, 1), 25);
  const chs = await db.select().from(chains).where(sql`${chains.treeStatus} is not null`).limit(300);
  const names: string[] = []; let placed = 0;
  for (const ch of chs) { if (placed >= count) break; queueTreeRelearn(ch.id); const r = await placeChainTreeCall(ch.id); if (r.ok) { placed++; names.push(ch.name); } }
  return c.json({ placed, names });
});
// ---- Tree Trainer v2: document the fastest path to a human per chain (the cheap-lane navigator) ----
// Helicone routing health-check: one tiny live call through the gateway (no phone call). Confirms the
// LLM "voice switcher" path works and reports which model + latency. Defaults to the cheap nav model.
app.get("/api/admin/llm-ping", async (c) => {
  const model = c.req.query("model") || NAV_MODEL;
  const t0 = Date.now();
  try {
    const text = await llm(model, "Reply with the single word OK.", { job: "helicone-ping", maxTokens: 5, temperature: 0 });
    return c.json({ ok: true, model, via: "helicone", heliconeConfigured: !!process.env.HELICONE_API_KEY, ms: Date.now() - t0, sample: (text || "").trim().slice(0, 40) });
  } catch (e) {
    return c.json({ ok: false, model, via: "helicone", heliconeConfigured: !!process.env.HELICONE_API_KEY, ms: Date.now() - t0, error: String((e as Error)?.message || e).slice(0, 200) }, 502);
  }
});
app.get("/api/admin/trainer/list", async (c) => {
  const chs = await db.select().from(chains).orderBy(chains.name);
  const rows = await db.select({ cid: retailers.chainId, n: sql<number>`count(*)` }).from(retailers)
    .where(and(eq(retailers.active, true), sql`${retailers.phone} not like 'nophone:%'`)).groupBy(retailers.chainId);
  const cnt = new Map(rows.map((r) => [r.cid, Number(r.n || 0)]));
  return c.json({ chains: chs.filter((ch) => !ch.name.startsWith("_")).map((ch) => ({
    id: ch.id, name: ch.name, type: ch.type, callable: cnt.get(ch.id) || 0,
    navType: ch.navType, navStatus: ch.navStatus || "unmapped", navSeconds: ch.navSeconds,
    navConfidence: ch.navConfidence, navRecipe: ch.navRecipe ? JSON.parse(ch.navRecipe) : null,
    navLog: ch.navLog ? JSON.parse(ch.navLog) : [], navUpdatedAt: ch.navUpdatedAt,
  })) });
});
app.post("/api/admin/trainer/document", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { chainId?: number; retailerId?: number; model?: string; hint?: string; barge?: { plan: Array<{ action: string; value: string; at: number }> }; reactivePress?: { digit: string; max: number }; confirm?: boolean; product?: string };
  // CONFIRM mode: don't just reach a human — ask "do you have any {product} in stock?" to verify we
  // hit the RIGHT desk. On a chain-level run we ROTATE to a store we haven't asked yet (no script change,
  // just a fresh store) so we never re-ask the same store on a callback.
  const confirm = b.confirm ? { product: (b.product || "Pokémon cards").trim() } : undefined;
  let r: typeof retailers.$inferSelect | undefined;
  if (b.retailerId) r = (await db.select().from(retailers).where(eq(retailers.id, Number(b.retailerId))))[0];
  else if (b.chainId) {
    const cands = await db.select().from(retailers).where(and(
      eq(retailers.chainId, Number(b.chainId)), eq(retailers.active, true), sql`${retailers.phone} not like 'nophone:%'`,
    )).limit(50);
    if (confirm) {
      const asked = new Set(await confirmAskedStores(Number(b.chainId)));
      r = cands.find((x) => x.phone && !asked.has(x.id)) ?? cands[0]; // fresh store first; if all asked, start over
    } else {
      r = cands.find((x) => x.phone) ?? cands[0];
    }
  }
  if (!r || !r.phone) return c.json({ error: "no callable store for that chain" }, 400);
  // Same shared rule as the board + batch: never trainer-dial a chain we don't call — muted, a national
  // call-center (callTarget=false, e.g. Micro Center / Best Buy), or a site-check chain (its accurate
  // website is the answer). chainDialable() is the single source so these can never disagree.
  const _ch = r.chainId != null ? (await db.select().from(chains).where(eq(chains.id, r.chainId)))[0] : undefined;
  if (_ch && !chainDialable(_ch)) return c.json({ error: `${_ch.name} isn't a call target (muted / call-center / check-online) — skipped` }, 400);
  if (b.chainId) await db.update(chains).set({ navStatus: "learning", navUpdatedAt: Math.floor(Date.now() / 1000) }).where(eq(chains.id, Number(b.chainId)));
  const res = await placeNavCall(r.chainId, r.id, r.name, r.phone, b.model, b.hint, b.barge, b.reactivePress, confirm);
  return res.error ? c.json({ error: res.error }, 400) : c.json({ sessionId: res.id, store: r.name, confirm: !!confirm });
});
app.get("/api/admin/trainer/session/:id", (c) => {
  const s = getNavSession(c.req.param("id"));
  if (!s) return c.json({ error: "expired" }, 404);
  return c.json({ id: s.id, store: s.retailerName, status: s.status, type: s.type, confidence: s.confidence,
    elapsed: Math.round((Date.now() - s.startMs) / 1000), humanAtSec: s.humanAtSec,
    // Confirm-mode: did we hit the RIGHT desk ("answered") or get sent elsewhere ("redirect" + where)?
    confirm: s.confirm ? (s.confirmResult ?? "asked") : null, redirectTo: s.redirectTo ?? null,
    // #2: the pressable menu tree heard so far + the desk we're aiming for (owner target).
    menu: s.menu ?? [], menuPrompts: s.menuPrompts ?? [], target: s.target ?? null,
    steps: s.steps, recipe: s.recipe });
});
// Call log for a chain: every learner run (Alpha/Bravo/Charlie path + the step matrix). Powers the
// expandable log under the Discover button.
app.get("/api/admin/trainer/runs", async (c) => {
  const chainId = Number(c.req.query("chainId"));
  if (!chainId) return c.json({ runs: [] });
  const runs = JSON.parse((await getSetting(`nav_runs:${chainId}`)) || "[]") as unknown[];
  return c.json({ runs: runs.slice().reverse() }); // newest first
});
// Seed/replace a chain's run log (used to backfill today's real runs; also handy for tests).
app.post("/api/admin/trainer/runs", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { chainId?: number; runs?: unknown[] };
  if (!b.chainId || !Array.isArray(b.runs)) return c.json({ error: "chainId + runs[] required" }, 400);
  await setSetting(`nav_runs:${b.chainId}`, JSON.stringify(b.runs.slice(-20)));
  return c.json({ ok: true, saved: b.runs.length });
});
app.post("/api/admin/trainer/lock", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { chainId?: number; recipe?: { type?: string; steps?: unknown[]; seconds?: number }; confidence?: number };
  if (!b.chainId || !b.recipe) return c.json({ error: "chainId + recipe required" }, 400);
  const ch = (await db.select().from(chains).where(eq(chains.id, Number(b.chainId))))[0];
  const log = ch?.navLog ? (JSON.parse(ch.navLog) as number[]) : [];
  if (typeof b.recipe.seconds === "number") log.push(b.recipe.seconds);
  // Bridge: write the locked recipe into the LIVE call's phone-tree directions so every real call to
  // this chain navigates via it (the live agent reads chains.phoneTreeDefault as {{phone_tree}}).
  const recipe = b.recipe as Recipe;
  const direct = isDirect(recipe);
  const treeText = recipeToTreeText(recipe);
  const dtmf = recipeToDtmf(recipe); // "digit@seconds" early-press form the bridge consumes
  const now = Math.floor(Date.now() / 1000);
  await db.update(chains).set({
    navType: b.recipe.type || null, navRecipe: JSON.stringify(b.recipe),
    navSeconds: direct ? null : (typeof b.recipe.seconds === "number" ? Math.round(b.recipe.seconds) : null),
    navStatus: "locked", navConfidence: typeof b.confidence === "number" ? b.confidence : null,
    navLog: JSON.stringify(log.slice(-10)), navUpdatedAt: now,
    // ↓ applied to live consumer calls (this is the bridge from documentation → real calls):
    phoneTreeDefault: treeText, treeNote: treeText,
    dtmfShortcut: dtmf || null,
    answerPath: recipeAnswerPath(recipe) || null,
    // Direct-answer chains have no menu, so they must carry NO seconds — a stray value arms the ABC
    // connect-timer and mutes the agent while a human is already on the line (the silent-agent bug).
    ringsDirect: direct, avgTreeSeconds: direct ? null : (typeof b.recipe.seconds === "number" ? Math.round(b.recipe.seconds) : null),
    treeStatus: "learned", treeLearnedAt: now,
  }).where(eq(chains.id, Number(b.chainId)));
  return c.json({ ok: true });
});
// Overnight phone-tree batch: dial one store per chain, learn + persist the route. action:
// "start" (onlyMissing default true; optional limit, gapSec) | "stop" | "status".
app.post("/api/admin/trainer/batch", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { action?: string; onlyMissing?: boolean; limit?: number; gapSec?: number };
  if (b.action === "stop") return c.json(stopBatch());
  if (b.action === "status") return c.json(batchStatus());
  return c.json(await startBatch({ onlyMissing: b.onlyMissing, limit: b.limit, gapSec: b.gapSec }));
});
app.get("/api/admin/trainer/batch", (c) => c.json(batchStatus()));
// ---- Mapper: "map until locked" — the auto-continue loop (listen → baseline → optimize → lock) ----
app.post("/api/admin/mapper/start", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { chainId?: number };
  return c.json(await startMapper(Number(b.chainId || 0)));
});
app.post("/api/admin/mapper/stop", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { chainId?: number };
  return c.json(stopMapper(Number(b.chainId || 0)));
});
app.get("/api/admin/mapper/state", (c) => c.json(mapperState()));
// #B: department-only chains (no customer-service option) — read the flag + captured menu so the panel
// can ask the owner which desk to press; POST sets the per-chain target and clears the flag so the next
// "Map until locked" aims for it.
app.get("/api/admin/mapper/target", async (c) => {
  const chainId = Number(c.req.query("chainId"));
  if (!chainId) return c.json({ error: "chainId required" }, 400);
  const flag = (await getSetting(`nav_needs_target:${chainId}`)) || "";
  const target = (await getSetting(`nav_target:${chainId}`)) || "";
  return c.json({ target: target || null, needsTarget: flag ? JSON.parse(flag) : null });
});
app.post("/api/admin/mapper/target", async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { chainId?: number; target?: string };
  const chainId = Number(b.chainId || 0);
  if (!chainId) return c.json({ error: "chainId required" }, 400);
  const target = String(b.target || "").trim();
  await setSetting(`nav_target:${chainId}`, target);
  await setSetting(`nav_needs_target:${chainId}`, ""); // owner chose → clear the needs-target flag
  return c.json({ ok: true, target: target || null });
});
app.get("/api/admin/agent/models", (c) => c.json(AGENT_MODELS));
app.post("/api/admin/agent", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { messages?: Array<{ role: "user" | "assistant"; text: string }>; model?: string };
  const history = Array.isArray(body.messages) ? body.messages : [];
  const res = await runAdminAgent(history, body.model);
  return c.json(res);
});
app.post("/api/retailers", async (c) => {
  const b = await c.req.json();
  const [row] = await db.insert(retailers).values(b).returning();
  return c.json(row, 201);
});
app.patch("/api/retailers/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json();
  // Owner-only demo stores ("Fun"/"MVPs"): the phone number IS the on/off switch — saving a number makes
  // the store appear, clearing it hides it entirely. Derived server-side so it works regardless of which
  // fields the Admin sends. Real stores are untouched (active is managed independently for them).
  if (Object.prototype.hasOwnProperty.call(b, "phone")) {
    const cur = (await db.select({ ownerOnly: retailers.ownerOnly }).from(retailers).where(eq(retailers.id, id)))[0];
    if (cur?.ownerOnly) b.active = !!(b.phone && String(b.phone).trim());
  }
  const [row] = await db.update(retailers).set(b).where(eq(retailers.id, id)).returning();
  return c.json(row);
});
// Hard-delete a store (admin) — for purging test/probe rows and confirmed junk. Soft-remove
// (active:false) hides from consumers; this removes the row entirely. Returns how many were deleted.
app.delete("/api/retailers/:id", async (c) => {
  const r = await db.delete(retailers).where(eq(retailers.id, Number(c.req.param("id"))));
  invalidateRefCache();
  return c.json({ deleted: r.rowsAffected ?? 0 });
});

// ---- Zones ----
app.get("/api/zones", async (c) => {
  const zs = await db.select().from(zones);
  const links = await db.select().from(zoneRetailers);
  return c.json(zs.map((z) => ({ ...z, retailerIds: links.filter((l) => l.zoneId === z.id).map((l) => l.retailerId) })));
});
app.post("/api/zones", async (c) => {
  const [row] = await db.insert(zones).values(await c.req.json()).returning();
  return c.json(row, 201);
});
app.post("/api/zones/:id/retailers", async (c) => {
  const { retailerId } = await c.req.json();
  const [row] = await db.insert(zoneRetailers).values({ zoneId: Number(c.req.param("id")), retailerId }).returning();
  return c.json(row, 201);
});
// Bulk import zones + stores from a JSON file (de-dupes; coordinates fill in via background geocoding).
app.post("/api/import-zones", async (c) => c.json(await importZonesData(await c.req.json())));
// Call every store in a zone (explicit, on-demand — never automatic). Remember the placed callSids so
// the operator can cancel the whole batch (like Stop & hang-up does for a single call).
app.post("/api/zones/:id/call-now", async (c) => {
  const zoneId = Number(c.req.param("id"));
  const res = await callZone(zoneId);
  zoneCallSids.set(zoneId, res.callSids ?? []);
  setTimeout(() => zoneCallSids.delete(zoneId), 15 * 60 * 1000); // calls are long done by then
  return c.json({ placed: res.placed });
});
// Cancel an in-progress zone call: hang up every Twilio call we placed for it.
app.post("/api/zones/:id/hangup", async (c) => {
  const zoneId = Number(c.req.param("id"));
  const sids = zoneCallSids.get(zoneId) ?? [];
  await Promise.all(sids.map((s) => hangupTwilioCall(s)));
  zoneCallSids.delete(zoneId);
  return c.json({ ok: true, cancelled: sids.length });
});
// Credit feasibility for a zone (one credit/store) — the user-facing zone caller must check this
// up front so nobody starts a zone they can't finish. (Wired + ready; user firing stays gated off.)
app.get("/api/zones/:id/quote", async (c) => c.json(await zoneQuote(Number(c.req.param("id")))));
// The stores a zone will dial — names for the pre-call warning so the operator sees exactly who gets called.
app.get("/api/zones/:id/stores", async (c) => {
  const links = await db.select().from(zoneRetailers).where(eq(zoneRetailers.zoneId, Number(c.req.param("id"))));
  const ids = links.map((l) => l.retailerId);
  if (!ids.length) return c.json([]);
  return c.json(await db.select({ id: retailers.id, name: retailers.name }).from(retailers).where(inArray(retailers.id, ids)));
});

// ---- Schedules ----
app.get("/api/schedules", async (c) => c.json(await db.select().from(schedules)));
app.post("/api/schedules", async (c) => {
  const [row] = await db.insert(schedules).values(await c.req.json()).returning();
  return c.json(row, 201);
});
app.patch("/api/schedules/:id", async (c) => {
  const [row] = await db.update(schedules).set(await c.req.json()).where(eq(schedules.id, Number(c.req.param("id")))).returning();
  return c.json(row);
});
app.post("/api/schedules/:id/targets", async (c) => {
  const { retailerId } = await c.req.json();
  const [row] = await db.insert(scheduleTargets).values({ scheduleId: Number(c.req.param("id")), retailerId }).returning();
  return c.json(row, 201);
});

// ---- Results ----
app.get("/api/results", async (c) => {
  // Paginated + lean: return only the page's rows, and look up only the retailers/chains those rows
  // reference. (The old version pulled ALL ~100k retailers on every call — that was the slow part.)
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 10), 1), 200);
  const offset = Math.max(Number(c.req.query("offset") || 0), 0);
  const rows = await db.select().from(callResults).orderBy(desc(callResults.startedAt)).limit(limit).offset(offset);
  const total = Number((await db.select({ n: sql<number>`count(*)` }).from(callResults))[0]?.n || 0);
  const rids = [...new Set(rows.map((r) => r.retailerId).filter((x): x is number => !!x))];
  const rMap = new Map((rids.length ? await db.select().from(retailers).where(inArray(retailers.id, rids)) : []).map((r) => [r.id, r]));
  const names = new Map((await db.select().from(chains)).map((x) => [x.id, x.name]));
  const cMap = new Map((await db.select().from(categories)).map((x) => [x.id, x.label]));
  return c.json({ total, offset, limit, rows: rows.map((r) => {
    const ret = rMap.get(r.retailerId);
    // Same chain-logo resolution as every other surface, so the Calls feed shows the store's mark.
    const l = chainLogoInfo(ret ? ((ret.chainId && names.get(ret.chainId)) || ret.name.split(/—|–| - /)[0]) : null);
    return { ...r, retailer: ret?.name, category: cMap.get(r.categoryId), logoUrl: l.url, logoWide: l.wide, logoDark: l.dark };
  }) });
});

// ---- Actions ----
app.post("/api/call-now", async (c) => {
  const b = await c.req.json();
  try {
    // An admin-placed check IS the owner placing it. Attribute it to the master website account so it
    // lands in their checks history (and the in-stock banner) exactly like a website call, kept private
    // so it doesn't post to the public finds feed. force = skip the 24h dedup — the owner taps "check
    // again" deliberately and expects a real call every time. (triggerCall throws store_closed for a
    // closed store, which the handler surfaces as {error} below.)
    const finderUserId = b.finderUserId ?? ("phone:" + (process.env.OWNER_PHONE || "+13106662331"));
    // Cheap lane when flagged (bridgeCheckCall falls back to the direct path for carry/overrides).
    const place = (await getPolicy()).flags.cheapBridgeAll ? bridgeCheckCall : triggerCall;
    return c.json(await place({ isPrivate: true, ...b, finderUserId, force: true }));
  } catch (e) {
    return c.json({ error: String((e as Error)?.message || e) }, 400);
  }
});
// Admin "Stop & hang up" for a direct (non-bridge) call placed from Store Search. End the Twilio leg
// and stamp the row admin_hangup (confirmed=null) so it's never mislabeled "nobody answered" — mirrors
// /pub/bridge-hangup for the call-now path.
app.post("/api/hangup", async (c) => {
  const { cid, callSid } = await c.req.json().catch(() => ({}));
  if (callSid) await hangupTwilioCall(callSid);
  if (cid) {
    await db.update(callResults)
      .set({ status: "admin_hangup", statusKey: "admin_hangup", confirmed: null, completedAt: Math.floor(Date.now() / 1000) })
      // Mark the cancel UNLESS a real verdict already landed ('completed') — so an admin cancel during
      // ringing isn't left as "Nobody answered" if it rang out before the stamp.
      .where(and(eq(callResults.providerCallId, cid), sql`coalesce(${callResults.status},'') != 'completed'`))
      .catch((e) => console.error("admin_hangup stamp:", e));
  }
  return c.json({ ok: true });
});
// Labs: call any number with a chosen agent (restock | carry | open).
app.post("/api/talk", async (c) => {
  const { phone, mode, personality, name, voiceId } = await c.req.json();
  if (!phone) return c.json({ error: "phone required" }, 400);
  return c.json(await placeAdHocCall(phone, mode ?? "open", personality ?? "professional", name ?? "", voiceId || undefined));
});
// Labs simulator: call YOUR number as if you're a store; result records against that store (so it can flip green).
app.post("/api/simulate", async (c) => {
  const { retailerId, categoryId, mode, toNumber, specificProduct } = await c.req.json();
  if (!retailerId || !categoryId || !toNumber) return c.json({ error: "retailerId, categoryId, toNumber required" }, 400);
  return c.json(await triggerCall({ retailerId, categoryId, mode, toOverride: toNumber, specificProduct }));
});

// Voice tuning — the owner's controls for opener, cadence (speed), and warmth (stability).
// ---- Voice studio (admin): list / select / clone ElevenLabs voices ----
app.get("/api/voices", async (c) => { try { return c.json(await listVoices()); } catch (e) { return c.json({ error: String(e) }, 400); } });
app.post("/api/voices/active", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.voiceId) return c.json({ error: "voiceId required" }, 400);
  try { return c.json(await setActiveVoice(String(b.voiceId))); } catch (e) { return c.json({ error: String(e) }, 400); }
});
app.post("/api/voices/clone", async (c) => {
  try {
    const form = await c.req.formData();
    const name = String(form.get("name") || "").trim();
    if (!name) return c.json({ error: "name required" }, 400);
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) return c.json({ error: "no audio file" }, 400);
    return c.json(await cloneVoice(name, files));
  } catch (e) { return c.json({ error: String(e) }, 400); }
});
app.get("/api/voice-tuning", async (c) => c.json(await getVoiceTuning()));
app.patch("/api/voice-tuning", async (c) => {
  try {
    const b = await c.req.json();
    return c.json(await applyVoiceTuning(b));
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});
// Test Bench: draft voice tuning on the bench agent (a clone of the live restock agent).
// Drafts never touch store calls; "apply-to-stores" is the deliberate go-live.
app.get("/api/sandbox-tuning", async (c) => {
  try { return c.json(await getSandboxTuning()); } catch (e) { return c.json({ error: String(e) }, 400); }
});
app.patch("/api/sandbox-tuning", async (c) => {
  try { return c.json(await applySandboxTuning(await c.req.json())); } catch (e) { return c.json({ error: String(e) }, 400); }
});
app.post("/api/sandbox-tuning/apply-to-stores", async (c) => {
  try { return c.json(await applySandboxToStores()); } catch (e) { return c.json({ error: String(e) }, 400); }
});
// The LIVE store voice — powers the "Live now" strip so the owner always sees current state.
app.get("/api/voice/live", async (c) => {
  try { return c.json(await getLiveVoice()); } catch (e) { return c.json({ error: String(e) }, 400); }
});
// Test Bench self-call: bench agent (live brain + draft voice) calls YOUR phone with the
// chosen store's full context; result records against the store like the old simulator.
app.post("/api/bench/call", async (c) => {
  const b = await c.req.json();
  if (!b.retailerId || !b.categoryId || !b.toNumber) return c.json({ error: "retailerId, categoryId, toNumber required" }, 400);
  try { return c.json(await benchTestCall(b)); } catch (e) { return c.json({ error: String(e) }, 400); }
});

// ---- Statuses registry: the single source of truth for customer-facing verdicts ----
app.get("/pub/statuses", async (c) => c.json(await db.select().from(statuses).orderBy(statuses.sort)));
app.get("/api/statuses", async (c) => c.json((await db.select().from(statuses).orderBy(statuses.sort)).map((s) => (s.key === "in_stock" ? { ...s, color: "#4ADE80" } : s)))); // In-stock is locked to the brand green (the logo)
app.post("/api/statuses", async (c) => {
  const b = await c.req.json();
  if (!b.key || !b.label) return c.json({ error: "key and label required" }, 400);
  const [row] = await db.insert(statuses).values({
    key: String(b.key).trim().toLowerCase().replace(/\s+/g, "_"),
    emoji: b.emoji || "•", label: b.label, tone: b.tone || "unk",
    color: b.color || "#9CA3AF", note: b.note || null, sort: Number(b.sort ?? 999),
  }).returning();
  return c.json(row, 201);
});
app.patch("/api/statuses/:id", async (c) => {
  const b = await c.req.json();
  const patch: Record<string, unknown> = {};
  for (const k of ["emoji", "label", "tone", "color", "note", "sort"]) if (b[k] !== undefined) patch[k] = b[k];
  // "In stock" is locked to the brand green — it must always equal the logo exactly (#4ADE80).
  const cur = (await db.select({ key: statuses.key }).from(statuses).where(eq(statuses.id, Number(c.req.param("id")))))[0];
  if (cur?.key === "in_stock") patch.color = "#4ADE80";
  const [row] = await db.update(statuses).set(patch).where(eq(statuses.id, Number(c.req.param("id")))).returning();
  return c.json(row);
});
app.delete("/api/statuses/:id", async (c) => {
  await db.delete(statuses).where(eq(statuses.id, Number(c.req.param("id"))));
  return c.json({ ok: true });
});

// Script library — save/load/delete named tuning profiles (opener + sliders + LLM).
app.get("/api/voice-presets", async (c) => c.json(await listPresets()));
app.post("/api/voice-presets", async (c) => {
  try { return c.json(await savePreset(await c.req.json())); } catch (e) { return c.json({ error: String(e) }, 400); }
});
app.post("/api/voice-presets/apply", async (c) => {
  try { return c.json(await applyPreset((await c.req.json()).name)); } catch (e) { return c.json({ error: String(e) }, 400); }
});
app.delete("/api/voice-presets", async (c) => {
  try { return c.json(await deletePreset((await c.req.json()).name)); } catch (e) { return c.json({ error: String(e) }, 400); }
});

// Fetch a call's transcript by conversation id (for reading test-call transcripts in Labs).
app.get("/api/conversation/:cid", async (c) => {
  const o = await provider.getConversation(c.req.param("cid"));
  return c.json(o ?? { status: "in_progress", transcript: "", summary: "" });
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
    if (["completed", "busy", "failed", "no-answer", "canceled"].includes(status)) {
      setTimeout(() => roomCallProgress.delete(room), 60_000);
      // Headless bridge calls (schedules/zones/admin call-now) registered a finalizer so a call
      // that ended without reaching a human still lands a terminal callResults row.
      const fin = roomFinalizers.get(room);
      if (fin) { roomFinalizers.delete(room); try { fin(status); } catch (e) { console.error("bridge finalizer:", e); } }
    }
  }
  return c.body(null, 204);
});
const zoneCallSids = new Map<number, string[]>(); // zoneId -> Twilio callSids placed, for "Cancel zone"
/** Hang up a live Twilio call (POST Status=completed). Shared by the single + zone cancel paths. */
async function hangupTwilioCall(callSid: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok || !callSid) return;
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: "Status=completed",
  }).catch(() => {});
}
// End the live bridged call (user pressed "Stop & hang up").
app.post("/pub/bridge-hangup", async (c) => {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  const { room } = await c.req.json();
  const callSid = roomCallSids.get(room);
  // Master Stop & hang-up = WE ended it, not the store. Stamp the call as a non-result ('admin_hangup',
  // confirmed=null) so it's never mislabeled "nobody answered". Because this status is NOT in the
  // ingest pending set (dialing/in_progress/queued), the verdict + charge path skips it automatically.
  // statusKey drives the display pill (verdictKey reads statusKey first), so set both.
  const convId = bridgeConversationId(room);
  if (convId) {
    await db.update(callResults)
      .set({ status: "admin_hangup", statusKey: "admin_hangup", confirmed: null, completedAt: Math.floor(Date.now() / 1000) })
      .where(and(eq(callResults.providerCallId, convId),
        inArray(callResults.status, ["dialing", "in_progress", "queued"])))
      .catch((e) => console.error("admin_hangup stamp:", e));
  }
  if (sid && tok && callSid) {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
      body: "Status=completed",
    }).catch(() => {});
  }
  return c.json({ ok: true });
});
// Resolve a store + category, then place a bridge call to it. Used by Runnr "Listen live".
async function bridgeStoreCall(retailerId: number, categoryIds: number[], specificProduct?: string, finder?: { userId?: string; isPrivate?: boolean }, kioskMode?: boolean): Promise<{ room?: string; error?: string }> {
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
      const r = await triggerCall({ retailerId, categoryId: primary, mode: "restock", specificProduct, finderUserId: finder?.userId ?? undefined, isPrivate: finder?.isPrivate ?? false, kioskMode });
      if (r.providerCallId) return { room: r.providerCallId };
      return { error: "delta call did not start" };
    }
  } catch (e) { return { error: String((e as Error)?.message || e) }; }
  // Resolve the SAME three-tier vars (global + chain + store phone tree, clarification, etc.) the
  // scheduled calls use — Listen-live was previously running on the bare global prompt only.
  const v = await buildRestockVars(retailerId, primary, specificProduct, extras, kioskMode);
  if (!v || !v.retailer.phone) return { error: "store not found" };
  // Phone-first: dial AS the finder's own VERIFIED number (caller_id) when present. Plus the hard
  // duration cap from policy (the cost guarantee).
  const pol = await getPolicy();
  let from: string | undefined;
  if (finder?.userId) {
    const acct = (await db.select().from(accounts).where(eq(accounts.clerkUserId, finder.userId)))[0];
    if (acct?.callerId) from = acct.callerId; // only set after Twilio caller-ID verification
  }
  // FIRST-WORD CAPTURE without losing the live view (owner 07-18). Everything runs through the bridge
  // (keeps the live transcript relay AND live-listen). The clip was connect-on-human: on a store with
  // NO menu, waiting to VAD-detect a human before the agent joins buys nothing — the detected greeting
  // is consumed by detection instead of reaching the agent, so "This is Bob" is lost. For DIRECT stores
  // we instead connect the agent AT ANSWER (connectOnHuman:false): Twilio's <Connect><Stream> only
  // starts at pickup, so there's no ringing waste, and the bridge buffers inbound frames during the
  // ~200-500ms EL handshake and replays them the instant the agent is ready — so the opening words are
  // captured, not clipped. Menu/tree stores KEEP connect-on-human (it saves the real nav time).
  const isDirect = !v.dtmf && !v.say && !v.connectAtSec &&
    (() => { const t = (v.dynamicVars.phone_tree || "").trim(); return !t || /answers? directly|no (phone )?menu|no ivr|straight to a person/i.test(t); })();
  // Log the call once it connects (we get the ElevenLabs conversation id): insert the PRIMARY result
  // row; ingest fans out each extra line into its own row from the per-category extraction.
  return placeBridgeCall(v.retailer.phone, v.dynamicVars, (convId) => {
    db.insert(callResults).values({ retailerId, categoryId: primary, mode: "restock", status: "in_progress", providerCallId: convId, finderUserId: finder?.userId ?? null, isPrivate: finder?.isPrivate ?? false })
      .catch((e) => console.error("bridge call log insert:", e));
    // Per-store talk cap (chains.maxTalkSeconds) wins over the global bail ceiling when set, so a
    // store the owner marked "wrap fast" gets a tighter Twilio TimeLimit — the cost guarantee.
  }, v.dtmf, { from, timeLimitSec: v.maxTalk ?? pol.bail.maxCallSeconds, say: v.say, connectAtSec: v.connectAtSec ?? undefined, connectOnHuman: isDirect ? false : undefined, voiceId: v.voiceId, voiceTuning: v.voiceTuning });
}
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
app.get("/pub/bridge-debug", (c) => c.json({ log: bridgeDebug() }));
// Live-view FLIGHT RECORDER (owner 07-17): the transcript freeze only reproduces on the owner's
// phone — no theory survives remote testing. The page posts its own play-by-play (ws state, poll
// responses, cid resolution, errors) so the next frozen call tells us exactly what the phone saw.
const lvTraces: { at: number; ua: string; lines: string[] }[] = [];
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
      // Consensus second read — keep the webhook verdict + billing identical to the poller (ingestPending):
      // two non-conflicting reads → a hard verdict (charge); conflict/ambiguity → "no clear answer", no charge.
      let confirmed = o.confirmed, statusKey = o.statusKey;
      let definitive = o.confirmed === true || o.confirmed === false;
      let productDetail: string | null = null;
      let restockDayHeard: string | null = null;
      if (o.status === "completed") {
        const label = row ? (await db.select({ label: categories.label }).from(categories).where(eq(categories.id, row.categoryId)))[0]?.label : undefined;
        // Verdict-deciding second read only when EL was unclear; on a confirmed YES it still runs for
        // EXTRACTION ONLY (set + product form), which decisive calls used to drop (owner 07-10 call 8).
        const needSecond = o.confirmed === null && !o.soldOut && !o.doesNotSell;
        const second = (needSecond || o.confirmed === true) ? await classifyVerdict(o.transcript, label || "the product") : null;
        const consensus = reconcile({ confirmed: o.confirmed, soldOut: o.soldOut, doesNotSell: o.doesNotSell, statusKey: o.statusKey }, needSecond ? second : null);
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
      // Server-side billing: charge the finder once on a definitive answer (idempotent — the poller
      // may also try; charged_at guarantees exactly one charge across both paths).
      if (row?.finderUserId && o.status === "completed" && definitive) {
        await chargeCallOnce(o.callId, row.finderUserId);
      }
    }
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 400);
  }
});

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
const relayLine = (room: string, role: string, text: string) => {
  const set = rooms.get(room);
  bridgeLog(`relayLine ${role}: ${String(text).slice(0, 32)} listeners=${set ? set.size : 0}`); // diagnose live-transcript delivery
  if (!set) return;
  const msg = JSON.stringify({ line: { role, text } });
  for (const ws of set) if (ws.readyState === 1) ws.send(msg);
};
// Tell browser listeners the moment the bridge tears down (agent/clerk hung up) so the UI flips to
// the result instantly instead of waiting on the next poll + ElevenLabs status lag.
const relayEnd = (room: string) => {
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

// Full agent bridge: Twilio call audio <-> ElevenLabs ConvAI WS, forked to browser listeners.
wssBridge.on("connection", (ws: WebSocket, _req: unknown, room: string) => {
  handleTwilioBridge(ws, room, fanout, relayLine, relayEnd); // fanout(audio) + relayLine(live transcript) + relayEnd(call-over) — bridge passes its resolved room
});
wssListen.on("connection", (ws: WebSocket, _req: unknown, room: string) => { if (room) addListener(room, ws); else bridgeLog("listen socket connected with NO room — audio cannot be routed"); });
wssTwilio.on("connection", (ws: WebSocket, _req: unknown, qRoom: string) => {
  let room = qRoom || "";
  ws.on("message", (data: Buffer) => {
    let m: { event?: string; start?: { customParameters?: { room?: string }; streamSid?: string }; media?: { payload?: string; track?: string } };
    try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.event === "start") room = m.start?.customParameters?.room || room || m.start?.streamSid || "";
    else if (m.event === "media" && m.media?.payload && room) fanout(room, m.media.payload, m.media.track || "inbound");
  });
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
setInterval(() => withLock("check-queue", 2, () => drainCheckQueue(triggerCall, bridgeCheckCall)).catch((e) => console.error("check-queue:", e)), 1_000); // waiting-screen: place queued checks as slots free (inert unless the governor is on)
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
