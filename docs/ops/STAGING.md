# Staging ↔ Production — the mirror + workflow (READ FIRST)

`staging.checkitforme.com` is a **full, fully-working replica of production** you use to verify any
change **before** it touches live. This exists because we kept breaking prod with in-progress work.
**Every change Fungie can see goes through staging first.**

## The two environments

| | Production | Staging |
|---|---|---|
| URL | `checkitforme.com` (admin `admin.checkitforme.com`) | `staging.checkitforme.com` |
| Branch | `claude/retail-stock-voice-calls-OcyMS` | `claude/checkitforme-website-takeover-pagiis` |
| Railway service | `voice-caller` (`d363a982-…`) | `voice-caller-staging` (`8165df7a-…`) |
| Deploy | push → live ~3 min | push → staging ~3 min |
| Phone calls | real | **real** (`STAGING_CALLS=1`) |
| DB | prod volume | its own volume (separate by design) |
| `STAGING` env | unset | `1` |

## The workflow (do this for EVERY change / bugfix)

1. Make the change on the **staging** branch `claude/checkitforme-website-takeover-pagiis` → push.
2. **Fungie verifies** on `staging.checkitforme.com`.
3. **Promote = merge** the change into the prod branch `claude/retail-stock-voice-calls-OcyMS`
   (PR + merge) → prod auto-deploys.

Do **not** push UI/behavior straight to prod. (Tiny prod-only infra/data fixes that staging can't
show are the only exception — use judgment.)

## What is allowed to differ between the branches

Keep **`public/checkit.html` byte-identical** between staging and prod — verify anytime with:
```bash
git diff origin/claude/retail-stock-voice-calls-OcyMS \
         origin/claude/checkitforme-website-takeover-pagiis -- voice-caller/public/checkit.html
# empty = in sync
```
The ONLY by-design differences are the **staging-only machinery**, all dormant on prod because
`STAGING` is unset there:
- `scripts/checkit-staging-proxy.worker.js` + `scripts/deploy-staging-proxy.sh` — the Cloudflare
  reverse-proxy (terminates the cert for `staging.checkitforme.com`; **transparent, no auth**).
- `src/staging-sim.ts` and the `config.staging` / `STAGING_CALLS` guards in `server.ts`, `auth.ts`,
  `navigator.ts`, `voice/elevenlabs.ts`.
- `public/checkit-demo.html` — design reference, preview-only.

The **databases are separate** (each service has its own volume). That's intentional — staging test
calls must never write to live data.

## Env vars that make staging staging (set only on the staging service)

- `STAGING=1` — flips the consumer-default routing + `noindex` + the `STAGING_CALLS` switch. **There is
  NO password wall** — you log in with your phone exactly like prod (we removed the Basic/login gate;
  it was constant iOS re-prompt friction for no benefit).
- `STAGING_CALLS=1` — real telephony on staging. With it set, `config.callsEnabled` is true, so the
  call sim is skipped (real dials), SMS verify is real, and the no-real-calls kill-switches lift.
  (Unset = UI-only preview: sim calls, phone login accepts the fixed `STAGING_LOGIN_CODE`, default
  `000000`.)
- `FUN_STORE_PHONE` — seeds the owner-only **"Fun"** rehearsal store (tier 5, Calabasas), which dials
  this number. So the owner can place a real call to themselves and test the whole flow. Hidden from
  everyone except the master/comp account (`isComp` email / `isCompPhone` / owner-phone path).

`config.callsEnabled = STAGING ? (STAGING_CALLS==='1') : true`. Prod has `STAGING` unset → calls
always on; all staging code paths no-op.

## Logging in / being the owner on staging

Log in with your phone like prod. To see the Fun store you must be the **master/comp** account —
sign in with the **owner phone** (`OWNER_PHONE`, currently `+13106662331`); that account is mapped to
the master email → comp → the owner-only store appears and is callable. `COMP_EMAILS` / `MASTER_EMAIL`
are identical on both services, so comp status matches prod.

## How the domain works (cert workaround)

Railway can't issue a cert behind Cloudflare, so `staging.checkitforme.com` is served by a Cloudflare
Worker (`checkit-staging-proxy`) that reverse-proxies to the Railway origin
`voice-caller-staging-production.up.railway.app`. It's a **transparent** proxy (no gate) and just adds
`X-Robots-Tag: noindex`. Live audio/transcript WebSockets connect to that origin directly (the
`wsHost` returned by `/pub/check-live` is the staging origin when `STAGING=1`).

## Provisioning notes (already done — for reference)

- Staging Railway service deploys the staging branch, root `voice-caller/`, its own volume.
- Env: copy prod's app vars, then set `STAGING=1`, `STAGING_CALLS=1`, `FUN_STORE_PHONE`. (The
  voice-caller does NOT use TiDB/Qdrant; Redis is optional — don't copy those.)
- Seed store data the same way prod is (import → `/api/stores/dedupe` → `/api/stores/grade-from-defaults`
  using `data/source/chain-scoring-2026-06/chain_scores_final.csv`), or copy prod's SQLite for an exact
  data mirror.
- Deploy the worker: `CLOUDFLARE_API_TOKEN=… bash scripts/deploy-staging-proxy.sh`.
