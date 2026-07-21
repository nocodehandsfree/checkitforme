// ── The credit machine ───────────────────────────────────────────────────────────────────────
// Auto make-good for a check that went wrong, no human needed — but only when OUR OWN telemetry
// agrees with the customer's story. Design goals (owner 07-16):
//   · hard to game: signed-in only, the check must be real, recent (7d), and actually CHARGED;
//     one grant per check ever (unique cid); max 2 auto-grants per account per 30 days, past the
//     cap it is always a human; credits only, never money.
//   · evidence, not vibes: a grant needs the call record to contradict the charge — a bad outcome
//     statusKey, a failed status, or a call so short nobody can have answered. "The clerk was
//     wrong" with a clean 90-second connected call is NOT auto-creditable → ticket.
//   · flywheel: every bad-number grant flags the store's phone and kicks a background web
//     re-lookup; a differing suggestion is stored on the grant row for Data to review in Admin.
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { callResults, retailers, supportCreditGrants } from "../db/schema";
import { grantCredits } from "../billing";
import { fetchStorePhone } from "../store-phone";

const WINDOW_DAYS = 7;          // how fresh the check must be (owner: 7 days)
const CAP_PER_30D = 2;          // auto-grants per account per rolling 30 days (owner: 2)
const SHORT_CALL_SECS = 25;     // charged but connected under this → nobody really answered

// statusKeys that mean the customer did NOT get what they paid for. A charged check carrying one
// of these is machine-verifiable evidence on its own. Keys mirror the statuses registry seeded in
// db/bootstrap.ts (nobody_answered, bad_number, …) — keep in sync with it, not with guesses.
const BAD_KEYS = new Set([
  "nobody_answered", "voicemail", "busy", "bad_number", "left_on_hold", "too_busy",
  "language_barrier", "closed", "failed", "admin_hangup",
]);

export type CreditOutcome =
  | { kind: "granted"; cid: number; store: string; reason: string }
  | { kind: "already"; cid: number; store: string }
  | { kind: "denied_fine"; cid: number; store: string; seconds: number | null }
  | { kind: "not_charged"; cid: number; store: string }
  | { kind: "cap" }
  | { kind: "no_recent" }
  | { kind: "ambiguous"; stores: string[] }
  | { kind: "unresolved" }   // asked which store twice, still can't tell → hand to a human
  | { kind: "guest" };

interface Candidate {
  id: number; retailerId: number; storeName: string; storeLocation: string | null; storePhone: string | null;
  statusKey: string | null; status: string; confirmed: boolean | null;
  callSeconds: number | null; chargedAt: number | null; startedAt: number;
}

/**
 * How well the message names this store: the count of the store's own words that appear in the
 * message. Ranking by count (not any-match) is what tells two same-brand stores apart — "Barnes &
 * Noble Thousand Oaks" scores 4 on the Thousand Oaks check but only 2 (barnes, noble) on Calabasas,
 * so the customer can actually pick the one they mean. Any-match treated them as a tie forever.
 */
function storeScore(message: string, c: Candidate): number {
  const m = message.toLowerCase();
  const tokens = `${c.storeName} ${c.storeLocation || ""}`.toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !["store", "shop", "super", "center"].includes(w));
  return tokens.filter((tk) => m.includes(tk)).length;
}

function evidenceFor(c: Candidate): { ok: boolean; reason: string } {
  if (c.statusKey && BAD_KEYS.has(c.statusKey)) return { ok: true, reason: "bad_status" };
  if (c.status === "failed") return { ok: true, reason: "failed" };
  if (c.callSeconds != null && c.callSeconds < SHORT_CALL_SECS) return { ok: true, reason: "short_call" };
  return { ok: false, reason: "telemetry_fine" };
}

/**
 * Verify a check_issue claim against telemetry and grant when everything aligns.
 * Deterministic, cheap (a few indexed reads), and safe to re-run on every message of a
 * conversation until it reaches a terminal outcome.
 */
export async function verifyCheckIssue(accountId: string | null | undefined, message: string, conversationId: number, pinnedCid?: number | null): Promise<CreditOutcome> {
  if (!accountId) return { kind: "guest" };
  const now = Math.floor(Date.now() / 1000);

  // Rolling 30-day cap, counted from actual grants. Past it, a human reviews everything.
  const capRows = await db.select({ n: sql<number>`count(*)` }).from(supportCreditGrants)
    .where(and(eq(supportCreditGrants.accountId, accountId), gt(supportCreditGrants.grantedAt, now - 30 * 86400)));
  if ((capRows[0]?.n || 0) >= CAP_PER_30D) return { kind: "cap" };

  // Their checks inside the window, newest first.
  const rows = await db.select({
    id: callResults.id, retailerId: callResults.retailerId,
    storeName: retailers.name, storeLocation: retailers.location, storePhone: retailers.phone,
    statusKey: callResults.statusKey, status: callResults.status, confirmed: callResults.confirmed,
    callSeconds: callResults.callSeconds, chargedAt: callResults.chargedAt, startedAt: callResults.startedAt,
  }).from(callResults)
    .innerJoin(retailers, eq(callResults.retailerId, retailers.id))
    .where(and(eq(callResults.finderUserId, accountId), gt(callResults.startedAt, now - WINDOW_DAYS * 86400)))
    .orderBy(desc(callResults.startedAt)).limit(12) as Candidate[];
  if (!rows.length) return { kind: "no_recent" };

  // Which check are they talking about?
  //  · pinned — the chat was opened from a check's own status page, so we already know the exact
  //    check they're looking at. Use it, never ask "which store". This is the common path and the
  //    one that was looping before.
  //  · otherwise rank by how well the message names each store and keep only the best matches; a
  //    real tie between different stores is the only thing that still asks.
  let pool = rows;
  let pinned = false;
  if (pinnedCid != null) {
    const hit = rows.find((c) => c.id === pinnedCid);
    if (hit) { pool = [hit]; pinned = true; }
  }
  if (!pinned) {
    const scored = rows.map((c) => ({ c, s: storeScore(message, c) }));
    const max = Math.max(0, ...scored.map((x) => x.s));
    if (max > 0) pool = scored.filter((x) => x.s === max).map((x) => x.c);
    const distinctStores = [...new Set(pool.map((c) => c.storeName))];
    if (distinctStores.length > 1) return { kind: "ambiguous", stores: distinctStores.slice(0, 4) };
  }

  // Same store, several checks: judge the most creditable one (bad evidence first, newest first).
  const target = pool.slice().sort((a, b) => {
    const ea = evidenceFor(a).ok ? 1 : 0, eb = evidenceFor(b).ok ? 1 : 0;
    return eb - ea || b.startedAt - a.startedAt;
  })[0];
  const store = target.storeLocation ? `${target.storeName} (${target.storeLocation})` : target.storeName;

  const prior = (await db.select().from(supportCreditGrants).where(eq(supportCreditGrants.cid, target.id)).limit(1))[0];
  if (prior) return { kind: "already", cid: target.id, store };
  if (!target.chargedAt) return { kind: "not_charged", cid: target.id, store };

  const ev = evidenceFor(target);
  if (!ev.ok) return { kind: "denied_fine", cid: target.id, store, seconds: target.callSeconds };

  // Everything aligned → grant. Insert the grant row FIRST (unique cid = the idempotency lock),
  // then add the credit. A concurrent duplicate loses the insert and never double-pays.
  try {
    await db.insert(supportCreditGrants).values({
      cid: target.id, accountId, conversationId, retailerId: target.retailerId,
      storeName: store, reason: ev.reason,
      evidence: JSON.stringify({ statusKey: target.statusKey, status: target.status, confirmed: target.confirmed,
        callSeconds: target.callSeconds, chargedAt: target.chargedAt }),
      storePhone: target.storePhone, grantedAt: now,
    });
  } catch {
    return { kind: "already", cid: target.id, store };
  }
  await grantCredits(accountId, 1);

  // Flywheel, fire and forget: re-look-up the store's public number; a different answer becomes a
  // suggestion on the grant row for Data to review (we never hot-swap another lane's data).
  recheckPhone(target).catch(() => {});

  return { kind: "granted", cid: target.id, store, reason: ev.reason };
}

async function recheckPhone(c: Candidate): Promise<void> {
  if (!c.storeName) return;
  const found = await fetchStorePhone(c.storeName, c.storeLocation || "");
  if (found && found !== c.storePhone) {
    await db.update(supportCreditGrants).set({ suggestedPhone: found }).where(eq(supportCreditGrants.cid, c.id));
  }
}

/** Admin audit: the most recent auto-grants with their evidence. */
export async function listCreditGrants(limit = 50) {
  return db.select().from(supportCreditGrants).orderBy(desc(supportCreditGrants.grantedAt)).limit(Math.min(limit, 200));
}

// Deterministic customer-facing replies (EN/ES) — money words never come from a model.
export function creditReply(out: CreditOutcome, lang: string): { reply: string; escalate: boolean } {
  const es = lang === "es";
  switch (out.kind) {
    case "granted":
      return { escalate: false, reply: es
        ? `Tenías razón, ese check a ${out.store} salió mal de nuestro lado. Ya devolví 1 check a tu cuenta, está disponible ahora. También marqué el número de esa tienda para corregirlo. Perdón por eso.`
        : `You were right, that check to ${out.store} went wrong on our end. I put 1 check back on your account, it's there now. I also flagged that store's number so it gets fixed. Sorry about that.` };
    case "already":
      return { escalate: false, reply: es
        ? `Ese check a ${out.store} ya fue acreditado antes, así que estás cubierto. Si pasó algo más, cuéntame.`
        : `That check to ${out.store} was already credited back earlier, so you're covered. If something else went wrong, tell me.` };
    case "not_charged":
      return { escalate: false, reply: es
        ? `Buenas noticias: ese check a ${out.store} nunca se cobró. Los checks fallidos son gratis, tu saldo no bajó, así que no hay nada que devolver.`
        : `Good news: that check to ${out.store} was never charged. Failed checks are free, your balance didn't move, so there's nothing to give back.` };
    case "denied_fine": {
      const secs = out.seconds != null ? ` ${out.seconds}s` : "";
      return { escalate: true, reply: es
        ? `Revisé el registro de esa llamada a ${out.store}: conectó${secs ? ` y duró${secs}` : ""} y quedó una respuesta registrada, así que no puedo acreditarlo automáticamente. Si aun así crees que está mal, envíalo al equipo y una persona lo revisa.`
        : `I checked the record for that call to ${out.store}: it connected${secs ? ` and ran${secs}` : ""} with an answer recorded, so I can't add a credit automatically. If you still think it's wrong, send it to the team and a person will review it.` };
    }
    case "cap":
      return { escalate: true, reply: es
        ? `Este necesita una persona. Envíalo al equipo y lo revisan pronto.`
        : `This one needs a person to look at it. Send it over and the team will review it soon.` };
    case "no_recent":
      return { escalate: true, reply: es
        ? `No veo un check en tu cuenta de los últimos 7 días. Si fue hace más tiempo o con otra cuenta, envíalo al equipo y lo revisan.`
        : `I don't see a check on your account from the last 7 days. If it was longer ago or on a different account, send it to the team and they'll review it.` };
    case "ambiguous":
      return { escalate: false, reply: es
        ? `¿Cuál de estos fue? Dime la ciudad y lo reviso: ${out.stores.join(", ")}.`
        : `Which of these was it? Tell me the city and I'll check it: ${out.stores.join(", ")}.` };
    case "unresolved":
      return { escalate: true, reply: es
        ? `Todavía no logro identificar de cuál check hablas desde aquí. Lo envío al equipo y una persona lo revisa contigo.`
        : `I still can't tell which check you mean from here. I'm sending this to the team so a person can sort it out with you.` };
    case "guest":
      return { escalate: false, reply: es
        ? `Los checks viven en tu cuenta, así que inicia sesión y lo reviso al instante. Entra con tu número y vuelve a este chat.`
        : `Checks live on your account, so sign in and I can look it up instantly. Sign in with your number and come back to this chat.` };
  }
}
