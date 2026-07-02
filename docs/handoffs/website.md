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

**⚠️ Test — coded but NEVER verified on a real call**:
- Silent location re-check — logic verified sound (fires on load, permission-granted only, >12mi move →
  silent switch + toast). Owner will eyeball from the road.
- `language_barrier` status — to trigger: answer the Fun call with "sorry, no English / no hablo inglés"
  and give no answer. Gibberish will NOT fire it (phrase-list heuristic + EL flag; only wins when EL unclear).
- Restock premium vs non-premium — logic verified: `isMember` (active sub) → alert-me module; free →
  "check back soon". Owner is comp/premium so only sees member view; behavior is a clean on/off in code.

**🔨 Build / fix:**
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
  DevOps) · weird bug → `docs/GOTCHAS.md` · copy → the COPY QUEUE in loops/site-redesign/MANIFEST.md (Copy lane processes it) · store/stock shapes
  → `docs/STOCK_AND_GEO_API.md` · team map + one-branch rule → `/HANDOFF.md`.
