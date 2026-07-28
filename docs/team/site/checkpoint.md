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
- **07-27 sweep (LIVE on staging):** alerts sub ran two sentences together because `sentLines()` eats the
  space and `.subln{display:block}` was scoped to `.rsub` — UNSCOPED it. Alert rows stacked (`.alrow`,
  controls drop to their own line) so long names + cities stop clipping; dead duplicate ES `alerts.sub`
  key removed. Edit-email / post-score / feature sheets now `sheetPush` + are in the popstate list, so
  back closes them. **Autofocus in a sheet SCROLLS the document and strands the sheet mid-screen** (the
  email sheet sat 280px off the bottom edge): all 9 in-sheet focus calls now use `preventScroll:true`.
  Owner closed logo-fidelity + the iOS bottom tint himself. LEFT: feature-sheet titles are Admin labels,
  so EN only — needs a Spanish label field in Admin (flagged, not built).
- **Checkout speed/feel (R5+R6).** MEASURED: js.stripe.com/v3 = 1.06MB, 0.61s (0.41s just TLS);
  `/app/checkout-intent` = 3.7s the FIRST time per account (it creates the Stripe customer) then 0.2-0.4s.
  `preconnect` in the head · `openBuy` warms `loadStripeJs()` · intent + library fire TOGETHER · a failed
  warm-up is FORGOTTEN (it used to be cached and pushed every checkout that session to the hosted page).
  `openCheckout` holds the sheet: Continue reads "Opening…" (`co.opening`), the element mounts FIRST, then
  the sheet slides up already formed; 2s failsafe; every exit path releases the button.
  **js.stripe.com is BLOCKED from the headless browser here** — stub `window.Stripe` to test ordering.
- **R4 — a plan tap jumped to Checkout, FIXED.** Repro needs `page.touchscreen.tap`, NOT `el.click()`:
  the dock covered the lower rows so the tap hit Continue. Padding never fixes it, rows still REST under
  it. `.buy-foot` RESERVES the dock's band so the scroller shrinks (~150px of list) and the under-bar
  `::after` spacer is off while up. Checkout head DELETED. ALWAYS test sheets with REAL touch taps.
- Monthly/Annual = small keys inline with the "You're on the <plan> plan" line; "save 17%" INSIDE the Annual key (a loose floating one was rejected). No overflow at 375/390/430, EN + ES (`plan.save17s`).
- Drove `/r` at 375/390/430, member + not, EN + ES, REAL taps: dock down on open, no plan under it, every
  tap hits the plan, PAYG clears 64-112px, zero errors. **NOT verified: on-device speed + feel.**

## 07-23 — alerts sheet, zones back, five site fixes (LIVE on staging + Admin, NOT promoted)
- Alerts sheet: original On/Off pill + "Pause all alerts" bar (a slider redesign was rejected), scroll fix, name wrap. Zones back → My checks (acctReturn in popstate).
- Plans sheet KEEPERS (don't undo): per-tab header (Plans "Check+ Premium Plans" + Check+ mark; PAYG "Pay by the Check" + bare `check-brandmark`); grid hidden on PAYG; "You're on the <name> plan" only on Plans.
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
