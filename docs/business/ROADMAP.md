# Check — Vision & Roadmap

## THE VISION (owner, locked in conversation with the PM, 2026-08-16)

**The goalpost.** A person opens checkitforme.com, names ANY business, and says in plain words what
they want done: "call Delta, move both my 11:30 tickets to the 8:10 flight, add a bag." We already
hold their account, their card, their authority ("approve whatever it costs") and every fact the task
needs. They press one button. Charlie calls, walks the menu, sits the hold for cents, and comes back
done. People are not buying phone calls; they are extending their life with an agent. People will
want to get OUT to stores more, not less — the agent does the recon so their time out is the good part.

**The wedge.** Collectible checks are the beachhead: high-urgency, phone-only information, no API
anywhere, customers pay per answer. The old vision line stands underneath as the wedge's moat: the
largest phone-verified database of retailers selling collectibles at MSRP. Consumers come first;
stores respond second — the big box chains with money move first, and it trickles down. A two-sided
marketplace built one side at a time.

**The phases, walking back from the goalpost.**
1. NOW — one call, excellent and cheap: the twenty-test walk on the robot store, the mapping menu
   walk next, 67% gross margin floor, Charlie talks 23 seconds or less, one memory per check owned
   by Echo.
2. The self-improving engine: the graph (dial a scene · read the record · grade against the cards AND
   the two money numbers · name the biggest waste · change ONE thing · re-dial · keep or revert). The
   robot store simulator grows personas — sleepy grumpy Staff, the talker, the upset customer, the
   kid who can't speak — thousands of simulations a day with no technology partner in the loop,
   benchmark-gated, auto-promoted when the whole exam stays green. Every real failed call becomes a
   permanent scene: a mistake happens once, ever.
3. Any business by phone number: a customer types a number, reverse lookup pulls name, site and
   hours, and today's by-hand homework runs automatically. HARD GUARD: the number must resolve to a
   public BUSINESS listing before Charlie ever dials — never a way to sic a robot on a private person.
4. Actions, not just answers (the Delta phase): the one memory grows into the authority envelope,
   what Charlie may spend, decide and say for this customer. Everything collected up front; if a
   business asks for a fact we do not hold, Charlie says "hold on one second, let me get that," we
   text or push the customer, and a customer who never answers gets the hang-up and still pays (that
   outcome gets its OWN status and owner-written words). Track two underneath: our own brain runs the
   conversation at 1 to 2 seconds a turn, the voice vendor only speaks.

**The knowledge engine (learned in real time, on customers' dime).**
- Three boxes, walled: the check's memory, the business's, the customer's. Business knowledge serves
  every customer automatically; a customer's own facts serve only them.
- Facts promote by agreement, never by a person: one store's box → the chain's box when enough stores
  agree; one contradiction demotes only that store. Ace Hardware's 7,000 stores sort themselves.
- The cheapest call is the one we never make: answers shared across customers while fresh, freshness
  learned per store per product. Cost per check becomes cost per FACT, paid once and sold many times.
  Restock patterns learned so well they will wonder if we put trackers on their trucks.
- Cliffs on the map, not just roads: failures are first-class facts (hangs up at lunch, punishes
  early presses, voicemail after six), so no lesson is paid for twice.
- Every check is a clock: real hold lengths per business per hour; work schedules itself into cheap
  windows and customers get warned before expensive ones.
- Paid calls carry the experiments: a stale fact re-proves itself on the next paying call, one
  experiment per call, only on the path to the goal, never on the goal itself.

**The models this walks into.**
- The marketplace (reverse advertising): verified demand meets verified supply, we take the cut. A
  store never buys an ad — HAVING the thing is the ad. Asymmetric curve: each fact costs cents once,
  each match is worth dollars many times, and only our side keeps the data.
- The truth feed: live street-level knowledge of what is actually on shelves and when it restocks,
  a data product for the people who decide where product ships.
- The playbook library: every efficient call becomes a saved program (rebook at this airline, renew
  at this pharmacy). TiVo recorded television; we learn the skip button for every business interaction.
- The new phonebook: Charlie's volume forces businesses to answer with their own agents; our knock
  becomes the machine-to-machine handshake, and we write the phonebook of which businesses have an
  agent. Then any store gets a free page — post your stock and the calls stop. The phone bootstraps
  the network; the network retires the phone.

**The threat, and the corner.** Real-time shelf tech (walk-out stores, NFC inventory) will erase the
site-vs-shelf gap for the giants. The corner we hold either way: the long tail that can never afford
those systems — hobby shops, comics, crafts, single-store retail — where a phone call stays the only
API for a decade. Case studies to steal from: Plaid (screen-scraped the ugly bootstrap until banks
built clean pipes and it stayed the standard), Instacart (humans walking aisles AS the missing
inventory API on the customer's dime until stores paid to integrate), OpenTable (aggregate the
diners, then hand restaurants the terminal — own demand and supply must come to you).

**The lines that never move.** Charlie tells the truth about being AI whenever a store asks, and one
day says it up front unasked, the day the owner calls the culture ready, maybe launch day, maybe
later, which makes us compliant in every US state the moment we flip it. NOT BUILT YET: neither
behavior is in Charlie's directions today; it goes in with the owner's own wording plus a walk scene
the day he hands the words over. Business numbers only, proven public before the first ring. Customer facts never
leave their box. Experiments never ride the goal of a paid call. Production ships only on the
owner's go.

---

## Open backlog (consolidated — newest thinking on top)
Status of each is detailed in the linked ops/security docs; this is the single checklist.

**Agent-team infrastructure (owner priority — take the owner out of the middle)**
- [ ] **Slack as the agent message bus + visibility layer.** Today every agent-to-agent handoff routes
  through the owner copy-pasting between phone chats (the human is the network cable). Goal: agents post
  status and hand off to each other in Slack, owner watches instead of relays. Two layers: (a) EASY WIN
  FIRST — agents post their done-reports and blockers to a #check-activity channel for visibility;
  (b) BIGGER BUILD — a shared handoff bus (the repo-doc version of this shipped 2026-07-22: every lane
  now watches `docs/team/<system>/checkpoint.md`; the Slack routing half is what's left) so one lane
  hands a commit to another without the owner between them.
  Autonomous inter-agent routing is a real project; the repo-doc handoff bus works today and is the
  cheap first step. Ties into the existing Grok-to-Claude repo automation the owner already runs.

**Design round — owner + Claude Design (Website implements on staging as comps land in repo)**
- [ ] **Check+ premium signup flow (1a–1d)** — the comp was never delivered into the repo; as of 08-05 the
  comps themselves are being re-cut (they drifted from the live site), so this waits on that.
- [x] **Thrift + Hobby store types & paths** — BUILT: both types have their own consumer flows, opt-in, and
  store data. ⚠️ **Hobby-store flow applies ONLY to sports cards + TCG** — never NeeDoh/other non-card products.
- [ ] **"My checks" section redesign** — comps coming.
- [ ] **Home page layout with stores** — comps coming.
Owner reviews each on staging before promote. Status testing (13-status sweep) resumes after this round.

**Launch-path / now**
- [~] Merge staging → prod and deploy — **first promote after the rebuild DONE 2026-07-30** (prod + Admin
  serve it). Still open: set `COMP_PHONES` in prod policy; verify phone + second-cell caller-ID.
- [ ] **Promote checklist (owner, 2026-07-01):** after the staging→prod merge, verify prod calls are
  REAL store calls and the Admin God view reflects them accurately (cost/call, mapping performance);
  staging keeps feeding the owner's test-call reports separately. Press "Start fresh" (`stats_since`)
  at launch so only post-launch calls count.
- [~] **Commerce build-out — owner + DevOps.** Test-mode staging proven; **2026-07-03: 4-tier ladder
  (Family/Collector/Hunter/Operator) + PAYG + 8-feature admin matrix built, live, published to Stripe.**
  Remaining: Website renders /pub/plans + gates premium (PAYG hidden) + Admin feature-matrix UI (both
  filed); embedded Stripe Elements checkout in comp design (Website+DevOps); LIVE-mode webhook at promote;
  ReadMe LAUNCHED 2026-07-03 (project "Checkitforme" → Plans & Pricing: Plans · Premium features ·
  Pay as you go · How billing works). Optional: GitHub Action auto-sync (README_API_KEY as a secret — owner to authorize).
- [ ] **Premium sign-up area redesign** on the website using Claude design (Website + Design lanes;
  owner-requested 2026-07-01).
- [ ] Route the consumer "check" through the **bridge** so caller-ID applies (plain `/app/check` uses the house number).
- [ ] "Create your agent" caller-ID panel (Admin/Website) using `/auth/callerid/*`.
- [ ] Flip `requirePhoneSignup` ON + remove Clerk once the phone UI is solid.
- [ ] **Split `src/server.ts` into route modules** (public/admin/auth/webhooks) — unblocks Website + Admin parallel work.

**Scale / infra**
- [x] **Mid-call hold suspend — BUILT 2026-08 (staging).** Charlie is dropped when Staff puts us on hold
  (his meter stops), a cheap listener waits for a returning voice, and he is reconnected with context.
  Open follow-on: the hold hang-up timer (owner wants one, number undecided).
- [ ] Redis-backed rate limiter (multi-instance) · single-leader schedulers ✅(done).
- [ ] TiDB cutover (connection staged; needs SQL string + backfill — git history).
- [ ] Analytics → SQL (dashboards load whole tables today).
- [ ] PostHog SDK wiring (errors + product events; key wired).
- [ ] Telephony at scale: concurrency planning + pickup-rate monitoring.

**Security** (git history)
- [~] Transcript IDOR — **backend shipped 2026-07-01** (`flags.transcriptAuth`, off). Remaining:
  Website sends the Bearer token on `/pub/result`+`/pub/live` (filed in website.md) → DevOps flips the flag.
- [x] XFF rate-limit, SVG XSS, constant-time webhook sig, prod security boot-gate, esc() — done.
- [ ] **Pre-public hardening (owner decision 2026-07-01: rotate at launch, not now — key flexibility
  needed while devs move fast):** rotate ALL leaked keys (Railway token — pasted in chats, GITHUB_PAT,
  TiDB password), set STRIPE_WEBHOOK_SECRET on staging, verify PostHog actually captures events,
  define the key-handling process (who gets keys, how, rotation cadence).

**Revenue / GTM** (git history)
- [~] Finalize Stripe — test-mode staging proven 2026-07-02; live-mode webhook + pricing sign-off at promote.
- [ ] Wire confirmed call-cost rates into the admin cost dashboard (after the voice switcher is validated).
- [~] 3-tier customer support (FAQ → Claude → ticket) — the on-site ladder, RAG via Qdrant, and ticket
  creation are BUILT (`src/support/`). Remaining: the Discord side.
- [ ] Legal/compliance review of AI voice calling (gates public marketing).

**Domain / brand** (git history)
- [ ] 301 redirects fungibles verticals → checkitforme; deprecate fungibles after cutover.
- [ ] Finish the "Check" rebrand text sweep across all docs (boot doc done; others have stray "Fungibles/Runnr").

**Big later**
- [x] **Migrate `voice-caller/` to its own repo.** DONE 2026-07 — you are in it (`nocodehandsfree/checkitforme`). It's a self-contained product; a split gives clean
  CI/deploy/history separation from the Fungibles app. Significant work (new Railway service config,
  CI, secrets, git history) — capture now, do when there's room. (See `docs/shared/ARCHITECTURE.md`.)

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

**C) Agent switcher / live-call brain hand-off — BUILT (the new calling engine, 2026-07/08, staging).**
Option (a) is what shipped: the bridge reconnects the Twilio audio stream to a ConvAI agent when a human
is detected, so the cheap parts work the phone tree and Charlie is only engaged on a real person. The
same machinery drops and reconnects him across a hold. Still OFF on production until the owner flips it.

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
**Legal/compliance** for AI voice calls (cloned voice, truthful-when-asked AI identity per the owner's 08-16 ruling, calling CA
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
