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

## Follow-up — `me.features` gating (Website)
`hasFeature(key)` helper is in place (reads `/app/me.features`). The plans sheet is already correct
(PAYG has no subscription → no premium shown). The broader app-wide sweep to HIDE premium entry points
(thrift/hobby-exact-product/scheduled/restock/etc.) for pay-as-you-go accounts is a queued Website task.
