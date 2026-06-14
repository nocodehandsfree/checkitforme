// Serves the vertical micro-sites (pokemon/onepiece/toppsbasketball/needoh .fungibles.com) by
// reverse-proxying to the voice-caller Railway service domain, forcing the brand from the subdomain.
// This sidesteps Railway custom-domain TLS validation entirely — Cloudflare's *.fungibles.com wildcard
// cert terminates TLS, Railway serves via its always-valid service domain.
const ORIGIN = "voice-caller-production-2d6b.up.railway.app";
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const sub = url.hostname.split(".")[0]; // pokemon | onepiece | toppsbasketball | needoh
    const out = new URL(url.toString());
    out.protocol = "https:";
    out.hostname = ORIGIN;
    out.port = "";
    // Pages that render the consumer site get the brand forced (resolveBrand maps the slug via aliases).
    if ((url.pathname === "/" || url.pathname === "/r" || url.pathname === "/s" || url.pathname.startsWith("/p/")) && !out.searchParams.has("brand")) {
      out.searchParams.set("brand", sub);
    }
    // Reverse-proxy: Cloudflare sets Host from the target URL, so Railway routes via its service domain.
    return fetch(new Request(out.toString(), request));
  },
};
