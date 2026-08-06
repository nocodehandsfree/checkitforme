# Website rules — what you must know before you touch the consumer site

Not a description of the screens. **The live site is the record of truth for what things look like**
(owner, 08-05 — the comps drifted). Open the page and match it. This file carries only what looking
at the site cannot tell you: the rules, what happens behind the screen, and what it may ask the
server for. Source: `public/checkit.html` (one file, ~9,500 lines) · `src/server.ts` (public routes) ·
`src/brands.ts` · `src/plans.ts`. Siblings: `ADMIN_RULES.md`, `SYSTEM_MANUAL.md`.

## The rules (all of them — break one and a gate stops you, or the owner does)

1. **`public/checkit.html` is LOCKED.** The consumer site is the GOLDEN BASE, frozen as-is, warts
   included (07-22). The edit gate BLOCKS every change until the owner names a task and that exact
   glob is written into a repo-root `.unlock`; then fix ONLY that scope, verify live, delete
   `.unlock`, re-snapshot the page. Absence of `.unlock` is the permanent default.
2. **Never open the file whole** — it breaks agents. `docs/design/INDEX.md` is a generated section
   index (a gate rebuilds it on every change); find your section there, read ONLY that line range.
   **This file carries no line numbers on purpose** — the ~40 it used to carry were all wrong by
   08-05 after the file grew ~6,900 → 9,475 lines.
3. **Match the live page, not an old drawing.** A comp is the reference ONLY for a screen that does
   not exist yet. Never re-introduce a reverted design.
4. **Every user-facing string ships its Spanish in the SAME commit**, length-checked. No literal
   strings — everything through `t()`. Missed ~23 times, including the primary button.
5. **Copy laws, gated:** no dashes inside a sentence · no orphan-word wraps · bottom notifications are
   ONE gray line in both languages. Words are owned by `docs/design/copy/COPY_STYLE_GUIDE.md`.
6. **Never hand-size a logo.** Since the 07-31/08-01 rebuild ONE place decides logo size;
   `checkitforme.com/logo-wall` is the source of truth and `docs/data/store-logos.md` is the process.
7. **iOS chrome is settled — report a bug, never chase it.** The status-bar tint is baked into the
   served HTML, never set by JS after load, never a `theme-color` meta; the bottom bar uses
   `env(safe-area-*)`. `qa-tint-lock.mjs` fails the suite on a break. Both cost days twice.
8. **A "visual regression" is stale cache until proven otherwise** — hard-refresh, bump the `x-rev`
   meta, reproduce fresh BEFORE touching code.
9. **The map of surfaces is FROZEN.** One consumer site, one Admin. No new route, page, or
   "temporary viewing URL" without the owner naming it first.
10. **Client gating is not security.** `hasFeature()` decides what to SHOW; the server decides what
    happens. Never let a paid capability rest on the client alone.

## Behind the screen (the parts you cannot see by looking)

**One page, no router.** Views are sibling divs toggled with `.hidden` (`#builder` home, `#live`,
`#result`, `#zones`, `#handoff`, `#hobby`, `#success`); overlays stack on top. `boot()` paints the
brand from server-injected data, then hydrates from `/pub/categories`, `/pub/statuses`, `/pub/policy`.
`POLICY` flags switch whole modules off (kiosks, community, referrals, restock alerts, scheduling,
driver hand-off, share cards, hobby, thrift, live listen). Back walks views via `navMark()`/`popstate`.
Deep links: `?call=<cid>`, `?v=history|success`, `?flow=hobby`, `?show=signup|paid|mychecks`,
`?paid=1`, `?ref=`.

**Brands.** Resolved SERVER-side per request (subdomain, apex path, or `?brand=`), which injects
title/OG, hero art, headline, the `BRAND` JSON, and the `--accent` CSS var — so every accent-colored
component recolors for free. Vertical sites lock their category and hide the picker. Four brands:
Pokémon `#FFCB05` · One Piece `#E23636` · Topps NBA `#E4002B` · NeeDoh `#EC4899`.

**A check, tap to verdict.** Gates fire in order: kiosk confirm · not signed in → phone auth (the
check resumes after) · no credits → plans sheet · same store within 24h → confirm. Then
`POST /app/check-live` returns a room; the live view streams transcript over
`wss://<host>/listen?room=` (audio only for owner/comp or the `liveListen` flag) and derives 8
monotonic stages. Finalize polls `/pub/result/:cid` until the verdict is confident.
**No answer = no charge:** only a definitive `completed` verdict charges, and the SERVER decides —
the client never bills itself. Everything else renders "No charge for this one".

**Entitlements** (re-read from `plans.ts` 2026-08-06 — the old list here was wrong). The 8 keys are
`zone_sweeps`, `restock_alerts`, `scheduled_checks`, `any_town`, `thrift_hunts`, `hobby_hunts`,
`store_holds`, `your_voice`. **`exact_products` is NOT one of them** — asking for the exact set and
product became free for every account on 2026-07-15; `premiumAsks` is pinned true and only survives
for old call-gating call-sites. **`store_holds` and `your_voice` are OFF for everyone**, including
comp and the owner — they aren't built. So a paid tier means the other six. PAYG and free get none.
`any_town` unlocks past the 10-mile cap on the 0.5/1/2/5/10 radius ladder (owner, 07-11). Zones and
scheduling are server-enforced; the rest still gate in the UI only.

**Auth is phone + SMS only** (Clerk is gone). Signed JWT in localStorage `cifm_token`, sent as Bearer.
First login grants `policy.pricing.freeChecks` (default 1). Owner phones also mint the admin cookie.
Caller-ID verify makes store calls show the customer's own number (more pickups). Staging uses a fixed
code and sends no text.

## What the site may ask the server for

**Anonymous** GET `/pub/categories · statuses · policy · plans · geocode · finds · pokemon-sets ·
products · stock/store/:id · community · kiosk-receipt/start|poll · bridge/:room · result/:cid ·
live/:cid · store/:id · stores/near · best-bet` · POST `/pub/check-live · charge · feedback ·
translate · watch · waitlist · lead · kiosks/report · community/* · bridge-hangup · store-request` ·
pages `GET /p/:slug?partial=1` · share landing `GET /s`.
**Authed (Bearer)** GET `/app/me · history · referral · schedules · zones* · my-store-requests ·
alerts/me` · POST `/app/check-live · charge · checkout · checkout-intent · schedule · referral/claim ·
alerts/subscribe · zones*` · DELETE `/app/schedules/:id · /app/zones/:id`.
**Auth** POST `/auth/phone/start|known|check` · `/auth/callerid/start` · GET `/auth/callerid/status`.
Shapes: `API_CONTRACT.md`. localStorage: `cifm_token`, `cifm_acct`, `cifm_loc`, `cifm_mode`,
`runnr_lang`, `runnr_history`, `runnr_free_used`, `runnr_device`, `runnr_ref`.
