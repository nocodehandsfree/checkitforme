# Voice agent report — the music box, then the listener + the wording (2026-08-18/19)

## 08-19 EARLY, SECOND BUILD AND FOUR DIALS. The listener that hears Staff say they are stepping
## away now knows 124 phrasings in seven groups, with 35 lines pinned that must NEVER read as
## walking away (a false yes drops Charlie while Staff are still thinking). 159 of 159 green, and
## the suite runs on every build via test-all.sh. The owner's wording ruling is in at all three
## doors in one commit, and the reader still understands "tin" when Staff say it. DIALS: **396
## scene 23 PASSED** (meter 27s, drop 3s green, profit 70%) · **397 scene 24 PASSED** (meter 30s,
## drop 3s green, profit 68%), so test six is green on both halves, and both records carry his new
## sentence "and is it a pack or a box" · **398 scene 22: the after-call reader met a live call and
## named the advert on the record**, and the card still fails as predicted (no hold declared, 46
## metered seconds, Charlie answered the advert). What the engine should do about that line is his
## open ruling. TWO SUITE REDS ARE PRE-EXISTING, proven by stashing my work: workflow-truth's
## restock-wording assertion and test-one-question's 2. NOTE: the simulation agent's own writeup of
## its 123 lines is not committed anywhere, so the list was rebuilt from committed sources and every
## line is marked with where it came from; paste their exact 123 in if they turn up, it only grows.


## STATUS: DIALED AND DONE. Scene 21 PASSED (check 393). Scene 20's new meter floor is 32 to 34
## seconds (checks 394, 395), down from 39 and 43, still over his 31 line by 1 to 3 seconds, and
## what is left there is the voice provider's reply time, not the music. The sheet now names the
## reader that really answered and its real price (proven on 393, 394, 395). Handoff for a fresh
## chat: docs/team/voice-calls/echo-handoff.md.

## THE DIALS, every one by its number
- **392** scene 21, first dial on the new engine: card PASS, drop row 3s GREEN, meter 37s red, so
  the pill said failed. The 37 was the tail after the answer, not the music.
- **393** scene 21, re-dial: **THE PILL SAYS TEST PASSED.** Meter 27s yellow, drop row 3s green,
  answer gap 2s green, handover 1s green, profit 71%. His item 1 for tonight is met: Charlie
  dropped 3 seconds after Staff walked off, graded green.
- **394** scene 20: "Echo recognised hold music" ON THE RECORD at 1200ms, dated to the music's own
  first note; hold declared the same second; Charlie dropped 3s later, drop row 3s GREEN (it read
  6s red on every classic dial before this). Meter 32s, profit 66%, card PASS.
- **395** scene 20 again, for a floor and not a single point: same stamp at 1200ms, same 3s green
  drop row, meter 34s, profit 65%, card PASS. Answer gap 7s red — the provider was slow that dial.
- One dial was LOST to my own mistake: I pushed the reader fix and dialed before staging had
  restarted, so the harness timed out on the Check button and no check was placed. No money burned
  beyond the run. Push, wait for /api/health, then dial.

## What is built, in his order

**1. Echo recognises hold music about a second in.** The evidence is the one this file already
trusts everywhere else: sound running on with no gap in it, longer than any voice manages
(`MAX_SPEECH_RUN_MS`, 1.2s, the same number and the same rule the comeback refusal already used).
The ear gained one report, `musicHeard`, and the bridge writes it on the record as
"Echo recognised hold music" (step `music_heard`), dated to the music's own first note.
- MEASURED FIRST, on the robot store's own carrier recordings, not guessed: the longest unbroken
  run inside real speech was 980ms (checks 384, 382, 387, 391). The only run past the 1.2s bar was
  check 383's advert, which is a recording and is meant to be caught.
- I tried a second idea first and threw it away: judging music by how STEADY its loudness is. On
  the tapes it looked clean per line, but sliding a one-second window across real speech (the
  decision the live ear actually makes) it would have called 30 of 106 windows of a real person
  music, because a mostly-quiet second has few loud frames and reads as steady. That is item 6 of
  the box — it would have traded a Staff answer for speed — so it is not in the build.

**2. The drop is ONE number.** `holdMusicMs` 6000 → 3000, so music waits exactly as long as
silence. It is not an Admin box (code only), so nothing needed saving in Admin. Safe at 3 because
the test underneath is a fraction, not a clock, and it was measured over that same 3 seconds: the
loudest three seconds of real speech filled 71%, 73%, 53% and 54% of the window against a 96% bar.

**Proven on replays before any dial.** Bank 347/0 · listen-nav 78 (10 new asserts, including the
measured guard that a real person's longest run never marks music) · bridge 13 · dropped-call 33 ·
call-events 124 · behaved 99 · meter 65 · receipt 15 · clips 10 · gates 9 · prompts 226 · robot
store held · tsc clean. No old shape moved and nothing about a talking person changed.

**Replayed against the real tapes too** (offline, driving the real ear with the real recordings):
on check 384 Echo says music 1.2s in and the wait opens on the same three seconds — item 1 and
item 3's green drop row, on a real recording. On check 382 (the swelling waltz) it never marks:
that clip's first 4.6 seconds are single plucks with long gaps, sparser than speech, so the ear
reads it as a quiet wait and stops the meter on the same 3 seconds. Nothing is lost there — 382's
drop row was already green at 3.

**7. The advert judging is built and proven.** After a check settles, the same reader re-reads the
written record and says, for each Staff line, whether a person said it or the store played it, and
whether it announces a wait in any language. It runs at the one place a check settles exactly once
(the verdict tail, whichever of the three doors won), after the answer, the charge and the
customer's screen are already done. It can never stop a live call and a wrong answer costs one
line on the record.
- PROVEN BEFORE ANY DIAL, on the real lines of checks 383, 384, 391, 382 and 376, committed into
  `scripts/hold-voice-bench.ts` so a reword can be re-run on the same recordings for good:
  **19 of 19 right, first wording.** No recording taken for a person, no person taken for a
  recording. It caught check 383's advert ("Thanks for holding. Did you know we price match...")
  and check 376's Spanish hold announcement, which a word list can never read.

## THE READER FIX IS SHIPPED (tonight's item 3), the finding below is now closed
**Every check's second read has been silently falling back to a different model than the record
claims.** `VERDICT_MODEL` is `groq:llama-3.3-70b-versatile`; staging's own GROQ key 404s on that
model (its model list has no llama-3.3 at all — only gpt-oss and prompt-guard), so every read falls
back to gpt-4o-mini while the record stamps "The answer was double checked · groq:llama-3.3-70b-
versatile" and prices it at the groq rate. The reads themselves are landing, so no check is wrong
because of it, but the record and the cost line both said something untrue. FIXED: `llmNamed`
reports which model actually answered after a refused vendor falls back, the reader carries it up
as `readBy`, `readCostUsd` prices what really ran (gpt-4o-mini at 0.000207, not Groq's 0.000626),
and all three settle doors stamp it, so the whole family went in one commit. Proven live: checks
393, 394 and 395 all read `gpt-4o-mini` / 207 where 392 and everything before it read
`groq:llama-3.3-70b-versatile` / 626. The owner ruled the OpenAI reader stays for now.

## NEXT, for whoever picks this up
Scene 22 (the advert in the music) has not been re-dialed: the judge is proven on its saved record
but has never met a fresh dial of it. Everything else, and every trap that bit me, is written in
docs/team/voice-calls/echo-handoff.md so a fresh chat can boot on it.
