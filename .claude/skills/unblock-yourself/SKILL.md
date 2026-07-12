---
name: unblock-yourself
description: >-
  Load the instant you're about to tell the owner you lack access, an account, a
  password, a token, a plan, or a way to test something. Triggers on "I can't
  access / I don't have / I need permission / I need an account / this is
  admin-gated / can you give me". It lists every self-serve path — Railway
  secrets, admin token, a throwaway test account, comping yourself premium, the
  Fun store for test calls, the site-health script — so you exhaust them BEFORE
  asking the owner. Only ask him after these genuinely fail.
---

# Unblock yourself

The owner runs everything from his phone. "I can't access X" is almost always wrong — the access is
in Railway or a self-serve endpoint. Try these first; ask him only after one real failure (don't loop).
Every path below is verified against the code; line refs are the home for the detail.

## 1. Any secret → Railway (`RAILWAY_API_TOKEN` is pre-embedded in this env)
Reads/writes every var (DB, `ADMIN_TOKEN`, Stripe, EL, Twilio, `GITHUB_PAT`, `FUN_STORE_PHONE`, comp
lists). Full curl + service IDs live in **`CLAUDE.md` → "Secrets — self-serve from Railway"** — use it,
don't paste secrets into files. **curl only** (urllib/WebFetch 403 through the proxy and look like
"Railway is down"). Prod svc `d363a982-…`, staging svc `8165df7a-3bdf-41a5-bdce-24883633a096`.

## 2. Admin API → the admin token
Every `/api/*` accepts header `x-admin-token: <ADMIN_TOKEN>` (server check `src/server.ts:174`), or mint
the cookie by visiting `/admin-login?token=<ADMIN_TOKEN>` (`src/server.ts:191`). Admin API also needs a
browser User-Agent (non-browser UA → Cloudflare 1010). One admin only: `admin.checkitforme.com`.

## 3. A test account (no telephony) — staging phone-auth bypass
`POST /auth/phone/start {"phone":"+1XXXXXXXXXX"}` then `POST /auth/phone/check {"phone":"+1…","code":"000000"}`
— on staging the SMS is skipped and the fixed `STAGING_LOGIN_CODE` (default `000000`) is accepted
(`src/auth.ts:46-62`). Returns `{token, account}`; use `Authorization: Bearer <token>` for `/app/*`.
Wipe/reset any account: `POST /api/admin/users/:id/delete` (`?dry=1` to preview) — delete IS the reset
(`src/server.ts:3722`).

## 4. Comp yourself premium (so gated/premium UI actually renders)
An account is "comp" (ALL entitlements on, credits shown as 9999, Fun store unlocked) if its phone/email
is on `COMP_PHONES` / `COMP_EMAILS`, or it's the master `OWNER_PHONE` (`src/billing.ts:37-52`,
`src/plans.ts:151`). Simplest: **sign in as the master phone** (it's always comp). Otherwise add your
test phone to `COMP_PHONES` in Railway (write = the `variableUpsert` GraphQL mutation; the read query is
in CLAUDE.md) and re-login. There is **no** per-user admin "grant credits" HTTP endpoint — comping is
env-var based.

## 5. Fun store test calls (never touches real-store stats)
The "Fun" store is a seeded `ownerOnly` retailer that dials `FUN_STORE_PHONE` (owner's cell). Fire a
call: `POST /api/call-now {"retailerId":<Fun id>,"categoryId":<id>}` (`src/server.ts:5054`) — the same
thing the admin "Call now" button posts. Look the Fun store's id up at runtime (retailer `name="Fun"
AND ownerOnly=true`); results land in `GET /api/admin/test-calls`. Related: `POST /api/simulate` (call
your own number as if it's a store), `POST /api/talk` (call any number).

## 6. Is the site healthy? — one command, no owner needed
`node scripts/site-health.mjs https://staging.checkitforme.com` walks every page + form across all four
brands and reports anything broken (JS errors, failed requests, dead views). No arg = local throwaway
server with write-form coverage. Header: `scripts/site-health.mjs:1-11`.

## Recheck (drift)
Endpoints/vars verified 2026-07-11 against `origin/staging`. If a route 404s, confirm it deployed
(content marker, not a 401) and re-grep `src/server.ts` — the app is one file and moves fast.
