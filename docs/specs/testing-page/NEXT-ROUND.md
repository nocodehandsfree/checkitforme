# THE NEXT BUILD — every decision the owner made on 08-06 PM, in one list

**STATUS 08-06 late: sections 1, 2, 3 and 4 are BUILT AND TESTED LOCALLY ON THE BRANCH, NOT PUSHED**
(his order: "work local on branch, don't push until I tell you"). Section 6 is built too. Section 5 is
DELIBERATELY NOT BUILT: he is putting Deepgram on the Twilio leg, which transcribes the whole check
whether Charlie is open or not, so the held-audio fix would be dead code the day it lands. Section 7
waits on his own directional copy. Section 9 needs two scripts in his words before it can be built.

Written for the chat that builds it, not for the owner to read back.
The five faults he named on 08-06 (order, the card's name, the status, the charge, the circle) ARE
built, shipped to staging and Admin, and proven on checks 345 to 348. This file is what comes next.

Read first: `docs/specs/testing-page/HANDOFF.md` (the original box) and `docs/team/admin/checkpoint.md`.

## HOW HE WANTS THE ROUND RUN (his words, 08-06)
One build for everything on this list plus the project manager's list, which he will hand over. Then
he goes test by test, one robot scene at a time, giving live feedback while we correct. Do NOT start
building until he says go.

## 1. THE MARKS ON THE SCREEN COME FROM STATUSES, NEVER FROM US
- "Pull everything from the statuses section, don't make up your own icons or status, we already have it."
- Today the check sheet's status circle draws OUR OWN tick, cross and dash (`statusIco` in
  `public/app.html`), not the mark the owner picked for that status.
- Five statuses hold an emoji instead of a lucide name (in_stock ✅, sold_out 🕐, does_not_sell 🚫,
  not_in_stock ❌, failed ⚠️) and the page hand-draws those in `statusIcon`'s `G` map.
- Every step in the check log is a plain dot. A hold must draw the `pause` mark, which is the mark
  his own `left_on_hold` status already carries. Lucide only, everywhere.

## 2. AN "ISSUE:" ROW MUST PRINT THE FAILURE, NOT THE ROW'S NAME
A failed behaviour row prints as "Issue: Charlie ended the check" while the log also says "The store
hung up on us". The row is NAMED for the good behaviour and a red cross means it did not happen; the
truth is in `why` ("Staff hung up on us at 143s"). Print the failure in words. His words: "these two
things cannot be true."

## 3. TOTAL TIME IS THE CHECK'S LENGTH, NOT THE PROVIDER'S LAST SESSION
`rollupFromRow` (src/calls/events.ts) takes `call.callSeconds` first, which is the provider's own
session length: 0:19 on check 348 (really 2:23) and 0:08 on check 347 (really 1:24). It feeds the
sheet's Total time tile, the Testing list and any report that averages call time. The timeline's own
last second is the true length. The money is NOT affected (billed minutes already use the true
length), only the time shown.

## 4. THE HOLD ROWS DRAW LATE
Both hold rows draw about 6 seconds after the truth, because a hold is only declared after 6 seconds
of quiet. The LENGTH printed ("Staff back after 29s") is already backdated and correct: `beginHold`
and `endHold` in `src/voice/bridge.ts` carry the true moment as `atMs` in the event's own detail, and
`emit` stamps the event at now. Draw both rows at the moment already in the detail. His words:
"we need to capture the moment that we're truly put on hold ... how else are we gonna be able to test
the different hold situations like silence or hold music."

## 5. THE WORDS LOST AFTER A HOLD (the biggest one)
`endHold` keeps `heldWords`, the frames from the moment their voice starts again, but when Charlie
was CLOSED for the hold, which is every hold on the reopen strategy, it opens a new session and
RETURNS without ever handing them over (`src/voice/bridge.ts`, the `if (!eleven)` branch). The
sentence is captured and dropped a fraction of a second later. "Yeah, we've got a few." on check 348
died there and the check came back Not in stock on a store that had some.
- The fix: put `heldWords` at the FRONT of `pending`, exactly as the opening hand-over already does
  with the store's hello (`pending.unshift(...held)`), so `flushPending` paces them into his new
  session at the speed a phone carries speech.
- The rolling buffer is 250 frames (5 seconds). A longer one costs nothing but memory.
- What it will NOT fix: somebody talking at length while Charlie is off. See section 8.

## 6. THE READER MUST TREAT A DESCRIPTION OF THE PRODUCT AS A YES
Owner's ruling: "The staff said black boxes, that is the vague response. If there was no pokemon they
would say no pokemon, they wouldn't describe what it looks like."
On check 348 the reader (`classifyVerdict` in `src/voice/verdict.ts`, groq:llama-3.1-8b-instant) had
"It's black boxes, I think." and still filed Not in stock. Its guidance lists positive cues but
nothing says that describing the product they went and looked at is a yes. Add that rule.

## 7. CHARLIE'S FOLLOW-UP QUESTION, SHORTER
`src/voice/prompts.ts` line 56 tells him to ask ONE question covering the set name AND whether it is
packs, boxes or tins, with a real set name as an example. On check 348 Staff had already said "It's
black boxes, I think.", so he asked for both halves anyway and then corrected himself out loud:
"Wait, you already mentioned black boxes, so that's helpful, do you happen to know the set name at
all?" Two changes the owner agreed with: ask only for the part Staff have not already given, and
never correct yourself out loud, one sentence and stop. The owner is rewriting the directional copy
with another agent, so take the wording from him, not from here.

## 8. THE COST QUESTION HE WANTS ANSWERED BEFORE ANY SECOND LISTENER
"Whatever the solution is, like the second LLM that verifies the transcript, it needs to be cheap,
and if it is going to increase the cost of a check I need to know our options on the solution and
that needs to go into the cost section and the formula for margin, cost of check etc."
- Rates in force (`MEASURED_RATES`, src/calls/cost.ts): phone line 1.4¢ a minute, the audio forks
  0.44¢ a minute each, Charlie 10.963¢ a minute, the status reader 0.0055¢ a check.
- Section 5 is FREE: no new vendor, no new per-minute cost.
- A listener that turns sound into words for the WHOLE check is a new per-minute cost on every check
  and must show as its own line in the check cost card next to the existing five, and enter the
  margin formula the same way. No vendor price is quoted here because none has been measured.
- Mapping already transcribes a phone menu with no Charlie on the line, using TWILIO's own speech to
  text on a `<Gather input="speech" enhanced="true" speechModel="phone_call">` (`src/calls/navigator.ts`).
  That path cannot be used on a customer check as it stands: a check runs on a Twilio Media Stream,
  not a Gather, and Twilio prices its speech recognition per Gather.
- Recording a customer check and transcribing it afterwards is CHEAPER per check than a live listener
  and it breaks a standing rule: today no audio from a customer check ever reaches disk (`recordLine`
  in src/calls/events.ts, "TEXT ONLY, no audio, ever, on any path"). Mapping checks ARE recorded
  (`Record: "true"` in navigator.ts) because they are our own calls to a menu. Only the owner can
  decide whether a customer's check may be recorded.
- How to measure any of it: `scripts/robot-check.mjs <scene>` plus the robot store's own note of what
  it said and when (`/api/admin/robot-store` → `run.said`), compared line by line against what the
  record kept. The scratch comparison used on 08-06 is the pattern; make it a script in `scripts/`.

## 9. THE TWO HOLD TESTS THAT DO NOT EXIST YET
There is no robot scene for `hold_music` and none for `hold_phone_down`. The audio is already in the
repo and nothing in the calling code uses it yet: `public/robot-clips/03-hold-music-classic.mp3`,
`05-hold-music-waltz.mp3`, `08-hold-music-with-ad.mp3`, `09-hold-music-with-ad-b.mp3`,
`06-ad-voice-female.mp3`, `07-ad-voice-male.mp3`, `01-busy-store.mp3`, `02-busy-cafe.mp3`.
`RobotAct` has no act that plays a sound file; today `{ silence: n }` is the only wait.

## 10. SMALL ONES
- The chat-length warning fires at 4 megabytes; the owner is moving it to 7 himself.
- The customer's own result screen said "Left on hold" on check 348 while the record said
  not_in_stock. Not this page, and already open in the voice checkpoint.

## WHAT IS ALREADY DONE, so nobody rebuilds it
One clock in real milliseconds for steps and spoken lines · the card's name leads the log · the status
reads through the site the check came from · the charge step reads the charge stamp and
`/api/calls/:id/receipt` sends `chargedAt` · every marker on one 15px rail at 390px · a spoken line is
filed at the moment it was said (the greeting's clock was measured from the wrong zero; Staff lines
are filed at their voice start). Measured against the robot: lines were 3.3s late, 6.1s after a hold,
now within 1.2s.

## 10. THE 08-07 EVENING ROUND — WHAT WAS AGREED AND WHAT IS STILL HIS CALL

Written the moment each was said, so no decision is lost with a chat.

**SHIPPED 08-07, no decision left in them.** Echo's speech to text rides the PICKUP FORK and its flag
travels as a `<Parameter>` beside the room, never in the web address (check 353 ran with no words at
all because the address came back mangled). A turn is written down WHOLE: the pieces are held until
Deepgram's `UtteranceEnd`, never flushed on `speech_final`, which fires at the first breath and is
what split one sentence in two on check 354. The live reader must be sure of itself before it tells
Charlie the answer is in hand: the single word "Pokemon?" read as not in stock at confidence ZERO
knocked the signoff at 14 seconds on 354, so `live-read.ts` now needs `confidence > 0`. The Testing
sheet's Staff greeting row takes the FIRST line of the check, not the nearest one, because Echo now
writes the greeting at pickup and the nearest line is the one after it.

**AGREED, NOT YET BUILT** (owner 08-07, his words in the chat):
1. **The signoff row names the follow-up.** Today it is one fixed sentence. Not in stock reads
   "Charlie understood the product was not in stock and was told to ask what day and time more are
   coming"; in stock reads "Charlie understood the product was in stock and was told to ask for the
   set name and whether it is packs, a box or a tin". Both match the directional copy in
   `prompts.ts` sections 56 and 58, which is already working on the line (check 355).
2. **ONE LINE PER NAME ON THE CHECK COST CARD**, opening to its own pieces. Two Echo lines was
   wrong. `Echo (Ears)` holds the listening AND the words. `Charlie (Voice)` holds speaking,
   listening and waiting, each with its seconds AND its cost. His naming, because Echo does two
   things now and "Echo (Listening)" no longer says what it is.
3. **The tiles at the top stay the roll-up**, and speaking, listening and waiting belong up there.

**STILL HIS CALL:** cutting `holdQuietMs` from 6 seconds to 3 (floor 2). What it costs today: Charlie
bills 0.18¢ a second and his meter runs 6 seconds past Staff's last word every time they walk away,
which was 3.3¢ of check 354's 15.9¢ across three walk aways.

**TWO FACTS THAT DECIDE IT, both read off the code 08-07.** Delta only replays the recording after a
REAL hand-over (`was === "transfer" || asked` in `endHold`), never for somebody who walked away and
came back, so a false drop on a short pause does NOT show the customer the opener twice. And a reopen
is triggered by the SOUND of them coming back, not by Echo's words, so Charlie starts opening the
moment they speak and Echo transcribes alongside him. The cost of a false drop is about one second
where he cannot reply, not a doubled question.

**WHY CHARLIE STILL HAS HIS OWN EARS** (his question, answered 08-07): while he is OPEN he hears the
line himself and Echo's copy is NOT sent to him, so there is only ever one set of words. Echo's words
reach him ONLY as a note when he was CLOSED for them (`missedWhileClosed`). Feeding him text instead
of audio would add the turn marker's full second of quiet plus the writing to every reply, so he
would always be a beat late. The one overlap: a sentence started while he was open and finished after
he closed is heard live in part AND handed to him whole in the note.

## 11. BUILT 08-07 LATE, AND THE ONE FOUND WHILE PROVING IT

All of §10's agreed list is on staging and Admin, proven on check 356 (scene 2, 12.3¢):
`Echo (Ears)` is ONE line at 3.3¢ opening to hearing the line 2.1¢ and writing the words 1.2¢;
`Charlie (Voice)` is ONE line at 4.8¢ opening to Speaking 4s 0.7¢, Listening 2s 0.4¢, Waiting 20s
3.7¢; the same three print under his seconds on the tile up top; the signoff row reads "Charlie
understood the product was not in stock and was told to ask what day and time more are coming"; the
store answered the time follow-up and Charlie signed off ("Perfect, thanks so much Larry, have a
good one!"), so the goodbye row passed for the first time; and `holdQuietMs` is 3, visible in the
record as hold_start to charlie_leave gaps of exactly 3 seconds.

**FOUND ON 356 AND FIXED THE SAME HOUR.** He said goodbye at 59 seconds and the line stayed open
until the STORE hung up at 145, which billed a third whole minute and put that check's margin at 51
percent. The rule that ends a signed-off check (owner 08-04, check 282) lived ONLY at the start of a
wait, so a goodbye said while the line was ALREADY going quiet found the wait open and nothing
looked again. `hangUpAfterGoodbye` is now one function with two doors: the start of a wait, and the
goodbye landing during one. Proved in the rig (`test-delta-clip`, "the goodbye lands after the quiet
has already started"), NOT yet on a real check.

**THEN 357 AND 358, AND THE ONE THING STILL OPEN.** Check 357 said nothing at all, and its record
showed why a floor was needed: a session opened at 16 seconds and closed at 18, so reopening (about
a second) plus answering (a beat more) never fitted. `charlieMinOnLineMs` is the fix, 5 seconds,
Admin-tunable, LIMITS [0, 30000]: the wait still starts on the record at the second they went quiet
and only the CLOSING of his session waits the remainder out. Check 358 proves it live, sessions of
7 and 6 seconds where 357 had 2.

**SOLVED THE SAME NIGHT (`8c98d170`), READ THAT COMMIT BEFORE TOUCHING ANY OF THESE NUMBERS.** A
clock could never fix it: the store that answers itself goes quiet the instant it finishes a line,
so the quiet straight after Staff's answer is CHARLIE THINKING, not Staff walking away. He is no
longer dropped while he is holding their answer and has not spoken in that session, capped at six
seconds from the moment they answered. `charlieMinOnLineMs` stays as the floor underneath it. The
history, kept because it is what proves a stopwatch was the wrong tool: CHARLIE SPOKE ON 355 AND
356 AND SAID NOTHING AT ALL ON 357 AND 358.** It is NOT the 3 second cut: on 358 his first session ran a full 7 seconds
with Staff saying "We did not." inside it and he still did not answer. Same scene, same store, same
words, four checks. 358's card reads Speaking 0s · Listening 2s · Waiting 17s, which is the whole
picture in one line and is exactly what that breakdown was built for. Read 355 and 356 against 357
and 358 before changing anything.
