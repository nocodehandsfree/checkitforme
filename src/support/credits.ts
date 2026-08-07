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
// Keys that auto-refund a CHARGED check. Owner billing ruling 07-22: engaged-but-no-answer calls
// (left on hold, too busy, language barrier) are now DELIBERATELY charged — real minutes were
// burned by a real human — so they must NOT auto-refund here, or billing and refunds fight.
// The relief valve for angry edge cases stays the human ticket + Admin grant.
const BAD_KEYS = new Set([
  "nobody_answered", "voicemail", "busy", "bad_number", "closed", "failed", "admin_hangup",
]);

// The statuses the owner DELIBERATELY charges: a real person picked up and burned real minutes on
// us without landing on an answer. Mirrors billableOutcome() in src/calls/service.ts — keep the two
// in lockstep. Nothing in here may ever auto-refund, whatever else the telemetry says. Keeping them
// out of BAD_KEYS was not enough on its own: the short-call rule let a hold back in through the
// side door whenever the call happened to be brief, so we charged for it and refunded it in the
// same breath, which is exactly the fight the 07-22 ruling exists to prevent (found 08-05).
// "No clear answer" (owner 08-07) joins them: it is only ever stamped when a real person talked to
// us in words we wrote down and still never answered, which is the same ruling with its own word on
// it. Left out of this set it would fall through to the short-call rule and be refunded on a check
// billableOutcome() had just charged, which is the fight the 07-22 ruling exists to prevent.
const CHARGED_ANYWAY = new Set(["left_on_hold", "too_busy", "language_barrier", "staff_hung_up", "no_straight_answer"]);
// The fifth case from the same ruling: an unclear verdict that came out of a REAL two-way call is
// charged too, because a person talked to us. billableOutcome() proves it by finding both sides in
// the transcript, so this reads the same evidence. Without it a charged unclear check looked
// refundable, and a customer asking about one got sent to a person instead of an explanation
// (round 2 test 3, 08-06).
const spokeToAPerson = (t: string | null | undefined): boolean =>
  !!t && /^Agent:/m.test(t) && /^Clerk:/m.test(t);

export type CreditOutcome =
  | { kind: "granted"; cid: number; store: string; reason: string }
  | { kind: "already"; cid: number; store: string }
  | { kind: "denied_fine"; cid: number; store: string; seconds: number | null }
  | { kind: "too_old"; cid: number; store: string }   // pinned check found, but past the 7-day window
  | { kind: "not_charged"; cid: number; store: string; statusKey: string | null }
  | { kind: "cap" }
  | { kind: "no_recent" }
  | { kind: "ambiguous"; stores: string[] }
  | { kind: "unresolved" }   // asked which store twice, still can't tell → hand to a human
  | { kind: "guest" };

interface Candidate {
  id: number; retailerId: number; storeName: string; storeLocation: string | null; storePhone: string | null;
  providerCallId: string | null;
  statusKey: string | null; status: string; confirmed: boolean | null;
  callSeconds: number | null; chargedAt: number | null; startedAt: number; transcript?: string | null;
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

// The store actually answered the question: a real verdict came back. Nothing about a check like
// this is evidence the customer was wronged, however fast it was.
const ANSWERED_KEYS = new Set(["in_stock", "not_in_stock", "sold_out", "does_not_sell", "restock"]);
const gotAnAnswer = (c: Candidate): boolean =>
  c.confirmed != null || (!!c.statusKey && ANSWERED_KEYS.has(c.statusKey));

/** The exact check a chat was opened from, looked up by row id or provider id, for THIS account
 *  only. No time window: the customer is looking at the thing, so we answer about the thing. Age
 *  still decides whether it can earn a credit, further down. */
async function findPinned(accountId: string, ref: string): Promise<Candidate | null> {
  const byId = /^\d+$/.test(ref);
  const rows = await db.select({
    id: callResults.id, retailerId: callResults.retailerId,
    storeName: retailers.name, storeLocation: retailers.location, storePhone: retailers.phone,
    providerCallId: callResults.providerCallId,
    statusKey: callResults.statusKey, status: callResults.status, confirmed: callResults.confirmed,
    callSeconds: callResults.callSeconds, chargedAt: callResults.chargedAt, startedAt: callResults.startedAt,
    transcript: callResults.transcript,
  }).from(callResults)
    .innerJoin(retailers, eq(callResults.retailerId, retailers.id))
    .where(and(eq(callResults.finderUserId, accountId),
      byId ? eq(callResults.id, Number(ref)) : eq(callResults.providerCallId, ref)))
    .limit(1) as Candidate[];
  return rows[0] || null;
}

function evidenceFor(c: Candidate): { ok: boolean; reason: string } {
  // A check that came back with a real verdict is not refundable on telemetry, full stop. This
  // guard is why: the robot customer complained about a check and the machine refunded a DIFFERENT
  // one that had answered "in stock" in 24 seconds, purely for being a second under the short-call
  // bar (08-05). A fast answered check is the best check we run, the cheapest and the highest
  // margin, and every one of them was refundable on request. A wrong verdict is a judgement call
  // for a person, never something telemetry can prove.
  if (gotAnAnswer(c)) return { ok: false, reason: "answered" };
  // A person really did pick up. The owner charges for that on purpose, so the machine never undoes
  // it; an angry edge case goes to a human ticket, which is the relief valve by design.
  if (c.statusKey && CHARGED_ANYWAY.has(c.statusKey)) return { ok: false, reason: "person_engaged" };
  if (c.statusKey === "no_clear_answer" && spokeToAPerson(c.transcript)) return { ok: false, reason: "person_engaged" };
  if (c.statusKey && BAD_KEYS.has(c.statusKey)) return { ok: true, reason: "bad_status" };
  if (c.status === "failed") return { ok: true, reason: "failed" };
  // Short calls only mean "nobody really answered" when nobody really answered.
  if (c.callSeconds != null && c.callSeconds < SHORT_CALL_SECS) return { ok: true, reason: "short_call" };
  return { ok: false, reason: "telemetry_fine" };
}

/**
 * Verify a check_issue claim against telemetry and grant when everything aligns.
 * Deterministic, cheap (a few indexed reads), and safe to re-run on every message of a
 * conversation until it reaches a terminal outcome.
 */
export async function verifyCheckIssue(accountId: string | null | undefined, message: string, conversationId: number, pinnedRef?: string | null): Promise<CreditOutcome> {
  if (!accountId) return { kind: "guest" };
  const now = Math.floor(Date.now() / 1000);

  // Rolling 30-day cap, counted from actual grants. Read now, APPLIED at the point a credit would
  // actually be handed out. It used to return here, before we had even worked out whether money was
  // involved: a customer at their cap asking "nobody picked up, am I out a check?" was answered
  // "this one needs a person", when the true answer was free, you were never charged, and no credit
  // was ever in question (found 08-05). The cap exists to stop grants, not to stop answers.
  const capRows = await db.select({ n: sql<number>`count(*)` }).from(supportCreditGrants)
    .where(and(eq(supportCreditGrants.accountId, accountId), gt(supportCreditGrants.grantedAt, now - 30 * 86400)));
  const atCap = (capRows[0]?.n || 0) >= CAP_PER_30D;

  // Their checks inside the window, newest first.
  const rows = await db.select({
    id: callResults.id, retailerId: callResults.retailerId,
    storeName: retailers.name, storeLocation: retailers.location, storePhone: retailers.phone,
    providerCallId: callResults.providerCallId,
    statusKey: callResults.statusKey, status: callResults.status, confirmed: callResults.confirmed,
    callSeconds: callResults.callSeconds, chargedAt: callResults.chargedAt, startedAt: callResults.startedAt,
    transcript: callResults.transcript,
  }).from(callResults)
    .innerJoin(retailers, eq(callResults.retailerId, retailers.id))
    .where(and(eq(callResults.finderUserId, accountId), gt(callResults.startedAt, now - WINDOW_DAYS * 86400)))
    .orderBy(desc(callResults.startedAt)).limit(12) as Candidate[];
  if (!rows.length) return { kind: "no_recent" };

  // Which check are they talking about?
  //  · pinned — the chat was opened from a check's own status page, so we already know the exact
  //    check they're looking at. Use it, never ask "which store". This is the common path and the
  //    one that was looping before. The client hands us whichever id it holds: the numeric row id
  //    OR the provider conversation id (conv_… from a ?call= deep link), so match on either.
  //  · otherwise rank by how well the message names each store and keep only the best matches; a
  //    real tie between different stores is the only thing that still asks.
  let pool = rows;
  let pinned = false;
  if (pinnedRef) {
    let hit = rows.find((c) => String(c.id) === pinnedRef || c.providerCallId === pinnedRef);
    // Not among the newest 12? Go get it by id. The window above exists to rank a vague complaint
    // against recent checks; it must never decide WHICH check a customer is staring at. Before this,
    // opening the chat from an older check's page silently retargeted the whole conversation onto a
    // newer, unrelated check: the robot customer complained about a check where it was left on hold
    // and the machine answered about, and granted a credit against, a different one (08-05).
    if (!hit) hit = (await findPinned(accountId, pinnedRef)) ?? undefined;
    // Still nothing: the id is not this account's check (placed before they signed in, opened from
    // someone else's link, or simply stale). Do NOT quietly fall through to guessing from their
    // recent checks — that is how a customer looking at one check got told about another store's,
    // with a credit decision attached (08-05, a Fun store check with no account on it answered as
    // an MVPs check). They opened this from a specific check, so it is that check or a person.
    if (!hit) return { kind: "unresolved" };
    pool = [hit];
    pinned = true;
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
  // A pinned check skips the recency filter on the query above so we can still TALK about it. It
  // does not skip the owner's 7-day rule for earning a credit, so say that plainly here.
  if (target.startedAt <= now - WINDOW_DAYS * 86400) return { kind: "too_old", cid: target.id, store };
  if (!target.chargedAt) return { kind: "not_charged", cid: target.id, store, statusKey: target.statusKey };

  const ev = evidenceFor(target);
  if (!ev.ok) return { kind: "denied_fine", cid: target.id, store, seconds: target.callSeconds };
  // Everything else lines up, so this WOULD be a credit. Now the cap applies.
  if (atCap) return { kind: "cap" };

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

// Plain-words reason a check never completed, from its telemetry statusKey. Friend voice, no store
// name (the sentence around it names the store once). Anything we don't have a specific line for
// falls back to "the call didn't connect" — never invents a cause.
function wentWrong(statusKey: string | null, es: boolean): string {
  switch (statusKey) {
    case "bad_number":       return es ? "El número que teníamos no funcionó" : "The number we had didn't work";
    case "nobody_answered":  return es ? "Nadie contestó" : "Nobody picked up";
    case "voicemail":        return es ? "Entró al buzón de voz" : "It went to voicemail";
    case "busy":
    case "too_busy":         return es ? "La línea estaba ocupada" : "The line was busy";
    case "left_on_hold":     return es ? "Nos dejaron en espera" : "We got left on hold";
    case "staff_hung_up":    return es ? "El personal colgó" : "Staff hung up";
    case "closed":           return es ? "La tienda estaba cerrada" : "The store was closed";
    case "language_barrier": return es ? "No pudimos pasar la barrera del idioma" : "We couldn't get past a language barrier";
    default:                 return es ? "La llamada no conectó" : "The call didn't connect";
  }
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
        ? `Ese check a ${out.store} no se concretó. ${wentWrong(out.statusKey, true)}, así que la llamada no se completó y no te cobramos. Todos tus checks siguen en tu cuenta. Puedes intentarlo otra vez cuando quieras, y si sigue fallando avísame y pongo a una persona a revisar el número de esa tienda.`
        : `That check to ${out.store} didn't go through. ${wentWrong(out.statusKey, false)}, so the call never completed and you weren't charged. All your checks are still on your account. You can try again anytime, and if it keeps failing tell me and I'll get a person on that store's number.` };
    case "denied_fine": {
      const secs = out.seconds != null ? ` ${out.seconds}s` : "";
      return { escalate: true, reply: es
        ? `Revisé el registro de esa llamada a ${out.store}: conectó${secs ? ` y duró${secs}` : ""} y quedó una respuesta registrada, así que no puedo acreditarlo automáticamente. Si aun así crees que está mal, envíalo al equipo y una persona lo revisa.`
        : `I checked the record for that call to ${out.store}: it connected${secs ? ` and ran${secs}` : ""} with an answer recorded, so I can't add a credit automatically. If you still think it's wrong, send it to the team and a person will review it.` };
    }
    case "too_old":
      return { escalate: true, reply: es
        ? `Ese check a ${out.store} tiene más de 7 días, que es el límite para acreditarlo automáticamente. Envíalo al equipo y una persona lo revisa.`
        : `That check to ${out.store} is more than 7 days old, which is past the window I can credit automatically. Send it to the team and a person will review it.` };
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
