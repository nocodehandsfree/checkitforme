# The call receipt

Every call writes a record of what happened, when, how many seconds each piece took, and what it
cost. Built 2026-07-26 because two days were lost to mistakes nobody could see: the agent joining
during the menu, and the keypad and spoken lanes silently not being used at all.

**If an engineer cannot explain a runtime decision from the receipt, the receipt is incomplete.**

## Read one

```
GET /api/calls/:id/receipt        (admin-gated, like every /api/* route)
```

Returns `{ call, live, seconds, cost, timeline }`. A call still in flight answers from memory, so a
live call can be watched; a finished one answers from the database.

## What lands where

| Piece | Where | Note |
|---|---|---|
| The timeline | `call_events` table | one row per event, keyed by `room` and by `call_id` |
| The seconds + cost | `call_results` columns | rolled up at call end so reports never replay the timeline |

`room` is the join key. It exists from before the phone rings and nothing ever overwrites it —
unlike `provider_call_id`, which the voice provider's conversation id replaces mid-call.

## The files

- `src/calls/events.ts` — the recorder. **Pure**: no database, no config, no vendor names. The
  server registers a sink, exactly the way tapedeck registers its finalize hook, so the bridge and
  the navigator can record without importing the database. Every rule is unit-testable.
- `src/calls/cost.ts` — measured rates and the cost maths. Money in **microdollars** (integers) so
  a million calls sum exactly.
- `src/calls/receipt-store.ts` — the only file in the chain that touches the database.
- `scripts/test-call-events.ts` — 51 tests, the contract in sentences.

## The events

`call_started` · `ringing` · `connected` · `lane` · `nav_armed` · `nav_step` · `nav_done` ·
`ear_open` · `desk_ringing` · `ring_unanswered` · `human_detected` · `voicemail` · `hold` ·
`transfer` · `gave_up` · `unknown` · `charlie_joined` · `charlie_left` · `delta_decision` ·
`inventory_status` · `completed`

Two are declared and not yet emitted: `hold` and `transfer` (they arrive with the hold-handback
work). `delta_decision` waits on the Delta rewire.

## The seconds

The agent bills **every connected second** — talking, listening, or silent alike. Muting saves
nothing; only closing the session does. So splitting connected time three ways is not how we save
money, it is how we **prove** how many seconds nobody needed:

```
charlieSecs = speakingSecs + listeningSecs + silentSecs
neededSecs  = speakingSecs + listeningSecs
avoidableSecs = silentSecs          <- the number we drive down
```

`speakingSecs` is measured from audio that really played out. `listeningSecs` is measured from
store-side frames above the same voice threshold the ear uses, so the two can never disagree.
Overlap (a clerk talking over the agent) is capped at the connected time, so silence can never read
negative.

Stamps are `number | null`, never `0`-means-absent: a receipt's clock starts at dial, so millisecond
zero is a real moment.

## The rates — measured, never estimated

| Piece | Rate | How it bills |
|---|---|---|
| Phone line | $0.0140/min | **whole minutes, rounded up** — the 60-second cliff |
| Audio fork | $0.0044/min | per concurrent stream; a menu call runs two |
| The agent (voice + brain) | 723 credits/min = $0.0018/sec | per second, no cliff |
| Recorded lines | 1 credit/character | $0.0001516 per credit |

Measured 2026-07-24 against the live accounts. Where our own docs disagreed with the bill, the bill
won — one figure in the docs was 31% low, another 66% high.

Admin can correct any rate without a deploy: setting `call_rates`, a JSON object of overrides.

## What is not done

- No audio is stored yet. The timeline and transcript are; sound is the next piece.
- `hold` / `transfer` events wait on the hold-handback work.
- The Delta lane records nothing yet — it runs outside the bridge.
