# Check - Website — CHECKPOINT (current state)

> **Volatile — update at every "Checkpoint".** Newest on top, bullets, prune finished (history = git).
> Lane: the consumer web app `public/checkit.html` (+ `public/app.html` admin). STAGING-FIRST
> (`staging` → `staging.checkitforme.com`; promote = apply on the `main` prod branch). Clean split with
> the other dev: **he owns the tint CSS** (`__bootTone`/`tone-*`/body wash/sheet chrome), **I own
> view/mode/nav** — don't blind-edit the tint, it's fragile (see the hard lesson below).

## 🔧 07-17 — live-call page rebuilt trust (x-rev livebloom-r124, all driven in sim + owner test call OK)
- Owner's "broken" call = STALE TAB (his 17:35 call finished fine server-side; page ran pre-fix JS).
  Fixes: stale-tab guard (/pub/rev + visibility check, reloads on home view only) · scroll-back-to-
  verdict restored (the pending-flip was swallowing it — _livePend flag) · LOCK test now phone-size and
  asserts grow/follow/newest-visible/scroll-back/log-rollup. Owner ran a test call: works.
- LIVE BLOOM shipped (CD direction): body.lview = verdict-bloom geometry in #266440 + transparent
  header while the call runs; verdict bloom replaces it at showResult. Gotcha: the neutral flattener
  (~line 304, five :not()s deep) outranks everything — needed :not(.lview). Root colour untouched.
- Location follow now re-fires on visibilitychange→visible (3-min throttle) — boot-only recheck died
  when iOS restored the tab (owner drove home, saw Westlake stores).
- iOS black top during owner test checks = in-call UI (his phone joins the call) — NOT a page bug;
  regular users unaffected (CD checkpoint agrees). Don't chase it.

## 🔧 07-16 EVENING pt2 — result page: support tab replaces the Tell-us link (driven live, PASS)
- "Something wrong with this check? Tell us" link REMOVED (its ES string too). On a SETTLED result the
  bottom-right support tab slides out (supSlideIn) + breathes the check button's green glow
  (supInviteGlow, rCtaGlow family); tap = openSupportTopic('check_issue') → "make it right" greet.
- Scope is belt-and-suspenders: `.invite` class (showResult adds, navMark/backToBuilder remove) AND
  CSS+tap gated on `body.rview` — backToBuilder skips navMark, so class-only scoping leaked. Pending
  results and every other page: tab untouched; chat-open close-tab state kills the glow.

## 🔧 07-16 EVENING — PTR back + per-tier Check+ grid (both driven live on staging, PASS)
- **Pull-to-refresh restored.** The Android pass's blanket `overscroll-behavior-y:none` killed the
  owner's pull-to-refresh. Now PTR is blocked ONLY mid-flow (`.overlay.on`, `.csheet.on`, `.supwrap.on`,
  `body.huntmode`, `#live` visible) via `html:has(...)`; at rest the default is back. REAL verdict =
  owner's phone (headless shows computed style only).
- **Check+ grid follows the ringed tier.** Tap a plan → grid re-paints from THAT tier's feature map;
  header flips "Every plan gets" → "This plan gets" (ES 'Este plan incluye') only when tiers differ;
  `grid-template-rows:62px 62px` pins the 2-row/132px height so plans never sink below the fold.
- **Root cause of "unchecking hobby/thrift did nothing": Admin writes PROD's DB, staging site reads
  STAGING's DB** (GOTCHAS updated). Mirrored his edit into staging config (family: thrift+hobby off)
  via staging admin API. Store holds/your voice only "worked" because I'd flipped them in staging
  config myself last session.
- **Next (owner):** Charlie test calls + check-status page render — boundary in docs/team/voice/checkpoint.md.

## 📱 ANDROID PASS (07-16, android sub-session) — DONE, merged PRs #44+#45, live (x-rev android-r119)
- Drove all 28 consumer screens/flows at Pixel 8 viewport (412x915 + 360w) via headless Chromium →
  staging. No overflow-x anywhere; rendering matches iOS. Fixed the Android-only breaks:
  keyboard covering bottom sheets (`interactive-widget=resizes-content` in the viewport meta),
  pull-to-refresh reloading mid-flow (`overscroll-behavior-y:none`), failed logo imgs painting
  Chrome's broken-image glyph (wmFail() → designed .wm monogram; map pins/switcher icons hide),
  OTP autofill washing #auth_code. All verified live on staging post-deploy.
- **Store logos are HEALTHY — don't re-chase.** Broken tiles in the first sweep were a SANDBOX
  artifact (headless Chromium can't TLS to logos.fungibles.com; relay it like the staging bridge).
  Verified: 49/49 imgs render with the CDN relayed, 0 fallbacks fire, all 45 unique logo URLs
  across 5 metros return 200. wmFail stays as insurance for genuinely dead logos.
- **Owner decisions (07-16): pinch-zoom stays BLOCKED everywhere** (meta unchanged; iOS ignores the
  flag at the browser level — that side is Safari policy, not ours).
- New tools (committed): `scripts/qa-android-sweep.mjs` (full Android screenshot+diagnostics drive)
  + `scripts/staging-bridge.mjs` (the GOTCHAS loopback bridge, now a file not a paste).
- Friday real-device check: type in the sign-in sheet (keyboard must not cover it), pull-down
  doesn't reload, logos render. Emoji differ slightly (Noto vs Apple) — cosmetic, no action.

## 🤝 HANDOFF (07-16 afternoon) — state at session end
- ALL of it merged to staging + deploy-verified; working tree clean; no background tasks. Afternoon
  batch = PRs #37/38/40/41/42/43 (on top of the morning's #29/31/32/36 below). NOT yet promoted —
  prod is at the PM's 41901e5 fresh-start; everything after rides the next promote.
- **07-16 afternoon fixes (each driven live, most with the owner watching):**
  · Kiosk: 2nd kiosk pick never slid the sheet up — pickKiosk was missing pickStore's CS_DISMISSED
    reset. · Toasts were z-60 UNDER z-4600 sheets — every pill fired inside a sheet was invisible;
    now z-9000. · Email edit: pending address = yellow + carved card + "Send it again" (confirm line
    out of the header); same-pending-address save RE-SENDS the confirmation; every unconfirmed save
    pills "Confirmation sent." · Confirm-email landing page GONE → 302 to /?emconf=1|0, My checks
    opens with the confirmed/bad-link pill. · Admin email copy: confirm_email was the one send not
    passing bodyRaw → design's baked text; Admin copy sends now. · Admin Plans editor: checkbox saves
    were silently droppable (600ms debounce + no feedback) — now ~60ms + "Saved · live on the site"/
    "NOT saved" pills + pagehide flush; I also flipped store_holds/your_voice OFF in the staging
    config via the admin API (owner asked twice). · Check+ grid: NO hardcoded list anywhere — boot
    prefetch + 3x retry + fixed-height loading dots; always 2 rows at the ORIGINAL 132px footprint
    (owner: plans must never fall below the fold).
- **Owner eyeball still pending:** slide-up chrome (other dev's attempt 4), Android real-device
  checklist (above).
- **QA drivers (committed):** `scripts/qa-website-drive.mjs` (13 statuses + alerts mute/stop, EN+ES
  wrap law) · `scripts/qa-android-sweep.mjs` · `scripts/staging-bridge.mjs`. Run before shipping.

## ✅ Shipped earlier this session (07-15 → 07-16 morning, PRs #29/31/32/36 — all verified live)
1. **My checks:** edit cell/email = icon-top sheets with owner-approved copy; every exit returns to
   My checks; Earn row removed (Earn tab covers it).
2. **Alerts:** rows read "{product} at {store}" (server joins retailer + category names; junk labels
   fall back to the category, else store-only). MUTE pauses sends (muted column, /app/alerts/mute,
   fan-out skips; row dims) with pill "Muted. Unmute any time."; STOP removes + pill "Unsubscribed
   from restock alerts for {store}". Cache-first (My checks prefetches) → sheet opens instantly.
   Empty state "You haven't created any alerts." Sub "Manage your email and text alerts." (owner's
   words). Email unsubscribe link → /?alerts=1 (landing page gone; RFC 8058 POST kept). Buttons
   stack vertically so ES labels never squeeze copy into a wrap.
3. **Verdicts:** sub wrap law site-wide (`sentLines` — fits one line or breaks at the period, digits
   count as sentence starts). In-stock sub pulls the Admin statuses-registry note; `prodPhrase()`
   turns raw "Tin · Scarlet and Violet" into "a Scarlet and Violet tin" (EN+ES). Date/time on EVERY
   status (fixed the ts-less /pub/result branch + history-time fallback; all 13 statuses audited).
   Footer pins to the bottom edge on short verdicts (dead grey band gone; supersedes 07-10 item 51).
4. **Check+ = launch set, Admin-driven:** exact_products OUT of the catalog (every account gets exact
   asks; premiumAsks always true), hobby_hunts IN, store_holds/your_voice default OFF until built —
   checking them in Admin brings the box back, no code. Boxes 2-up BIG at ≤6 services, auto-tighten
   past 6. Tap a box → info sheet with book copy (docs/Check+, EN+ES, wrap-audited). Paid-welcome
   "Now live" list + "+N more" render from the same live list.
5. **Language:** every email-capturing POST sends the site lang; account stores it; alert emails/texts
   go out in the customer's language.

## ⏳ OPEN — needs owner / other lanes
- **Slide-up chrome (tint lane):** other dev's attempt 4 is on staging/prod — owner verdict pending.
- **Email rendering** (Outlook/Gmail) — other lane actively iterating (one light design now).
- **Restock SMS blocked externally** (A2P denied, toll-free pending) — email alerts live.
- **Service worker PHASE 2** (network-first HTML + offline) — not rebuilt.
- **og:image URLs ride the internal railway host** — works; public-host constant cleaner (DevOps).

## 🪤 Traps
`known-problems` skill has the full list. New this session: #auth_logo is a left-flex wordmark bar —
stacked headers must override its container per mode · a fixed-position ::after on a TRANSFORMED
sheet pins to the sheet, not the viewport (the tint lesson) · bootstrap.ts ALTERs that run BEFORE the
CREATE TABLE silently no-op on fresh DBs — put the ALTER after the create · alerts sheet text column
is ~240px next to its buttons; sentences must fit it in BOTH languages · headless→staging TLS +
local-verify recipe = docs/shared/GOTCHAS.md + scripts/qa-website-drive.mjs.
