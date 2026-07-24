# TARGET PHONE TREES — 70 stores called live, 24 states (2026-07-24, PROD)

**The store number tells us which menu a Target has, and it is already in our database.**
Every Target numbered 3000 or higher has no guest service desk on its phone menu. Every Target
below 3000 does. 11 out of 11 in a blind test, on top of 59 stores sampled earlier. So Target does
not need a smarter caller — it needs one flag on ~111 store rows.

Nothing was changed. The Target chain row (`navRecipe`, `navSeconds`, `answerPath`,
`phoneTreeDefault`) is untouched and no chain other than Target was called.

## The two menus

Every Target opens identically: greeting naming the store (ends 9–12s), then **1** hours ·
**2** reach a specific department · **3** pharmacy (· **4** optical at Super Targets), ending 17–24s.
Digits pressed during the greeting are buffered and accepted. The department list is read ~7s after
the press.

**Shape A — full-size stores, 59 of 70.** "For electronics press 1, guest service desk or order
pickup or drive up press 2" — bigger stores append food 3, apparel 4, HR 5, Starbucks 6, wine 7.
**2 never moves.** The person we want is on **2**.

**Shape B — small-format stores, 11 of 70.** "For electronics press 1, for food and beverage press 2"
and often "for general merchandise press 3". There is no guest service desk to route to. The person
is on **3**, or on 2 when there is no 3. Our current chain recipe presses 2 and lands in groceries.

## The flag: Target's own store number (`retailers.externalStoreId`)

Blind test, 2026-07-24, 11 calls chosen only by store number, spread across CA NY IL MA MN PA CO TX:

| Store number | Stores called | Shape |
|---|---|---|
| 3200 · 3229 · 3258 · 3298 · 3324 · 3349 · 3389 | 7 | **B** — all seven, no guest service desk |
| 2717 · 2776 · 2831 · 2889 | 4 | **A** — all four, guest service desk on 2 |

Every shape B store found all day is ≥ 3200: Mission Hills 3218 · UCSD Price Center 3369 · Cambridge
St Boston 3368 · plus the seven above. Every shape A store is below 3000; the highest seen is 2889.
This matches how Target numbers its stores — the small-format city and campus stores are the newest
builds. Names in the ≥3000 band read the same way: USC Village, Berkeley Central, Greenwich St,
Commonwealth Ave, Rosslyn.

**Coverage:** 1,300 of ~1,373 Target rows carry a store number. **111 of those (8.5%) are ≥ 3000** —
which matches the 4-in-59 (6.8%) hit rate of the random sample. About 73 Target rows have no store
number at all (e.g. Victory Blvd North Hollywood, which is shape B). Filling those gaps is the only
data work here, and Target's own store locator publishes the number.

## The money — the calculator is wrong, verified against real bills

Twilio bills **whole minutes, rounded up**, at $0.014/min. Proof, from today's 104 calls on the
account (`Calls.json`, real prices, not estimates):

| Billed | Price | Calls | Real durations |
|---|---|---|---|
| 1 min | $0.0140 | 74 | 7s to 60s |
| 2 min | $0.0280 | 15 | 62s to 113s |
| 3 min | $0.0420 | 15 | 125s to 161s |

The Calc page charges the line **per second** (`twilioPerSec*dur`), so it under-counts every call
that is not exactly on a minute boundary. With 20s of talk:

| Whole call | Calc says | Actually costs |
|---|---|---|
| 50s (nav 30) | 4.1¢ | **4.3¢** |
| 60s (nav 40) | 4.3¢ | **4.3¢** |
| 65s (nav 45) | 4.4¢ | **5.7¢** |
| 80s (nav 60) | 4.8¢ | **5.7¢** |
| 90s (nav 70) | 5.0¢ | **5.7¢** |

**The real rule is a cliff at 60 seconds, not a slope.** With 20 seconds of talk, navigation has to
finish in **40 seconds or less** — not the 70 the calculator allows.

Target measured against that: Mission Hills 30s ✅ · Research Blvd Austin 33s ✅ · Coral Springs 36s ✅
· Topanga 40s ✅ (exactly on the line) · Granada Hills 45s ❌ (5.7¢). Four of five fit.

Not verified: the Charlie per-second rates (ElevenLabs $0.0012/s, Claude $0.0002/s) are from the rate
card, no Charlie call was placed. If ElevenLabs also rounds to the minute, the same cliff applies
there and the numbers above are optimistic.

All 104 calls today cost **$2.09 total**. Documenting every one of the 1,746 Targets once would run
about $24 — but the store-number flag means we do not have to.

## What this means for navigating (NOT implemented)

If the flag holds at scale, Target stays pure keypad with no listening and no AI: press 2, then press
2 at stores under 3000 and press 3 at stores 3000 and up. That needs a per-store second key —
`retailers.phoneTree` already exists as a per-store override of the chain tree, but it is free text
for the agent prompt, not a keypad plan, so the wiring is still to be designed.

Listening to the department list stays the fallback for chains where no such flag exists. Two facts
that make it cheap when it is needed: the list is read as text by the same Twilio transcription that
produced every quote in this report (no model, no Charlie), and a wrong press makes Target re-read
the whole list, so a miss costs ~10s inside the same call instead of a redial. Neither is priced yet
— the rate card has no line for speech recognition.

## Other measured facts

- 0 is invalid inside the department list; three invalid entries and Target says goodbye and hangs up.
- 0 at the FIRST menu does reach a person (50–73s) but failed outright at two stores, and at 73s it
  costs 5.7¢ — more than a check earns.
- `navSeconds` is 16 for Target. Real time-to-human is 30–45s. The 16 came from two runs on 07-10
  that heard nothing back and ended `done`, never `human`.
- Research Blvd's desk rang unanswered past 110s on one call and answered in 33s on the next, so a
  give-up rule is needed whatever route is chosen.
