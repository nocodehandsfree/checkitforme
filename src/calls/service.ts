// Call orchestration: trigger calls, ingest results (poll), compute green status,
// and fire due schedules.
import { and, desc, eq, gte, inArray, isNull, like, or } from "drizzle-orm";
import { db } from "../db/client";
import { openState, fetchStoreHours } from "../store-hours";
import {
  callResults, categories, chains, retailers, scheduleTargets, schedules, watches, zoneRetailers, zones,
} from "../db/schema";

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
import { learnTreeFromTranscript, consumeTreeRelearn } from "./tree-learn";
import type { AgentTuning } from "../voice/provider";
import { notifyInStock, notifyContact } from "./notify";
import { getSetting, setSetting } from "../db/settings";
import { specificityClause, RESTOCK_PROMPT, VOICE_DEFAULTS } from "../voice/prompts";

const DEFAULT_OPENER = "Heyy! I was just checking to see if you guys got any {category} in?";

// Round-robin picker for call rotation (opener variants / voice pool). In-memory; resets on restart.
const rotCounters = new Map<string, number>();
function rotatePick<T>(key: string, list: T[]): T | undefined {
  if (!list.length) return undefined;
  const n = (rotCounters.get(key) ?? -1) + 1; rotCounters.set(key, n);
  return list[n % list.length];
}

const VOICEMAIL_INSTRUCTION =
  "If you reach a voicemail, answering machine, or automated recording (a recorded greeting, an automated menu with no live person, or a beep) — do NOT say anything and end the call immediately. Never leave a message.";

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
): Promise<{ retailer: typeof retailers.$inferSelect; category: typeof categories.$inferSelect; chainName: string | null; dtmf: string | null; dynamicVars: Record<string, string> } | null> {
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
  const voicemailPolicy = (await getSetting("voicemail_hangup")) !== "false" ? VOICEMAIL_INSTRUCTION : "";
  const openerTemplate = (await getSetting("vt_opening")) || DEFAULT_OPENER;
  const openingLine = openerTemplate.replace(/\{category\}/g, category.label);
  const clarification = specificityClause((specificProduct ?? "").trim());

  return {
    retailer, category, chainName: chain?.name ?? null,
    // Bridge-level keypad shortcut (chain-wide): pressed by OUR code at a fixed time, not the LLM.
    dtmf: chain?.dtmfShortcut ?? null,
    dynamicVars: {
      internal_call_id: "0",
      category: category.label,
      retailer_name: retailer.name || "the store",
      location: retailer.location || "",
      clarification,
      phone_tree: phoneTree,
      special_instructions: retailer.specialInstructions ?? "",
      voicemail_policy: voicemailPolicy,
      personality: "",
      opening_line: openingLine,
      // Listen-live (Runnr) asks about exactly the lines the user selected — the primary plus
      // any extras they multi-picked. It never auto-cascades from the store's carries field.
      other_categories: extraLabels.join(", "),
      ask_shipment_day: "",
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
}

/** Place one call and record it. */
export async function triggerCall(a: TriggerArgs) {
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

  // Default the call mode from the store's known status (verified → restock, unverified → carry).
  const mode = a.mode ?? (retailer.stockStatus === "unverified" ? "carry" : "restock");
  const agentId = a.agentOverride ?? (mode === "carry" ? config.voice.carryAgentId : config.voice.agentId);
  const defaultQ = mode === "carry" ? config.carryQuestion : config.defaultQuestion;

  const chain = retailer.chainId
    ? (await db.select().from(chains).where(eq(chains.id, retailer.chainId)))[0]
    : undefined;
  const phoneTree = retailer.phoneTree ?? chain?.phoneTreeDefault ?? undefined;
  const question = (a.question ?? defaultQ).replace(/\{category\}/g, category.label);

  // Other tracked lines this store carries (for the restock cascade), excluding the primary.
  const otherCategories = (retailer.carries ?? "")
    .split(",").map((s) => s.trim()).filter((s) => s && s !== category.label);

  // Master voicemail toggle (default on): hang up on voicemail, never leave a message.
  const voicemailPolicy = (await getSetting("voicemail_hangup")) !== "false" ? VOICEMAIL_INSTRUCTION : "";

  // Warm, editable opener (Voice tuning control). {category} is interpolated.
  // Test Bench passes its DRAFT opener via openingTemplate; live calls read the vt_opening setting.
  // Rotation (optional): if opener variants are set, round-robin them so the same store doesn't hear
  // the identical line every time (same voice, slightly different phrasing next call).
  const openerVariants = ((await getSetting("vt_opener_variants")) || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const openerTemplate = a.openingTemplate ?? (rotatePick("opener", openerVariants) || (await getSetting("vt_opening")) || DEFAULT_OPENER);
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
    finderUserId: a.finderUserId ?? null,
    isPrivate: a.isPrivate ?? false,
  }).returning();

  try {
    const { providerCallId } = await provider.startCall({
      callId: row.id,
      toNumber: a.toOverride ? toE164(a.toOverride) : retailer.phone,
      retailerName: retailer.name,
      location: retailer.location,
      productName: category.label,
      question,
      agentId,
      voiceId: a.voiceId ?? rotatePick("voice", ((await getSetting("vt_voice_pool")) || "").split(",").map((s) => s.trim()).filter(Boolean)) ?? config.voice.defaultVoiceId,
      clarification,
      openingLine: mode === "restock" ? openingLine : undefined,
      phoneTree,
      specialInstructions: retailer.specialInstructions ?? undefined,
      otherCategories: mode === "restock" ? otherCategories : [],
      askShipmentDay: a.askShipmentDay,
      voicemailPolicy,
    });
    await db.update(callResults)
      .set({ providerCallId, status: "in_progress" })
      .where(eq(callResults.id, row.id));
    return { ...row, providerCallId, status: "in_progress" as const };
  } catch (e) {
    await db.update(callResults).set({ status: "failed", summary: String(e) }).where(eq(callResults.id, row.id));
    throw e;
  }
}

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
  opening?: string; speed?: number; stability?: number; llm?: string; pushPrompt?: boolean;
}) {
  if (p.opening !== undefined) await setSetting("vt_opening", p.opening);
  if (p.speed !== undefined) await setSetting("vt_speed", String(p.speed));
  if (p.stability !== undefined) await setSetting("vt_stability", String(p.stability));
  if (p.llm !== undefined && p.llm !== "") await setSetting("vt_llm", p.llm);

  const patch: { prompt?: string; llm?: string; speed?: number; stability?: number; maxTokens?: number } = {};
  if (p.speed !== undefined) patch.speed = p.speed;
  if (p.stability !== undefined) patch.stability = p.stability;
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
const SANDBOX_FIELDS = ["speed", "stability", "style", "speakerBoost", "latency", "modelId", "turnEagerness"] as const;

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
    const outcome = await provider.getConversation(row.providerCallId);
    if (!outcome) continue; // not finished yet

    const primaryLabel = cats.find((c) => c.id === row.categoryId)?.label;
    const primaryConfirmed =
      primaryLabel && primaryLabel in outcome.categoryResults
        ? outcome.categoryResults[primaryLabel]
        : outcome.confirmed;

    // Update the primary row (the line we called about).
    await db.update(callResults).set({
      status: outcome.status,
      confirmed: primaryConfirmed,
      shipmentDayHeard: outcome.shipmentDay,
      summary: outcome.summary,
      transcript: outcome.transcript,
      completedAt: now(),
      callSeconds: outcome.durationSecs ?? null,
      // connect-on-human: the bridge measured true time-to-human (ElevenLabs only joined at pickup);
      // otherwise fall back to the first-human-turn timestamp from the transcript.
      navSeconds: takeBridgeNav(row.providerCallId) ?? outcome.navSecs ?? null,
    }).where(eq(callResults.id, row.id));

    const store = (await db.select().from(retailers).where(eq(retailers.id, row.retailerId)))[0];

    // ---- Phone-tree learning: every call's transcript contains the store's IVR, so we can map the
    // route to a human for the whole chain. Learn once for unmapped chains (passive), and force a
    // re-check + compare when a verify was queued for this chain. Cheap model; skipped otherwise.
    if (store?.chainId && outcome.status === "completed" && (outcome.transcript || "").length > 20) {
      const ch = (await db.select().from(chains).where(eq(chains.id, store.chainId)))[0];
      const force = ch ? consumeTreeRelearn(ch.id) : false;
      if (ch && (force || ch.treeStatus == null)) {
        const learned = await learnTreeFromTranscript(outcome.transcript);
        if (learned) {
          if (force && ch.treeStatus != null) {
            const matched = (ch.dtmfShortcut || "") === learned.dtmf && (ch.answerPath || "") === learned.answerPath;
            await db.update(chains).set({ treeStatus: matched ? "verified" : "varies", treeVerifiedAt: now() }).where(eq(chains.id, ch.id));
          } else {
            await db.update(chains).set({
              phoneTreeDefault: ch.phoneTreeDefault || learned.note, dtmfShortcut: ch.dtmfShortcut || learned.dtmf,
              answerPath: learned.answerPath, avgTreeSeconds: learned.avgTreeSeconds, ringsDirect: learned.ringsDirect,
              treeNote: learned.note, treeStatus: "learned", treeLearnedAt: now(),
            }).where(eq(chains.id, ch.id));
          }
        }
      }
    }

    if (primaryConfirmed === true && primaryLabel) {
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
      if (existing.length) {
        await db.update(callResults).set({ confirmed: conf, status: outcome.status, completedAt: now() })
          .where(eq(callResults.id, existing[0].id));
      } else {
        await db.insert(callResults).values({
          scheduleId: row.scheduleId, retailerId: row.retailerId, categoryId: cid, mode: row.mode,
          status: outcome.status, confirmed: conf, summary: outcome.summary, transcript: outcome.transcript,
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
  for (const s of stores) {
    try { await triggerCall({ retailerId: s.id, categoryId: cat.id }); placed++; }
    catch (e) { console.error("callZone trigger failed", s.id, e); }
  }
  return { placed };
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
export async function retailersWithStatus(opts: { q?: string; state?: string; limit?: number; type?: string; region?: string; carries?: string; online?: boolean } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 300, 1), 1000);
  const q = (opts.q || "").trim().toLowerCase();
  const state = (opts.state || "").trim().toUpperCase();
  // Filter-first browse: each filter is a DB condition so you can pull "all big-box in CA" with no
  // text search. All capped at `limit`, so even an unindexed scan stays bounded.
  const conds = [] as ReturnType<typeof eq>[];
  if (q) { const pat = `%${q}%`; conds.push(or(like(retailers.name, pat), like(retailers.location, pat), like(retailers.zip, pat)) as ReturnType<typeof eq>); }
  if (state) conds.push(eq(retailers.state, state));
  if (opts.region) conds.push(eq(retailers.region, opts.region));
  if (opts.carries) conds.push(like(retailers.carries, `%${opts.carries}%`) as ReturnType<typeof eq>);
  if (opts.online) conds.push(eq(retailers.online, true));
  if (opts.type) {
    const cs = await db.select({ id: chains.id }).from(chains).where(eq(chains.type, opts.type));
    const ids = cs.map((c) => c.id);
    if (!ids.length) return [];
    conds.push(inArray(retailers.chainId, ids) as ReturnType<typeof eq>);
  }
  const rs: (typeof retailers.$inferSelect)[] = conds.length
    ? await db.select().from(retailers).where(and(...conds)).limit(limit)
    : await db.select().from(retailers).orderBy(desc(retailers.id)).limit(limit);
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

  return rs.map((r) => {
    const last = recent.find((c) => c.retailerId === r.id);
    return {
      ...r,
      storeType: (r.chainId && chainTypes.get(r.chainId)) || "Other",
      zones: zonesByRetailer.get(r.id) ?? [],
      openState: openState(r.hours, r.timezone),
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

/** Re-fetch hours for a single store (manual refresh). Returns the new open-state or null. */
export async function refreshHours(retailerId: number) {
  const r = (await db.select().from(retailers).where(eq(retailers.id, retailerId)))[0];
  if (!r || !r.address) return null;
  const h = await fetchStoreHours(r.name, r.address);
  if (h) await db.update(retailers).set({ hours: h, hoursUpdatedAt: Math.floor(Date.now() / 1000) }).where(eq(retailers.id, r.id));
  return { hours: h, openState: openState(h, r.timezone) };
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

      await triggerCall({
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
