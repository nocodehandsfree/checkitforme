# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## Verify recipe that works (07-19)
Local server `PORT=88xx tsx src/server.ts` (needs ELEVENLABS_* + ADMIN_TOKEN env) + Playwright via
`playwright-core` + `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (NODE_PATH to node_modules).
tsx has NO hot-reload — restart after edits. Headless→staging TLS is proxy-blocked: drive LOCAL.

## 07-23 (cont.) — alerts sheet + zones back + PLANS sheet (all LIVE on staging, NOT promoted)
- Alerts sheet: reverted to the original On/Off pill + labeled "Pause all alerts" bar (a slider redesign
  was rejected); kept the sheet scroll fix + name 2-line wrap. Zones back → My checks (acctReturn in popstate).
- Plans sheet (money page): per-tab header (Plans "Check+ Premium Plans" + Check+ mark; PAYG "Pay by the
  Check" + bare `check-brandmark`, no plus); feature grid hidden on PAYG; "You're on the <name> plan" (comp
  = Unlimited, no check) shown ONLY on Plans and only if on a plan; monthly/annual inline right of that line
  with a green "Save 17% yearly" nudge.
- CONTINUE = plain in-flow button (reverted). A sticky/floating dock at the sheet bottom KILLS the iOS
  scroll-edge glass (new GOTCHAS entry). **FOLLOW-UP (fresh chat): build the Continue slide-up the
  zones-basket way: absolute in the OVERLAY, OUTSIDE the scroll container, never a sticky scroll child.**

## 07-23 — the five site fixes SHIPPED (PR #92 @4f6c4a6, LIVE on staging + Admin; owner confirms on phone)
- **In-stock banner toggle:** new Admin policy flag `inStockBanner` gates the `#finds` banner (default ON).
- **Product-type flags:** `productPokemon/OnePiece/Topps/Needoh` filter `brandSwitcher()` (server injects
  via `cachedPolicy()`); client `buildSwitcher` hides `#vsw` when ≤1 product (Pokémon-only = no dropdown).
- **Back button:** `openAlerts` → `sheetPush('alerts')` + `['alertsOv',closeAlerts]` in popstate. Email +
  score sheets share the same gap — left for a named follow-up.
- **Zone checks → Activity:** `zonePollTick` now `ensureHistCache()` per finished store so zone checks
  land in the activity dashboard (server already logged them with zoneRunId).
- **Alerts row cutoff:** `.alrow` stacked layout — name full-width 2-line wrap, On/Off + trash drop
  below so long store names show in full.
- Drove: staging LIVE @4f6c4a6, markers in the truth snapshot; Admin override live; truth re-snapshotted.
  NOT promoted to prod. Owner still to confirm on his phone: banner OFF state, long name, back-collapse, a live zone run.

## Still open in the site queue
- Alerts sheet formatting · logo fidelity in My Zones + call-log header · copy-doc location reconcile.
  Frozen-site tasks need the owner-named `.unlock` per section.

## 07-21 — email alerts + zones report head (LIVE on staging; server half awaits promote)
- ONE email-alert path (`watchStore`) + My Checks → Alerts list (`openAlerts`) with real chain logos,
  On/Off, master pause, 10-slot cap. Server half (`accounts.alerts_paused_at`, pause-all, paused fan-out)
  is prod-only via promote. **STATE: promote wanted — the alerts server half + confirm gate.**
- Zone report head keeps CD's comp RING (removing it once was wrong); status is LEFT-aligned, never the zone name.

## OPEN BUG — thin GREEN LINE, /s card bottom edge, iPhone only (UNRESOLVED)
- Never reproduces headless. Prime suspect: `.cin{overflow:hidden;border-radius:999px}` clipping the
  shine's green on iOS. NEXT: bisect ON DEVICE, one change at a time. Do NOT alter the approved design. Story in GOTCHAS.

## Lessons that stay true
- iOS: Chromium renders CANNOT catch iOS paint — the owner's phone is the rig; ship one change, "check your phone."
- 'in_stock' substring-matches 'not_in_stock' — match negatives first/exact.
- RENDER the comp and read EVERY state before touching a designed head (removed the zone ring once and burned a cycle).

## Open (owner asks)
- Missing email-confirmation (likely owner's PROD email never re-set post-promote — admin TODO).
- Glass sheets rollout (tint discipline) — owner-box only. Restock SMS → A2P (data/ops).
