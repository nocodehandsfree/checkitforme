# The store picker's "seconds" line: menu time only, and mapping has to prove it

**What:** The line at the bottom of the store picker (`#cs_reach`) is wrong twice over. Owner
07-30, decided with him in the same session. **BLOCKED until the mapper produces proven routes** —
there is nothing to drive it against today, and a number I seed myself proves nothing.

**System:** site (`public/checkit.html` + `/pub/stores/near` in `src/server.ts`).

## Wrong thing 1: it is not evidence
It reads `chains.avgTreeSeconds`, a single average per chain. Measured live on 07-30:

- 42 chains show a number. **All 42** came from the old chain row, not from a mapping call. The map
  itself files them as `source: backfill`, evidence note "inherited from the chain row (no per-call
  evidence)".
- **18 of those 42 are routes our own map already flagged `hammer-route`** — the old auto-caller
  pressing one key over and over, not a real menu. The site prints their seconds as fact.
- 51 more chains say "This store picks up directly" on the same non-evidence.
- Writers that can all land in that one column: `tree-learn.ts` (an LLM reading a transcript and
  guessing a number), admin patches, `store-sync`, `trainer-batch`, `service.ts`, `mapgraph`.

## Wrong thing 2: it is not the number we mean
`avgTreeSeconds` is measured to the moment a person spoke, so it carries the department phone
RINGING and any hold. Owner's words: if that transfer rings for a minute with nobody there, we must
never print it as how long that store typically takes. We promise the part we control and measure:
the seconds spent getting through their automated system, up to the handoff and no further.

## The three states (owner 07-30)
| What the store does | What the customer sees |
|---|---|
| A person answers at pickup | **nothing** — no line at all |
| A recording answers, then a person, nothing to press | a number (the recording's length) |
| A menu to press or speak through | a number (up to the handoff) |

Recording-then-a-person is its OWN case. Not direct, not a menu, and it does have a wait.

## The copy (locked with the owner 07-30)
```
Hang tight. ~65 sec of their automated system.
```
Spanish: `Un momento. ~65 seg de su sistema automático.`

"Automated system" over "phone tree" or "phone menu" on purpose: phone tree is our word, not the
customer's, and one phrase has to cover both a recording they wait through and a menu we press
through. "No phone menu at this store" was rejected: it gives them nothing to picture.

## Done when
1. The number comes from the MAP only (`nav_map_versions` active rows), never from a chain column.
   A version whose only evidence is the inherited row shows nothing. So does a confidence label of
   "needs review" / "changed recently" / "unknown", which is what kills the 18 hammer routes.
2. It is menu time: the median `transferAtSec` across real calls, else the last `atSec` we press or
   say on the locked route. Never the version's `seconds` (that one is time to a person).
3. Per STORE first, chain second. A store with its own active version shows ITS number — the runtime
   already prefers store over chain via `activeMap`, and the screen must match. Today
   `reachFor(r.chainId)` cannot express this at all.
4. No 15-second floor. A 10 second menu is allowed to say 10.
5. `/pub/stores/near` is a hot public path: cache the lookup for ~60s, the way `cachedChains` does.
6. Driven on staging against REAL proven routes: one store showing its own number, one falling back
   to its chain, one direct showing no line, one unproven showing no line. EN and ES at 375/390/430.

**Expect the line to go dark everywhere the day this ships** and light back up chain by chain as the
mapper proves routes. That is the point, and the owner knows.

**Reference:** `reachFor` at `src/server.ts` ~2046 · `cs_reach` render at `public/checkit.html`
~5344 · `connectAtSecFor` in `src/calls/recipe.ts` (LOCKED, do not touch) · `activeMap` +
`backfillFromChains` + `EvidenceCall.transferAtSec` in `src/calls/mapgraph.ts`. `public/checkit.html`
is frozen: needs the `.unlock` flow.

**Status:** blocked on mapper
