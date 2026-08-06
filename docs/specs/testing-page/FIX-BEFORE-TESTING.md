# Fix these BEFORE any test dials (08-06, PM)

Every one of these is known, has evidence behind it, and is unfixed. Each one causes a test to be
dialed, read, fixed and dialed again, so fixing them first is what stops the back and forth. A robot
check costs 6 to 37 cents and the ceiling is 200 a rolling day, so the cost here is time, not money.

Nothing on this list is the Testing page's drawing. That work is Echo's and it is nearly done.

## THE FIVE ENGINE FAULTS

1. **Words Staff say after a hold or a transfer are thrown away.** We only write down what is said
   while Charlie is switched on, and he is switched off the moment Staff step away. Everything spoken
   as they come back never reaches the record, so the check reads as though Staff said nothing.
   Evidence: robot scene 5's "Okay, thank you for holding. Yeah, I did not see any, unfortunately.",
   scene 8's "Yeah, we've got a few.", scene 11's "Hello?", scene 14's opening greeting, scene 18's
   "Son las cajas de Pitch Black." Checks 330, 331, 333, 338, 342. On check 332 the new person's
   greeting, "Sporting goods, this is Dana.", is missing outright.
   **This one is first. It breaks four tests directly and makes every other check unreadable.**

   **DO NOT BUILD ANYTHING NEW FOR THIS (owner, 08-06). WE ALREADY DO IT, TWICE.**

   **The piece to snap onto** is the buffer that runs at the START of every single check. Charlie is
   not connected while Delta plays, and the store's greeting is not lost: every frame of it goes into
   `pending` (bridge.ts around line 345, fed at line 2042, with `preRoll` at 496 keeping the sentence
   whole), and when his session opens `handoverTimer` (line 672) releases it one frame at a time at
   the speed it was spoken, so the transcriber hears real pauses and writes it down properly. That
   pacing is the 08-01 fix for held audio arriving in one burst and coming out as wrong words with
   two turns welded together. A hold is the same situation, only longer: Charlie is off, the store is
   talking. Today that audio reaches none of those branches and is simply dropped, because on a hold
   `eleven` is closed and `connecting` is false. Keep buffering it and let the SAME paced hand-over
   release it when he reconnects.

   **The second proof that no new recognizer is needed:** on a mapping call Charlie is not on the
   line at all until the department has to be proven, and we still write down every word the menu
   says and store it. That runs on Twilio's own speech to text (`<Gather input="speech">`,
   navigator.ts around line 387), which `map-capture.ts` says in its own header costs "no new audio
   plumbing, no speech-recognition bill".

   **Echo is NOT the answer and never was:** it measures loudness and tone, to know whether somebody
   is there, whether it is hold music, and whether a person came back. It has no transcriber in it.

2. **The signoff marker fires off a reading taken before Staff answered.** On robot scene 16 the
   sheet said "Charlie understood the stock answer and was told to say goodbye when done" at 8
   seconds; Staff first spoke at 20. `nudgeSignoff` (bridge.ts around line 1009) is only knocked when
   `live-read.ts` returns a definite yes or no, and the reader gave a definite answer off the
   GREETING. Every row after it then reads green on a check that should have failed. Check 332 shows
   the same mark at 8 seconds.
   **The rule: the marker cannot fire until Staff have said something that is an answer to our
   question.**

3. **One Staff sentence must be one line.** A hold that drops and reconnects inside a sentence splits
   it. On check 332 "We did not." was written as "Not" and "Thursdays, usually." as "Usually.",
   twelve seconds apart, and Delta replayed the question in the gap, which is why the customer's
   screen showed the opening question twice.

4. **Charlie must never ask the stock question twice on a check, even when no answer ever comes.**
   The never repeat rule only bites once an answer is IN HAND, and on the scene where Staff talk and
   never answer he asked three times in three wordings. No rule covers "they keep talking and never
   answer."

5. **A verdict must never be written when stock was never mentioned.** The same check came back Sold
   out off a call where nobody said anything about stock. This one is customer facing and it is the
   worst on the list.

## FIVE MORE, MISSED ON THE FIRST PASS (added 08-06 after the owner asked what else was missing)

Every one of these makes a test fail on its first dial for a reason that has nothing to do with that
test, which is exactly the back and forth we are trying to stop.

6. **Charlie never asked to be put through on the transfer test.** Check 332 is robot scene 10, whose
   whole point is that he reaches the wrong department and asks once to be transferred. There is no
   such line anywhere in that check's conversation. Staff moved us on by themselves, so the test
   proved nothing.

7. **The vague yes is a coin flip.** Checks 248 and 257 are the SAME words minutes apart and came
   back `in_stock` and `no_clear_answer`. Until that settles, the vague yes test can pass and fail on
   identical input.

8. **One check can write four rows.** Check 238 wrote 239, 240 and 241 as well, one conversation id,
   the three extras with no room, a shorter transcript, landing 41 seconds later. Anything reading
   the newest row gets the unfinished one.

9. **Three status words have never once been produced.** Too busy to check (robot scene 15 gave
   Couldn't tell), Got their voicemail (scene 17 gave Nobody answered), Admin hung up (scene 13 gave
   In stock). Three tests will fail on their first dial for this alone.

10. **Charlie never asks for the exact item.** Checks 328 and 329 were both placed for one named
    product, the item reached the server, and his instructions carried "do you have a Mega
    Evolution—Pitch Black Booster Display Box in stock?", and he asked the ordinary set question both
    times. **OPEN: his approved words fight each other here and only the owner can settle which
    wins.**

## THE SCRIPTS TO WRITE, SO NO TEST DIALS INTO SILENCE

Five tests have no Staff words at all and two have the wrong ones. A test with no Staff response
leaves Charlie asking into nothing, the check runs its full length, and we pay for a check that
proves nothing.

**Write the Staff words for these five**
- **Hold: music** — Staff put us on hold with music and come back with an answer. The approved clips
  are already committed at `public/robot-clips/` (do not regenerate them).
- **Hold: phone down** — Staff set the phone on the counter, the room is noisy, then somebody speaks
  to us again with an answer. Clips committed in the same place.
- **Alert: email** — NOT a robot scene. It is robot scene 1 run against a store the owner has an
  alert on, then proving one email really arrived.
- **Delta did not play** (new, owner 08-06) — Delta is switched off for this run, Charlie asks the
  question himself in his own voice, Staff answer normally, and the check still comes back with a
  status. This is the designed fallback and it has never been tested on purpose; it worked by
  accident on 08-06 when mapping had never wired Delta in.
- **The rambling wrap-up** (new, owner 08-06) — Staff talk warmly and never answer. Once Charlie has
  been TALKING for the Admin number "Charlie wrap-up seconds" (45 on staging today) he says "Don't
  want to keep you, did you find out if you have Pokémon cards?", takes whatever answer he gets,
  thanks them and ends the check. It never hangs up on somebody who is helping.

**Rewrite these two**
- **Hungup: 90 seconds of ringing** — the owner's ruling: it is the ring AFTER a transfer that nobody
  ever comes back from, and it proves OUR system hangs up. Robot scene 12 rings from the very first
  dial and nobody ever answers, which is a different test.
- **Hungup: 4 minute limit** — the owner's ruling: it is our own safety net, our system hanging up at
  four minutes when something goes wrong, and the customer IS charged. It is NOT the chatty person
  (robot scene 13), which is now its own test above. **OPEN: what Staff do on this test is the
  owner's call and is not written down anywhere. Ask him before touching it.**

## HOW THIS IS PROVEN

Faults 2 to 5 and every script above can be worked on without dialing. Read existing checks with
`ADMIN_TOKEN=… node scripts/what-happened.mjs <id>`; 330, 331, 332, 333, 338 and 342 carry all five
faults between them. Fault 1 needs one fresh check at the end to prove the words now land.

`src/voice/` is frozen and faults 1, 2 and 3 live in it. The owner has named this work, so open it
with a repo-root `.unlock` holding `src/voice/**`, fix only that, then delete the `.unlock`.
One scene per dial, read the record before every dial (RULES 15), and push after every step.
