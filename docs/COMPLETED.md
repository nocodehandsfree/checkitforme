# Completed work (log)

Finished items live here so the active docs (HANDOFF) stay lean. Newest first. Agents: move done
items here from HANDOFF's "Current focus."

## 2026-06-17 — Data Dev: prod store-data cleanup (kiosk / 2 AM hours / names / dup-chains)
Applied LIVE to prod via the admin API (`PATCH /api/retailers/:id`, bulk `POST /api/stores/patch`); the
`openState` code fix shipped on the deploy branch. All changes verified fresh from prod.
- **"2 AM" bug** — `openState` now reads unknown/blank hours as **closed 01:00–06:00 local** (was: open
  around the clock); daytime unchanged, no consumer-call-gate changes needed. `scripts/test-store-hours.ts`
  (12 assns). Plus **150** fake all-day `00:00–23:59/24:00` stamps blanked (Walgreens/CVS/Safeway/Jewel/…;
  genuine-24h Wawa/Sheetz/Buc-ee's excluded).
- **Store names — "drop the dash"** (owner call): `Chain — City` → `Chain City`, **57,327** renamed across
  3 passes (state pull → chain×state sweep), **0 errors**, verified **0 dashed names remaining** in an 86.5k
  pull. Logos unaffected (every renamed row has a `chainId`, so logo resolves by chain not name-split).
- **Store-number junk** — **941** trailing `(#1234)` strips (`Burlington Dothan (#582)` → `Burlington Dothan`).
- **Dup chains** — `Sams`/`Franklin's Ace Hardware`/`Hallmark` confirmed **empty** (0 stores; already merged);
  3 empty chain rows await a chain-delete (no API endpoint yet).
- **Kiosk** — Pavilions verified `hasKiosk:true, sellsPacks:false` in prod.
- **Method note** — the read API caps at 1000 rows, so the name sweep enumerated by chain×state and looped
  PATCH. A `name`-strip transform on the bulk endpoint would make future name sweeps one server-side call.

## 2026-06-17 — website: verified-number calling (caller-ID UI) — consumer half
- Account sheet → **"Call stores from your number"** row (phone-authed users only — Clerk/OAuth tokens
  carry no phone, backend 401s them). Reflects `ACCOUNT.callerIdReady` (now on `/app/me`).
- **Verify modal:** `POST /auth/callerid/start` → Twilio calls the user + we show the validation code →
  poll `GET /auth/callerid/status` (~3s, ~100s cap) → done. Server already dials `/app/check-live`
  `From: account.callerId`, so verified users' checks show their own number on store caller-ID.
- `public/checkit.html` only; ES strings added. Shipped straight to the live deploy branch.

## 2026-06-17 — website: kiosk-only stores in call flow + "most likely" fixes
- "Most likely" best-bet row: **star marker** (not logo) + **"Most likely"** label (was "Best bet").
- **Double-green-highlight fixed:** picking another store drops the most-likely row's green highlight
  (star + label persist) — only one row green at a time.
- **Kiosk-only stores** (`hasKiosk && sellsPacks===false`) now appear in the call list with a "Kiosk
  only" badge + pre-call note; shelf shipment-day meta hidden for them. Sends `kioskMode: isKioskOnly`
  on the 4 check bodies. Hand-applied onto the deploy branch (merged with the `logoTile` refactor).

## 2026-06-16 — website: phone-first sign-up modal (consumer)
- Swapped the consumer sign-up modal (`public/checkit.html`) from **email → cell phone + SMS code**,
  wired to the live backend: `POST /auth/phone/start` → SMS, `POST /auth/phone/check` → `{token,account}`.
- Token stored in `localStorage` (`check_session`) and sent as `Authorization: Bearer` on every `/app/*`
  call (`appApi` prefers the phone token, falls back to a Clerk/OAuth token during cutover). Stale token
  (a definitive 401 on `/app/me`) self-clears. Code input uses `autocomplete="one-time-code"`.
- Continue + Verify buttons now **brand-green** (dropped the purple override). Account sheet shows the
  phone; sign-out clears the stored session.
- Check gate is **phone-first aware**: when `policy.requirePhoneSignup` is ON, an anonymous check opens
  phone sign-up and resumes the check after; `signin_required` (401) also routes to sign-up. Flag is OFF
  today, so the live anonymous/email flow is unchanged until DevOps flips it. Google/Discord OAuth kept.

## 2026-06-16 — DEPLOYED to production
- Merged the integrated branch → `main`; Railway deployed. Verified live on checkitforme.com
  (`/auth/phone/start`=400, health=200, prod security boot-gate passed). Full backend now live.
- Team model: per-role handoffs (`docs/handoffs/`), reorganized docs into `docs/{business,finance,
  security,ops}/`, lean Check-branded HANDOFF, consolidated backlog in ROADMAP.

## 2026-06-16 — phone-first auth + hardening
- **Phone-first auth** — SMS login (Twilio Verify) + own signed session (Clerk-free path); dual-auth
  so Clerk + phone-session both work during cutover.
- **Caller-ID** — Twilio verify-call flow (`/auth/callerid/*`); calls dial AS the customer's verified
  number on the bridge path. `caller_id` stays null until verified.
- **Server-side atomic billing** — charge on call completion, idempotent via `charged_at`
  (poller + webhook can't double-bill; client can't dodge). `/app/charge` neutered to a balance read.
- **Comp-by-phone** (`COMP_PHONES`/`isCompAccount`) · **spend kill-switch** (admin pause/resume) ·
  **prod security boot-gate** (refuses open-admin / weak-session in prod) · **single-leader schedulers**.
- **One-check-per-store-per-day** (flag, off) · **stored-SVG XSS** fix · complete `esc()` ·
  constant-time webhook signature compares · **XFF rate-limit** fix.
- **`/pokemon` path routing** · brand → "Check It For Me" · `runner.html → checkit.html` · **Brevo** email sync.
- DB indexes (phone, finder, status) · **25 auth/billing tests** · `smoke-auth.sh`.
- Infra wired: Helicone, Qdrant, Redis, PostHog, TiDB (staged) · domain **checkitforme.com** on
  Cloudflare (DNS, worker routes, TLS strict, Bot Fight Mode, rate-limit) + `admin.checkitforme.com`.

## Earlier
- Full consumer + admin product, 100K-store DB, live voice calling with watch-live transcripts,
  restock intel, growth loops, white-label verticals. (Build logs in `docs/archive/`.)
