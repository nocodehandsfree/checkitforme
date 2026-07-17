# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).
> Lane: the consumer web app `public/checkit.html` (+ `public/app.html` admin). STAGING-FIRST
> (`staging` → `staging.checkitforme.com`; promote = apply on the `main` prod branch). Clean split with
> the other dev: **he owns the tint CSS** (`__bootTone`/`tone-*`/body wash/sheet chrome), **I own
> view/mode/nav** — don't blind-edit the tint, it's fragile.

## 🔧 07-17 pt3 — sheets, launcher, glass-H REVERTED (x-rev launcher-scope-r134)
- **Support launcher scoped (r134):** shows on the HOMEPAGE + SETTLED status page ONLY. Hidden over the
  call sheet (was z82 over the csheet z80 — the reported bug), during a live call, on a pending result
  (shows only with `.invite`), and on hunt/scores/handoff. Denylist added by the existing hide rules.
- **Glass sheet variant H = REVERTED + PARKED (owner rejected).** I applied the tint agent's variant H
  to the ACCOUNT sheet (absolute overlay, top=scrollY, height=innerHeight+120, scroll-lock) — owner
  said it sat too low + flashed a solid slab on slide-down. Fully reverted (r133): account sheet back
  to fixed/high, exactly as before. **Do NOT re-attempt glass-H without the owner's NEW tint solution**
  — he's comparing my attempt vs Addie's Admin (app.html) version with the iOS-tint agent and will
  hand me the final recipe. The /sheetpeek variant H reference + tint checkpoint 07-17c stand.
- **Sheet dim = content filter, not cover layers (r129, tint variant E):** `.overlay`/`.csheet-bd`
  transparent; dim = brightness(.45) on header/main/footer via :has. ALL inactive full-screen layers
  display:none (incl the supwrap messenger). History+Zones sheets MOVED to body level (r131) — they
  were inside <main>, so the filter's containing block anchored them (stuck-at-bottom). ⚠️ keep every
  position:fixed/absolute overlay a BODY child, never inside a filtered ancestor.
- **Account sheet surface darkened** to #141419 (was #1D1D22 = page color, top edge blended). Owner may
  want it LIGHTER instead (his ref buy sheet #26262B is lighter than the page) — one-line flip if so.
- **Alerts empty state** = a card with small italic muted text (was reading as the section subhead).

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
- (glass dim mechanic now lives in pt3 above.) Kiosk word dropped from the call sheet (ES too).

## 🔧 07-17 — live-call trust fixes (still-true facts)
- Owner's "broken" call = STALE TAB (finished fine server-side; page ran pre-fix JS). Live fixes:
  stale-tab guard (/pub/rev + visibility, reloads on home view only) · scroll-back-to-verdict on settle
  (_livePend) · LOCK test `test-live-view` asserts grow/follow/newest-visible/scroll-back/log-rollup.
- `body.lview` still set/cleared on the live view (transparent header) — bg wash gone; don't re-add without owner.
- iOS black top during owner test checks = in-call UI (his phone joins the call) — NOT a page bug; real users unaffected.

## ⏳ OPEN — needs owner / other lanes
- **GLASS SHEETS — waiting on owner's FINAL tint recipe.** My variant-H attempt was rejected + reverted;
  owner is reconciling my approach vs Addie's Admin version with the iOS-tint agent. He'll hand me the
  recipe. Until then: sheets stay fixed, dim = content filter. Do NOT freelance the sheet chrome.
- **Slow result load — flagged to Echo (server-side).** Front-end flips to results + shows transcript
  the moment it detects call-end, then polls for the verdict; a "forever" load = slow call-end signal
  OR slow verdict consensus (both Voice lane). Couldn't trace the owner's call — my deploys wiped the
  in-memory flight recorder (`/api/admin/live-debug`). NEXT: owner runs one call → trace is captured
  fresh → pinpoint which. Don't guess-change finalizeLive polling (risks slowing fast verdicts).
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
