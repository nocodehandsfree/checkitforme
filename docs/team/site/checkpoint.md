# SITE — checkpoint (current state)

> System: the consumer web app `public/checkit.html` + consumer routes in `src/server.ts`,
> design implementation, and ALL copy. Charter + standing rules: `handoff.md` (same folder).
> Volatile — REPLACE stale lines, newest on top, ≤60 lines. History lives in git.

## Verify recipe that works (07-26)
Railway staging env + `DATABASE_URL=file:<scratch>/local.db PORT=88xx npx tsx src/server.ts`. CONSUMER page
= `/r` (`/` on localhost is Admin). Playwright: DEFAULT-import `playwright-core/index.js` (CJS) +
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. `ACCOUNT` is script-scoped, stub with a BARE assignment. No hot-reload. Headless→staging TLS is blocked: drive LOCAL.

## 07-30 — traced the store-picker "seconds" line, TWO tasks written, NOTHING built
- **`site-reach-menu-time.md` (blocked on mapper).** Measured live: all 42 chain numbers customers can see
  are `source:backfill` ("inherited from the chain row, no per-call evidence"), 18 of them routes the map
  itself flagged `hammer-route`; 51 more say "picks up directly" on the same non-evidence. And
  `avgTreeSeconds` is time to a PERSON, so it carries the department ringing and the hold — which the
  owner will not promise. Fix = map-only, per STORE then chain, measured to the HANDOFF (median
  `transferAtSec`, else last step `atSec`). Copy + the three states are locked in the task file.
- **Held it on purpose.** With zero proven routes the only test data is invented, so it cannot be
  demonstrated. I built it, he said he had not asked, I reverted to a clean tree. Plan first, then build.
- **`site-check-status-loud-retry.md` (ready, owner-named).** On no-answer / busy / left-on-hold the note
  says "No charge. Try again" and the only button is `backToBuilder()` = a DIFFERENT store. Retry the same
  store, say the check was not spent at hero level, respect the `too_soon` cooldown, closed gets no retry.

## 07-26/27 — PLANS/checkout sheet REBUILT on the zones architecture (PROMOTED 07-27)
- `#buyOverlay .modal` = a FIXED frame (flex column + `overflow:hidden`) like `#zones .modal`, so
  `sheetH_on` treats it as a FILL sheet; `.buy-scroll` is the one scroller. `#buyDock` = `position:absolute`
  in the frame, OUTSIDE that scroller (same box as `#zones .zbasket`), so the iOS scroll-edge glass lives.
- `BUY_PICKED` gates the dock like `ZONES.sel` gates the basket: DOWN until you tap. The lift-your-pick
  scroll MUST be a ~140ms timeout, NOT a rAF (a re-render re-places the sheet ~60ms later and wipes it).
  `sheetH_on` honours `data-fillh`: 0.82 Plans, floored 530px PAYG. Dock depth, never a border.
- **`scripts/sheet-recipe-audit.mjs` must print 1 recipe.** It groups every slide-up by what it RENDERS
  (anchor · surface · radius · handle · entrance). Found FOUR; fixed to ONE across 24.
- **A plan tap jumped to Checkout, FIXED.** Repro needs `page.touchscreen.tap`, NOT `el.click()`: the dock
  covered the lower rows. `.buy-foot` RESERVES the dock's band so the scroller shrinks. Padding never fixes it.
- **Checkout speed.** js.stripe.com/v3 = 1.06MB/0.61s; the intent call = 3.7s the FIRST time per account
  then 0.2-0.4s. `openBuy` warms the library · intent + library fire TOGETHER · `openCheckout` HOLDS the
  sheet ("Opening…") until formed. **js.stripe.com is BLOCKED headless** — stub `window.Stripe` to test.
- **Autofocus in a sheet SCROLLS the document and strands the sheet mid-screen.** All 9 focus calls use
  `preventScroll:true`. `.subln{display:block}` is UNSCOPED now (was eating sentence breaks everywhere).
- Plans KEEPERS: per-tab header · grid hidden on PAYG · "You're on the <name> plan" only on Plans ·
  alerts On/Off pill + "Pause all alerts" bar (a slider redesign was rejected).

## 07-28 — ADMIN sheet glass FIXED (LIVE @2ca41b5). Full story: `docs/tasks/admin-glass-nudge.md`.
- **Cause: a closed `.sheet` never left the bottom edge** (position:fixed, bottom:0, just translated off).
  A fixed element there sits in the UI layer iOS never ghosts. Admin now hides its sheet on close, like
  the site's `.overlay{display:none}`. `pokeChrome` was also never called AND was re-stamping the root
  colour (the poison). `.sh-body` spacer 70→240px. `qa-admin-glass.mjs` 10→19 checks.

## Lessons that stay true
- iOS: Chromium CANNOT catch iOS paint — his phone is the rig; ship one change, "check your phone."
- Copy an existing pattern WHOLE. Half-copying the zones basket reproduced the exact mess it fixed.
- A bug that SURVIVES closing the sheet is leftover STATE. Diff the page before/after, do not theorise.
- **A number on a customer's screen needs a WRITER you can name.** `avgTreeSeconds` had six, one an LLM.
- 'in_stock' substring-matches 'not_in_stock' — match negatives first/exact. RENDER the comp, read EVERY state.

## Open (owner asks + the site queue)
- `site-check-status-loud-retry.md` is the next site build · `site-reach-menu-time.md` waits on mapper ·
  copy-doc location reconcile · missing email-confirmation (PROD email likely never re-set post-promote) ·
  Restock SMS → A2P. Frozen-site tasks need the owner-named `.unlock`.
