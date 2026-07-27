# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## Verify recipe that works (07-26)
Railway staging env + `DATABASE_URL=file:<scratch>/local.db PORT=88xx npx tsx src/server.ts`. CONSUMER page
= `/r` (`/` on localhost is Admin). Playwright: DEFAULT-import `playwright-core/index.js` (CJS) +
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. `ACCOUNT` is script-scoped, stub with a BARE assignment. No hot-reload. Headless→staging TLS is blocked: drive LOCAL.

## 07-26 — PLANS/checkout sheet REBUILT on the zones architecture (LIVE on staging, NOT promoted)
- `#buyOverlay .modal` = a FIXED frame (flex column + `overflow:hidden`) like `#zones .modal`, so
  `sheetH_on` treats it as a FILL sheet. `.buy-scroll` = the one scroller (mirrors `.zf-scroll`).
- `#buyDock` = `position:absolute` in the frame, OUTSIDE that scroller, same box as `#zones .zbasket`;
  `buySyncDockPad()` pads the list like `zoneSyncBasketPad()`. Nothing sticky on the scroll edge = glass safe.
- **R2:** `BUY_PICKED` gates the dock like `ZONES.sel` gates the basket — DOWN until you tap, then the
  pick is lifted clear. The lift MUST be a ~140ms timeout, NOT a rAF (re-render makes the sheet observer
  re-place ~60ms later, wiping an earlier scroll). PAYG keeps it up (its card IS the pick); `sheetH_on`
  honours `data-fillh` — 0.82 on Plans, floored 530px on PAYG (a bare fraction put the card UNDER the dock
  at 375x667). The dock is bottom-anchored, so only the sheet TOP steps between tabs.
- **R3:** depth makes the dock read as a panel, NEVER a border (STYLE_GUIDE §1): active-key gradient + an
  UPWARD shadow + a scale pop. `#buy_note` moved OUT of the scroll INTO the dock. Feature sheets
  (`openFeatInfo`) = centred header block (`.fi-icon`, `h3`, `.fi-lead`) over ONE carved `.fi-pts` well;
  points stay LEFT-aligned inside it. Their titles are Admin labels, so EN only.
- **Round 4 — FIXED, tapping a plan jumped to Checkout.** Reproduced with `page.touchscreen.tap`, NOT
  `el.click()`: the dock physically covered the lower rows, so the tap hit Continue and bought whatever
  was ringed. Padding never fixes this, rows still REST under the dock. `.buy-foot` now RESERVES the
  dock's band (dock resting top → sheet bottom) so the flex:1 scroller shrinks and nothing tappable hides;
  the under-bar `::after` spacer is suppressed while it is up. Cost: ~150px less visible list when the
  dock is up. Checkout head (`.co-head`/`.co-back`/`.co-title`) DELETED, the handle + swipe already go
  back. ALWAYS test sheets with real touch taps, element clicks cannot see an overlay.
- Monthly/Annual = small keys inline with "You're on the <plan> plan"; "save 17%" INSIDE the Annual key (a loose floating one was rejected). No overflow at 375/390/430, EN + ES (new `plan.save17s`).
- Drove `/r` at 375/390/430 wide, member + not, EN + ES, with REAL touch taps: dock down on open, no visible
  plan under the dock, every plan tap hits the plan, last plan reachable, Continue → checkout on the tapped
  plan, PAYG clears by 64-112px, zero errors. Language switch re-paints title + grid + dock. Dead
  `openPlanSheet`/`dismissPlanSheet`/`planSheetContinue` + the JS that built the lockup, grid, mode keys and
  dock are gone. **NOT verified: iOS glass + how it reads on his phone.**

## 07-23 — alerts sheet, zones back, five site fixes (LIVE on staging + Admin, NOT promoted)
- Alerts sheet: original On/Off pill + "Pause all alerts" bar (a slider redesign was rejected), scroll fix, name wrap. Zones back → My checks (acctReturn in popstate).
- Plans sheet KEEPERS (don't undo): per-tab header (Plans "Check+ Premium Plans" + Check+ mark; PAYG "Pay by the Check" + bare `check-brandmark`); grid hidden on PAYG; "You're on the <name> plan" only on Plans.
- Five fixes @4f6c4a6: Admin `inStockBanner` gates the `#finds` banner · `product*` flags filter
  `brandSwitcher()` · `openAlerts` back via `sheetPush` (email + score sheets still share that gap) ·
  `zonePollTick` calls `ensureHistCache()` so zone checks reach Activity · `.alrow` stacked for long names.
- 07-21: ONE email-alert path (`watchStore`) + Alerts list, logos, On/Off, master pause, 10 slots; server
  half (`alerts_paused_at`, pause-all, fan-out) is prod-only. **STATE: promote wanted.** Zone report head
  keeps CD's comp RING; status is LEFT-aligned, never the zone name.

## Lessons that stay true (+ OPEN BUG)
- **OPEN BUG, thin GREEN LINE on the /s card bottom edge, iPhone only.** Never reproduces headless. Suspect
  `.cin{overflow:hidden;border-radius:999px}` clipping the shine. NEXT: bisect ON DEVICE, one change at a
  time; never alter the approved design. In GOTCHAS.
- iOS: Chromium CANNOT catch iOS paint — his phone is the rig; ship one change, "check your phone."
- Copy an existing pattern WHOLE. Half-copying the zones basket (floating box, but up from the start) reproduced the exact mess it was meant to fix.
- 'in_stock' substring-matches 'not_in_stock' — match negatives first/exact. RENDER the comp and read EVERY state before touching a designed head (removed the zone ring once and burned a cycle).

## Open (owner asks + the site queue)
- Alerts sheet formatting · logo fidelity in My Zones + call-log header · copy-doc location reconcile ·
  missing email-confirmation (PROD email likely never re-set post-promote) · Restock SMS → A2P. Frozen-site tasks need the owner-named `.unlock`.
