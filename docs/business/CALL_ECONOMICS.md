# Call Economics — anatomy, cost model, and pricing

> The goal, verbatim: **"by the time we speak with an agent, they can talk for 30 seconds and we're
> five cents or less."** This doc breaks a call into billable segments, prices the three nav models
> with our own Calc rates, ranks the levers, and recommends tier pricing.
> Rates used (Admin → Calc defaults): Twilio $0.014/min · ElevenLabs $0.072/min ($0.0012/s) ·
> LLM $0.0002/s · $0.001 overhead/call.

---

## 1. Anatomy of a call — who's on the line, and what each second costs

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

## 2. Cost per completed check — today vs optimized (30s talk)

| Lane | Today (agent on whole call) | Optimized (agent joins at the human) |
|---|---|---|
| Charlie — direct (WinCo, 36s to human) | ~10¢ | **~4.8¢** ✅ |
| Alpha — tone tree (recipe DTMF, ~40s nav) | ~11¢ | **~5.1¢** ✅ |
| Bravo — voice tree (CVS, 65s nav) | ~14.5¢ | **~5.5¢** (≤5¢ as barge maps shave nav) |

Optimized = Twilio carries ring+nav+hold (recipe replay), agent connects at pickup for ~30s,
cheap-tier LLM for the standard yes/no ask (the ask is simple; a small model classifies it fine —
reserve the smart model for premium calls and mid-call weirdness).

**Failed dials get cheap too:** reach rate is ~40%, so every check carries ~1.5 wasted dials.
Today a wasted dial burns agent minutes (4-10¢); with connect-on-human + instant voicemail/closed
bail (shipped), a wasted dial is **~1-1.5¢ of phone line**. Blended cost per delivered answer:
**~7-8¢ today's path → ~6¢ optimized → ~5¢ with nav shaving.**

## 3. The levers, ranked (first two are step-changes)

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

## 4. Premium calls (the multi-question ask)

Product/set/price questions ("booster box or sleeved? which set? how much?") extend talk to
~60-90s and want the smarter model for extraction:

- Cost: standard ~5¢ → premium **~12-15¢ all-in** (agent 60-90s + smart LLM + second read).
- Worth it twice over: (a) subscribers pay monthly for it, (b) every premium call harvests
  structured product/set/price data that feeds restock-intel and the price board — an asset that
  makes cached answers richer for everyone.

## 5. Pricing — recommendation

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
- Gate: these numbers hold ONLY after lever #1 (connect-on-human default). At today's
  whole-call-agent cost, Operator at 100% usage is ~14.5¢ rev vs ~15¢+ premium-mix cost — thin.
  **Lever #1 is the pricing unlock, not a nice-to-have.**

## 6. What to build, in order

1. Connect-on-human default for live checks (wiring + a per-chain "recipe verified" gate — the
   mapper's locks are the safety proof).
2. Fresh-verdict cache with a per-category TTL + premium "force fresh."
3. Queue coalescing per store (60s window).
4. Model ladder config in Admin (standard vs premium LLM).
5. Hold-handback in the bridge.
6. Dial-window scheduler from reach-rate data.

_Numbers from Admin → Calc rates; call timings from the 2026-07-02 mapping runs (WinCo direct 36s,
CVS 65s nav / 80s to person). Owned by the owner; maintained in Admin lane._
