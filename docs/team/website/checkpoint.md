# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).
> Lane: the consumer web app `public/checkit.html` (+ `public/app.html` admin). STAGING-FIRST
> (`staging` → `staging.checkitforme.com`; promote = apply on the `main` prod branch). Clean split with
> the other dev: **he owns the tint CSS** (`__bootTone`/`tone-*`/body wash/sheet chrome), **I own
> view/mode/nav** — don't blind-edit the tint, it's fragile.

## 🔧 07-17 pt2 — live-call polish + glass dim + DRIVE-FOLLOW (x-rev drivefollow-r130)
- **Drive-follow: OWNER-VERIFIED ON THE ROAD (pill popped, store count adjusted as he drove).** Coarse
  watchPosition (enableHighAccuracy:false = wifi/cell, cheap) replaces the boot+tab-return one-shot;
  follows as you drive, stops when tab hidden (zero bg drain), restarts on return. Rules: permission
  already-granted only (never prompts), manual pin/ZIP wins, >1mi threshold, never mid call/sheet/hunt,
  toast throttled 1/2min. findMe also starts the watch on first grant. (Coverage gaps = DD, not me.)
- **Live call = NO color (owner final):** both bloom attempts cut (green read as in-stock, amber too
  much). Flat dark through the call AND 'Getting the answer'; only the store card's green glow
  (liveGlowV2) lives; verdict tone is the reveal. Killed body.lview bg + rv-pend wash.
- **Step log = moving timeline:** current step 15.5px/800 white, every passed step (incl the 'Calling'
  lead) demotes to 12.5px italic gray; seconds inherit the step's style. 'Reaching a person…' moved
  INSIDE the timeline col under the current step.
- **GLASS DIM (sheetpeek variant E, tint lane's spec):** sheet dims are brightness(.45) on
  header/main/footer via :has, NOT rgba cover layers (a cover layer kills iOS scroll-edge glass).
  ⚠️ filter makes header/main/footer containing blocks — keep position:fixed kids (toast/csheet/overlays)
  as BODY children. Kiosk word dropped from the call sheet (ES too). Bottom strip solid = tint lane's now.

## 🔧 07-17 — live-call trust fixes (still-true facts)
- Owner's "broken" call = STALE TAB (finished fine server-side; page ran pre-fix JS). Live fixes:
  stale-tab guard (/pub/rev + visibility, reloads on home view only) · scroll-back-to-verdict on settle
  (_livePend) · LOCK test `test-live-view` asserts grow/follow/newest-visible/scroll-back/log-rollup.
- `body.lview` still set/cleared on the live view (transparent header) — bg wash gone; don't re-add without owner.
- iOS black top during owner test checks = in-call UI (his phone joins the call) — NOT a page bug; real users unaffected.

## ⏳ OPEN — needs owner / other lanes
- **Slide-up chrome (tint lane):** other dev's attempt 4 is on staging/prod — owner verdict pending.
- **Email rendering** (Outlook/Gmail) — other lane actively iterating (one light design now).
- **Restock SMS blocked externally** (A2P denied, toll-free pending) — email alerts live.
- **Service worker PHASE 2** (network-first HTML + offline) — not rebuilt.
- **og:image URLs ride the internal railway host** — works; public-host constant cleaner (DevOps).
- **Next (owner):** Charlie test calls + check-status page render — boundary in `docs/team/voice/checkpoint.md`.

## 🪤 Traps
Full list in the **`known-problems`** skill + `docs/shared/GOTCHAS.md`. New this session:
- `#auth_logo` is a left-flex wordmark bar — stacked headers must override its container per mode.
- A `fixed`-position `::after` on a TRANSFORMED sheet pins to the sheet, not the viewport (the tint lesson).
- `bootstrap.ts` ALTERs that run BEFORE the CREATE TABLE silently no-op on fresh DBs — ALTER after create.
- The alerts sheet text column is ~240px next to its buttons; sentences must fit it in BOTH languages.
- **Admin writes PROD's DB; the staging site reads STAGING's DB** — an Admin toggle won't show on staging
  until mirrored into staging config.
- headless→staging TLS + local-verify recipe = `docs/shared/GOTCHAS.md` + `scripts/qa-website-drive.mjs`.
