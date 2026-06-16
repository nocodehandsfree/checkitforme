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
    "Hi! I was just checking to see if you got a {category} shipment in today?",
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
