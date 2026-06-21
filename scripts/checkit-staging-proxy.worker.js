// Reverse proxy for staging.checkitforme.com -> the staging Railway service.
// Cloudflare serves the valid *.checkitforme.com cert; we fetch Railway over its own cert.
//
// Gate: a LOGIN FORM + persistent cookie (NOT HTTP Basic). The native Basic popup re-triggers on
// nearly every navigation in iOS Safari, which is why staging "kept asking for the password". A
// form sets a 30-day cookie once; after that no prompt until it expires. We still inject Basic
// upstream so the app's own STAGING gate passes, and never clobber a Bearer (/app/* session calls).
//
// Source of truth for this worker is committed at voice-caller/scripts/checkit-staging-proxy.worker.js
// Deploy: voice-caller/scripts/deploy-staging-proxy.sh (Cloudflare API; token from Railway).
const ORIGIN = "voice-caller-staging-production.up.railway.app";
const USER = "check";
const PASS = "ZD02syVQLLO9L34o";
const COOKIE = "stg_gate";
const TOKEN = "P_vrNyS4NzYnONdh_veOb9NjG6nnwcpi";
const BASIC = "Basic " + btoa(USER + ":" + PASS);
const SETCOOKIE = COOKIE + "=" + TOKEN + "; Max-Age=2592000; Path=/; Secure; HttpOnly; SameSite=Lax";

function authed(req) {
  const c = req.headers.get("Cookie") || "";
  return c.split(/;\s*/).some((kv) => kv === COOKIE + "=" + TOKEN);
}
function loginPage(msg) {
  const err = msg ? `<div class="e">${msg}</div>` : "";
  return new Response(
    `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta name=robots content=noindex><meta name=theme-color content="#0C0C12"><title>Check — staging</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0C0C12;color:#fff;font-family:-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased}form{width:min(92vw,340px);padding:30px 26px;background:#15151c;border:1px solid #26262f;border-radius:18px}h1{font-size:19px;font-weight:800;margin:0 0 5px}p{color:#9a9aa8;font-size:13px;line-height:1.45;margin:0 0 20px}input{width:100%;padding:14px;border-radius:12px;border:1px solid #2a2a35;background:#0e0e16;color:#fff;font-size:16px;outline:none}input:focus{border-color:#4ADE80}button{width:100%;margin-top:12px;padding:14px;border:0;border-radius:12px;background:#4ADE80;color:#06210f;font-weight:800;font-size:15px;cursor:pointer}.e{color:#EF4444;font-size:12.5px;margin-top:12px}</style></head>
<body><form method="POST" action="/__gate"><h1>Staging preview</h1><p>This is the private preview of Check. Enter the password to continue.</p><input type="password" name="p" autofocus autocomplete="current-password" placeholder="Password" enterkeyhint="go"><button type="submit">Enter</button>${err}</form></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } },
  );
}

addEventListener("fetch", (e) => e.respondWith(handle(e.request)));
async function handle(request) {
  const url = new URL(request.url);

  // Login form submit -> validate, set the cookie, bounce to home.
  if (url.pathname === "/__gate" && request.method === "POST") {
    let pw = "";
    try { pw = (await request.formData()).get("p") || ""; } catch (_) {}
    if (pw === PASS) {
      return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": SETCOOKIE, "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } });
    }
    return loginPage("Wrong password — try again.");
  }

  // Everything else needs the cookie (or, for convenience, valid Basic). No WWW-Authenticate is ever
  // sent, so the browser never shows its native login dialog — humans get the form, machines get 401.
  const basicOK = (request.headers.get("Authorization") || "") === BASIC;
  if (!authed(request) && !basicOK) {
    const accept = request.headers.get("Accept") || "";
    if (request.method === "GET" && accept.includes("text/html")) return loginPage("");
    return new Response("Authentication required.", { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }

  // Proxy to the Railway origin. Inject Basic upstream (so the app's own gate passes) unless the
  // request already carries a Bearer token (/app/*, /api/* session calls — leave those untouched).
  url.hostname = ORIGIN;
  url.protocol = "https:";
  url.port = "";
  const headers = new Headers(request.headers);
  const auth = headers.get("Authorization") || "";
  if (!auth || basicOK) headers.set("Authorization", BASIC);
  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  const resp = await fetch(url.toString(), init);

  const out = new Headers(resp.headers);
  out.set("X-Robots-Tag", "noindex, nofollow");
  if (authed(request)) out.append("Set-Cookie", SETCOOKIE); // keep the cookie fresh while in use
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: out });
}
