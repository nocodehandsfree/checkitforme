// Voices and how they speak: the voice list, the live voice, cloning, tuning, the sandbox, saved
// presets, and the statuses registry that names every verdict a customer sees.

import type { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { statuses } from "../db/schema";
import { applyPreset, applySandboxToStores, applySandboxTuning, applyVoiceTuning, cloneVoice, deletePreset, getLiveVoice, getSandboxTuning, getVoiceTuning, listPresets, listVoices, savePreset, setActiveVoice } from "../calls/service";

export function register(app: Hono) {
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

  // ---- Statuses registry: the single source of truth for customer-facing verdicts ----
  app.get("/pub/statuses", async (c) => c.json(await db.select().from(statuses).orderBy(statuses.sort)));

  app.get("/api/statuses", async (c) => c.json((await db.select().from(statuses).orderBy(statuses.sort)).map((s) => (s.key === "in_stock" ? { ...s, color: "#4ADE80" } : s))));
   // In-stock is locked to the brand green (the logo)
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
}
