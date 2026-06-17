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
You share the deploy branch with every lane. You own `public/checkit.html` + the `/pub` +
consumer-page section of `src/server.ts`. If a push collides, `git pull --rebase` and push again;
for a gnarly conflict ping DevOps — don't redo your work blind.

## Current focus (KEEP UPDATED)
- [x] ✅ **Sign-up modal → cell phone + SMS code** (done 2026-06-16, see `docs/COMPLETED.md`). The auth
  modal now uses `POST /auth/phone/start` → `POST /auth/phone/check` → `{token,account}`; the token is
  saved (`localStorage check_session`) and sent as `Authorization: Bearer` on `/app/*` (`appApi`, with
  Clerk/OAuth fallback). `autocomplete="one-time-code"` on the code input; Continue/Verify are
  brand-green; account sheet shows the phone. The check gate routes to phone sign-up when
  `requirePhoneSignup` is ON (flag still OFF — **DevOps can flip it now** to go phone-first).
- [x] ✅ **Kiosk / "most likely" UI** (done 2026-06-17, see `docs/COMPLETED.md`). Star marker + "Most
  likely" label on the best-bet row; double-green-highlight fixed; kiosk-only stores
  (`hasKiosk && !sellsPacks`) now show in the call list with a "Kiosk only" badge + pre-call note and
  send `kioskMode: isKioskOnly(store)` on the 4 check bodies (server auto-detects too; Voice consumes
  the live `kiosk_mode` var).
- [x] ✅ **Verified-number calling (caller-ID)** (done 2026-06-17). Account sheet → "Call stores from
  your number" (phone-authed only) → verify modal: `POST /auth/callerid/start` → Twilio calls + shows
  the code → poll `GET /auth/callerid/status` → done. Backend already dials `/app/check-live`
  `From: account.callerId`, so verified users' calls show their own number. (`/app/me` returns
  `callerIdReady`.)

**No open Website items.** Next ideas when you want them: surface "calls from your cell" near the call
CTA for verified users; nudge unverified users to verify before their first call. Ask the owner.

When you finish something: move it to `docs/COMPLETED.md`; leave Current focus set for the next chat.
