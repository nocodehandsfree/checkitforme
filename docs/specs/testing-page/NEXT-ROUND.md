# THE NEXT BUILD — every decision the owner made on 08-06 PM, in one list

Written for the chat that builds it, not for the owner to read back. Nothing here is built yet.
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
