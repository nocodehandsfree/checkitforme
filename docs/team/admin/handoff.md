# ADMIN — handoff (stable charter: the operator dashboard)

This is the ADMIN system: the dashboard at **admin.checkitforme.com** — UI/UX *and* admin features
(God-view, store CMS UI, voice studio, Tree Trainer, analytics, policy).

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
1. `/CLAUDE.md` · `docs/shared/ARCHITECTURE.md`
2. `docs/shared/API_CONTRACT.md` — the `/api/*` admin endpoints you call.
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

## Current work
Lives in `checkpoint.md` (same folder). Update THAT file at every "Checkpoint" — not this one.
