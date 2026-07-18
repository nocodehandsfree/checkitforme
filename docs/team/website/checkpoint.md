# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).
> Lane: the consumer web app `public/checkit.html` (+ `public/app.html` admin). STAGING-FIRST
> (`staging` → `staging.checkitforme.com`; promote = apply on the `main` prod branch). Clean split with
> the other dev: **he owns the tint CSS** (`__bootTone`/`tone-*`/body wash/sheet chrome), **I own
> view/mode/nav** — don't blind-edit the tint, it's fragile.

## 🔧 07-18 pt2 — share PROOF page rebuilt + referral welcome (LIVE on staging)
- **Share proof page (`/s` renderShare, server.ts):** rebuilt on the elevated skin (page #1D1D22, big
  card #26262B r26, Inter, green CTA ring). Owner's proof+teaser copy in order: brandmark → verdict
  badge → headline → store line (or zone logo row) → what-it-is → hook + green CTA (→ site root) →
  trust. Retired "Real human, real shelf truth." **Bilingual:** sharer's app appends `&lang=`; cold
  recipient falls back to Accept-Language. Zone sweep: `zoneShare` passes in-stock stores' logos
  (server adds `logoUrl` to zone-run results via chainLogoInfo), server tiles them 40px with a 2-letter
  monogram fallback; `i=0` collapses to on-watch copy. **Verified LIVE all 5 states** (in EN/ES, watch,
  zone-with-logos incl. monogram, zone i=0) + og:image on the public host.
- **Referral welcome (checkit.html):** `?ref=` + not-signed-in → gift-framed centered pop-up as the
  first screen; CTA opens signup (where the free check is granted). Shown once on the fresh arrival
  (`REF_FRESH`), gated on `.overlay.on` so it never stacks on a deep-link. ⚠️ **NOT driven headless**
  (proxy blocks staging TLS; local-server recipe too heavy) — built on proven `.overlay`/`.modal` +
  openAuth, typechecks + tests green. Owner sees it in a SIGNED-OUT/private tab only (by design).
- **Copy:** synced stale ES `ref.sharemsg`/`ref.both` from 3 → 1 check. Every new string ships EN+ES.

## 🔧 07-18 — share-card image fix + kiosk map (LIVE on staging, verified server-side)
- **Share unfurl showed no image (owner report).** ROOT CAUSE: behind the staging Cloudflare worker the
  origin Host header is the INTERNAL `voice-caller-staging-production.up.railway.app`, so og:image/og:url/
  canonical were built on a host iMessage/Facebook can't fetch → blank card, slow. Extracted the
  `publicHost()` helper (the fix that already lived inline for og:title) and applied it to EVERY
  bot-fetched URL in renderShare/renderRunner/renderComingSoon (`src/server.ts`). Verified live: og:image
  now `https://staging.checkitforme.com/og/...`, fetches 200 in ~0.65s. ⚠️ prod is NOT behind a
  host-rewriting worker (brand subdomains arrive real), so publicHost only triggers on the railway host.
- **Kiosk map view added.** Map toggle was hard-hidden for kiosk (`!kiosk` on the display line);
  hobby/thrift already had it. Enabled kiosk + gave it a plain-dot legend (tier colours don't apply to
  kiosks). Pins come from LAST_STORES lat/lng like every mode. ⚠️ actual iOS map RENDER = owner's phone.

## 🚨 07-17 HANDOFF — GLASS-H ATTEMPT #2 FAILED ON DEVICE (x-rev glassH-all-r135, LIVE on staging)
**Owner is handing the glass work to the iOS-tint agent directly + opening a FRESH Webbie chat. This
attempt is committed + live on staging (commit 6bb6a9a) but FAILED on his iPhone. Last KNOWN-GOOD
before it = launcher-scope-r134. If the site needs to be clean while they rebuild, revert to r134.**
- **What I did (glassH-all-r135, faithful port of app.html openSheet/_restoreSheetLayout):** a single
  MutationObserver on `.overlay` `.on` toggles → applies variant H: OVERLAY→absolute top=scrollY
  height=innerHeight; MODAL→absolute top=14vh height=86vh+120 (nets the sheet at document-y scrollY+14vh).
  `body.sheetopen{min-height:calc(100dvh+200px)}` (the missing line) + content-filter dim. csheet
  (measure H, absolute, +120 overshoot) and messenger (absolute, top=scrollY, height=innerHeight+120)
  wired explicitly. Every sheet surface → #26262B (acct modal, #zones .zframe, .supwrap).
- **Headless mechanics ALL PASSED** (acct/buy/csheet/messenger: absolute, 14vh at 118px, #26262B,
  scroll-locked, clean restore) — but the GLASS itself only renders on iOS 26 Safari, and it FAILED on
  the owner's device (exact symptom not captured before handoff).
- **PRIME HYPOTHESIS for the tint agent / fresh Webbie:** app.html has NO overlay — its sheet is a LONE
  `body` child (position:absolute, document-relative, tap-close via a document capture-click listener,
  NOT a scrim). I KEPT checkit's `.overlay > .modal` structure (overlay made absolute, modal absolute
  INSIDE it). That extra wrapper is the likeliest reason the glass didn't ghost — Safari may still treat
  the modal as UI-layer because of the overlay ancestor. **Next attempt should FLATTEN checkit's sheets
  to lone body-children like app.html (drop the overlay; document-listener for tap-close), not wrap.**
- Reference: `public/app.html` `openSheet`/`_restoreSheetLayout`/`_ensureSheet` (~line 1437-1509) is the
  owner-approved-on-device implementation — copy that structure, don't reinvent.

## 🔧 07-17 pt3 — sheets, launcher (x-rev launcher-scope-r134)
- **Support launcher scoped (r134):** shows on the HOMEPAGE + SETTLED status page ONLY. Hidden over the
  call sheet (was z82 over the csheet z80 — the reported bug), during a live call, on a pending result
  (shows only with `.invite`), and on hunt/scores/handoff. Denylist added by the existing hide rules.
- **Glass-H attempt #1 (r132) was reverted (r133)** — sat too low (overlay+flex-end anchored the modal at
  14vh+120). Attempt #2 (glassH-all-r135, top section) fixed the geometry but failed on device. History only.
- **Sheet dim = content filter, not cover layers (tint variant E):** dim = brightness(.45) on
  header/main/footer (now via `body.sheetopen`), NOT an rgba cover — a cover kills the scroll-edge glass.
  History+Zones sheets MOVED to body level (r131) — were inside <main>, so the filter's containing block
  anchored them (stuck-at-bottom). ⚠️ keep EVERY position:fixed/absolute overlay a BODY child.
- **All sheet surfaces = #26262B** (glassH-all-r135, per tint spec): acct modal, #zones .zframe, .supwrap.
  Lighter than the page so the top edge reads. (Was briefly #141419 in r133 — owner wanted lighter.)
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
- Kiosk word dropped from the call sheet (ES too).

## 🔧 07-17 — live-call trust fixes (still-true facts)
- Owner's "broken" call = STALE TAB (finished fine server-side; page ran pre-fix JS). Live fixes:
  stale-tab guard (/pub/rev + visibility, reloads on home view only) · scroll-back-to-verdict on settle
  (_livePend) · LOCK test `test-live-view` asserts grow/follow/newest-visible/scroll-back/log-rollup.
- `body.lview` still set/cleared on the live view (transparent header) — bg wash gone; don't re-add without owner.
- iOS black top during owner test checks = in-call UI (his phone joins the call) — NOT a page bug; real users unaffected.

## ⏳ OPEN — needs owner / other lanes
- **GLASS SHEETS — owner handed it to the iOS-tint agent + fresh Webbie (see 🚨 top section).**
  glassH-all-r135 is LIVE on staging but FAILED on device. Prime fix hypothesis: flatten sheets to lone
  body-children like app.html (drop the overlay wrapper). Roll to r134 if the site needs to be clean.
- **Slow result load — flagged to Echo (server-side).** Front-end flips to results + shows transcript
  the moment it detects call-end, then polls for the verdict; a "forever" load = slow call-end signal
  OR slow verdict consensus (both Voice lane). Couldn't trace the owner's call — my deploys wiped the
  in-memory flight recorder (`/api/admin/live-debug`). NEXT: owner runs one call → trace is captured
  fresh → pinpoint which. Don't guess-change finalizeLive polling (risks slowing fast verdicts).
- **Email rendering** (Outlook/Gmail) — other lane actively iterating (one light design now).
- **Restock SMS blocked externally** (A2P denied, toll-free pending) — email alerts live.
- **Service worker PHASE 2** (network-first HTML + offline) — not rebuilt.
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
