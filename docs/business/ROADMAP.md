# Check — Roadmap & Backlog

Living doc. The vision: **build the largest database of retailers selling TCG/collectibles at MSRP,
verified by real phone calls — that data IS the moat.** Everything below compounds on it.

---

## Open backlog (consolidated — newest thinking on top)
Status of each is detailed in the linked ops/security docs; this is the single checklist.

**Launch-path / now**
- [ ] Deploy integrated branch → main; set `COMP_PHONES`; verify phone + second-cell caller-ID.
- [ ] Route the consumer "check" through the **bridge** so caller-ID applies (plain `/app/check` uses the house number).
- [ ] "Create your agent" caller-ID panel (Admin/Website) using `/auth/callerid/*`.
- [ ] Flip `requirePhoneSignup` ON + remove Clerk once the phone UI is solid.
- [ ] **Split `src/server.ts` into route modules** (public/admin/auth/webhooks) — unblocks Website + Admin parallel work.

**Scale / infra**
- [ ] Redis-backed rate limiter (multi-instance) · single-leader schedulers ✅(done).
- [ ] TiDB cutover (connection staged; needs SQL string + backfill — git history).
- [ ] Analytics → SQL (dashboards load whole tables today).
- [ ] PostHog SDK wiring (errors + product events; key wired).
- [ ] Telephony at scale: concurrency planning + pickup-rate monitoring.

**Security** (git history)
- [ ] Transcript IDOR (needs frontend to send the session token on `/pub/result`,`/pub/live`).
- [x] XFF rate-limit, SVG XSS, constant-time webhook sig, prod security boot-gate, esc() — done.
- [ ] End-of-session key rotation (Railway token, TiDB password — leaked in chat).

**Revenue / GTM** (git history)
- [ ] Finalize Stripe (products/prices) before paid tiers.
- [ ] Wire confirmed call-cost rates into the admin cost dashboard (after the voice switcher is validated).
- [ ] 3-tier customer support (FAQ → Claude → ticket) + Discord; on-site + Discord support agents (RAG via Qdrant).
- [ ] Legal/compliance review of AI voice calling (gates public marketing).

**Domain / brand** (git history)
- [ ] 301 redirects fungibles verticals → checkitforme; deprecate fungibles after cutover.
- [ ] Finish the "Check" rebrand text sweep across all docs (HANDOFF done; others have stray "Fungibles/Runnr").

**Big later**
- [ ] **Migrate `voice-caller/` to its own repo.** It's a self-contained product; a split gives clean
  CI/deploy/history separation from the Fungibles app. Significant work (new Railway service config,
  CI, secrets, git history) — capture now, do when there's room. (See `docs/ARCHITECTURE.md`.)

---

## 0. The Moat (the thing nothing else can copy)

**A) The MSRP retailer database.** Every store we can call, what it carries, and — over time — how
reliably it restocks at MSRP. Competitors can scrape websites; they can't replicate a human-verified,
phone-confirmed restock history. This is the asset.

**B) The phone-tree library.** Per-chain navigation (voice + auto-press DTMF) to reach a human fast.
Already live and editable in Playbook → Phone Trees. Grows store-by-store as the owner field-tests.
→ *Owner is actively adding these.*

**C) Restock analytics.** Every call result is ALREADY databased (`call_results`: store, category,
confirmed yes/no/sold-out, product name, timestamp). We just haven't surfaced it. Build an analytics
layer on top:
  - Per-store restock frequency & reliability score ("restocks ~2×/week", "92% MSRP").
  - Best days/times to find stock per store/chain/region.
  - Public-facing teaser stats ("🔥 Hot Topic Topanga restocked Pokémon 4× this week") → SEO + virality.
  - Internal dashboard: who restocks most, where the white space is.
  - *Foundation exists — this is a read/aggregate layer + a dashboard, not new plumbing.*

---

## 0.5 Agents (Claude) — approved direction

**A) In-admin "Admin dev" agent — SHIPPED v1 (2026-06-14).** Bottom-right chat in the admin; manage the
store DB by conversation. Tools: find_stores, add_store, update_store, store_intel. Opus 4.8, raw-fetch
Messages API, manual tool loop, admin-gated `/api/admin/agent`. **Needs the Anthropic account funded to
run** (key is in Railway; account was $0 at build time).
  - v1.1 backlog: mute_chain tool, bulk ops, "look up this store's phone/address" (web/Places lookup),
    geocode confirmation, undo, show the diff before writing on destructive ops.

**B) Front-end customer support — 3-tier escalation (owner-requested).** FAQ bot answers common Qs for
**$0** (scripted/keyword/embedding match, no LLM) → if it can't, escalate to **Claude (Haiku 4.5 +
prompt caching)** for the long tail (~¼–½¢/msg) → if Claude can't resolve, **open a support ticket** for
a human. Same knowledge base + tools as the admin agent; surfaces on the consumer site and Discord too.

**C) Agent switcher / live-call brain hand-off (owner-requested).** Goal: cheap brain dials + waits,
smart brain talks to the human. **Reality of the current stack:** IVR/phone-tree navigation is already
**DTMF (no LLM)** and hold time burns **no LLM tokens**, so the "cheap-until-human" split mostly exists
for free today — the human-conversation LLM is just whatever's set on the ElevenLabs agent (set it to
Claude and you're done for that phase). The missing piece is a *mid-call hot-swap* of the brain on human
pickup; ElevenLabs ConvAI binds one LLM per session, so true swap needs either (a) the bridge to
reconnect the Twilio audio stream to a second ConvAI agent at "human detected", or (b) self-hosting the
STT→LLM→TTS loop (full per-turn control). (a) is the pragmatic next step; piping audio to Safari is a
listen-in fork and is unrelated to swapping the brain.

---

## 1. Monetization & Scarcity Mechanics

**Headstart (paid callers get first dibs).** When a paid call confirms in-stock, the finder gets a
window before the result posts to the public finds feed.
  - **Recommendation: 30-minute default headstart, configurable per brand/tier.**
    Rationale: long enough to drive over or reserve, short enough that the public banner is still
    useful (cards sell fast — a 2-hour-old "in stock" is noise). Tune by category later (faster-moving
    drops = shorter public delay anyway).
  - Implementation: `call_results` already has the finder + timestamp. Add `public_at = completed_at +
    headstart`. The finds feed and any "in stock" banner only show finds where `now >= public_at`.

**Pay to keep it private (exclusive find).** Premium option: the find is NEVER posted publicly — the
payer is the only one who knows. This is the high-value tier for serious collectors/resellers.
  - Implementation: a `visibility` flag on the result (`public` | `private`). Private = never enters
    the finds feed, never triggers headstart-expiry. Priced higher (it's removing supply from everyone
    else — that's worth a premium).
  - Natural tiering: **Free public find → Paid (30-min headstart) → Premium (keep it private).**

**Notify-me-when-back (paid).** If you paid for a call and it was NOT in stock, we watch it: when
*anyone else's* call later confirms that store+category in stock, we text/email you instantly.
  - Turns a "miss" into retention + a reason to pay. Also a powerful re-engagement loop.
  - Implementation: a `watches` table (email/phone, store, category). On every confirmed-in-stock
    ingest, match open watches → notify (respecting the finder's headstart/private settings).

---

## 2. Community & Growth

**Discord + AI customer-service bot (connected to Claude).** First-line support bot that answers
questions, runs checks (`/check <store> <category>`), and posts finds into community channels. If it
can't resolve → it opens a support ticket (handoff to human). The `/check` command inside a community
server is huge for the "marketed to specific communities" wedge.
  - Pieces: Discord bot (slash commands → our `/pub` API), an LLM support layer (Claude) over a small
    FAQ/knowledge base + ticket creation, and a finds-feed webhook per community.

**Shareable "found it" cards.** One-tap generate a clean image (store + product + ✅ + the little ETB
graphic + timestamp) to post on Discord/Reddit/X. Free viral marketing baked into every win. Server
renders an OG image per result so links unfurl pretty too.

**Drop calendar.** Known release dates per set/product, per brand site. Becomes the place you check
*before* a drop, not just after. Pairs with "notify-me." Data: a `drops` table (product, street date),
seedable from the existing product catalog.

**Community "Scores" wall.** When someone scores, they snap a photo of the haul + tag **where** they
got it and **what** they bought → it posts to a community feed on the site (per brand). Real
user-generated proof = trust + virality + FOMO, and it doubles as crowd-sourced restock intel
("3 people scored Pokémon at Target Northridge today" feeds the analytics moat). Pieces: photo
upload + storage (R2), a `scores` table (user, store, product, photo, caption, ts), a moderated
feed component, and "post your score" CTA on a successful in-stock result. Gamify later (badges,
local leaderboards, "hunter of the week").

---

## 3. Geographic Rollout (beyond California — fast)

Roll out by **region quadrant** so each area feels local and familiar:
  - **Quadrants:** West Coast · Southwest · Northwest · Mountain/Central · Midwest · Southeast · Northeast.
  - User picks (or geolocates) their location → assigned a quadrant → sees stores + regional chains
    they recognize (e.g., regional gas stations / drugstores that sell Pokémon at MSRP only in their
    area). Instant "this was built for me" credibility.
  - **Research pipeline:** reuse the hours-lookup pattern (LLM + web search) to research and seed
    stores per region/quadrant — chains, local shops, and the weird-but-gold spots (specific gas
    station brands, regional grocery, etc.). Same `fetchStoreHours` machinery, new `researchStores`.
  - Store gets a `region` (derive from address state → quadrant — cheap, can ship immediately) so the
    store list / brand sites can filter by region.
  - The Uber/Lyft runner piece unlocks true nationwide coverage (find anywhere → a local grabs it).

---

## 4. Logistics — the Runner/Uber piece
Find stock anywhere → a local runner grabs & ships/delivers it. The "too far? have a local grab it"
flow. (Owner has a prototype to share.) This is what makes the geographic rollout limitless.

---

## 5. Pre-Public Launch — must-resolve
**Legal/compliance** for AI voice calls (cloned voice, "never reveal you're an AI", calling CA
businesses): TCPA / FCC AI-robocall rules + two-party-consent (we store transcripts). Get clarity
before opening the doors. Not a blocker to building — a blocker to *public marketing*.

---

## Suggested rollout sequence (fast, compounding)
1. **Restock analytics dashboard** (data already exists) — turns the moat visible, internal + a public teaser.
2. **Region quadrants** (derive from state now) — unlocks "beyond CA" framing immediately.
3. **Headstart + finds visibility + pay-to-keep-private** — the monetization/scarcity layer.
4. **Notify-me-when-back** — retention loop.
5. **Shareable find cards** (OG images) — free growth.
6. **Discord bot + AI support** — community wedge.
7. **Drop calendar** — pre-drop engagement.
8. **Regional store research pipeline** — scale the database nationwide.
9. **Runner/Uber logistics** — nationwide fulfillment.
(Compliance runs in parallel, gates public marketing.)
