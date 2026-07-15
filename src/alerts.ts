// Customer alerts — standing opt-ins + sending over SMS/email, per-plan SMS metering, and an audit log.
// Channels by event (owner): restock = SMS by default (per-plan capped, COGS), EMAIL when the
// subscription picked it; store_added / waitlist / welcome = EMAIL.
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
  restock: {
    sms: "{product} is back at {store}. Go grab it before it's gone. checkitforme.com",
    emailSubject: "{product} is back at {store}.",
    emailBody: "{store} just told us they have {product} again. This stuff doesn't sit long. Go grab it.",
  },
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

async function log(userId: string | null, event: EmailKind, channel: Channel, toAddr: string | null, status: string, detail?: string) {
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
// "instock_owner" = the hands-free owner ping (a call just confirmed stock) — same branded shell,
// its own copy. It's ops-only, so it isn't in DEFAULT_TEMPLATES (not editable, no metering).
type EmailKind = AlertEvent | "instock_owner";
const EMAIL_DESIGN: Record<EmailKind, EmailDesign> = {
  store_added: {
    kicker: "YOUR STORE'S LIVE", kickerColor: "#4ADE80", headline: "You got your store.",
    body: ["**{store}** in {city} is live. Your next check's on us.", "Pick your product, we call the staff, you get the answer."],
    module: { type: "chip", text: "1 free check, ready" }, cta: "Use my free check", url: "https://checkitforme.com",
  },
  waitlist: {
    kicker: "NOW LIVE NEAR YOU", kickerColor: "#4ADE80", headline: "{city}, we made it.",
    body: ["You waited. Now check any store near you. Pick one, we call, you get the answer.", "Every check is a real call. One store, one straight answer."],
    module: { type: "chip", text: "First check's on us" }, cta: "Check a store", url: "https://checkitforme.com",
  },
  restock: {
    kicker: "BACK IN STOCK", kickerColor: "#FFCB05", headline: "{product}'s back.",
    body: ["**{store}** in {city} has it again. This stuff doesn't sit long."],
    module: { type: "product", title: "{product}", sub: "{store} · {city}", badge: "SPOTTED TODAY" }, cta: "See the details", url: "https://checkitforme.com",
  },
  welcome: {
    kicker: "WELCOME", kickerColor: "#4ADE80", headline: "You're in.",
    body: ["We call the store so you don't have to. You get a straight answer, about two minutes."],
    module: { type: "steps", steps: [["1", "Pick a store and a product"], ["2", "Check AI calls the staff"], ["3", "You get a straight answer"], ["✓", "First check's on us"]] },
    cta: "Run my first check", url: "https://checkitforme.com",
  },
  instock_owner: {
    kicker: "CALL CONFIRMED", kickerColor: "#4ADE80", headline: "It's in stock.",
    body: ["A call just confirmed **{product}** is on the shelf at **{store}**.", "{dayline}"],
    module: { type: "product", title: "{product}", sub: "{store}", badge: "CONFIRMED" },
    cta: "See the call", url: "https://checkitforme.com",
  },
};
const FONT = "Inter,'Segoe UI',Arial,sans-serif";
/** Escape + fill, with **{token}** segments rendered bold-white (the mock bolds {store}/{product}). */
function fillHtmlBold(t: string, tk: Record<string, string | number | undefined>): string {
  return t.split(/(\*\*[^*]+\*\*)/).map((seg) => {
    const m = seg.match(/^\*\*([^*]+)\*\*$/);
    if (m) return `<b style="color:#FFFFFF;font-weight:700">${escHtml(fill(m[1], tk))}</b>`;
    return escHtml(fill(seg, tk));
  }).join("");
}
function moduleHtml(m: EmailModule | undefined, tk: Record<string, string | number | undefined>): string {
  if (!m) return "";
  // Module card: #1B1B20 rounded (Outlook squares the corners off — acceptable, still a solid card).
  const wrap = (inner: string, pad = "15px 18px", radius = 14) => `<tr><td style="padding-top:20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1B1B20;border-radius:${radius}px"><tr><td style="padding:${pad}">${inner}</td></tr></table></td></tr>`;
  if (m.type === "chip") return wrap(`<span style="font-size:14px;font-weight:700;color:#FFFFFF;font-family:${FONT}">${escHtml(fill(m.text, tk))}</span>`);
  if (m.type === "product") return wrap(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-family:${FONT}"><div style="font-size:16px;font-weight:800;color:#FFFFFF">${escHtml(fill(m.title, tk))}</div><div style="font-size:12.5px;font-weight:600;color:#8A8A96;margin-top:4px">${escHtml(fill(m.sub, tk))}</div></td>
    <td align="right" valign="middle"><span style="display:inline-block;font-size:9.5px;font-weight:900;letter-spacing:.6px;color:#4ADE80;background:#122019;border-radius:999px;padding:6px 12px;font-family:${FONT}">${escHtml(m.badge)}</span></td></tr></table>`, "16px 18px", 16);
  // steps: 26px numbered circles (#22222A; the ✓ row #122019), 1px #26262E dividers inset 18px
  const rows = m.steps.map((s, i) => {
    const last = i === m.steps.length - 1;
    return `${i ? `<tr><td colspan="2" style="padding:0 18px"><div style="height:1px;line-height:1px;font-size:0;background:#26262E">&nbsp;</div></td></tr>` : ""}<tr>
    <td width="57" valign="middle" style="padding:${i ? "12px" : "16px"} 0 ${last ? "16px" : "12px"} 18px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;border-radius:50%;background:${last ? "#122019" : "#22222A"};color:#4ADE80;font-size:12px;font-weight:800;font-family:${FONT}">${escHtml(s[0])}</td></tr></table></td>
    <td valign="middle" style="padding:${i ? "12px" : "16px"} 18px ${last ? "16px" : "12px"} 0;font-size:15px;font-weight:${last ? 700 : 600};color:#FFFFFF;font-family:${FONT}">${escHtml(s[1])}</td></tr>`;
  }).join("");
  return `<tr><td style="padding-top:22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1B1B20;border-radius:16px">${rows}</table></td></tr>`;
}
/** Email-safe branded HTML matching Design's approved mock (docs/design/emails/): #08090D board,
 *  Check wordmark image, gradient card, Inter-black headline, module card, filled capsule CTA with
 *  the green ring. Table layout + inline styles + MSO conditionals: Outlook (Word engine) gets a
 *  solid-color card fallback and a VML roundrect button, so it renders clean there too. */
function renderBrandedEmail(event: EmailKind, _subject: string, _body: string, tokens: Record<string, string | number | undefined> = {}): string {
  const d = EMAIL_DESIGN[event];
  // A {url} token deep-links the CTA (owner alert → the call; watch alert → the store). Else the design's default.
  const url = String(tokens.url || d.url);
  // Paragraphs whose tokens fill to nothing (e.g. no restock day heard) are dropped, not rendered as gaps.
  const bodyHtml = d.body.filter((p) => fill(p.replace(/\*\*/g, ""), tokens)).map((p, i) => i === 0
    ? `<tr><td style="padding-top:15px;font-size:17px;line-height:1.5;color:#D1D1DA;font-family:${FONT}">${fillHtmlBold(p, tokens)}</td></tr>`
    : `<tr><td style="padding-top:16px;font-size:14px;line-height:1.5;color:#B9B9C4;font-family:${FONT}">${fillHtmlBold(p, tokens)}</td></tr>`).join("");
  const ctaLabel = `${escHtml(d.cta).toUpperCase()}&nbsp;&nbsp;&rarr;`;
  // Capsule CTA: filled #16161C, 2px green ring, WHITE label. Outlook can't round a td, so MSO gets
  // a VML roundrect (arcsize 50% = full capsule) and everyone else gets the styled <a>.
  const cta = `<tr><td style="padding-top:24px">
    <!--[if mso]>
    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:52px;v-text-anchor:middle;width:520px;" arcsize="50%" strokecolor="#4ADE80" strokeweight="2px" fillcolor="#16161C">
      <w:anchorlock/>
      <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:14px;font-weight:800;letter-spacing:1.6px;">${ctaLabel}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td align="center" style="background:#16161C;border:2px solid #4ADE80;border-radius:999px">
        <a href="${url}" style="display:block;padding:19px 24px;color:#FFFFFF;font-weight:800;font-size:14px;letter-spacing:1.6px;text-decoration:none;font-family:${FONT};text-transform:uppercase">${ctaLabel}</a>
      </td></tr></table>
    <!--<![endif]-->
  </td></tr>`;
  return `<!doctype html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head><body style="margin:0;padding:0;background:#08090D" bgcolor="#08090D">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#08090D" style="background:#08090D;margin:0;padding:0"><tr><td align="center" style="padding:22px 16px 30px">
    <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
      <tr><td style="padding:0 0 22px"><img src="https://checkitforme.com/logos/brand/check.png" width="104" height="33" alt="Check" style="display:block;width:104px;height:33px;border:0"></td></tr>
      <tr><td bgcolor="#14141A" style="background:#14141A;background-image:linear-gradient(180deg,#191920 0%,#111117 100%);border-radius:26px;padding:30px 40px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-size:10.5px;font-weight:700;letter-spacing:1.6px;color:${d.kickerColor};font-family:${FONT}">${escHtml(d.kicker)}</td></tr>
          <tr><td style="padding-top:14px;font-size:33px;font-weight:900;color:#FFFFFF;line-height:1.1;letter-spacing:-1px;font-family:${FONT}">${escHtml(fill(d.headline, tokens))}</td></tr>
          ${bodyHtml}
          ${moduleHtml(d.module, tokens)}
          ${cta}
        </table>
      </td></tr>
      <tr><td style="padding:22px 2px 0;font-family:${FONT};font-size:12.5px;color:#8A8A96">
        <a href="https://checkitforme.com/account" style="color:#8A8A96;text-decoration:none">Manage alerts</a><span style="color:#333340">&nbsp;&middot;&nbsp;</span><a href="https://checkitforme.com/unsubscribe" style="color:#8A8A96;text-decoration:none">Unsubscribe</a>
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr></table></body></html>`;
}
async function espEmail(to: string, subject: string, body: string, opts: { templateId?: number; params?: Record<string, string | number | undefined>; event?: EmailKind } = {}): Promise<{ ok: boolean; detail: string }> {
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
 *  opts.tag is appended to the logged detail (e.g. "r:42" for restock cooldown lookups).
 *  opts.channel overrides the event's default channel (restock can ride email when the user picked it). */
export async function sendAlert(userId: string, event: AlertEvent, tokens: Record<string, string | number | undefined> = {}, opts: { to?: string; tag?: string; channel?: Channel } = {}): Promise<{ status: string; detail?: string }> {
  const channel = opts.channel || EVENT_CHANNEL[event];
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

/** Email one restock-watch contact (the "tell me when it's back" list) — branded template, logged.
 *  Watches are contact-based (no account), so this skips metering. */
export async function sendRestockEmailTo(to: string, tokens: Record<string, string | number | undefined>, opts: { tag?: string } = {}): Promise<{ status: string; detail?: string }> {
  if (!to || !to.includes("@")) { await log(null, "restock", "email", to || null, "skipped_nocontact", opts.tag); return { status: "skipped_nocontact" }; }
  const tpls = await getAlertTemplates();
  const subject = fill(tpls.restock.emailSubject, tokens), body = fill(tpls.restock.emailBody, tokens);
  const res = await espEmail(to, subject, body, { templateId: tpls.restock.brevoTemplateId, params: strTokens(tokens), event: "restock" });
  const status = res.ok ? "sent" : "stubbed"; await log(null, "restock", "email", to, status, [opts.tag, res.detail].filter(Boolean).join(" "));
  return { status, detail: res.detail };
}

/** The hands-free OWNER ping when a call confirms stock — branded shell, ops copy, deep link to the
 *  call. Replaces the old hand-rolled HTML in calls/notify.ts. `test` marks the log row. */
export async function sendOwnerInStockEmail(to: string, t: { store: string; product: string; day?: string | null; url?: string }, opts: { test?: boolean } = {}): Promise<{ status: string; detail?: string; channel: Channel }> {
  if (!to || !to.includes("@")) { await log(null, "instock_owner", "email", to || null, "skipped_nocontact"); return { status: "skipped_nocontact", channel: "email" }; }
  const tokens: Record<string, string> = {
    store: t.store, product: t.product, url: t.url || "https://checkitforme.com",
    dayline: t.day ? `They said they restock ${t.day}.` : "",
  };
  const subject = fill("In stock: {product} at {store}", tokens);
  const body = fill("A call just confirmed {product} is on the shelf at {store}. {dayline}", tokens);
  const res = await espEmail(to, subject, body, { params: tokens, event: "instock_owner" });
  const status = res.ok ? (opts.test ? "test_sent" : "sent") : (opts.test ? "test_stubbed" : "stubbed");
  await log(null, "instock_owner", "email", to, status, res.detail);
  return { status: res.ok ? "sent" : "stubbed", detail: res.detail, channel: "email" };
}

/** Admin "send me a test": fires any one template to an address/phone with realistic sample tokens,
 *  bypassing metering + subscriptions. Logged with status "test" prefix so it's obvious in the feed.
 *  channel override lets restock be tested over EMAIL as well as text. */
const SAMPLE_TOKENS: Record<string, string> = { store: "Target Glendale", product: "151 Booster Box", city: "Glendale", name: "there" };
export async function sendTestAlert(event: AlertEvent, to: string, channelOverride?: Channel): Promise<{ status: string; detail?: string; channel: Channel }> {
  const channel = channelOverride || EVENT_CHANNEL[event];
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
      // The subscription's channel rides through: email opt-ins get the branded email, not a text.
      const res = await sendAlert(s.userId, "restock", { store: o.storeName || "the store", product }, { tag: `r:${retailerId}`, channel: s.channel === "email" ? "email" : "sms" });
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
