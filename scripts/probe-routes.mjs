// Boots src/server.ts on a spare port, asks it a sample of routes from every area, writes the
// answers to a file, shuts it down. Run it once on the old code and once on the new: the two files
// must be identical. Nothing is left running.
// Usage: node scripts/probe-routes.mjs <out.json> [port]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const out = process.argv[2] ?? "probe.json";
const port = Number(process.argv[3] ?? 8899);
const base = `http://127.0.0.1:${port}`;

const PROBES = [
  ["GET", "/api/health"], ["GET", "/robots.txt"], ["GET", "/sitemap.xml"], ["GET", "/manifest.webmanifest"],
  ["GET", "/sw.js"], ["GET", "/"], ["GET", "/r"], ["GET", "/peek"], ["GET", "/sheetpeek"], ["GET", "/pokemon"],
  ["GET", "/p/about"], ["GET", "/p/terms"], ["GET", "/p/faq"], ["GET", "/s?q=1"], ["GET", "/dash"],
  ["GET", "/og/nope.png"], ["GET", "/fonts/nope.woff2"], ["GET", "/logos/nope.png"], ["GET", "/logos/brand/nope.png"],
  ["GET", "/logos/chains/nope.png"], ["GET", "/logo-wall"], ["GET", "/check-lab"],
  ["GET", "/admin-login"], ["GET", "/admin-logout"], ["GET", "/confirm-email"], ["GET", "/unsubscribe"],
  ["GET", "/pub/policy"], ["GET", "/pub/categories"], ["GET", "/pub/statuses"], ["GET", "/pub/plans"],
  ["GET", "/pub/credits"], ["GET", "/pub/protected"], ["GET", "/pub/store-types"], ["GET", "/pub/best-bet"],
  ["GET", "/pub/finds"], ["GET", "/pub/watch-count"], ["GET", "/pub/kiosks"], ["GET", "/pub/community"],
  ["GET", "/pub/products"], ["GET", "/pub/pokemon-sets"], ["GET", "/pub/support/faq"], ["GET", "/pub/support/banner"],
  ["GET", "/pub/stores"], ["GET", "/pub/stores/near?lat=34.05&lng=-118.24"], ["GET", "/pub/store/1"],
  ["GET", "/pub/geocode?q=90210"], ["GET", "/pub/stock/near?lat=34&lng=-118"], ["GET", "/pub/stock/store/1"],
  ["GET", "/pub/queue/nope"], ["GET", "/pub/result/nope"], ["GET", "/pub/live/nope"], ["GET", "/pub/bridge/nope"],
  ["GET", "/pub/bridge-debug"], ["GET", "/pub/watch-count"],
  ["POST", "/pub/check", "{}"], ["POST", "/pub/check-live", "{}"], ["POST", "/pub/charge", "{}"],
  ["POST", "/pub/feedback", "{}"], ["POST", "/pub/lead", "{}"], ["POST", "/pub/waitlist", "{}"],
  ["POST", "/pub/store-request", "{}"], ["POST", "/pub/watch", "{}"], ["POST", "/pub/gate", "{}"],
  ["POST", "/pub/support/chat", "{}"], ["POST", "/pub/support/search", "{}"], ["POST", "/pub/translate", "{}"],
  ["POST", "/pub/kiosks/report", "{}"], ["POST", "/pub/community/post", "{}"], ["POST", "/pub/bridge-hangup", "{}"],
  ["GET", "/app/me"], ["GET", "/app/history"], ["GET", "/app/zones"], ["GET", "/app/zones/quote"],
  ["GET", "/app/schedules"], ["GET", "/app/referral"], ["GET", "/app/alerts/me"], ["GET", "/app/my-store-requests"],
  ["GET", "/app/support/conversations"], ["POST", "/app/check", "{}"], ["POST", "/app/checkout", "{}"],
  ["POST", "/app/alerts/subscribe", "{}"], ["POST", "/app/email", "{}"], ["POST", "/app/zones", "{}"],
  ["POST", "/app/zones/run/x/stop", "{}"], ["POST", "/app/zones/run/x/stop-one", "{}"],
  ["POST", "/auth/phone/start", "{}"], ["POST", "/auth/phone/check", "{}"], ["GET", "/auth/callerid/status"],
  ["GET", "/api/settings"], ["GET", "/api/retailers"], ["GET", "/api/chains"], ["GET", "/api/categories"],
  ["GET", "/api/results"], ["GET", "/api/zones"], ["GET", "/api/schedules"], ["GET", "/api/statuses"],
  ["GET", "/api/policy"], ["GET", "/api/products"], ["GET", "/api/leads"], ["GET", "/api/waitlist"],
  ["GET", "/api/kiosks"], ["GET", "/api/watches"], ["GET", "/api/community"], ["GET", "/api/feedback"],
  ["GET", "/api/gtm"], ["GET", "/api/credits"], ["GET", "/api/concurrency"], ["GET", "/api/voices"],
  ["GET", "/api/voice-tuning"], ["GET", "/api/voice-presets"], ["GET", "/api/store-requests"],
  ["GET", "/api/alerts/templates"], ["GET", "/api/alerts/log"], ["GET", "/api/support/stats"],
  ["GET", "/api/ops/status"], ["GET", "/api/store-sync/status"], ["GET", "/api/settings-sync/status"],
  ["GET", "/api/admin/overview"], ["GET", "/api/admin/pulse"], ["GET", "/api/admin/users"],
  ["GET", "/api/admin/metrics"], ["GET", "/api/admin/plans"], ["GET", "/api/admin/coverage"],
  ["GET", "/api/admin/data-health"], ["GET", "/api/admin/store-intel"], ["GET", "/api/admin/restock-intel"],
  ["GET", "/api/admin/calls-audit"], ["GET", "/api/admin/test-calls"], ["GET", "/api/admin/call-rates"],
  ["GET", "/api/admin/check-costs"], ["GET", "/api/admin/cost-inputs"], ["GET", "/api/admin/monthly-services"],
  ["GET", "/api/admin/call-timing"], ["GET", "/api/admin/map/graph"], ["GET", "/api/admin/map/unknowns"],
  ["GET", "/api/admin/tree/list"], ["GET", "/api/admin/trainer/list"], ["GET", "/api/admin/trainer/batch"],
  ["GET", "/api/admin/mapper/state"], ["GET", "/api/admin/map/sweep"], ["GET", "/api/admin/learned-sync"],
  ["GET", "/api/admin/agent/models"], ["GET", "/api/admin/calling/status"], ["GET", "/api/admin/live-debug"],
  ["GET", "/api/admin/ui-version"], ["GET", "/api/admin/stats-since"], ["GET", "/api/admin/owner-alert"],
  ["GET", "/api/admin/agent-prompt"], ["GET", "/api/admin/restock-audit"], ["GET", "/api/admin/workflow-assignments"],
  ["GET", "/api/admin/receipt/nope"], ["GET", "/api/admin/store-restock/1"], ["GET", "/api/admin/user-history"],
  ["GET", "/api/admin/tapedeck/session/nope"], ["GET", "/api/admin/trainer/session/nope"],
  ["GET", "/api/preview/1"], ["GET", "/api/test-stores"], ["GET", "/api/conversation/nope"],
  ["GET", "/api/calls/1/receipt"], ["GET", "/api/kiosk-receipts"], ["GET", "/api/discord/channels"],
  ["POST", "/api/tick", "{}"], ["POST", "/api/ingest", "{}"], ["POST", "/api/call-now", "{}"],
  ["POST", "/webhooks/stripe", "{}"], ["POST", "/webhooks/elevenlabs", "{}"],
  ["GET", "/twiml/bridge"], ["POST", "/twiml/bridge-status", "{}"], ["POST", "/twiml/stream-status", "{}"],
  ["GET", "/nav/twiml?session=nope"], ["POST", "/nav/step?session=nope", "{}"], ["POST", "/nav/ended?session=nope", "{}"],
  ["GET", "/nav/ask-audio?session=nope"], ["GET", "/tapedeck/twiml?session=nope"], ["GET", "/tapedeck/clip?session=nope"],
  ["POST", "/api/brain/chat/completions", "{}"], ["GET", "/no-such-page"], ["POST", "/no-such-page", "{}"],
];

// values that legitimately differ between two boots
const scrub = (s) => String(s)
  .replace(/\b1[0-9]{12}\b/g, "<epoch-ms>")
  .replace(/\b1[0-9]{9}\b/g, "<epoch-s>")
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
  .replace(/"rev":"[0-9]+"/g, '"rev":"<rev>"');

const child = spawn("npx", ["tsx", "src/server.ts"], {
  env: { ...process.env, PORT: String(port), DATABASE_URL: process.env.DATABASE_URL ?? `file:/tmp/probe-${port}.db` },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (d) => { log += d; });
child.stderr.on("data", (d) => { log += d; });

const wait = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(base + "/api/health"); if (r.ok) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

const results = {};
try {
  if (!await wait()) { console.error("server did not come up:\n" + log.slice(-2000)); process.exit(1); }
  for (const [method, path, body] of PROBES) {
    const key = `${method} ${path}`;
    try {
      const r = await fetch(base + path, {
        method, redirect: "manual",
        headers: { host: "pokemon.checkitforme.com", ...(body ? { "content-type": "application/json" } : {}) },
        body,
      });
      const text = await r.text();
      results[key] = {
        status: r.status,
        location: r.headers.get("location") ?? null,
        type: r.headers.get("content-type") ?? null,
        cache: r.headers.get("cache-control") ?? null,
        len: text.length,
        body: scrub(text).slice(0, 400),
      };
    } catch (e) { results[key] = { error: String(e) }; }
  }
} finally {
  child.kill("SIGKILL");
}
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`probed ${Object.keys(results).length} routes -> ${out}`);
process.exit(0); // the child's pipes would otherwise keep this process alive
