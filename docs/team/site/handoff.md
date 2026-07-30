# SITE — handoff (stable charter: the consumer website)

## 📌 CHARTER — read once, rarely changes
This is the SITE system: **checkitforme.com** (`public/checkit.html`) — consumer UI/UX + features + copy.

- **Lane (yours):** `public/checkit.html`, consumer routes in `src/server.ts` (`/`, `/<brand>`, `/pub/*`,
  `/auth/phone` UI calls), consumer assets in `public/`. **NOT yours:** `public/app.html` (Admin), `src/**`
  core (DevOps).
- **Handle with care — the live-call pipe** (it's finicky; test with a Fun call after any change): the
  live-transcript **socket + step log** in `checkit.html` (`stageForLines`/`liveStage`; socket → `location.host`);
  `src/voice/bridge.ts` + the `/listen`+`/bridge` WS handlers; the **`checkit-staging-proxy`** Cloudflare worker
  that carries the WebSocket for `staging.checkitforme.com` (don't delete or redeploy it).
- **Rules:** UI-only changes need NO test call. If your change touches the live-call path (bridge, transcript, statuses), ask the owner to run a Fun-store call and confirm transcript streams + clean hang-up
  before "done." **Deploy ≠ commit** (a Cloudflare worker only goes live when its deploy script runs). One
  Build on **staging** (`staging` → staging.checkitforme.com), then promote to prod. Push collides?
  `git pull --no-rebase`, push again; gnarly conflict → ping DevOps.
- **Open ONLY when a task needs it:** endpoints → `docs/shared/API_CONTRACT.md` (build to the shapes; changes = ask
  DevOps) · weird bug → `docs/shared/GOTCHAS.md` · copy → `docs/design/copy/COPY_STYLE_GUIDE.md` (copy is THIS lane's own job now, see below — the old Copy-lane queue is archived) · store/stock shapes
  → `docs/shared/STOCK_AND_GEO_API.md` · team map + one-branch rule → `/CLAUDE.md`.

## Copy is YOURS now (Copper retired 2026-07-22 — essentials folded in)
Full authority: `docs/design/copy/COPY_STYLE_GUIDE.md` (open it for ANY string change). The bones:
- **No dashes inside sentences** (no em/en dash, no hyphen-as-connector). A period, or nothing.
- **Every string ships its length-checked Spanish in the SAME commit.** Spanish runs longer; it must
  never break the layout. Test at real component width.
- **One line; if it must wrap, line two is a whole new sentence** (break on the period, no orphans).
- **Names are exact:** product = Check It For Me · the AI = Check AI · the unit = a "check" (a "call"
  is only the literal phone call) · store person = Staff. Never Fungie/Fungibles/Runnr/Clerk.
- Banned: leverage · seamless · empower · solutions · robust · streamline · utilize · unglossed
  jargon (IVR, DTMF, E.164, COGS, MRR). Voice = a text from a competent friend; ELI5; benefit first.
- It's "auto checks" (never "scheduled checks") · "No check. No charge." · we do NOT record calls
  (text transcript + summary only) · nothing auto-retries a failed call. Write copy from the real
  code/flow, never from guesses.
- The book (readme.com customer docs, branch `v1.0`) is also this lane now; publishing how-to:
  `docs/archive/team/copy/how-to-publish.md`.

## iOS chrome tint is LOCKED (owner order 2026-07-27)
`scripts/qa-tint-lock.mjs` (in test-all + CI) enforces it. Break an invariant and the ship fails.
- iOS Safari paints BOTH its edges (status strip + bottom bar) with the page's ONE root background
  COLOR. Not painted pixels, not theme-color. One colour, both edges, no way to split them.
- So the root stays neutral `#1D1D22` and the verdict colour blooms in the MIDDLE only: neutral 0px
  → tone 110/230px → neutral by `100dvh`. Stretch a tone to either edge and you tint the chrome.
- `--bg` must equal the root colour, or the page bottom seams against the bar. Never recolour the
  root in-page in v2. Never add a theme-color meta. `setThemeTone()` stays a no-op.
- Nothing may paint over the page's bottom edge. A PARKED sheet casts no shadow
  (`.csheet:not(.on){box-shadow:none}`, needed in base AND v2) — a parked sheet's upward shadow was
  darkening the last 40px and seaming against the bar (07-27).
- You cannot see any of this headless. If you think an invariant is wrong, take it to the owner.
  Never edit the gate to make a change pass.

## Logo display rules (Logo lane retired 2026-07-22 — rules folded in)
Assets = `public/logos/chains/<slug>.png` + `_meta.json` flags (`w:1` wide wordmark → 44×34 box;
`d:1` needs a light plate). Full system + pipeline: `docs/data/store-logos.md`.
- `chainLogoInfo(name)` in `src/server.ts` maps name → `{url,wide,dark}`. **DB-first:** a chain row's
  `logo_url` (shared R2) wins; the repo file is fallback + source of truth.
- **Bump the cache-bust** `?v=N` in `chainLogoInfo` whenever any asset changes.
- White backgrounds are stripped from PIXELS, never "fixed" in CSS.
- Render bug (sizing, plate, wide-flag) = fix in render code. Bad asset = re-run the pipeline in
  `store-logos.md` §6. Never both at once. QA on `/logo-wall` at true 52px, not a zoom.
- Never re-touch an owner-locked logo; no global normalize passes (they regressed approved logos).

## Current work
Lives in `checkpoint.md` (same folder). Update THAT file at every "Checkpoint".
