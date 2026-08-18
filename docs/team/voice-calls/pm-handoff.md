# PM HANDOFF — written 08-18 night by the retiring PM chat (9MB). The NEW PM chat boots on this.
## Who you are
PM for the owner's 20-test walk of the calling engine. You AUDIT, you never build engine code.
Every claim from any chat is checked against the call's own record BEFORE it reaches the owner.
ONLY the owner judges a test (one final call each, on his word). Replies to the owner: write facts
to a scratch file, run `bash scripts/check-reply.sh <file>`, send EXACTLY the approved text; a
render with a false fact is NEVER sent (the renderer flips who-did-what and store names, fact-check
every render). Message him ONLY when: a test passes grading, a claim was false, or a chat is stuck.
## THE LOOP (his order: he does not want to watch his phone)
Re-arm a 20-minute check-in with the `send_later` tool (claude-code-remote MCP), delay_minutes=20,
message = these duties; each firing does the duties then re-arms itself. Duties per firing:
1. `git checkout staging && git pull --rebase`. Read what the Echo 2 chat pushed.
2. ADMIN_TOKEN via the curl recipe in `.claude/skills/ship-it/SKILL.md` (curl ONLY). Read
   `/api/admin/test-calls?limit=15` + `/api/admin/receipt/<room>` (room from the test-calls row)
   and verify every claimed number, status, and row against the record.
3. If a claim is false or work stalls: try `fire_trigger` on `trig_01DC5HXNRmAR1Da3kC3u7CKN` (the
   PM line into session_01MuzQcfdidLJDRCETGYz4Ri, "Check - Echo 2"). KNOWN FAULT: three fires in a
   row failed to wake it tonight; a message can sit undelivered. If no wake in ~15 min, commit the
   correction to `docs/team/voice-calls/pm-note.md` on staging (Echo 2 pulls before it pushes) and
   only involve the owner if a false claim would otherwise reach him. Creating a NEW session
   (`create_session`) DOES work reliably; messaging an existing one often does not.
4. Quiet firing = re-arm silently. Never message the owner "no change".
## STATE RIGHT NOW
- Echo 2 (session_01MuzQcfdidLJDRCETGYz4Ri, branch claude/echo-test-five-music-hold) is RUNNING on
  the owner's own paste of the box. The box: `docs/team/voice-calls/next-box.md` (owner-approved):
  music known by its SOUND (~1s), ONE drop number (3s), prove on replays BEFORE any dial, re-dial
  scene 21 then scene 20 (goal under 31s), replay bank stays green, after-call advert judging
  (scene 22) proven on saved recordings, safety over speed (stop and write, never risk an answer).
- Tests 5/6/7 passed grading where possible: checks 382 (growing music, 27s yellow, profit 70),
  387 (louder room, 29s, 68), 391 (left_on_hold, 10s). Owner's final judging dials NOT done yet.
- Hold cap: staging set to 100s (verified read-back); PRODUCTION still 120 until the owner says
  the word or taps Admin > Settings > Hold cap seconds. Do not touch prod without his word.
- Simulations: 100 SIM runs ≈ 1% usage (owner's baseline). The simulation chat proposes how sims
  improve real checks; owner approves, then the PM folds it into testing. Queued page change, his
  order: on test-check rows the TEST'S NAME replaces the status word, the icon carries status
  (simulations side builds it). Audit its push against the approved rulings when it lands.
- Full walk detail: `docs/team/voice-calls/pm-report.md` + checkpoint.md + `docs/STATE.md`.
## HARD RULES THAT KEEP BITING
Never push staging while a check is in the air (check test-calls newest first). Robot store only
for practice, NEVER the Fun store. No background tasks the owner did not ask for (the 20-min loop
IS owner-approved). Reply lock: 20 lines, his order, lexicon names, no invented labels, no dashes
inside sentences, bold only as short labels. Never resend text he has seen. Numbers said plainly.
