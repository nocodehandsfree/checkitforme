# Independent audit: the built code vs build-contract.md (PM, 07-31)

Read by machine-independent eyes, code against the contract's words, differences only. This list is
for the FIX pass — merge it with the owner's page feedback and the mapper's own line-by-line. Nothing
here is fixed yet. Screens section lands below when its read completes.

## The engine (contract lines 8-38)

1. **Grading — DIFFERS.** "Our words said" is never a pass condition: `saidSteps`/`plannedSteps` only
   picks a fail reason (`map-capture.ts:140`), so a check that skipped an answer still passes if the
   handoff + ring happened. And a call that ends via the carrier's own end callback never reaches
   `finish()` at all — no grade, mapper reads it as an ungraded miss (`mapper.ts:440-442`).
2. **The fixed seven reasons — DIFFERS.** An eighth reason `"wrong menu"` exists and is the FIRST
   branch returned (`mapgraph.ts:69-72`, `map-capture.ts:132`). Mapper also writes free-text reasons
   (`no answer (timeout)`, `dial failed: …`) into observations and log rows.
3. **A failed check changes NOTHING — DIFFERS, four writes.** A failed speed check writes
   `bargeSafe:false` onto the recipe AND stamps the chain row via `finalizeAndLock`
   (`mapper.ts:487-491`); that path hardcodes `reachedHuman:true`/`outcome:"person"` into evidence
   (`mapper.ts:253-268`); a failed map check folds into live-version evidence and can move confidence
   (`mapper.ts:470-474` → `mapgraph.ts:1563-1583`); a failed check with a dead line rotates the held
   store (`mapper.ts:447`).
4. **Fingerprint — half MISSING.** Same-opening-line identity exists (`mapgraph.ts:1121-1134`) and a
   mismatch fails without writing. But NOTHING files a new condition: conditions are a hard-coded
   three (day / after-9pm / Spanish) computed in the browser (`app.html:4901-4911`); `heard_count`
   exists but nothing promotes "heard twice = real"; `reportUnknown` is imported and never called.
5. **Stage order — DIFFERS (the big one).** A chain already holding a route with a recording plan
   starts at `phase:"speed"` — mapping menu never runs (`mapper.ts:330,337,342-348`). One passing map
   check jumps straight to speed; prove-stage wrong department drops the run BACK to map.
6. **Stage 1 — DIFFERS + one MISSING.** FULL phrase: the nav prompt instructs the OPPOSITE — "the
   SHORTEST word that works (e.g. 'front' not 'front store services')" (`navigator.ts:392`, `:361`).
   Staff asked once per door: the once-per-store ledger exists (`navigator.ts:935,1003-1008`) but
   mapper never reads it; the held store is asked again on every map retry. "Next-best door" is only
   a sentence in the model prompt, not a hard block on re-picking a dead door. **Repeat until wording
   settles (same lines twice in a row): MISSING ENTIRELY** — the first passing check ends stage 1.
7. **Stage 2 — DIFFERS on the ring + blacklisting.** Hang up on the second ring: the speed check
   hangs up the INSTANT the handoff line is heard; the two-ring counter is normally unreachable on
   this path (`navigator.ts:664-667` vs `:586-594`). Open hours: gate applies at pick time only, not
   re-checked later, and an owner-pinned store bypasses it. A losing "shorten" try is forgotten when
   the run ends — only `barge didn't work` is blacklisted durably; `not faster` is only returned when
   transfer AND ring were heard.
8. **Stage 3 — DIFFERS on three counts.** The lock stamp fires on the FIRST map pass and on every
   speed win, not at three-store agreement (`mapper.ts:459,483`). `provedStores` is seeded with the
   mapping-stage store, so only TWO prove-stage stores are ever required (`mapper.ts:461,500`).
   Greeting-mismatch store exception: exceptions branch on a divergent ROUTE, never a greeting
   (`mapgraph.ts:660-668`); a mismatch is just booked as a prove miss.
9. **Known facts — BUILT**, two scope notes: re-prompt-repeats only holds on plan-walking checks (a
   map-stage check's prompt says switch tactics instead, `navigator.ts:390`); a speed win passes a
   null-seconds recipe into `lockRecipeToChain`, nulling the chain's `navSeconds`/`avgTreeSeconds`
   (`mapper.ts:483` → `trainer-batch.ts:111,120`).

## The screens (contract lines 40-62)

10. **Ladder seconds — DIFFERS.** Steps read the frozen `atSec` written once at lock
    (`mapgraph.ts:908`); `addEvidence` refuses to move seconds — so rungs show the winning check's
    seconds, never the LAST successful check's (`app.html:4812-4825`, `mapgraph.ts:745-756`).
11. **Vitals — partial.** Averages right, but a null Reached staff silently swaps in a "To Staff"
    seconds tile — a label the contract does not have; and it prints "Reached Staff" (capital S).
12. **Stage headers — DIFFERS.** The three words are exact, but `stage` is nulled server-side for any
    check that did not stamp one, so those cards render with NO stage header (`app.html:5090-5118`).
13. **Faster/slower — DIFFERS.** Only "Ns faster" ever renders; a slower passing check prints
    nothing — "slower" exists nowhere in the file (`app.html:5122,5076-5081`).
14. **Fail pills — DIFFERS.** A failed check with no stored reason prints the invented
    `did not move us forward` (in neither Statuses nor the seven); `wrong menu` (the eighth reason)
    prints as a pill (`app.html:5100`, `mapgraph.ts:69-72`).
15. **Last rung — OWNER RULED 07-31 (to PM, verbatim intent).** The greeting IS quoted — on the first
    check that fully maps the store, because it is the only proof we reached the right department.
    After that, never again: speed checks never trouble Staff, so no later card carries a greeting.
    The contract's bare-status-words line applies to every check EXCEPT that first mapping one.
    Fold this into the contract text for his blessing.
16. **Unrecognized state — DIFFERS.** Only `grade==='fail'` collapses; an ungraded check that neither
    reached Staff nor ended on ring renders as a full OPEN card with an amber `Nobody answered` pill —
    a guess (`app.html:5099,5113,5141`).
17. **Menu doors — MISSING/DIFFERS.** No struck-through red dead door exists on the Menu screen at
    all (every non-taken option is neutral gray, `app.html:4970-4977`); the green check is hard-coded
    to the LAST step of the recipe, not a door proven by a real yes (`app.html:4979-4981`); the taken
    pill's background is always Bravo's blue tint even when the word is Alpha's (`app.html:4957`).
18. **Re-listen at lock — MISSING.** Nothing re-transcribes at lock; the wording shown is the live
    transcript as first heard (`navigator.ts:1041` comment only; `server.ts:6410-6425` plays audio).
19. **Condition pills — DIFFERS.** All three always render and one hearing counts, not two
    (`app.html:4915-4933`).
20. **DELETE list — three of five still present.** `s.listenFirst` fully live (navigator branches on
    it; sweep still launches `listenFirst:true` — `navigator.ts:118,705,724,726,1016,1023`,
    `sweep.ts:121`). `Set aside` strings live in four places (`app.html:5189,4881,5490,4880`;
    `mapgraph.ts:884` writes it into `why`). Old phase names still user-visible: the live mapper
    card's PHASE label map is keyed `verify/listen/baseline/optimize` (`app.html:2478-2479`) — and
    since the engine now emits `map/speed/prove`, the lookup MISSES and prints raw lowercase
    `map` / `speed` / `prove` to the owner. `agreedMenu`/`agreedWords` and the Recipes-card greeting
    are genuinely gone.

## RE-CHECK 07-31 (after the mapper's "done"; staging @03d87fad) — THIS IS THE FIX LIST
Two blind re-readers, per item. **FIXED: 2** — the lock stamp now fires only at three-store agreement
(`mapper.ts:515,534-538`, but see 8) · the old one-call trainer is retired (`trainer-batch.ts:190-192`).
**PARTLY: 3, 8, 9, 15.** Everything else **STILL BROKEN, unchanged** — 1, 2, 4, 5, 6, 7, 10, 11, 12,
13, 14, 16, 17, 18, 19, 20 (all evidence lines above re-verified current).
- 3 partly: `bargeSafe:false` is run-local now, but a failed map check still folds into live evidence
  and re-scores confidence (`mapper.ts:484` → `mapgraph.ts:1563-1585`) and every ended check writes
  `chains.navStatus` via `markNavOutcome` (`navigator.ts:1069`).
- 8 partly: `provedStores` still seeded with the mapping-stage store → only TWO prove stores required
  (`mapper.ts:472,515`); store exceptions still branch on route, never greeting.
- 9 partly: the null-seconds bug MOVED — a speed win locks a re-listen recipe carrying `seconds:null`,
  nulling `navSeconds`/`avgTreeSeconds` (`mapper.ts:496,538` → `trainer-batch.ts:114,123`).
- 15 partly: greeting quoted on the mapping check (right) AND on every later check that reached Staff
  (wrong) — no stage/first-check gate (`app.html:5140-5145`).

**REGRESSION (new, urgent):** the Admin Re-map/Re-listen button writes NOTHING to the map again —
`finish()` coalesces a stage onto every call (`navigator.ts:951`), `recordNavCall` bails on any stage
(`map-capture.ts:227`), and the button sends a stage with no `callerRecords` (`server.ts:6314-6316`).
This is the exact 07-30 bug the fold was built to fix.

**Chat decisions never built (owner-agreed, missing from the contract):**
- A. Two `wrong menu` fails → the chain re-enters mapping from the start automatically. No counter
  exists anywhere; a greeting mismatch just books a generic miss.
- B. Day/After-9pm/Spanish must be DISCOVERED (unmatched greeting → filed, quarantined, heard twice =
  real). Still hard-coded three, computed in the browser from clock + language.
- C. Owner ruling 07-31: greeting quoted ONLY on the first full-map check (see 15).

## How to use this
This file is the NEXT AGENT'S box: fix every STILL BROKEN / PARTLY item and the regression, write A,
B, C into the contract for the owner's blessing, ONE item at a time, each proven on the page (or by a
driven check) before the next. The contract stays the law; this list is the gap between law and code.
