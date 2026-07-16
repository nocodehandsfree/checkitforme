// Customer alerts — standing opt-ins + sending over SMS/email, per-plan SMS metering, and an audit log.
// Channels by event (owner): restock = SMS by default (per-plan capped, COGS), EMAIL when the
// subscription picked it; store_added / waitlist / welcome = EMAIL.
// Copy is written to docs/design/copy/COPY_STYLE_GUIDE.md (friend voice, no em-dashes, "check" is the unit).
// SMS goes out via Twilio once a sending number is configured + A2P/toll-free approved; until then it logs
// as "stubbed". Email goes out live via Brevo (BREVO_API_KEY, already set); a per-event brevoTemplateId
// swaps the inline HTML for Design's branded template when it's ready. Nothing
// throws — a send that can't complete is recorded, never crashes a trigger.
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db/client";
import { accounts, alertSubscriptions, alertSends, retailers, categories } from "./db/schema";
import { getSetting, setSetting } from "./db/settings";
import { getAccount, isCompAccount } from "./billing";
import { getPlans } from "./plans";
import { config } from "./config";

// "welcome" is dead (owner 2026-07-15): there is no email-only signup — everyone signs up by phone,
// email is optional and added later. What replaced it: "confirm_email", sent when someone adds an
// email address; no alert email goes out until they tap confirm.
export type AlertEvent = "restock" | "store_added" | "waitlist" | "confirm_email" | "auto_check";
export type Channel = "sms" | "email";
export type Lang = "en" | "es";
export const EVENT_CHANNEL: Record<AlertEvent, Channel> = { restock: "sms", store_added: "email", waitlist: "email", confirm_email: "email", auto_check: "sms" };
/** A recipient's language: 'es' only when their account is explicitly Spanish, else English. */
export function accountLang(a: { language?: string | null } | null | undefined): Lang { return a?.language === "es" ? "es" : "en"; }
/** {result} is built from the English statuses registry — translate it for a Spanish send. */
export function localizeResult(result: string, lang: Lang): string {
  if (lang !== "es") return result;
  const m: Record<string, string> = { "In stock": "En stock", "Not in stock": "No hay", "Nobody answered": "Nadie contestó", "No clear answer": "Sin respuesta clara" };
  return m[result] || result;
}

// brevoTemplateId: when Claude Design's branded email is built in Brevo, drop its template id here
// (per event, editable in Admin) and we send that instead of the inline HTML — tokens flow as params.
export interface AlertTemplate { sms?: string; emailSubject?: string; emailBody?: string; brevoTemplateId?: number }
// Final copy: Copper 2026-07-15 (docs COPY_STYLE_GUIDE.md). EN is Admin-editable via `alerts_json`;
// ES is code-only (Admin is English). emailSubject = inbox line; emailBody = the plain-text fallback
// (the branded HTML comes from EMAIL_DESIGN). Subjects mirror the design board's inbox previews.
export const DEFAULT_TEMPLATES: Record<AlertEvent, AlertTemplate> = {
  restock: {
    sms: "{product} is back at {store}. Move fast, this stuff doesn't sit. checkitforme.com",
    emailSubject: "It's back at {store}.",
    emailBody: "{store} in {city} has it again. This stuff moves fast. Go before it's gone.",
  },
  store_added: {
    emailSubject: "You got your store.",
    emailBody: "{store} in {city} is live, and your next check is on us. Pick a product, Check AI calls the Staff, you get a straight answer.",
  },
  waitlist: {
    emailSubject: "{city}, we made it.",
    emailBody: "Check is live in {city}. Call any store near you, right from your phone. Your first check is on us.",
  },
  confirm_email: {
    emailSubject: "Confirm your email.",
    emailBody: "You added this address for alerts. Tap the button to confirm it's yours, then they'll land right here.",
  },
  auto_check: {
    sms: "Your auto check called {store}. Result: {result}. See it at checkitforme.com",
    emailSubject: "Auto check: {result}.",
    emailBody: "Your auto check just called {store} about {product}. Tap in to see exactly what Staff said.",
  },
};
// Spanish. Starts from EN defaults, so any field left off falls back to English (never a blank send).
export const ES_TEMPLATES: Record<AlertEvent, AlertTemplate> = {
  restock: {
    sms: "{product} volvió a {store}. Ve rápido, esto no dura. checkitforme.com",
    emailSubject: "Volvió a {store}.",
    emailBody: "{store} en {city} lo tiene otra vez. Esto vuela. Ve por él antes de que se acabe.",
  },
  store_added: {
    emailSubject: "Ya tienes tienda.",
    emailBody: "{store} en {city} ya está, y tu próximo check va por nuestra cuenta. Elige un producto, Check AI llama al Staff y te da una respuesta clara.",
  },
  waitlist: {
    emailSubject: "{city}, ya llegamos.",
    emailBody: "Check ya está en {city}. Llama a cualquier tienda cerca, desde tu teléfono. Tu primer check va por nuestra cuenta.",
  },
  confirm_email: {
    emailSubject: "Confirma tu correo.",
    emailBody: "Agregaste este correo para tus alertas. Toca el botón para confirmarlo y empezarán a llegar aquí.",
  },
  auto_check: {
    sms: "Tu check automático llamó a {store}. {result}. Míralo en checkitforme.com",
    emailSubject: "Check automático: {result}.",
    emailBody: "Tu check automático llamó a {store} por {product}. Toca para ver qué dijo el Staff.",
  },
};

async function getAlertTemplates(lang: Lang = "en"): Promise<Record<AlertEvent, AlertTemplate>> {
  const base = lang === "es" ? ES_TEMPLATES : DEFAULT_TEMPLATES;
  // Admin edits English only; Spanish is code copy with an EN fallback.
  let over: Partial<Record<AlertEvent, AlertTemplate>> = {};
  if (lang === "en") { try { over = JSON.parse((await getSetting("alerts_json")) || "{}"); } catch { /* ignore */ } }
  const out = {} as Record<AlertEvent, AlertTemplate>;
  (Object.keys(DEFAULT_TEMPLATES) as AlertEvent[]).forEach((k) => { out[k] = { ...DEFAULT_TEMPLATES[k], ...(base[k] || {}), ...(over[k] || {}) }; });
  return out;
}
export async function getAlertTemplatesPublic() { return getAlertTemplates("en"); }
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

// ---- signed email tokens: power the one-click Unsubscribe + Confirm-email links. HMAC over the
// lowercased address, so a link can't be forged for someone else's inbox. ----
export function emailToken(email: string): string {
  const secret = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex").slice(0, 24);
}
export function checkEmailToken(email: string, token: string): boolean {
  return !!email && !!token && emailToken(email) === token;
}
const siteUrl = () => (config.appUrl || "https://checkitforme.com").replace(/\/$/, "");
export const manageAlertsUrl = () => `${siteUrl()}/?alerts=1`;
export const unsubscribeUrl = (email: string) => `${siteUrl()}/unsubscribe?e=${encodeURIComponent(email.trim().toLowerCase())}&t=${emailToken(email)}`;

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
// Source of truth: Copper's final copy (2026-07-15) over docs/design/emails/check-email-alerts-design.html.
// Bilingual: EMAIL_DESIGN[lang][event]. instock_owner is internal → English only (the ES map reuses it).
const EMAIL_DESIGN_EN: Record<EmailKind, EmailDesign> = {
  store_added: {
    kicker: "YOUR STORE IS LIVE", kickerColor: "#4ADE80", headline: "You got your store.",
    body: ["**{store}** in {city} is live, and your next check is on us.", "Pick a product, Check AI calls the Staff, you get a straight answer."],
    cta: "Use my free check", url: "https://checkitforme.com",
  },
  waitlist: {
    kicker: "NOW LIVE NEAR YOU", kickerColor: "#4ADE80", headline: "{city}, we made it.",
    body: ["Check is live in {city}. Call any store near you, right from your phone.", "Your first check is on us."],
    cta: "Use my free check", url: "https://checkitforme.com",
  },
  restock: {
    kicker: "BACK IN STOCK", kickerColor: "#FFCB05", headline: "It's back.",
    body: ["**{store}** in {city} has it again.", "This stuff moves fast. Go before it's gone."],
    module: { type: "product", title: "{product}", sub: "{store} · {city}", badge: "JUST SPOTTED" }, cta: "See the store", url: "https://checkitforme.com",
  },
  confirm_email: {
    kicker: "CONFIRM YOUR EMAIL", kickerColor: "#4ADE80", headline: "One tap left.",
    body: ["You added this address for alerts. Tap below to confirm it's yours, then they'll land right here."],
    module: { type: "chip", text: "{email}" },
    cta: "Confirm my email", url: "https://checkitforme.com",
  },
  auto_check: {
    kicker: "AUTO CHECK", kickerColor: "#A78BFA", headline: "{result}.",
    body: ["Your auto check just called **{store}** about **{product}**.", "Tap in to see exactly what Staff said."],
    module: { type: "product", title: "{product}", sub: "{store}", badge: "AUTO CHECK" },
    cta: "See the call", url: "https://checkitforme.com",
  },
  instock_owner: {
    kicker: "CALL CONFIRMED", kickerColor: "#4ADE80", headline: "It's in stock.",
    body: ["A call just confirmed **{product}** is on the shelf at **{store}**.", "{dayline}"],
    module: { type: "product", title: "{product}", sub: "{store}", badge: "CONFIRMED" },
    cta: "See the call", url: "https://checkitforme.com",
  },
};
const EMAIL_DESIGN_ES: Record<EmailKind, EmailDesign> = {
  store_added: {
    kicker: "YA ESTÁ TU TIENDA", kickerColor: "#4ADE80", headline: "Ya tienes tienda.",
    body: ["**{store}** en {city} ya está, y tu próximo check va por nuestra cuenta.", "Elige un producto, Check AI llama al Staff y te da una respuesta clara."],
    cta: "Usar mi check gratis", url: "https://checkitforme.com",
  },
  waitlist: {
    kicker: "YA ESTAMOS AQUÍ", kickerColor: "#4ADE80", headline: "{city}, ya llegamos.",
    body: ["Check ya está en {city}. Llama a cualquier tienda cerca, desde tu teléfono.", "Tu primer check va por nuestra cuenta."],
    cta: "Usar mi check gratis", url: "https://checkitforme.com",
  },
  restock: {
    kicker: "YA DISPONIBLE", kickerColor: "#FFCB05", headline: "Volvió.",
    body: ["**{store}** en {city} lo tiene otra vez.", "Esto vuela. Ve por él antes de que se acabe."],
    module: { type: "product", title: "{product}", sub: "{store} · {city}", badge: "VISTO HOY" }, cta: "Ver la tienda", url: "https://checkitforme.com",
  },
  confirm_email: {
    kicker: "CONFIRMA TU CORREO", kickerColor: "#4ADE80", headline: "Un toque más.",
    body: ["Agregaste este correo para tus alertas. Toca abajo para confirmarlo y empezarán a llegar aquí."],
    module: { type: "chip", text: "{email}" },
    cta: "Confirmar mi correo", url: "https://checkitforme.com",
  },
  auto_check: {
    kicker: "CHECK AUTOMÁTICO", kickerColor: "#A78BFA", headline: "{result}.",
    body: ["Tu check automático llamó a **{store}** por **{product}**.", "Toca para ver qué dijo el Staff."],
    module: { type: "product", title: "{product}", sub: "{store}", badge: "CHECK AUTO" },
    cta: "Ver la llamada", url: "https://checkitforme.com",
  },
  instock_owner: EMAIL_DESIGN_EN.instock_owner, // internal → owner reads English
};
const EMAIL_DESIGN: Record<Lang, Record<EmailKind, EmailDesign>> = { en: EMAIL_DESIGN_EN, es: EMAIL_DESIGN_ES };
const FONT = "Inter,'Segoe UI',Arial,sans-serif";
/** Token fill that KEEPS surrounding whitespace (fill() trims, which ate the space after a bold run). */
function fillRaw(t: string, tokens: Record<string, string | number | undefined>): string {
  let s = t;
  for (const k of Object.keys(tokens)) s = s.split(`{${k}}`).join(String(tokens[k] ?? ""));
  return s.replace(/\{[a-z]+\}/gi, "");
}
/** Escape + fill, with **{token}** segments rendered bold-white (the comp bolds {store}/{product}). */
function fillHtmlBold(t: string, tk: Record<string, string | number | undefined>): string {
  return t.split(/(\*\*[^*]+\*\*)/).map((seg) => {
    const m = seg.match(/^\*\*([^*]+)\*\*$/);
    if (m) return `<b style="color:#FFFFFF;font-weight:700">${escHtml(fillRaw(m[1], tk))}</b>`;
    return escHtml(fillRaw(seg, tk));
  }).join("");
}
// OUTLOOK-ROBUST DARK (2026-07-15, owner): the reference emails that render clean in Outlook mobile
// (Amazon, BidetMate) all use a SINGLE near-black canvas + BORDERED boxes/buttons + saturated accents.
// Outlook keeps near-black backgrounds black and keeps borders/saturated colors, but it LIGHTENS a
// dark-gray fill (#14141A/#1B1B20) into gray mush — which is why the old floating card looked awful.
// So: no floating card, one flat canvas, and modules are BORDERED (border survives) not dark-filled.
const BOARD = "#000000";       // PURE black — Outlook leaves true black alone (it grays near-blacks)
const HAIR = "#2A2A33";        // box border that survives Outlook's recolor (defines the boxes on black)
function moduleHtml(m: EmailModule | undefined, tk: Record<string, string | number | undefined>): string {
  if (!m) return "";
  const box = (inner: string, pad = "15px 18px", radius = 14) => `<tr><td style="padding-top:20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="mod" style="background:${BOARD};border:1px solid ${HAIR};border-radius:${radius}px"><tr><td style="padding:${pad}">${inner}</td></tr></table></td></tr>`;
  if (m.type === "chip") return box(`<span class="mt" style="font-size:15px;font-weight:700;color:#FFFFFF;font-family:${FONT}">${escHtml(fill(m.text, tk))}</span>`);
  if (m.type === "product") return box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-family:${FONT}"><div class="mt" style="font-size:16px;font-weight:800;color:#FFFFFF">${escHtml(fill(m.title, tk))}</div><div class="ms" style="font-size:12.5px;font-weight:600;color:#8A8A96;margin-top:4px">${escHtml(fill(m.sub, tk))}</div></td>
    <td align="right" valign="middle"><span style="display:inline-block;font-size:9.5px;font-weight:900;letter-spacing:.6px;color:#4ADE80;border:1px solid #235238;border-radius:999px;padding:5px 11px;font-family:${FONT}">${escHtml(m.badge)}</span></td></tr></table>`, "16px 18px", 16);
  const rows = m.steps.map((s, i) => {
    const last = i === m.steps.length - 1;
    return `${i ? `<tr><td colspan="2" style="padding:0 18px"><div style="height:1px;line-height:1px;font-size:0;background:${HAIR}">&nbsp;</div></td></tr>` : ""}<tr>
    <td width="57" valign="middle" style="padding:${i ? "12px" : "16px"} 0 ${last ? "16px" : "12px"} 18px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;border-radius:50%;border:1px solid #235238;color:#4ADE80;font-size:12px;font-weight:800;font-family:${FONT}">${escHtml(s[0])}</td></tr></table></td>
    <td valign="middle" style="padding:${i ? "12px" : "16px"} 18px ${last ? "16px" : "12px"} 0;font-size:15px;font-weight:${last ? 700 : 600};color:#FFFFFF;font-family:${FONT}">${escHtml(s[1])}</td></tr>`;
  }).join("");
  return `<tr><td style="padding-top:22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BOARD};border:1px solid ${HAIR};border-radius:16px">${rows}</table></td></tr>`;
}
/** Email-safe branded HTML matching Design's approved mock (docs/design/emails/): #08090D board,
 *  Check wordmark image, gradient card, Inter-black headline, module card, filled capsule CTA with
 *  the green ring. Table layout + inline styles + MSO conditionals: Outlook (Word engine) gets a
 *  solid-color card fallback and a VML roundrect button, so it renders clean there too. */
export function renderBrandedEmail(event: EmailKind, _subject: string, _body: string, tokens: Record<string, string | number | undefined> = {}, to = "", lang: Lang = "en"): string {
  const d = EMAIL_DESIGN[lang][event];
  // A {url} token deep-links the CTA (owner alert → the call; watch alert → the store). Else the design's default.
  const url = String(tokens.url || d.url);
  // Footer links are LIVE: manage → the site's alerts sheet; unsubscribe → the signed one-click kill.
  const manageUrl = manageAlertsUrl();
  const unsubUrl = to ? unsubscribeUrl(to) : `${siteUrl()}/unsubscribe`;
  // Confirm-email is transactional — you can't unsubscribe from a confirmation, so it shows Manage only.
  const showUnsub = event !== "confirm_email";
  // Paragraphs whose tokens fill to nothing (e.g. no restock day heard) are dropped, not rendered as gaps.
  const bodyHtml = d.body.filter((p) => fill(p.replace(/\*\*/g, ""), tokens)).map((p, i) => i === 0
    ? `<tr><td class="p1" style="padding-top:15px;font-size:17px;line-height:1.5;color:#D1D1DA;font-family:${FONT}">${fillHtmlBold(p, tokens)}</td></tr>`
    : `<tr><td class="p2" style="padding-top:16px;font-size:14px;line-height:1.5;color:#B9B9C4;font-family:${FONT}">${fillHtmlBold(p, tokens)}</td></tr>`).join("");
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
  const manageEs = lang === "es" ? "Administrar alertas" : "Manage alerts";
  const unsubEs = lang === "es" ? "Cancelar suscripción" : "Unsubscribe";
  const footer = showUnsub
    ? `<a href="${manageUrl}" style="color:#8A8A96;text-decoration:none">${manageEs}</a><span style="color:#333340">&nbsp;&middot;&nbsp;</span><a href="${unsubUrl}" style="color:#8A8A96;text-decoration:none">${unsubEs}</a>`
    : `<a href="${manageUrl}" style="color:#8A8A96;text-decoration:none">${manageEs}</a>`;
  // OUTLOOK-ROBUST: ONE flat near-black canvas (no floating card — a two-tone card is what Outlook
  // grayed into mush). Content sits directly on the board with padding; the module + CTA are BORDERED
  // (borders + saturated green survive Outlook's recolor). [data-ogsc]/[data-ogsb] re-assert colors
  // where Outlook web stamps them. Renders clean in Outlook, Gmail, and Apple Mail alike.
  return `<!doctype html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<style>
:root{color-scheme:dark;supported-color-schemes:dark}
[data-ogsc] .board,[data-ogsb] .board{background:${BOARD}!important}
[data-ogsc] .mod,[data-ogsb] .mod{background:${BOARD}!important;border:1px solid ${HAIR}!important}
[data-ogsc] .hl,[data-ogsc] .mt{color:#FFFFFF!important}
[data-ogsc] .kick{color:${d.kickerColor}!important}
[data-ogsc] .p1{color:#D1D1DA!important}[data-ogsc] .p2{color:#B9B9C4!important}
[data-ogsc] .ms{color:#8A8A96!important}
[data-ogsc] .ft,[data-ogsc] .ft a{color:#8A8A96!important}
</style>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head><body style="margin:0;padding:0;background:${BOARD}" bgcolor="${BOARD}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BOARD}" class="board" style="background:${BOARD};margin:0;padding:0"><tr><td align="center" style="padding:30px 20px 34px">
    <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" class="board" bgcolor="${BOARD}" style="max-width:560px;width:100%;background:${BOARD}">
      <tr><td style="padding:0 4px 24px"><img src="https://checkitforme.com/logos/brand/check.png" width="104" height="33" alt="Check" style="display:block;width:104px;height:33px;border:0"></td></tr>
      <tr><td style="padding:0 4px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td class="kick" style="font-size:11px;font-weight:700;letter-spacing:1.6px;color:${d.kickerColor};font-family:${FONT}">${escHtml(d.kicker)}</td></tr>
          <tr><td class="hl" style="padding-top:12px;font-size:34px;font-weight:900;color:#FFFFFF;line-height:1.08;letter-spacing:-1px;font-family:${FONT}">${escHtml(fill(d.headline, tokens))}</td></tr>
          ${bodyHtml}
          ${moduleHtml(d.module, tokens)}
          ${cta}
        </table>
      </td></tr>
      <tr><td class="ft" style="padding:26px 4px 0;font-family:${FONT};font-size:12.5px;color:#8A8A96">${footer}</td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr></table></body></html>`;
}
async function espEmail(to: string, subject: string, body: string, opts: { templateId?: number; params?: Record<string, string | number | undefined>; event?: EmailKind; lang?: Lang } = {}): Promise<{ ok: boolean; detail: string }> {
  const key = config.alerts.brevoApiKey;
  if (!key) return { ok: false, detail: "email_not_configured" }; // BREVO_API_KEY unset → stubbed
  const sender = { name: "Check", email: config.alerts.senderEmail };
  // One-click unsubscribe headers: inbox providers surface their own Unsubscribe button from these.
  const headers = { "List-Unsubscribe": `<${unsubscribeUrl(to)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  // Prefer a branded Brevo template (Design owns the look) when its id is set; else our email-safe template.
  const payload: Record<string, unknown> = opts.templateId
    ? { sender, to: [{ email: to }], templateId: opts.templateId, params: opts.params || {}, headers }
    : { sender, to: [{ email: to }], subject, headers,
        htmlContent: opts.event ? renderBrandedEmail(opts.event, subject, body, opts.params || {}, to, opts.lang || "en")
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
export async function sendAlert(userId: string, event: AlertEvent, tokens: Record<string, string | number | undefined> = {}, opts: { to?: string; tag?: string; channel?: Channel; lang?: Lang } = {}): Promise<{ status: string; detail?: string }> {
  const channel = opts.channel || EVENT_CHANNEL[event];
  const account = await getAccount(userId).catch(() => null);
  const lang = opts.lang || accountLang(account);
  const tpls = await getAlertTemplates(lang);
  const to = opts.to || (channel === "sms" ? account?.phone : account?.email) || "";
  const tagged = (d?: string) => [opts.tag, d].filter(Boolean).join(" ") || undefined;
  if (!to) { await log(userId, event, channel, null, "skipped_nocontact", tagged()); return { status: "skipped_nocontact" }; }
  // No alert email before the address is confirmed (confirm_email itself is the confirmation ask).
  if (channel === "email" && event !== "confirm_email" && !opts.to && !account?.emailVerifiedAt) {
    await log(userId, event, channel, to, "skipped_unverified", tagged());
    return { status: "skipped_unverified" };
  }

  if (channel === "sms") {
    const { left, cap } = await smsAlertsLeft(userId);
    if (cap != null && left != null && left <= 0) { await log(userId, event, channel, to, "skipped_cap", tagged()); return { status: "skipped_cap" }; }
    const body = fill(tpls[event].sms, tokens);
    const res = await twilioSms(to, body);
    const status = res.ok ? "sent" : "stubbed"; await log(userId, event, channel, to, status, tagged(res.detail));
    return { status, detail: res.detail };
  }
  const subject = fill(tpls[event].emailSubject, tokens), body = fill(tpls[event].emailBody, tokens);
  const res = await espEmail(to, subject, body, { templateId: tpls[event].brevoTemplateId, params: strTokens(tokens), event, lang });
  const status = res.ok ? "sent" : "stubbed"; await log(userId, event, channel, to, status, tagged(res.detail));
  return { status, detail: res.detail };
}
/** Coerce token values to strings for Brevo template params. */
function strTokens(t: Record<string, string | number | undefined>): Record<string, string> {
  const o: Record<string, string> = {}; for (const k of Object.keys(t)) o[k] = String(t[k] ?? ""); return o;
}

/** Send an email-only alert to an address with no account (waitlist signups). No metering, always logs. */
export async function sendAnonEmail(event: AlertEvent, tokens: Record<string, string | number | undefined>, to: string, lang: Lang = "en"): Promise<{ status: string; detail?: string }> {
  if (EVENT_CHANNEL[event] !== "email") return { status: "skipped_notemail" };
  if (!to) { await log(null, event, "email", null, "skipped_nocontact"); return { status: "skipped_nocontact" }; }
  const tpls = await getAlertTemplates(lang);
  const subject = fill(tpls[event].emailSubject, tokens), body = fill(tpls[event].emailBody, tokens);
  const res = await espEmail(to, subject, body, { templateId: tpls[event].brevoTemplateId, params: strTokens(tokens), event, lang });
  const status = res.ok ? "sent" : "stubbed"; await log(null, event, "email", to, status, res.detail);
  return { status, detail: res.detail };
}

/** Email one restock-watch contact (the "tell me when it's back" list) — branded template, logged.
 *  Watches are contact-based (no account), so this skips metering. */
export async function sendRestockEmailTo(to: string, tokens: Record<string, string | number | undefined>, opts: { tag?: string } = {}): Promise<{ status: string; detail?: string }> {
  if (!to || !to.includes("@")) { await log(null, "restock", "email", to || null, "skipped_nocontact", opts.tag); return { status: "skipped_nocontact" }; }
  // Only confirmed addresses get alert email: the contact must belong to an account that tapped
  // the confirm link. (Every user has a phone account — an orphan email watch never sends.)
  const owner = (await db.select().from(accounts).where(eq(accounts.email, to.trim().toLowerCase()))).find((a) => a.emailVerifiedAt);
  if (!owner) { await log(null, "restock", "email", to, "skipped_unverified", opts.tag); return { status: "skipped_unverified" }; }
  const lang = accountLang(owner);
  const tpls = await getAlertTemplates(lang);
  const subject = fill(tpls.restock.emailSubject, tokens), body = fill(tpls.restock.emailBody, tokens);
  const res = await espEmail(to, subject, body, { templateId: tpls.restock.brevoTemplateId, params: strTokens(tokens), event: "restock", lang });
  const status = res.ok ? "sent" : "stubbed"; await log(null, "restock", "email", to, status, [opts.tag, res.detail].filter(Boolean).join(" "));
  return { status, detail: res.detail };
}

/** The "confirm this address is yours" ask, sent whenever someone adds/changes their email. The CTA
 *  carries the signed confirm link; no alert email flows to the address until it's tapped. */
export async function sendConfirmEmail(userId: string | null, to: string, lang: Lang = "en"): Promise<{ status: string; detail?: string }> {
  if (!to || !to.includes("@")) { await log(userId, "confirm_email", "email", to || null, "skipped_nocontact"); return { status: "skipped_nocontact" }; }
  const e = to.trim().toLowerCase();
  const tpls = await getAlertTemplates(lang);
  const confirmUrl = `${siteUrl()}/confirm-email?e=${encodeURIComponent(e)}&t=${emailToken(e)}${userId ? `&u=${encodeURIComponent(userId)}` : ""}`;
  const tokens = { email: e, url: confirmUrl };
  const res = await espEmail(e, fill(tpls.confirm_email.emailSubject, tokens), fill(tpls.confirm_email.emailBody, tokens),
    { templateId: tpls.confirm_email.brevoTemplateId, params: tokens, event: "confirm_email", lang });
  const status = res.ok ? "sent" : "stubbed"; await log(userId, "confirm_email", "email", e, status, res.detail);
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
const SAMPLE_TOKENS: Record<string, string> = { store: "Target Glendale", product: "151 Booster Box", city: "Glendale", name: "there", email: "you@example.com", result: "In stock" };
export async function sendTestAlert(event: AlertEvent, to: string, channelOverride?: Channel, lang: Lang = "en"): Promise<{ status: string; detail?: string; channel: Channel }> {
  const channel = channelOverride || EVENT_CHANNEL[event];
  const tpls = await getAlertTemplates(lang);
  if (!to) { await log(null, event, channel, null, "test_nocontact"); return { status: "skipped_nocontact", channel }; }
  const sample = { ...SAMPLE_TOKENS, result: localizeResult(SAMPLE_TOKENS.result, lang) };
  if (channel === "sms") {
    const body = fill(tpls[event].sms, sample);
    const res = await twilioSms(to, body);
    await log(null, event, "sms", to, res.ok ? "test_sent" : "test_stubbed", res.detail);
    return { status: res.ok ? "sent" : "stubbed", detail: res.detail, channel };
  }
  const tk = { ...sample, email: to }; // confirm test shows the real recipient in the chip
  const subject = fill(tpls[event].emailSubject, tk), body = fill(tpls[event].emailBody, tk);
  const res = await espEmail(to, subject, body, { templateId: tpls[event].brevoTemplateId, params: tk, event, lang });
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
  // Store + category names ride along so the alerts sheet can say plainly what each ping watches —
  // stored productLabels can be junk ("cards"); the category's real label is the trustworthy name.
  const subs = await db.select({ s: alertSubscriptions, storeName: retailers.name, categoryLabel: categories.label })
    .from(alertSubscriptions)
    .leftJoin(retailers, eq(alertSubscriptions.retailerId, retailers.id))
    .leftJoin(categories, eq(alertSubscriptions.categoryId, categories.id))
    .where(and(eq(alertSubscriptions.userId, userId), eq(alertSubscriptions.active, 1)));
  const sms = await smsAlertsLeft(userId);
  return {
    smsAlertsLeft: sms.left, smsAlertsCap: sms.cap,
    subscriptions: subs.map(({ s, storeName, categoryLabel }) => ({ id: s.id, kind: s.kind, retailerId: s.retailerId, categoryId: s.categoryId, productLabel: s.productLabel, channel: s.channel, storeName: storeName ?? null, categoryLabel: categoryLabel ?? null })),
  };
}
