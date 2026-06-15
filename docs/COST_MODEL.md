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
