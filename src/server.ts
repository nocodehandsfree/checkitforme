// Voice Caller server — REST API for the dashboard, the ElevenLabs post-call
// webhook, a result poller, and the schedule ticker. Runs locally (Node) and
// deploys to Railway/Cloudflare unchanged.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { WebSocketServer, type WebSocket } from "ws";
import { and, desc, eq, gte, inArray, isNull, like, lte, or, sql } from "drizzle-orm";
import { db } from "./db/client";
import {
  callResults, categories, chains, communityPosts, discordChannels, kiosks, kioskReceipts, kioskReports, leads, products, retailers, schedules, scheduleTargets, statuses, storeRequests, waitlist, watches, zones, zoneRetailers,
} from "./db/schema";
import { config } from "./config";
import { bootstrap } from "./db/bootstrap";
import { allSettings, getSetting, setSetting } from "./db/settings";
import { importZonesData, geocodeMissing } from "./db/import-data";
import { applyPreset, applySandboxToStores, applySandboxTuning, applyVoiceTuning, backfillHours, benchTestCall, buildRestockVars, callZone, cloneVoice, deletePreset, getCreditStatus, getLiveVoice, getSandboxTuning, getVoiceTuning, ingestPending, listPresets, listVoices, placeAdHocCall, previewStorePrompt, provider, refreshHours, retailersWithStatus, savePreset, schedulerTick, setActiveVoice, storeOpenInfo, triggerCall, zoneQuote } from "./calls/service";
import { openState } from "./store-hours";
import { resolveBrand, brandSwitcher } from "./brands";
import { getPolicy, setPolicy, publicPolicy } from "./policy";
import { importStores, backfillRegions } from "./stores-import";
import { runAdminAgent, AGENT_MODELS } from "./agent/admin-agent";
import { harvestHoursTick } from "./hours-harvest";
import { createSchedule, listSchedulesDetailed, deleteSchedule, customerScheduleTick } from "./customer-schedules";
import { cachedCategories, cachedChains, cachedRetailers, categoryLabelMap, retailerMap, invalidateRefCache } from "./refcache";
import { haversineMi, bboxAround } from "./geo";
import { ingestSignals, recentStockNear, latestForRetailer } from "./stock/signals";
import { seedStockCheckIntel } from "./stock/intel";
import { r2Config, presignPut, photoKey } from "./r2";
import { check as rlCheck, clientIp, LIMITS } from "./ratelimit";
import { isGmailConfigured, gmailReceiptTick } from "./gmail-receipts";
import { rankBets } from "./best-bet";
import { referralStatus, claimReferral } from "./referrals";

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
import { getAccount, chargeOneCredit, createCheckout, verifyStripeSig, handleStripeEvent, isComp, grantCredits, SUB, PACKS } from "./billing";
import { accounts } from "./db/schema";
import { handleTwilioBridge, setBridgeContext, bridgeConversationId, bridgeDebug, bridgeLog, takeBridgeDtmf } from "./voice/bridge";

await bootstrap(); // apply migrations + seed catalog if empty

const here = dirname(fileURLToPath(import.meta.url));
const app = new Hono();

// ---- Auth (Clerk) — gate the API on a valid Clerk session when enforced ----
// The Clerk session JWT's issuer is the frontend API, derived from the publishable key.
function clerkIssuer(pk: string): string | null {
  try {
    const host = Buffer.from(pk.split("_")[2], "base64").toString("utf8").replace(/\$+$/, "");
    return host ? `https://${host}` : null;
  } catch { return null; }
}
const issuer = clerkIssuer(config.clerk.publishableKey);
const JWKS = issuer ? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) : null;

app.use("/api/*", async (c, next) => {
  if (!config.clerk.enforce || !issuer || !JWKS) return next(); // auth disabled
  if (c.req.path === "/api/health") return next();
  // Admin key bypass for server-to-server store/zone management.
  if (config.adminToken && c.req.header("x-admin-token") === config.adminToken) return next();
  const authz = c.req.header("authorization") ?? "";
  const tok = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!tok) return c.json({ error: "unauthorized" }, 401);
  try {
    const { payload } = await jwtVerify(tok, JWKS, { issuer });
    const allow = config.clerk.allowedUserIds;
    if (allow.length && !allow.includes(String(payload.sub))) return c.json({ error: "forbidden" }, 403);
    return next();
  } catch { return c.json({ error: "unauthorized" }, 401); }
});

// Verify a Clerk session token from any signed-in user (Runnr customers, not just the owner allowlist).
async function verifyClerkToken(authHeader: string | undefined): Promise<{ id: string; email?: string } | null> {
  if (!JWKS || !issuer) return null;
  const tok = (authHeader || "").startsWith("Bearer ") ? (authHeader as string).slice(7) : "";
  if (!tok) return null;
  try {
    const { payload } = await jwtVerify(tok, JWKS, { issuer });
    return { id: String(payload.sub), email: payload.email as string | undefined };
  } catch { return null; }
}
// The Clerk session token usually omits email, so comp/owner detection can't rely on it. This fetches
// the user's VERIFIED primary email straight from Clerk by id (server-side, can't be spoofed by the
// client) and caches it — the authoritative source for "is this a comp account".
const clerkEmailCache = new Map<string, { t: number; e: string }>();
async function clerkPrimaryEmail(id: string): Promise<string | undefined> {
  const hit = clerkEmailCache.get(id);
  if (hit && Date.now() - hit.t < 300_000) return hit.e || undefined;
  const sk = process.env.CLERK_SECRET_KEY;
  if (!sk || !id) return undefined;
  try {
    const r = await fetch(`https://api.clerk.com/v1/users/${id}`, { headers: { Authorization: `Bearer ${sk}` } });
    if (!r.ok) return undefined;
    const d = (await r.json()) as { primary_email_address_id?: string; email_addresses?: { id: string; email_address: string }[] };
    const list = d.email_addresses || [];
    const e = (list.find((x) => x.id === d.primary_email_address_id) || list[0])?.email_address;
    if (e) clerkEmailCache.set(id, { t: Date.now(), e });
    return e;
  } catch { return undefined; }
}

// ---- Pages ----
// Operator dashboard at caller.* ; consumer "pay-per-check" app at runner.* (or /r preview).
const page = (file: string) =>
  readFileSync(join(here, `../public/${file}`), "utf8")
    .replace(/__CLERK_PUBLISHABLE_KEY__/g, config.clerk.publishableKey)
    .replace(/__CLERK_FRONTEND_API__/g, clerkFrontendApi(config.clerk.publishableKey));

// The publishable key base64-encodes the frontend-API domain ("<domain>$"), so the Clerk JS
// script URL always matches whichever application/instance the env key points at.
function clerkFrontendApi(pk: string): string {
  try {
    const b64 = pk.replace(/^pk_(test|live)_/, "");
    return Buffer.from(b64, "base64").toString("utf8").replace(/\$$/, "");
  } catch { return "summary-hen-61.clerk.accounts.dev"; }
}
const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

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

/** Render the consumer page branded for a vertical micro-site (resolved from the subdomain). */
function renderRunner(brand: ReturnType<typeof resolveBrand>, host: string): string {
  const canonical = `https://${host}/`;
  const plainName = brand.name.replace(/<[^>]+>/g, "");
  const ogImage = `https://${host}/og/${brand.key}.png`;
  const head = [
    `<title>${esc(brand.title)}</title>`,
    `<meta name="description" content="${esc(brand.desc)}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta name="robots" content="index,follow,max-image-preview:large">`,
    `<meta name="theme-color" content="${brand.accent}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(plainName)}">`,
    `<meta property="og:title" content="${esc(brand.title)}">`,
    `<meta property="og:description" content="${esc(brand.desc)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${ogImage}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(brand.title)}">`,
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
  return page("runner.html")
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
function renderShare(brand: ReturnType<typeof resolveBrand>, host: string, q: Record<string, string>): string {
  const inStock = (q.v || "in") === "in";
  const store = (q.store || "a local store").slice(0, 80);
  const cat = (q.cat || brand.category || "cards").slice(0, 60);
  const plainName = brand.name.replace(/<[^>]+>/g, "");
  const ogImage = `https://${host}/og/${brand.key}.png`;
  const site = `https://${host}/`;
  const title = inStock ? `🔥 ${store}: ${cat} IN STOCK` : `👀 ${store}: watching for ${cat}`;
  const desc = inStock
    ? `Confirmed by a real phone call. Check any store near you yourself with ${plainName} — they call so you don't have to.`
    : `Not in yet — but ${plainName} will catch the restock. Check any store near you with one tap.`;
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="robots" content="index,follow,max-image-preview:large">`,
    `<meta name="theme-color" content="${brand.accent}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(plainName)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="https://${host}/s?store=${encodeURIComponent(store)}&cat=${encodeURIComponent(cat)}&v=${inStock ? "in" : "out"}">`,
    `<meta property="og:image" content="${ogImage}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${ogImage}">`,
  ].join("\n");
  const accent = inStock ? "#4ADE80" : "#A78BFA";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">${head}
<style>
  *{box-sizing:border-box} body{margin:0;background:#0A0A0E;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}
  .wrap{max-width:440px;width:100%;text-align:center}
  .card{background:linear-gradient(170deg,#15151c,#0e0e14);border:1px solid #23232e;border-radius:22px;padding:30px 24px;box-shadow:0 24px 60px rgba(0,0,0,.5)}
  .brand{font-size:13px;font-weight:800;letter-spacing:.04em;color:${esc(brand.accent)};text-transform:uppercase;margin-bottom:18px}
  .badge{display:inline-block;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:${accent};background:${accent}1f;border:1px solid ${accent}55;padding:7px 13px;border-radius:999px;margin-bottom:16px}
  .big{font-size:27px;font-weight:900;line-height:1.18;margin:0 0 8px} .big .hl{color:${accent}}
  .store{color:#b9b9c8;font-size:15px;margin-bottom:22px}
  .cta{display:block;background:${esc(brand.accent)};color:#06210f;text-decoration:none;font-weight:900;font-size:16px;padding:16px;border-radius:14px;box-shadow:0 10px 26px ${esc(brand.accent)}40}
  .sub{color:#7a7a88;font-size:12.5px;margin-top:16px}
</style></head><body><div class="wrap"><div class="card">
  <div class="brand">${brand.emoji || "🎴"} ${esc(plainName)}</div>
  <div class="badge">${inStock ? "✅ In stock" : "🔔 On watch"}</div>
  <h1 class="big">${inStock ? `<span class="hl">${esc(cat)}</span> is in stock` : `Tracking <span class="hl">${esc(cat)}</span>`}</h1>
  <div class="store">at <b>${esc(store)}</b></div>
  <a class="cta" href="${site}">Check any store near you →</a>
  <div class="sub">${esc(plainName)} calls the store live and texts you proof. Real human, real shelf truth.</div>
</div></div></body></html>`;
}
app.get("/s", (c) => {
  c.header("Cache-Control", "public, max-age=300");
  const host = (c.req.header("host") || "").toLowerCase();
  const brand = resolveBrand(host, c.req.query("brand"));
  const q = { store: c.req.query("store") || "", cat: c.req.query("cat") || "", v: c.req.query("v") || "in" };
  return c.html(renderShare(brand, host, q));
});

// Static content pages (about/contact/faq/terms/privacy) — branded, owner-editable via policy.pages.
const PAGE_TITLES: Record<string, string> = { about: "About", contact: "Contact", faq: "FAQ", terms: "Terms of Service", privacy: "Privacy Policy" };
app.get("/p/:slug", async (c) => {
  const slug = c.req.param("slug").toLowerCase();
  if (!(slug in PAGE_TITLES)) return c.notFound();
  c.header("Cache-Control", "public, max-age=120");
  const host = (c.req.header("host") || "").toLowerCase();
  const brand = resolveBrand(host, c.req.query("brand"));
  const pol = await getPolicy();
  const plain = brand.name.replace(/<[^>]+>/g, "");
  const discordUrl = pol.links.discord || pol.support.discord || "";
  const helpLine = (slug === "contact" || slug === "about")
    ? (discordUrl
        ? `<p>Need a hand? <a href="${esc(discordUrl)}" style="color:${brand.accent}">Join our Discord</a> — our AI support bot answers in seconds, any time.</p>`
        : `<p>Need a hand? Support lives in our Discord — our AI bot answers in seconds. Invite link coming soon.</p>`)
    : "";
  const body = (pol.pages as Record<string, string>)[slug]
    || `<p>This page is coming soon. We're putting it together — check back shortly.</p>${helpLine}`;
  // In-app sheet: the consumer page fetches the content instead of navigating away from the app.
  if (c.req.query("partial")) return c.json({ title: PAGE_TITLES[slug], body });
  return c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(PAGE_TITLES[slug])} — ${esc(plain)}</title><meta name="robots" content="index,follow">
<style>*{box-sizing:border-box}body{margin:0;background:#0A0A0E;color:#e9e9f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.65}
.wrap{max-width:680px;margin:0 auto;padding:28px 22px 80px}a.home{color:${brand.accent};text-decoration:none;font-weight:800;font-size:15px}
h1{font-size:30px;margin:26px 0 14px}.body{color:#c2c2cf;font-size:16px}.body a{color:${brand.accent}}.muted{color:#7a7a88;font-size:13px;margin-top:40px}</style></head>
<style>.fab{position:fixed;right:18px;bottom:22px;width:58px;height:58px;border-radius:50%;background:${brand.accent};color:#06210f;border:none;display:grid;place-items:center;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.5);z-index:60;text-decoration:none}</style>
<body><div class="wrap"><a class="home" href="/">← ${esc(plain)}</a><h1>${esc(PAGE_TITLES[slug])}</h1><div class="body">${body}</div>
<div class="muted">© ${new Date().getFullYear()} ${esc(plain)} · Powered by Fungibles</div></div>
<a class="fab" href="/" title="Back" aria-label="Back to ${esc(plain)}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M14.5 5L8 12l6.5 7" stroke="#06210f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
</body></html>`);
});

app.get("/", (c) => {
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  const host = (c.req.header("host") || "").toLowerCase();
  const override = c.req.query("brand");
  const brand = resolveBrand(host, override);
  // Admin (caller.*) keeps app.html; every other host is a consumer micro-site (branded by subdomain).
  const consumer = host.startsWith("runner.") || brand.key !== "runner" || !!override;
  return c.html(consumer ? renderRunner(brand, host) : page("app.html"));
});
app.get("/r", (c) => { c.header("Cache-Control", "no-store"); return c.html(renderRunner(resolveBrand((c.req.header("host") || "").toLowerCase(), c.req.query("brand")), (c.req.header("host") || "").toLowerCase())); });
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
const RAILWAY_HOST = "voice-caller-production-2d6b.up.railway.app";
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
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${play}<Connect><Stream url="wss://${RAILWAY_HOST}/bridge?room=${room}"><Parameter name="room" value="${room}" /></Stream></Connect></Response>`;
  return c.body(xml, 200, { "Content-Type": "text/xml" });
});

// ---- Health ----
app.get("/api/health", (c) => c.json({ ok: true }));

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
  chainLogoCache = { t: Date.now(), v };
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
  // Fuzzy pass: "Franklin's Ace Hardware" matches ace_hardware.png, "Trudy's Hallmark" → hallmark.png.
  const hay = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  for (const f of files) {
    const stem = f.replace(/\.(png|webp|svg)$/i, "").replace(/_/g, " ");
    if (stem.length > 3 && hay.includes(` ${stem} `)) return f;
  }
  return null;
}
function chainLogoInfo(name: string | null | undefined): { url: string | null; wide: boolean; dark: boolean } {
  const f = chainLogoFile(name);
  if (!f) return { url: null, wide: false, dark: false };
  const m = logoMeta()[f] || { w: 0, d: 0 };
  return { url: `/logos/chains/${f}?v=8`, wide: m.w === 1, dark: m.d === 1 };
}
// Owner preview: every chain logo rendered EXACTLY as the store list renders it (same tile,
// plate + wide handling from _meta.json) at real size and 2x — judge phone clarity without
// driving anywhere. (No auth needed; it leaks nothing but public logos.)
app.get("/logo-wall", (c) => {
  const files = [...chainLogoFiles()].sort();
  const meta = logoMeta();
  const tile = (f: string) => {
    const m = meta[f] || { w: 0, d: 0 };
    const plate = m.d === 1 ? "background:#f2f2f5;border-color:rgba(255,255,255,.28)" : "";
    const big = m.w === 1 ? "width:60px;height:auto;max-height:34px" : "max-width:52px;max-height:40px";
    const real = m.w === 1 ? "width:32px;height:auto;max-height:20px" : "width:24px;height:24px";
    return `<div style="width:88px"><div style="width:72px;height:72px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);display:grid;place-items:center;margin:0 auto;${plate}"><img src="/logos/chains/${f}?v=8" style="object-fit:contain;${big}"></div>
    <div style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.06);display:grid;place-items:center;margin:7px auto 0;${plate}"><img src="/logos/chains/${f}?v=8" style="object-fit:contain;${real}"></div>
    <div style="font-size:9px;color:#8a8a98;text-align:center;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.replace(/\.(png|webp|svg)$/i, "")}</div></div>`;
  };
  return c.html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#0C0C12;font-family:-apple-system,sans-serif;color:#fff;padding:20px">
  <h2 style="font-weight:900;margin:0 0 4px">Logo wall · ${files.length} marks</h2>
  <div style="color:#9a9aac;font-size:12px;margin-bottom:16px">Top = detail (2x) · bottom = exact store-list size. Dark ink lifted to grey; plates only where _meta says dark.</div>
  <div style="display:flex;flex-wrap:wrap;gap:12px">${files.map(tile).join("")}</div></body>`);
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

app.get("/pub/stores", async (c) => {
  const rs = await cachedRetailers();
  const chainRows = await db.select().from(chains);
  const types = new Map(chainRows.map((x) => [x.id, x.type]));
  const names = new Map(chainRows.map((x) => [x.id, x.name]));
  // Muted chains (owner toggle, incl. repack-only stores like Fairfield) never reach consumers.
  const mutedChains = new Set(chainRows.filter((x) => x.muted === true).map((x) => x.id));
  // This endpoint is now the ADMIN logo map (app.html loadLogos builds id→logoUrl from it); the
  // consumer front-end uses /pub/stores/near. So it must return EVERY store — the old 1,000-row
  // cap silently broke admin logos once the 100k national import landed — and it skips the per-row
  // openState computation (nothing reads it here) so it stays fast across 100k rows.
  return c.json(rs
    .filter((r) => r.phone && r.active !== false)
    .filter((r) => !(r.chainId && mutedChains.has(r.chainId)))
    .map((r) => ({ id: r.id, name: r.name, location: r.location, storeType: (r.chainId && types.get(r.chainId)) || "Other",
      ...((l)=>({ logoUrl: l.url, logoWide: l.wide, logoDark: l.dark }))(chainLogoInfo((r.chainId && names.get(r.chainId)) || r.name.split(/—|–| - /)[0])),
      carries: (r.carries ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      lat: r.lat, lng: r.lng, region: r.region, state: r.state, shipmentDay: r.shipmentDay || null,
      sellsPacks: r.sellsPacks !== false, hasKiosk: r.hasKiosk === true })));
});

// ---- Geo-paginated store list — THE consumer path at 100k-store scale ----
// /pub/stores ships every row (fine at ~100 stores, a page-killer at 102k). This endpoint returns
// only stores near the user: the bounding box rides the retailers(lat,lng) index, distance sorts,
// and pages. Falls back to ?state= or ?q= (SQL-side) when the visitor hasn't shared location.
app.get("/pub/stores/near", async (c) => {
  const lat = Number(c.req.query("lat")), lng = Number(c.req.query("lng"));
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
  const state = (c.req.query("state") || "").trim().toUpperCase();
  const q = (c.req.query("q") || "").trim().toLowerCase();
  if (!hasLoc && !state && !q) return c.json({ error: "lat+lng (or state / q) required" }, 400);
  const radius = Math.min(Math.max(Number(c.req.query("radius") || 25), 1), 150);
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 60), 1), 200);
  const offset = Math.max(Number(c.req.query("offset") || 0), 0);
  const mode = c.req.query("mode") || ""; // call | kiosk | site | "" = all

  const chainRows = await cachedChains();
  const types = new Map(chainRows.map((x) => [x.id, x.type]));
  const names = new Map(chainRows.map((x) => [x.id, x.name]));
  const stockMethod = new Map(chainRows.map((x) => [x.id, x.stockCheckMethod]));
  const mutedChains = new Set(chainRows.filter((x) => x.muted === true).map((x) => x.id));

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
    const pat = `%${q}%`;
    rows = await db.select().from(retailers)
      .where(and(eq(retailers.active, true), or(like(retailers.name, pat), like(retailers.location, pat)))).limit(2000);
  }

  const callable = (r: typeof retailers.$inferSelect) => r.sellsPacks !== false && !!r.phone && !r.phone.startsWith("nophone:");
  const all = rows
    .filter((r) => !(r.chainId && mutedChains.has(r.chainId)))
    .filter((r) => !mode
      || (mode === "call" && callable(r))
      || (mode === "kiosk" && r.hasKiosk === true)
      || (mode === "site" && r.chainId != null && stockMethod.get(r.chainId) === "site"))
    .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.location || "").toLowerCase().includes(q))
    .map((r) => {
      const miles = hasLoc && r.lat != null && r.lng != null ? Math.round(haversineMi(lat, lng, r.lat, r.lng) * 10) / 10 : null;
      const chainName = (r.chainId && names.get(r.chainId)) || r.name.split(/—|–| - /)[0];
      return { id: r.id, name: r.name, location: r.location, storeType: (r.chainId && types.get(r.chainId)) || "Other",
        ...((l) => ({ logoUrl: l.url, logoWide: l.wide, logoDark: l.dark }))(chainLogoInfo(chainName)),
        carries: (r.carries ?? "").split(",").map((s) => s.trim()).filter(Boolean),
        lat: r.lat, lng: r.lng, region: r.region, state: r.state, shipmentDay: r.shipmentDay || null,
        sellsPacks: r.sellsPacks !== false, hasKiosk: r.hasKiosk === true,
        callable: callable(r),
        stockCheckMethod: (r.chainId && stockMethod.get(r.chainId)) || "call", // site = check their site, no call needed
        mapsUri: r.mapsUri || null,
        miles, openState: openState(r.hours, r.timezone) };
    })
    .filter((r) => !hasLoc || r.miles == null || r.miles <= radius)
    .sort((a, b) => (a.miles ?? 9e9) - (b.miles ?? 9e9) || a.name.localeCompare(b.name));
  return c.json({ total: all.length, offset, limit, stores: all.slice(offset, offset + limit) });
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
  return c.json(await ingestSignals(items));
});
// New intel revision landed in data/stock_check_intel.json → push it over already-classified
// chains (the boot seed only fills blanks). Deliberate owner action, hence force.
app.post("/api/stock/intel/reapply", async (c) => {
  const applied = await seedStockCheckIntel(true);
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
app.get("/pub/best-bet", async (c) => {
  const lat = Number(c.req.query("lat")), lng = Number(c.req.query("lng"));
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
  const categoryId = Number(c.req.query("categoryId") || 0);
  const radius = Number(c.req.query("radius") || 25);
  const cat = categoryId ? (await categoryLabelMap()).get(categoryId) : null;
  // Confirm history per store — filter in SQL (confirmed+completed) and pull only the columns we need,
  // so this public path never loads the whole call_results table (transcripts included) into memory.
  const confirmed = (await db.select({ retailerId: callResults.retailerId, categoryId: callResults.categoryId, completedAt: callResults.completedAt, startedAt: callResults.startedAt })
    .from(callResults).where(and(eq(callResults.confirmed, true), eq(callResults.status, "completed"))))
    .filter((r) => !categoryId || r.categoryId === categoryId);
  const byStore = new Map<number, { confirms: number; last: number }>();
  for (const r of confirmed) {
    const e = byStore.get(r.retailerId) || { confirms: 0, last: 0 };
    e.confirms++; const at = r.completedAt ?? r.startedAt; if (at > e.last) e.last = at;
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
  const cands = near
    .filter((r) => r.phone && r.active !== false)
    .filter((r) => openState(r.hours, r.timezone).open !== false) // open or unknown, never closed
    .filter((r) => !cat || !(r.carries) || r.carries.toLowerCase().includes(cat.toLowerCase()))
    .map((r) => {
      const miles = (hasLoc && r.lat != null && r.lng != null) ? haversineMi(lat, lng, r.lat, r.lng) : null;
      const hist = byStore.get(r.id);
      return { id: r.id, name: r.name.split("—")[0].trim(), miles, signals: {
        miles, todayDow: tzDow(r.timezone), shipmentDow: shipDow(r.shipmentDay),
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
  // Headstart: a paid finder's result stays off the public feed for headstartMin minutes.
  const cutoff = Date.now() - pol.finds.headstartMin * 60_000;
  const rows = (await db.select().from(callResults)
    .where(and(eq(callResults.confirmed, true), eq(callResults.status, "completed")))
    .orderBy(desc(callResults.completedAt)).limit(60))
    // Privacy: never surface a find marked private (subscriber perk / paid privacy).
    .filter((r) => r.isPrivate !== true)
    // Headstart: only after the finder's lead time has elapsed.
    .filter((r) => (r.completedAt ?? r.startedAt) <= cutoff)
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
  c.header("Cache-Control", "public, max-age=86400");
  return c.body(buf, 200, { "Content-Type": m[1] || "image/jpeg" });
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
    || (b.imageUrl.startsWith("data:image/") && b.imageUrl.length <= 500_000);
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
app.get("/api/policy", async (c) => c.json(await getPolicy()));
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

// ---- Store hours: backfill all (background) + refresh one ----
app.post("/api/hours/backfill", async (c) => c.json(await backfillHours()));
app.post("/api/hours/:id/refresh", async (c) => {
  const r = await refreshHours(Number(c.req.param("id")));
  return r ? c.json(r) : c.json({ error: "no address / lookup failed" }, 400);
});
// Anonymous FREE check (1 per device, client-tracked; bounded globally by the demo pool).
app.post("/pub/check", async (c) => {
  const b = await c.req.json();
  if ((await pubCredits()) <= 0) return c.json({ error: "no_credits" }, 402);
  const { retailerId, categoryId, specificProduct } = b;
  if (!retailerId || !categoryId) return c.json({ error: "retailerId and categoryId required" }, 400);
  const closed = await closedGate(Number(retailerId)); if (closed) return c.json(closed, 409);
  try {
    const r = await triggerCall({ retailerId, categoryId, mode: "restock", specificProduct });
    return c.json({ providerCallId: r.providerCallId, status: r.status });
  } catch (e) { return c.json({ error: String(e) }, 400); }
});
// Free check WITH live audio (bridged through our Twilio). Returns a room to listen on.
app.post("/pub/check-live", async (c) => {
  if ((await pubCredits()) <= 0) return c.json({ error: "no_credits" }, 402);
  const b = await c.req.json();
  const catIds = (Array.isArray(b.categoryIds) ? b.categoryIds : [b.categoryId]).map(Number).filter(Boolean);
  if (!b.retailerId || !catIds.length) return c.json({ error: "retailerId and categoryId(s) required" }, 400);
  const closed = await closedGate(Number(b.retailerId)); if (closed) return c.json(closed, 409);
  const r = await bridgeStoreCall(Number(b.retailerId), catIds, b.specificProduct);
  if (r.error) return c.json({ error: r.error }, 502);
  return c.json({ room: r.room, wsHost: RAILWAY_HOST });
});
app.get("/pub/result/:cid", async (c) => {
  const o = await provider.getConversation(c.req.param("cid"));
  return c.json(o ?? { status: "in_progress", transcript: "", summary: "" });
});
// Live, mid-call transcript: returns whatever the agent + clerk have said SO FAR (no audio needed).
app.get("/pub/live/:cid", async (c) => {
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${c.req.param("cid")}`, { headers: { "xi-api-key": config.voice.apiKey } });
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
app.post("/pub/translate", async (c) => {
  const { text, to } = await c.req.json();
  if (!text || !String(text).trim()) return c.json({ translated: "" });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return c.json({ error: "translation unavailable" }, 503);
  // Target language: English by default; Spanish when the UI is in Spanish mode.
  const lang = to === "es" ? "Spanish" : "English";
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
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
  // Verified email (token → Clerk API), never the client-passed one, decides comp/master.
  const verifiedEmail = u.email || await clerkPrimaryEmail(u.id);
  const a = await getAccount(u.id, verifiedEmail || c.req.query("email") || undefined);
  const comp = isComp(a?.email) || isComp(verifiedEmail);
  return c.json({
    credits: comp ? 9999 : (a?.credits ?? 0), subscription: comp ? "active" : (a?.subscription ?? "none"),
    comp, callsMade: a?.callsMade ?? 0, catalog: { sub: SUB, packs: PACKS },
  });
});
// Authenticated check — verifies the user has credits, places the call. Charged only on a real answer.
app.post("/app/check", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const { retailerId, categoryId, specificProduct } = await c.req.json();
  if (!retailerId || !categoryId) return c.json({ error: "retailerId and categoryId required" }, 400);
  const closed = await closedGate(Number(retailerId)); if (closed) return c.json(closed, 409);
  const a = await getAccount(u.id, u.email);
  if (!isComp(a?.email) && (!a || a.credits <= 0)) return c.json({ error: "no_credits" }, 402);
  try {
    const r = await triggerCall({ retailerId, categoryId, mode: "restock", specificProduct, finderUserId: u.id, isPrivate: await isFinderPrivate(a) });
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
  const closed = await closedGate(Number(b.retailerId)); if (closed) return c.json(closed, 409);
  const a = await getAccount(u.id, u.email);
  if (!isComp(a?.email) && (!a || a.credits <= 0)) return c.json({ error: "no_credits" }, 402);
  const r = await bridgeStoreCall(Number(b.retailerId), catIds, b.specificProduct, { userId: u.id, isPrivate: await isFinderPrivate(a) });
  if (r.error) return c.json({ error: r.error }, 502);
  return c.json({ room: r.room, wsHost: RAILWAY_HOST });
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
  if (!isComp(a?.email) && a?.subscription !== "active") return c.json({ error: "members_only" }, 402);
  const b = await c.req.json();
  if (!b.retailerId || !b.categoryId) return c.json({ error: "retailerId and categoryId required" }, 400);
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
  const email = (u.email || c.req.query("email") || "").toLowerCase();
  const ids = new Set<string>([u.id]);
  if (email) {
    for (const a of await db.select().from(accounts)) {
      if ((a.email || "").toLowerCase() === email) ids.add(a.clerkUserId);
    }
  }
  const stores = await retailerMap();
  const cats = await categoryLabelMap();
  const rows = (await db.select().from(callResults)
    .where(inArray(callResults.finderUserId, [...ids]))
    .orderBy(desc(callResults.startedAt)).limit(80))
    .filter((r) => r.providerCallId);
  return c.json(rows.map((r) => ({
    cid: r.providerCallId, storeId: r.retailerId,
    storeName: stores.get(r.retailerId)?.name || "A store",
    categoryId: r.categoryId, category: cats.get(r.categoryId) || "",
    ts: (r.startedAt || 0) * 1000, status: r.status, confirmed: r.confirmed,
  })));
});

// Charge one credit for a definitive answer (idempotent per call id).
app.post("/app/charge", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const { cid } = await c.req.json();
  const a = await getAccount(u.id, u.email);
  if (cid && !charged.has(cid) && !isComp(a?.email)) { charged.add(cid); await chargeOneCredit(u.id); }
  return c.json({ credits: isComp(a?.email) ? 9999 : (a?.credits ?? 0) });
});
// Create a Stripe Checkout session (kind = "sub" | pack key). Returns a redirect URL.
app.post("/app/checkout", async (c) => {
  const u = await verifyClerkToken(c.req.header("Authorization"));
  if (!u) return c.json({ error: "unauthorized" }, 401);
  const { kind, email } = await c.req.json();
  const origin = (c.req.header("origin") || "https://runner.fungibles.com").replace(/\/$/, "");
  const url = await createCheckout(u.id, u.email || email, kind, origin);
  if (!url) return c.json({ error: "checkout_failed" }, 400);
  return c.json({ url });
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
  const rows = ids.length
    ? (await db.select().from(callResults).where(inArray(callResults.finderUserId, ids)).orderBy(desc(callResults.startedAt)).limit(80))
    : [];
  const withCid = rows.filter((r) => r.providerCallId);
  return c.json({
    email,
    accounts: accs.map((a) => ({ clerkUserId: a.clerkUserId, credits: a.credits, subscription: a.subscription, callsMade: a.callsMade, totalSpentCents: a.totalSpentCents })),
    totalCalls: rows.length, replayable: withCid.length,
    calls: withCid.map((r) => ({ cid: r.providerCallId, store: stores.get(r.retailerId)?.name || r.retailerId, category: cats.get(r.categoryId) || r.categoryId, status: r.status, confirmed: r.confirmed, at: r.startedAt })),
  });
});

// ---- Restock intel: the compounding payoff — where/when product actually lands ----
app.get("/api/admin/restock-intel", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const d7 = now - 7 * 86400, d30 = now - 30 * 86400;
  const stores = await retailerMap();
  const cats = await categoryLabelMap();
  const rows = await db.select().from(callResults).where(eq(callResults.status, "completed"));
  const confirmed = rows.filter((r) => r.confirmed === true);
  // Per-store: how often a confirmation lands + the shipment day the clerk gave (the gold).
  const byStore = new Map<number, { store: string; chain: string; region: string | null; confirms: number; last: number; days: Record<string, number> }>();
  for (const r of confirmed) {
    const s = stores.get(r.retailerId); if (!s) continue;
    let e = byStore.get(r.retailerId);
    if (!e) { e = { store: s.name.split("—")[0].trim(), chain: "", region: s.region ?? null, confirms: 0, last: 0, days: {} }; byStore.set(r.retailerId, e); }
    e.confirms++;
    const at = r.completedAt ?? r.startedAt; if (at > e.last) e.last = at;
    if (r.shipmentDayHeard) e.days[r.shipmentDayHeard] = (e.days[r.shipmentDayHeard] || 0) + 1;
  }
  // Per-shipment-day across the whole network (e.g. "Thursday" dominates) — drives scheduled calls.
  const dayTally: Record<string, number> = {};
  for (const r of confirmed) if (r.shipmentDayHeard) dayTally[r.shipmentDayHeard] = (dayTally[r.shipmentDayHeard] || 0) + 1;
  const topStores = [...byStore.values()].sort((a, b) => b.confirms - a.confirms || b.last - a.last).slice(0, 25)
    .map((e) => ({ ...e, bestDay: Object.entries(e.days).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }));
  return c.json({
    totals: {
      checks: rows.length, confirms: confirmed.length,
      confirmRate: rows.length ? Math.round((confirmed.length / rows.length) * 100) : 0,
      confirms7d: confirmed.filter((r) => (r.completedAt ?? r.startedAt) >= d7).length,
      confirms30d: confirmed.filter((r) => (r.completedAt ?? r.startedAt) >= d30).length,
    },
    shipmentDays: Object.entries(dayTally).sort((a, b) => b[1] - a[1]).map(([day, n]) => ({ day, n })),
    topStores: topStores.map((e) => ({ store: e.store, region: e.region, confirms: e.confirms, last: e.last, bestDay: e.bestDay })),
  });
});

// ---- Growth pulse: the funnel + engagement snapshot the owner reads each morning ----
app.get("/api/admin/pulse", async (c) => {
  const now = Math.floor(Date.now() / 1000), d1 = now - 86400, d7 = now - 7 * 86400;
  const [accts, leadRows, watchRows, kReports, posts, calls] = await Promise.all([
    db.select().from(accounts), db.select().from(leads), db.select().from(watches),
    db.select().from(kioskReports), db.select().from(communityPosts), db.select().from(callResults),
  ]);
  const since = (ts: number, at: (r: { createdAt?: number | null; startedAt?: number | null }) => number | null | undefined, rows: Array<Record<string, unknown>>) =>
    rows.filter((r) => (at(r as never) ?? 0) >= ts).length;
  const completed = calls.filter((r) => r.status === "completed");
  return c.json({
    funnel: {
      leads: leadRows.length,
      signups: accts.length,
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
    },
    community: {
      watches: watchRows.filter((w) => w.active !== false).length,
      kioskReports: kReports.length,
      posts: posts.length, postsPending: posts.filter((p) => !p.approved).length,
      newLeads7d: since(d7, (r) => r.createdAt, leadRows),
    },
  });
});

// ---- God view: one read of everything moving right now (live calls, outcomes, cost signals) ----
app.get("/api/admin/overview", async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const d1 = now - 86400, d7 = now - 7 * 86400, d30 = now - 30 * 86400;
  const stores = await retailerMap();
  const cats = await categoryLabelMap();
  const recent = await db.select().from(callResults).where(gte(callResults.startedAt, d30)).orderBy(desc(callResults.startedAt));
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
  return c.json({ live, today: slice(d1), week: slice(d7), month: slice(d30), avgCallSeconds30d: avg(durs), chainStats, recentCalls });
});

// ---- Settings (master toggles) ----
app.get("/api/settings", async (c) => c.json(await allSettings()));
app.patch("/api/settings", async (c) => {
  const b = await c.req.json();
  if (typeof b.voicemailHangup === "boolean") await setSetting("voicemail_hangup", String(b.voicemailHangup));
  if (b.creditLimit !== undefined) await setSetting("el_credit_limit", String(Math.max(0, Number(b.creditLimit) || 0)));
  return c.json(await allSettings());
});

// ---- ElevenLabs credit status (live if the key has user_read, else estimated) ----
app.get("/api/credits", async (c) => c.json(await getCreditStatus()));

// ---- Reference data ----
app.get("/api/categories", async (c) => c.json(await db.select().from(categories)));
app.get("/api/chains", async (c) => c.json(await db.select().from(chains)));
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
  if (b.avgTreeSeconds !== undefined) patch.avgTreeSeconds = Number.isFinite(Number(b.avgTreeSeconds)) && Number(b.avgTreeSeconds) > 0 ? Number(b.avgTreeSeconds) : null;
  if (typeof b.repackOnly === "boolean") patch.repackOnly = b.repackOnly;
  if (typeof b.muted === "boolean") patch.muted = b.muted;
  const [row] = await db.update(chains).set(patch).where(eq(chains.id, Number(c.req.param("id")))).returning();
  invalidateRefCache();
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
  await db.insert(storeRequests).values({
    contact: (b.contact ? String(b.contact) : "").slice(0, 120) || null,
    storeName: storeName.slice(0, 160), chain: (b.chain ? String(b.chain) : "").slice(0, 80) || null,
    address: (b.address ? String(b.address) : "").slice(0, 200) || null,
    city: (b.city ? String(b.city) : "").slice(0, 80) || null,
    state: (b.state ? String(b.state) : "").slice(0, 20) || null,
    note: (b.note ? String(b.note) : "").slice(0, 400) || null,
  });
  return c.json({ ok: true });
});
app.get("/api/store-requests", async (c) => c.json(await db.select().from(storeRequests).orderBy(desc(storeRequests.createdAt))));
app.patch("/api/store-requests/:id", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (b.status) await db.update(storeRequests).set({ status: String(b.status) }).where(eq(storeRequests.id, Number(c.req.param("id"))));
  return c.json({ ok: true });
});

app.get("/api/waitlist", async (c) => {
  const rows = await db.select().from(waitlist).orderBy(desc(waitlist.createdAt));
  // Group by region (or 'Unknown') for the rollout view.
  const byRegion: Record<string, number> = {};
  for (const r of rows) byRegion[r.region || "Unknown"] = (byRegion[r.region || "Unknown"] || 0) + 1;
  return c.json({ total: rows.length, byRegion: Object.entries(byRegion).sort((a, b) => b[1] - a[1]).map(([region, n]) => ({ region, n })), recent: rows.slice(0, 50) });
});

// ---- Retailers (with green status) ----
app.get("/api/retailers", async (c) => c.json(await retailersWithStatus({
  q: c.req.query("q") || undefined, state: c.req.query("state") || undefined,
  type: c.req.query("type") || undefined, region: c.req.query("region") || undefined,
  carries: c.req.query("carries") || undefined, online: c.req.query("online") === "1" || undefined,
  limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
})));
// Store Intel — the headline numbers on the Stores tab (cached 60s). The database, at a glance.
let storeIntelCache: { t: number; v: unknown } | null = null;
app.get("/api/admin/store-intel", async (c) => {
  if (storeIntelCache && Date.now() - storeIntelCache.t < 60_000) return c.json(storeIntelCache.v);
  const countWhere = async (w: ReturnType<typeof and> | ReturnType<typeof eq>) =>
    Number((await db.select({ n: sql<number>`count(*)` }).from(retailers).where(w))[0]?.n || 0);
  const active = eq(retailers.active, true);
  const total = await countWhere(active);
  const callable = await countWhere(and(active, sql`${retailers.phone} is not null and ${retailers.phone} != ''`));
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
  const checkRows = await db.select({ rid: callResults.retailerId, n: sql<number>`count(*)` }).from(callResults)
    .where(sql`${callResults.retailerId} is not null`).groupBy(callResults.retailerId).orderBy(desc(sql`count(*)`)).limit(10);
  const checkIds = checkRows.map((r) => r.rid).filter((x): x is number => x != null);
  const checkNames = checkIds.length
    ? new Map((await db.select({ id: retailers.id, name: retailers.name, location: retailers.location }).from(retailers).where(inArray(retailers.id, checkIds))).map((r) => [r.id, r]))
    : new Map();
  const topChecks = checkRows.map((r) => ({ name: (r.rid != null && checkNames.get(r.rid)?.name) || `#${r.rid}`, location: (r.rid != null && checkNames.get(r.rid)?.location) || "", n: Number(r.n || 0) }));

  const v = { total, callable, byProduct, states, chains: chainRows.length, types, byType, topRegions, topChecks };
  storeIntelCache = { t: Date.now(), v };
  return c.json(v);
});
// In-admin Claude agent ("Admin dev"): chat to manage the store DB. Client sends the running
// transcript [{role,text}]; the server runs one turn (with an internal tool loop) and returns
// the reply + a list of actions taken. Admin-gated like the rest of /api/*.
// Call-timing breakdown for the God view: total / time-to-human (nav) / talk, aggregate + per store.
app.get("/api/admin/call-timing", async (c) => {
  const hasT = sql`${callResults.callSeconds} is not null`;
  const agg = (await db.select({ n: sql<number>`count(*)`, avgCall: sql<number>`avg(${callResults.callSeconds})`, totalSec: sql<number>`coalesce(sum(${callResults.callSeconds}),0)` }).from(callResults).where(hasT))[0];
  const reached = (await db.select({ n: sql<number>`count(*)`, avgNav: sql<number>`avg(${callResults.navSeconds})`, avgTalk: sql<number>`avg(${callResults.callSeconds} - ${callResults.navSeconds})` }).from(callResults).where(and(hasT, sql`${callResults.navSeconds} is not null`)))[0];
  const byStore = await db.select({ rid: callResults.retailerId, n: sql<number>`count(*)`, avgCall: sql<number>`avg(${callResults.callSeconds})`, avgNav: sql<number>`avg(${callResults.navSeconds})`, avgTalk: sql<number>`avg(${callResults.callSeconds} - ${callResults.navSeconds})`, totalSec: sql<number>`coalesce(sum(${callResults.callSeconds}),0)` }).from(callResults).where(hasT).groupBy(callResults.retailerId).orderBy(desc(sql`count(*)`)).limit(12);
  const ids = byStore.map((r) => r.rid).filter((x): x is number => x != null);
  const names = ids.length ? new Map((await db.select({ id: retailers.id, name: retailers.name }).from(retailers).where(inArray(retailers.id, ids))).map((r) => [r.id, r.name])) : new Map();
  const r0 = (n: unknown) => Math.round(Number(n || 0));
  return c.json({
    aggregate: { calls: r0(agg?.n), reached: r0(reached?.n), avgCallSec: r0(agg?.avgCall), avgNavSec: r0(reached?.avgNav), avgTalkSec: r0(reached?.avgTalk), totalMinutes: r0(Number(agg?.totalSec || 0) / 60) },
    byStore: byStore.map((r) => ({ name: (r.rid != null && names.get(r.rid)) || `#${r.rid}`, n: r0(r.n), avgCallSec: r0(r.avgCall), avgNavSec: r0(r.avgNav), avgTalkSec: r0(r.avgTalk), totalMin: r0(Number(r.totalSec || 0) / 60) })),
  });
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
  const b = await c.req.json();
  const [row] = await db.update(retailers).set(b).where(eq(retailers.id, Number(c.req.param("id")))).returning();
  return c.json(row);
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
// Call every store in a zone (explicit, on-demand — never automatic).
app.post("/api/zones/:id/call-now", async (c) => c.json(await callZone(Number(c.req.param("id")))));
// Credit feasibility for a zone (one credit/store) — the user-facing zone caller must check this
// up front so nobody starts a zone they can't finish. (Wired + ready; user firing stays gated off.)
app.get("/api/zones/:id/quote", async (c) => c.json(await zoneQuote(Number(c.req.param("id")))));

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
  const rows = await db.select().from(callResults).orderBy(desc(callResults.startedAt)).limit(50);
  const rMap = new Map((await db.select().from(retailers)).map((r) => [r.id, r.name]));
  const cMap = new Map((await db.select().from(categories)).map((x) => [x.id, x.label]));
  return c.json(rows.map((r) => ({ ...r, retailer: rMap.get(r.retailerId), category: cMap.get(r.categoryId) })));
});

// ---- Actions ----
app.post("/api/call-now", async (c) => {
  const b = await c.req.json();
  return c.json(await triggerCall(b));
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
app.get("/api/statuses", async (c) => c.json(await db.select().from(statuses).orderBy(statuses.sort)));
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
// Place a bridged Twilio call (our number -> destination) running the restock agent. Returns the room.
async function placeBridgeCall(toNumber: string, dynamicVars: Record<string, string>, onConversationId?: (id: string) => void, dtmf?: string | null): Promise<{ room?: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) return { error: "twilio not configured" };
  const e164 = (p: string) => { p = p.replace(/[^\d+]/g, ""); if (p.startsWith("+")) return p; if (p.length === 10) return "+1" + p; if (p.length === 11 && p.startsWith("1")) return "+" + p; return "+" + p; };
  const room = crypto.randomUUID();
  const from = process.env.BRIDGE_FROM_NUMBER || "+13106662331"; // our verified caller ID
  const pol = await getPolicy();
  setBridgeContext(room, { agentId: config.voice.agentId, dynamicVars, onConversationId, dtmf: dtmf || undefined, connectOnHuman: pol.flags.connectOnHuman, holdMaxSeconds: pol.bail.holdMaxSeconds });
  const body = new URLSearchParams({ To: e164(toNumber), From: from, Url: `https://${RAILWAY_HOST}/twiml/bridge?room=${room}` });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) return { error: `twilio call failed: ${r.status} ${await r.text()}` };
  const d = (await r.json()) as { sid?: string };
  if (d.sid) { roomCallSids.set(room, d.sid); setTimeout(() => roomCallSids.delete(room), 10 * 60 * 1000); }
  return { room };
}
const roomCallSids = new Map<string, string>(); // room -> Twilio callSid (for hang-up)
// End the live bridged call (user pressed "Stop & hang up").
app.post("/pub/bridge-hangup", async (c) => {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  const { room } = await c.req.json();
  const callSid = roomCallSids.get(room);
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
async function bridgeStoreCall(retailerId: number, categoryIds: number[], specificProduct?: string, finder?: { userId?: string; isPrivate?: boolean }): Promise<{ room?: string; error?: string }> {
  const primary = categoryIds[0];
  const extras = categoryIds.slice(1);
  // Resolve the SAME three-tier vars (global + chain + store phone tree, clarification, etc.) the
  // scheduled calls use — Listen-live was previously running on the bare global prompt only.
  const v = await buildRestockVars(retailerId, primary, specificProduct, extras);
  if (!v || !v.retailer.phone) return { error: "store not found" };
  // Log the call once it connects (we get the ElevenLabs conversation id): insert the PRIMARY result
  // row; ingest fans out each extra line into its own row from the per-category extraction.
  return placeBridgeCall(v.retailer.phone, v.dynamicVars, (convId) => {
    db.insert(callResults).values({ retailerId, categoryId: primary, mode: "restock", status: "in_progress", providerCallId: convId, finderUserId: finder?.userId ?? null, isPrivate: finder?.isPrivate ?? false })
      .catch((e) => console.error("bridge call log insert:", e));
  }, v.dtmf);
}
app.get("/pub/bridge/:room", (c) => c.json({ conversationId: bridgeConversationId(c.req.param("room")), wsHost: RAILWAY_HOST }));
app.get("/pub/bridge-debug", (c) => c.json({ log: bridgeDebug() }));
app.post("/api/bridge/call", async (c) => {
  const b = await c.req.json();
  if (!b.toNumber) return c.json({ error: "toNumber required" }, 400);
  const category = b.category || "Pokémon";
  const opener = (await getSetting("vt_opening")) || "Heyy! I was just checking to see if you guys got any {category} in?";
  // Ad-hoc dial to an arbitrary number (no store record) — minimal vars, generic IVR handling.
  const r = await placeBridgeCall(b.toNumber, {
    internal_call_id: "0", category, retailer_name: b.storeName || "the store", location: "",
    clarification: "", phone_tree: b.phoneTree || "", special_instructions: "",
    voicemail_policy: "If you reach a personal voicemail with no menu, hang up without leaving a message.",
    personality: "", opening_line: opener.replace(/\{category\}/g, category), other_categories: "", ask_shipment_day: "",
  });
  if (r.error) return c.json({ error: r.error }, 502);
  return c.json({ room: r.room, wsHost: RAILWAY_HOST });
});

app.post("/api/ingest", async (c) => c.json({ finalized: await ingestPending() }));
app.post("/api/tick", async (c) => c.json({ fired: await schedulerTick() }));

// ---- ElevenLabs post-call webhook (used once deployed to a public URL) ----
app.post("/webhooks/elevenlabs", async (c) => {
  try {
    const o = await provider.parseWebhook(c.req.raw);
    if (o.callId) {
      await db.update(callResults).set({
        status: o.status, confirmed: o.confirmed, shipmentDayHeard: o.shipmentDay,
        summary: o.summary, transcript: o.transcript, completedAt: Math.floor(Date.now() / 1000),
      }).where(eq(callResults.id, o.callId));
      if (o.shipmentDay) {
        const row = (await db.select().from(callResults).where(eq(callResults.id, o.callId)))[0];
        if (row) await db.update(retailers).set({ shipmentDay: o.shipmentDay }).where(eq(retailers.id, row.retailerId));
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
  bridgeLog(`listener JOINED room=${room.slice(0, 8)} listeners=${set.size}`);
  ws.on("close", () => { set!.delete(ws); bridgeLog(`listener LEFT room=${room.slice(0, 8)} listeners=${set!.size}`); if (set!.size === 0) rooms.delete(room); });
};
const fanout = (room: string, payloadB64: string, track: string) => {
  const set = rooms.get(room); if (!set) return;
  const msg = JSON.stringify({ audio: payloadB64, track });
  for (const ws of set) if (ws.readyState === 1) ws.send(msg);
};
const wssTwilio = new WebSocketServer({ noServer: true });
const wssListen = new WebSocketServer({ noServer: true });
const wssBridge = new WebSocketServer({ noServer: true });

// Full agent bridge: Twilio call audio <-> ElevenLabs ConvAI WS, forked to browser listeners.
wssBridge.on("connection", (ws: WebSocket, _req: unknown, room: string) => {
  handleTwilioBridge(ws, room, fanout); // fanout(room, b64, track) — bridge passes its resolved room
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
setInterval(() => ingestPending().catch((e) => console.error("ingest:", e)), 8_000);
setInterval(() => schedulerTick().catch((e) => console.error("tick:", e)), 60_000);
setInterval(() => geocodeMissing(1).catch((e) => console.error("geocode:", e)), 3_000);
setInterval(() => harvestHoursTick().catch((e) => console.error("harvest:", e)), 120_000); // self-updating hours (policy-gated, off by default)
setInterval(() => customerScheduleTick().catch((e) => console.error("cust-sched:", e)), 90_000); // subscriber auto-checks (policy-gated)
setInterval(() => gmailReceiptTick().catch((e) => console.error("gmail-receipts:", e)), 30_000); // ingest kiosk receipts (policy-gated + creds)
