// The small things several route files need: who is asking and what they are allowed to see, the
// chain-logo lookup and sizing, the distributor carries list, shipment-day maths, and the page
// helpers. Nothing here registers a route.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getCookie } from "hono/cookie";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { callResults, chains, products, retailers } from "../db/schema";
import { config } from "../config";
import { getSetting } from "../db/settings";
import { storeOpenInfo } from "../calls/service";
import { getPolicy } from "../policy";
import { getAccount, isComp, isCompAccount } from "../billing";
import { accountFeatures } from "../plans";
import { e164 as authE164, verifySession } from "../auth";

/** 409-style gate: returns a closed payload if we KNOW the store is closed right now, else null. */
export async function closedGate(retailerId: number): Promise<{ error: string; label: string } | null> {
  const os = await storeOpenInfo(retailerId);
  return os && os.known && !os.open ? { error: "store_closed", label: os.label } : null;
}

/** Subscribers' finds stay private forever (a membership perk, never an upsell). */
export async function isFinderPrivate(acct: { subscription?: string | null } | null | undefined): Promise<boolean> {
  const pol = await getPolicy();
  return !!(acct && acct.subscription === "active" && pol.finds.subscriberPrivateAlways);
}

/** Optional-auth comp check for public endpoints: anonymous visitors return false with no token
 *  verification overhead; a signed-in master/comp account is recognized so the owner-only demo store
 *  ("Fun") surfaces for the owner only. */
export async function requesterIsComp(authHeader?: string): Promise<boolean> {
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
export async function requesterFeatures(authHeader?: string): Promise<Record<string, boolean>> {
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
export async function isOwnerOnlyStore(retailerId: number): Promise<boolean> {
  const r = (await db.select({ ownerOnly: retailers.ownerOnly }).from(retailers).where(eq(retailers.id, retailerId)))[0];
  return !!r?.ownerOnly;
}

/** Retailer IDs of owner-only stores (the "Fun" rehearsal store). Excluded from every admin report/
 *  metric that aggregates call_results — exactly like they're hidden from /pub/finds + the store lists. */
export async function ownerOnlyRetailerIds(): Promise<Set<number>> {
  const rows = await db.select({ id: retailers.id }).from(retailers).where(eq(retailers.ownerOnly, true));
  return new Set(rows.map((r) => r.id));
}

// retailerId -> learned time-to-human (the chain's LOCKED nav recipe seconds): how long we spend in the
// phone tree / on hold before a person picks up. Subtracting this from a call's connected time yields
// the REAL human-talk time (the old code subtracted the IVR's first-words timestamp ~2s, so "talk" was
// the whole call). null when the chain has no locked recipe → caller falls back to the per-call nav.
export async function retailerTimeToHuman(): Promise<Map<number, number>> {
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
export async function getStatsSince(): Promise<number> {
  const v = await getSetting("stats_since");
  const n = v ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
}

// This file lives in src/routes/ now, so climb back to src/ — every join(here, "../public/…")
// below then resolves to exactly the path it resolved to when this code sat in src/server.ts.
export const here = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- Peek door ----
// A secret ?peek=<PEEK_CODE> link (code lives in Railway) skips the coming-soon splash for THAT browser
// only: matching the code sets a root-domain cookie (shared across every brand subdomain), so the owner
// can browse prod as a real customer while the public still sees the splash. peekOk() = code present in
// the query (instant bypass on the magic link) OR the cookie already set. Rotate PEEK_CODE to revoke all.
export const peekOk = (peekQ?: string, peekCookie?: string): boolean =>
  !!config.peekCode && (peekQ === config.peekCode || peekCookie === config.peekCode);

// ---- Auth — phone/SMS sessions only (Clerk fully removed). ----
// Owner phones that double as admin login: signing into the consumer site with one of these ALSO
// authenticates the operator dashboard (which runs on a sibling subdomain). Set ADMIN_PHONES on
// Railway, comma-separated, e.g. "+13106662331,+14243126356".
export const ADMIN_PHONES = (process.env.ADMIN_PHONES || "").split(",").map((s) => authE164(s.trim())).filter(Boolean);

export const isAdminPhone = (e: string) => !!e && ADMIN_PHONES.includes(e);

// Cross-subdomain admin SSO: a cookie set on the registrable root is shared by every subdomain under
// it (consumer site + admin). Match it to the request host's root or the browser drops the cookie.
export function cookieRootDomain(host: string | undefined): string | undefined {
  const h = (host || "").split(":")[0].toLowerCase();
  if (/localhost|127\.0\.0\.1/.test(h)) return undefined;   // dev → host-only cookie
  if (h.endsWith("fungibles.com")) return ".fungibles.com"; // direct fungibles hit (no worker)
  // Behind the Cloudflare worker the origin Host is the Railway service domain, so we can't read the
  // real host. The browser validates the Domain attr against ITS url (the *.checkitforme.com the user
  // is actually on), so default to the canonical admin root — this is what makes site→admin SSO work.
  return ".checkitforme.com";
}

// Verify a signed-in customer from their phone-session token (our own JWT). `id` is the account key
// (sub = "phone:+E164"); `phone` is carried in the token. Name kept for the many call-sites.
export async function verifyClerkToken(authHeader: string | undefined): Promise<{ id: string; email?: string; phone?: string } | null> {
  const tok = (authHeader || "").startsWith("Bearer ") ? (authHeader as string).slice(7) : "";
  if (!tok) return null;
  const s = await verifySession(tok);
  return s ? { id: s.id, phone: s.phone } : null;
}

// ---- Pages ----
// Operator dashboard at caller.* ; consumer "pay-per-check" app at runner.* (or /r preview).
// Clerk fully removed — no __CLERK_* placeholders to inject; auth is phone-session (consumer) and the
// admin_session cookie (operator dashboard).
export const page = (file: string) => readFileSync(join(here, `../public/${file}`), "utf8");

export const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- PostHog (product analytics) — activates from Railway vars alone (POSTHOG_KEY [+ POSTHOG_HOST]);
// no key baked in the repo, key absent = no-op. Injected server-side before </body> on every served
// page (all consumer brand domains + admin) so one place covers every page; the dated `defaults`
// turns on history-change pageviews, which the SPA needs for per-view tracking.
export const PH_SNIPPET = process.env.POSTHOG_KEY
  ? `<script>!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(process.env.POSTHOG_KEY)},{api_host:${JSON.stringify(process.env.POSTHOG_HOST || "https://us.i.posthog.com")},defaults:"2025-05-24"})</script>`
  : "";

export const withAnalytics = (html: string) => (PH_SNIPPET && html.includes("</body>")) ? html.replace("</body>", `${PH_SNIPPET}</body>`) : html;

// ---- Consumer (Runnr) public API — pay-per-check. Bypasses the /api/* Clerk gate by design. ----
export const charged = new Set<string>();
 // idempotent per-call charging (only on a definitive answer)
export const pubCredits = async () => {
  const v = await getSetting("pub_credits");
  return v == null || v === "" ? 20 : Math.max(0, Number(v) || 0); // 20 free demo checks by default
};

export let chainLogoCache: { t: number; v: Set<string> } | null = null;

export function chainLogoFiles(): Set<string> {
  if (chainLogoCache && Date.now() - chainLogoCache.t < 60_000) return chainLogoCache.v;
  let v = new Set<string>();
  try { v = new Set(readdirSync(join(here, "../public/logos/chains")).filter((f) => /\.(png|webp|svg)$/i.test(f))); } catch { /* dir not there yet */ }
  if (v.size) chainLogoCache = { t: Date.now(), v }; // never cache an empty read — self-heal on the next call
  return v;
}

export const chainSlug = (name: string) => name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export let logoMetaCache: { t: number; v: Record<string, { w: number; d: number }> } | null = null;

export function logoMeta(): Record<string, { w: number; d: number }> {
  if (logoMetaCache && Date.now() - logoMetaCache.t < 60_000) return logoMetaCache.v;
  let v: Record<string, { w: number; d: number }> = {};
  try { v = JSON.parse(readFileSync(join(here, "../public/logos/chains/_meta.json"), "utf8")); } catch { /* none yet */ }
  logoMetaCache = { t: Date.now(), v };
  return v;
}

export function chainLogoFile(name: string | null | undefined): string | null {
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
export let chainLogoDbCache = new Map<string, { url: string; wide: boolean; dark: boolean; pct: number | null }>();

export async function refreshChainLogoDb(): Promise<void> {
  try {
    const rows = await db.select({ name: chains.name, logoUrl: chains.logoUrl, logoWide: chains.logoWide, logoDark: chains.logoDark, logoPct: chains.logoPct })
      .from(chains).where(sql`${chains.logoUrl} is not null and ${chains.logoUrl} != ''`);
    const m = new Map<string, { url: string; wide: boolean; dark: boolean; pct: number | null }>();
    for (const r of rows) if (r.logoUrl) m.set((r.name || "").toLowerCase(), { url: r.logoUrl, wide: r.logoWide === true, dark: r.logoDark === true, pct: typeof r.logoPct === "number" ? r.logoPct : null });
    chainLogoDbCache = m;
  } catch (e) { console.error("refreshChainLogoDb", e); }
}

export let chainLogoDbLoading = false;

// Lazy-load the DB-backed logo cache on first use (pure DB query, no file read) so logos resolve even if
// the startup load didn't run in this container — prod resilience for the file-read anomaly.
export function ensureChainLogoDb(): void {
  if (chainLogoDbCache.size || chainLogoDbLoading) return;
  chainLogoDbLoading = true;
  refreshChainLogoDb().finally(() => { chainLogoDbLoading = false; });
}

// ── THE LOGO SIZE RULE — ONE definition, server-side, for every surface ─────────────────────────
// Every logo gets the SAME visual AREA in its tile, then clamps so nothing touches the edges.
// Fitting a logo inside a square box instead sizes it by its longest side, so a wide wordmark
// (Randalls is 5:1) matched the box's width and came out a few pixels tall next to a squarish mark.
//
// The answer is a single number: how wide to draw the logo as a PERCENT of its tile. Because the
// tile is always square, that percent falls out of the artwork's proportions alone and is the same
// on a 46px chain row, a 44px store row, a 36px settings panel and a 190px hero mark:
//     w/S = min( sqrt(AREA * nw/nh),  MAXW,  MAXH * nw/nh )
// No surface loads the image, none re-derives the rule, and the old cached-onload race is gone.
export const LOGO_AREA = 0.55;
   // share of the tile the artwork's box should cover
export const LOGO_MAXW = 0.95;
   // never wider than this share of the tile
export const LOGO_MAXH = 0.90;
   // never taller than this share of the tile
export function logoPctFor(nw: number, nh: number): number | null {
  if (!(nw > 0) || !(nh > 0)) return null;
  const r = nw / nh;
  const pct = Math.min(Math.sqrt(LOGO_AREA * r), LOGO_MAXW, LOGO_MAXH * r) * 100;
  return Math.round(pct * 100) / 100;
}

export function chainLogoInfo(name: string | null | undefined): { url: string | null; wide: boolean; dark: boolean; pct: number | null } {
  if (name) {
    ensureChainLogoDb();
    const hit = chainLogoDbCache.get(name.toLowerCase()); // DB-first: shared-R2 URL travels across envs
    if (hit) return hit;
  }
  const f = chainLogoFile(name); // filesystem fallback (pre-migration, and unchained store names)
  if (!f) return { url: null, wide: false, dark: false, pct: null };
  const m = logoMeta()[f] || { w: 0, d: 0 };
  return { url: `/logos/chains/${f}?v=79`, wide: m.w === 1, dark: m.d === 1, pct: null };
}

// The ONE way a store row gets its logo. Every list on every surface goes through this, so a store
// can never resolve to a different logo depending on which screen you are looking at. It replaces
// fifteen hand-written copies that each worked the chain out their own way (eight different ways).
// Pass the chain name when the caller already knows it; otherwise the store's own name is used.
export function logoFields(chainName: string | null | undefined): {
  logoUrl: string | null; logoWide: boolean; logoDark: boolean; logoPct: number | null;
} {
  const l = chainLogoInfo(chainName);
  return { logoUrl: l.url, logoWide: l.wide, logoDark: l.dark, logoPct: l.pct };
}

export function withLogo<T extends { name?: string | null }>(row: T, chainName?: string | null) {
  return { ...row, ...logoFields(chainName || storeChainName(row.name)) };
}

// A store's name can carry its branch after a dash ("Acme — Reno"); the chain is the part before it.
// This was written out inline at eight call sites with three different dash sets. Now it is one.
export function storeChainName(storeName: string | null | undefined): string | null {
  if (!storeName) return null;
  return storeName.split(/—|–| - /)[0].trim() || null;
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
export type DistCfg = { products: Record<string, string[]>; chains: Record<string, string[]>; labels?: Record<string, string[]> };

export const DISTRIBUTORS_FALLBACK: DistCfg = {
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

export let distCache: DistCfg | null = null;

export function distConfig(): DistCfg {
  if (distCache) return distCache;
  try {
    const c = JSON.parse(readFileSync(join(here, "../data/distributors.json"), "utf8"));
    if (c && c.chains && Object.keys(c.chains).length) { distCache = c; return c; }
  } catch { /* file unreadable in this container — use the inlined fallback below */ }
  return DISTRIBUTORS_FALLBACK; // never cache the fallback, so the file self-heals if it becomes readable
}

/** Products a chain carries, derived from its distributor(s). null = chain not mapped (fall back to the stored column). */
export function carriesForChain(name: string | null | undefined): string[] | null {
  if (!name) return null;
  const cfg = distConfig();
  const dists = cfg.chains[name];
  if (!dists || !dists.length) return null;
  const set = new Set<string>();
  for (const d of dists) for (const p of (cfg.products[d] || [])) set.add(p);
  return set.size ? [...set] : null;
}

/** The carries a store actually shows: distributor-derived for mapped chains, else its stored per-store list. */
export function storeCarriesList(chainName: string | null | undefined, stored: string | null | undefined): string[] {
  return carriesForChain(chainName) ?? (stored ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Distributor name(s) serving a chain, for display in the Admin (e.g. "Excell · Schylling"). Reads the
 *  carries-deriving `chains` map first, then the display-only `labels` map — so a hand-curated Excell
 *  account shows its distributor without its products being re-derived. null = we don't know the distributor. */
export function distributorsForChain(name: string | null | undefined): string | null {
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
export async function adminOk(c: any): Promise<boolean> {
  if (!config.adminToken) return true;
  if (c.req.header("x-admin-token") === config.adminToken) return true;
  const ck = getCookie(c, "admin_session");
  if (ck) { const s = await verifySession(ck); if (s && s.id === "admin") return true; }
  return false;
}

// ---- Geo-paginated store list — THE consumer path at 100k-store scale ----
// /pub/stores ships every row (fine at ~100 stores, a page-killer at 102k). This endpoint returns
// only stores near the user: the bounding box rides the retailers(lat,lng) index, distance sorts,
// and pages. Falls back to ?state= or ?q= (SQL-side) when the visitor hasn't shared location.
// Token-AND matcher shared by the /pub/stores/near text paths: every word must hit the store's
// name-or-city; words of 5+ chars shed their last letter to absorb trailing typos ("barns" -> "barn").
export function qTokenMatch(hay: string, q: string): boolean {
  const h = hay.toLowerCase();
  const toks = q.split(/\s+/).filter((t) => t.length >= 2).slice(0, 5);
  if (!toks.length) return h.includes(q);
  return toks.every((t) => h.includes(t) || (t.length >= 5 && h.includes(t.slice(0, -1))));
}

// "Best bet near you" — rank nearby open stores by how likely a check pays off now (shipment-day
// timing + confirm history/recency + proximity). The recommendation layer over the restock database.
export function tzDow(tz: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz || "America/Chicago", weekday: "short" }).format(new Date());
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[wd] ?? 0;
}

// Accepts full names, abbreviations, and plurals ("Thursday" / "Thu" / "thursdays") — shipmentDay is
// stored raw from the call transcript, so normalize the same way the rest of the codebase does.
export const SHIP_DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

export function shipDow(s: string | null | undefined): number | null {
  if (!s) return null;
  const k = s.trim().toLowerCase().replace(/s$/, "").slice(0, 3);
  return SHIP_DOW[k] ?? null;
}

// Weekday (0=Sun … 6=Sat) of a PAST timestamp in a store's local time — for the empirical "which day
// did product actually land" histogram (vs tzDow, which is only today).
export function dowAt(epochSec: number, tz: string): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz || "America/Chicago", weekday: "short" }).format(new Date(epochSec * 1000));
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[wd] ?? 0;
}

// The LEARNED restock weekday: the MODE of every shipment day staff have given across this store's
// confirmed calls — robust to one wrong answer, unlike the last-write-wins shipmentDay column —
// falling back to the stored shipmentDay when there's no call history yet. How best-bet "learns" the
// day from all the calls instead of just the most recent one.
export function learnedShipDow(days: Record<string, number> | undefined, fallback: string | null | undefined): number | null {
  if (days) {
    const top = Object.entries(days).sort((a, b) => b[1] - a[1])[0]?.[0];
    const d = shipDow(top);
    if (d != null) return d;
  }
  return shipDow(fallback);
}

// Product FORM ("how it's sold") classifier over the free-text productDetail we capture per call
// (staff name it: "booster box", "Surging Sparks ETB", "3-pack blister"). The verdict extractor
// already pulls form+set separately but persists only the combined label, so we re-derive the form
// here at serve time for reporting. Order matters — the more specific pattern wins (hobby/mega/retail
// box before a plain "box"; blister/pack before a bare "pack").
export const PRODUCT_FORMS: Array<[RegExp, string]> = [
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

export function productForm(detail: string | null | undefined): string | null {
  if (!detail) return null;
  for (const [re, label] of PRODUCT_FORMS) if (re.test(detail)) return label;
  return null;
}

// Best-effort SET name from the same free text. productDetailLabel formats "form · set", so the part
// after "·" is the set; a single token that isn't a known form is treated as a set/name hint. Honest
// caveat: clean set-level reporting needs the extractor's `set` field persisted as its own column.
export function productSet(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const parts = detail.split("·").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 1];
  return productForm(detail) ? null : parts[0] || null;
}

export const tallyArr = (m: Record<string, number>, key: string) =>
  Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ [key]: k, n }));

// Transcript privacy (flags.transcriptAuth): a call placed by a signed-in finder is readable only by
// that finder (phone-session Bearer token) or the admin. Anonymous calls stay readable by cid — the
// cid was only ever handed to the caller's own browser. Flag OFF = today's open behavior, so the
// consumer UI can start sending the token before enforcement flips on.
export async function canReadTranscript(c: { req: { header: (n: string) => string | undefined; raw: Request } }, cid: string): Promise<boolean> {
  if (!(await getPolicy()).flags.transcriptAuth) return true;
  const row = (await db.select().from(callResults).where(eq(callResults.providerCallId, cid)))[0];
  if (!row?.finderUserId) return true;
  if (config.adminToken && c.req.header("x-admin-token") === config.adminToken) return true;
  const cookie = (c.req.header("cookie") || "").match(/(?:^|;\s*)admin_session=([^;]+)/)?.[1];
  if (cookie) { const s = await verifySession(decodeURIComponent(cookie)); if (s?.id === "admin") return true; }
  const u = await verifyClerkToken(c.req.header("authorization"));
  return !!u && u.id === row.finderUserId;
}
 // zoneId -> Twilio callSids placed, for "Cancel zone"
/** Hang up a live Twilio call (POST Status=completed). Shared by the single + zone cancel paths. */
export async function hangupTwilioCall(callSid: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok || !callSid) return;
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: "Status=completed",
  }).catch(() => {});
}
