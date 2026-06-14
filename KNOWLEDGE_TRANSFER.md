# KNOWLEDGE TRANSFER — read this FIRST, then ROADMAP_NIGHT.md

Single source of truth for picking up the Fungibles/Runnr build cold. Pair with
`ROADMAP_NIGHT.md` (the live task list) and `HANDOFF.md` (infra/deploy).

## What this is
AI voice-calling service that phones retail stores to check trading-card stock.
4 brand micro-sites (Pokémon / One Piece / Topps NBA / NeeDoh), one consumer
file `public/runner.html` (brand-injected by subdomain), admin `public/app.html`.
Hono + libsql/Drizzle on Railway. Deploy = push to `main` (Railway auto-deploys,
~2-4 min). Verticals served via a Cloudflare Worker proxy (see HANDOFF.md).

## How to work (the rhythm that's been working)
1. Edit → `npx tsc --noEmit` clean → extract the big `<script>` and `node --check`
   it (apostrophes inside single-quoted JS strings are the #1 footgun; `→`/`é`
   in python heredocs break too).
2. Commit, `git push origin main`, mirror to `claude/retail-stock-voice-calls-OcyMS`.
3. Poll `…up.railway.app/?brand=pokemon` for a live marker before claiming done.
4. Keep the old Clerk key handy for instant rollback (see below).

## LIVE now (shipped — UI/UX agent, 2026-06-12)
- BRAND: "The Check" — headlines "We'll check for you.", call→check copy sweep, products renamed
  PokéCheck/OnePieceCheck/ToppsCheck/NeeDohCheck (brands.ts), FCHK() = Fungibles check logo
  (purple→green gradient check; ticker + footer; use anywhere).
- Design system: one green CTA/page; accordions (details.demo) + .modrow share circled-chevron
  component; drawn ICO.* marks everywhere (no stock emoji in chrome); brand accent via var(--accent).
- Consumer: armed CTA (appears only when store picked, pulse+glide), Find-my-stores first screen,
  call switcher rail (store/status filters + prev/next, logo tiles), live transcript bubbles pop in
  turn-by-turn, IG-style Scores feed (collapsed composer, @handles from email local-part, dbl-tap
  like), referral inside Earn free checks, in-app footer pages, refresh keeps view (?v=/?call=),
  Runner hand-off 5-step flow (staged card link 4QK9), You sheet = account hub (credits states:
  gold star member / platinum ∞ comp / red zero), 4-tier plan sheet (Scout/Hunter/Flipper/Whale —
  ONLY Scout-monthly wired to real Stripe; T2-4 toast until owner creates Stripe products).
- Auth: Google/Discord logo tiles (Clerk OAuth wired; AWAITS owner credentials in Clerk dashboard),
  purple band header, purple compact CTAs. Email-code flow untouched (other-chat lane).
- Logos: 85 chain marks in public/logos/chains (round-2, real); _meta.json (wide/dark) drives
  width-fit + light plates (11 dark marks); fuzzy name matching (Franklin's Ace→ace). Regenerate
  meta after logo changes: the PIL script lives in chat history — aspect>2 = wide, lum<90&chroma<45 = dark.
  Preview wall: /logo-wall. Cache-busted via ?v=N in chainLogoInfo (server.ts).
- Admin: consumer components ported (logo tiles, verdict pills, chat-bubble transcripts, day chips),
  God view tab (live calls/outcomes/money/actions), bail library UI (policy.bail, master OFF,
  enforcement NOT wired), chain classification + mute, Settings: liveListen + voicemail switches.
- Server adds: /app/history (cross-Clerk-instance via email), /pub/translate to:'es', /og/<brand>.png
  share cards (regen via playwright og.mjs), /logo-wall, partial=1 on /p pages, chain logo pipeline.
- Data: voice-caller/data/stores-master (gzipped). Geo-paginated API SHIPPED (/pub/stores/near) AND the
  consumer now uses it (boot no longer ships the table; loads by GPS / master ZIP / dropped pin + search).
  Parts 1-3 + append = ~69,104 stores being imported to prod (upsert-by-phone, IDEMPOTENT — safe to re-run
  to finish if a batch is interrupted; verify with /pub/store-types). README lists parts 4-5 too — NOT in
  the repo yet (Data Dev adds them, then re-run the importer per part). Master-only (comp acct) location
  override: ZIP/city box (→ /pub/geocode, resolved from our own store coords) OR drop-a-pin on the map.
  Legacy /pub/stores is capped at 1000 rows as a safety net.
  Importer: tsx scripts/import-stores.ts <part.json> --base https://voice-caller-production-2d6b.up.railway.app --token $ADMIN_TOKEN [--dry]
- Workflow that works: edit → npx tsc --noEmit → extract <script> + node --check → commit →
  git pull --rebase origin main → push origin HEAD:main + mirror claude/retail-stock-voice-calls-OcyMS
  → bump <meta name="x-rev"> in runner.html and poll railway /?brand=pokemon for it (current: tiers-r1).
  Rollback snapshot branch: snapshot/frontend-pre-reduce. EN+ES on every string (t()/tf()/data-i18n,
  es dict ~line 900 runner.html). NO screenshots to owner — he tests on phone; headless self-QA fine.

## Clerk (current state)
- Live instance = the OWNER's new "Fungie Finder" `cute-shiner-43` (pk_test_Y3V0…).
- Old instance (has the original accounts) `summary-hen-61`. ROLLBACK pk:
  `pk_test_c3VtbWFyeS1oZW4tNjEuY2xlcmsuYWNjb3VudHMuZGV2JA` — set CLERK_PUBLISHABLE_KEY
  to it via Railway to revert in ~30s if login breaks.
- Custom passwordless form (email link primary, code fallback). Admin still uses
  Clerk's mountSignIn — PLAN: move admin to admin.fungibles.com + username/password.
- TODO tomorrow w/ owner: production pk_live/sk_live + cross-subdomain session.

## Owner decisions still needed (do NOT guess)
- Pricing → MINUTES model (roadmap #4): buy minutes, charge per minute, sub
  includes allotment, volume discount. Profit floor must beat EL(~$0.10/min)+
  Twilio(~$0.014/min)+LLM. Big billing migration — do as ONE careful pass.
- Admin username/password (for the first-login test).
- "Set Jared live" vs keep current voice.

## Railway / secrets (via GraphQL, token from owner)
Project 889e332c… env 7cbf9327… voice-caller service d363a982-e918-4433-b175-defe8faf0ec9.
Read/write vars per HANDOFF.md. ADMIN_TOKEN bypasses /api/* (x-admin-token header).
ELEVENLABS_API_KEY, COMP_EMAILS (jared@reitzin.com, fun@fungibles.com = unlimited).

## Recurring user feedback (internalize these)
- "Frog designer": go over EVERY page, strip copy, emotional + minimal, aligned.
- Modular: a component change must reflect EVERYWHERE (esp. i18n + status icons).
- Verify in BOTH English AND Spanish before claiming done.
- Don't blind-ship risky/untested (auth, billing, voice) — stage + flag.
