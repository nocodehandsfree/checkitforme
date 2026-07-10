# Cost-Per-Check Model

> **One economics doc.** This file now holds both halves: **Part I — the cost-per-check framework**
> (below) and **Part II — call economics: anatomy, lanes, levers, pricing** (merged in from the former
> `business/CALL_ECONOMICS.md`). Where the two use different ElevenLabs rate assumptions, Part II's
> Admin→Calc rates ($0.0012/s ≈ $0.072/min EL) are the **current canonical** figures; Part I keeps its
> earlier two-scenario framing ($0.10–0.22/min) as the validate-against-invoices analysis. **Live
> plans/prices are edited in Admin (`src/plans.ts` / `vt_plans` settings), wired to Stripe — that is the
> source of truth; the pricing tables here are cost-based recommendations, not the live ladder.**

## Part I — the cost-per-check framework

Goal: know the **exact cost of one check** so the per-check price and the call cap can be tuned for
margin. With a hard duration cap, one check has a fixed *worst-case* cost. **Numbers below are a
framework with explicit assumptions — validate the starred ⭐ inputs against real invoices/Helicone
before trusting the margin.** This is analysis only; nothing here changes code.

## Cost components (per check = one call)

| Component | Rate (assumption) | Notes |
|---|---|---|
| ⭐ ElevenLabs ConvAI | **two scenarios** — see below | The dominant + most uncertain cost |
| Twilio voice (outbound US) | ~$0.014 / min | Stable, well-known |
| ⭐ LLM (Haiku nav + Sonnet human) | ~$0.01–0.05 / call | Get exact from **Helicone** once routed |
| Stripe fee | 2.9% + $0.30 / *purchase* | Amortized over a pack, not per check |
| SMS verify (Twilio Verify) | ~$0.05 once / signup | One-time, NOT per check |

### ⭐ The ElevenLabs question (this decides everything)
The code estimates EL from a **character-credit** basis: `$1.82 / 10k credits`, `1200 credits/min`
(`calls/service.ts`) → **~$0.22/min**. But ElevenLabs **ConvAI** is typically billed
**per-minute (~$0.08–0.12/min)** on volume plans, which is very different. Until confirmed, model both:

| Scenario | EL $/min |
|---|---|
| **A — credit-basis (code's current assumption)** | ~$0.22 |
| **B — ConvAI per-minute (likely real)** | ~$0.10 |

## Cost per check by call length (Twilio + EL + ~$0.03 LLM)

| Call length | Scenario A (EL ~$0.22/min) | Scenario B (EL ~$0.10/min) |
|---|---|---|
| 60s (good) | ~$0.26 | ~$0.14 |
| 85s (current avg) | ~$0.36 | ~$0.19 |
| 120s (the 180s-capped worst realistic) | ~$0.51 | ~$0.27 |

(LLM held at ~$0.03; Twilio at $0.014/min.)

## Margin vs the current price (`policy.pricing.perCallCents = 25` → $0.25/check)

| | Scenario A | Scenario B |
|---|---|---|
| 60s | **−$0.01** (breakeven) | **+$0.11** |
| 85s avg | **−$0.11 (LOSS)** | **+$0.06** |
| 120s | **−$0.26 (LOSS)** | **−$0.02** |

### 🔴 The headline finding
**If EL is on the credit basis (Scenario A), $0.25/check loses money at the average call length.**
If EL is true ConvAI per-minute (Scenario B), $0.25 is thin-but-positive on a good call and roughly
breakeven at the cap. **Either way, margin is fragile and call length is the lever.** Action items:

1. **Confirm the real ElevenLabs rate** (plan/invoice) — this single number decides profitability.
2. **Get the real LLM cost** from Helicone once the Haiku-nav/Sonnet-human split is routed through it.
3. **The cost cap is the profit guarantee** — every second saved is direct margin. The bail rules
   (got-answer-hangup, voicemail/IVR/hold bails) shorten the *average*, which matters more than the cap.
4. **Revisit the $0.25 price** once 1–2 are known. The membership (`perCallCents: 18`) is even tighter —
   confirm it clears cost in Scenario B before promoting it.

## The dashboard to build (IMPLEMENTATION_SPECS §6)
`/api/admin/cost`: pull Helicone LLM $/call + telephony estimate per finished call →
`avg cost/check`, `max cost/check` (at the cap), and live margin vs `perCallCents`. Tie the daily
total into the spend kill-switch (§2). Then this doc's assumptions become measured reality.

## Levers to improve margin (ranked)
1. **Shorter calls** — bail rules + DTMF phone-tree shortcuts (skip the menu) cut EL+Twilio+LLM together.
2. **Cheaper brain on hold/nav** — Haiku for navigation, premium only on the human (dev built this).
3. **Right EL plan** — move to the per-minute ConvAI tier if we're on the credit basis.
4. **Price** — raise per-check or push the membership (better per-call economics + predictable revenue).
5. **Cache/skip** — one-check-per-store-per-day (§4) avoids paying for redundant calls.

---

## Measured data + optimization projections (2026-06-15)

First admin "Call time & cost" reading (⚠️ **n=1 call — directional only, need volume**):
`AVG CALL 1:42 (~102s)` · `AVG TO HUMAN 2s` · `AVG TALK 1:40`.

**Critical truth (from the dashboard itself):** *ElevenLabs bills the WHOLE connected call* — and so
does Twilio. So nav + hold time is full cost, and:
- The **LLM switcher (Haiku-nav → Sonnet-human)** saves only the **LLM slice** (the smallest cost
  component). Real, but modest in dollars — it does NOT reduce EL or Twilio minutes.
- The **dominant lever is total call DURATION.** DTMF "press-to-front" (e.g. Walgreens `000`,
  CVS "front store") + aggressive bail cut EL **and** Twilio together. That's the real saving.

### Cost/check at key durations

| | EL credit-basis (~$0.22/min) | EL ConvAI/min (~$0.10/min) |
|---|---|---|
| **Max at 180s cap** | **~$0.76** | **~$0.40** |
| Current avg (~102s) | ~$0.43 | ~$0.23 |
| **Optimized avg (~70s)** (DTMF + bail + switcher) | **~$0.29** | **~$0.15** |

≈ **35% cost reduction**, almost all from shorter calls (the LLM switch is the small part). The
cap-max only falls if the cap itself is lowered.

### Validate the new tech before trusting these
1. **DTMF press-to-front** — test per chain; document the keypad path (chains.dtmfShortcut, e.g.
   `0@3` already supported). Biggest duration win on deep-IVR chains (CVS/Walgreens).
2. **LLM switcher** — confirm the mid-call Haiku→Sonnet handoff works on EL's stack; measure the
   LLM $ delta in Helicone (this is what proves its value).

### Make the ROI calc compute dollars, not just minutes
Add to the admin "Call time & cost" card:
- **Cost split** per check: EL / Twilio / LLM (LLM from Helicone) + **margin vs perCallCents**.
- **Avg time-to-human PER CHAIN** — ranks which phone trees to DTMF-document first (worst = costliest).
- **Nav+hold vs talk ratio** — the "waste %", i.e. the optimization headroom on each chain.
- **Projected cost**: current avg vs optimized-avg, so the impact of each fix is visible.
- Needs volume (n=1 today) — the numbers get trustworthy after a few hundred calls.

---

## Full cost build-up per call — 45s / 60s / 90s / 120s (2026-06-15)

Owner proposes dropping the cap 180s → **90s** ("if we get through the tree fast we're rarely on
hold long"). Every cost to serve one connected call, primary scenario = ElevenLabs @ ~$0.10/min:

| Service | 45s | 60s | 90s | 120s |
|---|---|---|---|---|
| ElevenLabs Conversational AI (STT+TTS+turn-taking, full call @ ~$0.10/min) ⭐ | $0.075 | $0.100 | $0.150 | $0.200 |
| Twilio outbound carrier minutes (the phone connection, full call @ ~$0.014/min) | $0.011 | $0.014 | $0.021 | $0.028 |
| LLM — phone-tree navigation, Claude Haiku (first ~15s) ⭐ | $0.002 | $0.002 | $0.002 | $0.002 |
| LLM — human conversation, Claude Sonnet 4.6 (talk time @ ~$0.024/min) ⭐ | $0.012 | $0.018 | $0.030 | $0.042 |
| Twilio phone-number rental (amortized per call) | $0.001 | $0.001 | $0.001 | $0.001 |
| Helicone LLM gateway (flat/free tier) | $0.000 | $0.000 | $0.000 | $0.000 |
| Railway server compute (amortized per call) | $0.001 | $0.001 | $0.001 | $0.001 |
| **TOTAL** | **$0.102** | **$0.136** | **$0.205** | **$0.274** |
| Margin @ $0.25 price | +$0.148 | +$0.114 | +$0.045 | −$0.024 |

**If EL is the credit-basis rate (~$0.22/min) instead**, totals become **$0.19 / $0.26 / $0.39 / $0.51**
(60s already loses money at $0.25). ⭐ lines = confirm via EL invoice + Helicone.

**Takeaways:** EL is ~75% of cost and scales per-second → a **90s cap** is the sweet spot
(~$0.20 cost, healthy margin); 120s goes underwater at $0.25. DTMF press-to-front + fast bail beat
the LLM switch for savings. Set `policy.bail.maxCallSeconds` 180 → 90 once the DTMF/switcher tech is
validated in the field.

---

## Part II — Call economics: anatomy, lanes, levers, pricing

_Merged in from the former `business/CALL_ECONOMICS.md` (2026-07). Rates below are the Admin → Calc
defaults and are the current canonical figures (see the note at the top of this file)._

> The goal, verbatim: **"by the time we speak with an agent, they can talk for 30 seconds and we're
> five cents or less."** This section breaks a call into billable segments, prices the three nav models
> with our own Calc rates, ranks the levers, and recommends tier pricing.
> Rates used (Admin → Calc defaults): Twilio $0.014/min · ElevenLabs $0.072/min ($0.0012/s) ·
> LLM $0.0002/s · $0.001 overhead/call.

### 1. Anatomy of a call — who's on the line, and what each second costs

Every call is five segments. The ONLY expensive passenger is the conversational agent (ElevenLabs
+ LLM ≈ **8.4¢/min**). The phone line itself is ~1.4¢/min — 6× cheaper.

| Segment | Charlie (direct) | Alpha (tone tree) | Bravo (voice tree) | Who NEEDS to be on the line |
|---|---|---|---|---|
| Dial + ring | ~10-20s | ~10-20s | ~10-20s | Nobody (Twilio only) |
| Menu / nav | 0 | press digits (recipe) | say words (recipe) | **Nobody** — locked recipes replay via Twilio DTMF/TTS. No AI. |
| Hold / transfer | short | ~10-20s | ~15-30s | Nobody |
| **Human talk** | ~30s | ~30s | ~30s | **The agent** — this is the only segment worth 8.4¢/min |
| Wrap / verdict | 0 (post-call) | 0 | 0 | Second-read LLM, ~$0.002 |

**The single biggest waste today:** live checks put the agent on the line from DIAL. On a CVS call
(65s nav + 30s talk) the agent bills ~95s but only earns its money for 30 — we pay ~8¢/min to
listen to hold music. The mapper's replay machinery (timed barge plans + mechanical keyword
recovery, shipped 2026-07-02) is exactly the tech that walks a menu with **zero AI** — and the
bridge already supports **connect-on-human**.

### 2. Cost per completed check — the two paths (30s talk)

**CORRECTION (owner review, 2026-07-02):** the cheap lane is IMPLEMENTED and LIVE for consumer
checks — `connectOnHuman: true` in production policy, bail rules on. A 20s-talk bridge check runs
~5¢ today, as designed. The expensive column below is NOT "today for everything" — it is the
DIRECT-AGENT path that some callers still use.

| Lane | Direct-agent path (agent on from dial) | Bridge path (agent joins at the human) |
|---|---|---|
| Charlie — direct (WinCo, 36s to human) | ~10¢ | **~4.8¢** ✅ live today |
| Alpha — tone tree (recipe DTMF, ~40s nav) | ~11¢ | **~5.1¢** ✅ live today |
| Bravo — voice tree (CVS, 65s nav) | ~14.5¢ | **~5.5¢** ✅ live today |

**Who still rides the direct-agent path (the real gap):**
- **Scheduled checks / restock alerts** (customer-schedules → triggerCall) — the volume driver for
  subscription tiers, paying ~2× per call
- The plain `/pub/check` fallback (non-live variant)
- Zone fires (callZone) and admin call-now
- Bench/test calls (fine — they are rehearsal)

Failed dials on the bridge are ~1-1.5¢ (no agent); on the direct-agent path they burn agent time.

### 3. The levers, ranked (first two are step-changes)

1. **Connect-on-human as the default for live checks** — agent never hears a menu or hold music.
   Halves the cost of every call on every lane. The bridge + recipes already exist; this is a
   wiring decision, not a build.
2. **Fresh-verdict cache (cross-user dedup)** — if ANY user checked Store X for Pokémon in the
   last N hours, serve that verdict instantly and free (offer "force a fresh call" to premium).
   Hot stores amortize to ~$0 marginal. The comps' price-aggregation dev-note already implies
   this model ("latest wins, fresh ≤7d"). This is the compounding moat: every call makes the
   next one cheaper.
3. **Queue coalescing / multi-product calls** — hold a store's pending checks ~60s and ask them
   in ONE call (`extraCategoryIds` already supports multi-line asks). Three users, one call:
   cost splits three ways.
4. **Hold-handback** — clerk says "let me go check" → disconnect the agent, Twilio holds the
   line, reconnect on voice. "Went to check" calls are our LONGEST (60-120s hold = 7-14¢ of
   agent time saved per call).
5. **Model ladder per phase** — mapping brain: flash-lite (done) · live nav: NO model (recipes) ·
   standard talk: small model · premium multi-question talk + messy transcripts: smart model.
   Never one model for all jobs.
6. **Dial-window intelligence** — our own restock/reach data says when each chain actually picks
   up. Dialing in high-reach windows cuts the 1.5-wasted-dials tax directly.
7. **Script front-loading** — "any Pokémon **booster boxes** in?" beats "any Pokémon?" → "which
   products?" — one merged Q-A round trip saves ~10-15s of agent time on premium asks.

### 4. Premium calls (the multi-question ask)

Product/set/price questions ("booster box or sleeved? which set? how much?") extend talk to
~60-90s and want the smarter model for extraction:

- Cost: standard ~5¢ → premium **~12-15¢ all-in** (agent 60-90s + smart LLM + second read).
- Worth it twice over: (a) subscribers pay monthly for it, (b) every premium call harvests
  structured product/set/price data that feeds restock-intel and the price board — an asset that
  makes cached answers richer for everyone.

### 5. Pricing — recommendation

> ⚠️ **Not the live ladder.** Live plans/prices are edited in **Admin** (`src/plans.ts` / `vt_plans`
> settings) and published to Stripe — that is the source of truth. The table below is the original
> cost-based recommendation, kept for the economics rationale only.

Anchors: standard check ≤6¢ blended, premium ≤15¢. Assume honest-worst-case usage (100% of quota)
must still be profitable; real subscription usage runs 30-60%.

| Tier | Price | Checks/mo | Rev/check | Cost/check (blended) | Margin at 100% usage |
|---|---|---|---|---|---|
| **Pay as you go** | $9.99 / 10 → $59.99 / 100 (slider, "buy more pay less": 99¢ → 60¢) | — | 60-99¢ | ~6¢ | **10-16×** |
| **Hunter $9.99/mo** | $9.99 | **30** standard | 33¢ | ~6¢ | 5.5× |
| **Collector $19.99/mo** | $19.99 | **100** (premium asks unlocked) | 20¢ | ~8¢ (30% premium mix) | 2.5× |
| **Operator $49.99/mo** (exists) | $49.99 | **350** + everything | 14¢ | ~7¢ | 2× |
| **Shop / bulk (B2B)** | invoice | 500-1,000 at 8-10¢ | 8-10¢ | ~6¢ | 1.3-1.6× at volume |

Notes:
- **Don't sell unlimited.** The quota IS the margin guarantee; 350 at $49.99 is already generous.
- Annual −17% (matches the comps) is fine at these margins.
- Premium asks are the $19.99 hook: "ask for the exact set and product, get the price quoted."
- The cache turns high tiers profitable even at 100% usage: heavy users concentrate on hot stores,
  which are exactly the stores most likely to be answered from cache.
- Gate: margins hold today for BRIDGE checks. Subscriber auto-checks (scheduled) still ride the
  direct-agent path at ~2× cost — migrate them to the bridge before pushing subscription volume.

### 6. What to build, in order

1. Migrate the remaining callers onto the bridge: scheduled checks FIRST (subscription volume),
   then /pub/check fallback + zone calls. (Connect-on-human itself is already live.)
2. Fresh-verdict cache with a per-category TTL + premium "force fresh."
3. Queue coalescing per store (60s window).
4. Model ladder config in Admin (standard vs premium LLM).
5. Hold-handback in the bridge.
6. Dial-window scheduler from reach-rate data.

### 7. The D-lane and beyond (new, 2026-07-02 late session)

A/B/C solved the NAV. These attack the remaining spend — the talk itself, and mapping speed:

- **D-lane "tape deck"** — standard checks are one question, one answer. Twilio plays a
  PRE-RECORDED Branson clip at pickup (instant, studio-clean, never repeats awkwardly), captures
  the reply, classifies it async with a cheap model; a small clip library covers follow-ups
  ("booster boxes or packs?" / "know what day?" / "awesome, thanks!"). Anything off-script
  escalates mid-call to the live agent (bridge supports join). ~5¢ → **~2.5¢** on the majority of
  checks; the live agent becomes the exception. Also kills greeting latency as a side effect.
  Step 1 (zero risk): pre-rolled OPENER only — play the clip at pickup while the agent connects,
  saving 3-5s of billed agent time per call and the awkward first-second gap.
- **Learned direct lines** — mapping calls already reach a human; ask ONE extra question during
  mapping only: "is there an extension that rings the front directly?" Store per-store. A 65s
  tree becomes a ~10s extension dial. The menu stops existing for us.
- **IVR genome** — most chains run one of ~6 IVR vendors with signature behavior (barge windows,
  0-routing, extension syntax). Fingerprint the greeting → apply the vendor template → unmapped
  chains map in one call instead of discovery rounds.
- **Script tournament** — rotation already logs opener → outcome. Score openers on answer rate,
  seconds-to-answer, and clarity (how often the clerk says "what?"); auto-promote winners. Feeds
  the tape-deck clip library with proven lines.
- **Day/night recipe variants** — menus change after hours (CVS pharmacy-closed variant,
  live-observed 2026-07-02). Lock a recipe per window.
- **Parallel racing (product-level checks)** — race 2-3 nearby stores on the cheap lane, first
  human wins, others hang up pre-agent. Answer in min(t) not avg(t) for ~1¢ extra line time.

_Numbers from Admin → Calc rates; call timings from the 2026-07-02 mapping runs (WinCo direct 36s,
CVS 65s nav / 80s to person). Owned by the owner; maintained in Admin lane._
