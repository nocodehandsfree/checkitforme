# Chunk-1 audit: the engine vs build-contract.md (PM · 08-01 · branch `claude/mapping-engine-contract-wecvcy` @58dd2403)

Four blind readers, code against the contract (addendum R1-R6 + Updates ARE the law), plus the PM
driving every test rig. **CORRECTION on the record:** an earlier version of this file (commit
b6e693e) declared the chunk-1 work missing and graded staging instead — the PM's own repo copy was
hiding all but two branches and the PM published a guess. The work was where the mapper said: the
side branch above. This file grades THAT build. **The mapper's test claims verified true by the PM's
own runs:** map-sim 241/241 · resume 13/13 · mapgraph 62/62 · map-api 14/14 (= his "89 more"). The
map-e2e rig (102 checks, not in his claim) fails 2 — the SAME 2 fail on staging's old code
(pre-existing; both assert a changed route waits for approval, which R2's hands-free rule may retire
anyway — owner call at chunk 2).

## BUILT AND VERIFIED (a real rebuild — keep all of this)
Learn the menu first, always, no held-recipe skip (`mapper.ts:417-419,501-503`) · full-phrase
learning prompt (`navigator.ts:387,396`) · wording must read the same twice before the lock
(`mapper.ts:219-231,609-617`) · one change per speed check (`mapper.ts:452,202-209`) · a losing move
is written to a durable never-again list the moment it fails, no lock needed (`mapper.ts:164-169,
642-651`) · a win becomes the recipe and the chain row on the spot (`mapper.ts:631-638`) · open
hours re-read before every speed check, pinned stores obey (`mapper.ts:492-495`) · speed graded only
against this run's own menu (`map-capture.ts:135-137,151-154`) · bargeSafe honored, including inside
the same run (`mapper.ts:192,642-647`) · a connect offer mid-route is not the handoff
(`navigator.ts:661-663`) · a barge tail joins its line (`navigator.ts:615-636`) · chain-page nav
time ends at the handoff, never Staff (`mapgraph.ts:1152-1167`) · an unknown greeting is FILED
automatically and quarantined, the run stops clean (`navigator.ts:916-924`, `map-capture.ts:228`) ·
store lock IS the customer go-live: paying checks build from the active map at one locked store
(`trainer-batch.ts:46-132`, `service.ts:379-422`) · customer checks DO feed the three-store ledger
(`server.ts:164-175` → `mapgraph.ts:1521-1533`) · listen-first path deleted · menu-voting deleted ·
Re-map/Re-listen deleted cleanly, and the surviving Admin Map call now really writes to the map on a
pass (`map-capture.ts:237-267`) · restart-resume is real with a drain flag + 90s boot delay
(`mapper.ts:116-137,431,448`, `server.ts:181-186`) and its test rig drives the real seam.

## THE ROUND-2 LIST (ordered by damage; every item cites the mapper-branch code)

1. **One wrong desk burns the whole store — the contract's "next door, SAME store" is unreachable.**
   The dead door recorded is the clerk's redirect sentence, not the option we picked
   (`mapper.ts:586`); the wrong-desk call spends the store's one ask (`navigator.ts:953,1029-1034`)
   and the next loop abandons the store (`mapper.ts:481-489`); doorsDead is run-local, wiped at run
   end (`mapper.ts:423,668`). Fix shape: record the PICKED option as the dead door; make the ask
   ledger per-door; hold the store.
2. **A store where Staff just pick up (no announced handoff) can never pass, never lock.** Pass
   requires a heard transfer line (`map-capture.ts:140`); direct pickup grades `said wrong words`,
   marks the ask unresolved, rotates (`mapper.ts:589-594`) — even when Staff answered the question.
   Whole chains whose desks answer directly are unmappable in this build.
3. **Silence counts as Staff's answer.** 9 seconds of quiet after the ask sets "answered"
   (`navigator.ts:685`) — a clerk who says nothing proves the door. Update 12 requires a real
   yes-or-no acknowledgment.
4. **The clock is dead in the engine — but every live customer check still runs on it.** The
   mapping/speed engine fires answers only on heard menu words (`navigator.ts:751,764-787`) — that
   half is done. But locked recipes still ship as word@seconds / digit@seconds
   (`trainer-batch.ts:76,126`, `recipe.ts:47-57`) and live checks fire them on elapsed time
   (`bridge-place.ts:144-163`, `bridge.ts:750-755`); the menu-words way exists but defaults OFF
   (`service.ts:401-403`, `listen-nav.ts:380-387`). Update 4 says the clock is dead EVERYWHERE.
   Decide: flip listen-nav on as the default live path (and its clock fallback stays only as a
   never-hangs guarantee?), or this is chunk 2/3 scope — owner word needed.
5. **"Hang up on the second ring" is really a 6-second clock that can trouble Staff.** The ring
   counter never increments (tones are not fed — `navigator.ts:202-206`, `listen-nav.ts:299-317`),
   so hang-up waits `RING_CYCLE_SEC` after an ANNOUNCED handoff, checked only on the next turn
   (`navigator.ts:590-604`); a silent handoff waits until a person answers and hangs up on them
   (`navigator.ts:506-511`).
6. **Proven-at-three is write-only bookkeeping.** The ledger bar is "a person was detected", not
   "answered the product question" (`mapgraph.ts:1521-1533`); it is seeded with the mapping store so
   three = map store + TWO customers (`mapper.ts:342-344`), the seed OVERWRITES earlier customer
   agreements on re-lock (`mapper.ts:343`), and NOTHING reads the ledger — no level ever flips. The
   no-traffic hand-dial clause has no code (`sweep.ts:88-107`).
7. **The direct-pickup side job (sweep) ignores grades entirely** — on a failed check it still folds
   evidence, re-scores confidence, can auto-activate a version, stamps the chain row
   (`sweep.ts:141-200` → `mapgraph.ts:607-665,708`). The single biggest surviving "a failed check
   changes NOTHING" break.
8. **Three ways a check still ends ungraded:** dial failure (`navigator.ts:1071-1076`), restart
   mid-check (in-memory sessions; `mapper.ts:132`), a lost carrier callback (nothing sweeps
   ungraded sessions). And "our words said" is a step COUNT, not a word check — a re-say inflates
   it so a never-spoken answer can pass (`navigator.ts:899`, `map-capture.ts:146-150`).
9. **Free text still leaks into mapping rows:** `dial failed: …` (`mapper.ts:536`, `sweep.ts:125`),
   `nobody answered` — including when a person answered (`mapper.ts:599,625`), `no answer (timeout)
   — direct claim still unproven` (`sweep.ts:196-200`), raw statuses onto graph edges
   (`map-capture.ts:222`); a failed wrong-desk check records outcome "human" and reads as
   reached-Staff (`navigator.ts:690-691`, `mapgraph.ts:1242`); the Admin Map button pre-stamps the
   chain "learning" unconditionally, even over "locked", never reverted on a fail (`server.ts:6291`).
10. **Heard-twice never promotes.** Unknown menus dedup by EXACT text so the same night menu files
    as new rows each hearing (`mapgraph.ts:985` vs the tolerance at `1134-1147`); `seen_count` has
    no reader that promotes; night/Spanish as selectable versions of one route: schema and comments
    only (`mapgraph.ts:56-59,147-166`); no boundary learning; the 24h label compare can never match
    (`mapper.ts:361` vs `store-hours.ts:134`). (The auto-re-map JOB itself is chunk 2's R2 loop —
    but filing-to-promotion is this contract's fingerprint section.)
11. **Per-check nav time still counts ring + pickup wait.** Receipts define nav as dial→person
    (`events.ts:388-389,479`, `receipt-store.ts:93-95`, `bridge.ts:640,759-764`); mapping receipts
    stamp menu-finished at person-detection (`navigator.ts:242`); live checks never stamp a nav end
    at all (`bridge-place.ts:209-213`). Update 10 = nav ends the instant the desk rings. Also: a
    ring-ended speed win backfills the baseline's seconds into that call's own record
    (`mapper.ts:296-298,635`) — a number that call never measured.
12. **`Set aside` still written and shown** (`mapgraph.ts:896`; `app.html:5195,4881,5487`) — and
    `copy.md:77,80` still SPECIFIES it while the contract deletes it: reconcile for the owner.
    **Live-run phase label misses the new names** — the run card prints raw `map` / `speed`
    (`app.html:2478-2479`); the per-check header map is fine.
13. **Resume holes:** a crash in the loop clears the saved run silently — one DB hiccup and the run
    vanishes with no flag (`mapper.ts:672`); the resume rig runs in NOTHING (`test-all.sh` has no
    mapping rigs at all); drain overlap if the old process outlives the 90s boot delay.
14. **Rig honesty:** ~100 of map-sim's 241 checks assert the code's TEXT (regex over source), not
    behavior — the finish→record wiring, the stage machine, and all rendering rules have no
    behavioral test; nothing anywhere drives a real telephony round trip. Wire the five mapping
    rigs into `test-all.sh` and grow behavior checks in round 2.

## Chunk-3 note
The old screens findings predate this branch (it touches app.html lightly); re-read the screens
against the contract at chunk 3 — do not trust the old list.

## How to use this
Round 2 = items 1-14, one at a time, each proven on the page or by a driven check before the next.
Items 4 (live clock) and the two pre-existing e2e failures (approval vs hands-free) need the OWNER's
word before code moves. The contract is the law; this list is the gap between law and this branch.
