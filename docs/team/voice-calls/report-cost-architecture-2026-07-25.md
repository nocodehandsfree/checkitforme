# THE COST MODEL YOU CAN BANK ON — every rate measured, 2026-07-25

## First, a correction: navigation is NOT free

I said "$0" and that was wrong in the way that matters. Alpha and Bravo add no AGENT cost, but they
spend **line time**, and line time is billed in whole minutes:

| Lane | Nav | Line it burns | The real damage |
|---|---|---|---|
| Direct | 0s | 0¢ | — |
| Target / Alpha | 23s | 0.54¢ | eats 23s of the 60-second budget |
| CVS / Bravo | 41s | 0.96¢ | eats 41s — **CVS can never fit in one minute** |

That second column is the point. A call that crosses 60 seconds pays a whole extra minute, so on CVS
navigation effectively costs **1.4¢**, not zero. Cheaper navigation buys Charlie more talking time.

## The floor nobody can go under

**CORRECTED 07-25 (the first figure was 15% high).** Charlie is **$0.00159/second**, from a clean
before/after on two calls of known length: character_count 57,362 -> 58,286 = **924 credits for 88
seconds** of agent time = 630 credits/min. The earlier 723 credits/min came from dividing a whole
billing period's credits by a conversation list that under-counted the minutes. Always measure the
rate with a before/after around calls you placed yourself.

| Talk | Charlie alone |
|---|---|
| 15s | 2.4¢ |
| 20s | 3.2¢ |
| **30s** | **4.8¢** |

**Where that leaves us, with Charlie suspended through holds:**

| | 20s talk | 30s talk |
|---|---|---|
| Direct store (human ~15s) | **4.7¢** | **5.6¢** |
| Target / Alpha (human 27s) | **4.7¢** | **5.6¢** |
| CVS / Bravo (human 64s) | **6.1¢** | **7.0¢** |

**Target is already under 5¢ at 20 seconds of talk. CVS is not, and Charlie is not why** — CVS is
6.1¢ because the call crosses 60 seconds and pays two whole minutes of line. The fix for CVS is a
SHORTER ROUTE TO THE HUMAN, not a cheaper agent: get answered inside 40 seconds and it is 4.7¢ like
everything else. A direct extension that skips the tree (the "learned direct lines" idea in
COST_MODEL Part II §7) is worth 1.4¢ on every CVS call and nothing else comes close.

## The one rule that fixes the rest

**Charlie should be connected only while a human is actually talking with us.** Everything else —
menu, transfer ring, hold music, the clerk walking to the shelf — is line time only.

Two places we break that rule today, both measured on real calls last night:

1. **He joins too early.** CVS: menu ended 41s, Charlie joined 47s, the human said hello at 64s.
   **17 seconds of Charlie listening to a transfer** = 3.1¢. He joined on the recording saying
   "Transferring you now."
2. **He waits through the hold.** Target: the clerk said "give me one second, let me ask" and left
   for ~25 seconds with Charlie billing = 4.6¢.

## What it is worth, per lane, measured times

Charlie suspended = disconnected whenever nobody is speaking to us.

| Talk | Store | Today | With suspend | Saves |
|---|---|---|---|---|
| 15s | Direct | 6.3¢ | **4.4¢** | 1.8¢ |
| 15s | Target | 5.3¢ | **4.5¢** | 0.7¢ |
| 15s | CVS | 10.4¢ | **6.2¢** | 4.2¢ |
| 20s | Direct | 7.2¢ | **5.4¢** | 1.8¢ |
| 20s | Target | 6.2¢ | **5.5¢** | 0.7¢ |
| 20s | CVS | 11.4¢ | **7.2¢** | 4.2¢ |
| 30s | Direct | 9.1¢ | **7.3¢** | 1.8¢ |
| 30s | Target | 8.1¢ | **7.4¢** | 0.7¢ |
| 30s | CVS | 13.3¢ | **9.1¢** | 4.2¢ |

Rates: line $0.014 per STARTED minute · Charlie $0.00183/s · audio fork $0.0044/min · overhead
$0.001. Nav 23s Target / 41s CVS and holds 4s / 23s are the measured 07-25 staging calls.

## The build list, ranked by cents per call

**1. Suspend Charlie when nobody is talking (4.2¢ on CVS, 1.8¢ on direct).**
While the agent is connected, watch the store side. Sustained silence or hold music with no agent
audio playing → close the ElevenLabs socket; the Twilio line stays up and costs 0.023¢/s. A real
voice returns → reopen and resume.
*The catch, stated plainly:* reopening makes a SECOND ElevenLabs conversation id. The call row, the
transcript and the verdict are all keyed to the first one. Stitching the two halves is the actual
work here — the naive version silently loses half the transcript, which is the same class of
regression that has burned this project twice. Budget the stitching, not the disconnect.

**2. Do not join on the transfer announcement (3.1¢ on CVS, and it is the easy one).**
After the menu ends, hold the join for a ~3-second confirmation window. If ringing starts in that
window — and the bridge already identifies ringing positively by its tone frequencies — stay off
until the ringing stops and a real voice returns. No transcript problem, no reconnect. This is the
piece I would build first.

**3. Pre-roll the opener (~1.1¢ every call).**
Charlie currently joins, waits for "CVS, how can I help you", then speaks. That round trip is 6-8
seconds of billed agent time spent on hello. Play a pre-recorded Branson opener the instant a human
is detected and join Charlie for the ANSWER. The clips already exist — it is the one genuinely good
idea in the shelved Delta lane.

**4. Front-load the question (~5s of talk = 0.9¢).**
"Do you have Pokémon booster boxes in stock?" answers stock AND product type in one exchange.
"Do you have Pokémon?" → "which product?" is two.

**5. Sample the restock question instead of asking it every time (~1.5¢ on every no).**
We ask "when is the next shipment" on every negative call. That is 8-10 seconds of talk. Shipment
days are a store PROPERTY that barely changes — ask it on every fifth negative call at a store and
carry the answer forward.

**6. Cross-user cache.** If anyone checked this store for this product in the last N hours, serve
that answer for 0¢. At volume this beats everything above combined. Not a call-engine change.

## The number to forecast on

With 1, 2 and 3 built:

| Check type | Talk | Target | CVS | Direct |
|---|---|---|---|---|
| **Standard** — in stock, yes or no | ~15s | **4.5¢** | **6.2¢** | **4.4¢** |
| **Premium** — set, product type, restock day | ~30s | **7.4¢** | **9.1¢** | **7.3¢** |

**Bank on 5¢ for a standard check and 8¢ for a premium one**, blended across a real store mix.
CVS is the worst case and it is ~1¢ over on standard, ~4¢ over on premium.

That gap is the honest case for the tier split: the extra questions cost about 3¢, so they belong to
paying subscribers, and the free/standard check answers only "is it in stock".
