// White-label brand registry. Each vertical micro-site (PokéFinder, One Piece Finder, …) is one
// entry, resolved from the SUBDOMAIN — so it's domain-agnostic: pokemon.fungibles.com today,
// pokemon.runnr.com later, both resolve to the same brand. Add a vertical = add one entry here.

export interface Brand {
  key: string;            // canonical brand id
  slug: string;           // canonical subdomain label (e.g. "pokemon" → pokemon.fungibles.com)
  name: string;           // display name, may contain <b> for the accent half of the logo
  logo?: string;          // optional custom logo HTML (e.g. an SVG mark + wordmark); falls back to emoji+name
  category: string | null;// the category LABEL this site is for (must match categories.label) — null = all
  accent: string;         // hex accent color (logo, hero highlight, CTA)
  accent2?: string;       // secondary brand color (links, kiosk accents) — distinct per vertical
  logoUrl?: string;       // optional hosted official logo image (overrides the drawn mark)
  logoScale?: number;     // hero logo size multiplier (1 = default) — normalizes wide vs square logos
  emoji: string;          // logo/OG emoji
  short: string;          // short label for the product switcher (e.g. "Pokémon")
  art?: string;           // hero product illustration (inline SVG, transparent — pops on dark)
  headline: string;       // hero H1 (HTML; use <span class="g"> for the accent word)
  sub: string;            // hero subline
  title: string;          // <title> + og:title
  desc: string;           // meta description + og:description
}

// Reusable product-box illustration (transparent, no white plate) — lid + window + accent emblem.
const box = (accent: string, emblem: string) =>
  `<svg viewBox="0 0 120 122" width="104" height="106" aria-hidden="true">`
  + `<rect x="30" y="34" width="60" height="76" rx="7" fill="#16161f" stroke="${accent}" stroke-width="2.5"/>`
  + `<rect x="25" y="22" width="70" height="20" rx="6" fill="#1f1f2b" stroke="${accent}" stroke-width="2.5"/>`
  + `<rect x="40" y="52" width="40" height="46" rx="4" fill="#0A0A0E" stroke="${accent}" stroke-opacity=".35"/>`
  + emblem + `</svg>`;

const POKEBALL_EMBLEM =
  `<circle cx="60" cy="74" r="13" fill="#fff" stroke="#0C0C12" stroke-width="3"/>`
  + `<path d="M60 61a13 13 0 0 1 13 13H47a13 13 0 0 1 13-13z" fill="#EE1515"/>`
  + `<rect x="47" y="72.5" width="26" height="3" fill="#0C0C12"/>`
  + `<circle cx="60" cy="74" r="4.6" fill="#fff" stroke="#0C0C12" stroke-width="3"/>`;

const DEFAULT: Brand = {
  key: "runner", slug: "app",
  name: "Check It For <b>Me</b>",
  category: null,
  accent: "#4ADE80",
  accent2: "#A78BFA",
  emoji: "📞",
  short: "All products",
  headline: 'Is it <span class="g">in stock?</span><br>We\'ll check for you.',
  sub: "Pick a store. We call it for real, ask, and show you the answer with proof — in about 2 minutes.",
  title: "Check It For Me — Is it in stock? We call the store and find out.",
  desc: "Stop driving to sold-out shelves. Check It For Me calls any store for you, asks a real person if it's in stock, and texts you the answer with proof in ~2 minutes.",
};

const BRANDS: Brand[] = [
  DEFAULT,
  {
    key: "poke", slug: "pokemon",
    name: "Poké<b>Check</b>",
    logo: `<span style="display:inline-flex;align-items:center;gap:9px">`
      + `<svg width="23" height="23" viewBox="0 0 100 100" style="flex:0 0 auto" aria-hidden="true">`
      + `<circle cx="50" cy="50" r="45" fill="#fff" stroke="#0C0C12" stroke-width="7"/>`
      + `<path d="M50 5a45 45 0 0 1 45 45H5A45 45 0 0 1 50 5z" fill="#EE1515"/>`
      + `<rect x="5" y="46" width="90" height="8" fill="#0C0C12"/>`
      + `<circle cx="50" cy="50" r="15" fill="#fff" stroke="#0C0C12" stroke-width="7"/>`
      + `</svg>Poké<b>Check</b></span>`,
    category: "Pokémon",
    accent: "#FFCB05",
    accent2: "#EE1515",
    emoji: "⚡",
    short: "Pokémon",
    art: `<svg viewBox="0 0 120 120" width="92" height="92" aria-hidden="true">`
      + `<circle cx="60" cy="60" r="46" fill="#fff" stroke="#0C0C12" stroke-width="5"/>`
      + `<path d="M60 14a46 46 0 0 1 46 46H14A46 46 0 0 1 60 14z" fill="#EE1515"/>`
      + `<rect x="14" y="55" width="92" height="10" fill="#0C0C12"/>`
      + `<circle cx="60" cy="60" r="16" fill="#fff" stroke="#0C0C12" stroke-width="5"/>`
      + `<circle cx="60" cy="60" r="7" fill="#fff" stroke="#0C0C12" stroke-width="3"/></svg>`,
    headline: 'Pokémon <span class="g">in stock?</span><br>We\'ll check for you.',
    sub: "Pick your store. We call it for real, ask if the Pokémon is in, and show you the answer with proof — before you drive out.",
    title: "PokéFinder — Find Pokémon cards in stock near you, today",
    desc: "Find Pokémon cards in stock near you. PokéFinder calls local stores for real, asks if the latest sets are on the shelf, and texts you the answer with proof in ~2 minutes. Never chase a sold-out drop again.",
  },
  {
    key: "onepiece", slug: "onepiece",
    name: "OnePiece<b>Check</b>",
    category: "One Piece TCG",
    accent: "#E23636",
    accent2: "#F59E0B",
    logoUrl: "/logos/onepiece.png",
    emoji: "🏴‍☠️",
    short: "One Piece",
    art: `<svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true"><ellipse cx="60" cy="74" rx="50" ry="16" fill="#fff"/><path d="M27 71c0-21 13-37 33-37s33 16 33 37" fill="#fff"/><path d="M28.5 62h63" stroke="#E23636" stroke-width="12"/><ellipse cx="60" cy="74" rx="50" ry="16" fill="none" stroke="#E23636" stroke-width="3"/></svg>`,
    headline: 'One Piece cards <span class="g">in stock?</span><br>We\'ll check for you.',
    sub: "Pick your store. We call it for real, ask if the One Piece TCG is in, and show you the answer with proof — before you make the trip.",
    title: "OnePieceFinder — Find One Piece TCG in stock near you, today",
    desc: "Find One Piece TCG in stock near you. We call local stores for real, ask if the latest sets are on the shelf, and show you the answer with proof in ~2 minutes.",
  },
  {
    key: "topps", slug: "toppsbasketball",
    name: "Topps<b>Check</b>",
    category: "Topps NBA",
    accent: "#E4002B",
    accent2: "#FF5277",
    logoUrl: "/logos/topps.png",
    logoScale: 0.62,
    emoji: "🏀",
    short: "Topps NBA",
    art: `<svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true"><path d="M60 14l11 22 24 3.5-17.5 17 4 24L60 67.5 38.5 80.5l4-24L25 39.5l24-3.5z" fill="#E4002B"/><path d="M60 14l11 22 24 3.5-17.5 17 4 24L60 67.5 38.5 80.5l4-24L25 39.5l24-3.5z" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
    headline: 'Topps NBA cards <span class="g">in stock?</span><br>We\'ll check for you.',
    sub: "Pick your store. We call it for real, ask if the Topps basketball is in, and show you the answer with proof — before you head out.",
    title: "HoopsFinder — Find Topps NBA cards in stock near you, today",
    desc: "Find Topps NBA basketball cards in stock near you. We call local stores for real, ask if the latest sets are on the shelf, and show you the answer with proof in ~2 minutes.",
  },
  {
    key: "needoh", slug: "needoh",
    name: "NeeDoh<b>Check</b>",
    category: "NeeDoh",
    accent: "#EC4899",
    accent2: "#F97316",
    logoUrl: "/logos/needoh.png?v=2",
    logoScale: 1.5,
    emoji: "🟢",
    short: "NeeDoh",
    art: `<svg viewBox="0 0 120 122" width="100" height="102" aria-hidden="true"><path d="M60 16c24 0 40 16 42 38 2 21-11 40-31 47-20 7-44-1-52-21C11 60 17 35 39 24c7-4 14-8 21-8z" fill="#EC4899"/><path d="M42 70c8 7 28 7 36 0" stroke="#F97316" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="46" cy="52" r="5" fill="#F97316"/><circle cx="74" cy="52" r="5" fill="#F97316"/></svg>`,
    headline: 'NeeDoh <span class="g">in stock?</span><br>We\'ll check for you.',
    sub: "Pick your store. We call it for real, ask if the NeeDoh is in, and show you the answer with proof — before you make the trip.",
    title: "NeeDohFinder — Find NeeDoh in stock near you, today",
    desc: "Find NeeDoh stress balls in stock near you. We call local stores for real, ask what's on the shelf, and show you the answer with proof in ~2 minutes.",
  },
];

const ALIASES: Record<string, string> = {
  pokemon: "poke", poke: "poke", pokefinder: "poke", pokerestock: "poke", pokemonfinder: "poke",
  onepiece: "onepiece", onepiecefinder: "onepiece", op: "onepiece", onepeice: "onepiece", onepeicefinder: "onepiece",
  topps: "topps", toppsbasketball: "topps", toppsnba: "topps", hoops: "topps", hoopsfinder: "topps", nba: "topps", basketball: "topps",
  needoh: "needoh", needohfinder: "needoh", needo: "needoh",
};

/** Pull the leading subdomain label, ignoring www. */
function subdomain(host: string): string {
  const h = (host || "").split(":")[0].toLowerCase();
  const parts = h.split(".");
  let sub = parts[0] || "";
  if (sub === "www" && parts[1]) sub = parts[1];
  return sub;
}

/** Resolve a brand from host (or an explicit ?brand= override for previewing before DNS exists). */
export function resolveBrand(host: string, override?: string): Brand {
  const key = (override || subdomain(host)).toLowerCase();
  const canonical = ALIASES[key] || key;
  return BRANDS.find((b) => b.key === canonical) || DEFAULT;
}

export function allBrandKeys(): string[] { return BRANDS.map((b) => b.key); }

/** Resolve a brand from a URL PATH segment (e.g. "/pokemon" → poke), for single-domain path routing
 *  (checkitforme.com/pokemon instead of pokemon.checkitforme.com). Returns null for non-brand paths. */
export function brandForPath(slug: string): Brand | null {
  const k = (slug || "").toLowerCase();
  const canonical = ALIASES[k] || k;
  const b = BRANDS.find((x) => x.key === canonical || x.slug === k);
  return b && b.key !== "runner" ? b : null;
}

/** Verticals for the top-of-page product switcher (the default "all" site isn't a vertical). */
export function brandSwitcher(): Array<{ key: string; slug: string; label: string; emoji: string; logoUrl: string; tag?: string }> {
  // tag: when the logo already spells the brand, show the logo + just the missing qualifier
  // (Topps logo says "Topps" → tag "NBA" → reads "Topps NBA" without doubling the word).
  const TAG: Record<string, string> = { topps: "NBA" };
  return BRANDS.filter((b) => b.key !== "runner").map((b) => ({ key: b.key, slug: b.slug, label: b.short, emoji: b.emoji, logoUrl: b.logoUrl || "", ...(TAG[b.key] ? { tag: TAG[b.key] } : {}) }));
}
