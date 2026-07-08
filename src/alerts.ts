// Customer alerts — standing opt-ins + sending over SMS/email, per-plan SMS metering, and an audit log.
// Channels by event (owner): restock = SMS (per-plan capped, COGS), store_added / waitlist / welcome = EMAIL.
// Copy is written to docs/design/copy/COPY_STYLE_GUIDE.md (friend voice, no em-dashes, "check" is the unit).
// SMS goes out via Twilio once a sending number is configured + A2P/toll-free approved; until then it logs
// as "stubbed". Email goes out live via Brevo (BREVO_API_KEY, already set); a per-event brevoTemplateId
// swaps the inline HTML for Design's branded template when it's ready. Nothing
// throws — a send that can't complete is recorded, never crashes a trigger.
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { alertSubscriptions, alertSends } from "./db/schema";
import { getSetting, setSetting } from "./db/settings";
import { getAccount, isCompAccount } from "./billing";
import { getPlans } from "./plans";
import { config } from "./config";

export type AlertEvent = "restock" | "store_added" | "waitlist" | "welcome";
export type Channel = "sms" | "email";
export const EVENT_CHANNEL: Record<AlertEvent, Channel> = { restock: "sms", store_added: "email", waitlist: "email", welcome: "email" };

// brevoTemplateId: when Claude Design's branded email is built in Brevo, drop its template id here
// (per event, editable in Admin) and we send that instead of the inline HTML — tokens flow as params.
export interface AlertTemplate { sms?: string; emailSubject?: string; emailBody?: string; brevoTemplateId?: number }
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
function escHtml(s: string): string { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string)); }

// Per-event design content, ported from Claude Design's email mockups (kicker + serif headline + body
// paragraphs + a middle module + one CTA). Tokens stay live; copy is editable here in git.
type EmailModule =
  | { type: "chip"; text: string }
  | { type: "product"; title: string; sub: string; badge: string }
  | { type: "steps"; steps: [string, string][] };
interface EmailDesign { kicker: string; kickerColor: string; headline: string; body: string[]; module?: EmailModule; cta: string; url: string }
const EMAIL_DESIGN: Record<AlertEvent, EmailDesign> = {
  store_added: {
    kicker: "YOUR STORE'S LIVE", kickerColor: "#4ADE80", headline: "You got your store.",
    body: ["{store} in {city} is live. Your next check's on us.", "Pick your product, we call the staff, you get the answer."],
    module: { type: "chip", text: "1 free check, ready" }, cta: "Use my free check", url: "https://checkitforme.com",
  },
  waitlist: {
    kicker: "NOW LIVE NEAR YOU", kickerColor: "#4ADE80", headline: "{city}, we made it.",
    body: ["You waited. Now check any store near you. Pick one, we call, you get the answer.", "Every check is a real call. One store, one straight answer."],
    module: { type: "chip", text: "First check's on us" }, cta: "Check a store", url: "https://checkitforme.com",
  },
  restock: {
    kicker: "BACK IN STOCK", kickerColor: "#FFCB05", headline: "{product}'s back.",
    body: ["{store} in {city} has it again. This stuff doesn't sit long."],
    module: { type: "product", title: "{product}", sub: "{store} · {city}", badge: "SPOTTED TODAY" }, cta: "See the details", url: "https://checkitforme.com",
  },
  welcome: {
    kicker: "WELCOME", kickerColor: "#4ADE80", headline: "You're in.",
    body: ["We call the store so you don't have to. You get a straight answer, about two minutes."],
    module: { type: "steps", steps: [["1", "Pick a store and a product"], ["2", "Check AI calls the staff"], ["3", "You get a straight answer"], ["✓", "First check's on us"]] },
    cta: "Run my first check", url: "https://checkitforme.com",
  },
};
const SERIF = "Georgia,'Times New Roman',serif";
function moduleHtml(m: EmailModule | undefined, tk: Record<string, string | number | undefined>): string {
  if (!m) return "";
  const wrap = (inner: string) => `<tr><td style="padding-bottom:22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#16161C;border-radius:13px"><tr><td style="padding:15px 17px">${inner}</td></tr></table></td></tr>`;
  if (m.type === "chip") return wrap(`<span style="font-size:15px;font-weight:700;color:#FFFFFF;font-family:Inter,Arial,sans-serif">${escHtml(fill(m.text, tk))}</span>`);
  if (m.type === "product") return wrap(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-family:Inter,Arial,sans-serif"><div style="font-size:15px;font-weight:800;color:#FFFFFF">${escHtml(fill(m.title, tk))}</div><div style="font-size:12.5px;color:#8A8A96;margin-top:2px">${escHtml(fill(m.sub, tk))}</div></td>
    <td align="right"><span style="font-size:10.5px;font-weight:800;letter-spacing:.5px;color:#4ADE80;background:rgba(74,222,128,.12);border-radius:6px;padding:5px 9px;font-family:Inter,Arial,sans-serif">${escHtml(m.badge)}</span></td></tr></table>`);
  // steps
  const rows = m.steps.map((s, i) => `<tr>
    <td width="34" valign="middle" style="padding:${i ? "11px" : "2px"} 0 11px"><div style="width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:#1B2A1E;color:#4ADE80;font-size:12px;font-weight:800;font-family:Inter,Arial,sans-serif">${escHtml(s[0])}</div></td>
    <td valign="middle" style="padding:${i ? "11px" : "2px"} 0 11px 12px;font-size:14.5px;font-weight:700;color:#FFFFFF;font-family:Inter,Arial,sans-serif;${i ? "border-top:1px solid #23232B" : ""}">${escHtml(s[1])}</td></tr>`).join("");
  return wrap(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`);
}
/** Email-safe branded HTML matching Design's mockups: table layout + inline styles (renders the same in
 *  Gmail/Outlook/Apple Mail), Check wordmark, green/yellow kicker, serif headline, module, outlined CTA. */
function renderBrandedEmail(event: AlertEvent, _subject: string, _body: string, tokens: Record<string, string | number | undefined> = {}): string {
  const d = EMAIL_DESIGN[event];
  const bodyHtml = d.body.map((p) => `<tr><td style="font-size:15.5px;line-height:1.6;color:#C9C9D2;font-family:Inter,Arial,sans-serif;padding-bottom:14px">${escHtml(fill(p, tokens))}</td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0B0B10">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0B10;margin:0;padding:0"><tr><td align="center" style="padding:26px 16px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
      <tr><td style="padding:2px 2px 20px;font-family:Inter,Arial,sans-serif">
        <span style="font-size:24px;font-weight:800;color:#4ADE80;letter-spacing:-.5px">&#10003;</span><span style="font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:-.5px">Check</span>
      </td></tr>
      <tr><td style="background:#101015;border:1px solid #1E1E26;border-radius:20px;padding:34px 30px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:12px;font-weight:800;letter-spacing:1.5px;color:${d.kickerColor};font-family:Inter,Arial,sans-serif;padding-bottom:12px">${escHtml(d.kicker)}</td></tr>
          <tr><td style="font-size:34px;font-weight:700;color:#FFFFFF;line-height:1.12;font-family:${SERIF};padding-bottom:18px">${escHtml(fill(d.headline, tokens))}</td></tr>
          ${bodyHtml}
          <tr><td style="height:8px"></td></tr>
          ${moduleHtml(d.module, tokens)}
          <tr><td>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td align="center" style="border:2px solid #4ADE80;border-radius:40px;padding:16px 18px">
                <a href="${d.url}" style="color:#4ADE80;font-weight:800;font-size:15px;letter-spacing:1.2px;text-decoration:none;font-family:Inter,Arial,sans-serif;text-transform:uppercase">${escHtml(d.cta)} &rarr;</a>
              </td></tr></table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:20px 6px;font-family:Inter,Arial,sans-serif;font-size:12px;color:#6B6B78">
        <a href="https://checkitforme.com/account" style="color:#8A8A96;text-decoration:none">Manage alerts</a> &nbsp;&middot;&nbsp; <a href="https://checkitforme.com/unsubscribe" style="color:#8A8A96;text-decoration:none">Unsubscribe</a>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}
async function espEmail(to: string, subject: string, body: string, opts: { templateId?: number; params?: Record<string, string | number | undefined>; event?: AlertEvent } = {}): Promise<{ ok: boolean; detail: string }> {
  const key = config.alerts.brevoApiKey;
  if (!key) return { ok: false, detail: "email_not_configured" }; // BREVO_API_KEY unset → stubbed
  const sender = { name: "Check It For Me", email: config.alerts.senderEmail };
  // Prefer a branded Brevo template (Design owns the look) when its id is set; else our email-safe template.
  const payload: Record<string, unknown> = opts.templateId
    ? { sender, to: [{ email: to }], templateId: opts.templateId, params: opts.params || {} }
    : { sender, to: [{ email: to }], subject,
        htmlContent: opts.event ? renderBrandedEmail(opts.event, subject, body, opts.params || {})
          : `<div style="font-family:Inter,Arial,sans-serif;color:#111;max-width:520px"><p style="font-size:15px;line-height:1.55">${escHtml(body)}</p></div>`,
        textContent: `${subject}\n\n${body}\n\nCheck It For Me · checkitforme.com` };
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": key, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok) return { ok: false, detail: `brevo_${r.status}` };
    const d = (await r.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, detail: d.messageId || "sent" };
  } catch (e) { return { ok: false, detail: String(e).slice(0, 80) }; }
}

/** Send one alert to a user. Resolves channel + recipient, meters SMS, sends (or stubs), and logs.
 *  opts.tag is appended to the logged detail (e.g. "r:42" for restock cooldown lookups). */
export async function sendAlert(userId: string, event: AlertEvent, tokens: Record<string, string | number | undefined> = {}, opts: { to?: string; tag?: string } = {}): Promise<{ status: string; detail?: string }> {
  const channel = EVENT_CHANNEL[event];
  const account = await getAccount(userId).catch(() => null);
  const tpls = await getAlertTemplates();
  const to = opts.to || (channel === "sms" ? account?.phone : account?.email) || "";
  const tagged = (d?: string) => [opts.tag, d].filter(Boolean).join(" ") || undefined;
  if (!to) { await log(userId, event, channel, null, "skipped_nocontact", tagged()); return { status: "skipped_nocontact" }; }

  if (channel === "sms") {
    const { left, cap } = await smsAlertsLeft(userId);
    if (cap != null && left != null && left <= 0) { await log(userId, event, channel, to, "skipped_cap", tagged()); return { status: "skipped_cap" }; }
    const body = fill(tpls[event].sms, tokens);
    const res = await twilioSms(to, body);
    const status = res.ok ? "sent" : "stubbed"; await log(userId, event, channel, to, status, tagged(res.detail));
    return { status, detail: res.detail };
  }
  const subject = fill(tpls[event].emailSubject, tokens), body = fill(tpls[event].emailBody, tokens);
  const res = await espEmail(to, subject, body, { templateId: tpls[event].brevoTemplateId, params: strTokens(tokens), event });
  const status = res.ok ? "sent" : "stubbed"; await log(userId, event, channel, to, status, tagged(res.detail));
  return { status, detail: res.detail };
}
/** Coerce token values to strings for Brevo template params. */
function strTokens(t: Record<string, string | number | undefined>): Record<string, string> {
  const o: Record<string, string> = {}; for (const k of Object.keys(t)) o[k] = String(t[k] ?? ""); return o;
}

/** Send an email-only alert to an address with no account (waitlist signups). No metering, always logs. */
export async function sendAnonEmail(event: AlertEvent, tokens: Record<string, string | number | undefined>, to: string): Promise<{ status: string; detail?: string }> {
  if (EVENT_CHANNEL[event] !== "email") return { status: "skipped_notemail" };
  if (!to) { await log(null, event, "email", null, "skipped_nocontact"); return { status: "skipped_nocontact" }; }
  const tpls = await getAlertTemplates();
  const subject = fill(tpls[event].emailSubject, tokens), body = fill(tpls[event].emailBody, tokens);
  const res = await espEmail(to, subject, body, { templateId: tpls[event].brevoTemplateId, params: strTokens(tokens), event });
  const status = res.ok ? "sent" : "stubbed"; await log(null, event, "email", to, status, res.detail);
  return { status, detail: res.detail };
}

/** Admin "send me a test": fires any one template to an address/phone with realistic sample tokens,
 *  bypassing metering + subscriptions. Logged with status "test" prefix so it's obvious in the feed. */
const SAMPLE_TOKENS: Record<string, string> = { store: "Target Glendale", product: "151 Booster Box", city: "Glendale", name: "there" };
export async function sendTestAlert(event: AlertEvent, to: string): Promise<{ status: string; detail?: string; channel: Channel }> {
  const channel = EVENT_CHANNEL[event];
  const tpls = await getAlertTemplates();
  if (!to) { await log(null, event, channel, null, "test_nocontact"); return { status: "skipped_nocontact", channel }; }
  if (channel === "sms") {
    const body = fill(tpls[event].sms, SAMPLE_TOKENS);
    const res = await twilioSms(to, body);
    await log(null, event, "sms", to, res.ok ? "test_sent" : "test_stubbed", res.detail);
    return { status: res.ok ? "sent" : "stubbed", detail: res.detail, channel };
  }
  const subject = fill(tpls[event].emailSubject, SAMPLE_TOKENS), body = fill(tpls[event].emailBody, SAMPLE_TOKENS);
  const res = await espEmail(to, subject, body, { templateId: tpls[event].brevoTemplateId, params: SAMPLE_TOKENS, event });
  await log(null, event, "email", to, res.ok ? "test_sent" : "test_stubbed", res.detail);
  return { status: res.ok ? "sent" : "stubbed", detail: res.detail, channel };
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

/** Have we already texted this user about this store recently? Stops a burst of in_stock signals
 *  (site + Discord + a call, all within minutes) from firing three texts for one restock. */
async function restockedRecently(userId: string, retailerId: number, withinHours = 6): Promise<boolean> {
  const since = Math.floor(Date.now() / 1000) - withinHours * 3600;
  const rows = await db.select().from(alertSends).where(and(eq(alertSends.userId, userId), eq(alertSends.event, "restock")));
  const tag = `r:${retailerId}`;
  return rows.some((r) => (r.detail || "").includes(tag) && (r.createdAt || 0) >= since);
}

/** A store just showed in stock: text every active watcher of that store (or any-store watchers of the
 *  category), respecting the per-user monthly cap and the per-store cooldown. Best-effort, never throws. */
export async function fanoutRestock(retailerId: number, o: { storeName?: string; product?: string; categoryId?: number | null } = {}): Promise<{ notified: number; skipped: number }> {
  let notified = 0, skipped = 0;
  try {
    const subs = await db.select().from(alertSubscriptions).where(and(eq(alertSubscriptions.kind, "restock"), eq(alertSubscriptions.active, 1)));
    for (const s of subs) {
      // Match: this store (or an any-store opt-in), and category if the sub pinned one.
      if (s.retailerId != null && s.retailerId !== retailerId) { continue; }
      if (s.categoryId != null && o.categoryId != null && s.categoryId !== o.categoryId) { continue; }
      if (await restockedRecently(s.userId, retailerId)) { skipped++; continue; }
      const product = o.product || s.productLabel || "your product";
      // tag "r:<id>" is stamped into the send's logged detail so the cooldown can find it next time.
      const res = await sendAlert(s.userId, "restock", { store: o.storeName || "the store", product }, { tag: `r:${retailerId}` });
      if (res.status === "sent" || res.status === "stubbed") notified++; else skipped++;
    }
  } catch { /* fan-out must never break ingest */ }
  return { notified, skipped };
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
