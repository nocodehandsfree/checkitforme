# WHERE THE ROBOT STORE TESTING ACTUALLY IS (PM's record, 08-06 night)

The owner's words: "I don't know what he actually fixed or what test passed." This file is the
answer. Read it before touching anything. It replaces every verbal claim made overnight.

## THE ONE THING TO UNDERSTAND FIRST

**No pass mark from tonight can be believed.** It is proven, not suspected: scene 16's sheet read
green on a check that should have failed outright (the signoff marker fired at 8 seconds, when Staff
first spoke at 20). A scorecard built on a wrong clock and a wrong reading grades everything after it
wrong too. So do not go looking for "which tests passed last night." There is no such list.

## WHAT IS ACTUALLY PROVEN

- **All 19 scenes exist in `src/calls/tapedeck.ts`**, every line word for word from the owner's
  approved scripts in `scenes-needed.md`. That much is real and was verified by reading.
- **Dialed with a record pushed to the repo:** scenes 2, 3, 5 and 19. Scene 16's check was refused by
  the daily ceiling and never dialed. Scenes 1 to 4 were proven in earlier rounds (08-02 to 08-04).
- **A check killed by a restart now settles in a minute** instead of hanging (04:57, `service.ts` +
  `server.ts`). Checks 324 and 325 were hanging with an empty conversation before it.
- **`ROBOT_DAILY_CAP` is 200** on staging (raised 06:46 on the owner's word; it was 40, then 75).

## WHAT IS NOT PROVEN AND MUST BE TREATED AS NOT RUN

**Echo pushed nothing to staging after 05:40.** The owner watched scenes 13, 14, 16 and 17 go by on
his phone after that. None of those runs exist in the repo: no `run.json`, no screenshots, no commit.
A run that was not pushed did not happen. Start those scenes from scratch.

## THE FAULTS FOUND TONIGHT — NONE OF THESE ARE FIXED

1. **The signoff marker fires off a reading taken before anyone answered.** Scene 16: the sheet said
   "Charlie understood the stock answer and was told to say goodbye when done" at 8s; Staff first
   spoke at 20s. `nudgeSignoff` (bridge.ts ~1009) is only knocked when `live-read.ts` returns a
   definite yes or no, so the reader gave a definite answer off the GREETING. Everything downstream
   trusted it. **This is the one that makes green marks meaningless. Fix it first after the clock.**
2. **A spoken line can be written down with no second at all.** Scene 14 (a transfer): "Oh, one sec.
   Let me grab someone" drew at 0s, above "Dialing". `checkV2From` (app.html ~2543) places an
   unclaimed line by its own `atSec` and prints that number, and a Clerk line at 0 slots before
   everything. The sheet is obeying its rule. **The record handed it a zero.** The same screen shows
   "line answered 5s" then "Staff greeting 34s", a 29 second hole that smells like the same fault.
3. **Charlie asks the stock question again and again when Staff never answer.** Scene 13 (Staff talks
   warmly forever and never answers): he asked three times in three wordings. The never-repeat rule
   in the wrap-up note only bites once the answer is IN HAND, and this scene never gives one. No rule
   covers "they keep talking and never answer."
4. **A verdict of Sold out came back off a call where stock was never mentioned.** Same scene 13
   check. This is customer-facing and it is the worst one on the list.
5. **A hold drops and reconnects Charlie inside one Staff sentence.** "Not usually." was written as
   "Not" (50s) and "Usually." (62s), and Delta replayed the question in the gap, which is why the
   customer screen showed the opening question twice.
6. **Tapping a category does not fill the exact item list on the consumer site**, so a customer could
   not pick one item. The harness filled the list with the page's own function to keep going, which
   is why this reads as a harness note and is actually a real site fault.
7. **Words Staff say after a hold or a transfer are still thrown away.** Long-standing, unassigned,
   and it is behind several of the above.

## NOT BUGS — DO NOT RE-LITIGATE, THE OWNER HAS ALREADY RULED

- **The verdict tail sharing the check's last second is deliberate.** `receipt-store.ts` clamps the
  double-check, the verdict and the charge past the last row on the record so they can never draw
  before the goodbye that caused them. It reads as impossible on his sheet; that is a display job on
  the issue list, not a bug to chase.
- **The check sheet's ordering is locked** (owner, 08-05: commits c9088c2d, d8c8d188, f596c886,
  e8fdb257). It draws what it is handed. Fix the seconds, never the sort.

## THE ORDER OF WORK (owner's rule, 08-06 07:15)

1. **Fix where a spoken line gets its second** (fault 2). Until the clock is honest, nothing else can
   be judged.
2. **Fix the signoff marker** (fault 1). Until it stops firing early, no pass mark means anything.
3. **Only then, testing — TWO scenes per order, never a list.** Dial one, read its record, fix what
   broke, dial that SAME one again. Nothing else dials until it holds clean end to end.
4. **Push after every step.** The whole reason tonight cannot be reconstructed is that it was not
   pushed. A run that is not pushed did not happen.

**What went wrong with how this was run, so it is not repeated:** the full-send order said dial every
scene and report at the end. That is a survey, not a fix, so broken scenes were left behind and the
run kept going. The owner stopped it. Never hand out a list again.
