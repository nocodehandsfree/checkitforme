# Cheap-Nav Architecture — ElevenLabs only on the human

> **The single biggest margin lever.** Owner-confirmed design (reconstructed 2026-06-18 after a
> context compaction lost it). This is the "Twilio-first, patch to ElevenLabs on the human" model.

## The insight

ElevenLabs Conversational AI is ~**75% of the cost** of a call and it **bills the ENTIRE connected
minute** — including the 30–75s spent navigating a phone tree, where its premium "ears + mouth +
timing" add **zero value** (we're just picking a menu word). So: **don't run ElevenLabs during
navigation at all.** Twilio carries the call; cheap parts work the tree; ElevenLabs is engaged ONLY
once a real person is on the line.

This is NOT an LLM swap *inside* ElevenLabs (that's impossible — one EL session = one brain). It's
keeping EL *out* of the call until the human picks up.

## The flow

```
Twilio places the call ──► Twilio Media Stream ──► OUR server (the "nav broker")
                                                      │
                          ┌───────── navigation phase (NO ElevenLabs) ─────────┐
                          │  voice tree : cheap STT → Haiku picks the word →    │
                          │               cheap TTS speaks it. loop.            │
                          │  keypad     : just send the DTMF digits. ~free.     │
                          │  direct     : (skip — a person answered)            │
                          └─────────────────────────────────────────────────────┘
                                                      │
                              HUMAN DETECTED ─────────┘
                                                      │
                                                      ▼
                          patch the media stream into ElevenLabs ConvAI + Sonnet
                          (EL billing starts HERE) — handle the clerk, get the answer
```

## The three call shapes + cost (owner's tables)

| Shape | Reach-the-human phase | Talk phase (ElevenLabs + Sonnet) | Line | **Total** |
|---|---|---|---|---|
| **CVS** (voice tree) | Twilio STT $0.010 + Haiku $0.002 + cheap TTS $0.001 = **$0.013** | EL $0.050 + Sonnet $0.012 = $0.062 | $0.016 | **$0.091** |
| **Walgreens** (keypad) | bridge presses digits = **$0.000** | EL $0.067 + Sonnet $0.016 = $0.083 | $0.016 | **$0.099** |
| **Ross** (direct, no tree) | person answers = **$0.000** | EL $0.092 + Sonnet $0.022 = $0.114 | $0.016 | **$0.130** |

vs. the current all-EL path (~$0.20 on a ~90s CVS call). **The deeper/longer the tree, the bigger the
win** — because that's EL minutes we no longer pay for. Keypad nav is essentially free.

## The hard part: detecting the human

The whole thing hinges on knowing when the IVR handed us to a person, so we patch to EL at the right
moment. Signals, cheapest first:
1. **We finished the known tree** (said our last word / pressed the last digit) → the next voice after
   the transfer/hold/ring is almost certainly the human.
2. **Off-script speech** — the IVR is predictable (it matches `chains.phoneTreeDefault`); a human goes
   off-script ("CVS, this is Sarah", "how can I help?"). Haiku classifies each STT line: menu vs person.
3. **Fallback: when unsure, patch to EL.** Over-engaging EL by a few seconds is cheap insurance against
   missing the human (the costly failure mode).

## Build pieces (this is a real build, not a config tweak)

- A **nav broker** on the Twilio Media Stream that runs the STT → Haiku → TTS/DTMF loop with
  human-detection, BEFORE EL is engaged.
- The existing Twilio↔EL bridge becomes the **second half**, triggered on human-detect instead of at
  call start.
- Per-chain **nav mode**: `voice` (STT+Haiku+TTS) · `keypad` (DTMF) · `direct` (straight to EL).
- Reuse `chains.phoneTreeDefault` as Haiku's nav instructions (already written per chain).

## Status / sequencing

- **Smallest first step:** the `connectOnHuman` flag (keypad chains) — nav is free DTMF, EL engages only
  on pickup. Lowest risk, already partially scaffolded.
- **Then** the voice-tree broker (STT + Haiku + cheap TTS) — the CVS case, the biggest saver.
- **NOT a same-night change before a demo** — the current all-Sonnet-through-EL path is what's polished
  and working. Stage this immediately after the demo locks.
