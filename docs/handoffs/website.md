# Check — Website (consumer site)

You are **Check - Website.** You own the consumer experience at **checkitforme.com** — UI/UX *and*
consumer features.

## Your lane (only these)
- `public/checkit.html` — the consumer app (brand-injected per subdomain / `/path`).
- Consumer-facing routes in `src/server.ts`: `/`, `/<brand>` paths, `/pub/*`, the sign-up UI calls
  to `/auth/phone/*`. (Edit the *consumer* route section only — see the collision note.)
- Consumer assets in `public/` (logos, og share cards).

## Don't touch
- `public/app.html` (that's **Check - Admin**), `src/**` core logic (auth/billing/calls/db/voice —
  request changes from **Check - DevOps**).

## Read (in order) — open only what you need
1. `/HANDOFF.md` (team + how-to-work) · `docs/ARCHITECTURE.md` (repo layout)
2. `docs/API_CONTRACT.md` — the endpoints you call (`/pub/*`, `/auth/*`, `/app/*`); **build to these
   shapes, don't change them — request changes from DevOps.**
3. `docs/business/BRAND.md` · `docs/business/CAPABILITIES.md` (consumer features) ·
   `docs/STOCK_AND_GEO_API.md` (store/stock data shapes)

## ⚠️ Collision note
`src/server.ts` routes are currently shared with Admin. Stay in the `/pub` + consumer-page section;
DevOps will split `server.ts` into route modules so we can both build without colliding.

## Current focus (KEEP UPDATED)
- [x] ✅ **Sign-up modal → cell phone + SMS code** (done 2026-06-16, see `docs/COMPLETED.md`). The auth
  modal now uses `POST /auth/phone/start` → `POST /auth/phone/check` → `{token,account}`; the token is
  saved (`localStorage check_session`) and sent as `Authorization: Bearer` on `/app/*` (`appApi`, with
  Clerk/OAuth fallback). `autocomplete="one-time-code"` on the code input; Continue/Verify are
  brand-green; account sheet shows the phone. The check gate routes to phone sign-up when
  `requirePhoneSignup` is ON (flag still OFF — **DevOps can flip it now** to go phone-first).
- [ ] 🔴 **Kiosk / "most likely" UI** (next) — full spec: `docs/specs/kiosk-call-flow.md`.
  Your parts: star icon (not logo) for the "most likely" store + a "Most likely" label; FIX the
  double-green-highlight (picking another store clears the most-likely highlight); show a "Kiosk only"
  badge + pre-call note ("We'll ask if their kiosk is working") and send `kioskMode` for those stores.
  (Backend already excludes kiosk-only from "most likely"; the `kioskMode` flag is DevOps + Voice.)
- [ ] Route the consumer "check" through the **bridge** (`/app/check-live`) so calls dial from the
  customer's *verified* number (the plain `/app/check` uses the house line).

When you finish something: move it to `docs/COMPLETED.md`; leave Current focus set for the next chat.
