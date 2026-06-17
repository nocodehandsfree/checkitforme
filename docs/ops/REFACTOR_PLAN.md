# Refactor & Parallel-Work Plan — for review before any code changes

Purpose: (1) enable two agents to work in parallel without colliding, (2) cut lines/
duplication, (3) set up the scale work. **Review this and send feedback before changes start.**
Scope: `voice-caller/` only.

---

## The seam: how we run two agents in parallel

The frontend talks to the backend **only** over HTTP JSON. That's the clean split:

- **Lane A — Frontend/UI** (your other dev): owns `public/runner.html` + `public/app.html`
  (~5,250 lines, ~half the repo). Touches **no** `src/**`. Consumes the frozen endpoints.
- **Lane B — Backend / DevOps / Security** (this chat): owns `src/**`, DB, Redis, queue,
  billing, monitoring, telephony. Keeps every endpoint's **request/response shape identical**.

Two things make this safe (neither fully exists yet — do them FIRST):

1. **Freeze an API contract.** Document every `/pub/*`, `/app/*`, `/api/*` endpoint's request +
   response shape (start from `docs/STOCK_AND_GEO_API.md`). Backend may not change a shape
   without a contract bump; frontend may not invent endpoints — it requests them from backend.
2. **Split `server.ts` (1,844 lines).** Today both lanes would fight over this one file. After
   the split, each works in different files on separate branches → no conflicts.

**Workflow:** separate branches per lane (use git worktrees), small PRs, the contract doc as
the referee. Frontend never edits `src/`; backend never edits the HTML.

---

## Recommended `server.ts` split (route modules)

Keep `server.ts` as a thin bootstrap (app, middleware, ws upgrade, intervals). Move routes to:

```
src/routes/
  public.ts      # /pub/* consumer reads + check/charge
  app.ts         # /app/* authed customer (me, check, schedule, referral, history)
  admin.ts       # /api/* admin (stores, chains, policy, statuses, agent, metrics)
  webhooks.ts    # /webhooks/stripe, /webhooks/elevenlabs
  pages.ts       # /, /r, /s, /p/:slug, og/logos/sitemap/robots
  bridge.ts      # /twiml, /pub/bridge*, ws relay glue
```

This adds files but each is small and single-owner — fewer lines to hold in your head, fewer
merge conflicts. (Honest trade: "fewer files" and "safe to change" pull opposite ways; we
optimize for *less to reason about at once* + *less duplication*.)

---

## Line/duplication cuts (real reductions)

- **Auth guard repeated 14×** in `/app/*` handlers (`verifyClerkToken` + `getAccount` + comp
  check) → one middleware. Removes copy-paste + a class of bugs.
- **Store-row mapping duplicated** in `/pub/stores` and `/pub/stores/near` (+ best-bet) → one
  `toStoreRow()` helper.
- **Chain maps rebuilt** (types/names/muted/stockMethod) in ~5 endpoints → one cached accessor.
- **Dev/scratch routes in prod:** `/check-lab` → delete or move behind an admin-only/dev flag.
  (`/logo-wall` is now the canonical logo QA mirror — keep; it shares the LogoTile component.)
- **Rate-limit boilerplate** → one wrapper.

## Frontend cuts (Lane A — note for the other dev)

- `runner.html` is 272 KB / 3,121 lines, parsed on **every** cold load — the real speed lever.
  Extract inline JS/CSS into cached static assets (repeat visits stop re-downloading), minify,
  and de-dup components shared between `runner.html` and `app.html` (admin reuses consumer
  pieces). This is Lane A's call; backend just keeps the asset routes/cache headers ready.

---

## Speed / scale optimizations (ranked by payoff)

1. **DB indexes** — retailers(lat,lng), state, active, phone. Turns 100k-row scans into seeks.
2. **Edge-cache public reads** at Cloudflare (store-types, categories, statuses, policy subset).
3. **Analytics → SQL** (pulse/overview/restock-intel/store-intel currently load whole tables).
4. **Extend `refcache`** to more hot read paths.
5. **Queue for schedulers** (also fixes the can't-run-2-instances correctness bug).
6. **Frontend asset extraction + minify** (Lane A).

---

## Order of operations (Lane B — this chat)

**0. Enablers (do first — unblocks parallel work):**
  - Freeze API contract doc.
  - Split `server.ts` into route modules + the de-dup helpers.
  - Wire voice-caller into **CI** (GitHub Actions: run `tsc --noEmit` + `scripts/test-all.sh`
    on every push so a typo can't reach prod — today CI only builds the phone app).

**1. Money & safety (highest risk):**
  - Hard Twilio time-limit + wire bail enforcement.
  - Global spend kill-switch.
  - Server-side atomic billing + one-check-per-store-per-day + rate-limit money endpoints.

**2. Scale foundation:**
  - Redis (rate limits, idempotency, locks).
  - Queue / single-leader for schedulers.
  - TiDB migration + indexes + analytics-to-SQL.

**3. Platform:**
  - Sentry + spend/health dashboard + status-page-per-service + downtime banners.
  - Phone-verify (Twilio Verify) + user-number-as-caller-ID.

---

## What to tell the other (frontend) dev

- Work only in `public/*.html`. Do not edit `src/**`.
- Build against the frozen contract. Need a new endpoint or a shape change? Request it from
  backend — don't change contracts yourself.
- Own branch (worktree), small PRs.
- Owns the frontend asset extraction/minify work above.

### Branding TODO (front-end / owner)
- **Replace the Fungibles logo on the sign-in screen with a new "Check It For Me" logo.** Keep the
  "powered by Fungibles" mark in the footer. (Owner is creating the new logo asset.)

## Team shape — 3 lanes (owner's call; works with strict boundaries)

3 code lanes is fine **only after** the contract freeze + `server.ts` split, with hard file
ownership. The collision risk is shared code; the split removes it. Ownership map:

| Lane | Owns (files) | Owns (scope) |
|---|---|---|
| **Frontend** (UI/UX dev) | `public/runner.html`, `src/routes/public.ts`, `src/routes/pages.ts` | consumer features + UX |
| **Admin** (data dev) | `public/app.html`, `src/routes/admin.ts`, `src/stores-import.ts`, `src/brands.ts`, admin-agent tools | admin features/UX + data hygiene (logos, store info, types, values) |
| **Backend/DevOps/Sec** (this chat) | everything else in `src/**` (db, billing, calls, voice, ratelimit, policy, redis, queue), `webhooks.ts`, CI/CD, monitoring, **the contract** | scale, security, infra |

Rules that make 3 lanes safe:
- The **API contract is owned by Backend**; Frontend/Admin request changes, don't make them.
- **Shared UI components** duplicated across `runner.html`/`app.html` → extract into ONE shared
  file owned by Frontend; Admin imports it. (Otherwise the two lanes diverge.)
- Each lane on its own branch/worktree. Data dev only edits store/admin files, never core infra.
- Context limits: long-lived role chats; hand off via `HANDOFF.md`/`KNOWLEDGE_TRANSFER.md`.

## Sequencing with the live frontend work (freeze-then-implement)

Owner is mid-flight on a frontend batch. Plan:
1. UI/UX dev finishes current work → merges.
2. **Freeze** (no one edits shared files).
3. Backend does the enablers + money/scale work (this lane).
4. Un-freeze; brief the dev; resume parallel.

Backend can do **infra prep during the freeze without touching the repo**: TiDB caller DB +
Redis namespace + Sentry/PostHog project + Railway vars + CI/CD setup. (Needs `RAILWAY_API_TOKEN`.)

> Money/safety items #2 (call cost cap), #4 (server-side atomic billing), #5 (rate-limit money
> endpoints + one-check-per-store-per-day) are in "Order of operations → 1. Money & safety" above.

---

## Findings from Railway (confirmed 2026-06-14)

- **`DATABASE_URL = file:/data/local.db`** — SQLite on a Railway **Volume**. So data *persists*
  (good — explains the 100k stores surviving deploys), BUT a volume attaches to **one instance
  only**. This is the hard blocker on horizontal scale: you literally cannot run a 2nd app
  instance against it. **TiDB migration is the unlock** (relational + scale + the indexes).
- **No `REDIS_URL` on the voice-caller service** — Redis exists in the project but isn't wired
  to this app yet. Needs adding.
- No `SENTRY_DSN` / `HELICONE_*` / `POSTHOG_*` on the service yet.
- ✅ `TIDB_PUBLIC_KEY` + `TIDB_PRIVATE_KEY` added to Railway (placeholder — overwrite later).

## Tool decisions (resolved — updated after seeing the live Railway project)

Live Railway services found: `api`, `voice-caller`, `redis`, `qdrant`, `browser-proxy`.
So Redis **and** Qdrant are already deployed (already being paid for).

- **Qdrant: use it for RAG** — it's already running and is purpose-built for vectors. (Earlier I
  said drop it for TiDB vector; reversed now that I can see it's deployed.) Only drop it later if
  cost-cutting and the FAQ vector set stays tiny → then fold into TiDB vector.
- **Observability: PostHog-only to start.** PostHog's free tier covers product analytics +
  session replay + feature flags + **error tracking** — enough for now, one bill avoided. Add
  Sentry later only if we need deep backend stack-traces. (Reversed my "Sentry=backend" once you
  flagged double-paying — PostHog free does both at our scale.)
- **Helicone = single LLM gateway** for all agents. Money-savers beyond routing:
  - **Response caching** — identical FAQ/agent prompts don't re-pay the LLM (huge for support).
  - **Per-feature / per-user cost analytics** — see exactly what each agent + each check costs
    (feeds cost-per-check) and kill expensive prompts.
  - **Per-user budget caps + rate limits** on LLM spend — stops a runaway agent (ties to the
    global kill-switch).
  - **Provider fallbacks** — fewer failed calls = fewer paid retries.
  - ⚠️ It centralizes + measures + routes/fallbacks; it does NOT auto-pick the best model — we
    still set cheap-vs-premium per use case.

## Data architecture — polyglot by use-case (your instinct, formalized)

The problem today isn't SQLite's capability — it's that the **one SQLite file lives on a Railway
volume that attaches to a single instance**, so the app can't scale horizontally, and all
concurrent writes serialize. Split by access pattern:

| Data | Store | Why |
|---|---|---|
| **Stores / chains / categories** (≈100k rows, read-heavy, rarely written) | **SQLite / libSQL embedded read-replica** (per instance) | Blazing local reads, no network hop, cheap; syncs from one primary. Perfect for a big static catalog. |
| **call_results, accounts/billing, watches, schedules** (concurrent writes at scale) | **TiDB** | This is the part that MUST be networked + multi-writer to run >1 instance. |
| **Rate limits, idempotency, locks, queue, live rooms** | **Redis** (`/1`, `caller:` prefix) | Ephemeral shared state. |
| **FAQ vectors** | **Qdrant** | Already deployed; purpose-built. |

Key insight that makes this cheap to do: the code **already joins in app-memory** (e.g.
`retailerMap()`), not via SQL joins across stores↔call_results — so splitting those two tables
across SQLite and TiDB is far less disruptive than a normal DB split. Phase it:
1. Move the **transactional tables** to TiDB → unlocks multi-instance now.
2. Keep stores in libSQL as a synced **embedded read-replica** → fast cheap reads everywhere.
This also saves money: TiDB only holds high-value transactional rows, not 100k static stores.

## Service wiring status (what I've done / what I need from you)

Done by me (Railway vars, no console access needed):
- [x] `TIDB_PUBLIC_KEY`, `TIDB_PRIVATE_KEY` added.
- [x] `REDIS_URL` wired → `redis://redis.railway.internal:6379/1` (own logical DB = isolated
  from the Fungibles app; code adds a `caller:` key prefix too).

Needs YOU (console login I don't have — the "like Clerk" steps):
- [ ] **TiDB:** create the caller cluster/branch + `voice_caller` database, copy the **SQL
  connection string** (password shows once) → paste it to me, I'll set `DATABASE_URL`.
- [ ] **PostHog:** create a project → give me the **Project API key + host** → I wire it.
- [ ] **Helicone:** create/copy a **`HELICONE_API_KEY`** → I wire it.
- [ ] **Qdrant:** confirm whether it needs an API key (if you set one) → give me, I wire it;
  otherwise I use the internal URL.

## Markdown / context-bloat cleanup

Only `CLAUDE.md` auto-loads into every session — that's the one that costs tokens on every run;
the rest load on demand. Recommendation:
- **Trim & keep (current/needed):** `CLAUDE.md` (tighten), `README.md`, `docs/STOCK_AND_GEO_API.md`
  (becomes the API contract), `GTM_READINESS.md`, `REFACTOR_PLAN.md`, one live priorities doc
  (`ROADMAP.md` or `LAUNCH_PLAN.md` — pick one).
- **Archive (historical logs, mostly `[x] done` noise):** `BUILD_PLAN.md` (11k), `ROADMAP_NIGHT.md`,
  `ADMIN_PLAN.md` — move to `voice-caller/docs/archive/` so git keeps them but agents don't read them.
- **Consolidate:** `HANDOFF.md` + `KNOWLEDGE_TRANSFER.md` overlap heavily → merge into ONE
  onboarding doc (keep `HANDOFF.md`, fold in the still-true bits, drop the rest).
- Net: from ~9 planning docs to ~5, and the historical 25k+ of done-logs out of agents' way.

## Security & key-rotation plan

- [ ] **One-time rotation of everything shared in plaintext chat:** the **Railway API token**
  (`dc05…`) and the **TiDB private key** (`2391…`) were pasted in chat — rotate both now.
  Sweep the rest while at it (Clerk, ElevenLabs, Stripe, Twilio, OpenAI/Anthropic, Gmail app pwd).
- [ ] **End-of-session Railway token rotation (standing policy):** generate a fresh
  `RAILWAY_API_TOKEN` per working session, revoke it at end of day. No long-lived token sits in
  an agent's reach. (Owner action: Railway → Account → Tokens → revoke + reissue.)
- [ ] **Never commit secrets** — secrets live only in Railway vars; the repo's `.gitignore`
  already excludes `.dev.vars`. Add a CI secret-scan (gitleaks) so a key can't be merged.
- [ ] **Least privilege:** confirm `ADMIN_TOKEN` and Clerk allowlist are tight; rotate
  `ADMIN_TOKEN` on the same session cadence.

---

## Backend setup tasks (do NOW during the freeze — no repo edits)

These touch infra/vars only, so they're safe while the frontend lane is live:

1. [x] Add `TIDB_PUBLIC_KEY` / `TIDB_PRIVATE_KEY` to Railway.
2. [ ] **Provision the caller TiDB database** (separate from the sports-cards DB) — create the
   cluster/branch + a `voice_caller` database; capture its SQL connection string. *(Needs the
   TiDB SQL connection string from the TiDB Cloud console — the API keys alone don't expose it.)*
3. [ ] **Wire `REDIS_URL`** into the voice-caller service (point at the existing Railway Redis;
   reserve a `caller:` key prefix / separate logical DB).
4. [ ] **Add `SENTRY_DSN`** (backend project) to Railway.
5. [ ] **Add `HELICONE_API_KEY`** to Railway.
6. [x] Draft the **API contract doc** → `docs/API_CONTRACT.md` (freeze target; hand to F/E + Admin).
7. [x] Draft the **CI/CD workflow** → `.github/workflows/voice-caller-ci.yml` (typecheck +
   `test-all.sh` + gitleaks; triggers only on `voice-caller/**` changes).

## Backend implementation tasks (AFTER un-freeze — touch the repo)

A. Contract freeze commit + `server.ts` split into route modules + de-dup helpers.
B. CI/CD live.
C. Money & safety: Twilio time-limit + bail enforcement; spend kill-switch; server-side atomic
   billing; rate-limit money endpoints + one-check-per-store-per-day.
D. Redis-backed rate limits / idempotency / locks.
E. Queue / single-leader for schedulers.
F. TiDB cutover + indexes + analytics-to-SQL.
G. Sentry + Helicone SDK wiring; cost-per-check dashboard; status-page-per-service + banners.
H. Phone-as-signup (Clerk Pro + Twilio Verify) + user-number caller ID; phone-tree auto-learn.
