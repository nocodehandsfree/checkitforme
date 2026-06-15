# Fungibles / Runnr — Session Handoff (for a fresh chat)

This is the **single onboarding doc** for the voice-caller service — read it top-to-bottom.

## 📍 Docs map (where everything lives — updated 2026-06-14)
- **This file** — onboarding (now folds in the old `KNOWLEDGE_TRANSFER.md`).
- `README.md` — what the service is + stack.
- `docs/API_CONTRACT.md` — the **API contract** (frozen front⇄back interface; the parallel-work referee).
- `docs/STOCK_AND_GEO_API.md` — deeper detail on the stock + geo rails.
- `GTM_READINESS.md` — nationwide launch checklist.
- `REFACTOR_PLAN.md` — architecture, parallel-agent ownership, task lists, security plan.
- `docs/IMPLEMENTATION_SPECS.md` — file-level specs for the P0/P1 backend work.
- `docs/TIDB_MIGRATION.md` — the libsql→TiDB migration + indexing plan.
- `docs/SECURITY_REVIEW.md` — security punch list (IDOR, XFF bypass, SVG XSS, etc.).
- `ROADMAP.md` / `LAUNCH_PLAN.md` — product vision + prioritized priorities.
- `docs/archive/` — historical done-logs (BUILD_PLAN, ROADMAP_NIGHT, ADMIN_PLAN,
  KNOWLEDGE_TRANSFER). Kept in git, moved out of the way to save context. **Don't auto-read.**

> If you're wondering where a doc went: it's in `docs/archive/` (see its README).

## What it is
AI voice-calling service that phones retail stores to check if trading-card product is in stock,
with proof. White-label verticals on subdomains: **pokemon / onepiece / toppsbasketball / needoh
.fungibles.com** (admin at **caller.fungibles.com**). One agent persona, **"Fungie."**

## Stack & deploy
- **App:** `voice-caller/` — Hono + libsql/Drizzle (SQLite dialect) on Railway. `pnpm`, `tsx`.
- **Consumer UI:** one file, `voice-caller/public/runner.html` (brand-injected per subdomain).
- **Admin UI:** `voice-caller/public/app.html` (the "Growth" tab has policy editor, importer, moderation, pulse).
- **Deploy:** push to `main` → Railway auto-deploys the `voice-caller` service. Working branch:
  `claude/retail-stock-voice-calls-OcyMS` (develop there, merge to main to ship). Commit-msg footer ends
  with the session URL.

## ⚠️ DNS — the critical thing to know
Railway's per-domain TLS validation is permanently stuck for this Cloudflare zone, so the 4 verticals are
served by a **Cloudflare Worker** (`voice-caller/workers/verticals.mjs`) that reverse-proxies to Railway's
service domain `voice-caller-production-2d6b.up.railway.app` and forces `?brand=<sub>`. Cloudflare's
`*.fungibles.com` wildcard cert terminates TLS. The 4 CNAMEs are **proxied (orange)** → Worker routes.
**Do NOT "fix" the verticals by toggling Railway domains.** To change the Worker: edit the file and
re-deploy via Cloudflare API (PUT /accounts/{acct}/workers/scripts/fungibles-verticals).
- Cloudflare account `9ae93ac1675d04db6b9ff876923898ef`, zone `7eb0aad0dd67e6d7e6c23dfeb9e56d47`.
- `CLOUDFLARE_API_TOKEN` lives in the **api** service env (serviceId `03d5f34f-…`), NOT voice-caller.
- Railway project `889e332c-…`, env `7cbf9327-…`, **voice-caller** serviceId `d363a982-…`.

## Owner-tunable config — `src/policy.ts` (admin → Growth → policy editor, no deploy)
Everything modular reads from here. Flags (current defaults): `dogfoodHours:false`, `driverHandoff`,
`scheduling`, `restockAlerts`, `kiosks`, `shareCards`, `multiProduct`, `specificSets`,
`community:false`, `communityAutoApprove:false`, `referrals:true`, `kioskReceipts:true`.
Also: pricing (perCallCents/packs/sub), rewards (kioskRefreshChecks, referralChecks), finds
(headstart/privacy), `links` (x/discord/instagram/tiktok — footer socials), `support.email`,
`pages` (about/faq/terms/privacy/contact bodies), `ga4Id`.

## Features (all live unless noted)
- **Store call flow:** find store → category → call; charged only if the call connects; verdict + transcript.
- **Best bet:** top recommended store floats to the **first row** of the store list (green, "Best bet" tag),
  scored by shipment-day + confirm history + proximity (`src/best-bet.ts`). Injected even with no coords.
- **Store mode toggle:** "Call a store" (`sellsPacks`, open only) vs **"Kiosks near me"** (`hasKiosk`,
  open OR closed). Retailers now have `sells_packs` + `has_kiosk` (supermarkets are often kiosk-only).
- **Kiosk receipt verification:** email a receipt to `restocktimer@gmail.com` → Gmail IMAP reader
  (`src/gmail-receipts.ts`, app password) parses it (machine id/product/total/time, unit-tested) → verified
  intel + free call. 30s ingest tick. (Report-a-refresh-time UI removed — gameable.)
- **Store CMS importer:** `/api/stores/import` (paste JSON in admin). Sample: `docs/sample-stores-import.json`.
  Accepts per-day `{open,close}` hours, `carries`, `category`→icon, `shipmentDay`, `sellsPacks`, `hasKiosk`,
  `active:false` to soft-remove. Dedupe key = **phone (E.164, required)**.
- **Referrals** (give/get checks), **community wall** (R2 photo upload, flag off), **restock alerts**,
  **subscriber auto-checks**, **share landings** (`/s`), **launch waitlist**, **store requests**,
  **SEO** (FAQ/HowTo JSON-LD), **growth pulse** + **restock-intel** dashboards, **rate limiting**.
- **Footer + content pages** (`/p/about|contact|faq|terms|privacy`, owner-editable via `policy.pages`).
- **i18n:** language picker in footer; Spanish live for the chrome (`I18N` table + `data-i18n` in runner.html).
  Add a language = add a code block to `I18N`. **TODO:** brand headline/sub are server-injected (brands.ts)
  and still English — translate those next for full coverage.

## Env vars (Railway, voice-caller service)
`GMAIL_USER=restocktimer@gmail.com`, `GMAIL_APP_PASSWORD` (set, no spaces), `ADMIN_TOKEN` (bypasses Clerk
on /api/* via `x-admin-token`), `CLERK_*`, `ELEVENLABS_*`, `STRIPE_*`, `GA4_ID` (optional),
`R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET/R2_PUBLIC_BASE` (NOT set → community uploads off).

## ⏳ Email-only signup (owner action — Clerk dashboard, can't be done in code)
The sign-up uses Clerk's hosted component, whose fields + verification method are **instance settings**:
1. Clerk Dashboard → **User & Authentication → Email, Phone, Username**: require **Email address only**;
   turn OFF name/username/phone.
2. → **Email** → enable **"Email verification link"** (instead of the 6-digit code) so phone users just
   tap a link. (App calls `window.Clerk.openSignUp()` which follows these settings automatically.)

## Tests
`cd voice-caller && bash scripts/test-all.sh` → typecheck + unit (ratelimit, r2, best-bet, schedules,
referrals, receipt) + integration (growth/CMS/community). All green.

## Recent UI pass (this session)
- Animated "Found! · store" ticker (green marquee). Condensed hero (headline "… in stock? We'll call
  for you.", value prop $10 above the 3 steps, dropped redundant sub). Header: language picker top-right
  (EN/ES only), Sign-in + "1 free" merged into one pill. Footer: distinct bg, brand mark + "PokéFinder
  powered by Fungibles" (accent), Discord/X icons (links via `policy.links`), Success link.
- Custom muted store-type icons (`storeIco()` in runner.html — pharmacy/grocery/retail/hobby/electronics).
- Demo box: spinning "Calling Target…", "Navigating phone tree" step, aligned transcript, new copy.
- Kiosk mode: tab is Pokémon-only; one purple box ("Get free calls! … use our email at checkout or
  forward your receipt"); call-only charge note hidden. `hasKiosk`/`sellsPacks` flags on retailers; Vons/
  Albertsons/Pavilions flagged kiosk-only via `POST /api/stores/flag` (x-admin-token).
- i18n: `I18N` table (es) + `HERO_I18N` (per-brand Spanish headline) + `data-i18n` attrs. Add a string =
  add to `I18N.es`; add a language = add a block + re-add to `LANGS`.

## NOT done yet (next chat)
- **Brand logos for Topps / One Piece / NeeDoh** (only Pokémon has a custom logomark/pokéball; others use
  the generic radar-ping). Need real logo assets or themed SVG marks — add a `mark` per brand + use in
  `renderIcons` (mirror the Pokémon branch).
- **Pre-location store list** = generic store TYPES (Pharmacy/Department/Big-Box…) with icons before the
  user shares location; swap to real stores on locate. (Important once the ~50k import lands — the list is
  huge/needs geocoding.)
- **Geocode imported stores** (many lack lat/lng → absent from the located list).
- Full Spanish (other languages); translate dynamic JS strings (toasts, syncCta button text).

## 52K store import (READY — owner has the file)
The collector repo (separate) produced `output/stores_master.json` — 52,002 stores, 32 chains, validated
E.164 phones, 92-100% hours. Import with the chunked uploader (the importer accepts the collector's
NATIVE field names — phone_tree_tip, shipment_days, department_to_ask, etc. — zero reshaping):
`tsx scripts/import-stores.ts output/stores_master.json --base https://pokemon.fungibles.com --token $ADMIN_TOKEN --carries Pokémon`
(--dry first to sanity-check). Walmart/GameStop/Kroger/etc. are in the collector's manual_needed.json.
Hours freshness: `retailers.hours_updated_at` stamped everywhere; the dogfoodHours-flagged harvester
re-verifies hours >45 days old (missing first). Night-call voicemail variant = future upgrade.

## Open items / next
- Translate brand headline/sub (server-side i18n) for full Spanish; fill DE/FR/ZH/KO/JA.
- Email-only signup: flip the two Clerk toggles above.
- Kiosk receipt: optionally capture the shopper's email at claim to forward them their receipt.
- Feed the tens-of-thousands store import (set `sellsPacks`/`hasKiosk` per row; supermarkets kiosk-only for now).
- Geocode imported stores (many lack lat/lng → they don't show in the located list).
