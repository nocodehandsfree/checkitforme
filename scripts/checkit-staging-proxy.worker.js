// Reverse proxy for staging.checkitforme.com -> the staging Railway service.
// Cloudflare serves the valid *.checkitforme.com cert; we fetch Railway over its own cert. This
// exists ONLY to terminate the cert/domain (Railway can't issue one behind Cloudflare).
//
// NO password gate. Staging behaves like production — you log in with your phone. We just keep the
// preview out of search engines (the origin also sets X-Robots-Tag).
//
// Source of truth: voice-caller/scripts/checkit-staging-proxy.worker.js
// Deploy: voice-caller/scripts/deploy-staging-proxy.sh (Cloudflare API; token from Railway).
const ORIGIN = "voice-caller-staging-production.up.railway.app";

addEventListener("fetch", (e) => e.respondWith(handle(e.request)));
async function handle(request) {
  const url = new URL(request.url);
  url.hostname = ORIGIN;
  url.protocol = "https:";
  url.port = "";
  const resp = await fetch(new Request(url.toString(), request));
  const out = new Headers(resp.headers);
  out.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: out });
}
