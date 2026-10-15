// PINND server: static app + accounts + Claude proxy + voice (Deepgram in, ElevenLabs out) + mail (Brevo) + SMS (Twilio).
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createClient } from "@libsql/client";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const env = process.env;
const PORT = Number(env.PORT || 8787);
const DATA_DIR = env.DATA_DIR || (fs.existsSync("/data") ? "/data" : path.resolve("data"));
fs.mkdirSync(DATA_DIR, { recursive: true });
const PUBLIC = path.resolve("public");
const SESSION_SECRET = new TextEncoder().encode(env.SESSION_SECRET || randomBytes(32).toString("hex"));
const AI_KEY = env.ANTHROPIC_API_KEY || "";
const DG_KEY = env.DEEPGRAM_API_KEY || "";
const EL_KEY = env.ELEVENLABS_API_KEY || "";
const KAI_VOICE = env.KAI_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"; // ElevenLabs premade voice "Sarah"
const BREVO_KEY = env.BREVO_API_KEY || "";
const MAIL_FROM = env.MAIL_FROM || "PINND <no-reply@checkitforme.com>";
const TW_SID = env.TWILIO_ACCOUNT_SID || "", TW_TOKEN = env.TWILIO_AUTH_TOKEN || "", TW_FROM = env.TWILIO_SMS_FROM || "", TW_MSS = env.TWILIO_MESSAGING_SERVICE_SID || "";
const DEV_SHOW_CODE = env.DEV_SHOW_CODE === "1";
const ADMIN_TOKEN = env.ADMIN_TOKEN || "";
const MODELS: Record<string, string> = { quick: env.QUICK_MODEL || "claude-haiku-4-5-20251001", default: env.DEFAULT_MODEL || "claude-sonnet-5", complex: env.COMPLEX_MODEL || "claude-opus-5-5" };
const FALLBACK_MODEL = env.FALLBACK_MODEL || "claude-sonnet-4-5-20250929";

const db = createClient({ url: "file:" + path.join(DATA_DIR, "pinnd.db") });
async function migrate() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, phone TEXT, created_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS codes (email TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT, phone TEXT, expires_at INTEGER, tries INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS docs (user_id TEXT NOT NULL, name TEXT NOT NULL, json TEXT NOT NULL, updated_at INTEGER, PRIMARY KEY (user_id, name))`,
    `CREATE TABLE IF NOT EXISTS trend (item_id TEXT PRIMARY KEY, n INTEGER DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, kind TEXT, detail TEXT, at INTEGER)`,
  ], "write");
}

type User = { id: string; email: string; name: string; phone: string };
const app = new Hono();

async function sessionUser(c: any): Promise<User | null> {
  const tok = getCookie(c, "pinnd_session"); if (!tok) return null;
  try { const { payload } = await jwtVerify(tok, SESSION_SECRET); const r = await db.execute({ sql: "SELECT id,email,name,phone FROM users WHERE id=?", args: [String(payload.sub)] }); const row = r.rows[0]; return row ? { id: String(row.id), email: String(row.email), name: String(row.name || ""), phone: String(row.phone || "") } : null; } catch { return null; }
}
async function getDoc(uid: string, name: string) { const r = await db.execute({ sql: "SELECT json FROM docs WHERE user_id=? AND name=?", args: [uid, name] }); return r.rows[0] ? JSON.parse(String(r.rows[0].json)) : null; }
async function putDoc(uid: string, name: string, data: unknown) { await db.execute({ sql: "INSERT INTO docs (user_id,name,json,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at", args: [uid, name, JSON.stringify(data), Date.now()] }); }
async function logEvent(uid: string | null, kind: string, detail: string) { try { await db.execute({ sql: "INSERT INTO events (user_id,kind,detail,at) VALUES (?,?,?,?)", args: [uid, kind, detail.slice(0, 300), Date.now()] }); } catch { } }

/* ---------- mail + sms ---------- */
async function sendMail(to: string, subject: string, html: string) {
  if (!BREVO_KEY) throw new Error("mail not configured");
  const m = MAIL_FROM.match(/^(.*?)\s*<(.+)>$/); const sender = m ? { name: m[1].trim() || "PINND", email: m[2].trim() } : { name: "PINND", email: MAIL_FROM };
  const r = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": BREVO_KEY, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }) });
  if (!r.ok) throw new Error(`brevo ${r.status} ${(await r.text()).slice(0, 200)}`);
}
async function sendSms(to: string, body: string) {
  if (!TW_SID || !TW_TOKEN || (!TW_FROM && !TW_MSS)) throw new Error("sms not configured");
  const form = new URLSearchParams({ To: to, Body: body }); if (TW_MSS) form.set("MessagingServiceSid", TW_MSS); else form.set("From", TW_FROM);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TW_SID}/Messages.json`, { method: "POST", headers: { authorization: "Basic " + Buffer.from(`${TW_SID}:${TW_TOKEN}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" }, body: form });
  if (!r.ok) throw new Error(`twilio ${r.status} ${(await r.text()).slice(0, 200)}`);
}
const normPhone = (p: string) => { const d = (p || "").replace(/[^\d+]/g, ""); if (!d) return ""; if (d.startsWith("+")) return d; if (d.length === 10) return "+1" + d; if (d.length === 11 && d.startsWith("1")) return "+" + d; return ""; };
const mailShell = (title: string, body: string) => `<div style="font-family:Georgia,serif;background:#F3EBDF;padding:32px"><div style="max-width:480px;margin:0 auto;background:#FBF7F1;padding:28px;border-radius:6px"><p style="font-size:28px;margin:0 0 18px;color:#2B1D16">pinnd</p><h1 style="font-size:24px;font-weight:500;color:#241913;margin:0 0 12px">${title}</h1><div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#6B5A4E">${body}</div><p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.14em;color:#B58C6B;margin-top:24px">SEE IT. FIND IT. STYLE IT. SHOP IT.</p></div></div>`;

/* ---------- health ---------- */
app.get("/api/health", c => c.json({ pinnd: true, ai: !!AI_KEY, voice: !!(DG_KEY && EL_KEY), stt: !!DG_KEY, tts: !!EL_KEY, mail: !!BREVO_KEY, sms: !!(TW_SID && TW_TOKEN && (TW_FROM || TW_MSS)), build: env.RAILWAY_GIT_COMMIT_SHA ? String(env.RAILWAY_GIT_COMMIT_SHA).slice(0, 8) : "local" }));

/* ---------- auth: email (and text) code ---------- */
app.post("/api/auth/start", async c => {
  const b = await c.req.json().catch(() => ({})); const email = String(b.email || "").trim().toLowerCase(); const name = String(b.name || "").trim().slice(0, 60); const phone = normPhone(String(b.phone || ""));
  if (!/.+@.+\..+/.test(email)) return c.json({ ok: false, error: "That email does not look right." }, 400);
  if (!BREVO_KEY && !DEV_SHOW_CODE && !(TW_SID && phone)) return c.json({ ok: false, error: "Email sending is not connected on this server yet." }, 503);
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  await db.execute({ sql: "INSERT INTO codes (email,code,name,phone,expires_at,tries) VALUES (?,?,?,?,?,0) ON CONFLICT(email) DO UPDATE SET code=excluded.code, name=excluded.name, phone=excluded.phone, expires_at=excluded.expires_at, tries=0", args: [email, code, name, phone, Date.now() + 10 * 60 * 1000] });
  let mailed = false, smsTo = "";
  if (BREVO_KEY) { try { await sendMail(email, `${code} is your PINND code`, mailShell("Your sign in code", `<p style="font-size:34px;letter-spacing:.3em;color:#2B1D16;font-family:Georgia,serif">${code}</p><p>It expires in 10 minutes. If you did not ask for it, ignore this email.</p>`)); mailed = true; } catch (e) { console.warn("mail", e); } }
  if (phone && TW_SID) { try { await sendSms(phone, `PINND code: ${code}. It expires in 10 minutes.`); smsTo = phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2 $3"); } catch (e) { console.warn("sms", e); } }
  if (!mailed && !smsTo && !DEV_SHOW_CODE) return c.json({ ok: false, error: "The code could not be sent. Try again in a minute." }, 502);
  await logEvent(null, "auth_start", email);
  return c.json({ ok: true, smsTo, ...(DEV_SHOW_CODE ? { devCode: code } : {}) });
});
app.post("/api/auth/verify", async c => {
  const b = await c.req.json().catch(() => ({})); const email = String(b.email || "").trim().toLowerCase(); const code = String(b.code || "").trim();
  const r = await db.execute({ sql: "SELECT code,name,phone,expires_at,tries FROM codes WHERE email=?", args: [email] }); const row = r.rows[0];
  if (!row) return c.json({ ok: false, error: "Ask for a new code." }, 400);
  if (Number(row.tries) >= 6) return c.json({ ok: false, error: "Too many tries. Ask for a new code." }, 429);
  if (Number(row.expires_at) < Date.now()) return c.json({ ok: false, error: "That code expired. Ask for a new one." }, 400);
  if (String(row.code) !== code) { await db.execute({ sql: "UPDATE codes SET tries=tries+1 WHERE email=?", args: [email] }); return c.json({ ok: false, error: "That code did not match." }, 400); }
  const u = await db.execute({ sql: "SELECT id,email,name,phone FROM users WHERE email=?", args: [email] });
  let user: User;
  if (!u.rows[0]) { const id = "u" + randomBytes(8).toString("hex"); user = { id, email, name: String(row.name || ""), phone: String(row.phone || "") }; await db.execute({ sql: "INSERT INTO users (id,email,name,phone,created_at) VALUES (?,?,?,?,?)", args: [id, email, user.name, user.phone, Date.now()] }); }
  else { const x = u.rows[0]; user = { id: String(x.id), email, name: String(row.name || x.name || ""), phone: String(row.phone || x.phone || "") }; await db.execute({ sql: "UPDATE users SET name=?, phone=? WHERE id=?", args: [user.name, user.phone, user.id] }); }
  await db.execute({ sql: "DELETE FROM codes WHERE email=?", args: [email] });
  const tok = await new SignJWT({ sub: user.id }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("90d").sign(SESSION_SECRET);
  setCookie(c, "pinnd_session", tok, { httpOnly: true, secure: c.req.url.startsWith("https"), sameSite: "Lax", path: "/", maxAge: 90 * 24 * 3600 });
  const [profile, state] = await Promise.all([getDoc(user.id, "profile"), getDoc(user.id, "state")]);
  await logEvent(user.id, "signin", email);
  return c.json({ ok: true, user, profile, state });
});
app.post("/api/logout", c => { deleteCookie(c, "pinnd_session", { path: "/" }); return c.json({ ok: true }); });
app.get("/api/me", async c => { const u = await sessionUser(c); if (!u) return c.json({ user: null }); const [profile, state] = await Promise.all([getDoc(u.id, "profile"), getDoc(u.id, "state")]); return c.json({ user: u, profile, state }); });
app.put("/api/profile", async c => { const u = await sessionUser(c); if (!u) return c.json({ error: "sign in" }, 401); const body = await c.req.json().catch(() => null); if (!body || typeof body !== "object") return c.json({ error: "bad body" }, 400); await putDoc(u.id, "profile", body); return c.json({ ok: true }); });
app.put("/api/state", async c => { const u = await sessionUser(c); if (!u) return c.json({ error: "sign in" }, 401); const body = await c.req.json().catch(() => null); if (!body || typeof body !== "object") return c.json({ error: "bad body" }, 400); if (JSON.stringify(body).length > 400000) return c.json({ error: "too big" }, 413); await putDoc(u.id, "state", body); return c.json({ ok: true }); });
app.get("/api/trend", async c => { const r = await db.execute("SELECT item_id,n FROM trend ORDER BY n DESC LIMIT 300"); const o: Record<string, number> = {}; r.rows.forEach(x => { o[String(x.item_id)] = Number(x.n); }); return c.json({ c: o }); });
app.post("/api/trend", async c => { const u = await sessionUser(c); if (!u) return c.json({ error: "sign in" }, 401); const b = await c.req.json().catch(() => ({})); const id = String(b.id || "").slice(0, 80); if (!id) return c.json({ error: "id" }, 400); await db.execute({ sql: "INSERT INTO trend (item_id,n) VALUES (?,1) ON CONFLICT(item_id) DO UPDATE SET n=n+1", args: [id] }); return c.json({ ok: true }); });
app.get("/api/admin/last-code", async c => { if (!ADMIN_TOKEN || c.req.header("x-admin-token") !== ADMIN_TOKEN) return c.json({ error: "no" }, 403); const email = String(c.req.query("email") || "").toLowerCase(); const r = await db.execute({ sql: "SELECT code,expires_at FROM codes WHERE email=?", args: [email] }); return c.json(r.rows[0] ? { code: r.rows[0].code, expires_at: r.rows[0].expires_at } : { code: null }); });
app.get("/api/admin/events", async c => { if (!ADMIN_TOKEN || c.req.header("x-admin-token") !== ADMIN_TOKEN) return c.json({ error: "no" }, 403); const r = await db.execute("SELECT user_id,kind,detail,at FROM events ORDER BY id DESC LIMIT 100"); return c.json({ events: r.rows }); });

/* ---------- shared collections: creator applications, creators, posts, earnings ---------- */
const INQUIRY_TO = env.INQUIRY_TO || "";
const fromEmail = () => { const m = MAIL_FROM.match(/<(.+)>$/); return (m ? m[1] : MAIL_FROM).trim(); };
const escHtml = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] as string));
const SHARED = new Set(["applications", "creators", "posts", "earnings", "inquiries"]);
const isAdminReq = (c: any) => !!ADMIN_TOKEN && c.req.header("x-admin-token") === ADMIN_TOKEN;
async function sharedGet(col: string, id: string) { const r = await db.execute({ sql: "SELECT json FROM docs WHERE user_id=? AND name=?", args: ["shared:" + col, id] }); return r.rows[0] ? JSON.parse(String(r.rows[0].json)) : null; }
app.get("/api/admin/check", c => isAdminReq(c) ? c.json({ ok: true }) : c.json({ error: "no" }, 403));
app.get("/api/shared/:col", async c => { const col = c.req.param("col"); if (!SHARED.has(col)) return c.json({ error: "no such collection" }, 404); const u = await sessionUser(c); if (!u && !isAdminReq(c)) return c.json({ error: "sign in" }, 401); if (col === "inquiries" && !isAdminReq(c)) return c.json({ docs: [] }); if ((col === "applications" || col === "earnings") && !isAdminReq(c)) { const mine = u ? await sharedGet(col, u.id) : null; return c.json({ docs: mine ? [mine] : [] }); } const r = await db.execute({ sql: "SELECT name,json FROM docs WHERE user_id=? ORDER BY updated_at DESC LIMIT 300", args: ["shared:" + col] }); return c.json({ docs: r.rows.map(x => Object.assign({ id: String(x.name) }, JSON.parse(String(x.json)))) }); });
app.get("/api/shared/:col/:id", async c => { const col = c.req.param("col"), id = c.req.param("id"); if (!SHARED.has(col)) return c.json({ error: "no such collection" }, 404); const u = await sessionUser(c); if (!u && !isAdminReq(c)) return c.json({ error: "sign in" }, 401); if ((col === "applications" || col === "earnings") && !isAdminReq(c) && (!u || u.id !== id)) return c.json({ doc: null }); if (col === "inquiries" && !isAdminReq(c) && (!u || !id.startsWith(u.id + "-"))) return c.json({ doc: null }); return c.json({ doc: await sharedGet(col, id) }); });
app.put("/api/shared/:col/:id", async c => {
  const col = c.req.param("col"), id = c.req.param("id"); if (!SHARED.has(col)) return c.json({ error: "no such collection" }, 404);
  const u = await sessionUser(c); const admin = isAdminReq(c); if (!u && !admin) return c.json({ error: "sign in" }, 401);
  const body = await c.req.json().catch(() => null); if (!body || typeof body !== "object") return c.json({ error: "bad body" }, 400); if (JSON.stringify(body).length > 900000) return c.json({ error: "too big" }, 413);
  if (col === "applications" && !admin && (!u || u.id !== id)) return c.json({ error: "not yours" }, 403);
  if (col === "applications" && !admin) { body.status = "pending"; body.id = u!.id; }
  if (col === "creators" && !admin) return c.json({ error: "admin only" }, 403);
  if (col === "inquiries" && !admin) { if (!u || !id.startsWith(u.id + "-")) return c.json({ error: "not yours" }, 403); body.user = u!.id; body.status = "new"; }
  if (col === "posts" && !admin) { const cr = u ? await sharedGet("creators", u.id) : null; if (!cr) return c.json({ error: "not an approved creator" }, 403); body.creator = u!.id; }
  await db.execute({ sql: "INSERT INTO docs (user_id,name,json,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at", args: ["shared:" + col, id, JSON.stringify(body), Date.now()] });
  await logEvent(u ? u.id : "admin", "shared_" + col, id); if (col === "inquiries" && !admin) { const to = INQUIRY_TO || fromEmail(); if (to) { try { await sendMail(to, `PINND stylist inquiry from ${String(body.name || "").slice(0, 60)}`, `<p>${escHtml(body.name)} (${escHtml(body.email)}${body.phone ? ", " + escHtml(body.phone) : ""}) wrote:</p><p>${escHtml(body.what)}</p><p>Reach them: ${escHtml(body.when || "")}</p>`); } catch { } } } return c.json({ ok: true });
});

/* ---------- Claude proxy: the page builds the prompt, the server holds the key ---------- */
function parseJSONish(t: string): unknown {
  const fence = (t.match(/```(?:json)?\s*([\s\S]*?)```/) || [])[1];
  const starts = [t.indexOf("{"), t.indexOf("[")].filter(i => i >= 0); const inner = starts.length ? t.slice(Math.min(...starts), Math.max(t.lastIndexOf("}"), t.lastIndexOf("]")) + 1) : "";
  for (const s of [t, fence, inner]) { if (!s) continue; try { return JSON.parse(s); } catch { } }
  throw new Error("no json");
}
async function claude(messages: unknown[], model: string, maxTokens = 2500): Promise<string> {
  const call = (m: string) => fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": AI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: m, max_tokens: maxTokens, messages }) });
  let r = await call(model);
  if (r.status === 404 || r.status === 400) { const t = await r.text(); if (/model/i.test(t) && model !== FALLBACK_MODEL) r = await call(FALLBACK_MODEL); else throw new Error(`anthropic ${r.status} ${t.slice(0, 200)}`); }
  if (!r.ok) throw new Error(`anthropic ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j: any = await r.json(); return (j.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n");
}
app.post("/api/ai", async c => {
  const u = await sessionUser(c); if (!u) return c.json({ error: "sign in", code: "not_granted" }, 401);
  if (!AI_KEY) return c.json({ error: "Claude is not connected on this server", code: "not_available" }, 503);
  const fd = await c.req.formData(); const promptRaw = String(fd.get("prompt") || ""); const tier = String(fd.get("tier") || "default");
  const images: { data: string; media_type: string }[] = [];
  for (const [k, v] of fd.entries()) { if (k.startsWith("image") && v instanceof File) { const buf = Buffer.from(await v.arrayBuffer()); if (buf.length > 6_000_000) return c.json({ error: "image too large", code: "image_rejected" }, 400); images.push({ data: buf.toString("base64"), media_type: v.type || "image/jpeg" }); } }
  let messages: any[];
  if (promptRaw.trim().startsWith("[")) { try { const turns = JSON.parse(promptRaw) as { role: string; content: string }[]; messages = turns.map(t => ({ role: t.role === "assistant" ? "assistant" : "user", content: String(t.content || "") })); } catch { messages = [{ role: "user", content: promptRaw }]; } }
  else messages = [{ role: "user", content: promptRaw }];
  // Anthropic wants alternating roles: merge neighbours with the same role
  messages = messages.reduce((acc: any[], m) => { const last = acc[acc.length - 1]; if (last && last.role === m.role) last.content += "\n\n" + m.content; else acc.push({ ...m }); return acc; }, []);
  if (messages[0].role !== "user") messages.unshift({ role: "user", content: "(context)" });
  const last = messages[messages.length - 1]; const note = "\n\nReply with only the JSON asked for, no prose before or after it.";
  if (images.length) last.content = [...images.map(im => ({ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } })), { type: "text", text: String(last.content) + note }];
  else last.content = String(last.content) + note;
  try { const text = await claude(messages, MODELS[tier] || MODELS.default, 2500); let value: unknown; try { value = parseJSONish(text); } catch { return c.json({ error: "garbled answer", code: "invalid_json", text }, 502); } await logEvent(u.id, "ai", tier + (images.length ? " +" + images.length + " img" : "")); return c.json({ value }); }
  catch (e: any) { console.warn("ai", e); await logEvent(u.id, "ai_error", String(e.message || e)); return c.json({ error: String(e.message || e), code: "upstream_error" }, 502); }
});

/* ---------- voice ---------- */
app.post("/api/voice/stt", async c => {
  const u = await sessionUser(c); if (!u) return c.json({ error: "sign in" }, 401); if (!DG_KEY) return c.json({ error: "Deepgram not connected" }, 503);
  const fd = await c.req.formData(); const f = fd.get("audio"); if (!(f instanceof File)) return c.json({ error: "no audio" }, 400);
  const buf = Buffer.from(await f.arrayBuffer());
  const r = await fetch("https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=en", { method: "POST", headers: { authorization: "Token " + DG_KEY, "content-type": f.type || "audio/webm" }, body: buf });
  if (!r.ok) { const t = await r.text(); console.warn("deepgram", r.status, t.slice(0, 200)); return c.json({ error: "transcription failed" }, 502); }
  const j: any = await r.json(); const text = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  await logEvent(u.id, "stt", text.slice(0, 80)); return c.json({ text });
});
app.post("/api/voice/tts", async c => {
  const u = await sessionUser(c); if (!u) return c.json({ error: "sign in" }, 401); if (!EL_KEY) return c.json({ error: "ElevenLabs not connected" }, 503);
  const b = await c.req.json().catch(() => ({})); const text = String(b.text || "").slice(0, 600); if (!text) return c.json({ error: "no text" }, 400);
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${KAI_VOICE}/stream?output_format=mp3_44100_64`, { method: "POST", headers: { "xi-api-key": EL_KEY, "content-type": "application/json", accept: "audio/mpeg" }, body: JSON.stringify({ text, model_id: env.KAI_TTS_MODEL || "eleven_flash_v2_5", voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35 } }) });
  if (!r.ok || !r.body) { console.warn("elevenlabs", r.status, (await r.text()).slice(0, 200)); return c.json({ error: "voice failed" }, 502); }
  await logEvent(u.id, "tts", text.slice(0, 60));
  return new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
});

/* ---------- restock email ---------- */
app.post("/api/restock/fire", async c => {
  const u = await sessionUser(c); if (!u) return c.json({ error: "sign in" }, 401); const b = await c.req.json().catch(() => ({})); const id = String(b.id || ""); const size = String(b.size || "");
  let name = id; try { const cat = JSON.parse(fs.readFileSync(path.join(PUBLIC, "catalog.json"), "utf8")); const it = cat.find((x: any) => x.id === id); if (it) name = `${it.n} by ${it.b}`; } catch { }
  let mailed = false; if (BREVO_KEY && u.email) { try { await sendMail(u.email, `It's back: ${name} in ${size}`, mailShell("It's back.", `<p>${name} in size ${size} is available again. We put it in your PINND bag so it is there when you check out.</p><p><a href="${new URL(c.req.url).origin}" style="color:#2B1D16">Open PINND</a></p>`)); mailed = true; } catch (e) { console.warn("restock mail", e); } }
  await logEvent(u.id, "restock_fire", `${id} ${size} mailed=${mailed}`); return c.json({ ok: true, mailed });
});

/* ---------- the app ---------- */
const SHELL_HEAD = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icon-192.png"><link rel="icon" href="/icon-192.png"><style>:root{color-scheme:light}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>`;
let indexCache = ""; let indexMtime = 0;
function indexHTML() { const p = path.join(PUBLIC, "index.html"); const st = fs.statSync(p); if (st.mtimeMs !== indexMtime) { indexCache = SHELL_HEAD + fs.readFileSync(p, "utf8") + "</body></html>"; indexMtime = st.mtimeMs; } return indexCache; }
app.get("/", c => c.html(indexHTML()));
app.get("/index.html", c => c.html(indexHTML()));
app.use("/img/*", serveStatic({ root: "./public", onFound: (_p, c) => c.header("cache-control", "public, max-age=604800, immutable") }));
app.use("/*", serveStatic({ root: "./public" }));

migrate().then(() => { serve({ fetch: app.fetch, port: PORT }, () => console.log(`pinnd on :${PORT} data=${DATA_DIR} ai=${!!AI_KEY} stt=${!!DG_KEY} tts=${!!EL_KEY} mail=${!!BREVO_KEY} sms=${!!(TW_SID && (TW_FROM || TW_MSS))}`)); });
