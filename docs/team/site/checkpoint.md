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
- **Round 2:** the dock was UP on open and covered the plan rows. `BUY_PICKED` gates it as `ZONES.sel`
  gates the basket: DOWN until you tap, then the tapped row is lifted clear. That lift MUST be a ~140ms
  timeout, NOT a rAF (re-rendering makes the sheet observer re-place ~60ms later, wiping an earlier scroll).
  PAYG keeps the dock up (its card IS the pick) and at the full cap was a tall empty box → `sheetH_on`
  honours `data-fillh`: 0.82 on Plans, floored 530px on PAYG (a bare fraction put the card UNDER the dock
  at 375x667). The dock is bottom-anchored, so only the sheet TOP steps.
- **Round 3 (owner on device):** the dock blended in → depth separates it, NEVER a border (STYLE_GUIDE §1):
  active-key gradient + an UPWARD shadow darkening the row behind its top edge + a scale pop. That made it
  taller and broke the lift, which read the dock's LIVE rect mid slide-up and came up short; it now measures
  the RESTING top via `offsetParent`. `#buy_note` (Secure checkout) moved OUT of the scroll INTO the dock.
  Feature sheets (`openFeatInfo`) = centred header block (`.fi-icon` tile, `h3`, `.fi-lead`) over ONE carved
  `.fi-pts` well; points stay LEFT-aligned inside it. Sheet titles are Admin labels, so EN only.
- **OPEN, owner 07-26 on device, START HERE:** tapping a plan jumped STRAIGHT to Checkout (on Operator),
  skipping the dock. Prime suspect: with the dock already up, its Continue button overlays the lower plan
  rows, so the tap lands on Continue, not the row. Headless never caught it (it clicks the row element).
- Monthly/Annual = small keys inline with "You're on the <plan> plan"; "save 17%" INSIDE the Annual key
  (a loose floating one was rejected). No overflow at 375/390/430, EN + ES (new `plan.save17s`).
- Drove `/r` at 375x667 / 390x844 / 430x932, member + not, EN + ES: dock down on open, tapping the LAST plan
  clears the dock with Continue + the Stripe line on screen, dock never inside the scroller, PAYG clears by
  64-112px, Continue → checkout on the tapped plan, zero errors. Language switch re-paints title + grid +
  dock (it read `/yr` in ES). Dead `openPlanSheet`/`dismissPlanSheet`/`planSheetContinue` + the JS that
  built the lockup, grid, mode keys, dock all gone. **NOT verified: iOS glass + how it reads on his phone.**

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
