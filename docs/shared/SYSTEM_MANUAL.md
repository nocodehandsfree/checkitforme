# System manual — how Check works, end to end

The backend companion to `ADMIN_MANUAL.md` (the operator UI) and `WEBSITE_MANUAL.md` (the consumer
UI). This is the machine itself: what we offer, how a check actually happens, where money moves,
how the data platform works, and every process that runs on a schedule. Line refs are `file:line`.

---

## 1. What we offer (the product, one page)

**The promise:** you want a collectible before it sells out. We phone real stores, talk to a real
person, and hand you the answer with proof (the transcript). **No answer = no charge** — a check is
only ever charged when the call ends in a definitive answer; the server decides after the call, on
the verdict alone.

- **A check** = one call to one store about one product. The currency of the whole system.
- **Four brands, one codebase**: Pokémon, One Piece, Topps NBA, NeeDoh (subdomains + apex). New
  brands snap on via config (src/brands.ts).
- **First check free** (policy default 1). Then either:
  - **Plans** (subscription; checks reset monthly, no rollover): Family $4.99/15 · Collector
    $9.99/30 · Hunter $19.99/100 · Operator $49.99/300. Annual = 17% off. Every paid plan gets the
    8 premium features.
  - **Pay as you go** (never expires): 10/$9.90 → 100/$60.00 (99¢→60¢ per check). No premium features.
- **Premium features** (per-tier matrix, all ON by default): exact products · zone sweeps · restock
  alerts · scheduled checks · any town · store holds · your voice · thrift hunts.
- **The moat**: a live map of 100K+ stores with a per-store dossier (real phone line, hours,
  carries, restock rhythm, reliability tier, phone-menu route to a human) that gets smarter with
  every call — plus a nav system that reaches a human for nearly $0 so unanswered calls cost us
  almost nothing.

## 2. The call engine (tap → verdict → charge)

### 2.1 The main path (`POST /app/check-live`, server.ts:2781)
Gate order: auth → staging sim → store-closed 409 → rate limit (8 checks/min/IP) → owner-only store
404 → credits 402 → too-soon 429 (same finder+store+category within 1 hour) → dial.

### 2.2 Two dial planes
- **Bridge plane** (consumer live checks + Delta escalation): WE own the Twilio leg.
  `placeBridgeCall` (server.ts:4765) creates a room, then TwiML at `/twiml/bridge` plays learned
  keypad digits and spoken menu words BEFORE connecting the stream — the phone tree is navigated
  with $0 of AI. Then `<Connect><Stream>` into our μ-law bridge (src/voice/bridge.ts) which relays
  Twilio ⇄ ElevenLabs, injects scheduled DTMF in-band, streams transcript + audio to `/listen`
  WebSocket listeners, and holds the expensive agent asleep until **connect-on-human** (a learned
  timer, or voice-activity detection, or the hold cap) wakes it. Supports dialing AS the customer's
  Twilio-verified number (`accounts.callerId`) so it rings like a local call.
- **EL-dial plane** (`triggerCall`, service.ts:298): ElevenLabs owns the Twilio leg. Used by
  `/pub/check`, `/app/check`, admin call-now, schedules, zones, bench, lab calls. No live listen,
  no custom caller ID.

### 2.3 How the agent is configured per call
One ElevenLabs agent serves every store; per-call behavior rides in as **dynamic variables**
(`buildRestockVars`, service.ts:125): category, store name/location, phone-tree text, special
instructions, voicemail policy, persona, opening line (rotated round-robin per workflow), kiosk
mode, shipment-day ask, and `premium_followup` (subscribers get the exact-set follow-up; free
finders don't — service.ts:292). The canonical prompt is `RESTOCK_PROMPT` (src/voice/prompts.ts:13):
greeting, the one question, "let me check = wait", sold-out vs doesn't-carry rules, voice-IVR
navigation etiquette, recording-vs-person discrimination, hang-up rules. Workflow resolution
cascade: store override → chain → ★ default → global (service.ts:78). Agent brain: claude-sonnet-4-6
(swappable). Voice: workflow voice strip rotation → global pool → default.

### 2.4 Verdict (why customers can trust it)
Three redundant finalize paths, all idempotent: the 8-second poller (`ingestPending`,
service.ts:733), the ElevenLabs webhook (HMAC-verified, server.ts:4900), and on-demand inside
`GET /pub/result/:cid` so the first verdict a customer sees is already final. Extraction
(elevenlabs.ts:202): EL's structured fields + transcript heuristics (a bare "no" never becomes
"doesn't sell"; self-contradiction → let the second read break the tie). When EL was unclear, a
**second independent LLM read** (`classifyVerdict`, gemini-2.5-flash-lite) runs and `reconcile`
merges: hard NO always wins, direct conflict → honest "no clear answer" and **free**, confident
second read can rescue. Shipment days heard on calls are extracted and stamped onto the store
(`retailers.shipmentDay`) — that's where "drops Tuesday" in the app comes from.

### 2.5 Charging (the no-answer-no-charge machinery)
`chargeCallOnce` (service.ts:723): an atomic `charged_at NULL→now` DB flip guarantees exactly-once
across all finalize paths. Charged **only** when `status = completed` AND the verdict is definitive.
Everything else (nobody answered, voicemail, busy, hold too long, too busy, language barrier,
unclear, closed, admin hangup) is free. Spend order: subscription quota first, then PAYG
(billing.ts:110). The client never bills itself. Audio is never persisted — transcripts only.

### 2.6 Statuses registry
The owner-editable verdict table (seeded src/db/bootstrap.ts:14): in_stock, sold_out,
does_not_sell, not_in_stock, no_clear_answer, left_on_hold, too_busy, language_barrier,
nobody_answered, voicemail, busy, bad_number, closed, failed, admin_hangup (excluded from stats,
never billed). Edits are live in the consumer app instantly.

## 3. The lanes: how we reach a human for ~$0

- **Alpha** — keypad trees. Learned digits fire at learned times as real carrier DTMF (TwiML
  `<Play digits>`) or in-band synthesized tones. Cost ≈ $0.
- **Bravo** — voice menus ("say front desk"). Learned words spoken by cheap Polly `<Say>` before the
  stream connects; fallback = the agent navigates by voice per its prompt. Cost ≈ pennies.
- **Charlie** — the live agent (~5¢/check of ElevenLabs talk time). Only wakes on a human.
- **Delta** — the whole conversation on **pre-recorded clips** + a cheap classifier (~2.5¢/check).
  See §4.

**How routes get learned** (src/calls/navigator.ts, mapper.ts, trainer-batch.ts):
- **Document session**: one real watched call; a cheap LLM (gemini-2.5-flash-lite) decides each menu
  turn; at the human it asks the actual stock question in the workflow voice and classifies
  "answered" (right desk → lockable) vs "redirected".
- **Mapper** ("map until locked"): autonomous loop per chain — verify → listen → baseline (locks on
  first human so live calls benefit immediately) → optimize (shorten words, barge earlier by binary
  search) → locked. 12 calls/day cap, 75s spacing, daytime-open stores only.
- **Locking** writes the recipe onto the chain: nav text the live agent reads, DTMF shortcut, time
  to human (drives the connect-on-human timer). Overnight batch maps one store per chain and
  resumes across restarts.
- **Passive learning**: every prod live call on an unmapped chain feeds a transcript→tree learner.

## 4. Delta lane (tapedeck)

A real store check answered entirely by pre-synthesized ElevenLabs clips (opener, ask-set,
ask-type, restock-day, wrap, clarify, escalate) with clerk replies classified in ~½s by
gemini-2.5-flash-lite (src/calls/tapedeck.ts). Goes live when a workflow's lane = delta. If the
clerk goes off-script, **Charlie barges in**: the same live Twilio call is handed to the full agent
mid-conversation (server.ts:639) and the call record repoints so finalization just works. Bench
mode ("call me on tape") rehearses the whole thing against the owner's phone.

## 5. Money

### 5.1 Credits model (billing.ts)
Per account: `quotaCredits` (monthly, reset each cycle, no rollover) + `credits` (PAYG, permanent).
Spendable = both; spend burns quota first. Comp accounts (owner + COMP_EMAILS/COMP_PHONES) are
never charged and bypass every gate. Account creation grants the free check (policy default 1).
Cancel: quota forfeits, PAYG survives.

### 5.2 Stripe (no SDK, raw REST)
- **Embedded checkout** (the main path): `POST /app/checkout-intent` → Payment Element client
  secret; subscriptions require published prices.
- **Hosted checkout** fallback: `POST /app/checkout`.
- **Webhook** (`/webhooks/stripe`, HMAC constant-time verified): checkout completed → set
  entitlement / grant credits; invoice.paid on renewal → quota reset; subscription.deleted → clear
  entitlement. PAYG grant via payment_intent.succeeded is deduped per intent.
- **Plans publish** (plans.ts:177): idempotent mirror — Products created once and never deleted;
  price change = new Price + archive old, so existing subscribers keep their price.

### 5.3 Feature gating
`accountFeatures` (plans.ts:151): comp → all; subscriber → tier matrix; PAYG/free → none.
Server-enforced today: zone sweeps (all /app/zones* endpoints), scheduling (members only), exact
products (call-prompt follow-up), restock SMS caps (per-tier monthly), subscriber-private finds.
The rest (any_town, store_holds, your_voice, thrift_hunts) currently gate in the UI from `/app/me`.

### 5.4 Policy (src/policy.ts)
One owner-tunable JSON blob over defaults: pricing (perCallCents display, freeChecks), finds
(public feed, 10-min finder headstart, subscriber-private), rewards (kiosk 1, referral 1 both
sides, store-add 1), ~20 feature flags (each enforced at its endpoint or UI), the `bail`
cost-cutoff library (ring/hold/IVR/call max seconds), footer links, page bodies, analytics id.

## 6. Growth loops (every way users make the product better)

| Loop | How it works | Reward |
|---|---|---|
| Referrals | 7-char code, claim once, self-referral blocked (src/referrals.ts) | 1 check BOTH sides |
| Add your store | `POST /pub/store-request` → admin marks added (idempotent rewardedAt) | 1 check + email |
| Kiosk receipt | forward machine email to restocktimer@gmail.com; IMAP tick parses (machine id / product+total), dedupes by messageId, claims by device/IP | 1 check |
| Kiosk timing report | refresh minutes → kiosk `refreshSummary` recompute | 1 check |
| Community "I scored!" | photo direct-to-R2 presigned PUT, moderation queue (auto-approve flag), likes | social |
| Feedback poll | unclear verdicts ask "what did you see?" → admin review can rewrite the record as training truth | data |
| Watches | anonymous "tell me when it's back" → one-shot notify on confirmed in-stock, then deactivate | — |
| Waitlist | out-of-area capture + demand by region; admin one-time region launch email | — |
| Finds ticker | recent confirmed finds go public after the finder's 10-min headstart; subscriber finds stay private | FOMO |

## 7. Notifications (src/alerts.ts)

4 events: **restock** (SMS, metered per-plan monthly; comp unlimited; no sub = 0) ·
**store_added** · **waitlist** · **welcome** (email). Templates owner-editable with tokens, branded
dark-theme email HTML, optional Brevo template ids. Twilio SMS is **stubbed** (logged, not sent)
until A2P clears; Brevo sends email. Every send logged (`alert_sends` with monthKey — that's the
metering ledger). Restock fan-out fires off stock-signal ingests with a 6h per-store cooldown.

## 8. Auth

Phone + SMS only (Twilio Verify), US numbers. `POST /auth/phone/start|check` → 90-day HS256 JWT
(`phone:+E164`). First login creates the account + free check. Owner phones (`ADMIN_PHONES`) also
mint the 30-day admin cookie — signing into the site = signed into admin. **Caller-ID verify**:
Twilio calls the user, they key a code; after that their checks dial from their own number.
Staging uses a fixed login code and sends no texts.

## 9. Data platform

### 9.1 Database
SQLite (libsql) on a Railway volume per environment (`file:/data/local.db`), Drizzle ORM, schema
effectively managed by bootstrap (guarded ALTERs + indexes for 100K scale). ~25 tables; the spine:
`retailers` (the 100K store table; **phone = identity everywhere**), `chains` (brand + phone-tree
knowledge + nav recipe + owner controls + logo), `call_results` (one row per call, the ground
truth, `chargedAt` = billing idempotency), `accounts`, `statuses`, `settings` (key-value:
`vt_*` voice/workflow/plans keys, `policy_json`, `gtm_checklist`, `alerts_json`…).

### 9.2 Store data pipeline
The 102K rows came from the collector drop 2026-06 (`data/stores-master/`, phone-audited, 80
chains) + supplements (hobby shops harvest, comic shops, TPCi kiosk crawl). Import =
`POST /api/stores/import`, upsert on phone, derives region/timezone, normalizes hours; source
files are import inputs only — **the DB is the single source of truth at runtime**. `carries` is
DERIVED at serve time from the distributor map for mapped chains (CI-enforced contract).
Maintenance endpoints (all dry-runnable): dedupe/name-normalize, CVS-in-Target quarantine, orphan
relink, tier grade-from-defaults, caps fixer.

### 9.3 Scoring (docs/data/scoring.md)
Tier 1-5 on the store: over-MSRP → 2; can't-confirm → 1 (hidden); genuine MSRP → 3-5 by breadth ×
restock predictability. **Official kiosk overlay always wins (tier 5).** Consumer groups 5 = Best
bets, 4 = Mostly reliable, ≤3 = Spotty.

### 9.4 Staging → prod sync (src/store-sync.ts)
Staging is the curation home. Every 5 min staging pushes **curated fields only** (never
learned-on-prod intelligence like nav recipes/hours/shipment days), published rows only, diffs
only (per-row hash), tombstones deactivate. Prod-receive only. Reverse = table-dump/table-load
data refresh (staging only). This is the ONLY store-data promote path.

### 9.5 Hours, geo, logos, kiosks
- **Hours**: LLM web-search lookup (gpt-4o-search-preview, Gemini grounded fallback), canonical
  weekly JSON, open-now computed in the store's timezone; unknown hours = assume open 7am-9pm
  local. Closed stores are never dialed. Refresh: policy-gated harvest tick + on-demand backfills.
- **Geo**: haversine + bounding box on the lat/lng index; consumer geocode is DB-internal (median
  of matching stores); background geocoder fills missing coords (US Census, Nominatim fallback).
- **Logos**: one source of truth — `public/logos/chains/*.png` + `_meta.json` (wide/plate flags),
  DB-first resolver (shared R2 `logos.fungibles.com`), denormalized onto every store served. No
  surface embeds its own copy. `/logo-wall` (admin) audits the whole set. Full doc:
  docs/data/store-logos.md.
- **Kiosks**: official TPCi machine list crawled → overlay matches machines to stores (tier 5) →
  reconcile de-kiosks anything not on the official list ("not on the list = doesn't exist").

## 10. Ops

### 10.1 The tick system (server.ts:5012, all Redis single-leader locked)
ingest 8s (finalize calls) · scheduler 60s (admin schedules, store-local time) · geocode 3s ·
store-sync 5m · hours harvest 2m (flag-gated) · customer schedules 90s (subscriber auto-checks on
shipment days; charges 1 credit; skips closed stores) · gmail receipts 30s · watchdog 60s ·
backup check 1h · logo cache 60s · keep-warm 4m.

### 10.2 Protection rails
- **Kill switch**: Redis calling-pause, checked before every dial (admin API:
  `/api/admin/calling/pause|resume`).
- **Cost caps**: Twilio TimeLimit on every leg (chain maxTalk or policy bail max, 180s default;
  Delta 300s), hold caps, EL 120s silence hangup, `assertCallsEnabled()` makes staging physically
  unable to dial unless opted in.
- **Rate limits**: checks 8/min/IP, rewards 6/hr, community 12/hr, `/pub/*` 300/min; IP from
  cf-connecting-ip (spoof-resistant).
- **Watchdog**: prod and staging ping each other's `/api/health` every minute; 3 misses → owner SMS
  + email; recovery all-clear.
- **Backups**: daily VACUUM snapshot → gzip → AES-256-GCM encrypt → R2 (7 rolling dailies +
  monthly). Restore/verify script exists (`scripts/restore-backup.mjs`).
- **Resilience**: uncaught exceptions alert but never kill the process; SIGTERM waits for live
  calls to finish (240s cap) before shutdown.

### 10.3 Deploy & environments
Railway, no build step (`tsx src/server.ts`): prod `voice-caller` = branch `main` =
checkitforme.com; staging `voice-caller-staging` = branch `staging` = staging.checkitforme.com.
Cloudflare Workers front the brand subdomains (force `?brand=`) and the staging proxy (noindex).
**Promote** (`scripts/promote.sh`: typecheck + store contract, then staging→main merge) is the only
way prod code changes. CI: typecheck + ~20 unit suites + gitleaks secret scan + docs lint (banned
copy tokens). Verification: `scripts/test-all.sh`, `node scripts/site-health.mjs <url>`
(Playwright walk of every view × 4 brands). The book = branch `v1.0` → readme.com (bi-directional
git sync; Copper's lane).

## 11. External services (who we pay / depend on)

| Service | For |
|---|---|
| ElevenLabs ConvAI | the voice agent, TTS clips, voice cloning (the big COGS) |
| Twilio | calls, SMS verify, caller-ID verify, media streams, alerts |
| Stripe | plans + PAYG payments, webhooks |
| Brevo | transactional + list email |
| Gmail IMAP | kiosk receipt inbox |
| Cloudflare R2 | community photos, chain logos, encrypted DB backups |
| Redis (Railway) | locks, rate limits, kill switch |
| Helicone | gateway for EVERY LLM call, cost tracked per job tag |
| OpenAI / Gemini / Groq / Anthropic | hours lookup · verdict second-read + classifiers · nav brain · admin dev agent |
| US Census / Nominatim | geocoding backfill |
| PostHog | product analytics (snippet on every page) |
| Carto/Leaflet | consumer map tiles |
| Railway | hosting + volumes + env vars |
| ReadMe | the customer book |

## 12. Quirks & watch-outs (true as of 2026-07-10)

1. **Daily spend counter reads zero**: `incrSpendCents` (redis.ts) is defined but never called, so
   the admin calling-status "spend today" is fed by nothing.
2. **MRR in `/api/admin/metrics` uses the legacy $4.99 constant**, not per-tier prices — MRR is
   understated once anyone subscribes above Family.
3. **In-memory idempotency** for Elements PAYG grants and the anonymous demo-charge set — a restart
   or second instance could double-apply on webhook replay (per-call charging is DB-safe).
4. **Analytics is two systems**: PostHog injected via env on every page; GA4 loads only if
   `policy.ga4Id` is set. Don't assume one or the other.
5. Rotation state (openers/voices) is in-memory and resets on restart.
6. Admin → Calls → Schedules tab is a blank page (nav entry, no section).
7. Some premium features (any_town, store_holds, your_voice, thrift_hunts) are UI-gated only — no
   server-side enforcement yet.
