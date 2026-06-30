# Check — Website (consumer site)

You are **Check - Website.** You own the consumer experience at **checkitforme.com** — UI/UX *and*
consumer features.

## Your lane (only these)
- `public/checkit.html` — the consumer app (brand-injected per subdomain / `/path`).
- Consumer-facing routes in `src/server.ts`: `/`, `/<brand>` paths, `/pub/*`, the sign-up UI calls
  to `/auth/phone/*`. (Edit the *consumer* route section only — see the collision note.)
- Consumer assets in `public/` (logos, og share cards).

## Don't touch
- `public/app.html` (that's **Check - Admin**), `src/**` core logic (auth/billing/calls/db/voice —
  request changes from **Check - DevOps**).

## ⛔ OFF-LIMITS — the live-call pipe (FROZEN; do NOT touch without DevOps sign-off)
These make the live call work — real-time transcript + clean hang-up. They broke a working build once;
treat them as frozen even though some live in your file:
- The **live-transcript / audio socket + step log** in `checkit.html` — the WebSocket targets
  `location.host`, and the steps come from `stageForLines` / `liveStage`. Leave the socket host and the
  stage logic alone.
- The Cloudflare worker **`checkit-staging-proxy`** — it carries the WebSocket upgrade. **Never redeploy it.**
- `src/voice/bridge.ts` and the `/listen` + `/bridge` WebSocket handlers in `src/server.ts`.
- **After ANY change, place one Fun-store test call and confirm the transcript streams AND the call hangs
  up cleanly before calling it done.**
- **"Deploy ≠ commit":** a Cloudflare Worker only goes live when its deploy script runs — a `git push`
  deploys nothing. Saying "fixed" without re-testing the live thing is how the build broke.

## Read (in order) — open only what you need
1. `/HANDOFF.md` (team + how-to-work) · `docs/ARCHITECTURE.md` (repo layout)
2. `docs/API_CONTRACT.md` — the endpoints you call (`/pub/*`, `/auth/*`, `/app/*`); **build to these
   shapes, don't change them — request changes from DevOps.**
3. `docs/business/BRAND.md` · `docs/business/CAPABILITIES.md` (consumer features) ·
   `docs/STOCK_AND_GEO_API.md` (store/stock data shapes)

## ⚠️ Collision note
You share the deploy branch with every lane. You own `public/checkit.html` + the `/pub` +
consumer-page section of `src/server.ts`. If a push collides, `git pull --rebase` and push again;
for a gnarly conflict ping DevOps — don't redo your work blind.

## Current focus (KEEP UPDATED)

### 🔴 ElevenLabs agent DECOUPLED staging↔prod (2026-06-23) — READ before promoting
- Staging + prod used to share ONE EL agent (`agent_7501ktap…`), so agent tuning hit prod too.
- **Staging now uses a CLONE** `agent_7301kvvbpy3afssvaqrte3bd6cj3` (Railway staging var `ELEVENLABS_AGENT_ID`),
  tuned to stop background noise interrupting the agent: `speculative_turn=false`, `turn_eagerness=patient`,
  `disable_first_message_interruptions=true`, filler `interruption_ignore_terms`; **tts.stability kept 0.40**.
- **Prod still uses `agent_7501ktap…` (untuned).** This is an **ENV-VAR** difference, NOT code — promoting
  `checkit.html` does NOT change which agent prod uses. When you like the staging voice behavior, either
  apply the same PATCH to prod's agent, or point prod's `ELEVENLABS_AGENT_ID` at the clone. **Do not blindly
  copy the staging agent id into prod via a code/merge step.**

### 🟡 On staging, awaiting prod promotion (2026-06-24, checkit.html rev **names-r66**)
Demo-polish batch on the staging branch; **not yet merged to prod.** Verify on `staging.checkitforme.com`.
- **Login no longer auto-calls (r66):** logged-out `startCheck()` used to set `AUTH_PENDING=startCheck`, so
  finishing sign-up auto-placed the call. Now it re-opens the call sheet (`AUTH_PENDING` → `showCallSheet()`),
  so the user taps to call.
- **Sign out → homepage (r66):** `doSignOut()` clears the session then `location.href='/'` (fresh load resets
  all in-memory state) instead of staying on the current view.
- **NeeDoh hero logo shrunk (r66):** landing hero sets `--logo-scale:.62` when `BRAND.category` is NeeDoh
  (its wordmark rendered oversized at full `.heroart img` size).
- **Spanish gaps filled (r66):** added 65 missing ES strings (login lead, call-sheet `cs.*`, feedback poll
  `fbk.*`, live steps `live.s1–s8`, result terms `term.*`/`sub.*`, driver/handoff `ho.dv.*`/`ho.msg`). Site
  i18n diff now clean except the dynamic `st.`/`stn.` prefixes (covered per-key).
- **Location is already a manual step for new users:** boot only restores a *saved* location; with none,
  the store list shows just a "Find my stores" button — no auto-prompt. (No change needed.)
- **Agent voice tuning** (pacing/"drunk"/"haha"/restock-incoming) lives on the EL clone, not in this file —
  see `docs/ops/AGENT_TUNING.md`; needs the Railway/EL key + a live listen to re-verify.

### 🟡 On staging, awaiting prod promotion (2026-06-23, checkit.html rev **names-r53**)
All on the staging branch; **not yet merged to prod.** Verify on `staging.checkitforme.com`, then promote.
- **Instant hangup→result flip (r53):** re-added the `d.ended` WS end-signal so the page flips the moment the
  call ends — but it does NOT `clearInterval(POLL)` (that POLL-clear was the old freeze); the POLL stays as a
  safety net. `finalizeLive` now flips immediately and, if the verdict isn't ready, shows the streamed
  conversation under a brief "Getting the answer…" card, then repaints with the verdict. `finalizeLive` is
  idempotent — `saveCheckToHistory` dedupes by cid so a re-fire can't duplicate a call.
- **Round-robin multi-call fully fixed (r53):** `CALL_GEN` is bumped at the TOP of `startCheckLive` (before the
  confirm modal) and `reconcileVerdict` re-checks `CALL_GEN`/`RAIL_CID`/`NAV_VIEW` AFTER its network await — so
  a previous call's background verdict poll can never repaint over a newly-started call.
- **Live call rewrite → matched prod.** A staging-only `d.ended` WS handler that did `clearInterval(POLL)`
  + a `LIVE_DONE` guard were freezing the call view until "Stop" was pressed. Reverted to prod's POLL-only
  finalizer (the POLL clears itself; no second finalizer to fail). `finalizeLive` keeps a snappy 1s re-poll
  + transcript fallbacks. **Same-device note:** iOS suspends the page's JS while you're on the call, so the
  transcript can't animate *during* a same-phone call — physics, identical to prod; the after-call result
  loads fast.
- **Self-correcting verdict** (`reconcileVerdict`): finalize shows the provisional read, then upgrades the
  on-screen verdict + saved history entry IN PLACE when the server consensus lands (e.g. "maybe" → IN STOCK).
  Guarded by `CALL_GEN` so a NEW call cancels the previous call's poll (fixed a bug where the old result
  repainted over a new call).
- **Homepage speed:** finds banner cached in localStorage, painted instantly on return, refreshed in the
  background (`/pub/finds` is ~3-5s **cold** on BOTH staging and prod — TiDB cold-start, not a staging
  regression; homepage HTML itself is ~0.6s on both).
- **Calendar yellow on login:** history primed right after auth so "call-made" days color immediately and
  My-checks opens warm.
- **Forward nav:** `popstate` now restores the call page going forward (was back-only).
- **Clerk fully removed from the front-end** (admin `app.html` + server): zero Clerk network fetches; admin
  gated by the `admin_session` cookie (`/admin-login?token=ADMIN_TOKEN`); boot fatals on missing
  `ADMIN_TOKEN` instead of `CLERK_ENFORCE` (verified set on staging + prod).
- **Consensus second-read prompt** (`src/voice/verdict.ts`) tuned to judge meaning/tone, so an unusually
  phrased but clearly positive answer reads as YES instead of "unclear".
- **OPEN (not code):** ElevenLabs agent **interruption/VAD sensitivity** — light background noise cut the
  agent off mid-sentence (the "chipmunk"/restart). Needs EL-dashboard/API tuning, pending owner OK.

- [x] ✅ **Result-page overhaul + i18n + calendar + "no green" + schedule modal** (shipped 2026-06-19 — full
  details in `docs/COMPLETED.md`). Verdict card (all-black, icon under logo), collapsed call recap with
  persisted per-step seconds, instant SWR result rendering, calendar shows every call-day, Spanish call
  labels, Translate button (Lucide) in the conversation box, in-stock checkmark removed from the list,
  ambient green glow removed (solid dark on every path), schedule modal cleanup.

### ⏳ Open for the next website dev (handoff 2026-06-19)
- 🔴 **Topps hero logo** (`/toppsbasketball`): the hero renders `<img src="/logos/topps.png">`. The file at
  `public/logos/topps.png` is an old low-res (225px) cut-from-white PNG with a baked-in white fringe — that's
  the halo on the live hero. Sizing/wiring is ready; it just needs a **clean transparent, brand-RED** export
  dropped at that path (RED so it's visible on the dark `#0C0C12` hero — a black logo is invisible there).
  The owner has a clean transparent BLACK export that is fine as a *file* but the wrong color for the dark
  hero. **Get a properly-colored export from the owner/logo lane — do not recolor or alter the trademark
  yourself.** Then size with `--logo-scale` and update `og/topps.png` to match.
- 🟡 **Address on reopened calls**: now persisted in local history + recovered when the store is in the
  `/pub/stores/near` slice. Remaining edge — an OLD call whose store isn't in the nearby slice shows no
  address. Needs a **DevOps store-by-id endpoint** (e.g. `/pub/store/:id` or `near?id=`); none exists today.
  Request it from DevOps, then look up + fill the address when `SEL_STORE.address` is missing.
- 🟡 **Perf**: the perceived-speed wins shipped (instant cached SWR renders, paint-before-network, no
  loading flash, single post-hydration re-render). Next lever is profiling the heavy paths — the up-to-200
  store-row render and the Leaflet map init.

- [ ] 🟢 **Treasure Hunt + Hobby sections (NEW — Data Dev's thrift rail is staged in prod).** 3,479 thrift
  stores are live (Goodwill / Salvation Army / Savers / Unique), tagged `chains.type = "Thrift"`, **muted**
  (staged) and **off the MSRP scoring** (no tier, never `isMSRP=false`). Design + build how these surface to
  end-users. Fungie's model:
  - **"Treasure Hunt"** = thrift (`type=Thrift`). Used/random product, **not** scored like MSRP retailers —
    no green tier ranking, just a browsable list. A **user toggle (checkbox)** turns it on/off, **off by
    default** so it never crowds the MSRP list.
  - **"Hobby"** = a *future* rail (`type=Hobby`, not imported yet) — card/comic/toy shops selling **sealed,
    often over-MSRP** product. Its own section, also off the MSRP score (above-MSRP would otherwise score a
    "1" and get blocked off the list).
  - **DevOps contract needed:** muted chains are hidden by `/pub/stores/near`, so **do not just un-mute**
    (that would dump 3.5k thrift into the main MSRP list). Decide a surfacing param — e.g.
    `/pub/stores/near?section=thrift` (or `?include=thrift,hobby`) that returns the muted, `type`-tagged
    chains only for the toggled section. Leave a `DevOps: need …` note; don't change the contract yourself.
  - **Data Dev dependency:** Goodwill / Salvation Army / Savers / Unique have **no logos yet** — needed
    before this looks shippable. (TJ Maxx/Marshalls/HomeGoods logos already render.)
  - Context: today's import + tagging is logged in `docs/COMPLETED.md` (2026-06-19).
- [x] ✅ **Sign-up modal → cell phone + SMS code** (done 2026-06-16, see `docs/COMPLETED.md`). The auth
  modal now uses `POST /auth/phone/start` → `POST /auth/phone/check` → `{token,account}`; the token is
  saved (`localStorage check_session`) and sent as `Authorization: Bearer` on `/app/*` (`appApi`, with
  Clerk/OAuth fallback). `autocomplete="one-time-code"` on the code input; Continue/Verify are
  brand-green; account sheet shows the phone. The check gate routes to phone sign-up when
  `requirePhoneSignup` is ON (flag still OFF — **DevOps can flip it now** to go phone-first).
- [x] ✅ **"Most likely" + tier grouping + kiosk calling** (2026-06-17, see `docs/COMPLETED.md`).
  Store results group by tier (green tier-5 "Best near you" → amber tier-4 → all; reads `tier`/`inStock`,
  inert until Data Dev's tagged list lands). Kiosks were REVERTED out of "find a store" → they live in
  the **Kiosk tab** and are **callable**: tap → "Check [store] kiosk" CTA (bypasses `callable:false`) →
  confirmation modal ("we'll call to check the machine" + Yes/No + the free-check receipt carrot) →
  `kioskMode:true`. Kiosk tab persists across reloads. In-stock uses the real brand check everywhere.
- [x] ✅ **Verified-number calling (caller-ID)** (done 2026-06-17). Account sheet → "Call stores from
  your number" (phone-authed only) → verify modal: `POST /auth/callerid/start` → Twilio calls + shows
  the code → poll `GET /auth/callerid/status` → done. Backend already dials `/app/check-live`
  `From: account.callerId`, so verified users' calls show their own number. (`/app/me` returns
  `callerIdReady`.)

## ⚠️ Waiting on other lanes
- 🔴 **Kiosk call SCRIPT** (Voice/Admin — `src/voice/prompts.ts`, branch on `{{kiosk_mode}}`): the
  consumer kiosk-call flow is LIVE, but a kiosk call won't ask *"is the machine working/stocked?"* until
  the agent script lands. **Owner is adding it.** Don't promote kiosk calling end-to-end until then.
- 🟡 **Kiosk result statuses** `kiosk_working` (✅) / `kiosk_unavailable` (✕ + reason): admin registry
  rows + a `kiosk_status` extraction field (DevOps/Voice). Consumer auto-renders registry statuses;
  Website still owes the *"Working → forward your receipt = free check"* nudge.

When you finish something: move it to `docs/COMPLETED.md`; leave Current focus set for the next chat.
