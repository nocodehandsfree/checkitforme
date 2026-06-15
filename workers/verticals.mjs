// Serves the vertical micro-sites (pokemon/onepiece/toppsbasketball/needoh) by reverse-proxying to
// the voice-caller Railway service domain, forcing the brand from the subdomain. Host-agnostic, so it
// serves both *.fungibles.com and *.checkitforme.com. This sidesteps Railway custom-domain TLS
// validation — Cloudflare's wildcard cert terminates TLS, Railway serves via its service domain.
const ORIGIN = "voice-caller-production-2d6b.up.railway.app";
// Admin subdomains must NOT get a brand forced — they render the admin app (app.html) on the server,
// which only happens when there's no ?brand override. (admin.checkitforme.com / caller.*)
const ADMIN_SUBS = new Set(["admin", "caller"]);
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const sub = url.hostname.split(".")[0]; // pokemon | onepiece | toppsbasketball | needoh | admin
    const out = new URL(url.toString());
    out.protocol = "https:";
    out.hostname = ORIGIN;
    out.port = "";
    // Consumer pages get the brand forced from the subdomain (resolveBrand maps the slug via aliases).
    // Admin hosts are passed through untouched so the server serves the admin dashboard.
    if (!ADMIN_SUBS.has(sub)
      && (url.pathname === "/" || url.pathname === "/r" || url.pathname === "/s" || url.pathname.startsWith("/p/"))
      && !out.searchParams.has("brand")) {
      out.searchParams.set("brand", sub);
    }
    // Reverse-proxy: Cloudflare sets Host from the target URL, so Railway routes via its service domain.
    return fetch(new Request(out.toString(), request));
  },
};

