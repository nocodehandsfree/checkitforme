# The self-improving Charlie — a proposal, nothing built

**What this is.** A machine that runs test checks against the robot store on its own, reads each
one's record, and works toward your two numbers: every check at 67% gross profit or better and
Charlie talking 23 seconds or less, with every card still green. It is the same idea as the mapping
that heals itself (`src/calls/healing.ts`): first make it right, then make it cheap, one careful
step at a time, and you review a report instead of every check. This document proposes it. Nothing
here is built, and nothing gets built until you and the PM say so.

**Why it exists.** On test four the card said PASS while Charlie sat through seconds of dead air.
You caught it only by reading the transcript yourself. The card grades whether Charlie behaved; it
is blind to whether the check made money. So a wasteful check can pass forever and the only meter
reader is you.

---

## Part one: the grade learns to see waste

Today a test's card (`TEST_CARDS` in `src/calls/behaved.ts`) checks two things: the behavior rows
it names are green, and the status matches. The sheet's tiles up top already show the money — total
cost, total time, Charlie's talk seconds with your color rule, and profit against your 67% floor —
and the cost card already splits Charlie's seconds into Speaking, Listening and Waiting
(`charliePieces` in `src/calls/cost.ts`). But the pass/fail pill never reads any of it. That is the
whole hole: the numbers are on the page and the grade ignores them.

**The fix: the card gains a second half, the meter half.** Beside the behavior rows, the card reads
four numbers off the record the check already keeps, and any one of them out of bounds makes the
whole test a FAIL, in words that say why:

1. **Charlie's talk seconds** — over 23 is a fail. Measured off the same frames the cost card
   already uses for his Speaking line.
2. **Profit against the 67% floor** — under the floor is a fail. The same arithmetic the profit
   tile already does.
3. **Dead air before his turns** — the quiet between Staff finishing a line and Charlie starting
   his, added up across the check, off the timed record (`call_results.transcript_timed`). Over a
   number you set, it is a fail. This is the exact waste test four hid.
4. **His Waiting seconds** — the piece of his meter where nobody was saying anything, already
   split out on the cost card. Over a number you set, it is a fail.

**One ruling of yours has to move for this, and you should rule it knowingly.** On 08-07 you ruled
that nothing about money goes in the pass/fail rows: 23 seconds is a margin goal that lives on the
tile, never a test. That ban is asserted in `scripts/test-behaved.ts` and it stands — the behavior
rows stay money-free. The meter half is a separate block on the card, not new rows. But it does
turn your margin goal into something that can fail a test, which is the opposite of the 08-07
ruling, because the machine needs a grade it can act on with no human looking. Your call to make.

**Some scenes can never hold the two numbers, on purpose.** The runaround to the four minute limit
and Hold: permanently burn the clock by design, so grading them against 67% fails them forever. The
numbers ride the card the same way the status already does: every card defaults to your two, and
the handful of clock-burning cards carry their own honest bound, each one ruled by you.

## Part two: the machine, explained plainly

Mapping works in two gears: first it finds the right department, then it runs speed passes back
through the same menu, keeping what is faster and throwing back what is not. This machine is the
same two gears pointed at Charlie: first every card green, then the same checks cheaper. It is a
graph, not a loop — each step's result decides which step comes next, and the two outcomes a step
can produce (turn a number, or write it up for you) go down different roads.

**Before anything: the gates.** The machine runs only when you start it. Before every single dial
it asks the same gatekeeper every check already asks (`src/calls/check-life.ts`) whether a check is
in the air, and if one is — yours or anybody's — it waits. It spends from the robot store's 200
checks a day and stops dead when they are gone; it never decides to keep going. A stop stays
stopped, and its memory is saved after every step the way mapping saves its runs, so a restart
never re-dials blindly.

**Day zero: the baseline.** Dial each of the twenty tests once, grade each with the new card, and
dial two or three of them twice. The map this writes says which tests are green, which are
wasteful and by how much, and — from the doubled dials — how big the wobble is between two
identical checks. The wobble matters: checks 248 and 257 said the same words minutes apart and came
back with two different answers, so a machine that trusts one dial chases luck. No changes on day
zero. About 23 checks, about $1.50 to $3.

**Then the working gear, one scene at a time** (your 08-06 rule: never a survey):

1. **Pick the test with the biggest waste in money.** Not the first on the list — the one where
   the baseline says the most cents are leaking.
2. **Dial that one scene.** Read the record with `scripts/what-happened.mjs`, the one reader
   everything already uses. Grade it with the new card.
3. **The grade decides the road:**
   - **A behavior row or the status is red** → that is a bug, not a tuning problem. The machine
     writes it up for an engine agent, parks the test, and goes back to step 1. It never tries to
     tune its way around a broken behavior.
   - **Green but it misses your two numbers** → name the single biggest waste, then follow the
     change ladder below. If the waste answers to a number inside its rails, turn that ONE number
     ONE step. If it answers only to words, voice or money, write it up for you and go back to
     step 1.
4. **Dial the SAME scene again.** Keep the change only if the card is still green AND the waste
   shrank by more than the wobble. Otherwise put the number back exactly where it was. Repeat from
   step 2 until the test holds your two numbers or its rails are used up — used up means a write-up
   too, saying how close the rails got and what it would take.
5. **A kept change is provisional until the whole twenty run green with it in place.** One dial
   per test, rotating through each test's variants day by day so over a week every variant gets its
   turn. Any red in that sweep and the number goes back where it was, with a note naming which test
   it helped and which it broke. This is your hard rule and the machine cannot skip it: nothing
   survives that the twenty do not bless. A surviving change costs roughly 22 dials all in.
6. **The report.** Every dial, every turn of a number, every keep and revert with the before and
   after check numbers, every write-up, and the money spent — one page, on the Testing screen you
   already read (no new page or address; you name where it sits if not there). You review the
   report; the checks are all on the sheet if you want to look deeper.

**Honest expectation.** The first thing this machine finds will mostly be write-ups, not number
turns. Today's measured biggest waste — Echo taking about 3 seconds to finish writing Staff's words
after they stop talking, found on check 367 — answers to no Admin number. The machine's first
product is a ranked, priced list of exactly those, plus the safe number turns it can make itself.

## The change ladder — the hard rule

**It may change alone:** the five numbers in Admin ▸ App (Charlie wrap-up seconds · hold cap ·
ring wait · check length · silence before Charlie drops), each inside a fence you set once in
Admin: a floor, a ceiling, and a step size. Example: silence before Charlie drops may move between
3 and 8, one second at a time. The machine can never set a number outside its fence, and it turns
STAGING's numbers only — the real site's numbers stay yours, and the report tells you what won so
you carry it over when you choose.

**It may only write up for you:** Charlie's words (your locked instructions), his voice (the model
and speed you ruled by ear), anything about money (prices, what is charged, the 67% floor and the
23 themselves), and anything that needs code. A write-up says what the waste is, what it costs per
check, and what changing it would take.

## Bounds

- 200 robot checks a day, hard. It spends its allowance and stops.
- It never dials while your walk has a check in the air — it asks the gatekeeper before every dial.
- It runs only when you start it, and a stop stays stopped, across restarts.
- The first dial of every run must complete whole or the run stops (rule 15's harness already
  enforces this).
- It never dials a real store. Robot store only, forever.

## What it costs

A robot check runs about 5 to 13 cents. A full day at the 200 allowance is about $10 to $26; a
normal day is far less, because most of the machine's output is write-ups that cost one dial to
find. One change that survives all the way through the sweep costs about $1.50 to $3 of checks.
The build itself is wiring, not new architecture: the card's meter half, the fences in Admin, and
a runner script that walks the graph the way `robot-check.mjs` already dials — no new engine, no
new pages.

## The risks, named

1. **The coin flip.** Two identical dials can come back different (248 and 257). Answer: the
   grade's meter half runs on measured seconds, which barely wobble; a keep must beat the measured
   wobble; and the twenty-test sweep catches what slips through.
2. **The robot store says the same words every time.** A number tuned perfectly to the robot can
   be wrong for a slow-talking human. Your phone still owns the last mile, and nothing reaches the
   real site without you.
3. **A number that helps one test can hurt another.** Dropping Charlie faster saves pennies on
   holds and makes him choppy on a person who is just thinking — your own note in the record says
   too long costs pennies, too short costs whole checks. The sweep and the fence floors exist
   exactly for this.
4. **The grade grading itself.** If the meter half mis-measures, the machine tunes toward a lie.
   Its numbers come off the same record you read on the sheet, through the one reader, and every
   keep names its before-and-after check numbers, so any day of its work audits in one tap.
5. **The two numbers can fight.** Talking less can lose answers, and a lost answer costs a whole
   check. The card is the guard: a change that trades a green row for a cheaper check is reverted
   by the grade itself, with no human needed.

## How we will know it works (the contract, before any build)

1. A check where Charlie talks 24 seconds fails its test, by name, with no human looking.
2. A check under 67% profit fails its test the same way, on the cards you have not exempted.
3. Test four's dead-air check, replayed, reads FAIL under the new grade.
4. The machine refuses to dial while any check is in the air, proven with one in the air.
5. It stops at 200 and a stop survives a restart, proven the way mapping's resume is proven.
6. A number it turns never lands outside its fence, asserted by a test.
7. A change that breaks any of the twenty is reverted with the reason on the report.
8. Every write-up names the waste, the cost per check, and what fixing it needs.

## What you rule before anything is built

1. The 08-07 reversal: may the margin goal fail a test on the machine's card, rows staying
   money-free?
2. The two new rail numbers: dead air allowed per check, and Waiting seconds allowed.
3. The fences on the five Admin numbers: floor, ceiling, step for each.
4. Which cards are exempt from the 67% floor and what their honest bounds are.
5. Where the report lives (proposed: inside the existing Testing screen).
6. Whether one machine-run day may share a calendar day with your walk at all, or only run on
   days you are not walking.
