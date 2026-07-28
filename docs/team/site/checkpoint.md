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
  `sheetH_on` treats it as a FILL sheet; `.buy-scroll` is the one scroller. `#buyDock` = `position:absolute`
  in the frame, OUTSIDE that scroller (same box as `#zones .zbasket`), so the iOS scroll-edge glass lives.
- `BUY_PICKED` gates the dock like `ZONES.sel` gates the basket: DOWN until you tap. The lift-your-pick
  scroll MUST be a ~140ms timeout, NOT a rAF (a re-render re-places the sheet ~60ms later and wipes it).
  `sheetH_on` honours `data-fillh`: 0.82 Plans, floored 530px PAYG. Dock depth, never a border. `#buy_note`
  lives IN the dock. Feature sheets = centred header + one carved `.fi-pts` well, points LEFT-aligned.
- **07-27 LEGO PASS — `scripts/sheet-recipe-audit.mjs` is the test, it must print 1 recipe.** It opens
  every slide-up and groups them by what they RENDER (anchor · surface · radius · handle · entrance).
  Found FOUR recipes: checkout faded in with the 24px nudge the owner killed on 07-05, the upsell had a
  smaller dimmer handle + no slide + no drag, and My checks/call sheet/p6d each hand-built the grab handle
  (40x5 in three colours) instead of the shared 44x6 rgba(.4). All fixed: 24 sheets, ONE recipe. Run it
  before shipping any new sheet — it says whether the thing snapped on or got rebuilt.
- **07-27 sweep:** alerts sub ran two sentences together (`sentLines()` eats the space and
  `.subln{display:block}` was scoped to `.rsub`, now UNSCOPED). Alert rows stacked (`.alrow`) so long names
  + cities stop clipping; dead duplicate ES `alerts.sub` removed. Edit-email/post-score/feature sheets now
  `sheetPush` + sit in the popstate list. **Autofocus in a sheet SCROLLS the document and strands the sheet
  mid-screen** (email sat 280px off the bottom): all 9 in-sheet focus calls use `preventScroll:true`.
  Owner closed logo-fidelity + the iOS tint. Admin owes Spanish service names: `feature-labels-spanish.md`.
- **Checkout speed/feel.** MEASURED: js.stripe.com/v3 = 1.06MB, 0.61s (0.41s just TLS); the intent call =
  3.7s the FIRST time per account (it creates the Stripe customer) then 0.2-0.4s. `preconnect` in the head ·
  `openBuy` warms `loadStripeJs()` · intent + library fire TOGETHER · a failed warm-up is FORGOTTEN (cached,
  it used to push every checkout that session to the hosted page). `openCheckout` HOLDS the sheet: Continue
  reads "Opening…", the element mounts FIRST, then the sheet slides up already formed; 2s failsafe; every
  exit path releases the button. **js.stripe.com is BLOCKED headless here** — stub `window.Stripe` to test.
- **A plan tap jumped to Checkout, FIXED.** Repro needs `page.touchscreen.tap`, NOT `el.click()`: the dock
  covered the lower rows so the tap hit Continue. Padding never fixes it. `.buy-foot` RESERVES the dock's
  band so the scroller shrinks (~150px of list). ALWAYS test sheets with REAL touch taps.
- Monthly/Annual = small keys inline with the "You're on the <plan> plan" line; "save 17%" INSIDE the Annual key. No overflow at 375/390/430, EN + ES (`plan.save17s`).
- Drove `/r` at 375/390/430, member + not, EN + ES, REAL taps: all green. **NOT verified: on-device feel.**
## 07-23 — alerts sheet, zones back, five site fixes (LIVE on staging + Admin, NOT promoted)
- Alerts: original On/Off pill + "Pause all alerts" bar (a slider redesign was rejected). Zones back → My checks (acctReturn in popstate).
- Plans KEEPERS (don't undo): per-tab header (Plans "Check+ Premium Plans" + mark; PAYG "Pay by the Check", bare brandmark); grid hidden on PAYG; "You're on the <name> plan" only on Plans.
- Five fixes @4f6c4a6: Admin `inStockBanner` gates the `#finds` banner · `product*` flags filter
  `brandSwitcher()` · `openAlerts` back via `sheetPush` (email + score sheets still share that gap) ·
  `zonePollTick` calls `ensureHistCache()` so zone checks reach Activity · `.alrow` stacked for long names.
- 07-21: ONE email-alert path (`watchStore`) + Alerts list, logos, On/Off, master pause, 10 slots; server
  half (`alerts_paused_at`, pause-all, fan-out) is prod-only. **STATE: promote wanted.** Zone report head
  keeps CD's comp RING; status is LEFT-aligned, never the zone name.

## Lessons that stay true
- iOS: Chromium CANNOT catch iOS paint — his phone is the rig; ship one change, "check your phone."
- Copy an existing pattern WHOLE. Half-copying the zones basket (floating box, but up from the start) reproduced the exact mess it was meant to fix.
- 'in_stock' substring-matches 'not_in_stock' — match negatives first/exact. RENDER the comp and read EVERY state before touching a designed head (removed the zone ring once and burned a cycle).

## Open (owner asks + the site queue)
- Alerts sheet formatting · logo fidelity in My Zones + call-log header · copy-doc location reconcile ·
  missing email-confirmation (PROD email likely never re-set post-promote) · Restock SMS → A2P. Frozen-site tasks need the owner-named `.unlock`.
