// ── Ops watch: owner alerts + cross-env watchdog + nightly off-box DB backups ──────────────────
// Three jobs, all self-contained so a bug here can never take the service down:
//   1. opsAlert() — email (Brevo) + SMS (Twilio) straight to the owner, throttled per alert key so a
//      crash loop can't burn SMS credit (30 min between repeats of the same alert).
//   2. watchdogTick() — each env pings the OTHER env's /api/health every minute. Prod down (3 misses)
//      → staging alerts the owner by SMS + email. Staging down → prod alerts by email only. Recovery
//      sends an all-clear. An env can't report its own death — that's why they watch each other.
//   3. backupTick() — hourly check; once per UTC day it VACUUMs the SQLite DB into a temp file,
//      gzips, AES-256-GCM-encrypts (BACKUP_ENC_KEY — the R2 bucket is publicly served for logos, so
//      plaintext DB bytes must NEVER land there), and PUTs to R2. Keys rotate by day-of-week
//      (…-mon.db.gz.enc … 7 rolling dailies) plus one per month (…-YYYY-MM) — no delete plumbing
//      needed. Restore/verify: scripts/restore-backup.mjs.
import { createCipheriv, randomBytes } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { config } from "./config";
import { client } from "./db/client";
import { getSetting, setSetting } from "./db/settings";
import { r2Config, presignPut } from "./r2";

const ENV_NAME = config.staging.on ? "staging" : "production";
const OTHER_URL = config.staging.on ? "https://checkitforme.com" : "https://staging.checkitforme.com";
const OTHER_NAME = config.staging.on ? "production" : "staging";

// ---- 1. owner alert (throttled; never throws) ----
const lastSent: Record<string, number> = {};
const THROTTLE_MS = 30 * 60_000;

async function brevoOwner(subject: string, body: string): Promise<boolean> {
  const key = config.alerts.brevoApiKey, to = config.alerts.ownerEmail;
  if (!key || !to) return false;
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST", headers: { "api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ sender: { name: "Check Ops", email: config.alerts.senderEmail }, to: [{ email: to }], subject,
        textContent: body, htmlContent: `<pre style="font-family:monospace;font-size:14px">${body.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string))}</pre>` }),
    });
    return r.ok;
  } catch { return false; }
}

async function smsOwner(body: string): Promise<boolean> {
  const { twilioSid: sid, twilioToken: tok, fromNumber: from, ownerPhone: to } = config.alerts;
  if (!sid || !tok || !from || !to) return false;
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
    return r.ok;
  } catch { return false; }
}

/** Alert the owner. key throttles repeats; sms:true adds a text (default email only). */
export async function opsAlert(key: string, subject: string, body: string, opts: { sms?: boolean } = {}): Promise<void> {
  const now = Date.now();
  if (lastSent[key] && now - lastSent[key] < THROTTLE_MS) return;
  lastSent[key] = now;
  console.error(`[OPS-ALERT] ${subject} — ${body}`);
  const emailed = await brevoOwner(`[Check ${ENV_NAME}] ${subject}`, body);
  const texted = opts.sms ? await smsOwner(`Check ${ENV_NAME}: ${subject}. ${body}`.slice(0, 320)) : false;
  console.error(`[OPS-ALERT] delivery email=${emailed} sms=${texted}`);
}

// ---- 2. cross-env watchdog ----
let misses = 0, down = false;
export async function watchdogTick(): Promise<void> {
  let ok = false;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10_000);
    const r = await fetch(`${OTHER_URL}/api/health`, { signal: ctl.signal });
    clearTimeout(t);
    ok = r.ok;
  } catch { ok = false; }
  if (ok) {
    if (down) await opsAlert(`recover-${OTHER_NAME}`, `${OTHER_NAME} is back up`, `${OTHER_URL}/api/health answers again.`, { sms: OTHER_NAME === "production" });
    misses = 0; down = false;
    return;
  }
  misses++;
  if (misses >= 3 && !down) {
    down = true;
    await opsAlert(`down-${OTHER_NAME}`, `${OTHER_NAME} looks DOWN`, `${OTHER_URL}/api/health failed ${misses} checks in a row (watched from ${ENV_NAME}).`,
      { sms: OTHER_NAME === "production" }); // prod down = wake the owner; staging down = email is enough
  }
}
export const watchdogState = () => ({ watching: OTHER_URL, misses, down });

// ---- 3. nightly encrypted DB backup → R2 ----
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
let lastResult: { at: number; ok: boolean; key?: string; bytes?: number; error?: string } | null = null;
export const backupState = () => lastResult;

export async function backupNow(): Promise<{ ok: boolean; key?: string; bytes?: number; error?: string }> {
  const encKey = process.env.BACKUP_ENC_KEY || "";
  const cfg = r2Config();
  const dbPath = (process.env.DATABASE_URL || "").replace(/^file:/, "");
  try {
    if (!/^[0-9a-f]{64}$/i.test(encKey)) throw new Error("BACKUP_ENC_KEY missing/not 64-hex");
    if (!cfg) throw new Error("R2 not configured");
    if (!dbPath || !existsSync(dbPath)) throw new Error(`DB file not found: ${dbPath}`);
    const tmp = `${dbPath}.backup-tmp`;
    if (existsSync(tmp)) unlinkSync(tmp);
    await client.execute(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); // consistent snapshot, WAL-safe
    const plain = readFileSync(tmp); unlinkSync(tmp);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(encKey, "hex"), iv);
    const zipped = gzipSync(plain);
    const body = Buffer.concat([iv, cipher.update(zipped), cipher.final(), cipher.getAuthTag()]); // iv | data | tag(16)
    const d = new Date();
    const keys = [`backups/${ENV_NAME}/db-${DOW[d.getUTCDay()]}.db.gz.enc`];
    if (d.getUTCDate() <= 1 || !(await getSetting(`ops_backup_month_${ENV_NAME}`))?.startsWith(d.toISOString().slice(0, 7)))
      keys.push(`backups/${ENV_NAME}/db-${d.toISOString().slice(0, 7)}.db.gz.enc`);
    for (const key of keys) {
      const { uploadUrl } = await presignPut(key, cfg, "application/octet-stream");
      const r = await fetch(uploadUrl, { method: "PUT", body });
      if (!r.ok) throw new Error(`R2 PUT ${r.status} for ${key}`);
    }
    if (keys.length > 1) await setSetting(`ops_backup_month_${ENV_NAME}`, d.toISOString().slice(0, 7));
    lastResult = { at: Date.now(), ok: true, key: keys[0], bytes: body.length };
    console.log(`[ops-backup] ok → ${keys.join(", ")} (${body.length} bytes)`);
    return lastResult;
  } catch (e) {
    lastResult = { at: Date.now(), ok: false, error: String(e).slice(0, 200) };
    await opsAlert("backup-failed", "DB backup FAILED", lastResult.error || "unknown");
    return lastResult;
  }
}

/** Hourly tick: run once per UTC day (any hour ≥ 09:00 UTC so it lands in the owner's night). */
export async function backupTick(): Promise<void> {
  if (!process.env.BACKUP_ENC_KEY) return; // not armed yet (owner sets the key) — silent, not a failure
  const today = new Date().toISOString().slice(0, 10);
  if (new Date().getUTCHours() < 9) return;
  if ((await getSetting(`ops_backup_day_${ENV_NAME}`)) === today) return;
  const res = await backupNow();
  if (res.ok) await setSetting(`ops_backup_day_${ENV_NAME}`, today);
}
