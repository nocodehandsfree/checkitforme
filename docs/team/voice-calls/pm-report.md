# Voice agent report — the music box (2026-08-18 night, owner said start now)

## STATUS: built and proven on the bench and on the real recordings. NOTHING DIALED YET — two
## Railway builds have sat in BUILDING for 12+ minutes with a third queued. Per the owner's law I
## have not cancelled or re-queued either one. Staging still serves 0ffd889d. The dials (box items
## 3 and 4) run the moment /api/health shows the new commit.

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

## A REAL FINDING FOR THE PM, outside this box, not fixed
**Every check's second read has been silently falling back to a different model than the record
claims.** `VERDICT_MODEL` is `groq:llama-3.3-70b-versatile`; staging's own GROQ key 404s on that
model (its model list has no llama-3.3 at all — only gpt-oss and prompt-guard), so every read falls
back to gpt-4o-mini while the record stamps "The answer was double checked · groq:llama-3.3-70b-
versatile" and prices it at the groq rate. The reads themselves are landing, so no check is wrong
because of it, but the record and the cost line both say something untrue. Whose lane that is, the
PM decides.

## Next, the moment staging serves the new commit
Dial scene 21 (the growing music test) to done, then scene 20 (the loud classic) and report its new
meter floor. Expected from 384's own record: the 3s music clock saves exactly 3 seconds of Charlie's
meter and turns its drop row green at 3; the meter should land near 36s, still over the 31 line,
and the rest is the voice provider's 2 to 7 seconds of thinking per reply, which is his own-brain
plan and outside this box.
