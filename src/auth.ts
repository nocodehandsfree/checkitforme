// Phone-first auth — our own login, replacing Clerk's session role (Stripe still owns billing).
// Identity = a Twilio-verified US cell. We mint our own signed session token; the account lives in
// our DB, keyed by the phone. Built ALONGSIDE Clerk (the token verifier accepts either) so we can
// cut over and remove Clerk once this is proven.
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";

const enc = new TextEncoder();
const secret = () => enc.encode(process.env.SESSION_SECRET || "dev-insecure-secret-change-me");

/** Normalize a user-entered phone to E.164 (US default). */
export function e164(p: string): string {
  const t = (p || "").trim();
  if (t.startsWith("+")) return "+" + t.slice(1).replace(/\D/g, "");
  const d = t.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return "+" + d;
}

// ---- Session (our own JWT) ----
export async function signSession(accountId: string, phone: string): Promise<string> {
  return new SignJWT({ phone })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(accountId)
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secret());
}
export async function verifySession(token: string): Promise<{ id: string; phone?: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return { id: String(payload.sub), phone: typeof payload.phone === "string" ? payload.phone : undefined };
  } catch { return null; }
}

// ---- Twilio Verify (SMS code) — proves ownership of the cell ----
const twSid = () => process.env.TWILIO_ACCOUNT_SID;
const twTok = () => process.env.TWILIO_AUTH_TOKEN;
const twVerify = () => process.env.TWILIO_VERIFY_SERVICE_SID;
const basic = () => "Basic " + Buffer.from(`${twSid()}:${twTok()}`).toString("base64");

/** Send an SMS verification code to the number (browser can auto-fill it via WebOTP). */
export async function startPhoneVerify(phone: string): Promise<{ ok: boolean; error?: string }> {
  if (!config.callsEnabled) return { ok: false, error: "calls_disabled_preview" }; // no real SMS on a UI-only preview
  const vsid = twVerify();
  if (!vsid || !twSid()) return { ok: false, error: "verify_not_configured" };
  const r = await fetch(`https://verify.twilio.com/v2/Services/${vsid}/Verifications`, {
    method: "POST", headers: { Authorization: basic(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: phone, Channel: "sms" }).toString(),
  });
  if (!r.ok) return { ok: false, error: `twilio_${r.status}` };
  return { ok: true };
}
/** Confirm the SMS code. true = the number is verified. */
export async function checkPhoneVerify(phone: string, code: string): Promise<boolean> {
  const vsid = twVerify();
  if (!vsid) return false;
  const r = await fetch(`https://verify.twilio.com/v2/Services/${vsid}/VerificationCheck`, {
    method: "POST", headers: { Authorization: basic(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: phone, Code: code }).toString(),
  });
  if (!r.ok) return false;
  const d = (await r.json()) as { status?: string };
  return d.status === "approved";
}

// ---- Caller ID (the verification CALL) — registers the cell so calls can dial AS it ----
/** Kick off Twilio's caller-ID verification call; returns the code to show the user (they key it
 *  in when Twilio calls them). This is the ONLY way to use an unowned number as caller ID. */
export async function startCallerIdVerify(phone: string): Promise<{ ok: boolean; validationCode?: string; error?: string }> {
  if (!config.callsEnabled) return { ok: false, error: "calls_disabled_preview" }; // no real verification call on a UI-only preview
  const sid = twSid();
  if (!sid) return { ok: false, error: "twilio_not_configured" };
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/OutgoingCallerIds.json`, {
    method: "POST", headers: { Authorization: basic(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ PhoneNumber: phone }).toString(),
  });
  if (!r.ok) return { ok: false, error: `twilio_${r.status}` };
  const d = (await r.json()) as { validation_code?: string };
  return { ok: true, validationCode: d.validation_code };
}
/** Has the number finished caller-ID verification (i.e. is it usable as a From)? */
export async function isCallerIdVerified(phone: string): Promise<boolean> {
  const sid = twSid();
  if (!sid) return false;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/OutgoingCallerIds.json?PhoneNumber=${encodeURIComponent(phone)}`, {
    headers: { Authorization: basic() },
  });
  if (!r.ok) return false;
  const d = (await r.json()) as { outgoing_caller_ids?: unknown[] };
  return (d.outgoing_caller_ids?.length ?? 0) > 0;
}
