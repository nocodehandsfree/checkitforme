# Check - Website — worklog

**Returning to this? Read only the WORKING SET below.** First time / new chat? Read the CHARTER at the
bottom once, then the working set. Reference docs are listed in the charter — open them **only** when a task
needs them (don't pre-read).

---

## 🎯 WORKING SET — the live work (keep this true)
> **Update rule:** the moment you finish, get blocked, or discover a task — edit this block. And do a quick
> pass before you end a session. This is the only thing the next chat re-reads, so it must be current.

**▶ Doing now:** **Owner call-testing loop on staging** — Website owns the voice-on-website lane now (Admin
stays on the admin panel). Owner places Fun-store calls testing the **Branson test workflow** (openers/persona/
voice) + status printing; we fix what the calls surface. Goal: staging call experience as good as possible →
promote to prod → owner starts real-store calls for real ABC/ROI data.
- Status pipeline (learned): `/pub/result` finalizes ON-DEMAND at call end (EL hydration-gap guarded in
  `elevenlabs.ts`; consensus second-read only when EL unclear) and stamps `statusKey` on every settled verdict.
  Client flips on any keyed response (incl. settled unclear → poll). Expected flip: ~2–5s after hangup.
- Workflow on website calls: `/pub/check-live` → `bridgeStoreCall` → `buildRestockVars` → resolveWorkflow
  (store → chain → global default; settings `vt_store_workflows`/`vt_chain_workflows`/`vt_default_workflow`).
  Openers rotate per-workflow; persona → `{{personality}}`; voice = the workflow's ONE voice (no pool rotation
  on the bridge path — unlike admin's `triggerCall`, where the global pool outranks the workflow voice).

**⚠️ Test — coded but NEVER verified on a real call** (call the Fun store from Admin → Testing):
- Silent location re-check — never tested with an actual city-to-city move.
- `language_barrier` status — heuristic never seen firing on a live call.
- Restock premium vs non-premium section — visual pass.
- Result entrance animation / CTA sweep — re-look after the above.

**🔨 Build / fix:**
- **Green at the bottom bar (iOS Compact Safari)** — owner saw a green bottom toolbar on the live-call screen.
  Confirmed there is **NO `theme-color` meta** anywhere (source + served staging HTML), so it's not a meta:
  it's iOS **per-edge page sampling** picking up a green pixel at the page's *bottom edge*. Couldn't repro the
  toolbar tint headlessly. **Need owner input:** does the green show only during a live call, everywhere, or
  only after an in-stock (green) result? Then pin that edge dark. Don't blind-edit the tint CSS — it's fragile
  ("re-breaks the top"). Mechanism spec lives in the big comment at top of `checkit.html` (~L6-14).
- **Topps hero logo** (`/toppsbasketball`): `logos/topps.png` is low-res white-fringe → halo on the dark hero.
  Needs a clean **transparent brand-RED** export (black is invisible on `#0C0C12`) — get it from owner/Logo,
  **don't recolor the trademark**. Then size `--logo-scale`, match `og/topps.png`. (Verified: the hero `<img>`
  src is `BRAND.logoUrl`, injected server-side via `__BRAND_JSON__` — `renderIcons()` in checkit.html ~L2591.
  So the real fix = swap the file the brand config points at; no in-lane CSS trick fixes baked-in white fringe.)
- **Treasure Hunt + Hobby sections**: 3,479 thrift stores live (`chains.type="Thrift"`, muted, off MSRP).
  Surface behind a **user toggle, OFF by default**. Do **NOT** un-mute (dumps 3.5k into the main list).
  ✅ **Filed with DevOps** (`section=thrift` param on `/pub/stores/near`, see devops.md) — waiting on the endpoint;
  build the OFF-by-default toggle once it lands. "Hobby" = a future rail, not imported yet.
- **Address on reopened calls**: old calls outside the nearby slice show no address (only the near-slice carries
  `address`). ✅ **Filed with DevOps** (`GET /pub/store/:id`, see devops.md) — waiting on the endpoint; then fill
  when `SEL_STORE.address` is missing.
- **Workflow openers**: delete the "shipment" opener default (owner + Admin lane).

**⏳ Blocked / waiting on others:** kiosk call script (Voice/Admin) before kiosk calling can promote; then the
consumer "Working → forward your receipt = free check" nudge is yours.

**✅ Recently done** (newest first; trim when long):
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

## 📌 CHARTER — read once, rarely changes
You are **Check - Website**: you own **checkitforme.com** (`public/checkit.html`) — consumer UI/UX + features.

- **Lane (yours):** `public/checkit.html`, consumer routes in `src/server.ts` (`/`, `/<brand>`, `/pub/*`,
  `/auth/phone` UI calls), consumer assets in `public/`. **NOT yours:** `public/app.html` (Admin), `src/**`
  core (DevOps).
- **Handle with care — the live-call pipe** (it's finicky; test with a Fun call after any change): the
  live-transcript **socket + step log** in `checkit.html` (`stageForLines`/`liveStage`; socket → `location.host`);
  `src/voice/bridge.ts` + the `/listen`+`/bridge` WS handlers; the **`checkit-staging-proxy`** Cloudflare worker
  that carries the WebSocket for `staging.checkitforme.com` (don't delete or redeploy it).
- **Rules:** after ANY change, **call the Fun store — confirm the transcript streams + the call hangs up clean**
  before "done." **Deploy ≠ commit** (a Cloudflare worker only goes live when its deploy script runs). One
  Build on **staging** (`…pagiis` → staging.checkitforme.com), then promote to prod. Push collides?
  `git pull --no-rebase`, push again; gnarly conflict → ping DevOps.
- **Open ONLY when a task needs it:** endpoints → `docs/API_CONTRACT.md` (build to the shapes; changes = ask
  DevOps) · weird bug → `docs/GOTCHAS.md` · copy → `docs/design/COPY_CHANGES_APPROVED.md` · store/stock shapes
  → `docs/STOCK_AND_GEO_API.md` · team map + one-branch rule → `/HANDOFF.md`.
