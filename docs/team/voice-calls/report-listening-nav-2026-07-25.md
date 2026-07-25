# LISTENING NAVIGATION — built, live on staging, driven on real stores (2026-07-25)

**What changed: each mapped step now fires when the recording actually stops talking, instead of at a
fixed second.** The recipe still says WHAT to press or say — only the WHEN moved. Costs nothing extra.

## Why the stopwatch failed

The recipe's seconds were learned at one store and replayed at every other. Measured 07-24, Target
greetings end anywhere from 9s (Austin) to 20s (Topanga) — an 11-second spread no single number
survives. That is why CVS said "no" at 26s before the healthcare question was asked, Walmart pressed
9 at 4s inside the greeting, and Target pressed 2 at 8s where the store was still saying its name.

## How it works

`src/calls/listen-nav.ts` watches the audio Twilio **already** forks to us for live-listen
(`<Start><Stream>` → `/twilio-media`, running from the instant of pickup) and reports when a prompt
ENDS: a burst of sound long enough to be a real prompt (≥900ms), followed by a clear pause (≥700ms).

Each mapped step becomes **eligible** 12 seconds before its learned time, then fires on the next
prompt ending. If a store never gives a clean pause, the learned time **+15s** fires it anyway — so
listening can delay a step but never lose one.

Steps reach the call as Twilio **call-updates**. The `<Start><Stream>` fork survives TwiML
replacement, so audio never doubles and the fork is never re-added. The opening document ends in a
dead-man `<Connect>`: if every call-update failed, the call still hands to the agent instead of
hanging up mid-menu.

**Cost: $0 added.** No speech recognition, no model — frame energy on audio we already receive.
Twilio's own speech recognition was measured at $0.02 per 15s interval (~8.6¢/call) and is
deliberately not used.

## Rollout

One setting, `listen_nav`, editable through Admin (`PATCH /api/settings {"listenNav": …}`):
`off` (default) · `all` · or a comma list of chain names.

**Single checks, scheduled checks and ZONE fires all ride the same code path** — a zone store dials
`bridgeStoreCall` exactly like a single check (`src/server.ts:3667`), and that one call site now
passes the flag. Nothing zone-specific was needed and nothing can drift between them.

Currently `target,cvs` on **staging only**. Prod is untouched and unflagged (verified).

## Driven live — Target Topanga, staging, 2026-07-25 00:36 UTC

Topanga was chosen deliberately: it has the longest greeting of the 70 stores mapped on 07-24, so it
is exactly where a stopwatch fires into the middle of a sentence.

```
00:36:40  listen-nav: armed for 2 step(s)
00:36:56  press "2" at 16s  (learned 8s, fired on the prompt ending)   <- stopwatch would have
                                                                          pressed mid-greeting
00:37:03  press "2" at 23s  (learned 16s)
00:37:03  menu ended at 23s (map said 16s) -> agent window re-based
00:37:04  handing to the bridge
00:37:06  connect-on-human: connecting (human)   <- Charlie joins only now
00:37:21  Clerk: "Target Topanga, how can I help you?"
00:38:02  Clerk: "We only have the single packs for Chaos Rising."
```

Verdict landed with real product detail. **First press was 8 seconds later than the recipe would have
fired it, and that is the whole point.**

### A bug the live call caught

Step 2 fired at 23s off step 1's stale fallback timer instead of waiting for its own prompt.
`armClockFallback` added a timer without clearing the pending one. Harmless on that call, wrong in
general — fixed and pushed the same session.

## What that call actually cost — measured, not modelled

| Piece | Measured |
|---|---|
| Twilio line | 84s → 2 billed minutes → **2.8¢** |
| Charlie on the line | 60s → **11.0¢** |
| Navigation | **0¢** |
| **Total** | **≈13.9¢** |

**Navigation is now free and correct. That call was still expensive, and not because of navigation.**
The clerk said "give me one second, let me ask" and walked away for ~25 seconds with Charlie billing
the whole time. Talk time, not menu time, is now the entire cost problem.

On the same call without that hold: menu done 23s, human 27s, 20s of talk = 47s total → one billed
minute → **5.2¢**, the baseline.

## Driven live — CVS Mulholland Drive, staging, 2026-07-25 00:39 UTC (the Bravo case)

This is the failure the owner heard: the old code said "no" at a fixed 26s, before the
healthcare-provider question was even asked, so the menu looped.

```
00:39:34  listen-nav: armed for 3 step(s)
00:39:51  say "no"      at 16s  (learned 26s, fired on the prompt ending)   <- 10s EARLIER than the
                                                                              recipe, because the
                                                                              question really ended
00:40:00  say "front"   at 26s  (learned 38s)
00:40:15  say "general" at 41s  (learned 48s)
00:40:15  menu ended at 41s (map said 48s) -> agent window re-based
00:40:21  connect-on-human: connecting (human)
00:40:25  Clerk: "Transferring you now."
00:40:38  Clerk: "CVS Well and Health, how may I help you?"
00:40:47  Clerk: "Hello. No, nothing came in."
```

**The menu was walked 7 seconds FASTER than the mapped recipe** (41s vs 48s), because two of the
three prompts ended sooner than the map assumed. Listening does not only prevent early firing — it
also stops us waiting on a clock when the store is already done talking.

Cost, measured: Twilio 74s → 2 billed minutes → 2.8¢ · Charlie 28s → 5.1¢ · **total ≈8.0¢**. Still
over 5¢, and again the reason is talk time, not navigation: the transfer hold and a 28-second
conversation. Navigation itself cost nothing.

## What is NOT done
- **The "clerk walked away" lever is untouched.** COST_MODEL Part II §3 lever 4 (hold-handback:
  drop the agent while the clerk is away, rejoin on voice) is now the single biggest remaining cost,
  worth 7–14¢ on exactly this kind of call.
- **Prompt-boundary tuning is first-draft.** `MIN_SPEECH_MS 900` / `END_SILENCE_MS 700` / `LEAD_SEC
  12` came from the 07-24 mapping traces and two live calls, not from a sweep. Both lanes landed
  every step on a real prompt ending, so the defaults are not obviously wrong — but two calls is two
  calls.
- **Neither call fit inside one billed minute**, so both paid 2.8¢ of line instead of 1.4¢. On the
  measured times (Target human at 27s, CVS at 47s) a 20-second conversation fits for Target and
  cannot fit for CVS.
- Zones are wired through the same path but **no zone run has been fired** on the new nav.

## Tests

`scripts/test-listen-nav.ts` — 15 tests, all passing: real prompt vs mid-sentence pause, short
noises, a stray loud frame, a Target-shaped call (boundaries at 9s and 20s), the same recipe at a
store whose greeting runs 8s longer, and the μ-law energy floor. The decoder is copied byte-for-byte
from the bridge's ear so the two cannot disagree about what counts as sound.

`scripts/test-bridge.ts` — the 13 existing bridge tests pass unchanged, checked against the
pre-change baseline.
