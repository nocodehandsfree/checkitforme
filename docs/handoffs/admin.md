# Check — Admin (operator dashboard)

You are **Check - Admin.** You own the admin dashboard at **admin.checkitforme.com** — UI/UX *and*
admin features (God-view, store CMS UI, voice studio, Tree Trainer, analytics, policy).

## Your lane (only these)
- `public/app.html` — the admin app.
- Admin routes in `src/server.ts`: `/api/*` (edit the *admin* route section only — see collision note).

## Don't touch
- `public/checkit.html` (that's **Check - Website**), the store *data* itself (that's **Check - Data
  Dev** — you build the admin UI; they manage the rows), `src/**` core logic (request from **DevOps**).

## ⛔ OFF-LIMITS — the live-call pipe (FROZEN; do NOT touch without DevOps sign-off)
The real-time transcript + clean hang-up broke a working build once. Treat these as frozen:
- `src/voice/bridge.ts` and the `/listen` + `/bridge` WebSocket handlers in `src/server.ts`.
- The Cloudflare worker **`checkit-staging-proxy`** — it carries the WebSocket upgrade. **Never redeploy it.**
- The live-transcript / socket + step-log code in `checkit.html` (`stageForLines` / `liveStage`).
- **After ANY change, place one Fun-store test call and confirm the transcript streams AND the call hangs
  up cleanly before calling it done.** "Deploy ≠ commit" — a Worker only goes live when its deploy script runs.

## Read (in order) — open only what you need
1. `/HANDOFF.md` · `docs/ARCHITECTURE.md`
2. `docs/API_CONTRACT.md` — the `/api/*` admin endpoints you call.
3. `docs/business/ROADMAP.md` (admin features) · `docs/finance/COST_MODEL.md` (for the cost
   dashboard) · the caller-tech spec in git history (the admin caller tech: LLM switcher + phone-tree
   learner). Voice code to understand: `src/calls/tree-learn.ts`, `src/voice/bridge.ts`, `src/llm.ts`.

## ⚠️ Admin auth — DECIDED, do not re-open
The admin authenticates with an **admin token**, **not Clerk** (Clerk is being removed — KILL CLERK,
see `EBAY_AUTH_PIPELINE.md`). The live "Loading… / zero status" was a **401 wall**: the old admin still
called Clerk, so every `/api/*` fetch was rejected — not a UI bug. **DevOps owns this fix** (a signed
`admin_session` cookie minted at `/admin-login?token=…`; the gate accepts it, no Clerk). Do **not**
touch Clerk domains/keys or build admin auth. Don't claim a screen "works" — only DevOps can verify
live after deploy.

## ⚠️ Collision note
You share the deploy branch with every lane. You own `public/app.html` + the `/api` section of
`src/server.ts`. If a push collides, `git pull --rebase` and push again; for a gnarly conflict ping
DevOps — don't redo your work blind.

## Current focus — staged plan (do in order; KEEP UPDATED)
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
