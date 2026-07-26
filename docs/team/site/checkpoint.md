# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## Verify recipe that works (07-26)
Railway staging env + `DATABASE_URL=file:<scratch>/local.db PORT=88xx npx tsx src/server.ts`. CONSUMER
page = `/r` (`/` on localhost is Admin). Playwright: DEFAULT-import `playwright-core/index.js` (CJS) +
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. `ACCOUNT` is script-scoped, stub with a BARE
assignment. No hot-reload. Headless→staging TLS is blocked: drive LOCAL.

## 07-26 — PLANS/checkout sheet REBUILT on the zones architecture (LIVE on staging, NOT promoted)
- `#buyOverlay .modal` = a FIXED frame (flex column + `overflow:hidden`) like `#zones .modal`, so
  `sheetH_on` treats it as a FILL sheet. `.buy-scroll` = the one scroller (mirrors `.zf-scroll`).
- `#buyDock` = `position:absolute` in the frame, OUTSIDE that scroller, same box as `#zones .zbasket`;
  `buySyncDockPad()` pads the list like `zoneSyncBasketPad()`. Nothing sticky on the scroll edge = glass safe.
- **Round 2 (owner on device):** the dock was UP on open and covered the plan rows. `BUY_PICKED` now gates
  it as `ZONES.sel` gates the basket: DOWN until you tap a plan, then the tapped row is lifted clear. That
  lift MUST be a ~140ms timeout, NOT a rAF: re-rendering the list makes the sheet observer re-place the
  sheet ~60ms later, wiping a scroll started before that. PAYG keeps the dock up (its card IS the pick)
  and at the full cap was a tall empty box → `sheetH_on` honours `data-fillh` on a fill sheet; 0.82 on
  Plans, floored 530px on PAYG (a bare fraction put the card UNDER the dock at 375x667); the dock is
  bottom-anchored, so only the sheet TOP steps.
- Monthly/Annual = small keys inline with "You're on the <plan> plan"; "save 17%" rides INSIDE the Annual
  key (a loose floating one was rejected before). No overflow at 375/390/430, EN + ES (new `plan.save17s`).
- Drove `/r` at 375x667 / 390x844 / 430x932, member + not, EN + ES: dock down on open, tapping the LAST
  plan clears the dock with Continue on screen, dock never inside the scroller, PAYG clears by 64-112px,
  Continue → checkout on the tapped plan, zero errors. Language switch re-paints title + grid + dock (it
  read `/yr` in ES). Dead `openPlanSheet`/`dismissPlanSheet`/`planSheetContinue` + the JS that built the
  lockup, grid, mode keys, dock all gone. **NOT verified: iOS glass + how it reads on his phone.**

## 07-23 — alerts sheet, zones back, five site fixes (LIVE on staging + Admin, NOT promoted)
- Alerts sheet: original On/Off pill + "Pause all alerts" bar (a slider redesign was rejected), scroll fix, name wrap. Zones back → My checks (acctReturn in popstate).
- Plans sheet KEEPERS (don't undo): per-tab header (Plans "Check+ Premium Plans" + Check+ mark; PAYG "Pay
  by the Check" + bare `check-brandmark`); grid hidden on PAYG; "You're on the <name> plan" only on Plans.
- Admin `inStockBanner` flag gates the `#finds` banner · `productPokemon/OnePiece/Topps/Needoh` filter
  `brandSwitcher()` (`buildSwitcher` hides `#vsw` when ≤1 product) · `openAlerts` back button via
  `sheetPush('alerts')` (email + score sheets still share that gap) · `zonePollTick` calls
  `ensureHistCache()` so zone checks land in Activity · `.alrow` stacked so long names show in full.
- Owner still to confirm on his phone: banner OFF state, long name, back-collapse, a live zone run.

## 07-21 — email alerts + zones report head (LIVE on staging; server half awaits promote)
- ONE email-alert path (`watchStore`) + Alerts list (`openAlerts`), logos, On/Off, master pause, 10 slots.
  Server half (`accounts.alerts_paused_at`, pause-all, fan-out) is prod-only. **STATE: promote wanted.**
  Zone report head keeps CD's comp RING; status is LEFT-aligned, never the zone name.

## Lessons that stay true (+ OPEN BUG)
- **OPEN BUG, thin GREEN LINE on the /s card bottom edge, iPhone only.** Never reproduces headless.
  Suspect `.cin{overflow:hidden;border-radius:999px}` clipping the shine. NEXT: bisect ON DEVICE, one
  change at a time; never alter the approved design. In GOTCHAS.
- iOS: Chromium CANNOT catch iOS paint — his phone is the rig; ship one change, "check your phone."
- Copy an existing pattern WHOLE. Half-copying the zones basket (floating box, but up from the start) reproduced the exact mess it was meant to fix.
- 'in_stock' substring-matches 'not_in_stock' — match negatives first/exact. RENDER the comp and read
  EVERY state before touching a designed head (removed the zone ring once and burned a cycle).

## Open (owner asks + the site queue)
- Alerts sheet formatting · logo fidelity in My Zones + call-log header · copy-doc location reconcile ·
  missing email-confirmation (PROD email likely never re-set post-promote) · Restock SMS → A2P.
  Frozen-site tasks need the owner-named `.unlock`. Glass sheets rollout is owner-box only.
