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
- **Dev/scratch routes in prod:** `/logo-wall`, `/check-lab`, logo-preview tiles (~120 lines)
  → delete or move behind an admin-only/dev flag.
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

## Tool decisions (resolved)

- **Qdrant → drop it; use TiDB for vectors too.** TiDB Serverless has built-in vector search —
  plenty for a FAQ KB. One database for relational + RAG = fewer parts. (Reverses the earlier
  Qdrant call since nothing's set up yet and you want consolidation.)
- **Sentry = backend** (it's already running) — best-in-class error tracking/alerting for this
  service. **PostHog = frontend/product** (funnels, replay, flags; can replace GA4) — that's the
  Frontend/Admin lanes' tool, not the backend's. Don't double up on the backend.
- **Helicone = the single LLM gateway** for all agents (admin chat, on-site customer agent,
  Discord bot, call routing). One endpoint, cost-per-call logging (feeds cost-per-check),
  caching, fallbacks. ⚠️ Realistic note: Helicone centralizes + observes + can route/fallback,
  but it does **not** auto-pick "the best model" — we still set cheap-vs-premium per use case
  (e.g. Haiku for FAQ, Sonnet for the human call). It just makes that one place + measurable.

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
6. [ ] Draft the **API contract doc** (freeze target) from the current endpoints — ready to hand
   to Frontend/Admin the moment we un-freeze.
7. [ ] Draft the **CI/CD workflow** (typecheck + `test-all.sh` + gitleaks) as a file to drop in.

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
