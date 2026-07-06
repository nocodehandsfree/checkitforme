// Customer alerts — standing opt-ins + sending over SMS/email, per-plan SMS metering, and an audit log.
// Channels by event (owner): restock = SMS (per-plan capped, COGS), store_added / waitlist / welcome = EMAIL.
// Copy is written to docs/style-guide/COPY_STYLE_GUIDE.md (friend voice, no em-dashes, "check" is the unit).
// SMS goes out via Twilio once a sending number is configured + A2P/toll-free approved; until then it logs
// as "stubbed". Email goes out via the ESP once its key is set; until then it logs as "stubbed". Nothing
// throws — a send that can't complete is recorded, never crashes a trigger.
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { alertSubscriptions, alertSends } from "./db/schema";
import { getSetting, setSetting } from "./db/settings";
import { getAccount, isCompAccount } from "./billing";
import { getPlans } from "./plans";

export type AlertEvent = "restock" | "store_added" | "waitlist" | "welcome";
export type Channel = "sms" | "email";
export const EVENT_CHANNEL: Record<AlertEvent, Channel> = { restock: "sms", store_added: "email", waitlist: "email", welcome: "email" };

export interface AlertTemplate { sms?: string; emailSubject?: string; emailBody?: string }
// Defaults (copy-guide voice). Admin can override any field live via `alerts_json` (setAlertTemplates).
export const DEFAULT_TEMPLATES: Record<AlertEvent, AlertTemplate> = {
  restock: { sms: "{product} is back at {store}. Go grab it before it's gone. checkitforme.com" },
  store_added: {
    emailSubject: "{store} is live. Your check is on us.",
    emailBody: "You asked us to add {store} in {city}. It's live now. Your next check is on us. Go put it to work.",
  },
  waitlist: {
    emailSubject: "We're live in {city}.",
    emailBody: "You wanted us in {city}. We just went live. Pick a store near you and we'll check it for you.",
  },
  welcome: {
    emailSubject: "You're in. First check is on us.",
    emailBody: "Welcome to Check It For Me. Pick a store and a product, we call the store, you get the answer. Your first check is on us.",
  },
};

async function getAlertTemplates(): Promise<Record<AlertEvent, AlertTemplate>> {
  let over: Partial<Record<AlertEvent, AlertTemplate>> = {};
  try { over = JSON.parse((await getSetting("alerts_json")) || "{}"); } catch { /* ignore */ }
  const out = {} as Record<AlertEvent, AlertTemplate>;
  (Object.keys(DEFAULT_TEMPLATES) as AlertEvent[]).forEach((k) => { out[k] = { ...DEFAULT_TEMPLATES[k], ...(over[k] || {}) }; });
  return out;
}
export async function getAlertTemplatesPublic() { return getAlertTemplates(); }
export async function setAlertTemplates(patch: Partial<Record<AlertEvent, AlertTemplate>>) {
  let cur: Record<string, AlertTemplate> = {};
  try { cur = JSON.parse((await getSetting("alerts_json")) || "{}"); } catch { /* ignore */ }
  for (const k of Object.keys(patch)) cur[k] = { ...(cur[k] || {}), ...(patch as Record<string, AlertTemplate>)[k] };
  await setSetting("alerts_json", JSON.stringify(cur));
  return getAlertTemplates();
}

function fill(t: string | undefined, tokens: Record<string, string | number | undefined>): string {
  let s = t || "";
  for (const k of Object.keys(tokens)) s = s.split(`{${k}}`).join(String(tokens[k] ?? ""));
  return s.replace(/\{[a-z]+\}/gi, "").replace(/\s+/g, " ").trim();
}
export function monthKey(d = new Date()): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

/** This tier's monthly restock-SMS budget. null = unlimited (comp / owner). 0 = none (free/PAYG). */
async function smsCapFor(account: Awaited<ReturnType<typeof getAccount>>): Promise<number | null> {
  if (isCompAccount(account)) return null;
  if (!account?.subTier || account.subscription !== "active") return 0;
  const tier = (await getPlans()).tiers.find((t) => t.key === account.subTier);
  return tier ? Math.max(0, tier.smsAlertsPerMonth) : 0;
}
async function smsSentThisMonth(userId: string): Promise<number> {
  const rows = await db.select().from(alertSends).where(and(eq(alertSends.userId, userId), eq(alertSends.channel, "sms"), eq(alertSends.monthKey, monthKey()), eq(alertSends.status, "sent")));
  return rows.length;
}
/** {left, cap}: how many restock texts remain this month. left/cap null = unlimited. */
export async function smsAlertsLeft(userId: string): Promise<{ left: number | null; cap: number | null }> {
  const account = await getAccount(userId);
  const cap = await smsCapFor(account);
  if (cap == null) return { left: null, cap: null };
  return { left: Math.max(0, cap - (await smsSentThisMonth(userId))), cap };
}

async function log(userId: string | null, event: AlertEvent, channel: Channel, toAddr: string | null, status: string, detail?: string) {
  try { await db.insert(alertSends).values({ userId, event, channel, toAddr, status, detail: detail ?? null, monthKey: monthKey() }); } catch { /* logging must never throw */ }
}

// ---- providers (both stub-and-log until their creds are set; they never throw) ----
async function twilioSms(to: string, body: string): Promise<{ ok: boolean; detail: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM || "", msid = process.env.TWILIO_MESSAGING_SERVICE_SID || "";
  if (!sid || !tok || (!from && !msid)) return { ok: false, detail: "sms_not_configured" }; // A2P/number pending → caller logs as stubbed
  const params = new URLSearchParams({ To: to, Body: body });
  if (msid) params.set("MessagingServiceSid", msid); else params.set("From", from);
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" }, body: params.toString(),
    });
    if (!r.ok) return { ok: false, detail: `twilio_${r.status}` };
    const d = (await r.json()) as { sid?: string }; return { ok: true, detail: d.sid || "sent" };
  } catch (e) { return { ok: false, detail: String(e).slice(0, 80) }; }
}
async function espEmail(_to: string, _subject: string, _body: string): Promise<{ ok: boolean; detail: string }> {
  if (!process.env.BRAVO_API_KEY && !process.env.ESP_API_KEY) return { ok: false, detail: "email_not_configured" }; // Bravo key pending → stubbed
  // Wire the actual ESP send here once the key + branded template id are set. Left as a single seam.
  return { ok: false, detail: "esp_send_todo" };
}

/** Send one alert to a user. Resolves channel + recipient, meters SMS, sends (or stubs), and logs. */
export async function sendAlert(userId: string, event: AlertEvent, tokens: Record<string, string | number | undefined> = {}, opts: { to?: string } = {}): Promise<{ status: string; detail?: string }> {
  const channel = EVENT_CHANNEL[event];
  const account = await getAccount(userId).catch(() => null);
  const tpls = await getAlertTemplates();
  const to = opts.to || (channel === "sms" ? account?.phone : account?.email) || "";
  if (!to) { await log(userId, event, channel, null, "skipped_nocontact"); return { status: "skipped_nocontact" }; }

  if (channel === "sms") {
    const { left, cap } = await smsAlertsLeft(userId);
    if (cap != null && left != null && left <= 0) { await log(userId, event, channel, to, "skipped_cap"); return { status: "skipped_cap" }; }
    const body = fill(tpls[event].sms, tokens);
    const res = await twilioSms(to, body);
    const status = res.ok ? "sent" : "stubbed"; await log(userId, event, channel, to, status, res.detail);
    return { status, detail: res.detail };
  }
  const subject = fill(tpls[event].emailSubject, tokens), body = fill(tpls[event].emailBody, tokens);
  const res = await espEmail(to, subject, body);
  const status = res.ok ? "sent" : "stubbed"; await log(userId, event, channel, to, status, res.detail);
  return { status, detail: res.detail };
}

/** Opt a user into an alert (restock of a store/product). Dedups on the same target; reactivates if muted. */
export async function alertSubscribe(userId: string, o: { kind?: string; retailerId?: number | null; categoryId?: number | null; productLabel?: string | null; channel?: Channel }): Promise<{ ok: true; id: number }> {
  const kind = o.kind || "restock", channel: Channel = o.channel === "email" ? "email" : "sms";
  const existing = (await db.select().from(alertSubscriptions).where(and(eq(alertSubscriptions.userId, userId), eq(alertSubscriptions.kind, kind))))
    .find((r) => (r.retailerId ?? null) === (o.retailerId ?? null) && (r.productLabel ?? "") === (o.productLabel ?? ""));
  if (existing) { await db.update(alertSubscriptions).set({ active: 1, channel }).where(eq(alertSubscriptions.id, existing.id)); return { ok: true, id: existing.id }; }
  const ins = await db.insert(alertSubscriptions).values({ userId, kind, retailerId: o.retailerId ?? null, categoryId: o.categoryId ?? null, productLabel: o.productLabel ?? null, channel }).returning({ id: alertSubscriptions.id });
  return { ok: true, id: ins[0]?.id ?? 0 };
}

/** A user's active alert opt-ins + how many restock texts they have left this month. */
export async function myAlerts(userId: string) {
  const subs = await db.select().from(alertSubscriptions).where(and(eq(alertSubscriptions.userId, userId), eq(alertSubscriptions.active, 1)));
  const sms = await smsAlertsLeft(userId);
  return {
    smsAlertsLeft: sms.left, smsAlertsCap: sms.cap,
    subscriptions: subs.map((s) => ({ id: s.id, kind: s.kind, retailerId: s.retailerId, categoryId: s.categoryId, productLabel: s.productLabel, channel: s.channel })),
  };
}
