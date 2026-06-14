// In-admin Claude agent ("Admin dev"). Lets the owner manage the store database by chatting —
// add stores they find, look stores up, fix details, answer questions. Calls the Anthropic Messages
// API directly via fetch (same idiom as the rest of this server — no SDK dependency), running a
// manual tool-use loop. Low volume (one operator), so it runs on Opus 4.8 for quality.
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { retailers } from "../db/schema";
import { config } from "../config";
import { retailersWithStatus } from "../calls/service";
import { importStores, regionForState, tzForState, normCarries, e164 } from "../stores-import";
import { geocodeMissing } from "../db/import-data";

const MODEL = "claude-opus-4-8";
const CARRY_LABELS = ["Pokémon", "One Piece TCG", "Topps NBA", "NeeDoh"];

const SYSTEM_PROMPT = `You are the Fungibles Admin agent — an assistant embedded in the Fungibles admin panel, talking to the owner.

Fungibles is a retail-stock voice-calling service: it phones stores to check whether trading-card / collectible products are in stock, and shows shoppers which nearby stores have them.

Your job: help the owner manage the store database by chatting — add stores they find, look stores up, fix store details, and answer questions about the data. You have tools; use them rather than guessing.

The store data model:
- A store has: name, location (e.g. "Bodega Bay, CA"), phone (E.164), state (2-letter), region, zip, carries (which products it stocks), stockStatus ("verified" = we know it carries it; "unverified" = suspected), active (false = soft-removed / hidden from shoppers).
- The only product labels are exactly: ${CARRY_LABELS.join(", ")}. Always use these exact strings for "carries".
- "Muted" is a CHAIN-level setting (hides every store of that chain) — not something you change yet.

How to work:
- Before adding a store, ALWAYS call find_stores first to avoid duplicates.
- A store needs at least a name and a location (city + state). A phone is ideal but optional — if you don't have it, add the store anyway and tell the owner it has no number yet.
- When the owner gives partial info ("a card shop in Bodega Bay"), add what you can and say what's missing (phone, exact products) so they can fill it in. Don't invent phone numbers or addresses.
- Confirm with the owner before removing (deactivating) a store.
- Be concise and concrete. State exactly what you did and the store's resulting state. Don't be chatty or add filler.
- You only manage store data through your tools. You can't place calls, change pricing, or build features.`;

const TOOLS = [
  {
    name: "find_stores",
    description: "Search the store database by name, city, or ZIP. Use before adding to avoid duplicates, and to answer questions like 'do we have a store in X'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "name, city, or ZIP to search for" },
        limit: { type: "number", description: "max results (default 10, max 25)" },
      },
      required: ["query"],
    },
  },
  {
    name: "add_store",
    description: "Add a new store to the database. Always search first with find_stores to avoid duplicates.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "store name, e.g. 'Bodega Bay General Store'" },
        city: { type: "string" },
        state: { type: "string", description: "2-letter state code, e.g. CA" },
        zip: { type: "string" },
        address: { type: "string", description: "full street address if known (helps map it)" },
        phone: { type: "string", description: "phone in any format; optional" },
        carries: { type: "string", description: `comma-separated products from: ${CARRY_LABELS.join(", ")}` },
        chain: { type: "string", description: "chain/brand name if it's a chain location, e.g. CVS, GameStop" },
        type: { type: "string", description: "store type, e.g. pharmacy, grocery, hobby, bookstore, electronics" },
        verified: { type: "boolean", description: "true if we already know it carries the product" },
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
        phone: { type: "string" },
        carries: { type: "string", description: `comma-separated from: ${CARRY_LABELS.join(", ")}` },
        verified: { type: "boolean" },
        active: { type: "boolean", description: "false soft-removes / hides the store from shoppers" },
        shipmentDay: { type: "string", description: "known restock day, e.g. Tuesday" },
        specialInstructions: { type: "string", description: "store-specific note for the calling agent" },
      },
    },
  },
  {
    name: "store_intel",
    description: "Headline database numbers — total stores and how many are callable (have a phone).",
    input_schema: { type: "object", properties: {} },
  },
];

type Msg = { role: "user" | "assistant"; content: unknown };
type Turn = { role: "user" | "assistant"; text: string };

async function callClaude(messages: Msg[]): Promise<Record<string, unknown>> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicKey as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    let msg = `Anthropic API error (${r.status}).`;
    try { const j = JSON.parse(t); if (j?.error?.message) msg = j.error.message; } catch { /* keep generic */ }
    if (/credit balance/i.test(msg)) msg = "The Anthropic account is out of credits — add credit at console.anthropic.com → Plans & Billing and I'll start working.";
    else if (r.status === 401) msg = "Anthropic API key is invalid or missing on the server.";
    throw new Error(msg);
  }
  return r.json() as Promise<Record<string, unknown>>;
}

// ---- tools ----
async function toolFindStores(input: { query?: string; limit?: number }): Promise<string> {
  const q = (input.query || "").trim();
  if (q.length < 2) return "Give at least 2 characters to search.";
  const rows = await retailersWithStatus({ q, limit: Math.min(Math.max(input.limit || 10, 1), 25) });
  if (!rows.length) return `No stores match "${q}".`;
  return JSON.stringify(rows.slice(0, 25).map((r) => ({
    id: r.id, name: r.name, location: r.location, phone: r.phone || "(none)",
    carries: r.carries || "(unknown)", status: r.stockStatus, type: r.storeType, active: r.active,
  })));
}

async function toolAddStore(input: Record<string, unknown>, actions: string[]): Promise<string> {
  const name = String(input.name || "").trim();
  if (!name) return "A store name is required.";
  const phone = e164(String(input.phone || ""));
  const state = String(input.state || "").toUpperCase() || undefined;
  const city = input.city ? String(input.city) : undefined;
  const carries = input.carries as string | string[] | undefined;
  if (phone) {
    const res = await importStores([{
      name, phone, city, state, zip: input.zip ? String(input.zip) : undefined,
      address: input.address ? String(input.address) : undefined, carries,
      chain: input.chain ? String(input.chain) : undefined, category: input.type ? String(input.type) : undefined,
      stockStatus: input.verified ? "verified" : undefined,
    }]);
    geocodeMissing(2).catch(() => {});
    if (res.inserted) { actions.push(`Added store: ${name}`); return `Added "${name}".`; }
    if (res.updated) { actions.push(`Updated existing store (same phone): ${name}`); return `A store with that phone already existed — updated it instead of duplicating.`; }
    return `Could not add "${name}" (skipped — check the name and phone).`;
  }
  // No phone: insert directly (importStores skips phone-less rows). Flagged "no number" until one's added.
  const loc = city && state ? `${city}, ${state}` : (city || state || (input.address ? String(input.address) : ""));
  const [row] = await db.insert(retailers).values({
    name, location: String(loc || name), phone: "", timezone: tzForState(state),
    state: state || null, region: regionForState(state),
    zip: input.zip ? String(input.zip) : null, address: input.address ? String(input.address) : null,
    carries: normCarries(carries), stockStatus: input.verified ? "verified" : "unverified",
  }).returning();
  geocodeMissing(2).catch(() => {});
  actions.push(`Added store (no phone yet): ${name}`);
  return `Added "${row?.name || name}" (no phone yet — it'll show as 'no number' until one's added).`;
}

async function toolUpdateStore(input: Record<string, unknown>, actions: string[]): Promise<string> {
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
  if (input.carries != null) set.carries = normCarries(input.carries as string);
  if (input.verified === true) set.stockStatus = "verified";
  if (input.verified === false) set.stockStatus = "unverified";
  if (input.active === false) set.active = false;
  if (input.active === true) set.active = true;
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
  const callableRows = await db.select({ n: sql<number>`count(*)` }).from(retailers)
    .where(and(active, sql`${retailers.phone} is not null and ${retailers.phone} != '' and ${retailers.phone} not like 'nophone:%'`));
  const callable = Number(callableRows[0]?.n || 0);
  return JSON.stringify({ total, callable });
}

async function runTool(name: string, input: Record<string, unknown>, actions: string[]): Promise<string> {
  try {
    if (name === "find_stores") return await toolFindStores(input);
    if (name === "add_store") return await toolAddStore(input, actions);
    if (name === "update_store") return await toolUpdateStore(input, actions);
    if (name === "store_intel") return await toolStoreIntel();
    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Error running ${name}: ${(e as Error)?.message || String(e)}`;
  }
}

/** Run one operator turn to completion (internal tool loop). Returns the reply + a list of actions taken. */
export async function runAdminAgent(history: Turn[]): Promise<{ reply: string; actions: string[]; error?: string }> {
  if (!config.anthropicKey) return { reply: "", actions: [], error: "ANTHROPIC_API_KEY is not set on the server." };
  const actions: string[] = [];
  const messages: Msg[] = history.slice(-20).filter((m) => m && m.text != null).map((m) => ({ role: m.role, content: String(m.text) }));
  if (!messages.length) return { reply: "", actions: [], error: "No message." };
  try {
    for (let i = 0; i < 8; i++) {
      const data = await callClaude(messages);
      const content = (data.content as Array<Record<string, unknown>>) || [];
      messages.push({ role: "assistant", content });
      if (data.stop_reason === "tool_use") {
        const results = [];
        for (const block of content) {
          if (block.type !== "tool_use") continue;
          const out = await runTool(String(block.name), (block.input as Record<string, unknown>) || {}, actions);
          results.push({ type: "tool_result", tool_use_id: block.id, content: out });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      const text = content.filter((b) => b.type === "text").map((b) => String(b.text || "")).join("\n").trim();
      return { reply: text || "(done)", actions };
    }
    return { reply: "That took too many steps — try narrowing it down.", actions };
  } catch (e) {
    return { reply: "", actions, error: (e as Error)?.message || String(e) };
  }
}
