# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git commits).
> Lane: the consumer web app `public/checkit.html` (+ `public/app.html` admin). STAGING-FIRST:
> branch `staging` → `staging.checkitforme.com`. Prod = branch
> `main` (`checkitforme.com`); promote = apply the change on the prod branch.
> Clean split with the other dev: **he owns the tint CSS** (`__bootTone`/`tone-*`/the body wash), **I own
> view/mode/nav**. Don't blind-edit the tint — it's fragile.

## ✅ DONE on staging — public/logos restructure + cleanup (07-10, owner OK'd the logo wall)
- **Final tree:** logos/brand/ (Check marks) · logos/products/ (pokemon onepiece topps needoh) ·
  logos/pokemon/{eras,sets,banners} · logos/chains/ (untouched, DB-referenced). Old flat tree +
  legacy routes DELETED (cleanup commit 38bd0c5, after restructure 6c13b1e). Zero fungibles-named
  files in public/. pokemon/banners keeps missing→_fallback.png. /logos/:file root route kept.
- **Fun store:** renders chains/fun.png; STAGING chain row (id 120) repointed ✓. PATCH /api/chains/:id
  now accepts logoUrl/logoWide/logoDark.
- **Verified post-cleanup on staging 38bd0c5:** new URLs 200, old URLs 404 at origin (a few still 200
  from Cloudflare edge cache, max-age 86400 → self-expires), /pub/pokemon-sets emits /logos/pokemon/…,
  logo-wall + sets wall + 4 homepages + retail/kiosk/thrift lists = zero broken images (screenshots in chat).
- **⏭ AT PROMOTE TIME (the only leftovers):** 1) repoint PROD Fungibles row (id 120) → logoUrl
  "/logos/chains/fun.png?v=1" via PATCH /api/chains/120 right after prod deploys (until then it serves
  the R2 fungibles URL — fine). 2) R2 bucket still hosts chain-logos/fungibles.png — outside public/,
  out of scope, harmless. NOTE: staging today also carries others' batches (docs shuffle, PostHog,
  Helicone routing, backup-restore) — promote takes all of it unless DevOps splits.

## 🔴 CROSS-LANE: live-call AUDIO lost on Delta-lane stores (owner 14:40, Franklin's Ace call)
- **DevOps/Addie: need audio on D-lane live checks.** f61bed2 routes live checks on lane:delta stores
  through the tapedeck engine; its listen room streams TRANSCRIPT lines only (src/calls/tapedeck.ts:57)
  — no Twilio media into the room, so the browser "listen live" is silent. The Charlie path bridges
  audio via Twilio <Connect><Stream> (src/voice/bridge.ts); Delta needs the same media fork or its EL
  conversation audio relayed. Not touched from this lane — the pipe is yours.

## ✅ 14:40 owner batch (this deploy)
- Live rail no longer runs past the current step ("Reaching a person…" moved out of the rail row) ·
  verdict sub = one sentence per line (nlSent, rsub only) · sold-out copy → "{store} had it. It's gone
  for now." (seed + one-time DB migration, owner edits untouched) · /pub/result now returns ts and the
  status page falls back to the local call-start clock, so date+time shows on FRESH calls too ·
  call sheet shows DD's reach field ("About {n} seconds to reach a human" / "This store picks up
  directly", EN+ES) · Cash App label: CONFIRMED in Stripe docs the element's method labels are not
  customizable — only options are dropping the Cash App method or a custom-built method picker.

## ✅ 03:14 owner batch — SHIPPED + verified (commit 7da6019)
- **TINT fully restored** (my mistake: removing the baked tone for items 24-25 broke the tint lane's
  iOS nav/status-bar work). Server bakes tone-* again (verified live: html class="tone-in" served).
  Items 24-25 (no color pre-load) now CONFLICT with the tint design — needs owner + tint-dev ruling.
- Verified on staging: Sign out = plain link top right · empty store list breaks per sentence EN+ES ·
  Activity ago labels real ("2h ago"/"1d ago"; was ms-vs-seconds → everything said "just now") ·
  '¡Muéstranos el botín!' + chips re-render on language flip. Shipped, not yet driven: zone-card logos,
  styled zone menus/confirm (needs entitled account), all-closed check-all block, swipe-close on the
  3 new sheets, old-history logo/location heal, Stripe 11px tab labels.
- "Back from Too far → homepage": could NOT reproduce (result→back lands on the check in tests both
  before and after). Watch for it on the owner's account flow (came from calendar?).

## ✅ SHIPPED to staging — site-wide polish contract 07-10 (items 6-73, commit 7a9c7c1 + follow-up)
- Contract lives in chat (owner list + shots in docs/specs/ui-polish/shots). Fixed: ES layout breaks
  (tabs/count/footer) + footer pages hand-translated (?lang=es) + Legal collapse (guide 5.14) · pill LAW
  (gray/white/one-line, EN+ES, variants retired) · kiosk = same big-button flow, ① labels gone · Sign out
  top-right of sheet · add-store/watch/auto-check = bottom sheets · plans default = your tier/featured,
  Continue buys the ringed one · tone pre-paint fully retired (server bake + boot script + rebake reload;
  the reload was ALSO the calendar/deep-link delay) · call date/time on verdict · share = one up-arrow far
  right, even glow, footer hugs content · unclear copy breaks before "Read" · zones: fresh list after save,
  auto-search (Go gone), carved list well, cal chip hidden · back button: views push entries, sheets close
  on back, zones in the stack · map pin/ZIP = MANUAL_LOC, GPS recheck can't snap back (regression) ·
  Topps → "NBA Cards" (test updated) · 🏃💨 → 📦 · "No answer = no charge" period gone.
- VERIFIED on staging (screenshots in chat): EN+ES homepages, kiosk tab, footers, ES terms sheet, gray
  pill, add-store sheet, Topps page. NIGHT RUN (throwaway account via STAGING_LOGIN_CODE): verdict page
  (date/time line, one up-arrow share, even glow, tight footer), unclear copy breaks before "Read",
  back button result→builder, Sign out top-right, plans ring on featured tier, checkout sheet carries the
  ringed plan. Night fixes shipped: upgrade capsule said $NaN/mo (tierPrice fed cents) + replayed calls
  keep ts. STILL NOT verified: zone SAVE round-trip (needs entitlement; the on-page Stripe element hung
  at "Loading secure payment…" for the test account so no test-card sub — worth a look), history/calendar
  SPEED on a loaded account, live-call flows, PWA self-heal.
- ANSWERS (checkout, items 30-34): the "$5 back when you pay by bank" banner, the Success/Blocked/
  Disputed/Bank/Down icons, and the dead bank search are all INSIDE Stripe's payment iframe. Staging runs
  Stripe TEST mode: those icons ARE the test-mode fake banks, and bank search is dead because there are
  only six fake banks to search. The $5-back is Stripe's own promo (they fund it) for paying by bank;
  Stripe decides who sees it — no config toggle I could find (unverified beyond docs skim). "Cash App Pay"
  is Stripe's official method name inside the iframe — not renamable; I shrank tab labels so it stops
  crushing the last tab. On LIVE mode real banks appear and search works.
- PWA (43-45): the home-screen app was rendering the RETIRED service worker's cache. The self-destruct
  worker + page-load unregister + no-store HTML are all live; opening the installed app once online
  self-heals it (or delete + re-add). No further code fix exists on our side.
- Guide notes for CD/Copper: add-store/watch/auto-check are now SHEETS (owner order — 5.11 says popups);
  footer runs Scores·About·FAQ·Contact·Legal (5.14 to-do done); "No answer = no charge" lost its period
  (copy-guide spine shows one); toast law = gray only (5.4's green/accent pills retired).

## ✅ Just shipped to STAGING (07-09, awaiting owner verify → then promote to prod)
- **Unmapped-store "coming soon"** (`callReady:false`): greyed row + "Coming soon" chip; tap → toast
  "Adding store soon!"; hard-blocked from dialing via a guard in `pickStore` (covers map path too).
- **Call sheet copy:** hobby-locked = "We'll check on pricing and availability for {set} {product}";
  removed "· costs 1 check" (only button that had it) + the green "Pick the exact set or product" link.
- **Open-first store sort** in hobby/thrift (modes that show closed stores): known-open float to top, then
  nearest. Retail unchanged (it hides closed).
- **Closed-store tap toast:** neutral (not green) + "The store is closed." (dropped "No charge" — nothing
  was attempted).
- **Map "Pinch to zoom, tap to drop a pin" pill:** neutral dark (was green) + forced one line (`.oneline`
  nowrap; v2 toast style allows wrapping otherwise).
- **Grey footer line KILLED:** was `html[data-skin=v2] body::after` — a fixed 2px `#1D1D22` bar pinned to
  the viewport bottom (a dead iOS-toolbar-pin hack that showed as a line on tinted pages). Removed. Footer
  bg also set transparent. ⚠️ if the iOS bottom toolbar ever tints on a colored result page, that's the
  tint-dev's edge-pinning, not this bar.
- **"Loading your check" screen:** bigger (24px/800 Inter) + animated 3-dot loader **inline-styled** (was a
  white block because `.loaddots` class didn't apply at the early deep-link paint). Font already preloaded.

## ✅ Shipped 07-08 (staging + PROD)
- Reload/hobby-bleed fix: killed the `cifm_mode=hobby` auto-restore (Retail is home base every reload) +
  gated `body.huntmode #hobby{display:block}` with `:not(.hidden)` so history/calendar/result can hide it.
- Hobby product icons accent-tinted (yellow) via `hobbyIcon()`.
- Footer © = **one centered line** "© <year> High Science LLC" (`#footYear` dynamic).

## ⏳ OPEN — needs owner / other lanes
- **Promote the 07-09 staging batch to prod** once owner signs off (apply on `...OcyMS` branch, isolated).
- **B&N auto-check "can't cancel":** cancel UI exists at **My checks → Overview → "Your auto-checks"**
  (`renderAcctScheds`, red Cancel → `cancelSchedule` → DELETE `/app/schedules/:id`). Couldn't repro without
  owner's account — asked WHERE he's trying (calendar? banner?). If it's not listed there, real bug to chase.
- **❗Email template renders as PLAIN TEXT in owner's inbox — UNRESOLVED.** Design's template never showed;
  even the "send test" lands as plain text. Reproduce what HE receives (Outlook mobile), confirm
  `renderBrandedEmail` is on the test path, check Brevo image hosting, consider a real Brevo-hosted
  `brevoTemplateId`. (Email must be TABLE HTML + inline styles — flexbox/grid never render in mail.)
- **Service worker PHASE 2 (NOT DONE):** currently retired (`sw.js` self-destruct stub + unregister on load).
  Owner wants it back as network-first-HTML (fresh online + offline fallback + instant takeover). Don't
  reintroduce the old 1.2s stale-serve race.
- **Prod launch flags (NOT DONE):** set `flags.hobby=false` + `flags.thrift=false` on prod so only
  Retail+Kiosk are live at launch; flip on later.
- **Restock SMS — blocked externally:** Twilio A2P 10DLC denied; toll-free not approved. Email alerts (Brevo)
  are live and need no A2P. Re-ask owner: temporarily route restock as email, or pursue toll-free?
- **DevOps still owes Zones endpoints** (`/app/zones/*` per `docs/archive/manage-zones-SHIPPED.md`); consumer
  UI already calls them. Also: `/p/privacy` pulls a 404 resource; prod June-calls calendar nav (check after promote).

## 🪤 Traps (don't rediscover)
- **Brevo env var = `BREVO_API_KEY`** (not BRAVO/ESP). `espEmail` gates on `config.alerts.brevoApiKey`.
- **v2 toast wraps** (`white-space:normal`); use `.oneline` for single-line hints. Default toast is GREEN —
  pass `'neutral'` for status/errors.
- **`.loaddots` / class-based CSS can miss the early deep-link boot paint** — inline-style anything rendered
  in the `sp.get('call')` boot block.
- **Connect-on-human VAD:** direct-dial chains must carry `avgTreeSeconds=null`; VAD gate ~22 frames on
  direct dials (fix in `src/voice/bridge.ts`). "hi Bob" staff-name = in the WORKFLOW, not code.
- **Skin toggle is DEAD** — `data-skin=v2` unconditional; the redesign is THE render. No preview gate.
- Backgrounded `npx tsx` gets SIGTERM (exit 144); run `run_in_background:true`, kill in a separate command.

> Migration note: repo moving to `nocodehandsfree/checkitforme` (branches staging + main). Only what's
> committed survives — chat memory does not.
