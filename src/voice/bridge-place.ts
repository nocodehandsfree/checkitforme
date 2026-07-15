// Place a bridged Twilio call (our number -> destination) running the restock agent.
// Moved out of server.ts so the non-HTTP callers (scheduled checks, zone fires — src/calls/service.ts,
// src/customer-schedules.ts) can ride the cheap connect-on-human bridge without importing the server.
// The TwiML + status routes it points at stay in server.ts.
import { config } from "../config";
import { getPolicy } from "../policy";
import { setBridgeContext } from "./bridge";

// Twilio's media stream is pinned to the direct Railway domains (verified WS path; avoids Cloudflare).
export const RAILWAY_HOST = "voice-caller-production-2d6b.up.railway.app";
export const STAGING_HOST = "voice-caller-staging-production.up.railway.app"; // wsHost for simulated staging calls

export const roomCallSids = new Map<string, string>(); // room -> Twilio callSid (for hang-up)
// REAL Twilio call progress per room: { status: queued|initiated|ringing|in-progress|completed|… , at }.
// Fed by /twiml/bridge-status (Twilio's StatusCallback), read by /pub/bridge/:room so the live UI is truthful.
export const roomCallProgress = new Map<string, { status: string; at: number }>();
// Terminal-status hooks per room: headless bridge calls (schedules/zones) register one so a call that
// ends without ever reaching a human still finalizes its callResults row. Fired by /twiml/bridge-status.
export const roomFinalizers = new Map<string, (twilioStatus: string) => void>();

export async function placeBridgeCall(toNumber: string, dynamicVars: Record<string, string>, onConversationId?: (id: string) => void, dtmf?: string | null, opts?: { from?: string; timeLimitSec?: number; connectOnHuman?: boolean; connectAtSec?: number; say?: string | null; voiceId?: string | null; voiceTuning?: Record<string, unknown> | null }): Promise<{ room?: string; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) return { error: "twilio not configured" };
  const e164 = (p: string) => { p = p.replace(/[^\d+]/g, ""); if (p.startsWith("+")) return p; if (p.length === 10) return "+1" + p; if (p.length === 11 && p.startsWith("1")) return "+" + p; return "+" + p; };
  const room = crypto.randomUUID();
  // Dial AS the customer's verified number when we have it (phone-first model); else the house line.
  const from = opts?.from || process.env.BRIDGE_FROM_NUMBER || "+13106662331";
  const pol = await getPolicy();
  setBridgeContext(room, { agentId: config.voice.agentId, dynamicVars, onConversationId, dtmf: dtmf || undefined, say: opts?.say || undefined, connectOnHuman: opts?.connectOnHuman ?? true /* baked in: always open the paid agent only once a human answers */, connectAtSec: opts?.connectAtSec, holdMaxSeconds: pol.bail.holdMaxSeconds, voiceId: opts?.voiceId || undefined, voiceTuning: opts?.voiceTuning || undefined });
  const host = config.staging.on ? STAGING_HOST : RAILWAY_HOST;
  const body = new URLSearchParams({ To: e164(toNumber), From: from, Url: `https://${host}/twiml/bridge?room=${room}` });
  // REAL call-progress feed: Twilio POSTs each transition so the live timeline shows what's actually
  // happening (dialing → ringing → answered → done) instead of guessing from timers.
  body.set("StatusCallback", `https://${host}/twiml/bridge-status?room=${room}`);
  body.set("StatusCallbackMethod", "POST");
  for (const ev of ["initiated", "ringing", "answered", "completed"]) body.append("StatusCallbackEvent", ev);
  // Hard cost cap: Twilio kills the call at TimeLimit seconds, no exceptions — the profit guarantee.
  if (opts?.timeLimitSec && opts.timeLimitSec > 0) body.set("TimeLimit", String(Math.floor(opts.timeLimitSec)));
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) return { error: `twilio call failed: ${r.status} ${await r.text()}` };
  const d = (await r.json()) as { sid?: string };
  if (d.sid) { roomCallSids.set(room, d.sid); setTimeout(() => roomCallSids.delete(room), 10 * 60 * 1000); }
  return { room };
}
