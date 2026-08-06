# The Testing page: every issue the owner found, and the box for the next chat (08-06)

The owner locked this page down yesterday and it has come apart again. He wants ONE thing out of this
work: the Testing page tells the truth about a check, every time, in the right order, so that from
then on the only question anyone asks is how the check went and whether Charlie behaved.

Read this whole file, then `docs/specs/robot-store/scenes-needed.md` (his 19 approved scripts) and
`docs/team/voice-calls/RULES.md`. The evidence for every line below is `robot-run/walk.json` plus the
checks named in it, read with `ADMIN_TOKEN=… node scripts/what-happened.mjs <id>`.

## THE BOX
**Task.** The Testing sheet's timeline can never be out of order, never invent a second, and always
name the test it ran. The scorecard says PASSED only when the check proved the card's own sentence.
**Done when**, on the last five checks and on three fresh ones you dial yourself:
1. Every row's second is greater than or equal to the row above it, with no two unrelated rows
   sharing a second by accident.
2. Row one is the card's name from `TEST_CARDS` (`Voicemail: detected`), never the scene's name
   ("Their answering machine picked up") and never below the first thing Staff said.
3. Charlie never appears speaking before "Charlie joined", and "Charlie understood the stock answer"
   never draws before Staff have answered anything.
4. Each scene's scorecard carries ONE headline row: the card's own sentence, red or green. A row
   that cannot apply reads "not tested", never green.
5. The status circle sits on the rail like every other row at 390px wide.
**Snap onto** (LAW 1, name these in your contract, do not build a second anything):
`src/calls/receipt-store.ts` (the one writer of a check's steps) · `src/voice/bridge-place.ts` line
147 (`named_test`) · `src/calls/behaved.ts` (`TEST_CARDS` + the eleven behaviour rows) ·
`checkV2From`/`checkV2Html` in `public/app.html` around lines 2490 to 2560 (the sheet's own builder,
where the spoken lines are spliced into the step list) · `scripts/robot-check.mjs` (the harness).

## WHAT HE SAW, IN HIS WORDS, WITH WHAT IS BEHIND IT
1. **Steps counted at the same second.** Check 332: "Staff back after 31s" and "Charlie reconnected"
   both at 49s; "Staff answered" and "Delta recording" both at 50s; "Staff stepped away", "Charlie
   dropped" and "Staff back after 6s" all three at 58s. A gap of 6 seconds cannot happen inside one
   second. The steps and the spoken lines are two separate lists on two clocks, both rounded to whole
   seconds, and the sheet splices one into the other by comparing those rounded numbers
   (`app.html` ~2543 to 2548). Order has to come from one list with real milliseconds on it.
2. **The order is wrong.** On his 11:50 PM check, Delta's recording draws AFTER Staff answered it,
   and Charlie speaks before "Charlie joined". On his 11:55 PM check the first row is Staff answering
   and the test's name comes second.
3. **The test's name is missing or wrong.** `bridge-place.ts:147` writes `Test: <scene name>`. It
   must write the CARD name, which is already on the same object (`scene.card` into `TEST_CARDS`).
   His voicemail check reads "Their answering machine picked up"; the card is "Voicemail: detected".
   On his 11:44 check the name is absent altogether and row two is "Couldn't tell".
4. **We call tests passed when they are not.** The scorecard is 20 rows of equal weight and none of
   them asks whether the scene proved its card. Scene 13 came back mostly green while the check was
   filed In stock with Staff never once saying they had anything.
5. **The four minute test has a full conversation in it.** HE EXPECTS FOUR MINUTES OF SILENCE. His own
   approved script (`scenes-needed.md`, "Test 10, the 4 minute limit, the actual words") is a chatty
   Staff member who never answers, eight lines, repeating. One of the two has to change and only he
   can say which. ASK HIM BEFORE TOUCHING IT.
6. **Charlie is not speaking Spanish.** On check 342 his first line was English because it is Delta's
   recording, which is English; his own next line was Spanish. The card says Charlie holds the ENTIRE
   conversation in Spanish, so either Delta needs a Spanish recording or the card needs his ruling.
7. **"Is that even our recording?"** Yes. Every Staff line is our own script, spoken in our own voice,
   from `ROBOT_SCENES` in `src/calls/tapedeck.ts`. What he read as Staff improvising is our own
   transcriber mangling them: "We did not." was written down as "Not" and "Thursdays, usually." as
   "Usually." Nobody is making words up.
8. **The status circle is pushed right.** The yellow circle on "Couldn't tell" is bigger than the grey
   ones and sits off the rail. Every marker was measured onto one 15px grid on 08-06; this one broke it.
9. **"Customer charged" under a check that was not charged.** Same screenshot: the row says charged
   while the check's own record has no charge stamped on it.

## WHAT I FOUND DIALING, THAT IS NOT ON HIS LIST
- **Words vanish after a hold or a transfer.** We only write down what is said while Charlie is
  switched on, and he is switched off the moment Staff step away. Everything said as they come back
  is lost: scene 5's "Okay, thank you for holding. Yeah, I did not see any, unfortunately.", scene 8's
  "Yeah, we've got a few.", scene 11's "Hello?", scene 14's opening greeting, scene 18's
  "Son las cajas de Pitch Black." Checks 330, 331, 333, 338, 342. This is the biggest one.
- **Three status words have never once been produced**: Too busy to check (scene 15 gave Couldn't
  tell), Got their voicemail (scene 17 gave Nobody answered), Admin hung up (scene 13 gave In stock).
- **The screen and the record disagree**: scene 10 painted "Nobody answered" while the record said not
  in stock; scene 13 painted "Couldn't tell" while the record said In stock.
- **Charlie never asks for the exact item.** Checks 328 and 329 were both placed for one named
  product, the item reached the server, his instructions carried "do you have a Mega
  Evolution—Pitch Black Booster Display Box in stock?", and he asked the ordinary set question both
  times. His approved words fight each other and only the owner can settle them.
- **A customer cannot pick one exact item at all.** Measured on the live staging site: the category
  card that holds the item list is hidden on a site that is about one product line, which is all four
  of them, and the Hobby hunt is switched off by its own flag.

## RULES FOR THIS WORK
- One writer for a check's steps, one reader for the sheet. If you find yourself adding a second
  place that decides order, stop: that is the fault you are fixing.
- Never dial without reading the last check's record first (RULES 15). One scene per run:
  `ADMIN_TOKEN=… node scripts/robot-check.mjs <n>`. The robot store's ceiling is 75 checks a rolling
  day and each check costs 6 to 37 cents.
- Do not touch Charlie's instructions or the 19 approved scripts. Both are the owner's own words.
- `src/voice/` is frozen. The post-hold words fault lives in there; write it up, do not open it.
