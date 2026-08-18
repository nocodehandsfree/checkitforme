# Voice agent report — tests five, six, seven (2026-08-18)

## Test five, hold with music, scene 20: THE HEARING FAULT FROM CHECK 377 IS FIXED, proven live on check 379. The pill still says Test failed, on cost rows that sit on a floor (math below).

**The fix (checks 377/378 both showed it).** The ear banked any loud sound as "a person is back"
the moment the music test's window was poisoned by a dip. Check 378's own carrier tape settled how
to tell them apart: the music held the line 100% loud for fourteen straight seconds while real
speech never passed about two thirds loud in any one second — the gaps are the whole difference.
(Loudness swing separates nothing: on the same tape the music swung 600→6500 inside single seconds,
exactly like a voice. A first fix using swing flapped three times on check 378 and was removed.)
Now, on a hold, a run of sound banks as comeback evidence only when it breaks at word scale;
an unbroken run past 1.2s is struck as the music. The rejoin still backdates to their first word.
- src/calls/listen-nav.ts (ConversationEar) — src/voice untouched, no .unlock needed.
- Rig: 3 new ear scenes (377's dip · music that keeps dipping · the swell) fail on the old engine,
  pass now. The rig's raw SPEECH shape gained the silent fifth frame its own `speak` helper always
  had, because the tape proved gapless speech is a music shape. Suites: listen-nav 68 · delta-clip
  bank 339/0 · bridge 13 · dropped-call 28 · call-events 124 · behaved 99 · meter 65 · clips 10 ·
  gates 9 · robot store held · tsc clean.
- **Check 379 (scene 20): card half PASS, Meter stopped GREEN, one hold, one drop, one comeback,
  their answer handed once.** 377 had him rejoin at 25.6s into a music dip and bill through 14s of
  music; 379 dropped at 24s, stayed off through all 7.6s of remaining music, and rejoined backdated
  to Staff's real voice at 31.6s.

**Why the pill still says failed — the floor, second by second (check 379, meter 43s):**
- 10s: joins as his recorded question ends (no meter under the question).
- 10→15.5: the robot thinks, then announces the hold. 5.5s waiting on the store's own scripted pace.
- 17→19: our recorded hold reply plays.
- 18→24: music. The ear needs 6 unbroken seconds to call sound music (quiet needs 3, because a
  quiet line proves itself faster). 6s of meter. Shortening it moves WHEN his ear switches off —
  banned by the standing law.
- 24→31.6: dropped, meter off through the music (this is the stretch 377 billed).
- 33→37.5: their answer handed 1s after their voice stopped (green); his reply took 4.5s — Echo's
  writer finalizing plus the voice provider generating. Benched 08-15: the provider cannot lower
  its turn wait; the own-brain plan is the owner's open decision.
- 37.5→46: follow-up turn, then 5s of scripted robot silence before the wrap-up nudge.
- 46→57: goodbye generated and played out. 11s this dial; check 378 did the same in 5s — provider
  variance, same benched floor.
- Floor ≈ 31-35s meter on this scene's script even on a lucky dial → the 30s yellow line is out of
  reach without the own-brain work or a re-ruled band. Profit rides the same seconds: 378 made 59%
  (pass), 379 made 52% (fail) — a coin flip around the 56 floor at ~12¢ against 25¢ with the hold
  forcing the second billed minute.
- **The announced hold drop gap row can never be green on a music hold**: green is 3, red from 6,
  and the music proof time IS 6s. The row's bands were written on quiet holds. Grading stands as
  ruled — flagging the collision, not touching it.

**Known reds not the card's:** the customer screen said "Left on hold" while the record says
in_stock on 378 and 379 — the 08-07 screen-vs-record list fault, pre-existing.

**Next: scene 21 (waltz).** Pre-measured off the committed clip: its quiet intro plucks every
~340ms, so neither the quiet path (plucks reset the 3s) nor the music path (needs 6s unbroken)
can declare the hold until the swell, ~12s in. Dialing it next and fixing what the sheet shows.
