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
- [ ] 🟢 **Treasure Hunt + Hobby sections (NEW — Data Dev's thrift rail is staged in prod).** 3,479 thrift
  stores are live (Goodwill / Salvation Army / Savers / Unique), tagged `chains.type = "Thrift"`, **muted**
  (staged) and **off the MSRP scoring** (no tier, never `isMSRP=false`). Design + build how these surface to
  end-users. Fungie's model:
  - **"Treasure Hunt"** = thrift (`type=Thrift`). Used/random product, **not** scored like MSRP retailers —
    no green tier ranking, just a browsable list. A **user toggle (checkbox)** turns it on/off, **off by
    default** so it never crowds the MSRP list.
  - **"Hobby"** = a *future* rail (`type=Hobby`, not imported yet) — card/comic/toy shops selling **sealed,
    often over-MSRP** product. Its own section, also off the MSRP score (above-MSRP would otherwise score a
    "1" and get blocked off the list).
  - **DevOps contract needed:** muted chains are hidden by `/pub/stores/near`, so **do not just un-mute**
    (that would dump 3.5k thrift into the main MSRP list). Decide a surfacing param — e.g.
    `/pub/stores/near?section=thrift` (or `?include=thrift,hobby`) that returns the muted, `type`-tagged
    chains only for the toggled section. Leave a `DevOps: need …` note; don't change the contract yourself.
  - **Data Dev dependency:** Goodwill / Salvation Army / Savers / Unique have **no logos yet** — needed
    before this looks shippable. (TJ Maxx/Marshalls/HomeGoods logos already render.)
  - Context: today's import + tagging is logged in `docs/COMPLETED.md` (2026-06-19).
- [x] ✅ **Sign-up modal → cell phone + SMS code** (done 2026-06-16, see `docs/COMPLETED.md`). The auth
  modal now uses `POST /auth/phone/start` → `POST /auth/phone/check` → `{token,account}`; the token is
  saved (`localStorage check_session`) and sent as `Authorization: Bearer` on `/app/*` (`appApi`, with
  Clerk/OAuth fallback). `autocomplete="one-time-code"` on the code input; Continue/Verify are
  brand-green; account sheet shows the phone. The check gate routes to phone sign-up when
  `requirePhoneSignup` is ON (flag still OFF — **DevOps can flip it now** to go phone-first).
- [x] ✅ **"Most likely" + tier grouping + kiosk calling** (2026-06-17, see `docs/COMPLETED.md`).
  Store results group by tier (green tier-5 "Best near you" → amber tier-4 → all; reads `tier`/`inStock`,
  inert until Data Dev's tagged list lands). Kiosks were REVERTED out of "find a store" → they live in
  the **Kiosk tab** and are **callable**: tap → "Check [store] kiosk" CTA (bypasses `callable:false`) →
  confirmation modal ("we'll call to check the machine" + Yes/No + the free-check receipt carrot) →
  `kioskMode:true`. Kiosk tab persists across reloads. In-stock uses the real brand check everywhere.
- [x] ✅ **Verified-number calling (caller-ID)** (done 2026-06-17). Account sheet → "Call stores from
  your number" (phone-authed only) → verify modal: `POST /auth/callerid/start` → Twilio calls + shows
  the code → poll `GET /auth/callerid/status` → done. Backend already dials `/app/check-live`
  `From: account.callerId`, so verified users' calls show their own number. (`/app/me` returns
  `callerIdReady`.)

## ⚠️ Waiting on other lanes
- 🔴 **Kiosk call SCRIPT** (Voice/Admin — `src/voice/prompts.ts`, branch on `{{kiosk_mode}}`): the
  consumer kiosk-call flow is LIVE, but a kiosk call won't ask *"is the machine working/stocked?"* until
  the agent script lands. **Owner is adding it.** Don't promote kiosk calling end-to-end until then.
- 🟡 **Kiosk result statuses** `kiosk_working` (✅) / `kiosk_unavailable` (✕ + reason): admin registry
  rows + a `kiosk_status` extraction field (DevOps/Voice). Consumer auto-renders registry statuses;
  Website still owes the *"Working → forward your receipt = free check"* nudge.

When you finish something: move it to `docs/COMPLETED.md`; leave Current focus set for the next chat.
