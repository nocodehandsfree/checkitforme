# The launch gate (Playwright E2E)

One command drives every user journey end to end in a real browser. **Run it against staging
before every promote, and against prod right after.**

```bash
bash scripts/launch-gate.sh            # full gate: local dial-side journeys + live staging journeys
bash scripts/launch-gate.sh staging    # live staging only
bash scripts/launch-gate.sh local      # dial-side journeys only (throwaway server, no network writes)
bash scripts/launch-gate.sh prod       # read-only @safe subset vs production + the Admin UI tabs
```

Exit 0 = green, 1 = red. `ADMIN_TOKEN` is self-fetched from Railway when `RAILWAY_API_TOKEN` is
in the env; without it the admin specs skip (loudly).

## What runs where — and why the split exists

**Staging runs real calls** (`STAGING_CALLS=1` — the owner tests voice there), so the live-staging
pass must NEVER press the final dial. The dial-side journeys run instead against a local throwaway
server where outbound calling is hard-disabled (`assertCallsEnabled` throws; the consumer check
path returns the scripted staging sim). Nothing the gate does, in any mode, can ring a store or
the owner's phone.

| Journey | staging (live) | local (throwaway) | prod (read-only) |
|---|---|---|---|
| signup: phone → code → logged in | ✅ UI (fixed staging code) | ✅ UI | — |
| find store → call sheet | ✅ UI, stops at the dial | — | — |
| check → verdict | — | ✅ sim call settles in/out/maybe | — |
| upgrade + pay | ✅ Stripe TEST 4242 through the REAL webhook | — | — |
| scheduled check | ✅ create→list→delete (always deleted) | ✅ + members-only gate | — |
| zones | ✅ sheet + create/quote/delete (never fired) | ✅ fire + run aggregation + paywall | — |
| brand skins ×4, console errors, plans, stores/near | ✅ | — | ✅ |
| admin backend (policy/results/statuses/overview) | ✅ token header | — | ✅ |
| Admin UI tabs (Calls/Statuses/Chains/Testing) | — | — | ✅ admin.checkitforme.com |

Files: `journeys.spec.ts` (staging writes) · `local.spec.ts` (dial side) · `consumer.spec.ts` +
`admin-api.spec.ts` (@safe, run everywhere) · `admin.spec.ts` (Admin UI, prod pass) ·
`helpers.ts` · server boot for local: `scripts/e2e-local-boot.ts`.

## Things the gate knows that you should too

- **One fresh account per staging run** (fictional +1310555… number; staging's fixed login code —
  no SMS is ever sent). The signup UI test consumes 1 of the 8/hr per-IP `/auth/phone/start` slots,
  so more than ~8 gate runs an hour will 429 the signup test.
- **The pay journey creates a real Stripe TEST subscription** each run (test mode only — it
  asserts the entire pipe: checkout-intent → Elements confirm → webhook → entitlement on
  `/app/me`). This is the test that caught the 2026-07-14 "paid but no plan" webhook-shape bug.
- **Schedules are deleted in a finally block** — a leftover schedule on staging would really dial.
- **Agent sandboxes**: config auto-detects the TLS-intercepting proxy (HTTPS_PROXY) and caps the
  browser at TLS 1.2 (the proxy resets TLS 1.3 hellos), and uses the pre-installed Chromium at
  `PLAYWRIGHT_BROWSERS_PATH`. Elsewhere: `pnpm exec playwright install chromium` once.
- Debug a failure: `npx playwright show-trace test-results/<test>/trace.zip`, or run one spec:
  `E2E_TARGET=staging ADMIN_TOKEN=… npx playwright test journeys.spec.ts`.

## Later: production monitoring
Wrap the @safe specs in **Checkly** (built on Playwright) to run every few minutes against prod
and alert on a broken path. Same code, no rewrite.
