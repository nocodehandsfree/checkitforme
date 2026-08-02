// The pages the site serves: the home page for each brand, the share landing that unfurls on
// socials, the coming-soon splash, the About/Terms/Privacy pages, and the static bits a browser
// asks for (icons, fonts, robots.txt, sitemap.xml, the service worker, the web manifest).
// Rendering helpers live here too — nothing else renders HTML for a customer.

import type { Hono } from "hono";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Context } from "hono";
import { getCookie } from "hono/cookie";
import { desc } from "drizzle-orm";
import { config } from "../config";
import { brandSwitcher, resolveBrand } from "../brands";
import { cachedPolicy, getPolicy } from "../policy";
import { adminUiHtml } from "./admin-settings";
import { esc, here, page, peekOk, withAnalytics } from "./shared-helpers";

/** FAQ + HowTo structured data per vertical — Google rich-result eligibility for the PPC/SEO push. */
export function seoGraph(brand: ReturnType<typeof resolveBrand>, plainName: string) {
  const prod = brand.category || "trading cards & collectibles";
  const qa = (q: string, a: string) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } });
  return [
    { "@type": "FAQPage", mainEntity: [
      qa(`How does ${plainName} work?`, `Pick a store near you and ${plainName} calls it by phone, asks a real associate whether ${prod} is in stock, and texts you the answer with proof — usually in about two minutes.`),
      qa(`Is it accurate?`, `Yes. Instead of trusting store websites and apps that are wrong roughly 40% of the time, ${plainName} calls the store so a real person checks the shelf. You get the transcript as proof.`),
      qa(`How much does ${plainName} cost?`, `Your first store check is free, with no card required. After that you can pay per call or join the membership for a lower per-call rate and premium features.`),
      qa(`Which stores can you call?`, `Big-box chains and local retailers near you — including Target, Walmart, GameStop, pharmacies, and hobby shops — anywhere that might stock ${prod}.`),
      qa(`Can you tell me when ${prod} is back in stock?`, `Yes. Set a free restock alert and ${plainName} notifies you the moment a call confirms ${prod} is back on the shelf.`),
    ] },
    { "@type": "HowTo", name: `How to find ${prod} in stock near you`, description: `Use ${plainName} to find ${prod} in stock at a real store near you without driving around.`, step: [
      { "@type": "HowToStep", position: 1, name: "Find stores near you", text: "Tap Find me and set your radius — we show the stores open right now." },
      { "@type": "HowToStep", position: 2, name: "We call it, live", text: `${plainName} phones the store and asks a real associate if ${prod} is in stock — you can listen in.` },
      { "@type": "HowToStep", position: 3, name: "Get the answer with proof", text: "In about two minutes you get a clear yes or no, plus the transcript of what the clerk said." },
    ] },
  ];
}

// Behind the staging/prod Cloudflare worker the origin Host header is the INTERNAL *.railway.app
// service hostname, not the domain the visitor actually used. Any absolute URL we hand a link-preview
// bot (og:image, og:url, canonical) MUST carry the public domain — iMessage/Facebook can't fetch the
// internal host, so the unfurl card renders blank (owner 07-18: shared find showed no image). Mirrors
// the og:title fix that already lived inline in renderRunner; now the single source for every render.
export const publicHost = (host: string): string =>
  /railway\.app$/i.test(host) ? (config.staging.on ? "staging.checkitforme.com" : "checkitforme.com") : host.replace(/^www\./, "");

// Coming-soon splash: the ONLY public HTML while config.comingSoon is on. Check wordmark + the owner's
// launch line + the four product-type icons. Standalone (no app JS), dark on-brand, noindex.
export const COMING_SOON_ICONS = ["pokemon", "onepiece", "topps", "needoh"];

export function renderComingSoon(_host: string, refShare = false): string {
  const line = "Find insanely hard to get products on the shelves at retail prices.";
  // Even gated, a shared link must unfurl right: bots read these tags while humans see the splash.
  const ogImage = `https://${publicHost(_host)}/og/${refShare ? "card-refer" : "runner"}.png`;
  const ogTitle = refShare ? "We both get a free check." : "Check — coming soon";
  const og = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(ogTitle)}">`,
    `<meta property="og:description" content="${esc(line)}">`,
    `<meta property="og:image" content="${ogImage}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${ogImage}">`,
  ].join("\n");
  const icons = COMING_SOON_ICONS.map(
    (k) => `<img src="/logos/products/${k}.png" alt="" width="60" height="60" loading="eager">`
  ).join("");
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>Check — coming soon</title>
${og}
<link rel="icon" type="image/png" href="/logos/brand/check-icon.png?v=3">
<link rel="apple-touch-icon" href="/logos/brand/check-icon.png?v=3">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:#0C0C12;color:#fff;font-family:Inter,-apple-system,system-ui,sans-serif;
  min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:34px;padding:40px 24px calc(40px + env(safe-area-inset-bottom));text-align:center}
.cs-logo{width:min(240px,60vw);height:auto;display:block}
.cs-line{font-size:19px;line-height:1.45;font-weight:700;letter-spacing:-.2px;
  max-width:340px;text-wrap:balance;color:#EDEDF2}
.cs-icons{display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap}
.cs-icons img{width:60px;height:60px;object-fit:contain;
  filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))}
.cs-soon{position:fixed;left:0;right:0;bottom:calc(30px + env(safe-area-inset-bottom));
  text-align:center;font-size:12px;font-weight:700;letter-spacing:.22em;
  text-transform:uppercase;color:#6E6E7A}
@media(max-width:360px){.cs-icons{gap:14px}.cs-icons img{width:52px;height:52px}}
</style></head><body>
<img class="cs-logo" src="/logos/brand/check.png?v=2" alt="Check">
<p class="cs-line">${esc(line)}</p>
<div class="cs-icons">${icons}</div>
<div class="cs-soon">Coming soon</div>
</body></html>`;
}

/** Render the consumer page branded for a vertical micro-site (resolved from the subdomain). */
export function renderRunner(brand: ReturnType<typeof resolveBrand>, host: string, file = "checkit.html", tone = "", peek = false, refShare = false): string {
  void peek; // coming-soon gate now lives in the single middleware above (peek bypass handled there)
  const pub = publicHost(host); // never the internal railway host in emitted URLs (see publicHost)
  const canonical = `https://${pub}/`;
  const plainName = brand.name.replace(/<[^>]+>/g, "");
  // Invite links (?ref=CODE) unfurl with the referral card (owner 07-14) — the page itself is the app.
  const ogImage = refShare ? `https://${pub}/og/card-refer.png` : `https://${pub}/og/${brand.key}.png`;
  const head = [
    `<title>${esc(brand.title)}</title>`,
    `<meta name="description" content="${esc(brand.desc)}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta name="robots" content="index,follow,max-image-preview:large">`,
    // NB: NO theme-color meta here — and none in checkit.html either, ON PURPOSE. One theme-color
    // tints BOTH iOS Safari bars (green bottom toolbar) and overrides the per-edge page sampling we
    // rely on. The status bar takes its colour from the painted page instead: the html/body verdict
    // gradient (rv-* classes) in-page, and for ?tone= deep-links the tone-* class this renderer
    // bakes onto the served <html> tag below. Do not add a theme-color meta back.
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(plainName)}">`,
    // Apex/invite embeds (owner): the CARD IMAGE carries the headline, so the visible link title is
    // just the address — no repeated "Is it in stock?" under the image. publicHost keeps the internal
    // Railway hostname out of the visible title behind the proxy.
    `<meta property="og:title" content="${esc(brand.key === "runner" ? pub : brand.title)}">`,
    `<meta property="og:description" content="${esc(brand.desc)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${ogImage}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(brand.key === "runner" ? pub : brand.title)}">`,
    `<meta name="twitter:description" content="${esc(brand.desc)}">`,
    `<meta name="twitter:image" content="${ogImage}">`,
    `<style>:root{--accent:${brand.accent};--accent2:${brand.accent2 || brand.accent};--logo-scale:${brand.logoScale || 1}}</style>`,
    `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": [
      { "@type": "WebSite", name: plainName, url: canonical, description: brand.desc },
      { "@type": "Service", name: plainName, serviceType: "Retail in-stock phone check", areaServed: "US",
        description: brand.desc, provider: { "@type": "Organization", name: plainName, url: canonical } },
      ...seoGraph(brand, plainName),
    ] })}</script>`,
  ].join("\n");
  // Status-bar tone for verdict deep-links (?call=…&tone=in|out|unk|soon): baked as a CLASS on the
  // literal served <html> tag (the html.tone-* static CSS lives in checkit.html). iOS samples the page
  // background for the status bar at FIRST PAINT — a tone applied later by script (boot/fetch timing)
  // often misses that sample and leaves the bar dark in plain Safari. Baking the class server-side makes
  // the very first paint the verdict colour with zero JS dependency; the in-page rv-* class system takes
  // over (and drops the baked class via dropBakedTone) as soon as the app renders a view.
  const toneClass = /^(in|out|unk|soon)$/.test(tone) ? ` class="tone-${tone}"` : "";
  return withAnalytics(page(file))
    .replace('<html lang="en">', `<html lang="en"${toneClass}>`)
    .replace(/__BRAND_HEAD__/g, head)
    .replace(/__BRAND_JSON__/g, JSON.stringify({ key: brand.key, name: brand.name, category: brand.category, accent: brand.accent, accent2: brand.accent2 || brand.accent, logoUrl: brand.logoUrl || "", emoji: brand.emoji }))
    .replace(/__BRAND_LOGO__/g, brand.logo || `${brand.emoji} ${brand.name}`)
    .replace(/__BRAND_ART__/g, brand.logoUrl ? `<img src="${brand.logoUrl}" alt="${esc(brand.short)}">` : (brand.art || ""))
    .replace(/__BRAND_SWITCHER__/g, JSON.stringify({ current: brand.key, list: brandSwitcher(cachedPolicy().flags) }))
    .replace(/__BRAND_HEADLINE__/g, brand.headline)
    .replace(/__BRAND_SUB__/g, brand.sub);
}

// ---- Share landing: a find-specific page that unfurls richly on socials and converts the visitor.
// Bots read the dynamic OG title/description (brand image stays static = reliable on every platform);
// humans see a styled card + a CTA back into the app. Pure string render — no deps, cache-friendly.
export function renderShare(brand: ReturnType<typeof resolveBrand>, host: string, q: Record<string, string>, peek = false): string {
  void peek; // coming-soon gate now lives in the single middleware above (peek bypass handled there)
  // Bilingual: the sharer's app appends &lang=; a cold recipient with no lang param falls back to their
  // browser's Accept-Language. Friend-to-friend is almost always the same language, so lang wins.
  const lang = q.lang === "es" || (!q.lang && /^\s*es/i.test(q.al || "")) ? "es" : "en";
  const L = (en: string, es: string) => (lang === "es" ? es : en);
  const zone = q.k === "zone"; // zone-sweep share: "{i} of {n} stores had it"
  const inStock = (q.v || "in") === "in";
  const store = (q.store || "").slice(0, 80);
  const cat = (q.cat || brand.category || "cards").slice(0, 60);
  const plainName = brand.name.replace(/<[^>]+>/g, "");
  const pub = publicHost(host); // never the internal railway host in emitted URLs (see publicHost)
  const site = `https://${pub}/`;
  const zN = Math.max(0, Number(q.n) || 0), zI = Math.max(0, Number(q.i) || 0);
  // State drives every branch. Zone with hits → "zonein"; zone with zero hits collapses to the
  // store-less watch copy (owner: "none yet, Check catches the restock").
  const state: "in" | "watch" | "zonein" = zone ? (zI > 0 ? "zonein" : "watch") : inStock ? "in" : "watch";
  const positive = state === "in" || state === "zonein";
  const showStore = state !== "zonein" && !(state === "watch" && zone) && !!store; // no single store on a zone card
  // In-stock stores for the zone logo row (owner): client passes st=<json [{l:logoUrl,n:name}]>. Cap 6.
  let zStores: Array<{ l: string; n: string }> = [];
  if (state === "zonein" && q.st) { try { const a = JSON.parse(q.st); if (Array.isArray(a)) zStores = a.slice(0, 6).map((s) => ({ l: String(s.l || ""), n: String(s.n || "") })); } catch { /* ignore malformed */ } }
  const mono = (n: string) => (n.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2) || "?").toUpperCase();

  // Unfurl cards (owner 07-14): baked images with the brandmark + copy. Zone → zone card; in-stock →
  // per-brand find card; watch → brand hero card.
  const ogImage = state === "zonein" ? `https://${pub}/og/card-zone.png` : state === "in" ? `https://${pub}/og/card-find-${brand.key}.png` : `https://${pub}/og/${brand.key}.png`;

  const catHl = `<span class="hl">${esc(cat)}</span>`;
  // Badge icon: comp P6 in-stock RESULT pill uses a glowing dot; watch keeps the bell.
  const dot = `<span class="gdot"></span>`;
  const bell = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;
  const badgeIcon = positive ? dot : bell;
  const badge = state === "in" ? L("IN STOCK", "EN STOCK")
    : state === "zonein" ? L(`${zI} OF ${zN} HAD IT`, `${zI} DE ${zN} LO TENÍAN`)
    : L("ON WATCH", "EN SEGUIMIENTO");
  const headline = state === "in" ? catHl
    : state === "zonein" ? L(`${catHl} is on shelves nearby`, `${catHl} está en estantes cerca`)
    : L(`We're tracking ${catHl}`, `Estamos rastreando ${catHl}`);
  const zoneMsg = L(`Check called ${zN} stores at once. ${esc(cat)} is on the shelf at these:`,
                    `Check llamó a ${zN} tiendas a la vez. ${esc(cat)} está en el estante en estas:`);
  const whatIsIt = state === "in"
    ? L("Your friend used Check AI to find viral products on the shelves at retail prices.", "Tu amigo usó Check AI para encontrar productos virales en los estantes a precio de tienda.")
    : state === "zonein" ? "" // the zone message + logo row carry it
    : zone ? L("None yet. Check catches the restock.", "Ninguna aún. Check atrapa la reposición.")
    : L("Not in yet. Check catches the restock.", "Aún no. Check atrapa la reposición.");
  const hook = L("First one's on us!", "¡La primera va por nuestra cuenta!");
  const button = L("YOUR TURN", "TE TOCA");
  // The full store name prints as "@ Name" under the headline, right-aligned to the headline's edge.
  const atName = showStore && store ? `<div class="satname">@ ${esc(store)}</div>` : "";

  const green = "#4ADE80", amber = "#F59E0B";
  const accent = positive ? green : amber;
  const brandColor = brand.accent || green; // the product's own color (Pokémon yellow, One Piece red…)
  const title = state === "in" ? L(`${cat} is in stock at ${store}`, `${cat} está en stock en ${store}`)
    : state === "zonein" ? L(`${cat} is in stock nearby`, `${cat} está en stock cerca`)
    : L(`We're tracking ${cat}`, `Estamos rastreando ${cat}`);
  const desc = whatIsIt || L(`Check called ${zN} stores at once. ${cat} is on the shelf nearby.`,
                             `Check llamó a ${zN} tiendas a la vez. ${cat} está en el estante cerca.`);
  const shareUrl = `https://${pub}/s?${new URLSearchParams({ ...(store ? { store } : {}), cat, v: inStock ? "in" : "out", ...(zone ? { k: "zone", n: String(zN), i: String(zI) } : {}), lang }).toString()}`;
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="robots" content="index,follow,max-image-preview:large">`,
    `<meta name="theme-color" content="#1D1D22">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(plainName)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(shareUrl)}">`,
    `<meta property="og:image" content="${ogImage}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${ogImage}">`,
  ].join("\n");
  const logoRow = state === "zonein" && zStores.length
    ? `<div class="logos">${zStores.map((s) => s.l
        ? `<div class="ltile"><img src="${esc(s.l)}" alt="" onerror="this.style.display='none';this.parentNode.classList.add('lmono');this.parentNode.textContent='${esc(mono(s.n))}'"></div>`
        : `<span class="lmono">${esc(mono(s.n))}</span>`).join("")}</div>`
    : "";
  // Rebuilt 2026-07-18 element-for-element from the P6 IN-STOCK comp (docs/design/comps/
  // WEBSITE_COMPS.dc.html, ~L448-471): green-wash card (r40), glow-dot IN STOCK pill, 56px store
  // hero tile, and the "Check another store" capsule CTA with the ckShine sweep + ckGlow dot.
  // The CP / CPEND markers fence this <style> as a CONSUMER PAGE: qa-design holds everything inside
  // to the STYLE_GUIDE token set + Inter-only, same as the homepage. ANY new consumer landing/share
  // page's <style> MUST be fenced the same way so it can't ship off-system.
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${head}
<link rel="icon" type="image/png" href="/logos/brand/check-icon.png?v=3">
<link rel="preload" href="/fonts/inter-var-latin.woff2" as="font" type="font/woff2" crossorigin>
<style>/*CP*/
  @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(/fonts/inter-var-latin.woff2) format('woff2')}
  *{box-sizing:border-box;margin:0} :root{--green:${green};--amber:${amber}}
  body{background:#1D1D22;color:#fff;font-family:Inter,-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;min-height:100dvh;display:grid;place-items:center;padding:24px}
  .wrap{max-width:430px;width:100%;text-align:center}
  .card{position:relative;text-align:left;border:1px solid rgba(255,255,255,.12);border-radius:40px;padding:40px 27px 34px;box-shadow:0 24px 48px -12px rgba(0,0,0,.7)}
  .card.pos{background:radial-gradient(125% 82% at 34% 15%, rgba(38,100,64,.98) 0%, rgba(38,100,64,.5) 30%, rgba(38,100,64,0) 60%),#20202A}
  .card.neg{background:#26262B}
  .cwmwrap{position:absolute;inset:0;border-radius:40px;overflow:hidden;z-index:0;pointer-events:none}
  .cwm{position:absolute;top:-40px;right:-44px;width:180px;height:180px;opacity:.16;z-index:0}
  .cbody{position:relative;z-index:1}
  .cact{margin-top:38px}
  .chead{margin-bottom:30px}
  .badge{display:inline-flex;align-items:center;gap:7px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.13em;color:${accent};background:rgba(255,255,255,.06);border:1px solid ${accent}66;padding:6px 12px;border-radius:999px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}
  .gdot{width:8px;height:8px;border-radius:50%;background:${accent};box-shadow:0 0 8px ${accent};animation:ckGlow 2s ease-in-out infinite}
  .title{display:inline-block;max-width:100%;align-self:flex-start}
  .big{font-size:44px;font-weight:900;line-height:1;letter-spacing:-1.6px;margin:0} .big .hl{color:${brandColor}}
  .satname{display:block;text-align:right;font-size:16px;font-weight:700;letter-spacing:-.2px;color:#fff;margin-top:7px}
  .zmsg{color:rgba(255,255,255,.78);font-size:14.5px;font-weight:500;line-height:1.5;margin:6px auto 4px;max-width:330px}
  .logos{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:14px 0 6px}
  .ltile,.lmono{width:40px;height:40px;border-radius:11px;flex:0 0 auto}
  .ltile{background:#1F1F25;display:grid;place-items:center;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)} .ltile img{width:30px;height:30px;object-fit:contain}
  .lmono{background:linear-gradient(145deg,#34343D,#23232B);display:grid;place-items:center;color:#CDCDD8;font-weight:900;font-size:14px}
  .what{color:rgba(255,255,255,.82);font-size:15px;font-weight:500;line-height:1.55;margin:24px 0 0}
  .cta{display:block;text-decoration:none;border-radius:999px;padding:2.5px;background:linear-gradient(120deg,#5BEA93 0%,#19B145 55%,#0B5A2C 100%);box-shadow:0 10px 22px -12px rgba(0,0,0,.55)}
  .cin{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:9px;border-radius:999px;background:#20202A;padding:13px 22px}
  .shine{position:absolute;top:0;bottom:0;left:-45%;width:45%;background:linear-gradient(105deg,transparent 0%,rgba(140,255,185,.25) 50%,transparent 100%);animation:ckShine 2.8s ease-in-out infinite}
  .ctxt{position:relative;font-size:12.5px;font-weight:800;letter-spacing:.13em;color:#fff}
  .arw{position:relative;flex:0 0 auto}
  .foot{color:#8A8A96;font-size:12.5px;font-weight:600;margin-top:14px;text-align:center}
  @keyframes ckShine{0%{left:-45%}55%,100%{left:110%}}
  @keyframes ckGlow{0%,100%{opacity:.4}50%{opacity:1}}
  @media (prefers-reduced-motion:reduce){.shine,.gdot{animation:none}}
/*CPEND*/</style></head><body><div class="wrap">
  <div class="card ${positive ? "pos" : "neg"}">
    ${positive ? `<div class="cwmwrap"><svg class="cwm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#8CF7B4"/><path d="M6.5 12.4 L10.3 16 L17.5 8" stroke="#20693F" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>` : ""}
    <div class="cbody">
    <div class="chead"><div class="badge">${badgeIcon} ${badge}</div></div>
    <div class="title"><h1 class="big">${headline}</h1>${atName}</div>
    ${state === "zonein" ? `<div class="zmsg">${zoneMsg}</div>${logoRow}` : ""}
    ${whatIsIt ? `<div class="what">${whatIsIt}</div>` : ""}
    <div class="cact">
    <a class="cta" href="${site}"><span class="cin"><span class="shine"></span><span class="ctxt">${button}</span><svg class="arw" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></span></a>
    <div class="foot">${hook}</div>
    </div>
    </div>
  </div>
</div></body></html>`;
}

// Static content pages (about/contact/terms/privacy) — branded, owner-editable via policy.pages.
// (FAQ retired → the book / the messenger FAQ tab; see the /p/faq redirect below.)
export const PAGE_TITLES: Record<string, string> = { about: "About", contact: "Get help", terms: "Terms of Service", privacy: "Privacy Policy" };

// Real, shipped content for the legal/info pages so none of them read "coming soon". Owner-overridable
// per brand via policy.pages (a non-empty override wins); this is the version-controlled fallback that
// serves on every brand + environment. Rendered inside .body — plain HTML (<h2>/<p>/<ul>) only.
export const H2 = 'style="font-size:19px;font-weight:800;color:#e9e9f0;margin:26px 0 8px"';

export const RM = "https://checkitforme.readme.io";
 // the source-of-truth docs (how it works, full FAQ)
export const DEFAULT_PAGES: Record<string, string> = {
  about: `<p><b>Check It For Me</b> finds out if the thing you want is actually on the shelf. By phone. So you don't drive across town for nothing.</p>
<p>You pick a store and a product. Check AI calls the store, asks a real person, and sends you the answer. Real call, straight answer. No bots pretending to be you, no camping a refresh page at midnight.</p>
<h2 ${H2}>Why we built it</h2>
<p>We're collectors. We lived the same broken hunt everyone lives: a set drops, every website says sold out in the time it takes to blink, and somewhere across town a truck just dropped a case nobody has found yet. The shelf has it. The internet has no idea.</p>
<p>So we did the one thing that actually works. We called the store. It worked every single time. The problem was never the information. It was that calling twelve stores, sitting through twelve phone trees, to ask one tiny question, is nobody's idea of a good night.</p>
<p>So we taught an AI to make that call. Wait through the hold music, work the menu, reach a real human, ask the one question that matters. Then we made it one tap. That's the whole company: the annoying part, done for you, with the receipt to prove it.</p>
<p>We only cover the stuff that truly sells out and rewards the hunt: Pokémon, One Piece, Topps NBA, and NeeDoh. And you only pay when we get you a real answer. No answer, no charge. That one is wired into the system, not printed on a poster.</p>
<h2 ${H2}>Want the deep version?</h2>
<p>How it all works, top to bottom, lives in the book: <a href="${RM}" target="_blank" rel="noopener">checkitforme.readme.io</a>.</p>`,
  contact: `<p>Two fast ways to reach a human. Tap <b>Help</b> in the footer to open the chat, or hop into our <b>Discord</b>. The support bot answers the common stuff in seconds, any time, and a person picks up the rest.</p>
<p>Want a store added? Do it right in the app. Account, then Earn, then <i>Add your store</i>. When a store you asked for goes live, your next check is on us.</p>
<p>We skip phone and email support on purpose. Low overhead is how checks stay cheap.</p>`,
  terms: `<p>By using <b>Check It For Me</b> (checkitforme.com) you're good with these terms. If not, no hard feelings. Just don't use it.</p>
<h2 ${H2}>What we do</h2>
<p>We call stores and ask if something's in stock, then tell you what they said. Answers are a snapshot. Stores get it wrong sometimes, so we can't promise the item is there, or the price, or that it'll still be there when you show up.</p>
<h2 ${H2}>Checks and payments</h2>
<p>You pay with checks, bought in packs or included in a plan. Stripe handles the card. A check is spent when it places a call. Unused checks can be refunded if you ask. Spent ones can't. Plans renew until you cancel, and you can cancel any time for the next round.</p>
<h2 ${H2}>Who can use it</h2>
<p>You need to be at least 18 and in the United States. You're responsible for the checks placed on your account.</p>
<h2 ${H2}>Play nice</h2>
<p>Don't use us to harass a store, place calls you've got no real reason for, resell the service, or break the law. We can pause accounts that abuse the service or the stores we call.</p>
<h2 ${H2}>The fine print</h2>
<p>The service is "as is." As far as the law allows, we're not on the hook for a missed item, a wrong answer, or a wasted trip. If it ever comes to it, our max liability is what you paid us in the last 30 days.</p>
<h2 ${H2}>Changes</h2>
<p>We may update these terms. Keep using the app and that's a yes. Questions? Ask us in the app chat or on Discord.</p>
<p style="margin-top:22px"><a href="/p/privacy" onclick="if(window.openPage){openPage('privacy');return false}">Privacy Policy →</a></p>`,
  privacy: `<p>Here's what <b>Check It For Me</b> (checkitforme.com) collects, why, and what you can do about it. Short version: we take only what we need to run your checks, we keep it only as long as we need it, and we never sell it.</p>
<h2 ${H2}>What we collect</h2>
<ul>
<li><b>Your cell number.</b> It's how you sign in, and we call stores on your behalf, so a verified number is required. No number, no checks.</li>
<li><b>Your checks.</b> The store, the product, the result, and the written conversation we bring back as your proof.</li>
<li><b>Rough location.</b> Only if you allow it, to show stores near you. Say no and search by ZIP instead.</li>
<li><b>Payment info.</b> Stripe handles your card. We never see the full number.</li>
<li><b>Basic usage.</b> Enough to keep the app running, fix bugs, and stop abuse.</li>
</ul>
<h2 ${H2}>How we use it</h2>
<p>To place your calls, show your history, take payment, keep the service safe, and make the answers more accurate. That is the whole list.</p>
<h2 ${H2}>Who we share it with</h2>
<p>Only the vendors that make Check work, and only so they can do their job. Our AI voice provider places and transcribes the calls. Twilio sends your login codes and alert texts, and carries the calls. Stripe processes payments. They handle your info under their own terms, on our behalf. We do not sell your personal information, and we never will.</p>
<h2 ${H2}>How long we keep it</h2>
<p>We keep your account, your checks, and their conversations until you ask us to delete them, or until we no longer need them to run the service. Delete your account and we remove your personal data, apart from the little the law requires us to hold.</p>
<h2 ${H2}>Your rights</h2>
<p>You can see your data, correct it, download a copy, or delete it. Turn off location any time in your browser. Turn off alert texts and emails from your account. Want a copy or a deletion? Ask us in the app chat or on Discord and we will take care of it.</p>
<h2 ${H2}>Kids</h2>
<p>Check is made for adults in the United States. It is not meant for children under 13, and we do not knowingly collect their information.</p>
<p style="margin-top:22px"><a href="/p/terms" onclick="if(window.openPage){openPage('terms');return false}">Terms of Service &rarr;</a></p>`,
};

// Hand-written Spanish for the footer pages (copy law 3: every string ships its Spanish). Same voice,
// no dashes, fewest words. Served whenever the app asks with ?lang=es; the owner's policy.pages
// overrides are English-only, so Spanish always comes from here.
export const PAGE_TITLES_ES: Record<string, string> = { about: "Acerca de", contact: "Ayuda", terms: "Términos del servicio", privacy: "Política de privacidad" };

export const DEFAULT_PAGES_ES: Record<string, string> = {
  about: `<p><b>Check It For Me</b> averigua si lo que buscas de verdad está en el estante. Por teléfono. Para que no cruces la ciudad por nada.</p>
<p>Eliges una tienda y un producto. Check AI llama a la tienda, pregunta a una persona real y te manda la respuesta. Llamada real, respuesta directa. Sin bots que se hacen pasar por ti, sin refrescar una página toda la noche.</p>
<h2 ${H2}>Por qué lo hicimos</h2>
<p>Somos coleccionistas. Vivimos la misma cacería rota que todos: sale un set, cada página dice agotado en lo que dura un parpadeo, y en algún lugar de la ciudad un camión acaba de dejar una caja que nadie ha encontrado. El estante lo tiene. El internet no tiene idea.</p>
<p>Así que hicimos lo único que funciona. Llamamos a la tienda. Funcionó siempre. El problema nunca fue la información. Era que llamar a doce tiendas, aguantar doce menús de teléfono, para hacer una sola preguntita, no es idea de nadie de una buena noche.</p>
<p>Así que le enseñamos a una IA a hacer esa llamada. Aguantar la música de espera, navegar el menú, llegar a una persona real, hacer la única pregunta que importa. Y lo hicimos de un toque. Esa es toda la empresa: la parte molesta, hecha por ti, con la prueba en mano.</p>
<p>Solo cubrimos lo que de verdad se agota y premia la cacería: Pokémon, One Piece, Topps NBA y NeeDoh. Y solo pagas cuando te conseguimos una respuesta real. Sin respuesta, sin cargo. Eso está en el sistema, no en un póster.</p>
<h2 ${H2}>¿Quieres la versión completa?</h2>
<p>Cómo funciona todo, de arriba a abajo, está en el libro: <a href="${RM}" target="_blank" rel="noopener">checkitforme.readme.io</a>.</p>`,
  contact: `<p>Dos formas rápidas de hablar con una persona. Toca <b>Ayuda</b> en el pie para abrir el chat, o entra a nuestro <b>Discord</b>. El bot de soporte responde lo común en segundos, a cualquier hora, y una persona atiende el resto.</p>
<p>¿Quieres agregar una tienda? Hazlo en la app. Cuenta, luego Gana, luego <i>Agrega tu tienda</i>. Cuando tu tienda esté disponible, tu próxima verificación va por nuestra cuenta.</p>
<p>No damos soporte por teléfono ni correo a propósito. Con gastos bajos, las verificaciones siguen baratas.</p>`,
  terms: `<p>Al usar <b>Check It For Me</b> (checkitforme.com) aceptas estos términos. Si no, no pasa nada. Solo no lo uses.</p>
<h2 ${H2}>Qué hacemos</h2>
<p>Llamamos a tiendas y preguntamos si algo está en stock, luego te contamos lo que dijeron. Las respuestas son una foto del momento. Las tiendas a veces se equivocan, así que no podemos garantizar que el artículo esté, ni el precio, ni que siga ahí cuando llegues.</p>
<h2 ${H2}>Verificaciones y pagos</h2>
<p>Pagas con verificaciones, en paquetes o incluidas en un plan. Stripe procesa la tarjeta. Una verificación se gasta cuando coloca una llamada. Las que no uses se pueden reembolsar si lo pides. Las gastadas no. Los planes se renuevan hasta que canceles, y puedes cancelar cuando quieras para el siguiente ciclo.</p>
<h2 ${H2}>Quién puede usarlo</h2>
<p>Debes tener al menos 18 años y estar en Estados Unidos. Eres responsable de las verificaciones hechas en tu cuenta.</p>
<h2 ${H2}>Juega limpio</h2>
<p>No nos uses para acosar a una tienda, hacer llamadas sin motivo real, revender el servicio o romper la ley. Podemos pausar cuentas que abusen del servicio o de las tiendas.</p>
<h2 ${H2}>La letra chica</h2>
<p>El servicio se ofrece "tal cual". Hasta donde la ley lo permite, no respondemos por un artículo perdido, una respuesta equivocada o un viaje en vano. Si llegara el caso, nuestra responsabilidad máxima es lo que nos pagaste en los últimos 30 días.</p>
<h2 ${H2}>Cambios</h2>
<p>Podemos actualizar estos términos. Si sigues usando la app, es un sí. ¿Preguntas? Escríbenos en el chat de la app o en Discord.</p>
<p style="margin-top:22px"><a href="/p/privacy" onclick="if(window.openPage){openPage('privacy');return false}">Política de privacidad →</a></p>`,
  privacy: `<p>Esto es lo que <b>Check It For Me</b> (checkitforme.com) recopila, por qué, y qué puedes hacer al respecto. Versión corta: tomamos solo lo necesario para hacer tus verificaciones, lo guardamos solo el tiempo que haga falta, y nunca lo vendemos.</p>
<h2 ${H2}>Qué recopilamos</h2>
<ul>
<li><b>Tu número de celular.</b> Es tu forma de iniciar sesión, y llamamos a tiendas en tu nombre, así que se requiere un número verificado. Sin número, no hay verificaciones.</li>
<li><b>Tus verificaciones.</b> La tienda, el producto, el resultado, y la conversación escrita que te traemos como prueba.</li>
<li><b>Ubicación aproximada.</b> Solo si la permites, para mostrarte tiendas cerca. Di que no y busca por código postal.</li>
<li><b>Datos de pago.</b> Stripe procesa tu tarjeta. Nunca vemos el número completo.</li>
<li><b>Uso básico.</b> Lo justo para que la app funcione, corregir errores y frenar abusos.</li>
</ul>
<h2 ${H2}>Cómo la usamos</h2>
<p>Para colocar tus llamadas, mostrar tu historial, cobrar, mantener el servicio seguro y hacer las respuestas más precisas. Esa es toda la lista.</p>
<h2 ${H2}>Con quién la compartimos</h2>
<p>Solo con los proveedores que hacen funcionar a Check, y solo para que hagan su trabajo. Nuestro proveedor de voz con IA coloca y transcribe las llamadas. Twilio envía tus códigos de acceso y tus textos de alerta, y transporta las llamadas. Stripe procesa los pagos. Manejan tu información bajo sus propios términos, por nosotros. No vendemos tu información personal, y nunca lo haremos.</p>
<h2 ${H2}>Cuánto tiempo la guardamos</h2>
<p>Guardamos tu cuenta, tus verificaciones y sus conversaciones hasta que pidas borrarlas, o hasta que ya no las necesitemos para el servicio. Borra tu cuenta y eliminamos tus datos personales, salvo lo poco que la ley nos obliga a conservar.</p>
<h2 ${H2}>Tus derechos</h2>
<p>Puedes ver tus datos, corregirlos, descargar una copia o borrarlos. Apaga la ubicación cuando quieras en tu navegador. Desactiva los textos y correos de alerta desde tu cuenta. ¿Quieres una copia o un borrado? Escríbenos en el chat de la app o en Discord y lo resolvemos.</p>
<h2 ${H2}>Niños</h2>
<p>Check es para adultos en Estados Unidos. No es para menores de 13 años, y no recopilamos su información a sabiendas.</p>
<p style="margin-top:22px"><a href="/p/terms" onclick="if(window.openPage){openPage('terms');return false}">Términos del servicio &rarr;</a></p>`,
};

export const rootHandler = (c: Context) => {
  c.header("Cache-Control", "no-store, no-cache, must-revalidate");
  const host = (c.req.header("host") || "").toLowerCase();
  const override = c.req.query("brand");
  const brand = resolveBrand(host, override);
  // Admin (caller.*) keeps app.html; every other host is a consumer micro-site (branded by subdomain).
  // On a STAGING preview the bare root defaults to the CONSUMER site (what we're reviewing) instead of
  // the admin app — the staging host resolves to the default brand, which would otherwise show admin.
  // Admin stays reachable on caller.*/admin.* hosts. Prod (STAGING unset) keeps its original logic.
  const consumer = config.staging.on
    ? (!(host.startsWith("caller.") || host.startsWith("admin.")) || !!override)
    : (host.startsWith("runner.") || brand.key !== "runner" || !!override);
  return c.html(consumer ? renderRunner(brand, host, "checkit.html", c.req.query("tone") || "", peekOk(c.req.query("peek"), getCookie(c, "peek")), !!c.req.query("ref")) : withAnalytics(adminUiHtml()));
};

// Freshness marker for the long-lived SPA tab (owner 07-17: his Safari tab ran days-old JS through a
// whole broken-then-fixed cycle because nothing ever told the page it was stale). One value per boot —
// a deploy restarts the service, so a changed rev == a newer build is live. Client checks on tab-return.
export const BOOT_REV = String(Date.now());

export function register(app: Hono) {
  app.get("/s", (c) => {
    c.header("Cache-Control", "public, max-age=30");
    const host = (c.req.header("host") || "").toLowerCase();
    const brand = resolveBrand(host, c.req.query("brand"));
    const q = { store: c.req.query("store") || "", cat: c.req.query("cat") || "", v: c.req.query("v") || "in", k: c.req.query("k") || "", n: c.req.query("n") || "", i: c.req.query("i") || "", st: c.req.query("st") || "", slogo: c.req.query("slogo") || "", lang: c.req.query("lang") || "", al: c.req.header("accept-language") || "" };
    return c.html(renderShare(brand, host, q, peekOk(c.req.query("peek"), getCookie(c, "peek"))));
  });

  // FAQ retired → the book (the one FAQ source of truth; the messenger FAQ tab reads it too).
  // Registered before /p/:slug so it wins.
  app.get("/p/faq", (c) => c.redirect(RM, 301));

  app.get("/p/:slug", async (c) => {
    const slug = c.req.param("slug").toLowerCase();
    if (!(slug in PAGE_TITLES)) return c.notFound();
    c.header("Cache-Control", "public, max-age=120");
    const host = (c.req.header("host") || "").toLowerCase();
    const brand = resolveBrand(host, c.req.query("brand"));
    const pol = await getPolicy();
    const plain = brand.name.replace(/<[^>]+>/g, "");
    const es = (c.req.query("lang") || "").toLowerCase() === "es";
    const title = es ? (PAGE_TITLES_ES[slug] || PAGE_TITLES[slug]) : PAGE_TITLES[slug];
    const body = (es && DEFAULT_PAGES_ES[slug])
      || ((pol.pages as Record<string, string>)[slug] || "").trim()
      || DEFAULT_PAGES[slug]
      || `<p>This page is on the way. Check back soon.</p>`;
    // In-app sheet: the consumer page fetches the content instead of navigating away from the app.
    if (c.req.query("partial")) return c.json({ title, body });
    return c.html(`<!doctype html><html lang="${es ? "es" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(plain)}</title><meta name="robots" content="index,follow">
<style>*{box-sizing:border-box}body{margin:0;background:#0A0A0E;color:#e9e9f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.65}
.wrap{max-width:680px;margin:0 auto;padding:28px 22px 80px}a.home{color:${brand.accent};text-decoration:none;font-weight:800;font-size:15px}
h1{font-size:30px;margin:26px 0 14px}.body{color:#c2c2cf;font-size:16px}.body a{color:${brand.accent}}.muted{color:#7a7a88;font-size:13px;margin-top:40px}</style></head>
<style>.fab{position:fixed;right:18px;bottom:22px;width:58px;height:58px;border-radius:50%;background:${brand.accent};color:#06210f;border:none;display:grid;place-items:center;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.5);z-index:60;text-decoration:none}</style>
<body><div class="wrap"><a class="home" href="/">← ${esc(plain)}</a><h1>${esc(title)}</h1><div class="body">${body}</div>
<div class="muted">© ${new Date().getFullYear()} ${esc(plain)}</div></div>
<a class="fab" href="/" title="Back" aria-label="Back to ${esc(plain)}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M14.5 5L8 12l6.5 7" stroke="#06210f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
</body></html>`);
  });

  app.get("/", rootHandler);

  // Clean admin deep-links (/feedback, /trees, …): one STATIC route per admin section, all serving the same
  // SPA; the client reads location.pathname to pick the section. Static-only on purpose — the earlier
  // :param{regex} attempt crashed Hono's router on boot. These names never collide with /api, /pub, /r, /s, etc.
  for (const s of ["dash","users","restock","growth","calc","plans","retailers","search","add","zones","receipts","results","schedules","feedback","statuses","trees","settings","designer","workflows","testing","fun","gtm"]) app.get("/" + s, rootHandler);

  app.get("/r", (c) => { c.header("Cache-Control", "no-store"); const h=(c.req.header("host") || "").toLowerCase(); return c.html(renderRunner(resolveBrand(h, c.req.query("brand")), h, "checkit.html", c.req.query("tone") || "", peekOk(c.req.query("peek"), getCookie(c, "peek")))); });

  // SANDBOX (owner 07-16): /sheetpeek — standalone slide-up chrome test, touches NOTHING on the real site.
  // v2-look homepage; tap a store → sheet slides up (transform + dim, real mechanics); drag down to close.
  // Implementation under test: the root colour NEVER changes, so the close-drag can never sample a wrong
  // chrome colour. "Bug mode" toggle re-enables the legacy recolor to reproduce the poisoning on demand.
  app.get("/sheetpeek", (c) => {
    c.header("Cache-Control", "no-store");
    return c.html(`<!doctype html><html lang="en" style="background:#1D1D22"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>sheet peek 2</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:160dvh;background:#1D1D22;color:#fff;font-family:-apple-system,system-ui,sans-serif}
header{padding:14px 16px;display:flex;align-items:center;gap:8px}
.logo{font-size:19px;font-weight:900}.logo b{color:#4ADE80}
main{padding:10px 20px 40px;max-width:520px;margin:0 auto}
.hint{font-size:13px;color:#8A8A96;margin:4px 0 14px;line-height:1.5}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}
.t{background:#26262B;border:0;border-radius:18px;color:#fff;padding:9px 13px;font-weight:800;font-size:13px}
.t.on{background:#4ADE80;color:#06210F}
.store{display:flex;align-items:center;gap:12px;background:linear-gradient(180deg,#2D2D34 0%,#27272D 100%);border-radius:14px;box-shadow:0 8px 14px -8px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07);padding:14px;margin-bottom:10px}
.store .ic{width:44px;height:44px;border-radius:12px;background:#1B1B20;display:grid;place-items:center;font-weight:900}
.store .nm{font-weight:800}.store .ad{font-size:12.5px;color:#8A8A96}
/* the moving parts, each independently toggleable */
#dim{position:fixed;inset:0;background:rgba(5,6,9,.66);display:none;z-index:79}
#sheet{position:fixed;left:0;right:0;bottom:0;z-index:80;background:#26262B;border-radius:28px 28px 0 0;display:none;height:86dvh;flex-direction:column;overflow:hidden}
#sheet .grab{touch-action:none;padding:10px 0 4px;flex:0 0 auto}
#sheet .body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 20px 6px} /* NO big bottom padding: the sheet's rows must run UNDER the toolbar so the glass has content to ghost — the old padding left an empty panel strip = the solid slab. A scroll-end spacer keeps the last row reachable. */
#sheet .body::after{content:"";display:block;height:calc(70px + env(safe-area-inset-bottom))}
.mychk{background:linear-gradient(135deg,#2E7D4F,#3E9D63);border-radius:20px;padding:18px;margin-bottom:14px}
.mychk .k{font-size:11px;letter-spacing:2px;font-weight:800;opacity:.85}
.mychk .ph{font-size:28px;font-weight:900;margin-top:6px}
.stats{display:flex;gap:10px;margin-bottom:14px}
.stat{flex:1;background:#1F1F25;border-radius:16px;padding:16px;text-align:center}
.stat b{font-size:22px}
.stat i{display:block;font-style:normal;font-size:11px;letter-spacing:1.5px;color:#8A8A96;margin-top:4px}
.rowc{display:flex;justify-content:space-between;align-items:center;background:#1F1F25;border-radius:14px;padding:16px;margin-bottom:10px;font-weight:700}
.rowc span{color:#8A8A96;font-weight:500;font-size:12.5px;display:block;margin-top:3px}
.runbtn{display:block;width:100%;background:transparent;border:1.5px solid #4ADE80;color:#4ADE80;border-radius:999px;padding:15px;font-weight:900;font-size:14px;letter-spacing:1px;margin:8px 0 20px}
#sheet[style*="display: flex"]{display:flex}
#sheet.frost{background:rgba(38,38,43,.28);backdrop-filter:blur(22px) saturate(1.3);-webkit-backdrop-filter:blur(22px) saturate(1.3)} /* F: frosted-glass sheet — the dimmed page shows THROUGH it, native-style */
#sheet.frost .mychk, #sheet.frost .mychk{background:linear-gradient(135deg,rgba(46,125,79,.75),rgba(62,157,99,.75))}
#sheet.frost .stat,#sheet.frost .rowc{background:rgba(31,31,37,.38)}
/* bright rows on the PAGE so there is something to ghost through the frost */
.brite{background:linear-gradient(90deg,#4ADE80,#A7F3D0);border-radius:14px;color:#06210F;font-weight:900;padding:16px;margin-bottom:10px;text-align:center}
.brite.b2{background:linear-gradient(90deg,#FBBF24,#FDE68A)}
.brite.b3{background:linear-gradient(90deg,#818CF8,#C7D2FE)}
#sheet .handle{width:44px;height:5px;border-radius:3px;background:#3A3A42;margin:0 auto 14px}
body.filterdim main,body.filterdim header{filter:brightness(.45)}
body.frostdim main,body.frostdim header{filter:brightness(.8) saturate(1.05)} /* F: barely dim — the frost does the separating, the page must stay bright enough to ghost through */ /* dim WITHOUT covering: the page itself darkens, keeps scrolling under the glass */
</style></head><body>
<header><span class="logo">Check <b>it</b></span></header>
<main>
<div id="mainwrap">
<div class="hint"><b>Scroll first</b> so the header slides under the clock (that's the translucency). Then tap each test and scroll again — report which letters KEEP it. Tap the letter again to turn it off.</div>
<div class="row">
<button class="t" id="A" onclick="T('A')">A dim overlay</button>
<button class="t" id="B" onclick="T('B')">B sheet only</button>
<button class="t" id="C" onclick="T('C')">C sheet+dim</button>
<button class="t" id="D" onclick="T('D')">D filter dim</button>
<button class="t" id="E" onclick="T('E')">E sheet+filter</button>
<button class="t" id="F" onclick="T('F')">F frosted sheet</button>
<button class="t" id="G" onclick="T('G')">G sheet as page</button>
<button class="t" id="H" onclick="T('H')">H page-layer sheet</button>
</div>
<div class="store"><div class="ic">B&N</div><div><div class="nm">Barnes &amp; Noble Calabasas</div><div class="ad">4735 Commons Way · till 9 PM</div></div></div>
<div class="store"><div class="ic">CVS</div><div><div class="nm">CVS Ventura Blvd</div><div class="ad">22050 Ventura Blvd. · till 11 PM</div></div></div>
<div class="store"><div class="ic">F</div><div><div class="nm">Fun</div><div class="ad">123 Fun Lane, Calabasas, CA</div></div></div>
<div class="brite">IN STOCK at CVS Mulholland</div>
<div class="brite b2">Restock incoming · Sunday</div>
<div class="brite b3">3 zones watched · 39 stores</div>
<div class="brite">CHECK ANOTHER STORE →</div>
<div style="height:40dvh"></div>
<div class="store"><div class="ic">↑</div><div><div class="nm">Scroll runway</div><div class="ad">so the top can slide under the clock</div></div></div>
</div>
<div id="pagemode" style="display:none">
<div class="mychk"><div class="k">MY CHECKS</div><div class="ph">(310) 666-2331</div></div>
<div class="stats"><div class="stat"><b>∞</b><i>CHECKS LEFT</i></div><div class="stat"><b>4</b><i>CHECKS TODAY</i></div></div>
<div class="rowc">Manage plan<span>Unlimited · billed monthly</span></div>
<div class="rowc">Check history<span>31 checks in July</span></div>
<div class="rowc">Alerts<span>Restock and auto check pings.</span></div>
<div class="rowc">Manage Zones<span>Check a whole area in one tap.</span></div>
<div class="rowc">Earn free checks<span>4 ways. Open to everyone.</span></div>
<div class="rowc">Language<span>English</span></div>
<div class="rowc">Sign out<span>See you soon.</span></div>
<button class="runbtn">RUN A CHECK →</button>
<div class="rowc">More rows so it scrolls<span>keep going</span></div>
<div class="rowc">Even more<span>almost there</span></div>
<div class="rowc">Last row<span>tap G again to exit</span></div>
</div>
</main>
<div id="dim" onclick="T(cur)"></div>
<div id="sheet"><div class="grab"><div class="handle"></div></div><div class="body">
<div class="mychk"><div class="k">MY CHECKS</div><div class="ph">(310) 666-2331</div></div>
<div class="stats"><div class="stat"><b>∞</b><i>CHECKS LEFT</i></div><div class="stat"><b>4</b><i>CHECKS TODAY</i></div></div>
<div class="rowc">Manage plan<span>Unlimited · billed monthly</span></div>
<div class="rowc">Check history<span>31 checks in July</span></div>
<div class="rowc">Alerts<span>Restock and auto check pings.</span></div>
<div class="rowc">Manage Zones<span>Check a whole area in one tap.</span></div>
<div class="rowc">Earn free checks<span>4 ways. Open to everyone.</span></div>
<div class="rowc">Language<span>English</span></div>
<div class="rowc">Sign out<span>See you soon.</span></div>
<button class="runbtn">RUN A CHECK →</button>
</div></div>
<script>
var cur='';
function T(k){
  var same=(cur===k); cur=same?'':k;
  ['A','B','C','D','E','F','G','H'].forEach(function(x){document.getElementById(x).classList.toggle('on',x===cur);});
  var dim=document.getElementById('dim'),sheet=document.getElementById('sheet');
  dim.style.display=(cur==='A'||cur==='C')?'block':'none';
  sheet.style.display=(cur==='B'||cur==='C'||cur==='E'||cur==='F'||cur==='H')?'flex':'none';
  // H: same sheet but ABSOLUTE in the document (page paint layer, not UI layer). Background scroll is
  // locked while open (like real sheets), so absolute == fixed visually — but the glass can ghost it.
  if(cur==='H'){
    var top=window.scrollY+window.innerHeight*0.14;
    sheet.style.position='absolute'; sheet.style.top=top+'px'; sheet.style.bottom='auto'; sheet.style.height=(window.innerHeight*0.86+120)+'px';
    document.body.style.overflow='hidden'; document.documentElement.style.overflow='hidden';
  } else {
    sheet.style.position='fixed'; sheet.style.top='auto'; sheet.style.bottom='0'; sheet.style.height='86dvh';
    document.body.style.overflow=''; document.documentElement.style.overflow='';
  }
  sheet.classList.toggle('frost',cur==='F');
  sheet.style.transform='';
  document.body.classList.toggle('filterdim',cur==='D'||cur==='E'||cur==='H');
  document.body.classList.toggle('frostdim',cur==='F');
  // G: same content as a PAGE-STATE — document scroll, so the glass ghosts it top AND bottom.
  var pg=document.getElementById('pagemode');
  pg.style.display=(cur==='G')?'block':'none';
  document.getElementById('mainwrap').style.display=(cur==='G')?'none':'block';
  if(cur==='G') window.scrollTo(0,0);
}
// Drag the sheet down to close (like the real thing) — closing clears the whole test state so the
// owner can check the after-close translucency.
var sheet=document.getElementById('sheet'),grab=sheet.querySelector('.grab'),y0=null;
grab.addEventListener('touchstart',function(e){y0=e.touches[0].clientY;sheet.style.transition='none';},{passive:true});
grab.addEventListener('touchmove',function(e){if(y0==null)return;var d=Math.max(0,e.touches[0].clientY-y0);sheet.style.transform='translateY('+d+'px)';},{passive:true});
grab.addEventListener('touchend',function(e){sheet.style.transition='';var d=(e.changedTouches[0].clientY-(y0||0));y0=null;if(d>90){T(cur);}else{sheet.style.transform='';}});
</script>
</body></html>`);
  });

  // Verticals as PATHS on the apex (checkitforme.com/pokemon, /onepiece, /toppsbasketball, /needoh) —
  // same brand resolution as the subdomains, keyed off the slug. This is what lets the product switcher
  // link to clean same-domain paths instead of subdomain hops.
  for (const slug of ["pokemon", "onepiece", "toppsbasketball", "needoh"]) {
    app.get(`/${slug}`, (c) => {
      c.header("Cache-Control", "no-cache"); // see "/" — bfcache-friendly, still always revalidated
      const host = (c.req.header("host") || "").toLowerCase();
      return c.html(renderRunner(resolveBrand(host, slug), host, "checkit.html", c.req.query("tone") || "", false, !!c.req.query("ref")));
    });
  }

  // Minimal "first-time visitor" preview of the apex homepage — same page; the client (body.peek)
  // strips it down to just the hero + the check card so the owner can eyeball the bare layout.
  app.get("/peek", (c) => {
    c.header("Cache-Control", "no-store");
    const host = (c.req.header("host") || "").toLowerCase();
    return c.html(renderRunner(resolveBrand(host), host, "checkit.html", "", peekOk(c.req.query("peek"), getCookie(c, "peek"))));
  });

  // Branded share cards (1200×630 PNGs) — what X/iMessage/Discord unfurl for every link.
  app.get("/og/:file", (c) => {
    const file = (c.req.param("file") || "").replace(/[^a-z0-9._-]/gi, "");
    try {
      const buf = readFileSync(join(here, `../public/og/${file}`));
      c.header("Cache-Control", "public, max-age=86400");
      return c.body(buf, 200, { "Content-Type": "image/png" });
    } catch { return c.notFound(); }
  });

  // Brand logo images (transparent PNGs served to the per-vertical micro-sites).
  // PWA: service worker (scope "/" — must be served from root) + web app manifest.
  app.get("/sw.js", (c) => {
    try {
      const buf = readFileSync(join(here, "../public/sw.js"));
      c.header("Cache-Control", "no-cache"); // always revalidate the SW so updates roll out
      c.header("Service-Worker-Allowed", "/");
      return c.body(buf, 200, { "Content-Type": "text/javascript; charset=utf-8" });
    } catch { return c.notFound(); }
  });

  app.get("/manifest.webmanifest", (c) => {
    try {
      const buf = readFileSync(join(here, "../public/manifest.webmanifest"));
      c.header("Cache-Control", "public, max-age=3600");
      return c.body(buf, 200, { "Content-Type": "application/manifest+json; charset=utf-8" });
    } catch { return c.notFound(); }
  });

  app.get("/logos/:file", (c) => {
    const file = (c.req.param("file") || "").replace(/[^a-z0-9._-]/gi, "");
    try {
      const buf = readFileSync(join(here, `../public/logos/${file}`));
      const ext = file.split(".").pop()?.toLowerCase();
      const ct = ext === "png" ? "image/png" : ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/jpeg";
      c.header("Cache-Control", "public, max-age=86400");
      return c.body(buf, 200, { "Content-Type": ct });
    } catch { return c.notFound(); }
  });

  // Logo folders (logos-restructure, 07-10): brand/ = Check marks, products/ = the four
  // product-brand logos, pokemon/{eras,sets,banners} = the Pokémon set system (banners = the old
  // set-banners + sets/banners merged). The pre-restructure flat tree (root-level marks, eras/,
  // sets/, set-banners/) and its routes were deleted after the owner's staging sign-off.
  for (const dir of ["brand", "products", "pokemon/eras", "pokemon/sets", "pokemon/banners"]) {
    app.get(`/logos/${dir}/:file`, (c) => {
      const send = (rel: string) => {
        const buf = readFileSync(join(here, `../public/logos/${dir}/${rel}`));
        const ext = rel.split(".").pop()?.toLowerCase();
        const ct = ext === "png" ? "image/png" : ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/jpeg";
        c.header("Cache-Control", "public, max-age=86400");
        return c.body(buf, 200, { "Content-Type": ct });
      };
      const file = (c.req.param("file") || "").replace(/[^a-z0-9._-]/gi, "");
      try { return send(file); }
      catch {
        // banners keep the old set-banners contract: a missing set banner serves the shared
        // Pokémon fallback so a card never shows a broken image; everything else 404s.
        if (dir === "pokemon/banners") { try { return send("_fallback.png"); } catch { return c.notFound(); } }
        return c.notFound();
      }
    });
  }

  // Self-hosted webfonts (Inter variable) — Google Fonts is unreachable for users behind DNS
  // ad-blockers, and the design only reads as the design in Inter. One origin, one file.
  app.get("/fonts/:file", (c) => {
    const file = (c.req.param("file") || "").replace(/[^a-z0-9._-]/gi, "");
    if (!file.endsWith(".woff2")) return c.notFound();
    try {
      const buf = readFileSync(join(here, `../public/fonts/${file}`));
      c.header("Cache-Control", "public, max-age=31536000, immutable");
      return c.body(buf, 200, { "Content-Type": "font/woff2" });
    } catch { return c.notFound(); }
  });

  app.get("/robots.txt", (c) => {
    const host = (c.req.header("host") || "").toLowerCase();
    return c.text(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /app/\nDisallow: /pub/\nSitemap: https://${host}/sitemap.xml\n`);
  });

  app.get("/sitemap.xml", (c) => {
    const host = (c.req.header("host") || "").toLowerCase();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>https://${host}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n</urlset>`;
    return c.body(xml, 200, { "Content-Type": "application/xml" });
  });

  // Temporary shared-password gate (until Clerk signup ships). Empty PUB_PASSWORD = open.
  app.get("/pub/protected", (c) => c.json({ protected: !!process.env.PUB_PASSWORD }));

  app.post("/pub/gate", async (c) => {
    const { password } = await c.req.json().catch(() => ({}));
    return c.json({ ok: !process.env.PUB_PASSWORD || password === process.env.PUB_PASSWORD });
  });

  app.get("/pub/rev", (c) => { c.header("Cache-Control", "no-store"); return c.json({ rev: BOOT_REV }); });
}
