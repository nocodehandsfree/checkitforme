// Call orchestration: trigger calls, ingest results (poll), compute green status,
// and fire due schedules.
import { and, desc, eq, gte, inArray, isNull, like, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { openState, fetchStoreHours } from "../store-hours";
import { fetchStorePhone } from "../store-phone";
import {
  accounts, callResults, categories, chains, retailers, scheduleTargets, schedules, watches, zoneRetailers, zones,
} from "../db/schema";
import { chargeOneCredit, isCompAccount } from "../billing";
import { isCallingPaused } from "../redis";
import { getPolicy } from "../policy";

/** Notify every active restock-watch for this store+category that it's back in stock, once. */
async function notifyWatches(retailerId: number, categoryId: number, store: string, label: string) {
  const open = await db.select().from(watches).where(and(
    eq(watches.retailerId, retailerId), eq(watches.categoryId, categoryId), eq(watches.active, true),
  ));
  for (const w of open) {
    await notifyContact(w.channel as "email" | "sms", w.contact,
      `🟢 Back in stock: ${store} — ${label}`,
      `${store} just confirmed ${label} is in stock. You asked us to watch this one!`,
      `${config.appUrl}/?store=${retailerId}`);
    await db.update(watches).set({ active: false, notifiedAt: Math.floor(Date.now() / 1000) }).where(eq(watches.id, w.id));
  }
}
import { config } from "../config";
import { ElevenLabsProvider } from "../voice/elevenlabs";
import { takeBridgeNav } from "../voice/bridge";
import { placeBridgeCall, roomFinalizers } from "../voice/bridge-place";
import { learnTreeFromTranscript, consumeTreeRelearn } from "./tree-learn";
import { connectAtSecFor } from "./recipe";
import { deltaStoreCall, setDeltaFinalize, tdTranscript, type TdSession } from "./tapedeck";
import type { AgentTuning } from "../voice/provider";
import { notifyInStock, notifyContact } from "./notify";
import { getSetting, setSetting } from "../db/settings";
import { specificityClause, RESTOCK_PROMPT, VOICE_DEFAULTS, PREMIUM_FOLLOWUP } from "../voice/prompts";
import { classifyVerdict, reconcile, productDetailLabel } from "../voice/verdict";

const DEFAULT_OPENER = "Heyy! I was just checking to see if you guys got any {category} in?";

// Round-robin rotation lives in rotate.ts, shared with the D-lane so both lanes advance the SAME
// counters (owner 2026-07-15: two voices on a workflow must alternate call to call, either lane).
import { rotatePick, resetRotation } from "./rotate";
export { resetRotation };

// ---- Workflows: the Voice→Designer "voice + script + persona + voice tuning" bundle, assignable
// per store / per chain / as the global default. resolveWorkflow picks one for a store and composes
// its persona; buildRestockVars applies it to the call (opener rotation, {{personality}}, voice). ----
export interface AppliedWorkflow { name: string; voiceId?: string; voices: string[]; tuning?: Record<string, unknown>; openers: string[]; personality: string; lane: string }
type AnyObj = Record<string, unknown>;
const jparse = (s: string | null, fb: unknown) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };

/** Compose a saved persona object → one paragraph for the {{personality}} prompt variable. */
function composePersona(p: AnyObj | undefined): string {
  if (!p) return "";
  const bits: string[] = [];
  // "Custom" (or blank) base = no canned vibe line — let the free-text Tone field carry it.
  const base = p.base ? String(p.base).trim().toLowerCase() : "";
  if (base && base !== "custom") bits.push(`Your overall vibe is ${base}.`);
  if (p.tone) bits.push(String(p.tone).trim());
  if (p.slang) bits.push("Use casual, natural slang the way a real local would.");
  // Affection is what controls whether you use the staff member's name. On = warm + first-name once;
  // off = stay professional and never call them by name even if they give it.
  if (p.affection) bits.push("Be warm and a little affectionate, like chatting with a friendly regular. If they tell you their name, you can use it once, naturally.");
  else bits.push("Keep it friendly but professional. Don't address them by name, even if they give it.");
  if (p.swear) bits.push("A light, casual swear word is fine if it fits naturally. keep it friendly, never aggressive.");
  if (p.greet) bits.push(`A natural way you might open: "${String(p.greet).trim()}".`);
  return bits.join(" ").trim();
}

/** Resolve a store's assigned workflow: store override → chain default → global default. */
export async function resolveWorkflow(retailerId: number, chainId: number | null): Promise<AppliedWorkflow | null> {
  const [libS, defS, chainS, storeS, personaS] = await Promise.all([
    getSetting("vt_workflows"), getSetting("vt_default_workflow"),
    getSetting("vt_chain_workflows"), getSetting("vt_store_workflows"), getSetting("vt_personas"),
  ]);
  const library = jparse(libS, []) as AnyObj[];
  if (!Array.isArray(library) || !library.length) return null;
  const byStore = jparse(storeS, {}) as Record<string, string>;
  const byChain = jparse(chainS, {}) as Record<string, string>;
  const name = byStore[String(retailerId)] || (chainId != null ? byChain[String(chainId)] : "") || (defS || "");
  if (!name) return null;
  const wf = library.find((w) => w && w.name === name);
  if (!wf) return null;
  const personas = jparse(personaS, []) as AnyObj[];
  const persona = Array.isArray(personas) ? personas.find((p) => p && p.name === wf.persona) : undefined;
  // Voice strip: `voices` (array) rotates per call, same round-robin as openers. Legacy workflows
  // that only carry the single `voiceId` behave as a 1-voice strip — identical to before.
  const voices = Array.isArray(wf.voices) && (wf.voices as unknown[]).length
    ? (wf.voices as unknown[]).map(String).filter(Boolean)
    : (wf.voiceId ? [String(wf.voiceId)] : []);
  return {
    name: String(wf.name),
    voiceId: wf.voiceId ? String(wf.voiceId) : undefined,
    voices,
    tuning: wf.tuning && typeof wf.tuning === "object" ? (wf.tuning as Record<string, unknown>) : undefined,
    openers: Array.isArray(wf.openers) ? (wf.openers as unknown[]).map(String).filter(Boolean) : [],
    personality: composePersona(persona),
    // Which call lane this workflow runs: "delta" = cheap recorded-clip D-lane, else the live agent.
    lane: typeof wf.lane === "string" ? wf.lane : "charlie",
  };
}

const VOICEMAIL_INSTRUCTION =
  "If you reach a voicemail, answering machine, or automated recording (a recorded greeting, an automated menu with no live person, or a beep) — do NOT say anything and end the call immediately. Never leave a message.";

/** Kiosk-only store: has a vending kiosk but no staffed counter that sells packs. The agent asks
 *  whether the kiosk is working/stocked rather than about a shelf shipment. Callers may also pass an
 *  explicit kioskMode (from the check request) which wins over this inference. */
const kioskOnly = (r: { hasKiosk?: boolean | null; sellsPacks?: boolean | null }): boolean =>
  !!r.hasKiosk && r.sellsPacks === false;

/**
 * Resolve the full set of agent dynamic variables for a restock call to a store, applying the
 * three-tier rule system: GLOBAL (the prompt itself) → CHAIN (chains.phoneTreeDefault) → STORE
 * (retailers.phoneTree override). One code path so scheduled calls, Listen-live, and the admin
 * "preview" all see identical instructions. `specificProduct` tightens the ask to one SKU.
 */
export async function buildRestockVars(
  retailerId: number,
  categoryId: number,
  specificProduct?: string,
  extraCategoryIds?: number[],
  kioskMode?: boolean,
): Promise<{ retailer: typeof retailers.$inferSelect; category: typeof categories.$inferSelect; chainName: string | null; dtmf: string | null; say: string | null; connectAtSec: number | null; maxTalk: number | null; voiceId: string | null; voiceTuning: Record<string, unknown> | null; dynamicVars: Record<string, string> } | null> {
  const retailer = (await db.select().from(retailers).where(eq(retailers.id, retailerId)))[0];
  if (!retailer) return null;
  const category = (await db.select().from(categories).where(eq(categories.id, categoryId)))[0];
  if (!category) return null;
  // Additional lines the user chose to check in this same call (multi-select in Runnr).
  const extraIds = (extraCategoryIds ?? []).filter((id) => id && id !== categoryId);
  const extraLabels = extraIds.length
    ? (await db.select().from(categories).where(inArray(categories.id, extraIds))).map((c) => c.label)
    : [];
  const chain = retailer.chainId
    ? (await db.select().from(chains).where(eq(chains.id, retailer.chainId)))[0]
    : undefined;

  // CHAIN → STORE precedence: a store override wins, else the chain default, else nothing.
  const phoneTree = retailer.phoneTree ?? chain?.phoneTreeDefault ?? "";
  // Voicemail hang-up: per-store flag (chains.hangupOnVoicemail) wins when set; null = fall back to
  // the GLOBAL voicemail_hangup setting (on unless explicitly "false"). This is what the Settings-page
  // per-store toggle controls.
  const globalVoicemailHangup = (await getSetting("voicemail_hangup")) !== "false";
  const voicemailHangup = chain?.hangupOnVoicemail ?? globalVoicemailHangup;
  const voicemailPolicy = voicemailHangup ? VOICEMAIL_INSTRUCTION : "";
  // Rotation: round-robin opener variants if set, so calling the SAME store gives the SAME voice but
  // slightly different phrasing each time (matches the EL-dial path in triggerCall). Falls back to the
  // single vt_opening opener. Voice itself is NOT rotated here — same store, same voice, varied script.
  // Resolve the store's assigned workflow (store → chain → default). When set, its opener rotation,
  // persona and voice override this call; otherwise we fall back to the global opener settings.
  const workflow = await resolveWorkflow(retailerId, retailer.chainId);
  const openerVariants = (workflow?.openers.length ? workflow.openers
    : ((await getSetting("vt_opener_variants")) || "").split("\n").map((s) => s.trim()).filter(Boolean));
  // Per-workflow rotation key so each workflow round-robins its OWN openers independently (and the
  // "Reset rotation" button can reset just this one). No workflow → the shared global opener rotation.
  const openerTemplate = rotatePick(workflow ? "opener:" + workflow.name : "opener", openerVariants) || (await getSetting("vt_opening")) || DEFAULT_OPENER;
  const openingLine = openerTemplate.replace(/\{category\}/g, category.label);
  const clarification = specificityClause((specificProduct ?? "").trim());

  // Bravo voice nav: build the spoken plan ("no@26,front@38,…") from the locked recipe so the bridge
  // speaks it with cheap TTS before opening the agent — keeps voice-IVR stores (CVS) cheap.
  let say: string | null = null;
  if (chain?.navType === "voice" && chain.navRecipe) {
    try {
      const r = JSON.parse(chain.navRecipe) as { steps?: Array<{ action?: string; value?: string; atSec?: number }> };
      const ss = (r.steps ?? []).filter((s) => s.action === "say" && s.value);
      if (ss.length) say = ss.map((s) => `${String(s.value).replace(/[,@]/g, " ").trim()}@${Math.round(s.atSec ?? 0)}`).join(",");
    } catch { /* ignore bad recipe */ }
  }

  return {
    retailer, category, chainName: chain?.name ?? null,
    // Bridge-level keypad shortcut (chain-wide): pressed by OUR code at a fixed time, not the LLM.
    dtmf: chain?.dtmfShortcut ?? null,
    say,
    // ABC deterministic hand-off: open the billed agent at the chain's LEARNED time-to-human.
    // Guarded (connectAtSecFor): direct-answer chains and chains with no tree evidence NEVER get a
    // timer — the timer mutes the agent until it fires (the 2026-07-02 silent-agent bug). null =
    // bridge falls back to VAD + hold-timeout.
    connectAtSec: connectAtSecFor(chain),
    // Per-store talk cap (chains.maxTalkSeconds). Null = caller falls back to the global bail cap.
    maxTalk: chain?.maxTalkSeconds ?? null,
    // Workflow voice strip: rotates round-robin per call on this workflow's own counter (same pattern
    // as openers; "Reset rotation" restarts it). One voice in the strip = fixed voice, same as before.
    voiceId: (workflow ? rotatePick("voice:" + workflow.name, workflow.voices) : undefined) ?? null,
    voiceTuning: workflow?.tuning ?? null,
    dynamicVars: {
      internal_call_id: "0",
      category: category.label,
      retailer_name: retailer.name || "the store",
      location: retailer.location || "",
      clarification,
      phone_tree: phoneTree,
      special_instructions: retailer.specialInstructions ?? "",
      voicemail_policy: voicemailPolicy,
      personality: workflow?.personality || "",
      opening_line: openingLine,
      // Listen-live (Runnr) asks about exactly the lines the user selected — the primary plus
      // any extras they multi-picked. It never auto-cascades from the store's carries field.
      other_categories: extraLabels.join(", "),
      ask_shipment_day: "",
      // Kiosk-only store → the prompt asks about the vending kiosk, not a shelf shipment.
      // Explicit request flag wins; otherwise inferred from the store's flags.
      kiosk_mode: (kioskMode ?? kioskOnly(retailer)) ? "true" : "",
      // Preview / admin / scheduled paths default to the premium follow-up; the consumer trigger
      // path overrides this to the free (no-follow-up) text for non-subscribers.
      premium_followup: PREMIUM_FOLLOWUP,
    },
  };
}

/** Render the exact instructions the agent will receive for a store, by substituting the resolved
 *  dynamic variables into the canonical prompt. Powers the admin "Preview" (the visibility/moat). */
export async function previewStorePrompt(
  retailerId: number,
  categoryId: number,
  specificProduct?: string,
): Promise<{ retailerName: string; chainName: string | null; usedStoreOverride: boolean; phoneTree: string; dtmf: string | null; prompt: string } | null> {
  const r = await buildRestockVars(retailerId, categoryId, specificProduct);
  if (!r) return null;
  const prompt = RESTOCK_PROMPT.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => r.dynamicVars[k] ?? "");
  return {
    retailerName: r.retailer.name,
    chainName: r.chainName,
    usedStoreOverride: !!r.retailer.phoneTree,
    phoneTree: r.dynamicVars.phone_tree,
    dtmf: r.dtmf,
    prompt,
  };
}

/** Normalize a user-entered phone to E.164 (defaults to US +1). */
function toE164(p: string): string {
  const trimmed = (p || "").trim();
  if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return "+" + digits;
}

export const provider = new ElevenLabsProvider({
  apiKey: config.voice.apiKey,
  agentId: config.voice.agentId,
  phoneNumberId: config.voice.phoneNumberId,
  webhookSecret: config.voice.webhookSecret,
});

interface TriggerArgs {
  retailerId: number;
  categoryId: number;
  scheduleId?: number;
  mode?: "restock" | "carry"; // restock = known seller shipment check; carry = "do you sell it?" prospecting
  question?: string;       // template with {category}
  clarification?: string;
  askShipmentDay?: boolean;
  voiceId?: string;
  toOverride?: string;     // Simulator: dial this number instead of the store's, but still record against the store
  specificProduct?: string; // Decision tree B: only green if THIS exact set/product is in (e.g. "151 booster boxes"). Empty = general restock.
  agentOverride?: string;   // Test Bench: run on this agent (the bench clone) instead of the live one
  openingTemplate?: string; // Test Bench: use the DRAFT opener instead of the live vt_opening setting
  finderUserId?: string;    // clerk id of whoever placed it (for finds privacy/headstart attribution)
  isPrivate?: boolean;      // keep this find out of the public feed (subscriber perk / paid privacy)
  zoneRunId?: string;       // groups this check into a zone sweep run (Manage Zones report)
  kioskMode?: boolean;      // kiosk-only store → agent asks about the vending kiosk, not a shelf shipment (else inferred from the store)
  force?: boolean;          // skip the 24h one-check-per-store dedup (admin "check again" places a real call every time)
}

/** Most recent COMPLETED check by this finder for a store+category within `withinHours` (default 24h).
 *  Powers one-check-per-store-per-day dedup. */
export async function findRecentCheck(finderUserId: string, retailerId: number, categoryId: number, withinHours = 24) {
  const since = Math.floor(Date.now() / 1000) - withinHours * 3600;
  return (await db.select().from(callResults).where(and(
    eq(callResults.finderUserId, finderUserId),
    eq(callResults.retailerId, retailerId),
    eq(callResults.categoryId, categoryId),
    eq(callResults.status, "completed"),
    gte(callResults.startedAt, since),
  )).orderBy(desc(callResults.startedAt)).limit(1))[0] ?? null;
}

/** Place one call and record it. */
/** Is the finder a paying member (or comp/owner)? Drives the premium product-type follow-up.
 *  No finder (admin / scheduled / comp paths) defaults to the full premium experience. */
async function finderIsPremium(finderUserId?: string | null): Promise<boolean> {
  if (!finderUserId) return true;
  const acct = (await db.select().from(accounts).where(eq(accounts.clerkUserId, finderUserId)))[0];
  return !!acct && (isCompAccount(acct) || acct.subscription === "active");
}

export async function triggerCall(a: TriggerArgs) {
  if (await isCallingPaused()) throw new Error("calling_paused"); // global spend kill-switch
  const retailer = (await db.select().from(retailers).where(eq(retailers.id, a.retailerId)))[0];
  if (!retailer) throw new Error(`retailer ${a.retailerId} not found`);
  // Site-rail stores (e.g. Micro Center) carry a synthetic "nophone:" key — there is no line to dial.
  if (!a.toOverride && retailer.phone.startsWith("nophone:")) throw new Error(`retailer ${a.retailerId} has no dialable phone (site-check store)`);
  // Don't dial a store we know is closed (skip the check for bench/simulator calls to your own phone).
  if (!a.toOverride) {
    const os = openState(retailer.hours, retailer.timezone);
    if (os.known && !os.open) throw new Error("store_closed:" + os.label);
  }
  const category = (await db.select().from(categories).where(eq(categories.id, a.categoryId)))[0];
  if (!category) throw new Error(`category ${a.categoryId} not found`);

  // One-check-per-store-per-day (flag-gated): reuse a recent confirmed/answered result instead of
  // re-calling the same store+product within 24h — anti-abuse + cost. Returns the cached call row.
  // Owner-only demo store ("Fun") is exempt — the owner re-tests it repeatedly while rehearsing.
  if (a.finderUserId && !a.force && !a.toOverride && !retailer.ownerOnly && (await getPolicy()).flags.oneCheckPerStorePerDay) {
    const recent = await findRecentCheck(a.finderUserId, retailer.id, category.id);
    if (recent) return { ...recent, deduped: true };
  }

  // Default the call mode from the store's known status (verified → restock, unverified → carry).
  const mode = a.mode ?? (retailer.stockStatus === "unverified" ? "carry" : "restock");
  const agentId = a.agentOverride ?? (mode === "carry" ? config.voice.carryAgentId : config.voice.agentId);
  const defaultQ = mode === "carry" ? config.carryQuestion : config.defaultQuestion;

  const chain = retailer.chainId
    ? (await db.select().from(chains).where(eq(chains.id, retailer.chainId)))[0]
    : undefined;
  const phoneTree = retailer.phoneTree ?? chain?.phoneTreeDefault ?? undefined;
  const question = (a.question ?? defaultQ).replace(/\{category\}/g, category.label);

  // Apply the store's assigned workflow (store → chain → global default), if any. Additive: when no
  // workflow resolves, voice / opener / persona fall back to the exact global behavior below, so
  // stores with no assignment behave identically to before.
  const wf = await resolveWorkflow(retailer.id, retailer.chainId ?? null).catch(() => null);

  // Other tracked lines this store carries (for the restock cascade), excluding the primary.
  const otherCategories = (retailer.carries ?? "")
    .split(",").map((s) => s.trim()).filter((s) => s && s !== category.label);

  // Master voicemail toggle (default on): hang up on voicemail, never leave a message.
  const voicemailPolicy = (await getSetting("voicemail_hangup")) !== "false" ? VOICEMAIL_INSTRUCTION : "";

  // Warm, editable opener (Voice tuning control). {category} is interpolated.
  // Test Bench passes its DRAFT opener via openingTemplate; live calls read the vt_opening setting.
  // Rotation (optional): if opener variants are set, round-robin them so the same store doesn't hear
  // the identical line every time (same voice, slightly different phrasing next call).
  // Workflow openers win when the assigned workflow defines them (rotated on their own per-workflow
  // counter); otherwise the global vt_opener_variants list rotates as before.
  const wfOpeners = wf?.openers ?? [];
  const openerVariants = wfOpeners.length ? wfOpeners : ((await getSetting("vt_opener_variants")) || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const openerTemplate = a.openingTemplate ?? (rotatePick(wfOpeners.length ? "opener:" + wf!.name : "opener", openerVariants) || (await getSetting("vt_opening")) || DEFAULT_OPENER);
  const openingLine = openerTemplate.replace(/\{category\}/g, category.label);

  // Two decision trees off "verified": specific product check vs general restock.
  // A specific product (from the call or the store/schedule clarification) tightens the ask.
  const specific = (a.specificProduct ?? a.clarification ?? "").trim();
  const clarification = mode === "restock" ? specificityClause(specific) : a.clarification;

  const [row] = await db.insert(callResults).values({
    scheduleId: a.scheduleId ?? null,
    retailerId: retailer.id,
    categoryId: category.id,
    mode,
    status: "dialing",
    finderUserId: a.finderUserId ?? null, zoneRunId: a.zoneRunId ?? null,
    isPrivate: a.isPrivate ?? false,
  }).returning();

  // ---- Delta lane (workflow.lane === "delta"): run the cheap recorded-clip D-lane instead of the
  // live agent. Dials the store; the D-lane engine handles the call and the registered finalize hook
  // writes the verdict when it ends. Real store calls only — bench/simulator overrides keep the live path.
  if (wf?.lane === "delta" && !a.toOverride) {
    const dr = await deltaStoreCall({
      callId: row.id, toNumber: retailer.phone, retailerId: retailer.id, categoryId: category.id,
      chainId: retailer.chainId ?? null, finderUserId: a.finderUserId ?? null,
      retailerName: retailer.name, categoryLabel: category.label,
    }, wf.name);
    if (dr.error) { await db.update(callResults).set({ status: "failed", summary: dr.error }).where(eq(callResults.id, row.id)); throw new Error(dr.error); }
    // Synthetic provider id ("delta:<session>") so the consumer UI can follow a D-lane call through the
    // SAME endpoints as an EL call (/pub/live, /pub/result, history deep-links). The EL poller skips it.
    const deltaCid = `delta:${dr.id}`;
    await db.update(callResults).set({ status: "in_progress", providerCallId: deltaCid }).where(eq(callResults.id, row.id));
    return { ...row, providerCallId: deltaCid, status: "in_progress" as const };
  }

  try {
    const { providerCallId, callSid } = await provider.startCall({
      callId: row.id,
      toNumber: a.toOverride ? toE164(a.toOverride) : retailer.phone,
      retailerName: retailer.name,
      location: retailer.location,
      productName: category.label,
      question,
      agentId,
      // Voice: explicit override → rotate the global voice pool → rotate the workflow's voice strip →
      // default. The pool wins over a workflow's strip so an owner-configured GLOBAL rotation is never
      // silently disabled by a default workflow; both rotations are live round-robins.
      voiceId: a.voiceId ?? rotatePick("voice", ((await getSetting("vt_voice_pool")) || "").split(",").map((s) => s.trim()).filter(Boolean)) ?? (wf ? rotatePick("voice:" + wf.name, wf.voices) : undefined) ?? config.voice.defaultVoiceId,
      clarification,
      openingLine: mode === "restock" ? openingLine : undefined,
      phoneTree,
      specialInstructions: retailer.specialInstructions ?? undefined,
      otherCategories: mode === "restock" ? otherCategories : [],
      askShipmentDay: a.askShipmentDay ?? true, // Delta everywhere: default ON — ask the restock day on a no.
      voicemailPolicy,
      // Persona from the assigned workflow fills {{personality}}. Empty when no workflow → same as before.
      personalityTone: wf?.personality || undefined,
      // Kiosk-only store → agent asks about the vending kiosk. Explicit request flag wins; else inferred.
      kioskMode: a.kioskMode ?? kioskOnly(retailer),
      // Premium gate: subscribers (and comp/owner) get the product-type follow-up; free finders skip it.
      premiumFollowup: await finderIsPremium(a.finderUserId),
    });
    await db.update(callResults)
      .set({ providerCallId, status: "in_progress" })
      .where(eq(callResults.id, row.id));
    return { ...row, providerCallId, callSid, status: "in_progress" as const };
  } catch (e) {
    await db.update(callResults).set({ status: "failed", summary: String(e) }).where(eq(callResults.id, row.id));
    throw e;
  }
}

/** Place a HEADLESS connect-on-human bridge check (no listen room) — the cheap lane for the
 *  machine-initiated paths (scheduled checks, zone fires, admin call-now, plain /pub+/app checks).
 *  Same guards + callResults linkage as triggerCall, but the dial rides placeBridgeCall, so the
 *  Mapper recipe artifacts (dtmf / spoken nav / connectAtSec) navigate the tree and the billed EL
 *  agent opens only once a human answers. Delta-lane stores still route to the D-lane engine via
 *  triggerCall. Gated by policy.flags.cheapBridgeAll at each call site — OFF = nothing changes. */
export async function bridgeCheckCall(a: TriggerArgs) {
  // Only the plain restock check rides the bridge lane. Carry-mode intel calls, custom question
  // templates, and any override (simulator/bench dial your own phone, explicit agent) keep the
  // direct path — those aren't tree-navigation checks, so the recipe artifacts don't apply.
  if ((a.mode ?? "restock") !== "restock" || a.question || a.voiceId || a.agentOverride || a.toOverride) return triggerCall(a);
  if (await isCallingPaused()) throw new Error("calling_paused"); // global spend kill-switch
  const retailer = (await db.select().from(retailers).where(eq(retailers.id, a.retailerId)))[0];
  if (!retailer) throw new Error(`retailer ${a.retailerId} not found`);
  if (retailer.phone.startsWith("nophone:")) throw new Error(`retailer ${a.retailerId} has no dialable phone (site-check store)`);
  const os = openState(retailer.hours, retailer.timezone);
  if (os.known && !os.open) throw new Error("store_closed:" + os.label);
  const category = (await db.select().from(categories).where(eq(categories.id, a.categoryId)))[0];
  if (!category) throw new Error(`category ${a.categoryId} not found`);

  // Same dedup + Delta routing decisions as triggerCall — one policy, two lanes.
  if (a.finderUserId && !a.force && !retailer.ownerOnly && (await getPolicy()).flags.oneCheckPerStorePerDay) {
    const recent = await findRecentCheck(a.finderUserId, retailer.id, category.id);
    if (recent) return { ...recent, deduped: true };
  }
  const wf = await resolveWorkflow(retailer.id, retailer.chainId ?? null).catch(() => null);
  if (wf?.lane === "delta") return triggerCall(a); // D-lane is already the cheap engine for its stores

  const v = await buildRestockVars(a.retailerId, a.categoryId, a.specificProduct ?? a.clarification, undefined, a.kioskMode);
  if (!v) throw new Error("restock vars unavailable");

  const [row] = await db.insert(callResults).values({
    scheduleId: a.scheduleId ?? null,
    retailerId: retailer.id,
    categoryId: category.id,
    mode: "restock",
    status: "dialing",
    finderUserId: a.finderUserId ?? null, zoneRunId: a.zoneRunId ?? null,
    isPrivate: a.isPrivate ?? false,
  }).returning();

  // Phone-first: dial AS the finder's verified number when present (same as the live bridge path).
  let from: string | undefined;
  if (a.finderUserId) {
    const acct = (await db.select().from(accounts).where(eq(accounts.clerkUserId, a.finderUserId)))[0];
    if (acct?.callerId) from = acct.callerId;
  }
  const pol = await getPolicy();
  const r = await placeBridgeCall(v.retailer.phone, v.dynamicVars, (convId) => {
    // Human reached, billed agent open — hand the row to the normal EL ingest by conv id.
    db.update(callResults).set({ providerCallId: convId, status: "in_progress" }).where(eq(callResults.id, row.id))
      .catch((e) => console.error("bridge check connect update:", e));
  }, v.dtmf, { from, timeLimitSec: v.maxTalk ?? pol.bail.maxCallSeconds, say: v.say, connectAtSec: v.connectAtSec ?? undefined, voiceId: v.voiceId, voiceTuning: v.voiceTuning });
  if (r.error || !r.room) {
    await db.update(callResults).set({ status: "failed", summary: r.error || "bridge call failed" }).where(eq(callResults.id, row.id));
    throw new Error(r.error || "bridge call failed");
  }
  const providerCallId = `bridge:${r.room}`;
  await db.update(callResults).set({ providerCallId }).where(eq(callResults.id, row.id));
  // If the call ends without ever reaching a human (voicemail hang-up, busy, no answer), no conv id
  // ever lands — the room finalizer closes the row so zone runs / schedules still reach a terminal state.
  roomFinalizers.set(r.room, (twilioStatus) => {
    void (async () => {
      const cur = (await db.select().from(callResults).where(eq(callResults.id, row.id)))[0];
      if (!cur || cur.status !== "dialing") return; // conv id landed → EL ingest owns the verdict
      // Twilio's terminal status IS the real reason on this lane (EL never joined): map it to the
      // statuses-registry key so the customer sees busy/bad-number, never a bare "call failed".
      const statusKey = ({ busy: "busy", failed: "bad_number" } as Record<string, string>)[twilioStatus] ?? "nobody_answered";
      await db.update(callResults).set({
        status: "no_answer", confirmed: null, statusKey,
        summary: `Bridge call ended before a human answered (${twilioStatus}).`,
        completedAt: Math.floor(Date.now() / 1000),
      }).where(eq(callResults.id, row.id));
    })().catch((e) => console.error("bridge check finalize:", e));
  });
  // Same response contract as the direct path: callers/clients see in_progress + an id to poll.
  return { ...row, providerCallId, status: "in_progress" as const };
}

/** Write the verdict for a finished Delta (D-lane) store call. Registered as the tapedeck finalize
 *  hook so the engine needs no DB import. Mirrors the EL-lane finalize in ingestPending: map the
 *  clip-flow outcome to a call_results verdict, charge once on a definitive answer, notify, and stamp
 *  the restock day. Escalated calls (Charlie barged in) are finalized by the EL poll, not here. */
async function finalizeDeltaSession(s: TdSession): Promise<void> {
  const chk = s.check;
  if (!chk || s.escalated) return;
  const now = Math.floor(Date.now() / 1000);
  const answered = !!s.opened; // opener only fires once the pickup is heard
  const status = answered ? "completed" : "no_answer";
  const confirmed = answered ? (s.resConfirmed ?? null) : null;
  const statusKey = answered ? (s.resStatusKey || "no_clear_answer") : "nobody_answered";
  const definitive = confirmed === true || confirmed === false;
  await db.update(callResults).set({
    status,
    confirmed,
    statusKey,
    productDetail: s.resProduct || null,
    shipmentDayHeard: s.resDay || null,
    transcript: tdTranscript(s),
    summary: `Delta lane (${s.workflow}): ${statusKey}`,
    completedAt: now,
    callSeconds: Math.round((Date.now() - s.startMs) / 1000),
  }).where(eq(callResults.id, chk.callId));

  // Charge one credit on a definitive in/out answer, exactly once (atomic).
  if (chk.finderUserId && status === "completed" && definitive) await chargeCallOnce(chk.callId, chk.finderUserId);

  if (confirmed === true) {
    await notifyInStock(chk.retailerName, chk.categoryLabel, chk.retailerId, s.resDay || undefined);
    await notifyWatches(chk.retailerId, chk.categoryId, chk.retailerName, chk.categoryLabel);
  }
  if (s.resDay) await db.update(retailers).set({ shipmentDay: s.resDay }).where(eq(retailers.id, chk.retailerId));
}
setDeltaFinalize(finalizeDeltaSession);

/** Current voice-tuning controls (with sensible defaults). */
export async function getVoiceTuning() {
  const num = async (k: string, d: number) => {
    const v = await getSetting(k);
    return v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d;
  };
  return {
    opening: (await getSetting("vt_opening")) || DEFAULT_OPENER,
    speed: await num("vt_speed", VOICE_DEFAULTS.speed),
    stability: await num("vt_stability", VOICE_DEFAULTS.stability),
    llm: (await getSetting("vt_llm")) || VOICE_DEFAULTS.llm,
  };
}

/** Save tuning controls; push cadence/warmth/LLM (and optionally the canonical prompt) to the live agent. */
export async function applyVoiceTuning(p: {
  opening?: string; speed?: number; stability?: number; llm?: string; pushPrompt?: boolean; turnEagerness?: string;
  turnTimeout?: number; softTimeoutSecs?: number; softTimeoutMsg?: string;
}) {
  if (p.opening !== undefined) await setSetting("vt_opening", p.opening);
  if (p.speed !== undefined) await setSetting("vt_speed", String(p.speed));
  if (p.stability !== undefined) await setSetting("vt_stability", String(p.stability));
  if (p.llm !== undefined && p.llm !== "") await setSetting("vt_llm", p.llm);

  const patch: AgentTuning = {};
  if (p.speed !== undefined) patch.speed = p.speed;
  if (p.stability !== undefined) patch.stability = p.stability;
  if (p.turnEagerness !== undefined) patch.turnEagerness = p.turnEagerness;
  if (p.turnTimeout !== undefined) patch.turnTimeout = p.turnTimeout;
  if (p.softTimeoutSecs !== undefined) patch.softTimeoutSecs = p.softTimeoutSecs;
  if (p.softTimeoutMsg !== undefined) patch.softTimeoutMsg = p.softTimeoutMsg;
  if (p.llm !== undefined && p.llm !== "") patch.llm = p.llm;
  // Re-push always re-asserts the full known-good config (prompt + LLM + tokens) so the agent can't drift.
  if (p.pushPrompt) {
    patch.prompt = RESTOCK_PROMPT;
    patch.maxTokens = VOICE_DEFAULTS.maxTokens;
    patch.llm = (await getSetting("vt_llm")) || VOICE_DEFAULTS.llm;
  }
  if (Object.keys(patch).length) await provider.updateAgent(config.voice.agentId, patch);

  return getVoiceTuning();
}

// ---- Voice studio: list / select / clone (ElevenLabs) ----
const EL_API = "https://api.elevenlabs.io/v1";
export async function getActiveVoiceId(): Promise<string> {
  return (await getSetting("active_voice_id")) || config.voice.defaultVoiceId;
}
/** List the account's ElevenLabs voices (premade + cloned) and which one is live. */
export async function listVoices() {
  const res = await fetch(`${EL_API}/voices`, { headers: { "xi-api-key": config.voice.apiKey } });
  if (!res.ok) throw new Error(`voices list failed: ${res.status}`);
  const d = await res.json() as { voices?: Array<{ voice_id: string; name: string; category?: string; labels?: Record<string, string> }> };
  const active = await getActiveVoiceId();
  return {
    active,
    voices: (d.voices || []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category || "premade", cloned: v.category === "cloned" })),
  };
}
/** Make a voice the one every live store call speaks as (pushes to the live + bench agents). */
export async function setActiveVoice(voiceId: string) {
  await provider.updateAgent(config.voice.agentId, { voiceId });
  if (config.voice.benchAgentId) { try { await provider.updateAgent(config.voice.benchAgentId, { voiceId }); } catch { /* bench optional */ } }
  await setSetting("active_voice_id", voiceId);
  return { ok: true, active: voiceId };
}
/** Clone a new voice from one or more recorded samples; returns the new voice id. */
export async function cloneVoice(name: string, files: File[]) {
  const fd = new FormData();
  fd.append("name", name);
  fd.append("remove_background_noise", "true");
  files.forEach((f, i) => fd.append("files", f, (f as File).name || `sample${i}.webm`));
  const res = await fetch(`${EL_API}/voices/add`, { method: "POST", headers: { "xi-api-key": config.voice.apiKey }, body: fd });
  if (!res.ok) throw new Error(`clone failed: ${res.status} ${await res.text()}`);
  const d = await res.json() as { voice_id?: string };
  return { ok: true, voiceId: d.voice_id };
}

// ---- Test Bench (DRAFT) voice tuning ----
// The bench agent is a clone of the live restock agent (same prompt/brain/extraction). Draft
// tuning + Test Bench self-calls run on it, so the owner hears EXACTLY what a store would —
// but live store calls are untouched until the explicit "Apply to all stores" push.
const SANDBOX_FIELDS = ["speed", "stability", "style", "speakerBoost", "latency", "modelId", "turnEagerness", "turnTimeout", "softTimeoutSecs", "softTimeoutMsg"] as const;

function benchAgent(): string {
  if (!config.voice.benchAgentId) throw new Error("Test-bench agent not configured (ELEVENLABS_BENCH_AGENT_ID)");
  return config.voice.benchAgentId;
}

/** The DRAFT (test-bench) voice + script, as the tuning panel should show it. */
export async function getSandboxTuning() {
  const t = await provider.getAgentTuning(benchAgent());
  return {
    speed: t.speed ?? VOICE_DEFAULTS.speed,
    stability: t.stability ?? VOICE_DEFAULTS.stability,
    style: t.style ?? 0,
    speakerBoost: t.speakerBoost ?? false,
    latency: t.latency ?? 4,
    modelId: t.modelId ?? "eleven_turbo_v2",
    turnEagerness: t.turnEagerness ?? "normal",
    turnTimeout: t.turnTimeout ?? null,
    softTimeoutSecs: t.softTimeoutSecs ?? null,
    softTimeoutMsg: t.softTimeoutMsg ?? "",
    llm: t.llm ?? VOICE_DEFAULTS.llm,
    opening: (await getSetting("vt_opening_draft")) ?? ((await getSetting("vt_opening")) || DEFAULT_OPENER),
  };
}

/** The LIVE store voice (what every real call uses right now) — powers the "Live now" strip. */
export async function getLiveVoice() {
  const t = await provider.getAgentTuning(config.voice.agentId);
  return {
    speed: t.speed ?? VOICE_DEFAULTS.speed,
    stability: t.stability ?? VOICE_DEFAULTS.stability,
    latency: t.latency ?? 4,
    modelId: t.modelId ?? "eleven_turbo_v2",
    turnEagerness: t.turnEagerness ?? "normal",
    turnTimeout: t.turnTimeout ?? null,
    softTimeoutSecs: t.softTimeoutSecs ?? null,
    softTimeoutMsg: t.softTimeoutMsg ?? "",
    llm: t.llm ?? VOICE_DEFAULTS.llm,
    opening: (await getSetting("vt_opening")) || DEFAULT_OPENER,
  };
}

/** Save draft tuning to the TEST-BENCH agent only. Live store calls are untouched. */
export async function applySandboxTuning(p: AgentTuning & { opening?: string }) {
  const patch: AgentTuning = {};
  for (const k of SANDBOX_FIELDS) if (p[k] !== undefined) (patch as Record<string, unknown>)[k] = p[k];
  if (p.llm !== undefined && p.llm !== "") patch.llm = p.llm;
  if (Object.keys(patch).length) await provider.updateAgent(benchAgent(), patch);
  if (p.opening !== undefined) await setSetting("vt_opening_draft", p.opening);
  return getSandboxTuning();
}

/** The deliberate go-live: copy the draft voice + opener + LLM onto BOTH store agents. */
export async function applySandboxToStores() {
  const t = await getSandboxTuning();
  const patch: AgentTuning = {
    speed: t.speed, stability: t.stability, style: t.style,
    speakerBoost: t.speakerBoost, latency: t.latency, modelId: t.modelId,
    turnEagerness: t.turnEagerness, llm: t.llm,
    ...(t.turnTimeout != null ? { turnTimeout: t.turnTimeout } : {}),
    ...(t.softTimeoutSecs != null ? { softTimeoutSecs: t.softTimeoutSecs, softTimeoutMsg: t.softTimeoutMsg } : {}),
  };
  const targets = [config.voice.agentId, config.voice.carryAgentId].filter(Boolean) as string[];
  for (const id of targets) await provider.updateAgent(id, patch);
  // Promote the draft opener + persist the tuning settings so everything reads consistently.
  await setSetting("vt_opening", t.opening);
  await setSetting("vt_speed", String(t.speed));
  await setSetting("vt_stability", String(t.stability));
  await setSetting("vt_llm", t.llm);
  return { applied: targets.length, tuning: t };
}

/** Place a Test Bench self-call: the bench agent (live brain + DRAFT voice) calls the owner's
 *  phone with the chosen store's full context. Syncs the bench's behavior from the live agent
 *  first so prompt/extraction can never drift. */
export async function benchTestCall(a: {
  retailerId: number; categoryId: number; mode?: "restock" | "carry";
  toNumber: string; specificProduct?: string; voiceId?: string;
}) {
  const bench = benchAgent();
  await provider.syncAgentBehavior(config.voice.agentId, bench);
  // Optional: ring this test call in a specific (e.g. cloned) voice — applied to the BENCH agent
  // only, so the live store voice is never touched. No voiceId = whatever the bench already has.
  if (a.voiceId) { try { await provider.updateAgent(bench, { voiceId: a.voiceId }); } catch { /* voice optional */ } }
  const opening = (await getSetting("vt_opening_draft")) ?? undefined;
  return triggerCall({
    retailerId: a.retailerId, categoryId: a.categoryId, mode: a.mode ?? "restock",
    toOverride: a.toNumber, specificProduct: a.specificProduct,
    agentOverride: bench, openingTemplate: opening,
    // Keep the bench's picked voice authoritative when workflow-voice preference kicks in below.
    voiceId: a.voiceId,
  });
}

// ---- Script library: named tuning profiles (opener + sliders + LLM) you can save & reload ----
export interface VoicePreset { name: string; opening: string; speed: number; stability: number; llm: string }

export async function listPresets(): Promise<VoicePreset[]> {
  try { return JSON.parse((await getSetting("vt_presets")) || "[]"); } catch { return []; }
}

export async function savePreset(p: Partial<VoicePreset>): Promise<VoicePreset[]> {
  const name = (p.name ?? "").trim();
  if (!name) throw new Error("Name this script first");
  const list = await listPresets();
  const entry: VoicePreset = {
    name,
    opening: p.opening ?? "",
    speed: Number(p.speed ?? VOICE_DEFAULTS.speed),
    stability: Number(p.stability ?? VOICE_DEFAULTS.stability),
    llm: p.llm || VOICE_DEFAULTS.llm,
  };
  const i = list.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) list[i] = entry; else list.push(entry);
  await setSetting("vt_presets", JSON.stringify(list));
  return list;
}

export async function deletePreset(name: string): Promise<VoicePreset[]> {
  const list = (await listPresets()).filter((x) => x.name.toLowerCase() !== (name ?? "").trim().toLowerCase());
  await setSetting("vt_presets", JSON.stringify(list));
  return list;
}

/** Load a saved preset INTO THE DRAFT (test bench). Goes live only via "Apply to all stores". */
export async function applyPreset(name: string) {
  const p = (await listPresets()).find((x) => x.name.toLowerCase() === (name ?? "").trim().toLowerCase());
  if (!p) throw new Error("Preset not found");
  return applySandboxTuning({ opening: p.opening, speed: p.speed, stability: p.stability, llm: p.llm });
}


// (~1,000 for voice + LLM pass-through), avg connected call ~85s ≈ ~1,700 credits.
const CREDITS_PER_MIN = 1200;
const CREDITS_PER_CALL = 1700;

/** ElevenLabs credit status for the dashboard. Uses the live balance if the key has
 *  `user_read`; otherwise estimates usage from the usage API + a manually-set plan limit. */
export async function getCreditStatus() {
  const H = { "xi-api-key": config.voice.apiKey };

  const shape = (used: number, limit: number | null, resetUnix: number | null, source: "live" | "estimated") => {
    const remaining = limit != null ? Math.max(0, limit - used) : null;
    return {
      source, used, limit, remaining,
      pct: limit ? Math.min(100, Math.round((used / limit) * 100)) : null,
      resetUnix,
      creditsPerMin: CREDITS_PER_MIN, creditsPerCall: CREDITS_PER_CALL,
      minutesUsed: Math.round(used / CREDITS_PER_MIN),
      minutesLeft: remaining != null ? Math.round(remaining / CREDITS_PER_MIN) : null,
      callsLeft: remaining != null ? Math.floor(remaining / CREDITS_PER_CALL) : null,
    };
  };

  // 1) Live balance (requires the key to have the user_read permission).
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: H });
    if (r.ok) {
      const s = (await r.json()) as { character_count?: number; character_limit?: number; next_character_count_reset_unix?: number };
      if (typeof s.character_limit === "number") {
        return shape(s.character_count ?? 0, s.character_limit, s.next_character_count_reset_unix ?? null, "live");
      }
    }
  } catch { /* fall through to estimate */ }

  // 2) Estimate: sum usage over the last 31 days; limit comes from a manually-entered plan size.
  let used = 0;
  try {
    const end = Date.now();
    const start = end - 31 * 24 * 3600 * 1000;
    const r = await fetch(`https://api.elevenlabs.io/v1/usage/character-stats?start_unix=${start}&end_unix=${end}`, { headers: H });
    if (r.ok) {
      const d = (await r.json()) as { usage?: { All?: number[] } };
      used = Math.round((d.usage?.All ?? []).reduce((a, b) => a + b, 0));
    }
  } catch { /* leave used at 0 */ }
  const lim = Number(await getSetting("el_credit_limit"));
  return shape(used, Number.isFinite(lim) && lim > 0 ? lim : null, null, "estimated");
}

/** Charge the finder ONE credit for a call, exactly once. Atomic: the `charged_at` null→now flip is
 *  the race guard, so concurrent finalizers (poller + webhook + retries, across instances) can't
 *  double-bill. Returns true only if a credit was actually taken (comp accounts are marked charged
 *  but pay nothing). */
export async function chargeCallOnce(callId: number, finderUserId: string): Promise<boolean> {
  const won = await db.update(callResults).set({ chargedAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(callResults.id, callId), isNull(callResults.chargedAt)));
  if ((won.rowsAffected ?? 0) === 0) return false; // already charged
  const acct = (await db.select().from(accounts).where(eq(accounts.clerkUserId, finderUserId)))[0];
  if (acct && !isCompAccount(acct)) return chargeOneCredit(finderUserId);
  return false; // comp / no account: marked charged, no credit taken
}

/** Poll the provider for any calls still in flight and save their outcomes. Returns how many finalized. */
export async function ingestPending(): Promise<number> {
  const pending = await db.select().from(callResults).where(
    or(eq(callResults.status, "dialing"), eq(callResults.status, "in_progress"), eq(callResults.status, "queued")),
  );
  const cats = await db.select().from(categories);
  const labelToId = new Map(cats.map((c) => [c.label, c.id]));
  const now = () => Math.floor(Date.now() / 1000);
  let finalized = 0;

  for (const row of pending) {
    if (!row.providerCallId) continue;
    if (row.providerCallId.startsWith("delta:")) continue; // D-lane call — its own finalize hook writes the verdict
    if (row.providerCallId.startsWith("bridge:")) continue; // headless bridge call still dialing — the conv id lands at connect (or the room finalizer closes it)
    const outcome = await provider.getConversation(row.providerCallId);
    if (!outcome) continue; // not finished yet

    const primaryLabel = cats.find((c) => c.id === row.categoryId)?.label;
    const primaryConfirmed =
      primaryLabel && primaryLabel in outcome.categoryResults
        ? outcome.categoryResults[primaryLabel]
        : outcome.confirmed;

    // ---- Consensus verdict: a cheap second LLM read of the transcript, reconciled with
    // ElevenLabs' own extraction. Two non-conflicting reads → a hard verdict (and we charge); a
    // direct conflict or genuine ambiguity → honest "no clear answer" (and we do NOT charge, the
    // same promise as "nobody answered"). The same pass captures the product form/set the clerk named.
    let finalConfirmed = primaryConfirmed;
    let finalStatusKey = outcome.statusKey;
    let definitive = primaryConfirmed === true || primaryConfirmed === false;
    let productDetail: string | null = null;
    let restockDayHeard: string | null = null;
    if (outcome.status === "completed") {
      // Speed: the second read decides the VERDICT only when EL was unclear (the case it rescues);
      // decisive EL answers stand. But on a confirmed YES we still run it for EXTRACTION ONLY — it's
      // what captures the set + product form the clerk named ("3-pack blister · Pitch Black"), which
      // decisive calls used to drop entirely (owner 07-10 call 8).
      const needSecond = primaryConfirmed === null && !outcome.soldOut && !outcome.doesNotSell;
      const second = (needSecond || primaryConfirmed === true) ? await classifyVerdict(outcome.transcript, primaryLabel || "the product") : null;
      const consensus = reconcile(
        { confirmed: primaryConfirmed, soldOut: outcome.soldOut, doesNotSell: outcome.doesNotSell, statusKey: outcome.statusKey },
        needSecond ? second : null,
      );
      finalConfirmed = consensus.confirmed;
      finalStatusKey = consensus.statusKey;
      definitive = consensus.definitive;
      productDetail = productDetailLabel(second);
      restockDayHeard = second?.restockDay ?? null; // restock day staff VOLUNTEERED — captured even unprompted
    }

    // Update the primary row (the line we called about).
    await db.update(callResults).set({
      status: outcome.status,
      confirmed: finalConfirmed,
      statusKey: finalStatusKey,
      shipmentDayHeard: restockDayHeard ?? outcome.shipmentDay, // prefer the LLM's read of the transcript
      productDetail,
      summary: outcome.summary,
      transcript: outcome.transcript,
      completedAt: now(),
      callSeconds: outcome.durationSecs ?? null,
      // connect-on-human: the bridge measured true time-to-human (ElevenLabs only joined at pickup);
      // otherwise fall back to the first-human-turn timestamp from the transcript.
      navSeconds: takeBridgeNav(row.providerCallId) ?? outcome.navSecs ?? null,
    }).where(eq(callResults.id, row.id));

    // Server-side billing: charge the finder ONE credit on a DEFINITIVE answer, exactly once.
    // (chargeCallOnce is atomic — the poller, the webhook, and any retry can't double-bill.)
    // A conflict/unsure verdict (the two reads disagreed) is free — we never bill a verdict we doubt.
    if (row.finderUserId && outcome.status === "completed" && definitive) {
      await chargeCallOnce(row.id, row.finderUserId);
    }

    const store = (await db.select().from(retailers).where(eq(retailers.id, row.retailerId)))[0];

    // ---- Phone-tree learning: every call's transcript contains the store's IVR, so we can map the
    // route to a human for the whole chain. Learn once for unmapped chains (passive), and force a
    // re-check + compare when a verify was queued for this chain. Cheap model; skipped otherwise.
    // MAPPING IS DECOUPLED FROM STAGING (owner rule, 2026-07-02): PASSIVE learning is prod-only and
    // never from owner-only test stores (a Fun-store test transcript once wrote a bogus
    // avgTreeSeconds=19 onto a direct chain → the silent-agent bug). An EXPLICIT Tree Trainer run
    // (queued relearn → `force`) is a deliberate mapping action and works in ANY env — Admin runs
    // mapping through the staging service today.
    if (store?.chainId && outcome.status === "completed" && (outcome.transcript || "").length > 20) {
      const ch = (await db.select().from(chains).where(eq(chains.id, store.chainId)))[0];
      const force = ch ? consumeTreeRelearn(ch.id) : false;
      const passiveOk = !config.staging.on && !store.ownerOnly && ch?.treeStatus == null;
      if (ch && (force || passiveOk)) {
        const learned = await learnTreeFromTranscript(outcome.transcript);
        if (learned) {
          if (force && ch.treeStatus != null) {
            const matched = (ch.dtmfShortcut || "") === learned.dtmf && (ch.answerPath || "") === learned.answerPath;
            await db.update(chains).set({ treeStatus: matched ? "verified" : "varies", treeVerifiedAt: now() }).where(eq(chains.id, ch.id));
          } else {
            await db.update(chains).set({
              phoneTreeDefault: ch.phoneTreeDefault || learned.note, dtmfShortcut: ch.dtmfShortcut || learned.dtmf,
              answerPath: learned.answerPath, avgTreeSeconds: learned.ringsDirect ? null : learned.avgTreeSeconds, ringsDirect: learned.ringsDirect,
              treeNote: learned.note, treeStatus: "learned", treeLearnedAt: now(),
            }).where(eq(chains.id, ch.id));
          }
        }
      }
    }

    if (finalConfirmed === true && primaryLabel) {
      await notifyInStock(store?.name ?? "A store", primaryLabel, row.retailerId, outcome.shipmentDay);
      await notifyWatches(row.retailerId, row.categoryId, store?.name ?? "A store", primaryLabel);
    }

    // Fan out any additional lines covered in the same call into their own result rows.
    for (const [label, conf] of Object.entries(outcome.categoryResults)) {
      if (label === primaryLabel) continue;
      const cid = labelToId.get(label);
      if (!cid) continue;
      const existing = await db.select().from(callResults)
        .where(and(eq(callResults.providerCallId, row.providerCallId), eq(callResults.categoryId, cid)));
      // Per-category verdict for the fan-out line (its own in/out key; else the call-level reason).
      const fanKey = conf === true ? "in_stock" : conf === false ? "not_in_stock" : outcome.statusKey;
      if (existing.length) {
        await db.update(callResults).set({ confirmed: conf, statusKey: fanKey, status: outcome.status, completedAt: now() })
          .where(eq(callResults.id, existing[0].id));
      } else {
        await db.insert(callResults).values({
          scheduleId: row.scheduleId, retailerId: row.retailerId, categoryId: cid, mode: row.mode,
          status: outcome.status, confirmed: conf, statusKey: fanKey, summary: outcome.summary, transcript: outcome.transcript,
          providerCallId: row.providerCallId, completedAt: now(),
        });
      }
      if (conf === true) await notifyInStock(store?.name ?? "A store", label, row.retailerId, outcome.shipmentDay);
    }

    if (outcome.shipmentDay) {
      await db.update(retailers).set({ shipmentDay: outcome.shipmentDay }).where(eq(retailers.id, row.retailerId));
    }
    finalized++;
  }
  return finalized;
}

/** Place a call to every store in a zone (primary line defaults to Pokémon; cascade + carry-mode handled per store). */
/** Cost + feasibility of firing a whole zone — one credit per callable store. The user-facing zone
 *  feature MUST pre-check `creditsNeeded` against the account balance and charge upfront, so a caller
 *  can never run out mid-zone and be left with half-placed calls. (Admin callZone below is comp-only.) */
export async function zoneQuote(zoneId: number) {
  const links = await db.select().from(zoneRetailers).where(eq(zoneRetailers.zoneId, zoneId));
  const ids = links.map((l) => l.retailerId);
  if (!ids.length) return { stores: 0, creditsNeeded: 0 };
  const stores = await db.select().from(retailers).where(inArray(retailers.id, ids));
  const callable = stores.filter((s) => s.sellsPacks !== false).length;
  return { stores: callable, creditsNeeded: callable };
}
/** Guard for a (future, opt-in) user-initiated zone call: refuses unless the account can afford every
 *  store up front. Returns the shortfall so the UI can upsell BEFORE any call is placed. Does not fire. */
export async function canAffordZone(opts: { zoneId: number; credits: number; comp?: boolean }) {
  const q = await zoneQuote(opts.zoneId);
  const ok = !!opts.comp || opts.credits >= q.creditsNeeded;
  return { ok, ...q, have: opts.comp ? Infinity : opts.credits, short: ok ? 0 : (q.creditsNeeded - opts.credits) };
}

export async function callZone(zoneId: number, categoryKey = "pokemon") {
  const cat = (await db.select().from(categories).where(eq(categories.key, categoryKey)))[0];
  if (!cat) throw new Error(`category ${categoryKey} not found`);
  const links = await db.select().from(zoneRetailers).where(eq(zoneRetailers.zoneId, zoneId));
  const ids = links.map((l) => l.retailerId);
  if (!ids.length) return { placed: 0 };
  const stores = await db.select().from(retailers).where(inArray(retailers.id, ids));
  let placed = 0;
  const callSids: string[] = []; // Twilio SIDs of the calls we placed → lets the caller cancel the whole zone.
  const viaBridge = (await getPolicy()).flags.cheapBridgeAll; // cheap lane: recipe nav + agent only on human
  for (const s of stores) {
    try {
      const r = await (viaBridge ? bridgeCheckCall : triggerCall)({ retailerId: s.id, categoryId: cat.id }); placed++;
      const sid = (r as { callSid?: string }).callSid; if (sid) callSids.push(sid);
    } catch (e) { console.error("callZone trigger failed", s.id, e); }
  }
  return { placed, callSids };
}

// Open-conversation personalities — same cloned voice, different tone + opener.
export const PERSONALITIES: Record<string, { opening: string; tone: string }> = {
  professional: {
    opening: "Hey, what's up?",
    tone: "Relaxed, friendly, and professional — warm and conversational but polished. No slang, no profanity.",
  },
  homie: {
    opening: "What up! What's good son?",
    tone: "You're catching up with your boys. Super casual, hyped, and playful. Use slang naturally — 'bro', 'dude', 'G', 'what's good son', 'how you doin' G'. Swearing is totally fine and natural. Be loose and fun.",
  },
  family: {
    opening: "Hey love, what are you up to?",
    tone: "Warm, loving, and caring — like talking to family. Absolutely no profanity. Be affectionate: use 'love', ask how they're really doing, tell them you miss them, and end the call by telling them you love them.",
  },
};

/** Labs: place a one-off call to any number with a chosen agent (restock / carry / open chat). Not tied to a store. */
export async function placeAdHocCall(phone: string, mode: "restock" | "carry" | "open", personality = "professional", name = "", voiceId?: string) {
  phone = toE164(phone);
  const voicemailPolicy = (await getSetting("voicemail_hangup")) !== "false" ? VOICEMAIL_INSTRUCTION : "";
  const category = "Pokémon";
  let agentId: string | undefined;
  let question: string;
  let personalityTone: string | undefined;
  let openingLine: string | undefined;
  if (mode === "open") {
    const p = PERSONALITIES[personality] ?? PERSONALITIES.professional;
    const n = (name || "").trim();
    agentId = config.voice.openAgentId;
    personalityTone = p.tone;
    openingLine = !n ? p.opening
      : personality === "homie" ? `What up ${n}! What's good?`
      : personality === "family" ? `Hey ${n}, what are you doing?`
      : `Hey ${n}, what's up?`;
    question = ""; // empty first message -> the agent WAITS for the person to speak, then greets with openingLine
  } else if (mode === "carry") {
    agentId = config.voice.carryAgentId; question = config.carryQuestion.replace(/\{category\}/g, category);
  } else {
    agentId = config.voice.agentId; question = config.defaultQuestion.replace(/\{category\}/g, category);
    // Use the same warm, editable opener the real restock calls use.
    const tmpl = (await getSetting("vt_opening")) || DEFAULT_OPENER;
    openingLine = tmpl.replace(/\{category\}/g, category);
  }
  if (!agentId) throw new Error(`no agent configured for mode "${mode}"`);
  // Voice picker: ring in a chosen (e.g. cloned) voice. Apply it to the talk agent directly — but
  // NEVER the live store agent (mode "restock" reuses it), so real store calls keep their voice.
  // The live store agent still gets the per-call override below, which only applies if enabled.
  if (voiceId && agentId !== config.voice.agentId) { try { await provider.updateAgent(agentId, { voiceId }); } catch { /* voice optional */ } }
  const { providerCallId } = await provider.startCall({
    callId: 0, toNumber: phone, retailerName: "you", location: "", productName: category,
    question, agentId, voiceId: voiceId || config.voice.defaultVoiceId, voicemailPolicy, personalityTone, openingLine,
  });
  return { providerCallId, mode, personality };
}

/** Retailers annotated with their most recent call outcome (drives the green dot). Filtered + capped
 *  server-side — at 100k stores, returning the whole table (and re-fetching it) melts the admin. */
export async function retailersWithStatus(opts: { q?: string; state?: string; limit?: number; type?: string; region?: string; carries?: string; online?: boolean; chainId?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 300, 1), 1000);
  const q = (opts.q || "").trim().toLowerCase();
  const state = (opts.state || "").trim().toUpperCase();
  // Filter-first browse: each filter is a DB condition so you can pull "all big-box in CA" with no
  // text search. All capped at `limit`, so even an unindexed scan stays bounded.
  const conds = [] as ReturnType<typeof eq>[];
  // Name match is also apostrophe-insensitive so "MVP's" finds a store stored as "MVPs" (and vice-versa).
  if (q) { const pat = `%${q}%`, napat = `%${q.replace(/'/g, "")}%`; conds.push(or(like(retailers.name, pat), sql`replace(lower(${retailers.name}), '''', '') like ${napat}`, like(retailers.location, pat), like(retailers.zip, pat)) as ReturnType<typeof eq>); }
  if (state) conds.push(eq(retailers.state, state));
  if (opts.region) conds.push(eq(retailers.region, opts.region));
  if (opts.carries) conds.push(like(retailers.carries, `%${opts.carries}%`) as ReturnType<typeof eq>);
  if (opts.online) conds.push(eq(retailers.online, true));
  if (opts.chainId) conds.push(eq(retailers.chainId, opts.chainId));
  if (opts.type) {
    // Multi-select: `type` may be a comma-separated list (e.g. "Discount,Pharmacy") — match any of them.
    const types = opts.type.split(",").map((t) => t.trim()).filter(Boolean);
    const cs = await db.select({ id: chains.id }).from(chains).where(types.length === 1 ? eq(chains.type, types[0]) : inArray(chains.type, types));
    const ids = cs.map((c) => c.id);
    if (!ids.length) return [];
    conds.push(inArray(retailers.chainId, ids) as ReturnType<typeof eq>);
  }
  const rs: (typeof retailers.$inferSelect)[] = conds.length
    ? await db.select().from(retailers).where(and(...conds)).limit(limit)
    : await db.select().from(retailers).orderBy(retailers.name).limit(limit); // no filter → browse A→Z
  const ids = rs.map((r) => r.id);
  const recent = ids.length
    ? await db.select().from(callResults).where(inArray(callResults.retailerId, ids)).orderBy(desc(callResults.startedAt))
    : [];
  const cats = new Map((await db.select().from(categories)).map((c) => [c.id, c.label]));
  const chainTypes = new Map((await db.select().from(chains)).map((c) => [c.id, c.type]));
  const zoneNames = new Map((await db.select().from(zones)).map((z) => [z.id, z.name]));
  const idSet = new Set(ids);
  const zonesByRetailer = new Map<number, string[]>();
  for (const l of await db.select().from(zoneRetailers)) {
    if (!idSet.has(l.retailerId)) continue;
    const arr = zonesByRetailer.get(l.retailerId) ?? [];
    const n = zoneNames.get(l.zoneId);
    if (n) arr.push(n);
    zonesByRetailer.set(l.retailerId, arr);
  }

  // Per-store call track-record (count + in-stock / not-in / restock tally) from the `recent` set we
  // already loaded for lastCall — no extra query. EXCLUDE the owner's own test calls (admin-placed checks
  // are attributed to the master account) and admin-canceled calls, so a store the owner test-dialed
  // never shows a dot/pill or a "last check" as if a real customer had called it.
  const masterUid = "phone:" + (process.env.OWNER_PHONE || "+13106662331").trim();
  const recentReal = recent.filter((cr) => cr.finderUserId !== masterUid && cr.status !== "admin_hangup");
  const statsByStore = new Map<number, { total: number; inStock: number; notIn: number; restock: number }>();
  for (const cr of recentReal) {
    if (cr.retailerId == null) continue;
    const s = statsByStore.get(cr.retailerId) ?? { total: 0, inStock: 0, notIn: 0, restock: 0 };
    s.total++;
    if (cr.confirmed === true) s.inStock++;
    else if (cr.shipmentDayHeard) s.restock++;
    else if (cr.confirmed === false) s.notIn++;
    statsByStore.set(cr.retailerId, s);
  }

  return rs.map((r) => {
    const last = recentReal.find((c) => c.retailerId === r.id);
    return {
      ...r,
      storeType: (r.chainId && chainTypes.get(r.chainId)) || "Other",
      zones: zonesByRetailer.get(r.id) ?? [],
      openState: openState(r.hours, r.timezone),
      callStats: statsByStore.get(r.id) ?? { total: 0, inStock: 0, notIn: 0, restock: 0 },
      lastCall: last
        ? {
            status: last.status,
            confirmed: last.confirmed,
            category: cats.get(last.categoryId) ?? null,
            summary: last.summary,
            shipmentDayHeard: last.shipmentDayHeard,
            startedAt: last.startedAt,
          }
        : null,
      // green when the latest call confirmed product is in — but stock is PERISHABLE: a confirmation
      // older than 48h goes stale (it won't sit on the shelf forever) unless a newer call re-confirms.
      green: !!last && last.status === "completed" && last.confirmed === true
        && (Math.floor(Date.now() / 1000) - (last.completedAt ?? last.startedAt)) <= 48 * 3600,
    };
  });
}

// ---- Store hours ----
/** Live open/closed state for one store (null if store not found). */
export async function storeOpenInfo(retailerId: number) {
  const r = (await db.select().from(retailers).where(eq(retailers.id, retailerId)))[0];
  if (!r) return null;
  return openState(r.hours, r.timezone);
}

let hoursBackfilling = false;
/** Background backfill: look up hours for every store missing them, via Gemini. Fire-and-forget;
 *  the admin watches them populate by refreshing the retailer list. */
export async function backfillHours(): Promise<{ started: boolean; pending: number }> {
  const missing = (await db.select().from(retailers)).filter((r) => !r.hours && r.address);
  if (hoursBackfilling) return { started: false, pending: missing.length };
  hoursBackfilling = true;
  (async () => {
    // Grounded Gemini is rate-limited, so go ONE at a time with a pace under the limit; fetchStoreHours
    // also retries 429s internally. Slow but reliable — runs in the background.
    for (const r of missing) {
      try {
        const h = await fetchStoreHours(r.name, r.address!);
        if (h) await db.update(retailers).set({ hours: h, hoursUpdatedAt: Math.floor(Date.now() / 1000) }).where(eq(retailers.id, r.id));
      } catch (e) { console.error("hours backfill", r.id, e); }
      await new Promise((res) => setTimeout(res, 1500)); // OpenAI handles this pace fine
    }
    hoursBackfilling = false;
  })().catch(() => { hoursBackfilling = false; });
  return { started: true, pending: missing.length };
}

let phonesBackfilling = false;
/** Background backfill: look up a real phone for CALL-RAIL stores carrying the "nophone:" sentinel
 *  (imported with only an address), via the same web-search lookup as hours. ALWAYS scope to a chain
 *  (chainId) — site-rail chains like Micro Center legitimately have no line and must never be touched.
 *  Fire-and-forget + resumable (re-running picks up whatever's still nophone:). dryRun returns the
 *  count + a sample without calling the model. */
export async function backfillPhones(opts: { chainId?: number; dryRun?: boolean } = {}): Promise<{ started?: boolean; running?: boolean; dryRun?: boolean; pending: number; sample?: { id: number; name: string; address: string | null }[] }> {
  const targets = (await db.select().from(retailers)).filter((r) =>
    r.active !== false && !!r.phone && r.phone.startsWith("nophone:") && !!r.address
    && (opts.chainId ? r.chainId === opts.chainId : true));
  if (opts.dryRun) return { dryRun: true, pending: targets.length, sample: targets.slice(0, 12).map((r) => ({ id: r.id, name: r.name, address: r.address })) };
  if (phonesBackfilling) return { started: false, running: true, pending: targets.length };
  phonesBackfilling = true;
  (async () => {
    for (const r of targets) {
      try {
        const p = await fetchStorePhone(r.name, r.address!);
        if (p) await db.update(retailers).set({ phone: p }).where(eq(retailers.id, r.id));
      } catch (e) { console.error("phone backfill", r.id, e); }
      await new Promise((res) => setTimeout(res, 1500)); // same pace as hours — under the lookup rate limit
    }
    phonesBackfilling = false;
  })().catch(() => { phonesBackfilling = false; });
  return { started: true, pending: targets.length };
}

/** Re-fetch hours for a single store (manual refresh). Returns the new open-state or null. */
export async function refreshHours(retailerId: number) {
  const r = (await db.select().from(retailers).where(eq(retailers.id, retailerId)))[0];
  if (!r || !r.address) return null;
  const h = await fetchStoreHours(r.name, r.address);
  if (h) await db.update(retailers).set({ hours: h, hoursUpdatedAt: Math.floor(Date.now() / 1000) }).where(eq(retailers.id, r.id));
  return { hours: h, openState: openState(h, r.timezone) };
}

let hoursReverifying = false;
/** Background re-verify of UNVERIFIED hours stamps: stores that carry hours but were never confirmed by a
 *  lookup (hoursUpdatedAt is null — e.g. a hand-seeded "24h") get a fresh grounded lookup, so nothing shows
 *  open on a guess. Fire-and-forget and resumable: each processed store gets hoursUpdatedAt, so a re-run
 *  only picks up what's left. dryRun returns the count + a sample without calling the model. */
export async function reverifyStampedHours(opts: { dryRun?: boolean } = {}): Promise<{ started?: boolean; dryRun?: boolean; running?: boolean; pending: number; sample?: { id: number; name: string; hours: string | null }[] }> {
  const stamped = (await db.select().from(retailers))
    .filter((r) => r.active !== false && !!r.hours && r.hoursUpdatedAt == null && !!r.address);
  if (opts.dryRun) return { dryRun: true, pending: stamped.length, sample: stamped.slice(0, 12).map((r) => ({ id: r.id, name: r.name, hours: r.hours })) };
  if (hoursReverifying) return { started: false, running: true, pending: stamped.length };
  hoursReverifying = true;
  (async () => {
    for (const r of stamped) {
      try {
        const h = await fetchStoreHours(r.name, r.address!);
        if (h) await db.update(retailers).set({ hours: h, hoursUpdatedAt: Math.floor(Date.now() / 1000) }).where(eq(retailers.id, r.id));
      } catch (e) { console.error("hours reverify", r.id, e); }
      await new Promise((res) => setTimeout(res, 1500)); // same pace as backfill — under the lookup rate limit
    }
    hoursReverifying = false;
  })().catch(() => { hoursReverifying = false; });
  return { started: true, pending: stamped.length };
}

/** Fire any schedules that are due right now, in each target store's local time. */
export async function schedulerTick(): Promise<number> {
  const active = await db.select().from(schedules).where(eq(schedules.active, true));
  let fired = 0;

  for (const s of active) {
    const days = s.daysOfWeek.split(",").map((d) => d.trim());
    const targets = await targetRetailers(s);

    for (const retailer of targets) {
      const { dow, hhmm } = localNow(retailer.timezone);
      if (!days.includes(String(dow)) || hhmm !== s.timeLocal) continue;
      // Dedupe: skip if we already called this store for this schedule in the last hour.
      const cutoff = Math.floor(Date.now() / 1000) - 3600;
      const already = await db.select().from(callResults).where(and(
        eq(callResults.scheduleId, s.id),
        eq(callResults.retailerId, retailer.id),
        gte(callResults.startedAt, cutoff),
      ));
      if (already.length) continue;

      // Cheap lane when flagged on (bridgeCheckCall itself falls back to the direct path for
      // carry mode / custom questions, so admin intel schedules are unaffected).
      const place = (await getPolicy()).flags.cheapBridgeAll ? bridgeCheckCall : triggerCall;
      await place({
        retailerId: retailer.id,
        categoryId: s.categoryId,
        scheduleId: s.id,
        mode: s.mode as "restock" | "carry",
        question: s.questionTemplate,
        clarification: s.clarification ?? undefined,
        askShipmentDay: s.askShipmentDay,
        voiceId: s.voiceId,
      });
      fired++;
    }
  }
  return fired;
}

async function targetRetailers(s: typeof schedules.$inferSelect) {
  if (s.zoneId) {
    const links = await db.select().from(zoneRetailers).where(eq(zoneRetailers.zoneId, s.zoneId));
    const ids = links.map((l) => l.retailerId);
    return ids.length ? db.select().from(retailers).where(inArray(retailers.id, ids)) : [];
  }
  const links = await db.select().from(scheduleTargets).where(eq(scheduleTargets.scheduleId, s.id));
  const ids = links.map((l) => l.retailerId);
  return ids.length ? db.select().from(retailers).where(inArray(retailers.id, ids)) : [];
}

/** Current weekday (0=Sun) and HH:MM in a given IANA timezone. */
function localNow(tz: string): { dow: number; hhmm: string } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hh = parts.hour === "24" ? "00" : parts.hour;
  return { dow: dowMap[parts.weekday] ?? 0, hhmm: `${hh}:${parts.minute}` };
}
