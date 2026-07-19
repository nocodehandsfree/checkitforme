# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).
> Lane: consumer web app `public/checkit.html` + consumer routes in `src/server.ts`. STAGING-FIRST
> (`staging` → `staging.checkitforme.com`; promote = apply on `main`). Clean split with the other dev:
> **he owns the tint CSS** (`__bootTone`/`tone-*`/body wash/sheet chrome), **I own view/mode/nav**.

## 🔧 07-19 — SHARE/LANDING (/s renderShare) rebuilt to the approved in-stock comp (LIVE on staging)
Owner drove this in a long, painful session. Where it landed:
- **In-stock share landing = APPROVED + live.** Built element-for-element from the P6 in-stock comp
  (`docs/design/comps/WEBSITE_COMPS.dc.html`). The box: 1px rgba border, r40, green wash
  `linear-gradient(180deg,#266440 0%,#20202A 46%)`, **bleeding check watermark top-right** (`.cwmwrap`
  overflow-clip + `.cwm`). Inside: small green **IN STOCK** pill (glow dot) · **headline in the
  product's own brand color** (`brand.accent` — Pokémon yellow, One Piece red) · **`@ Store Name`**
  white/bold, right-aligned to the end of the headline (`.title` inline-block + text-align:right) ·
  subhead · **green ring-capsule CTA** (call-page "check another store" style: `.cta` gradient ring +
  `.cin` + `.shine` ckShine + arrow) reading **YOUR TURN** · **First one's on us!** gray. Bilingual
  (EN+ES same commit). `<style>` fenced in `/*CP*/…/*CPEND*/` so qa-design holds it to the token set.
- **Copy is placeholder-approved** — owner supplied it live. Use "Check AI" (two words) per copy guide.
- `/s` cache lowered to `max-age=30` (browser was serving stale versions and masking fixes).
- **Verify recipe that works:** boot a local server (`PORT=88xx tsx src/server.ts`, needs ELEVENLABS_*
  + ADMIN_TOKEN env), then Playwright screenshot via `playwright-core` +
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (run node with `NODE_PATH=…/node_modules`).
  Script lives in scratchpad `shot.cjs`. **tsx has no hot-reload — restart the server after edits.**

## 🚨 07-19 OPEN BUG — thin GREEN LINE on the /s card's BOTTOM EDGE, iPhone only (UNRESOLVED)
- Owner sees a thin green line hugging the card's bottom edge on his iPhone. **It has NEVER reproduced
  in headless Chromium** — every screenshot shows a clean bottom. Classic iOS-paint blind spot.
- Owner's key clue: **the line predates the brandmark, the border, and the wash** — so none of those
  are it (I wasted ~7 tries "fixing" each; all wrong). Only element green-and-near-the-bottom in every
  version is the **CTA button** (green glow in v1 → green ring + light-green `.shine` clipped by
  `.cin{overflow:hidden;border-radius:999px}` since). **Prime suspect: `.cin` overflow+radius clip
  leaking the shine's green on iOS.** Full write-up in `docs/shared/GOTCHAS.md`.
- **NEXT PERSON: bisect on a real iPhone.** Try (a) drop `.shine`, (b) drop `.cin` overflow:hidden,
  (c) swap the ring for a flat border — one at a time, on-device. **Do NOT change the owner-approved
  design (brandmark position, border, wash) to chase it** — that was my mistake and it enraged him.

## ⚠️ 07-19 — what NOT to build / lessons
- **A "not in stock" share landing has NO use case** — nobody shares a sold-out result, so it never
  becomes a landing page. I built it anyway; it was rejected. Don't.
- The share page's whole job: a friend shares an in-stock WIN, the recipient lands and converts
  (first check free). Build only pages that fit a real share.
- **Session ended raw.** Owner is out of patience with this lane for now. The approved in-stock design
  was RESTORED at his request (bleeding brandmark + border). He'll name the next page when ready —
  candidates he floated: the **zone-sweep share** (`k=zone`, "Check called N stores, here are the hits")
  and the **brand landing**. **Do not guess which; wait for his one line.**

## 🪤 Traps (still true)
- Full list in the **`known-problems`** skill + `docs/shared/GOTCHAS.md`.
- **iOS Safari renders a gradient fading to a TRANSPARENT color as a faint tint of that color** (green
  haze) that Chromium shows as fully clear — never fade to `rgba(r,g,b,0)`; fade between opaque colors.
- **`overflow:hidden` + `border-radius` on iOS can leak a 1px line of the clipped content's color at an
  edge** — suspect for the open green-line bug.
- A colors/fonts diff + a Chromium render CANNOT catch an iOS paint issue. Owner's phone is the rig.
- `#auth_logo` is a left-flex wordmark bar — stacked headers must override its container per mode.
- headless→staging TLS blocked by the proxy; verify with a LOCAL server + Playwright, not against staging.

## ⏳ Older open (other lanes / paused)
- Glass sheets (iOS 26) — long ago handed to the tint agent; not this session.
- Slow result load flagged to Echo (server-side); Email rendering (other lane); Restock SMS blocked (A2P).
