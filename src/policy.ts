// Central, owner-tunable config: pricing, finds headstart/privacy, rewards, and feature flags.
// Stored as one JSON blob in settings ("policy_json"), deep-merged over these defaults, so the
// owner flips numbers and features live (admin → Policy) without a deploy. Everything modular
// reads from here, so a change applies identically across every vertical subdomain.
import { getSetting, setSetting } from "./db/settings";

export interface Pack { key: string; credits: number; cents: number; label: string }
export interface Policy {
  pricing: {
    perCallCents: number;            // headline per-check price (display); credit model = 1 credit/check
    freeChecks: number;              // free checks for a brand-new anonymous visitor
    minPurchaseCents: number;        // smallest top-up allowed
    packs: Pack[];                   // volume tiers — per-check price drops as you buy more
    sub: { cents: number; credits: number; label: string; perCallCents: number };
  };
  finds: {
    publicFeed: boolean;             // show the live "finds" feed at all
    headstartMin: number;            // pay-per-call finder's head start before a find posts public
    subscriberPrivateAlways: boolean;// subscribers' finds are never posted (a perk, not an upsell)
    keepPrivateCostChecks: number;   // non-subs: checks to keep a find private (0 = feature off)
  };
  rewards: {
    kioskRefreshChecks: number;      // free checks granted for submitting a kiosk refresh time
    referralChecks: number;          // free checks granted to BOTH parties on a successful referral
    storeAddChecks: number;          // free checks granted to the submitter when their requested store goes live
  };
  flags: {
    dogfoodHours: boolean;           // night-time hours-harvest auto-calling (OFF until owner says go)
    driverHandoff: boolean;          // show the "have a local grab it" driver demo below in-stock
    scheduling: boolean;             // subscriber: schedule calls on known shipment days
    restockAlerts: boolean;          // subscriber: notify when something comes back in stock
    smsAlerts: boolean;              // SMS alert channel is LIVE (toll-free approved). OFF = every alert form collects email only and no SMS ever sends
    kiosks: boolean;                 // kiosk picker + crowd refresh-time submissions
    hobby: boolean;                  // GLOBAL master switch for the Hobby chip (off = hidden for EVERY account, incl. comp)
    thrift: boolean;                 // GLOBAL master switch for the Thrift chip (off = hidden for EVERY account, incl. comp)
    shareCards: boolean;             // shareable "found it" cards / OG images
    multiProduct: boolean;           // subscriber: ask about >1 product in one call
    specificSets: boolean;           // subscriber: narrow to a specific set
    community: boolean;              // "I scored!" photo wall (moderated)
    communityAutoApprove: boolean;   // skip moderation — posts go live immediately
    referrals: boolean;              // refer-a-friend free-check loop
    kioskReceipts: boolean;          // email-your-kiosk-receipt → verified intel + free call
    liveListen: boolean;             // stream call audio + hang-up button to customers (testing tool; comp accounts always have it)
    stockSignals: boolean;           // free real-time stock rail (site checkers + Discord drops) in the consumer UI
    requirePhoneSignup: boolean;     // identity = a verified PHONE: no anonymous calls; free checks granted to the account on signup
    connectOnHuman: boolean;         // cost saver: don't open the (billed) ElevenLabs agent until a human is detected — OFF until bench-tested
    cheapBridgeAll: boolean;         // cost saver: route the NON-live check paths (scheduled checks, zone fires, admin call-now, /pub+/app check) through the connect-on-human bridge w/ Mapper recipes — OFF until tested per path
    oneCheckPerStorePerDay: boolean; // anti-abuse + cost: reuse a recent result instead of re-calling the same store+product within 24h
    transcriptAuth: boolean;         // privacy: a finder-attributed call's result/transcript is readable only by that finder or admin — OFF until the consumer UI sends the session token on /pub/result + /pub/live
  };
  // Bail library: proactive call-cutoff rules (cost control). `enabled` is the master switch —
  // OFF by default so nothing changes on live calls until the enforcement is wired AND tested.
  bail: {
    enabled: boolean;                // master switch — rules below do nothing until this is on
    gotAnswerHangup: boolean;        // got a clear yes/no → wrap up & hang up immediately
    voicemailBail: boolean;          // voicemail/recording detected → instant hangup
    closedBail: boolean;             // "we're closed" recording → instant hangup
    ivrMaxSeconds: number;           // stuck in a phone menu longer than this → bail
    holdMaxSeconds: number;          // left on hold longer than this → bail
    ringMaxSeconds: number;          // ringing with no pickup longer than this → bail
    maxCallSeconds: number;          // absolute cap on any call, no exceptions
  };
  // Call concurrency governor (src/calls/concurrency.ts) — the scale ceiling. `enabled` is the
  // master switch, OFF by default so nothing changes until tested. EL concurrency is per-ACCOUNT
  // (~10 on Creator); this queues overflow instead of failing it, reserves slots for instant
  // checks, caps a single user's zone, and spreads across the EL_ACCOUNTS pool.
  concurrency: {
    enabled: boolean;                // master switch — off = ungoverned (today's behavior)
    perAccountCap: number;           // EL simultaneous conversations per account (Creator ~10)
    reserveInteractive: number;      // slots kept free for instant single checks (batch can't touch)
    maxPerUser: number;              // one user's zone can't hold more than this at once
    interactiveWaitMs: number;       // an instant check waits this long for a slot, then "busy"
    batchWaitMs: number;             // a zone-sweep call waits this long for a slot before skipping
  };
  // Footer/site config — all owner-editable, no deploy needed.
  links: { x: string; discord: string; instagram: string; tiktok: string };
  support: { discord: string };     // help is Discord-only (AI bot) — no email, ever
  pages: { about: string; faq: string; terms: string; privacy: string; contact: string }; // HTML/text bodies ("" = placeholder)
  ga4Id: string;                     // GA4 measurement id (empty = analytics off)
}

export const DEFAULT_POLICY: Policy = {
  pricing: {
    perCallCents: 25,
    freeChecks: 1,
    minPurchaseCents: 500,
    // Volume discount: $0.25 → $0.20 → ~$0.167/check as you buy bigger.
    packs: [
      { key: "starter", credits: 20, cents: 500, label: "20 checks" },
      { key: "hunter", credits: 100, cents: 2000, label: "100 checks" },
      { key: "pro", credits: 300, cents: 5000, label: "300 checks" },
    ],
    sub: { cents: 999, credits: 15, label: "Check — Family", perCallCents: 18 },
  },
  finds: { publicFeed: true, headstartMin: 10, subscriberPrivateAlways: true, keepPrivateCostChecks: 0 },
  rewards: { kioskRefreshChecks: 1, referralChecks: 1, storeAddChecks: 1 }, // referral = 1+1 -> ~$1 CAC at ~$0.50/check; store-add = 1 free check when it goes live
  flags: {
    dogfoodHours: false, driverHandoff: true, scheduling: true, restockAlerts: true, smsAlerts: false,
    kiosks: true, hobby: true, thrift: true, shareCards: true, multiProduct: true, specificSets: true,
    community: false, communityAutoApprove: false, referrals: true, kioskReceipts: true,
    liveListen: false, stockSignals: true, requirePhoneSignup: false, connectOnHuman: false,
    cheapBridgeAll: false, oneCheckPerStorePerDay: false, transcriptAuth: false,
  },
  bail: {
    enabled: false,
    gotAnswerHangup: true, voicemailBail: true, closedBail: true,
    ivrMaxSeconds: 90, holdMaxSeconds: 60, ringMaxSeconds: 35, maxCallSeconds: 180,
  },
  concurrency: {
    enabled: false, perAccountCap: 10, reserveInteractive: 2, maxPerUser: 10,
    interactiveWaitMs: 3000, batchWaitMs: 20_000,
  },
  links: { x: "", discord: "", instagram: "", tiktok: "" },
  support: { discord: "" },   // set links.discord (or this) to your invite — support lives in Discord
  pages: { about: "", faq: "", terms: "", privacy: "", contact: "" },
  ga4Id: process.env.GA4_ID || "",
};

// shallow-by-section deep merge (one level into each top section is enough for this shape)
function merge(base: Policy, over: Partial<Policy>): Policy {
  const out = { ...base } as unknown as Record<string, unknown>;
  for (const k of Object.keys(over) as (keyof Policy)[]) {
    const v = over[k];
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = { ...(base[k] as object), ...(v as object) };
    else if (v !== undefined) out[k] = v;
  }
  return out as unknown as Policy;
}

let cache: { p: Policy; t: number } | null = null;
export async function getPolicy(): Promise<Policy> {
  if (cache && Date.now() - cache.t < 5000) return cache.p;
  let over: Partial<Policy> = {};
  try { over = JSON.parse((await getSetting("policy_json")) || "{}"); } catch { /* ignore */ }
  const p = merge(DEFAULT_POLICY, over);
  if (!p.ga4Id) p.ga4Id = process.env.GA4_ID || "";
  cache = { p, t: Date.now() };
  return p;
}

export async function setPolicy(patch: Partial<Policy>): Promise<Policy> {
  let cur: Partial<Policy> = {};
  try { cur = JSON.parse((await getSetting("policy_json")) || "{}"); } catch { /* ignore */ }
  const next = merge(merge(DEFAULT_POLICY, cur), patch);
  // Persist only the delta-from-default-ish full object (simple: store the merged minus process env ga4).
  await setSetting("policy_json", JSON.stringify({ ...next, ga4Id: patch.ga4Id ?? cur.ga4Id ?? "" }));
  cache = null;
  return getPolicy();
}

/** The subset safe to expose to the public consumer pages. */
export async function publicPolicy() {
  const p = await getPolicy();
  return {
    perCallCents: p.pricing.perCallCents,
    freeChecks: p.pricing.freeChecks,
    minPurchaseCents: p.pricing.minPurchaseCents,
    packs: p.pricing.packs,
    sub: p.pricing.sub,
    headstartMin: p.finds.headstartMin,
    publicFeed: p.finds.publicFeed,
    kioskRefreshChecks: p.rewards.kioskRefreshChecks,
    referralChecks: p.rewards.referralChecks,
    storeAddChecks: p.rewards.storeAddChecks,
    flags: p.flags,
    links: p.links,
    support: p.support,
    ga4Id: p.ga4Id,
  };
}
