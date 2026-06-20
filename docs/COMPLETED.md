# Completed work (log)

Finished items live here so the active docs (HANDOFF) stay lean. Newest first. Agents: move done
items here from HANDOFF's "Current focus."

## 2026-06-19 — website: result-page overhaul, i18n, calendar, "no green", schedule modal
Large consumer pass on `public/checkit.html` (shipped to the deploy branch). Current UI state:
- **Verdict card** — store identity is the dominant top (bigger logo + name + one-line address); the verdict
  is a compact ALL-BLACK strip below (status icon sits under the logo; title + one short summary line). The
  colored fill tint was removed (it clashed with the conversation box) — color now lives only in the icon +
  title word.
- **Call progress** — collapses to a one-line recap ("Call · Ns", real server duration). EXPANDED on the
  first/live view (watching it run is the point), COLLAPSED when you reopen a past call. Per-step seconds
  ("…3s") persist on reopen via saved `LIVE_STEPS` (n/label/at) stored in history; derive-from-transcript
  is the fallback when none were saved.
- **Instant result rendering (SWR)** — finished transcripts cached per session (`sessionStorage res:<cid>`);
  pull-to-refresh / history hops paint instantly then revalidate. "Loading…" only flashes if a load is slow.
- **Calendar** — highlights EVERY call-day (independent of the store/outcome dropdowns); picking a day clears
  those filters so it always opens. Also fixed stale `LIVE_STEPS` leaking into a reopened call.
- **i18n** — the call box fully translates now (added es for `live.convo`/`live.steps`/`cs.call`; wrapped the
  Associate/Menu/Check-AI bubble labels in `t()`); `setLang` already re-renders the open result.
- **Translate button** — back in the conversation header (Lucide "languages" icon), only on Spanish-clerk
  calls when viewing in English; rewired `toggleTranslate` to swap the conversation body (`#convo_body`).
- **Store list** — the in-stock green checkmark was REMOVED (owner call: never show it in the list).
- **"No green"** — removed the ambient green body glow entirely → solid `var(--bg)` on every path. Verified
  all 5 live brand paths have dark `theme-color` + dark `--bg` + a non-green `--accent`. Fixes the recurring
  green on the homepage / call-history / iOS Safari bars.
- **Schedule (auto-check) modal** — deleted the "Fungie+ member perk" label; phone field is now a grey italic
  "Enter number" placeholder (defaults to the account contact on submit).
- **Misc** — removed "Powered by Fungibles" from the result foot (site footer still credits it); centered the
  rail switcher under the nav; aligned the verdict icon under the store logo.
- **vicon()** — status marks now also render Lucide icon NAMES (flag / phone-off / phone-missed / user-x +
  common fallbacks) because the statuses registry switched some emoji → Lucide names; an unknown value draws a
  neutral dot, never raw text (fixed a "phone-off" string that was rendering as a 46px headline).

## 2026-06-19 — Data Dev: data-provenance doc + scoring package recovered into the repo
Documentation pass so all store data is traceable to one source, and the owner's scoring matrix is
never lost again.
- **`docs/DATA_PROVENANCE.md` (NEW)** — the one-source-of-truth map: the DB (`chains`/`retailers` +
  signal tables) is the only store-data source; every surface (consumer `/pub/stores/near`, admin
  `/api/admin/*`, the call engine, best-bet) reads the **same** rows. Per-domain provenance table
  (identity, chain, tier, kiosks, hours, carries, stock signals, call outcomes) + who writes each.
  **Verified** by grepping every runtime file read: the only request-time reads are static assets +
  two chain-keyed stock-config JSONs — **zero store names from files.** `stores-master/*.gz` is an
  importer-only input. Wired into the HANDOFF docs map + the Data-Dev handoff Read list.
- **Scoring package committed** — the owner's "four-file zip" (delivered as an upload, never in the
  repo — which is why the rubric "wasn't anywhere") is now at **`data/source/chain-scoring-2026-06/`**:
  `SCORING_MODEL_spec.md` (the v4 rubric), `DEV_HANDOFF_final.md`, and the 3 CSVs (85 chain scores /
  22 logistics / 264 product-evidence rows) + a README explaining how it maps to the DB.
- **`docs/specs/scoring.md` (NEW)** — repo-native 1–5 tier rubric reconciled to the real schema:
  `tier` is **per-store** (`retailers.tier`, no chain-level column), chain values are stamped onto
  stores, **any official-kiosk store projects as tier 5**, voice-confirm rate overrides per store.
  Confirmed tiers are **LIVE in prod** (a `/pub/stores/near` sample near LA returns a 2/3/4/5 spread).
- **Gaps logged** for the Data queue: orphan stores (`chainId: null` → no logo/tier), the ungraded
  (`tier: null`) tail, and the 4 thrift chains still missing logos.

## 2026-06-19 — Data Dev: dedupe engine, hours re-verify, CVS-in-Target quarantine, thrift rail, TJX
New server-side maintenance endpoints + applied LIVE to prod via the admin API; verified fresh from prod.
- **Name dedupe at scale** — new `POST /api/stores/dedupe` (normalize em-dash separators / `(#1234)` store
  numbers / ALL-CAPS streets / scraped-HTML names + same-city disambiguation: `Chain City` for a lone store,
  `Chain Street` for collisions, with house-# then suite-# tiebreakers; grouped by (chain, city) so it's
  **idempotent**). ~44k names cleaned across 52 states; re-runs report 0 changes.
- **Corruption** — ~1,173 rows carried scraped DG.com return-policy HTML in the `address` field, which the
  collision pass had piped into ~492 names. Fixed: `street()`/`houseNum()` reject markup, corrupt addresses
  blanked. Every marker (`Self-Service`, `&lt;`, `style=`…) now 0 prod-wide.
- **Hours** — `POST /api/hours/reverify-stamps` re-looks-up stores carrying an **unverified** hours stamp
  (`hours` set but `hoursUpdatedAt` null — hand-seeded `24h`). 10 seed stores re-verified (CVS Mulholland Dr
  confirmed genuinely 24h). Also fixed **8** original seed stores with a null `state` (full address stuffed in
  `location`) that every per-state sweep had silently skipped.
- **CVS-inside-Target** — `POST /api/stores/quarantine-cvs-in-target`: matched all 8,898 CVS vs 1,673 Targets
  by exact street address (+<250 m), moved **1,375** pharmacy-counter CVS into a **muted** `_CVS Pharmacy at
  Target` chain (`sellsPacks:false` backstop) — they don't carry cards / can't be called. Verified 0
  standalone CVS touched; fully reversible.
- **Treasure-hunt rail (thrift)** — imported **3,479** real stores (Goodwill 2,925 / Salvation Army 369 /
  Savers 177 / Unique 8), all with direct local phones + lat/lng (sourced in warp, pushed on branch
  `thrift-data`). Tagged **`type=Thrift`** (importer now maps thrift/resale → Thrift), `carries` set,
  **muted/staged** and **off the MSRP scoring** (no tier, not `isMSRP=false`). Names cleaned to `Chain City` /
  `Chain Street`. **GAP: these 4 chains have no logo files yet.**
- **TJX back on** — TJ Maxx (1,014) + Marshalls (950) were muted; un-muted for the Mega-Evolution *Ascended
  Heroes* MSRP shelf drop (HomeGoods already live). Fixed 7 bare `TJ Maxx`/`Marshalls @ {state}` rows
  (reverse-geocoded → `Chain City`/`Chain Street`). Logos confirmed rendering (`tj_maxx.png`/`marshalls.png`).
- **Counts** — prod now **105,623** active stores / **119** chains. (Endpoints above are committed on the
  deploy branch; data changes are LIVE.)

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
