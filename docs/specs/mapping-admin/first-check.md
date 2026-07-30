# Mapping a chain from nothing: what is built, and the three gaps

Answers to the owner's 07-30 questions, checked against the code, before any store is mapped.

## What he asked for, and where it lives

His design, in his words: call a store the first time and record every step properly · then call again
and get through faster · try the short word ("front", not the whole phrase) · watch it get faster with
each retry.

**All four are built**, in `src/calls/mapper.ts`, as four phases of one run:

| Phase | What it does |
|---|---|
| `verify` | If a route is already stored, prove it still works before touching it. Two misses → `listen`. |
| `listen` | `listenFirst`: stay quiet and write down what the store says until it asks us something. |
| `baseline` | Walk the tree, reach a person, lock that route as the thing to beat. |
| `optimize` | `buildExperiments`: **shorten** every spoken step to its first word, and **barge** each step earlier by binary search between the previous step and this one. A win becomes a new recipe; a loss backs off and narrows the bounds. |
| `locked` | Nothing left to test. |

Started by `POST /api/admin/mapper/start {chainId}`. `bargeSafe:false` on a step is a proved fact and is
never re-tested, so a store that refuses an early word does not cost a call every run.

## THE THREE GAPS — none of this is theory, each was seen on a real check

### 1. The Re-map button is a single check, not a mapping run
`POST /api/admin/trainer/document` places ONE check. It passes no `listenFirst` and runs no experiments.
Every check made today went through it. A new agent told to "map a chain" with this button gets one
route and no speed-up, ever.
**Fix:** mapping a chain from nothing means `mapper/start`. Re-map stays what it is: one check against a
route we already hold.

### 2. The optimize phase is deaf
Its checks carry a `barge` plan without `relisten`, so `navInitialTwiml` emits the whole route as one
timed block and opens the listener only at the end. That is the exact bug fixed for the re-listen on
07-30: a four line menu is recorded as one line. So the phase that makes us faster records almost none
of the menu it is walking.
**Fix:** the timed block is only needed to prove a step can fire EARLIER, which is one step per check.
Fire that one on its second, and take the ordinary listening loop for every other step.

### 3. A mis-heard word is recorded as the menu
The stored menu reads "pharmacy or front **door** services". CVS says front **store** services. The
phone company's transcription is what we keep, and one bad transcription becomes the record. Cutting
the recording mid sentence makes it worse, because the tail that would have carried the word is lost.
**Fix:** the `listen` phase already hears full prompts. Keep the fullest wording ever heard for a
prompt rather than only the newest, so a bad transcription is outvoted instead of enshrined.

## What is already true and needs no work

- Every check feeds the map, whoever placed it (`recordNavCall` from `finish`).
- Nav time is the average of every measured handoff on the live recipe. When an experiment wins, the
  new recipe starts its own evidence, so the average restarts on the faster route and the drop is real.
- `firstSeconds` / `bestSeconds` / `savedSeconds` (`trendOf`) already read across every version of a
  chain, which is what "getting faster and faster" means in a number.
- A re-listen answers the prompt that is asking, never a clock, repeats its answer on a re-prompt, and
  hangs up on the second ring. Proved on seven real checks to CVS Lanett.
