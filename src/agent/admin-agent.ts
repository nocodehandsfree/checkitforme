// In-admin agent ("Admin dev"). Lets the owner manage the store database by chatting — add stores
// they find, look stores up, fix details, answer questions. The brain is switchable: Claude
// (Anthropic), GPT (OpenAI), or Gemini (Google) — same idea as the voice agent's LLM picker. Each
// provider is called directly via fetch (no SDK deps), behind one provider-neutral tool-use loop.
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "../db/client";
import { retailers, chains, categories } from "../db/schema";
import { invalidateRefCache } from "../refcache";
import { config } from "../config";
import { heli } from "../llm";
import { retailersWithStatus } from "../calls/service";
import { importStores, regionForState, tzForState, normCarries, e164 } from "../stores-import";
import { geocodeMissing } from "../db/import-data";

// Switchable brains. Key = model id sent from the UI; value = which provider runs it.
export const AGENT_MODELS: { id: string; label: string; provider: "anthropic" | "openai" | "gemini" }[] = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 — best quality", provider: "anthropic" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — cheap & fast", provider: "anthropic" },
  { id: "gpt-4o-mini", label: "GPT-4o-mini — cheap & fast", provider: "openai" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite — cheapest", provider: "gemini" },
];
// Default to a provider that's funded out of the box; the owner can switch to Opus once Anthropic is funded.
const DEFAULT_MODEL = "gpt-4o-mini";
const providerOf = (model: string) => AGENT_MODELS.find((m) => m.id === model)?.provider;

const CARRY_LABELS = ["Pokémon", "One Piece TCG", "Topps NBA", "NeeDoh"];

const SYSTEM_PROMPT = `You are the Fungibles Admin agent — an assistant embedded in the Fungibles admin panel, talking to the owner.

Fungibles is a retail-stock voice-calling service: it phones stores to check whether trading-card / collectible products are in stock, and shows shoppers which nearby stores have them.

Your job: help the owner manage the store database by chatting — add stores they find, look stores up, fix store details, and answer questions about the data. You have tools; use them rather than guessing.

The store data model:
- A store has: name, location (e.g. "Bodega Bay, CA"), phone (E.164), state (2-letter), region, zip, carries (which products it stocks), stockStatus ("verified" = we know it carries it; "unverified" = suspected), online (sells the product online — pickup / third-party / online-only like Micro Center; NOT "online only"), active (false = soft-removed / hidden from shoppers).
- The only product labels are exactly: ${CARRY_LABELS.join(", ")}. Always use these exact strings for "carries".
- "Muted" is a CHAIN-level setting (hides every store of that chain). You can mute/unmute chains and add product categories.

How to work:
- Before adding a store, ALWAYS call find_stores first to avoid duplicates.
- A store needs at least a name and a location (city + state). A phone is ideal but optional — if you don't have it, add the store anyway and tell the owner it has no number yet.
- When the owner gives partial info ("a card shop in Bodega Bay"), add what you can and say what's missing (phone, exact products) so they can fill it in. Don't invent phone numbers or addresses.
- Confirm with the owner before removing (deactivating) a store.
- Be concise and concrete. State exactly what you did and the store's resulting state. Don't be chatty or add filler.
- You manage stores, product categories, and chain mute through your tools. You can't place calls, change pricing, or build features.`;

type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
const TOOLS: ToolDef[] = [
  {
    name: "find_stores",
    description: "Search the store database by name, city, or ZIP. Use before adding to avoid duplicates, and to answer questions like 'do we have a store in X'.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "name, city, or ZIP to search for" }, limit: { type: "number", description: "max results (default 10, max 25)" } }, required: ["query"] },
  },
  {
    name: "add_store",
    description: "Add a new store to the database. Always search first with find_stores to avoid duplicates.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "store name, e.g. 'Bodega Bay General Store'" },
        city: { type: "string" }, state: { type: "string", description: "2-letter state code, e.g. CA" },
        zip: { type: "string" }, address: { type: "string", description: "full street address if known (helps map it)" },
        phone: { type: "string", description: "phone in any format; optional" },
        carries: { type: "string", description: `comma-separated products from: ${CARRY_LABELS.join(", ")}` },
        chain: { type: "string", description: "chain/brand name if it's a chain location, e.g. CVS, GameStop" },
        type: { type: "string", description: "store type, e.g. pharmacy, grocery, hobby, bookstore, electronics" },
        verified: { type: "boolean", description: "true if we already know it carries the product" },
        online: { type: "boolean", description: "sells the product online — pickup/third-party/online-only (e.g. Micro Center). Not 'online only'." },
      },
      required: ["name"],
    },
  },
  {
    name: "update_store",
    description: "Update an existing store. Identify it by id (preferred) or a unique search query.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "store id (from find_stores)" },
        query: { type: "string", description: "unique name/city to locate the store if you don't have the id" },
        phone: { type: "string" }, carries: { type: "string", description: `comma-separated from: ${CARRY_LABELS.join(", ")}` },
        verified: { type: "boolean" }, active: { type: "boolean", description: "false soft-removes / hides the store from shoppers" },
        online: { type: "boolean", description: "sells the product online — pickup, third-party, or online-only (e.g. Micro Center). Not 'online only'." },
        shipmentDay: { type: "string", description: "known restock day, e.g. Tuesday" },
        specialInstructions: { type: "string", description: "store-specific note for the calling agent" },
      },
    },
  },
  { name: "store_intel", description: "Headline database numbers — total stores and how many are callable (have a phone).", input_schema: { type: "object", properties: {} } },
  { name: "add_category", description: "Add a new product/category that stores can carry (e.g. 'Disney Lorcana').", input_schema: { type: "object", properties: { label: { type: "string", description: "display label, e.g. 'Disney Lorcana'" }, key: { type: "string", description: "optional slug; auto-derived from the label if omitted" } }, required: ["label"] } },
  { name: "mute_chain", description: "Mute or unmute a chain. Muting hides every store of that chain from shoppers in all cities (instant).", input_schema: { type: "object", properties: { chain: { type: "string", description: "chain name, e.g. Ralph's" }, muted: { type: "boolean", description: "true to mute (default), false to unmute" } }, required: ["chain"] } },
];

// ---- provider-neutral conversation ----
type Blk =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: string; output: string };
type CTurn = { role: "user" | "assistant"; blocks: Blk[] };
type ProviderResult = { text: string; toolCalls: { id: string; name: string; input: Record<string, unknown> }[] };
/* eslint-disable @typescript-eslint/no-explicit-any */
const textOf = (t: CTurn) => t.blocks.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
const safeJson = (s: string): Record<string, unknown> => { try { return JSON.parse(s || "{}"); } catch { return {}; } };
function friendly(status: number, body: string, provider: string): Error {
  let msg = `${provider} API error (${status}).`;
  try { const j = JSON.parse(body); msg = j?.error?.message || j?.error?.[0]?.message || j?.message || msg; } catch { /* keep generic */ }
  if (/credit|quota|billing|insufficient|exceeded/i.test(msg)) msg = `${provider} is out of credit/quota — top it up or switch models in the menu. (${msg.slice(0, 140)})`;
  else if (status === 401 || status === 403) msg = `${provider} API key is invalid or missing on the server.`;
  return new Error(msg);
}

// ---- Anthropic ----
async function callAnthropic(model: string, conv: CTurn[]): Promise<ProviderResult> {
  if (!config.anthropicKey) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  const messages = conv.map((t) => {
    if (t.role === "user") {
      const trs = t.blocks.filter((b) => b.type === "tool_result") as Extract<Blk, { type: "tool_result" }>[];
      if (trs.length) return { role: "user", content: trs.map((b) => ({ type: "tool_result", tool_use_id: b.id, content: b.output })) };
      return { role: "user", content: textOf(t) };
    }
    const content: any[] = [];
    for (const b of t.blocks) {
      if (b.type === "text" && b.text) content.push({ type: "text", text: b.text });
      if (b.type === "tool_call") content.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
    }
    return { role: "assistant", content: content.length ? content : [{ type: "text", text: " " }] };
  });
  const r = await fetch("https://anthropic.helicone.ai/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": config.anthropicKey, "anthropic-version": "2023-06-01", ...heli("admin-agent") },
    body: JSON.stringify({ model, max_tokens: 2048, system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }], tools: TOOLS, messages }),
  });
  if (!r.ok) throw friendly(r.status, await r.text(), "Anthropic");
  const d: any = await r.json();
  const blocks: any[] = d.content || [];
  return {
    text: blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(),
    toolCalls: blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input || {} })),
  };
}

// ---- OpenAI ----
async function callOpenAI(model: string, conv: CTurn[]): Promise<ProviderResult> {
  if (!config.openaiKey) throw new Error("OPENAI_API_KEY is not set on the server.");
  const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const t of conv) {
    if (t.role === "user") {
      const trs = t.blocks.filter((b) => b.type === "tool_result") as Extract<Blk, { type: "tool_result" }>[];
      if (trs.length) { for (const b of trs) messages.push({ role: "tool", tool_call_id: b.id, content: b.output }); }
      else messages.push({ role: "user", content: textOf(t) });
    } else {
      const calls = (t.blocks.filter((b) => b.type === "tool_call") as Extract<Blk, { type: "tool_call" }>[])
        .map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) } }));
      const m: any = { role: "assistant", content: textOf(t) || null };
      if (calls.length) m.tool_calls = calls;
      messages.push(m);
    }
  }
  const tools = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  const r = await fetch("https://oai.helicone.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.openaiKey}`, ...heli("admin-agent") },
    body: JSON.stringify({ model, messages, tools, max_tokens: 1500 }),
  });
  if (!r.ok) throw friendly(r.status, await r.text(), "OpenAI");
  const d: any = await r.json();
  const msg = d.choices?.[0]?.message || {};
  return {
    text: (msg.content || "").trim(),
    toolCalls: (msg.tool_calls || []).map((tc: any) => ({ id: tc.id, name: tc.function.name, input: safeJson(tc.function.arguments) })),
  };
}

// ---- Gemini ----
async function callGemini(model: string, conv: CTurn[]): Promise<ProviderResult> {
  if (!config.geminiKey) throw new Error("GEMINI_API_KEY is not set on the server.");
  const contents = conv.map((t) => {
    if (t.role === "user") {
      const trs = t.blocks.filter((b) => b.type === "tool_result") as Extract<Blk, { type: "tool_result" }>[];
      if (trs.length) return { role: "user", parts: trs.map((b) => ({ functionResponse: { name: b.name, response: { result: b.output } } })) };
      return { role: "user", parts: [{ text: textOf(t) }] };
    }
    const parts: any[] = [];
    for (const b of t.blocks) {
      if (b.type === "text" && b.text) parts.push({ text: b.text });
      if (b.type === "tool_call") parts.push({ functionCall: { name: b.name, args: b.input } });
    }
    return { role: "model", parts: parts.length ? parts : [{ text: " " }] };
  });
  // Gemini rejects empty parameter objects — only declare params for tools that have them.
  const fns = TOOLS.map((t) => {
    const props = (t.input_schema as any).properties || {};
    const fn: any = { name: t.name, description: t.description };
    if (Object.keys(props).length) fn.parameters = t.input_schema;
    return fn;
  });
  const body = { systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents, tools: [{ functionDeclarations: fns }] };
  const url = `https://gateway.helicone.ai/v1beta/models/${model}:generateContent`;
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": config.geminiKey, "Helicone-Target-Url": "https://generativelanguage.googleapis.com", ...heli("admin-agent") }, body: JSON.stringify(body) });
  if (!r.ok) throw friendly(r.status, await r.text(), "Gemini");
  const d: any = await r.json();
  const parts: any[] = d.candidates?.[0]?.content?.parts || [];
  return {
    text: parts.filter((p) => p.text).map((p) => p.text).join("").trim(),
    toolCalls: parts.filter((p) => p.functionCall).map((p, i) => ({ id: `${p.functionCall.name}__${i}`, name: p.functionCall.name, input: p.functionCall.args || {} })),
  };
}

function callProvider(model: string, conv: CTurn[]): Promise<ProviderResult> {
  const p = providerOf(model);
  if (p === "anthropic") return callAnthropic(model, conv);
  if (p === "openai") return callOpenAI(model, conv);
  return callGemini(model, conv);
}

// ---- tools ----
async function toolFindStores(input: { query?: string; limit?: number }): Promise<string> {
  const q = (input.query || "").trim();
  if (q.length < 2) return "Give at least 2 characters to search.";
  const rows = await retailersWithStatus({ q, limit: Math.min(Math.max(input.limit || 10, 1), 25) });
  if (!rows.length) return `No stores match "${q}".`;
  return JSON.stringify(rows.slice(0, 25).map((r) => ({ id: r.id, name: r.name, location: r.location, phone: r.phone || "(none)", carries: r.carries || "(unknown)", status: r.stockStatus, type: r.storeType, active: r.active })));
}
async function toolAddStore(input: Record<string, any>, actions: string[]): Promise<string> {
  const name = String(input.name || "").trim();
  if (!name) return "A store name is required.";
  const phone = e164(String(input.phone || ""));
  const state = String(input.state || "").toUpperCase() || undefined;
  const city = input.city ? String(input.city) : undefined;
  const carries = input.carries as string | string[] | undefined;
  if (phone) {
    const res = await importStores([{ name, phone, city, state, zip: input.zip ? String(input.zip) : undefined, address: input.address ? String(input.address) : undefined, carries, chain: input.chain ? String(input.chain) : undefined, category: input.type ? String(input.type) : undefined, stockStatus: input.verified ? "verified" : undefined }]);
    if (input.online) { try { await db.update(retailers).set({ online: true }).where(eq(retailers.phone, phone)); } catch { /* online flag is best-effort */ } }
    geocodeMissing(2).catch(() => {});
    if (res.inserted) { actions.push(`Added store: ${name}`); return `Added "${name}".`; }
    if (res.updated) { actions.push(`Updated existing store (same phone): ${name}`); return `A store with that phone already existed — updated it instead of duplicating.`; }
    return `Could not add "${name}" (skipped — check the name and phone).`;
  }
  const loc = city && state ? `${city}, ${state}` : (city || state || (input.address ? String(input.address) : ""));
  const [row] = await db.insert(retailers).values({ name, location: String(loc || name), phone: "", timezone: tzForState(state), state: state || null, region: regionForState(state), zip: input.zip ? String(input.zip) : null, address: input.address ? String(input.address) : null, carries: normCarries(carries), stockStatus: input.verified ? "verified" : "unverified", online: !!input.online }).returning();
  geocodeMissing(2).catch(() => {});
  actions.push(`Added store (no phone yet): ${name}`);
  return `Added "${row?.name || name}" (no phone yet — it'll show as 'no number' until one's added).`;
}
async function toolUpdateStore(input: Record<string, any>, actions: string[]): Promise<string> {
  let id = input.id ? Number(input.id) : undefined;
  if (!id && input.query) {
    const rows = await retailersWithStatus({ q: String(input.query), limit: 3 });
    if (rows.length === 1) id = rows[0].id;
    else if (rows.length > 1) return `Multiple stores match "${input.query}" — tell me the id. Candidates: ${JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, location: r.location })))}`;
    else return `No store matches "${input.query}".`;
  }
  if (!id) return "Give a store id or a unique search query.";
  const set: Record<string, unknown> = {};
  if (input.phone != null) set.phone = e164(String(input.phone));
  if (input.carries != null) set.carries = normCarries(input.carries);
  if (input.verified === true) set.stockStatus = "verified";
  if (input.verified === false) set.stockStatus = "unverified";
  if (input.active === false) set.active = false;
  if (input.active === true) set.active = true;
  if (input.online === true) set.online = true;
  if (input.online === false) set.online = false;
  if (input.shipmentDay != null) set.shipmentDay = String(input.shipmentDay);
  if (input.specialInstructions != null) set.specialInstructions = String(input.specialInstructions);
  if (!Object.keys(set).length) return "No changes specified.";
  const [row] = await db.update(retailers).set(set).where(eq(retailers.id, id)).returning();
  if (!row) return `No store with id ${id}.`;
  actions.push(`Updated store #${id} (${row.name}): ${Object.keys(set).join(", ")}`);
  return `Updated "${row.name}" — set ${Object.keys(set).join(", ")}.`;
}
async function toolStoreIntel(): Promise<string> {
  const active = eq(retailers.active, true);
  const total = Number((await db.select({ n: sql<number>`count(*)` }).from(retailers).where(active))[0]?.n || 0);
  const callableRows = await db.select({ n: sql<number>`count(*)` }).from(retailers).where(and(active, sql`${retailers.phone} is not null and ${retailers.phone} != '' and ${retailers.phone} not like 'nophone:%'`));
  return JSON.stringify({ total, callable: Number(callableRows[0]?.n || 0) });
}
async function toolAddCategory(input: Record<string, any>, actions: string[]): Promise<string> {
  const label = String(input.label || "").trim();
  if (!label) return "A category label is required (e.g. 'Disney Lorcana').";
  const key = String(input.key || label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!key) return "Could not derive a key from that label.";
  const existing = (await db.select().from(categories).where(eq(categories.key, key)))[0];
  if (existing) return `Category "${existing.label}" already exists.`;
  const maxSort = Number((await db.select({ m: sql<number>`coalesce(max(sort),0)` }).from(categories))[0]?.m || 0);
  const [row] = await db.insert(categories).values({ key, label, sort: maxSort + 1 }).returning();
  invalidateRefCache();
  actions.push(`Added category: ${label}`);
  return `Added category "${row?.label || label}".`;
}
async function toolMuteChain(input: Record<string, any>, actions: string[]): Promise<string> {
  const name = String(input.chain || "").trim();
  if (!name) return "Which chain?";
  const ch = (await db.select().from(chains).where(eq(chains.name, name)))[0] || (await db.select().from(chains).where(like(chains.name, `%${name}%`)))[0];
  if (!ch) return `No chain named "${name}".`;
  const muted = input.muted !== false;
  await db.update(chains).set({ muted }).where(eq(chains.id, ch.id));
  invalidateRefCache();
  actions.push(`${muted ? "Muted" : "Unmuted"} chain: ${ch.name}`);
  return `${muted ? "Muted" : "Unmuted"} ${ch.name} — ${muted ? "hidden from every city" : "visible again"}.`;
}
async function runTool(name: string, input: Record<string, any>, actions: string[]): Promise<string> {
  try {
    if (name === "find_stores") return await toolFindStores(input);
    if (name === "add_store") return await toolAddStore(input, actions);
    if (name === "update_store") return await toolUpdateStore(input, actions);
    if (name === "store_intel") return await toolStoreIntel();
    if (name === "add_category") return await toolAddCategory(input, actions);
    if (name === "mute_chain") return await toolMuteChain(input, actions);
    return `Unknown tool: ${name}`;
  } catch (e) { return `Error running ${name}: ${(e as Error)?.message || String(e)}`; }
}

/** Run one operator turn to completion (internal tool loop). Returns the reply + actions taken + the model used. */
export async function runAdminAgent(history: { role: "user" | "assistant"; text: string }[], model?: string): Promise<{ reply: string; actions: string[]; error?: string; model: string }> {
  const m = model && providerOf(model) ? model : DEFAULT_MODEL;
  const conv: CTurn[] = history.slice(-20).filter((h) => h && h.text != null).map((h) => ({ role: h.role, blocks: [{ type: "text", text: String(h.text) }] }));
  if (!conv.length) return { reply: "", actions: [], error: "No message.", model: m };
  const actions: string[] = [];
  try {
    for (let i = 0; i < 8; i++) {
      const res = await callProvider(m, conv);
      const ablocks: Blk[] = [];
      if (res.text) ablocks.push({ type: "text", text: res.text });
      for (const tc of res.toolCalls) ablocks.push({ type: "tool_call", id: tc.id, name: tc.name, input: tc.input });
      conv.push({ role: "assistant", blocks: ablocks.length ? ablocks : [{ type: "text", text: res.text || "" }] });
      if (res.toolCalls.length) {
        const rb: Blk[] = [];
        for (const tc of res.toolCalls) rb.push({ type: "tool_result", id: tc.id, name: tc.name, output: await runTool(tc.name, tc.input, actions) });
        conv.push({ role: "user", blocks: rb });
        continue;
      }
      return { reply: res.text || "(done)", actions, model: m };
    }
    return { reply: "That took too many steps — try narrowing it down.", actions, model: m };
  } catch (e) {
    return { reply: "", actions, error: (e as Error)?.message || String(e), model: m };
  }
}
