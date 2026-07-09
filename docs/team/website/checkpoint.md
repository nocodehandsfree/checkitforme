## SHIPPED 07-08 (staging + prod)
- **Reload/nav regression fixed** (`checkit.html`, staging `4264162`): app was auto-restoring `cifm_mode=hobby`
  on every load → dumped into the Pokémon hunt (`body.huntmode`) on the home page, and — because `/app/me` is
  async — re-flipped INTO hobby even after a call/result had rendered, leaving the era/set art under the tinted
  status view. Two fixes: (1) removed the hobby/thrift auto-restore — Retail is the home base on every reload
  (kiosk still persists); (2) gated `body.huntmode #hobby{display:block}` with `:not(.hidden)` so any view that
  hides `#hobby` (result/history/calendar/zones) actually wins — it was out-specificity'd before, so the art
  bled UNDER those views. Also `exitHunt()` in `showTodayLanding`. **Tint itself untouched** (other dev's
  call-status work — clean split: he owns tint CSS `__bootTone`/`tone-*` ~L40-48, I own view/mode/nav).
- **Hobby product icons accent-tinted** (staging + prod): `hobbyIcon()` strokes the product-type icons
  (ETB/booster box/tin/etc.) in `var(--accent,#FFCB05)` (Pokémon yellow) instead of flat grey.
- **Footer copyright** (staging + prod, staging `2e62dac` / prod `5d02dde`): pulled `.foot-copy` out of the
  centered logo cluster into its OWN centered bottom line, now reads **© <year> High Science LLC** (year is
  dynamic via `#footYear`). v2 footer is now THREE centered rows: links · [logo·socials·lang] · © line.

## Carry-over (2026-07-07 — for the new repo)

> Written for the next chat / the migration to `nocodehandsfree/checkitforme` (branches `staging` + `main`).
> Only what's WRITTEN HERE survives — chat memory does not. Newest working state is in the sections below;
> this block is the "what's NOT finished + traps I learned" list so nothing gets re-broken or re-discovered.

**My visible memory of this chat starts at:** the continuation of the alerts-pipeline backend build, after a
compaction summary — earlier history is known only via that summary, not full recall. Treat pre-alerts detail
as second-hand.

**PARTIAL / NOT DONE / NO ANSWER / UNSURE (act on these):**
- **❗UNRESOLVED — owner unhappy: the nice Design template never actually renders in the inbox.** Owner spent
  real time designing a good-looking email template in Claude Design and we could NEVER get it to render — even
  with the new "send yourself a test" it still lands as **plain text** on his end. This was NOT solved this
  session. My side ports Design's mockups to email-safe table HTML (`renderBrandedEmail`, `EMAIL_DESIGN`), but
  the owner is still seeing plain text — so either the branded HTML isn't the part being sent on the path he
  tested, the mail client (Outlook mobile) is stripping/downgrading it, or images aren't loading so it collapses
  to text. TREAT AS OPEN: reproduce what HE receives (send to his real address, view in Outlook mobile), confirm
  the `renderBrandedEmail` HTML is on the test path, check Brevo "download images"/image hosting, and consider
  using a real Brevo-hosted template (`brevoTemplateId`) instead of inline HTML if the client keeps stripping it.
- **Service worker — re-add correctly (PHASE 2, NOT DONE).** It is currently RETIRED: `public/sw.js` is a
  self-destroying stub (install→skipWaiting; activate→delete all caches + unregister + navigate clients) and
  `checkit.html` unregisters all workers + deletes all caches on load. Owner WANTS it back as a feature (fast
  load + offline). Two-phase plan agreed: (1) reset everywhere — DONE; (2) after owner confirms the reset
  propagated on every device, re-add a **network-first-HTML** worker (always fresh online, offline fallback,
  cached static assets, instant `skipWaiting`+`clients.claim` takeover). Do NOT reintroduce the old stale-serve
  race (network-first with a 1.2s timeout that served stale HTML = the original bug).
- **Prod promotion of feature flags — NOT DONE.** At launch prod should have `flags.hobby=false` +
  `flags.thrift=false` so only Retail+Kiosk are live for everyone; flip on later from backend. Set this on the
  PROD branch (`claude/retail-stock-voice-calls-OcyMS`) / prod env, not staging.
- **Restock SMS — externally blocked (NO ANSWER on the fallback).** Twilio A2P 10DLC was DENIED; toll-free not
  approved. Pipeline stubs until creds land. I offered two fallbacks the owner never answered: (a) temporarily
  route restock alerts as EMAIL, (b) pursue a toll-free number. Re-ask.
- **A2P question — answered:** it IS required for app-initiated SMS to US consumers on a standard 10DLC number.
  Email alerts (Brevo) do NOT need it and are live. So alerts ship on email now; SMS waits on carrier approval.
- **Email copy — awaiting owner's corrected text.** Copy currently in `EMAIL_DESIGN` (src/alerts.ts) +
  `DEFAULT_TEMPLATES` is DESIGN's copy. Owner said "I'll need to edit some of this text later" because the
  edits he made in the Claude Design artifact page were lost and can't be re-pulled. Templates are editable
  live in Admin → Alerts; swap when he sends the real copy.
- **Brevo branded template IDs — optional swap, wired but unused.** Each event has a `brevoTemplateId` field
  in Admin; if set, it overrides the inline table-HTML. Currently empty → inline email-safe HTML is used.
- **Zones "show closed stores" — UNSURE owner is satisfied.** Verified `/pub/stores/near` already returns
  closed stores (no code change needed) and zone build includes them. Confirm with owner it looks right.

**Traps I learned the hard way (don't rediscover these):**
- **Brevo env var is `BREVO_API_KEY`** (NOT "BRAVO", NOT "ESP_API_KEY"). `espEmail` in src/alerts.ts must gate
  on `config.alerts.brevoApiKey`. I wasted a cycle gating on the wrong names → "email not configured".
- **Email must be TABLE HTML + inline styles + `object-fit`.** Flexbox/grid/external CSS do NOT render in mail
  clients (Outlook mobile especially). Design's saved file is React+flexbox → renders in a browser, NEVER in an
  email. I ported all 4 mockups to email-safe table HTML in `renderBrandedEmail`. Don't try to "just use the
  Design file" in an email again.
- **Connect-on-human VAD had a settle-window bug** (the ~20s silent Fun-store call). Direct-dial stores: the
  1500ms settle window swallowed the opening greeting and the 45-frame unbroken-voice gate reset on the
  caller's natural pause → agent never connected. Fix in `src/voice/bridge.ts`: shorter gate on direct dials
  (~22 frames), slow-leak tolerance for the post-greeting pause, and run VAD on direct dials even when a
  `connectAtSec` is learned. Also (separate, earlier) ABC recipe-timer muted the agent 19s on direct chains —
  direct-ring chains must carry `avgTreeSeconds=null` (fixed c55e46d/c2ceece).
- **Desktop tiny-logos was NOT a cache bug** — it was `hobSizeEra` reading card width in each image's `onload`,
  which on cached desktop images fires BEFORE layout settles → tiny. Fix = pure CSS `object-fit:contain`
  (class `hob-eralg`, `.sm` scale(.82) for the wide/heavy keep-group), zero JS timing (6278520). If a logo/
  image looks wrong at one viewport only, suspect an onload/JS-sizing race, reach for CSS object-fit first.
- **Backgrounded `npx tsx` servers get SIGTERM (exit 144)** in this env. Run them with `run_in_background:true`;
  and never put a leading `pgrep|kill` in the SAME command as a commit — it trips exit 144. Kill in a
  separate command.
- **"hi Bob" staff-name feature lives in the WORKFLOW** (`{{personality}}` / opener variables resolved in
  `buildRestockVars`/resolveWorkflow), NOT hardcoded. Edit it in Admin → Workflows, not in code.
- **Skin toggle is DEAD.** `checkit.html` head sets `data-skin=v2` unconditionally — the redesign is THE
  render, one view always. There is no v2/v3 switch anymore. Don't reintroduce a preview gate.

---

# Check - Website — CHECKPOINT (current state)

> **Volatile file — update THIS at every "Checkpoint".** Newest on top, bullets not prose,
> keep under ~80 lines: prune finished items (history lives in git commits, not here).

# Check - Website — worklog

**Returning to this? Read only the WORKING SET below.** First time / new chat? Read the CHARTER at the
bottom once, then the working set. Reference docs are listed in the charter — open them **only** when a task
needs them (don't pre-read).

---

## 🎯 WORKING SET — the live work (keep this true)
> **Update rule:** the moment you finish, get blocked, or discover a task — edit this block. And do a quick
> pass before you end a session. This is the only thing the next chat re-reads, so it must be current.

**▶ Doing now:** **Site-redesign loop in STANDING-WATCH mode** (cron `ca599466` — never self-exits, owner
stops it). Round 2 structurally rebuilt EVERY comp screen after the owner's correction ("reskin ≠ rebuild")
and his font catch: Google Fonts was BLOCKED on his network so the whole site silently fell back to the
system font — **Inter is now SELF-HOSTED** (`/fonts/inter-var-latin.woff2` + new `/fonts/:file` route in
`server.ts`; Google links removed from the head). 7 consecutive clean audit passes since; 45 rendered proofs
in `loops/site-redesign/proofs/`; full state of record = `loops/site-redesign/MANIFEST.md`. Each firing now
= regression sweep + audit anything other lanes push.
ALSO still live: **owner call-testing loop on staging** — Website owns voice-on-website (Admin stays on the
admin panel). Owner places Fun-store calls testing the **Branson test workflow** (openers/persona/voice) +
status printing; we fix what the calls surface. Goal: staging call experience as good as possible →
promote to prod → owner starts real-store calls for real ABC/ROI data.
- Status pipeline (learned): `/pub/result` finalizes ON-DEMAND at call end (EL hydration-gap guarded in
  `elevenlabs.ts`; consensus second-read only when EL unclear) and stamps `statusKey` on every settled verdict.
  Client flips on any keyed response (incl. settled unclear → poll). Expected flip: ~2–5s after hangup.
- Workflow on website calls: `/pub/check-live` → `bridgeStoreCall` → `buildRestockVars` → resolveWorkflow
  (store → chain → global default; settings `vt_store_workflows`/`vt_chain_workflows`/`vt_default_workflow`).
  Openers rotate per-workflow; persona → `{{personality}}`; voice = the workflow's ONE voice (no pool rotation
  on the bridge path — unlike admin's `triggerCall`, where the global pool outranks the workflow voice).

**⚠️ Test — coded but NEVER verified on a real call**:
- Silent location re-check — logic verified sound (fires on load, permission-granted only, >12mi move →
  silent switch + toast). Owner will eyeball from the road.
- `language_barrier` status — to trigger: answer the Fun call with "sorry, no English / no hablo inglés"
  and give no answer. Gibberish will NOT fire it (phrase-list heuristic + EL flag; only wins when EL unclear).
- Restock premium vs non-premium — logic verified: `isMember` (active sub) → alert-me module; free →
  "check back soon". Owner is comp/premium so only sees member view; behavior is a clean on/off in code.

**✅ SHIPPED 07-05 (owner screenshot batch IMG_7643–7651 — all on staging):**
- Hobby/retail cluster: hero "in stock?" header stays visible through the hunt (#41); era-lock logo
  width capped so "N sets" + Change always fit (#43); product-lock clears the carried-in store so the
  shop list opens unselected — no more double-highlight/stuck pick (#42); **Retail lists general retail
  ONLY** — Hobby card shops & Thrift stores stay in their own chips (#40); the hobby hunt owns one
  history entry so browser/OS **back walks the steps out** (shop→products→sets→eras→Retail) instead of
  escaping to a stale My-checks entry (#44). Regression test: `scripts/qa-huntback.mjs`.
- Result rail line now ends at the terminus dot's center, not below the verdict text (#37); driver
  handoff drop-toggle relabelled to single-line balanced "Ship to me / Drive to me" + more space under
  the heading (#36); account sheet pinned to a stable height so its top edge stays put across
  Overview/Activity/Earn (#38); add-store close-X hardened (z-index) + notify copy sharpened — data
  lands in **Admin → Store requests**, contact field drives the "when it's live" notify (#39); post-score
  photo picker dashes red on empty submit like the add-store form (#9).
- **#12 RESOLVED (07-05):** owner clarified it was about SHARING a score — the "Where'd you score?" picker
  in the Post-your-score composer now offers only stores where YOU found it in stock (from your own
  checks); nobody shares a win for an item they couldn't get. Also kills the every-store long list.
- **SHIPPED 07-05 batch B (screenshots IMG_7654/7660/7661 + video):** calendar Saturday column no longer
  clipped off-page (aspect-ratio min-width bug); map logo pins on dark bg + bold white popup name; master
  map toast = "Pinch to zoom, tap to drop a pin."; Post-your-score field-red on empty store/product/photo
  + swept auth/lead forms; My-checks sheet slides fully up/down (batch A) and now a FIXED 86vh height so
  Overview/Activity/Earn share one top edge; Hobby/Thrift are paid-plan only (batch A) AND have GLOBAL
  admin kill-switches (Admin → Feature flags → Hobby/Thrift, off = hidden for everyone incl. comp);
  free/PAYG ZIP relocate now shows a Check+ upsell + plans sheet; grocery kiosk-only chains dropped from
  Retail. Regression tests: qa-sheet-gate.mjs, qa-huntback.mjs.
- **🅿️ DATA follow-up:** mark the kiosk-only grocery chains (Ralphs / Albertsons / Pavilions / Vons etc.)
  `sellsPacks:false` so they're authoritatively kiosk-only — the consumer now hides Grocery+kiosk from
  Retail as a stopgap, but the data flag is the real fix.
- **Copy Round 6 DONE (07-05):** applied the "Round 6 — post-redesign copy sweep" from
  `COPY_CHANGES_APPROVED.md` (that file lives on the PROD branch): Fungie+→Check+, em-dash purge,
  ES unit drift llamada→verificación, warm errors, i18n wiring (auth.sending/resending, err.usonly,
  err.toofast, sc.posted keys) + ES for all new keys. Left per doc: err.generic warm-up (owner's call),
  v.failed removal (DevOps/status-table).
- **Manage Zones consumer DONE + REDESIGNED (07-05) — wired to the contract, backend pending:** 3 screens
  in `#zones` (list → build/edit → live report), gated on `zone_sweeps`, "check" never "call".
  **Redesigned map-first** per owner feedback (IMG_7684–7691): green selection (not brand-yellow), NO cost
  shown, retail-identical store rows, prominent name field, content-flow layout (no more right-edge Save
  cutoff), logo pins on the map, ZIP/town search + **GPS pin to re-sync location** (`zoneGPS`). Save now
  **validates both**: no store → toast; no name → `#z_name` red + toast; never POSTs half-filled. My-Zones
  list **paints from cached `ZONES.list` instantly** then refreshes (no loaddots on every open). Full ES
  copy added (was English-only). **Blocked on DevOps shipping the real endpoints** (see below); UI degrades
  to an empty state until live. Test: `scripts/qa-zones.mjs` (10 checks, mock-based, no-seed server).
- **⛳ DEVOPS NEEDS TO SHIP (Zones):** the 7 `/app/zones/*` endpoints exactly per `manage-zones.md`
  (GET/POST/PATCH/DELETE `/app/zones`, GET `/app/zones/quote`, POST `/app/zones/:id/check`, GET
  `/app/zones/run/:runId`, POST `/app/zones/run/:runId/stop`) + `ownerUserId` on zones + a `zoneRunId`
  run-grouping. All Bearer-authed + `zone_sweeps`-gated (403 not_entitled, 402 no_credits). The consumer
  already calls them with the field names in the contract.
- **My-checks sheet now a true bottom sheet (07-05):** slides fully UP on open + DOWN on close/swipe
  (was a 24px nudge + hard disappear). `closeAccount()` animates the slide-down; `sheetDrag` animates the
  swipe-release; `openAccount` clears leftover inline styles. Same keyframe given to the buy/plans sheet.
- **Hobby + Thrift are PAID-PLAN only (07-05):** hard client guard `comp || subscription==='active'` in
  `ensureModeChips` — PAYG/free never see the chips even if `/app/me` sends the feature flags true. Sits
  on top of the per-tier feature matrix. Test: `scripts/qa-sheet-gate.mjs`.
- **NEXT (owner):** sending wireframes + spec for **building & checking Zones** (there's already a
  `docs/archive/manage-zones-SHIPPED.md` stub from DevOps — cross-check against the owner's wireframes when they land).

**🔨 Build / fix:**
- **🅿️ Manage Zones (premium `zone_sweeps`) — full spec `docs/archive/manage-zones-SHIPPED.md`.** In My Checks:
  build a zone (radius quick-add + tap-to-light-up stores), save it, then "Check all" → a live
  multi-store report (one row per store, reuses the 6M result card). Terminology: "check" NEVER "call".
  DevOps builds the `/app/zones/*` contract in the spec; wire the 3 screens against it.
- **DevOps site-health caught: `/p/privacy` loads a 404 resource** (2026-07-04, `scripts/site-health.mjs`).
  The privacy content page pulls something that 404s — fill/fix the privacy page body (POLICY.pages.privacy)
  or the missing asset. Every other view (4 brands × 8 views) + all forms are healthy.
- **🅿️ DevOps → Website (2026-07-03, UPDATED — 4 tiers + premium features): wire the plans sheet to
  `GET /pub/plans`.** It's the live source of truth (published to Stripe), shape now:
  `{ features:[{key,label}], everyPlanGets:[key…], tiers:[{key,name,monthlyCents,annualCents,
  checksPerMonth,premiumAsks,features:{key:bool}}], payg:[{checks,cents}] }`.
  - **Render the 4 tiers** (low→high: Family/Collector/Hunter/Operator) + the **PAYG slider** from it —
    NOT the hardcoded `tiers()` (those names/prices are stale). Owner edits all of it in Admin → Plans.
  - **"EVERY PLAN GETS" grid** = map `everyPlanGets` → `features[].label` (icons per the comp). These are
    the 8 premium features; render them exactly as `NEW_CHECK_COMPS` shows.
  - **Gate premium UI on entitlement:** `/app/me` now returns `features:{key:bool}` (comp→all,
    subscriber→their tier, **PAYG/free→ALL false**). Show/enable a premium feature's UI only when its
    key is true. **PAYG customers must NOT see premium features as available** — that's the sync rule.
  - **Checkout:** `POST /app/checkout {kind, annual}` — kind = tier key (`family|collector|hunter|
    operator`) with `annual:true` for yearly, OR `payg:<checks>` (e.g. `payg:25`). `/app/me` also has
    `subTier`, `quota` (sub checks left this cycle), `payg` (permanent balance), `credits` (sum).
  - **Checkout LOOK — embedded, SHIPPED (Website, 2026-07-03):** DONE. Live plans sheet (tiers/grid/PAYG
    off `/pub/plans`) + the branded 6c `#coOverlay` (Stripe Payment Element styled to `NEW_CHECK_COMPS`
    via `POST /app/checkout-intent`, `confirmPayment(redirect:if_required)`, poll `/app/me`, 6d success).
    Graceful hosted-redirect fallback when no on-page intent. **PAYG branded flow VERIFIED end-to-end on
    staging with test card 4242** (credits 1→26). ⚠️ **Subscription-tier Elements is blocked on a DevOps
    backend bug** — `createCheckoutIntent` reads `latest_invoice.payment_intent` which the current Stripe
    API version returns null; tiers fall back to the working hosted redirect until fixed. Full status +
    the me.features gating follow-up: **`docs/archive/checkout-status-SHIPPED.md`**.
- **PROD-only, check after promote:** owner can't navigate back to June's calls on production. Staging's
  history/calendar code is far ahead — promote likely fixes it; verify on prod after pushing, else debug
  the calendar month-nav (`RAIL_CAL_M`/`openRailCal`). Not blocking.
- **Design round queued** — see ROADMAP "Design round": Check+ signup flow (1a–1d HTML comp, awaiting file),
  thrift+hobby types/paths (hobby = sports cards + TCG ONLY, no NeeDoh), My-checks redesign, home layout.
  Implement on staging as comps land; owner reviews before promote.
- **Green at the bottom bar (iOS Compact Safari)** — owner saw a green bottom toolbar on the live-call screen.
  Confirmed there is **NO `theme-color` meta** anywhere (source + served staging HTML), so it's not a meta:
  it's iOS **per-edge page sampling** picking up a green pixel at the page's *bottom edge*. Couldn't repro the
  toolbar tint headlessly. **Need owner input:** does the green show only during a live call, everywhere, or
  only after an in-stock (green) result? Then pin that edge dark. Don't blind-edit the tint CSS — it's fragile
  ("re-breaks the top"). Mechanism spec lives in the big comment at top of `checkit.html` (~L6-14).
- **Treasure Hunt / thrift toggle** — ON HOLD per owner (front-end being designed with Design + Data).

**⏳ Blocked / waiting on others:** — (kiosk nudge, shipment opener, Topps logo, entrance animation all closed by owner 2026-07-01)

**✅ Recently done** (newest first; trim when long):
- **🌅 REDESIGN ROUND 2 (2026-07-02, ~25 cycles after the owner's correction)** — every comp frame
  STRUCTURALLY rebuilt to its extracted markup (6a/6b/6d sheets, 6e–6i account, R1–R3, SC1/SC2, RN1/RN2,
  P1–P6, hobby P3a–P5, IS1/T1, L1a–c), all proofed in true Inter. **Font root-cause (owner caught it):
  Google Fonts blocked on some networks → SELF-HOSTED Inter now.** ES: 58 missing v2 keys drafted + a
  pre-v2 leak fixed (the PRIMARY 'Check this store' CTA was never keyed — English in Spanish since v1;
  now `cs.cta`). Lens rotations A–F ×4: store-row scale, RESULT-chip/sentence specs, demo-bubble tails,
  kiosk hint border, v1-untouched proof, desktop/tablet, reduced-motion, deployed-staging freshness all
  verified. 7 clean passes running. Preview: `?skin=v2` (+`&flow=hobby`/`&show=signup`/`&show=paid`
  /`&show=mychecks`); `?skin=off` reverts. Blocked: YOUR HUNT (price backend) · Check+/Buy-checks tab
  (empty packs). COPY QUEUE: comp copy rulings + ES draft ratification + Runnr footer + 'Legal' merge.
  ⚠ Preview badge + `?skin` gate are TEMPORARY — strip at promote.
- **Silent-agent incident (2026-07-02) root-caused + mitigated in minutes:** ABC recipe-timer muted the agent
  19s on the direct-answer Fun store (`avgTreeSeconds=19` on a `navType:'direct'` chain; VAD skipped). Cleared
  the chain value + flipped `connectOnHuman:false` on staging. Bug filed with DevOps; don't re-enable ABC on
  staging until the timer respects `navType:'direct'`.
- **Transcript auth header shipped** (DevOps ask): all 9 `/pub/result/:cid` + `/pub/live/:cid` call sites now
  go through `appApi` → `Authorization: Bearer <check_session>` whenever signed in (anonymous unchanged).
  ➡️ DevOps can flip `policy.flags.transcriptAuth` ON once this deploys.
- **Full-site redesign incoming** (owner + Claude Design): plan agreed — enumerate every view in checkit.html,
  map comps to views, restyle uncovered views to the new design system, ship as a PREVIEW MODE on staging
  (owner flips a switch to walk the whole new look; approve → becomes default → promote). Comps will include
  hobby/kiosk/thrift layouts (hobby = sports cards + TCG only).
- **Security lockdown (owner-priority)**: `/pub/stores` (full-table dump) now admin-auth only (header or
  admin cookie — Admin keeps working); `/pub/*` 300/min/IP ceiling; text-search path q≥2 chars, offset≤600,
  30/min/IP. Phones were never exposed; muted + owner-only stay hidden. tsc+tests green.
- **Staging call quality synced to prod baseline**: staging ran a DIFFERENT EL agent with speed .85 (prod .98),
  turn_timeout 10s (prod 5s), soft-timeout off (prod 3s), eagerness normal (prod eager), speculative off, edited
  prompt → the slow/repeating call. PATCHed the staging agent's conversation_config to prod's values (kept
  staging's TTS-override permissions — the voice strip needs them). Also re-enabled `connectOnHuman` +
  `bail.enabled` on staging policy (were false; prod runs true).
- **Branson openers de-dashed** (dashes → commas, per owner) on both Branson workflows via settings API.
- **Verified**: Fun store = id 106361, has **Branson Test** assigned (store-level, wins); default = Branson Global.
- **`GET /pub/store/:id` + reopened-call address backfill shipped** (the DevOps ask — built it myself,
  owner-authorized): same shape as /pub/stores/near, comp-gated for owner-only; client fetches the one store
  and repaints in place when an old call has no address.
- **Voice strip rotation shipped** (owner-authorized cross-lane): workflows carry `voices[]`, rotated per call
  on the workflow's counter (bridge path rotates the strip; admin dial: override → global pool → strip →
  default). Admin → Workflows: chip strip + "+ Add a voice…"; Reset rotation now also resets voice #1.
  Designer re-save preserves the strip. tsc + full test suite green.
- **On staging, awaiting owner Fun-call verification** (3 bug fixes, `checkit.html`):
  - **Status flip**: `finalizeLive` no longer flashes "nobody answered" when the server verdict is slow on a
    *connected* call — it shows the neutral "getting the answer…" dots and `reconcileVerdict` upgrades in place
    (window widened ~30s→~60s). "No answer" now only shows when there's no transcript or the SERVER says so.
  - **Spanish step log**: step labels were snapshotted in English at call time; both renderers now resolve from
    the step number (`liveStageLabel(s.n)`) so a language flip re-localizes the whole log (+ mid-call re-render).
  - **Map framing (master)** *(v2 — v1's roam-detect didn't hold)*: real cause was `fitBounds` framing ALL pins,
    so a far in-stock store outside the radius zoomed the map away. Now it only auto-frames on intentional moments
    (open / new location) and frames the search-**radius ring**, not far pins; radius change/refresh never
    re-frames. One-shot `MAP_FIT_NEXT` flag replaced the roam detection.
  - **Spanish conversation** *(round 2)*: `canTranslate` was gated to EN-mode only; now it offers the reader's
    language either way, and an ES site auto-shows the conversation in Spanish (`toggleTranslate`, cached,
    "Ver original" to flip). NOTE: this fires a `/pub/translate` call per ES result viewed — flag to owner if cost matters.
  - **Status flip / Spanish step log**: shipped (see prior entry). Status piece now also being worked by Admin.
- Filed 2 cross-lane endpoint asks with DevOps (`section=thrift` param + `GET /pub/store/:id`, exact shapes in
  devops.md) to unblock the thrift toggle + reopened-call address. Verified both are absent from `server.ts` today.

---

