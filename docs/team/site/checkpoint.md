# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## Verify recipe that works (07-19)
Local server `PORT=88xx tsx src/server.ts` (needs ELEVENLABS_* + ADMIN_TOKEN env) + Playwright via
`playwright-core` + `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (NODE_PATH to node_modules).
tsx has NO hot-reload — restart after edits. Headless→staging TLS is proxy-blocked: drive LOCAL.

## 07-26 — PLANS/checkout sheet REBUILT on the zones architecture (LIVE on staging, NOT promoted)
- `#buyOverlay .modal` is now a FIXED frame (flex column + `overflow:hidden` + 88dvh) exactly like
  `#zones .modal`, so `sheetH_on` reads it as a FILL sheet and opens it at the cap. Measured 930px on
  Plans AND on Pay as you go (390x844) — the tab switch no longer resizes or drops the sheet.
- `.buy-scroll` = the one scroller (mirrors `.zf-scroll`). `#buyDock` = `position:absolute` in the frame,
  OUTSIDE that scroller, same box as `#zones .zbasket`; `buySyncDockPad()` pads the list by the dock's
  measured height like `zoneSyncBasketPad()`. Nothing sticky sits on the bottom scroll edge → glass safe.
- Monthly/Annual = small keys inline with "You're on the <plan> plan"; "save 17%" rides INSIDE the Annual
  key (a loose floating one was rejected before). No overflow at 375/390/430, EN + ES (new `plan.save17s`).
- Drove it local (`/r`, iPhone viewports): dock repaints per tap (Collector→Operator), last plan clears
  the dock by 74px, Continue on screen in every state, Continue → checkout "Operator · annual $497.90",
  zero page errors. Language switch now re-paints title + grid + dock (the dock read `/yr` in Spanish).
- Dead `openPlanSheet`/`dismissPlanSheet`/`planSheetContinue` gone + the JS that built the lockup, grid,
  mode keys and dock (markup now). **NOT verified: iOS glass + how it reads on the owner's phone.**

## 07-23 (cont.) — alerts sheet + zones back + PLANS sheet (all LIVE on staging, NOT promoted)
- Alerts sheet: reverted to the original On/Off pill + labeled "Pause all alerts" bar (a slider redesign
  was rejected); kept the sheet scroll fix + name 2-line wrap. Zones back → My checks (acctReturn in popstate).
- Plans sheet KEEPERS (still live, don't undo): per-tab header (Plans "Check+ Premium Plans" + Check+ mark;
  PAYG "Pay by the Check" + bare `check-brandmark`, no plus); feature grid hidden on PAYG; "You're on the
  <name> plan" (comp = Unlimited) only on Plans and only if on a plan. Rest superseded by 07-26 above.

## 07-23 — the five site fixes SHIPPED (PR #92 @4f6c4a6, LIVE on staging + Admin, NOT promoted)
- Admin `inStockBanner` flag gates the `#finds` banner · `productPokemon/OnePiece/Topps/Needoh` filter
  `brandSwitcher()` (`buildSwitcher` hides `#vsw` when ≤1 product) · `openAlerts` back button via
  `sheetPush('alerts')` (email + score sheets still share that gap) · `zonePollTick` calls
  `ensureHistCache()` so zone checks land in Activity · `.alrow` stacked so long store names show in full.
- Owner still to confirm on his phone: banner OFF state, long name, back-collapse, a live zone run.

## 07-21 — email alerts + zones report head (LIVE on staging; server half awaits promote)
- ONE email-alert path (`watchStore`) + My Checks → Alerts list (`openAlerts`), real chain logos, On/Off,
  master pause, 10-slot cap. Server half (`accounts.alerts_paused_at`, pause-all, paused fan-out) is
  prod-only. **STATE: promote wanted, the alerts server half + confirm gate.** Zone report head keeps
  CD's comp RING (removing it once was wrong); status is LEFT-aligned, never the zone name.

## OPEN BUG — thin GREEN LINE, /s card bottom edge, iPhone only (UNRESOLVED)
- Never reproduces headless. Suspect `.cin{overflow:hidden;border-radius:999px}` clipping the shine's
  green on iOS. NEXT: bisect ON DEVICE, one change at a time. Never alter the approved design. In GOTCHAS.

## Lessons that stay true
- iOS: Chromium renders CANNOT catch iOS paint — the owner's phone is the rig; ship one change, "check your phone."
- 'in_stock' substring-matches 'not_in_stock' — match negatives first/exact.
- RENDER the comp and read EVERY state before touching a designed head (removed the zone ring once and burned a cycle).

## Open (owner asks + the site queue)
- Alerts sheet formatting · logo fidelity in My Zones + call-log header · copy-doc location reconcile.
  Frozen-site tasks need the owner-named `.unlock` per section.
- Missing email-confirmation (likely owner's PROD email never re-set post-promote, admin TODO).
- Glass sheets rollout (tint discipline) is owner-box only. Restock SMS → A2P (data/ops).
