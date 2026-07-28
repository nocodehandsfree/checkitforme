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
- **07-27 LEGO PASS — `scripts/sheet-recipe-audit.mjs` must print 1 recipe.** It opens every slide-up and
  groups them by what they RENDER (anchor · surface · radius · handle · entrance). Found FOUR; fixed to
  ONE across 24 sheets. Run it before shipping any new sheet: it says whether it snapped on or got rebuilt.
- **07-27 sweep:** alerts sub ran two sentences together (`.subln{display:block}` was scoped to `.rsub`,
  now UNSCOPED). Alert rows stacked (`.alrow`). **Autofocus in a sheet SCROLLS the document and strands
  the sheet mid-screen** (email sat 280px off the bottom): all 9 focus calls use `preventScroll:true`.
  Edit-email/post-score/feature sheets now `sheetPush` + sit in the popstate list.
- **Checkout speed/feel.** MEASURED: js.stripe.com/v3 = 1.06MB, 0.61s; the intent call = 3.7s the FIRST
  time per account (creates the Stripe customer) then 0.2-0.4s. `preconnect` · `openBuy` warms
  `loadStripeJs()` · intent + library fire TOGETHER · a failed warm-up is FORGOTTEN. `openCheckout` HOLDS
  the sheet: Continue reads "Opening…", element mounts FIRST, then it slides up formed; 2s failsafe.
  **js.stripe.com is BLOCKED headless here** — stub `window.Stripe` to test ordering.
- **A plan tap jumped to Checkout, FIXED.** Repro needs `page.touchscreen.tap`, NOT `el.click()`: the dock
  covered the lower rows so the tap hit Continue. Padding never fixes it. `.buy-foot` RESERVES the dock's
  band so the scroller shrinks (~150px of list). ALWAYS test sheets with REAL touch taps.
- Monthly/Annual = small keys inline with the "You're on the <plan> plan" line; "save 17%" INSIDE the Annual key. No overflow at 375/390/430, EN + ES (`plan.save17s`).
- Drove `/r` at 375/390/430, member + not, EN + ES, REAL taps: all green. **NOT verified: on-device feel.**
## 07-23 — alerts sheet, zones back, five site fixes (LIVE on staging + Admin, NOT promoted)
- Alerts KEEPER: original On/Off pill + "Pause all alerts" bar (a slider redesign was rejected).
- Plans KEEPERS (don't undo): per-tab header (Plans "Check+ Premium Plans" + mark; PAYG "Pay by the
  Check", bare brandmark); grid hidden on PAYG; "You're on the <name> plan" only on Plans.
- Five fixes @4f6c4a6 (banner flag · product flags · alerts back button · zone checks reach Activity ·
  `.alrow` long names). 07-21 email alerts: server half is prod-only, **promote wanted**.

## 07-28 — ADMIN sheet glass FIXED (LIVE @2ca41b5). Full story: `docs/tasks/admin-glass-nudge.md`.
- **Cause: a closed `.sheet` never left the bottom edge** (position:fixed, bottom:0, just translated off).
  A fixed element there sits in the UI layer iOS never ghosts. Site does `.overlay{display:none}`; Admin
  now hides its sheet on close. Also fixed on the way: `pokeChrome` was never called AND was re-stamping
  the root colour (the poison); `.sh-body` spacer 70→240px so last rows clear the toolbar.
- **The move that found it: snapshot the whole page before open vs after close and DIFF it.** One thing
  differed. Two ships were wasted theorising about the glass first. `qa-admin-glass.mjs` 10→19 checks.

## Lessons that stay true
- iOS: Chromium CANNOT catch iOS paint — his phone is the rig; ship one change, "check your phone."
- Copy an existing pattern WHOLE. Half-copying the zones basket reproduced the exact mess it fixed.
- A bug that SURVIVES closing the sheet is leftover STATE. Diff the page before/after, do not theorise.
- 'in_stock' substring-matches 'not_in_stock' — match negatives first/exact. RENDER the comp and read EVERY state before touching a designed head (removed the zone ring once and burned a cycle).

## Open (owner asks + the site queue)
- Alerts sheet formatting · logo fidelity in My Zones + call-log header · copy-doc location reconcile ·
  missing email-confirmation (PROD email likely never re-set post-promote) · Restock SMS → A2P. Frozen-site tasks need the owner-named `.unlock`.
