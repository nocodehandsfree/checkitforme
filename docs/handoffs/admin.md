# Check — Admin (operator dashboard)

You are **Check - Admin.** You own the admin dashboard at **admin.checkitforme.com** — UI/UX *and*
admin features (God-view, store CMS UI, voice studio, Tree Trainer, analytics, policy).

## Your lane (only these)
- `public/app.html` — the admin app.
- Admin routes in `src/server.ts`: `/api/*` (edit the *admin* route section only — see collision note).

## Don't touch
- `public/checkit.html` (that's **Check - Website**), the store *data* itself (that's **Check - Data
  Dev** — you build the admin UI; they manage the rows), `src/**` core logic (request from **DevOps**).

## Handle with care — the live-call pipe (it's finicky; test with a Fun call after any change)
- `src/voice/bridge.ts` and the `/listen` + `/bridge` WebSocket handlers in `src/server.ts`.
- The Cloudflare worker **`checkit-staging-proxy`** — carries the WebSocket for `staging.checkitforme.com`
  (source: `scripts/checkit-staging-proxy.worker.js`). Don't delete or redeploy it.
- The live-transcript / socket + step-log code in `checkit.html` (`stageForLines` / `liveStage`).
- **After ANY change, place one Fun-store test call and confirm the transcript streams AND the call hangs
  up cleanly before calling it done.** "Deploy ≠ commit" — a Worker only goes live when its deploy script runs.

## Read (in order) — open only what you need
1. `/HANDOFF.md` · `docs/ARCHITECTURE.md`
2. `docs/API_CONTRACT.md` — the `/api/*` admin endpoints you call.
3. `docs/business/ROADMAP.md` (admin features) · `docs/finance/COST_MODEL.md` (for the cost
   dashboard) · the caller-tech spec in git history (the admin caller tech: LLM switcher + phone-tree
   learner). Voice code to understand: `src/calls/tree-learn.ts`, `src/voice/bridge.ts`, `src/llm.ts`.

## Admin auth (settled)
The admin authenticates with an **admin token**, not Clerk. Login mints a signed `admin_session` cookie at
`/admin-login?token=…`; the gate accepts it. DevOps owns the auth routes — build the admin UI/features
against them, don't rebuild auth.

## ⚠️ Collision note
You share the deploy branch with every lane. You own `public/app.html` + the `/api` section of
`src/server.ts`. If a push collides, `git pull --rebase` and push again; for a gnarly conflict ping
DevOps — don't redo your work blind.

## Current focus — staged plan (do in order; KEEP UPDATED)
0a. [ ] **🅿️ DevOps → Admin (owner 2026-07-03): add the PREMIUM-FEATURE TOGGLE MATRIX to God View →
   Plans.** Backend is done — `GET /api/admin/plans` now returns `features:[{key,label}]` (8 features)
   and each tier carries `features:{key:bool}`. Add a matrix UI (features × the 4 tiers = checkboxes)
   under the price/quota editors. Save exactly what you already do — `POST /api/admin/plans` accepts
   `features` per tier verbatim (no shape change needed). Default is ALL ON for every paid tier; the
   owner toggles individual cells. After saving, the existing **Publish to Stripe** button applies
   prices; features are app-enforced entitlements (no Stripe price). PAYG has no features by design.
   The 4 tiers (Family/Collector/Hunter/Operator) + PAYG are already live + published to Stripe (test).
0. [ ] **DevOps → Admin (owner rule 2026-07-02): Workflows must power BOTH envs from the one Admin.**
   Today Admin edits PROD's workflows only (per-env DBs; staging's `vt_*` settings get edited via
   staging's own API). Build an **environment picker** on the Workflows screen: Prod | Staging, where
   Staging reads/writes `staging.checkitforme.com/api/*` (its own ADMIN_TOKEN — coordinate the
   cross-origin auth with DevOps before building). Envs stay independent: owner tests a workflow on
   staging, then deliberately applies the winner to prod. No auto-sync.
0b. [ ] **🅿️ Per-customer account view (owner 2026-07-04) — spec `docs/specs/admin-user-view.md`.**
   Make each Users row clickable → a detail panel showing their plan/tier, entitlements (the 8
   features), credits (quota+PAYG), saved zones, schedules, recent checks + lifetime spend. DevOps
   builds `GET /api/admin/users/:id` + a grant-credits endpoint; you build the panel + comp/grant actions.
0c. [ ] **🗑️ Remove the Admin "Zones" area (owner 2026-07-04).** Owner manages zones from their own
   account now (consumer Manage Zones). Delete the Zones tab/UI in `public/app.html` (~30 refs).
   DevOps removes the `/api/zones*` endpoints when consumer `/app/zones` ships (no gap). The zones
   ENGINE stays — don't touch the tables/service.
1. [ ] **Fix the admin** so it's up to date (it lagged during the website/admin split).
2. [ ] **Voice-switcher + tree-learner ready to test** — confirm the Haiku-nav → Sonnet-human switch
   (`connectOnHuman` flag + Helicone) and the phone-tree learner (Tree Trainer) are wired. Code:
   `src/llm.ts`, `src/voice/bridge.ts`, `src/calls/tree-learn.ts`; spec: the caller-tech spec in git history.
3. [ ] **Clean up the admin UI** to match the website's look; correct **call-status icons** (verdict marks). (Fungie will give look/feel detail.)
4. [ ] **Spec + build the AGENT PERSONAS (you own the plan).** The agents: the in-admin "Admin dev"
   agent, an on-site **customer-support** agent, a **Discord** support bot, and **call routing** —
   all through the **Helicone gateway** (`src/llm.ts`), cheapest-model-per-job, with **3-tier
   escalation** (FAQ → Claude → human ticket) and a **RAG knowledge base** (Qdrant) that grows as
   customers ask. Goal: one operator runs support + ops via agents. Read first:
   `docs/business/ROADMAP.md`, `docs/business/ROADMAP.md`, `docs/finance/COST_MODEL.md`. Spec before building.
5. [ ] **With personas in place, run the voice-switcher + tree-learning TEST** — a bench test call:
   cheap model navigates the IVR → Sonnet takes over on human pickup → the tree is learned + written
   back. Show which model handled each phase + the cost. (`connectOnHuman` OFF except on the bench.)
- [ ] (supports Website) "Create your agent" caller-ID panel using `/auth/callerid/start` + `/status`.
- [ ] (voice) **Kiosk call script** — when `kioskMode` is set, the agent asks "is your Pokémon kiosk
  working/stocked?" instead of the shipment question. Spec: the kiosk spec in git history (`src/voice/prompts.ts`).

When you finish something: move it to git history; leave Current focus set for the next chat.
