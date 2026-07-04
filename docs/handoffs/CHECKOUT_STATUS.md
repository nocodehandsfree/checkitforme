# Checkout status — branded on-site Stripe Elements (Website → DevOps/Owner)

_Last verified: 2026-07-03 on `staging.checkitforme.com` (test-mode Stripe)._

## What Website shipped (staging branch, live)
- **Plans sheet is now 100% live off `GET /pub/plans`** — 4 tiers (Family/Collector/Hunter/Operator),
  the "EVERY PLAN GETS" grid (from `everyPlanGets` + `features`), the PAYG ladder, monthly+annual
  prices. Nothing hardcoded. (`checkit.html`: `tiers()`, `paygBundles()`, `renderBuyGrid()`.)
- **Branded 6c checkout** — new `#coOverlay` bottom sheet styled to `NEW_CHECK_COMPS`. It calls
  `POST /app/checkout-intent {kind, annual}`, loads Stripe.js, mounts the **Payment Element** with an
  appearance API matched to the comp, and confirms with `stripe.confirmPayment({redirect:'if_required'})`,
  then polls `/app/me` and shows the 6d "You're in" sheet. **Never Stripe's hosted page.**
- **Graceful fallback**: if `/app/checkout-intent` returns no `clientSecret` (see blocker below), the
  sheet transparently drops to the existing hosted redirect (`POST /app/checkout` → `{url}`), which works.

## VERIFIED end-to-end with test card 4242 (staging)
- New phone account (fixed dev code) → 1 free check.
- `POST /app/checkout-intent {kind:"payg:25"}` → real `pi_… / pk_test…`, amount 1999.
- Confirmed the PaymentIntent with `pm_card_visa` (4242) → `succeeded`.
- Webhook granted the bundle → `/app/me.credits` went **1 → 26**. ✅ PAYG branded checkout is fully live.

## Staging change I made
- Ran **`POST /api/admin/plans/publish`** (God View → Plans → Publish) on staging so all 4 tiers now
  carry Stripe price IDs (`family/collector/hunter/operator` monthly+annual). Idempotent + test-mode.
  Prod is untouched — publish there when ready.

## BLOCKER — subscription-tier Elements intent (DevOps, `src/billing.ts`)
`createCheckoutIntent` subscription path returns `null` → endpoint answers `checkout_unavailable`, so
tier checkout can't run on the branded page (it currently falls back to the hosted redirect).

Root cause, confirmed by a direct Stripe API probe with the published `family` monthly price:
- `POST /v1/subscriptions {payment_behavior:default_incomplete, expand[]=latest_invoice.payment_intent}`
  → subscription `incomplete`, `latest_invoice` `open`, but **`latest_invoice.payment_intent` is absent**
  (and `confirmation_secret` absent) under the account's current Stripe API version.
- billing.ts:262-263 reads `sub.latest_invoice.payment_intent.client_secret` → undefined → `return null`.

Fix options (DevOps): pin/raise the Stripe API version that returns `latest_invoice.payment_intent`, OR
switch to `expand[]=latest_invoice.confirmation_secret` and return `confirmation_secret.client_secret`,
OR create the first-invoice PaymentIntent explicitly. PAYG (one-time PI) already works, so only the
subscription branch needs this. The moment it returns a `clientSecret`, the Website sheet lights up for
tiers with zero client changes.

## `me.features` per-tier gating — DONE (2026-07-04, both halves)
- **Consumer (checkit.html):** every premium module hides when the tier lacks the feature via
  `hasFeature(key)` — auto-checks (`scheduled_checks`), restock alerts (`restock_alerts`), Hobby/exact
  products (`exact_products`), Thrift chip (`thrift_hunts`), any-town relocate (`any_town`). Comp → all;
  free/PAYG → none; core free-check flow never gated; v1 untouched. Tests: `scripts/qa-gating.mjs` (17).
- **⚠️ Server-side enforcement still needed (DevOps):** the consumer gating is cosmetic. A subscriber
  whose tier loses `scheduled_checks` has their existing auto-checks HIDDEN in the UI but the scheduler
  keeps firing + charging (`src/customer-schedules.ts:67-71`), and `POST /app/schedule`
  (`src/server.ts`) still accepts new ones. Gate both on `accountFeatures(...).scheduled_checks` (comp →
  true), or make the client list existing schedules cancel-only when the feature is off. Same principle
  for restock/exact — the hard gate must live server-side; the UI hide is UX only.
- **Admin (app.html God View → Plans):** added the 8-feature per-tier checkbox matrix; `savePlansDraft`
  now POSTs `features` (previously dropped, so an OFF never persisted). Verified end-to-end: uncheck
  `scheduled_checks` for Family → `/pub/plans` + `/app/me.features` reflect it → the auto-check module
  vanishes for Family subscribers. Test: `scripts/qa-admin-plans.mjs`.

## NEW blocker — subscription ACTIVATION webhook (DevOps)
DevOps's `confirmation_secret` fix works: `POST /app/checkout-intent {kind:"family"}` now returns a real
`clientSecret`, and confirming with test card 4242 → PaymentIntent **succeeded**. BUT `/app/me` stays
`subscription:"none"` / `subTier:null` after payment (polled ~25s) — the subscription-activation webhook
isn't flipping the account. **PAYG activation works fine** (payment_intent.succeeded → credits granted),
so this is specific to the subscription path: verify `handleStripeEvent` activates the account on
`invoice.payment_succeeded` / `customer.subscription.updated` (status active) and maps by
customer/`metadata.clerkUserId`. Until then, a bought tier charges but the account doesn't upgrade.
