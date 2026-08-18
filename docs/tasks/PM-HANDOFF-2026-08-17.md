# PM HANDOFF 2026-08-17 — read this and you ARE the PM, mid stride

The 2026-08-13 handoff (`docs/tasks/PM-HANDOFF-2026-08-13.md`) still rules: the doctrine (one
memory per check owned by Echo, behaviour over words, unsure falls back to Charlie's own ears),
the loop (ONE test dialed, the owner says pass or fail, fail means fix and dial the SAME test,
nothing merges while a check is in the air), and the two tracks. Read it first.

## WHERE THE WALK STANDS TONIGHT
Tests one to three PASSED (checks 362, 364). Test four (Hold: silence) has been dialed many times:
the CALL is right now — drop 3s after the announced hold, the "No worries, take your time!" reply
plays as OUR recording at the announcement, meter 28–29s (owner's bands: green ≤23, yellow 24–30
passes, red ≥31 fails — METER seconds, his ruling), hold profit set-aside built — but the RECORD
of the call kept failing: lines out of order, the handed-words step printed twice, slowest-reply
row printed twice. A FRESH voice agent is booting on a stepped task: STEP 1 tape the whole call
(pickup to hangup, off Echo's always-on fork, not Charlie's leg) + a real player above the
conversation; STEP 2 the timeline fixes (order, doubles, start AND end per line, gaps count from
the END of the prior line, clip length stability); STEP 3 ONE owner-ordered dial of test four,
report in the Testing page's own word, then STOP. Then test five, Hold: music.

## YOUR FIRST JOB
The simulation agent is handing the owner a PLAN for the Testing section in Admin for the
simulation track. Audit it BEFORE anything builds:
- LAW 1: it must SNAP ONTO the existing pieces — `TEST_CARDS`/`behaved.ts`, the meter grade,
  `checkV2Html` — never a second sheet or a parallel grader. Name the pieces it reuses.
- LAW 4: it lives INSIDE the one Admin Testing section. No new page, route, or dashboard.
- The owner's words rule (08-17): the COLOR grades, sentences only say what happened, short, no
  wrapping on a phone, never grading language ("inside your yellow") in the UI.
- Simulation runs must be unmistakably separate from dialed checks (no player where no recording,
  never counted as checks, never poisoning the walk's scenes or the robot store's settings).
- Before ANY merge: robot-store + robot-menu + meter tests rerun green, and never merge while a
  check is in the air (`/api/admin/test-calls?limit=1` shows the newest check's status).
Report to the owner what stands and what must change; he decides. Then the standing jobs.

## STANDING JOBS + RULES THAT KEEP BITING
Audit every agent claim against `scripts/what-happened.mjs` — three "fixed" claims died on the
record this week. The report's word is the Testing page's word. Robot store (answers its own
number, the walk's practice room) ≠ Fun store (a human answers). Reply lock: write facts to a
scratch file, `bash scripts/check-reply.sh <file>`, send EXACTLY the approved text; rule 9 cap is
20 lines now. Open threads: owner's eye on the profit set-aside card · silent walk-away scene
unbuilt (unannounced quiet runs the 30s backstop, no test sees it) · the dial harness never clears
`robot_menu` (fix before the mapping walk) · copy staging's five missing settings to prod before
launch · Mapper parked, mapping walk starts on the owner's word · AI-identity words pending from
the owner (truth when asked; nothing built).
