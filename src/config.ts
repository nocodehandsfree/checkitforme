// Runtime config from environment. Locally, export these or put them in a
// gitignored .dev.vars and `set -a; . ./.dev.vars; set +a`. In production they
// come from Railway / Cloudflare.
export const config = {
  port: Number(process.env.PORT ?? 8787),
  voice: {
    apiKey: req("ELEVENLABS_API_KEY"),
    agentId: req("ELEVENLABS_AGENT_ID"),              // restock agent
    carryAgentId: process.env.ELEVENLABS_CARRY_AGENT_ID, // prospecting "do you sell it?" agent
    openAgentId: process.env.ELEVENLABS_OPEN_AGENT_ID, // open-conversation agent ("hey what's up")
    // Test-bench agent: a clone of the restock agent. Draft voice tuning + Test Bench self-calls
    // run here, so the owner hears the EXACT store-call brain with draft settings. Live store
    // calls are untouched until "Apply to all stores".
    benchAgentId: process.env.ELEVENLABS_BENCH_AGENT_ID,
    phoneNumberId: req("ELEVENLABS_PHONE_NUMBER_ID"),
    webhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET,
    defaultVoiceId: process.env.ELEVENLABS_VOICE_ID ?? "pm9SHWV7dZpfvnpJ6hSK", // owner's cloned voice
  },
  // Default opening lines; {category} is interpolated.
  defaultQuestion:
    process.env.DEFAULT_QUESTION ??
    "Hi! I was just checking to see if you have any {category} in stock right now?",
  carryQuestion:
    process.env.CARRY_QUESTION ??
    "Hi! Quick question — do you guys carry {category} cards at all?",
  // Text you the moment a store confirms a product is in. (SMS sender must be a Twilio number, not the verified caller ID.)
  clerk: {
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? "",
    enforce: process.env.CLERK_ENFORCE === "true", // gate the API on a valid Clerk session
    // Allowlist of Clerk user ids permitted in (empty = any signed-in user of the instance).
    allowedUserIds: (process.env.CLERK_ALLOWED_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  },
  appUrl: process.env.APP_URL ?? "https://caller.fungibles.com",
  // Staging/preview deploy: a password-walled clone of the live site for reviewing UX before it
  // ships. `STAGING=1` turns on HTTP Basic auth + a noindex header so the preview is never public
  // or search-indexed. Outbound calls/SMS are disabled by default on staging (see callsEnabled),
  // so a preview can never place a real call or spend money — flip `STAGING_CALLS=1` later to
  // exercise the real telephony path. Prod leaves STAGING unset → none of this engages.
  staging: {
    on: process.env.STAGING === "1",
    user: process.env.STAGING_USER ?? "",
    pass: process.env.STAGING_PASS ?? "",
  },
  // Coming-soon gate: COMING_SOON=1 replaces every PUBLIC consumer page (the site + share links) with
  // a coming-soon splash so the public can't use the site yet. Admin (app.html on caller.*/admin.*),
  // the API, and static assets are untouched — the operator dashboard stays fully live. Toggle via the
  // env var; no redeploy of code needed. Prod leaves it unset until launch.
  comingSoon: process.env.COMING_SOON === "1",
  // Peek door: a secret ?peek=<PEEK_CODE> link sets a browser cookie that skips the coming-soon splash
  // for THAT browser only (all brand subdomains via the shared root-domain cookie). Everyone else still
  // gets the splash. Lets the owner test prod as a real customer without going public. Rotate to revoke.
  peekCode: process.env.PEEK_CODE || "",
  // Outbound calling/SMS is live everywhere EXCEPT a staging deploy that hasn't opted in. This is
  // the single switch every outbound-dial path checks (assertCallsEnabled / config.callsEnabled).
  callsEnabled: process.env.STAGING === "1" ? process.env.STAGING_CALLS === "1" : true,
  // SMS login codes cost money per text. Decoupled from callsEnabled so staging can run REAL calls
  // (STAGING_CALLS=1) while STILL skipping real login texts (log in with STAGING_LOGIN_CODE instead).
  // Prod always sends real SMS; staging only if you explicitly opt in with STAGING_SMS=1.
  smsVerifyEnabled: process.env.STAGING === "1" ? process.env.STAGING_SMS === "1" : true,
  adminToken: process.env.ADMIN_TOKEN, // server-to-server admin key (bypasses Clerk for store/zone management)
  anthropicKey: process.env.ANTHROPIC_API_KEY, // powers the in-admin Claude agent (Admin dev assistant)
  openaiKey: process.env.OPENAI_API_KEY,        // alt brain for the admin agent (model switcher)
  geminiKey: process.env.GEMINI_API_KEY,        // alt brain for the admin agent (model switcher)
  groqKey: process.env.GROQ_API_KEY,            // cheapest/fastest brain for the IVR navigator (via Helicone)
  alerts: {
    channel: process.env.ALERT_CHANNEL ?? "call", // "email" | "call" | "sms" (sms needs A2P 10DLC)
    ownerPhone: process.env.OWNER_PHONE,        // where to call/text, e.g. +13106662331
    ownerEmail: process.env.OWNER_EMAIL,        // where to email
    fromNumber: process.env.TWILIO_SMS_FROM,    // Twilio number to alert from
    twilioSid: process.env.TWILIO_ACCOUNT_SID,
    twilioToken: process.env.TWILIO_AUTH_TOKEN,
    brevoApiKey: process.env.BREVO_API_KEY,
    senderEmail: process.env.ALERT_FROM_EMAIL ?? "noreply@fungibles.com",
  },
};

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/** Hard money-stop for every outbound-dial path. Throws when calls are disabled (e.g. a UI-only
 *  staging preview) so a real call/SMS can never be placed by accident. Flip STAGING_CALLS=1 to lift. */
export function assertCallsEnabled(): void {
  if (!config.callsEnabled) {
    throw new Error("calls_disabled: outbound calling is off on this (preview) deploy");
  }
}
