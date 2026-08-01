# Chunk-1 audit: the engine vs build-contract.md (PM · 07-31 late · staging @fbb2ef0)

Four blind readers, code against the contract's words (addendum R1-R6 + Updates ARE the law).
**Finding zero: the chunk-1 "finished" work never landed.** The engine is byte-identical to the code
the earlier re-check graded — zero mapping commits after @03d87fad on any branch (the one src/calls
change since is voice greeting tuning). Everything below is the ROUND-2 BOX: fix one item at a time,
each proven on the page or by a driven check before the next. The contract stays the law.

## The engine — verdict per item (0 clean pass areas · 11 FAILED · 5 PARTLY · 2 MISSING)

E1. **Every check graded, mechanically — FAILED.** Three end paths never reach `gradeCheck`: the
    carrier's own ended callback (`server.ts:1128` → `navigator.ts:1061-1071`, writes `grade:
    undefined`), dial failures (`navigator.ts:1050-1056`; mapper logs free text `mapper.ts:435-437`),
    restart mid-check (`navigator.ts:569-570`). And "our words said" is never a PASS condition — only
    a fail-reason picker (`map-capture.ts:140`): a check that skipped a planned answer still passes
    if a handoff + ring happened. Inverse hole: pass REQUIRES a heard transfer line
    (`map-capture.ts:137`), so a store where Staff just pick up can never grade pass (see E7).
E2. **Seven reasons only — FAILED.** An eighth reason `wrong menu` is in the list and returned first
    (`mapgraph.ts:69-73`, `map-capture.ts:132-134`). Free text reaches records: `no answer (timeout)`
    / raw stopReason into observations + version evidence (`mapper.ts:484-489` → `mapgraph.ts:
    1554-1567`), `dial failed: …` (`mapper.ts:436`, `sweep.ts:123`), `String(s.status)` reasons
    (`map-capture.ts:256`, `sweep.ts:194-198`).
E3. **A failed check changes NOTHING — FAILED, six writes still fire.** (1) every ended check stamps
    `chains.navStatus`/`navUpdatedAt` via `markNavOutcome` (`navigator.ts:1069,1076-1084`); (2) a
    failed map check folds into ACTIVE version evidence and re-scores confidence, can force 20-40
    (`mapper.ts:484-488` → `mapgraph.ts:1546-1592`, writes `chains.navConfidence`); (3) `barge
    didn't work` stamps `bargeSafe:false` onto the steps that lock later (`mapper.ts:502-505,
    274-279`); (4) graph node/edge counts mutate before the fail return (`map-capture.ts:209-215` →
    `mapgraph.ts:396-430`); (5) an ungraded dead line rotates the held store (`mapper.ts:459`);
    (6) the sweep ignores the grade and can auto-activate a version off a failed check
    (`sweep.ts:139-191`).
E4. **Fingerprint files new conditions, heard twice = real — FAILED.** Opening-line identity exists
    (`mapgraph.ts:1121-1134`) but nothing FILES an unknown greeting (`map-capture.ts:220` early
    return; `reportUnknown` has no greeting-mismatch kind, `mapgraph.ts:966`); `heard_count`/
    `seen_count` increment and nothing ever promotes on two hearings (`mapgraph.ts:367,440-447,978,
    990`); conditions are a hard-coded three from clock + language in the browser
    (`app.html:4901-4907`).
E5. **Update 1, always learn the menu first — FAILED.** A chain holding a route with anchors starts
    at `phase:"speed"` — the full learn/reach-a-person/ask check is skipped (`mapper.ts:331-349`,
    intent stated in the comment at 344-346; sweep enters the same way `sweep.ts:204`).
E6. **Stage-1 mechanics — FAILED on all four.** Full phrase: the nav prompt commands the OPPOSITE —
    "the SHORTEST word that works (e.g. 'front' not 'front store services')" (`navigator.ts:392,
    361`). Dead door: marked dead (`mapper.ts:479-481`) but re-picking is only prompt-discouraged —
    `navTurn` executes whatever the model returns, no check against doorsDead (`mapper.ts:415-419`,
    `navigator.ts:844-853`). Staff once per door: ledger is per-store and the mapper never reads it
    (`navigator.ts:1003-1013`; only the admin route does, `server.ts:6276`). Wording heard twice in
    a row: MISSING — the first passing check ends stage 1 (`mapper.ts:464-476`).
E7. **Updates 2/3, one map locks the store — PARTLY.** The lock fires on person + ask + answer and
    yes/no both count (`mapper.ts:464-475`, `navigator.ts:673-677`) — but 9s of silence also counts
    as "answered" (`navigator.ts:679`); a direct-answer store (no transfer line) can NEVER pass E1's
    gate so never locks — five tries then dead (`map-capture.ts:137`, `mapper.ts:483-490`); rotation
    ignores "never got us to a person": a no-pickup store is retried till the run dies, while a dead
    line mid-speed rotates AWAY from an already-proven store (`mapper.ts:459,392-402`).
E8. **R1 chain live at one, proven at three via customer checks — FAILED.** Nothing goes live at one
    store: the single map write happens at `phase:"locked"` = three stores (`mapper.ts:515,534-538`;
    `map-capture.ts:222-227`). Customer checks NEVER count toward the three (`reportCallDrift` only
    decays, `mapgraph.ts:1008-1043`; `storesAgreeingOn` counts mapping versions only, `mapgraph.ts:
    764-775`). And the three is padded: `provedStores` is seeded with the map-stage store, so two
    prove stores suffice (`mapper.ts:472,515`; same pad in `mapgraph.ts:760,769`).
E9. **Speed stage — PARTLY.** ONE change per check PASSES (`mapper.ts:184-194`, `navigator.ts:
    761-778`). Hang up on the second ring: actual trigger is hearing the handoff line, zero rings;
    the two-ring counter is unreachable on this path, and a missed handoff line rings a real desk up
    to 40s (`navigator.ts:652-667` vs `586-595,602-605`). Open hours: pick-time only, never
    re-checked while the store is held; a pinned store bypasses entirely (`trainer-batch.ts:143-178`,
    `mapper.ts:396-399`). Same store: one dead line mid-speed silently moves the series to another
    store, pinned included (`mapper.ts:459,393-402`). Blacklist: shorten losses blacklisted NOWHERE
    (rebuilt and re-dialed every run); bargeSafe survives only if the run reaches lock
    (`mapper.ts:502-506,275-279,544-548`) — and the very next check re-barges the same step anyway
    (`mapper.ts:507` → `enqueueBinaryBarge`).
E10. **Update 4, NO TIMER EVER — FAILED.** The tested step fires purely on elapsed seconds —
    `if (step?.early && atSec >= step.at)` (`navigator.ts:766`), by design ("ONE STEP FIRES ON THE
    CLOCK", `mapper.ts:188-192`; the search is for "the EARLIEST second", `mapper.ts:133-160`).
    Locked recipes ship to the live bridge as word@seconds — live answers fire on the learned clock
    (`recipe.ts:47-70`, `trainer-batch.ts:70-76`). A reprompt that recovers is never remembered as
    un-barge-able — graded merely `not faster`, re-barged next run (`map-capture.ts:138,143-146`).
E11. **Known facts — PARTLY (3 of 5 pass).** PASS: connect-offer ≠ handoff (`navigator.ts:651-652`),
    tail joins its line (`navigator.ts:44-47,613-626`), ring writes seconds:null (`navigator.ts:
    921-927`). FAIL: reprompt-repeat exists only on plan-walking checks and never re-presses a digit;
    map-stage checks are told to SWITCH tactics instead (`navigator.ts:745-757,384,390`). bargeSafe
    honored across runs but violated within one (E9).
E12. **Update 10, nav time ends at the ring — FAILED at the money layer.** The chain page complies
    (`mapgraph.ts:1139-1153`) but the per-check numbers write dial→person as nav: `events.ts:424-425,
    515`, `receipt-store.ts:93-95`, `bridge.ts:112-118`; the meters stamp menu-finished at person
    pickup, not at the handoff (`navigator.ts:237-238`) — ring + pickup wait lands in nav time.
E13. **Update 13, speed vs same menu only — PARTLY.** The wrong-menu guard exists first in grading,
    but is silently DISARMED exactly when a run starts at speed (no `expectedGreeting` set —
    `mapper.ts:347-360,471,430`) and on re-listen with no stored transcript (`server.ts:6310-6311`).
E14. **Update 14, unknown greeting auto-remaps the store — FAILED.** A mismatch grades `wrong menu`
    and changes nothing, forever, until a human presses Re-map (`map-capture.ts:132-134,220`;
    `mapper.ts:484-524`); customer checks can't even hear a re-recorded menu (no transcription —
    `mapgraph.ts:1507-1511`). The owner-agreed two-wrong-menu counter → chain remaps: MISSING
    (no counter keyed to wrong menu exists) — still needs writing INTO the contract too.
E15. **R4, night/Spanish as versions — MISSING.** Versions have no condition dimension
    (`mapgraph.ts:482-495`; `language` deferred by its own comment, `mapgraph.ts:56-59`); closed
    words used for identity only (`mapgraph.ts:1123-1125`); store hours never decide which menu
    applies; no boundary learning from greeting flips (hourLocal stamped, never read); 24-hour
    handling = only "dial anytime" (`trainer-batch.ts:151`).
E16. **Statuses (engine writes) — PARTLY.** Typed statuses are closed, but: `Admin hung up` is never
    written (comment only, `navigator.ts:145`); raw `done`/`failed` land in `nav_edges.outcome`
    (`map-capture.ts:214`); a Staff-answered check whose finish never ran logs `nobody answered`
    (`mapper.ts:489,525`) and displays as not-reached (`mapgraph.ts:1229`); a PASSING speed check
    stamps the chain `attempted` in the same breath (`navigator.ts:1069,1081`).
E17. **DELETE list — FAILED, 3 of 5 present.** `listenFirst` fully live (`navigator.ts:118,705-726,
    1016-1023`; every sweep call uses it, `sweep.ts:121`). `Set aside` written server-side
    (`mapgraph.ts:884`) and shown (`app.html:5195,4881,5496`) — NOTE: `copy.md:77,80` still
    SPECIFIES it; contract line 63 deletes it — reconcile for the owner. Old phase names: the live
    label map still keys `verify/listen/baseline/optimize` while the engine emits `map/speed/prove`,
    so live runs print raw lowercase words (`app.html:2478-2479`, `mapper.ts:46`); `kind:"verify"`
    still written (`mapgraph.ts:651`, `map-capture.ts:248`). Gone for real: `agreedMenu`/
    `agreedWords`, the Recipes-card greeting.
E18. **REGRESSION (urgent, still open).** Admin Re-map/Re-listen writes NOTHING to the map and then
    tells the session "Map updated": endpoint sends a stage, no callerRecords (`server.ts:6263,
    6315-6316`); `finish()` stamps a stage on every call (`navigator.ts:951`); `recordNavCall` bails
    on any stage before the fold (`map-capture.ts:227`); the false "Map updated" emit is
    `navigator.ts:954`. The exact 07-30 bug the fold was built to fix.
E19. **Restart-resume — PARTLY, live proof still owed.** Save/reload is real (`mapper.ts:83-113`,
    `server.ts:181-186`, 90s delay) and `scripts/test-mapper-resume.ts` exercises the REAL seam
    (file DB, real `resumeMapperRuns`) — but nothing runs it (`test-all.sh` has no mapper entry);
    a mid-check restart re-dials the same store on the same attempt number (`mapper.ts:379,407`);
    a crash in the loop `clearRun`s silently (`mapper.ts:545-549`). Live-restart re-proof needs a
    staging restart → owner's clear.

## The screens (chunk 3 — carried forward, code untouched since the re-check)
Items 10-20 of the re-check stand as written then, plus owner ruling: the greeting is quoted ONLY on
the first check that fully maps the store (proof of the right department), bare status words on every
other card — the current page quotes it on every Staff-reached check (`app.html:5140-5145`); fold the
ruling into the contract for his blessing. Menu doors, re-listen at lock, condition pills, fail-pill
guesses: all still as the re-check recorded.

## How to use this
This file is the ROUND-2 BOX. The mapper's next chat fixes E1-E18 one at a time, each proven on the
page or by a driven check before the next; E19's live proof runs on the owner's clear. Write the
two-wrong-menu rule (E14) and the first-check-greeting ruling (screens) into build-contract.md for
the owner's blessing. The contract is the law; this list is the gap between law and code.
