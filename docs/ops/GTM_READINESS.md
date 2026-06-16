# Go-To-Market Readiness — nationwide launch checklist

Single source of truth for everything that must be in place (or decided) before a
nationwide push. Owner-maintained. Scope: `voice-caller/` only.

Status key: [ ] todo · [~] in progress · [x] done · [decision] owner call needed

---

## P0 — Money & safety (a viral day must not become a surprise bill)

- [ ] **Hard call cost cap.** Two parts:
  1. Twilio `TimeLimit` on every outbound call (a real ceiling the LLM cannot exceed).
  2. Wire the existing `policy.bail` rules to the admin toggle (today the toggle does nothing).
  - Defaults already in config: maxCallSeconds 180, ivr 90, hold 60, ring 35.
- [ ] **Global spend kill-switch.** Daily $ cap across ElevenLabs + Twilio; auto-pause all
  calling when exceeded; admin override to resume. Cheap insurance against runaway loops.
- [ ] **Server-side atomic billing.** Charge on call completion (ingest/webhook), never the
  client. Make the credit decrement atomic. Persist idempotency (Redis), not in-memory.
  - Vector closed: today a user can block the `/app/charge` request → unlimited free calls.
- [ ] **Rate limit the money endpoints** (`/pub/check`, `/pub/check-live`, `/app/check`) +
  **one-check-per-store-per-day** per account/device.
- [ ] **Stripe finalize** (currently unfinished — was deferred; on this list, not a blocker
  until paid tiers go live). Webhook secret already set & enforced in prod ✔.

## P0 — Identity & anti-abuse (phone = the root identity)

- [ ] **Phone verification (Twilio Verify) as the account root.** One verified phone = one
  account. This is the keystone — it simultaneously:
  - Solves caller-ID (below),
  - Kills multi-account farming (phones are far harder to mint than emails),
  - Gates the free check (one per verified phone, not per cleared-cookie device).
- [ ] **Reward only after the value event, post-approval:**
  - Referral credit → only after the *referred* user verifies a phone (blocks self-referral
    via 20 emails).
  - Add-a-store credit → only after admin approves the store (not on submit).
  - Score-post credit → only after moderation approval.
  - Kiosk receipt → already strong (real emailed receipt). Keep.
- [ ] **One free check per viral component** (referral / add-store / post-score) — owner cap
  until unit costs are understood. Email is for alerts only; phone is the gate.
- [ ] Cloudflare bot rules as a third layer (block known AI agents) — helpful, not the fix.

## P0 — Phone infrastructure (owner-chosen approach)

- [ ] **User's own number as caller ID** (owner decision — decentralizes presence + cost).
  - Flow: user verifies their phone via SMS → registered as a Twilio **Verified Caller ID**
    → their checks display their number. No per-city number rental = huge cost win + local
    presence everywhere + far less "Scam Likely" flagging (varied caller IDs).
  - ⚠️ Note: this fixes **caller-ID/spam-flagging**, not raw **concurrency** — calls still
    originate on our Twilio account, so simultaneous-call capacity is a separate Twilio
    setting/provisioning item as volume grows. Track separately.
  - ⚠️ The store may see / call back the user's personal number — acceptable for this use
    case; surface it in the UI.

## P1 — Scale foundation

- [ ] **Redis** (shared rate limits, billing idempotency, locks). Required before running 2+
  app instances. → Upstash or Railway Redis.
- [ ] **Job queue / single-leader lock** for the schedulers (call polling, scheduled calls,
  geocode, hours, receipts). Today they run on a timer inside every instance → 2 instances =
  every store called twice = double charges + annoyed stores. Depends on Redis.
- [ ] **DB → TiDB + indexes.** We already operate TiDB (main app). Migrating voice-caller off
  single-writer libsql to TiDB solves both the missing indexes AND the single-writer ceiling
  in one move; no new vendor. Add indexes on retailers(lat,lng), state, active, phone.
- [ ] **Move dashboard/analytics math into SQL** (today several endpoints load whole tables
  into memory).

## P1 — Observability & status

- [ ] **Error tracking: Sentry** (backend exceptions, webhook failures, call failures).
- [ ] **Live spend/health dashboard** (calls in flight, $/call, daily spend vs cap, EL/Twilio/
  Anthropic balances).
- [ ] **Status page per service** — extend the existing `status.fungibles.com` Cloudflare
  Worker to show each service (api, voice, payments) + upstream (Twilio / ElevenLabs) health,
  and drive **downtime/degradation banners on both the consumer and admin front-ends**
  (e.g. "ElevenLabs degraded — calls may be slow").
- [ ] **Alerts beyond downtime:** call failure-rate spike · avg call duration/cost spike ·
  daily-spend threshold · EL/Twilio/Anthropic low balance · webhook signature failures ·
  DB write errors · queue backlog · abnormal free-check/referral redemption rate.

## P1 — Support & community

- [ ] **Discord server** (where the community lives) — prerequisite to the rest.
- [ ] **3-tier support:** FAQ bot ($0) → Claude (Haiku, cheap) → human ticket.
  - Build the FAQ agent as **RAG (retrieval), not fine-tuning**: a knowledge base the bot
    searches. As real Q&A gets resolved (Discord/tickets), **human-approved answers are
    appended to the KB** so it compounds — new users get faster answers over time. (This is
    retrieval-that-grows, the practical version of the "endless Discord thread learns" idea.)
  - Stack: Claude + a vector store. Use **TiDB vector** (we already run TiDB) to avoid a new
    vendor; Cloudflare Vectorize is the alternative. Surface in Discord + on-site.

## P2 — Compliance (gates public marketing, not building)

- [ ] **Legal sign-off on AI voice calling** — TCPA/FCC AI-disclosure, state two-party-consent
  (we store transcripts), cloned-voice "don't reveal it's AI" risk. Counsel before public push.

## Product domain migration (owner is considering)

- [ ] **[decision]** Move this product off `*.fungibles.com` to its own domain. Plan to capture:
  new root domain + the subdomains we use (consumer verticals, admin/caller, status, auth
  callback, og/share), DNS + Cloudflare zone, Clerk allowed-origins, Stripe/Twilio/EL webhook
  URLs, OG/share links, and a redirect map from the old subs. Stage it as one coordinated cutover.

---

## Services — you already own everything. No new signups needed.

The goal is fewer moving parts. Map of what each existing service should do:

| Need | Use | Notes |
|---|---|---|
| Database | **TiDB Cloud** (have) | **separate DB/schema for caller** (don't share the sports-cards DB) |
| Cache / locks / idempotency | **Redis on Railway** (have) | **namespace caller keys** (`caller:` prefix or its own logical DB) |
| LLM cost/observability | **Helicone** (have, set up) | route Anthropic/OpenAI through it → per-call LLM cost = the cost-per-check input |
| Product analytics + flags | **PostHog** (have, set up) | can also replace GA4; has feature flags + session replay |
| Backend error tracking | **Sentry** (have/adding) | PostHog overlaps — see consolidation note below |
| Vector store (RAG FAQ) | **Qdrant** (have, set up) | use this for the support KB (drop the earlier "TiDB vector" idea) |
| Phone verify / caller ID | **Twilio Verify** (have) + **Clerk Pro** (phone signup) | one-time SMS per signup, not per check |
| Uptime/status | extend **status.fungibles.com** (have) | per-service + upstream (Twilio/EL) + downtime banners |
| Community / support | **Discord** | server + bot |
| Payments | **Stripe** (finalize) | secret already wired |

**Consolidation calls (fewer parts / cheaper):**
- **PostHog vs Sentry overlap.** PostHog now does error tracking + flags + analytics + replay.
  If you want to cut a tool, run errors through PostHog and skip Sentry. Keep Sentry only if you
  want deeper backend stack-traces/tracing. (You said add Sentry to vars — fine; just know it
  overlaps PostHog and you don't strictly need both.)
- **Qdrant** is your purpose-built vector DB — use it for RAG, don't add anything else.
- **Helicone** is the key to "exact cost per check" — it captures the LLM dollars per call.

## Data isolation (one account, many apps — like Clerk)

Keep one vendor account per service, but **isolate the caller app's data**:
- **TiDB:** one cluster, a **dedicated database** for caller (e.g. `voice_caller`). The
  service's `DATABASE_URL` must point at that DB, not the sports-cards one.
- **Redis:** shared instance is fine — give caller its **own key prefix or logical DB index**
  so keys can't collide with the Fungibles app.
- **Sentry/PostHog:** one org, **separate project per app**.
- ⚠️ Shared infra without isolation = one app's bug can corrupt the other's data. The prefix/
  separate-DB step is the whole protection — do it before any writes.

## Unit economics — "exact cost per check"

- [ ] Build a **cost-per-check** panel into the spend dashboard. With a hard 2-min cap, one
  check has a fixed *max* cost: ElevenLabs (per-min) + Twilio voice (per-min) + LLM (Haiku
  nav + Sonnet human, via Helicone) + amortized Stripe fee. SMS verify is one-time per signup
  (not per check). Surfacing this lets you tune the cap/model mix for margin.
- [ ] **Wire the confirmed per-call rates into the admin cost dashboard — AFTER the calling tech
  (Haiku-nav → Sonnet-human switch + DTMF reach-a-human) is validated live.** New-tech model lands
  cost ~$0.11–0.13/check (≈50% margin at $0.25) because EL+Sonnet run only during the human talk.
  Rates from the owner's call-cost model: Twilio carrier $0.014/min, Twilio STT $0.02/min, Haiku
  $0.002/call, cheap TTS $0.001/call, EL $0.10/min, Sonnet 4.6 $0.024/min, Railway $0.001, number $0.001.

## Raw concurrency (must be factored in)

- [ ] **Twilio concurrency is a hard ceiling**, separate from caller-ID. Monitor concurrent
  calls, request Twilio limit increases ahead of demand, and plan subaccounts/number capacity
  for peak. The user-number-as-caller-ID idea does NOT raise this — track it on its own.
- [x] **LLM tiering (cost win, dev built):** Haiku navigates the phone tree, Sonnet 4.6 takes
  the human conversation — no premium model billed while on hold. ⚠️ Confirm the mid-call
  hand-off actually works on ElevenLabs' stack (EL binds one LLM per session) — verify it
  swaps live, not just at call start.

## Phone-tree auto-learn (compounding moat)

- [ ] When a call hits a store whose tree we haven't mapped, **learn the navigation from the
  call and write it back** to the chain/store `phoneTree` — so the owner doesn't hand-map all
  ~80 chains. Each call makes the next one smarter.
