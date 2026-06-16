# Cost-Per-Check Model

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
