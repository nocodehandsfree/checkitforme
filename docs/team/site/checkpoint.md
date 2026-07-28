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
- **R6 checkout FEEL:** the sheet still slid up EMPTY, waited on our call, then swapped in the form. Now
  `openCheckout` holds the sheet: Continue goes disabled + "Opening…" (`co.opening`, EN+ES), the element
  is MOUNTED first, THEN the sheet slides up so it lands finished. 2s failsafe opens it anyway; every exit
  path releases the button. Drove it with a stand-in for stripe.js: sheet stays closed on tap, opens at
  ~530ms with the form mounted, button restored; blocked-Stripe opened at 2040ms.
- **R5 checkout SPEED.** MEASURED: js.stripe.com/v3 = 1.06MB, 0.61s (0.41s just TLS); `/app/checkout-intent`
  on staging TEST keys = 3.7s the FIRST time per account (it creates the Stripe customer) then 0.2-0.4s.
  Fix: `preconnect` in the head · `openBuy` warms `loadStripeJs()` while they read plans · the intent and
  the library run TOGETHER · `#co_pay_el` reserves 230px. TRAP FIXED: a failed warm-up used to be cached
  forever and pushed every checkout that session to the hosted page; a failed attempt is now forgotten.
  **js.stripe.com is BLOCKED from the headless browser here** (proved by direct injection), so the real
  Payment Element cannot be rendered or measured. Use a stand-in for `window.Stripe` to test ordering.
- **R4 — tapping a plan jumped to Checkout, FIXED.** Reproduced with `page.touchscreen.tap`, NOT
  `el.click()`: the dock covered the lower rows so the tap hit Continue. Padding never fixes this, rows
  still REST under it. `.buy-foot` now RESERVES the dock's band so the scroller shrinks and nothing
  tappable hides (~150px of list); the under-bar `::after` spacer is off while it is up. Checkout head
  (`.co-head`/`.co-back`/`.co-title`) DELETED. ALWAYS test sheets with REAL touch taps.
- Monthly/Annual = small keys inline with the "You're on the <plan> plan" line; "save 17%" INSIDE the Annual key (a loose floating one was rejected). No overflow at 375/390/430, EN + ES (`plan.save17s`).
- Drove `/r` at 375/390/430, member + not, EN + ES, REAL touch taps: dock down on open, no plan under the
  dock, every tap hits the plan, PAYG clears 64-112px, zero errors. **NOT verified: iOS glass, on-device speed.**

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
  `.cin{overflow:hidden;border-radius:999px}` clipping the shine. NEXT: bisect ON DEVICE, one at a time. In GOTCHAS.
- iOS: Chromium CANNOT catch iOS paint — his phone is the rig; ship one change, "check your phone."
- Copy an existing pattern WHOLE. Half-copying the zones basket (floating box, but up from the start) reproduced the exact mess it was meant to fix.
- 'in_stock' substring-matches 'not_in_stock' — match negatives first/exact. RENDER the comp and read EVERY state before touching a designed head (removed the zone ring once and burned a cycle).

## Open (owner asks + the site queue)
- Alerts sheet formatting · logo fidelity in My Zones + call-log header · copy-doc location reconcile ·
  missing email-confirmation (PROD email likely never re-set post-promote) · Restock SMS → A2P. Frozen-site tasks need the owner-named `.unlock`.
