# The self-improving Charlie — a proposal, nothing built

**What this is.** A machine that runs test checks against the robot store on its own, reads each
one's record, and works toward your two numbers: every check at 67% gross profit or better and
Charlie talking 23 seconds or less, with every card still green. It is the same idea as the mapping
that heals itself (`src/calls/healing.ts`): first make it right, then make it cheap, one careful
step at a time, and you review a report instead of every check. This document proposes it. Nothing
here is built, and nothing gets built until you and the PM say so.

**What this engine is really for (the owner's frame, 08-16).** Today the product asks one question
about trading cards. The engine is not about cards: it is walking a menu, waiting without paying,
talking a human toward a goal, and squeezing every wasted second out against a benchmark. The
owner's end state: a customer names any business and any goal in plain words ("call the airline,
move my two tickets to the 8:10 flight, add a bag"), hands over what the call needs, and Charlie
does the whole thing. Every piece of this plan is built so nothing in it knows or cares that
today's question is about cards.

**Why it exists.** On test four the card said PASS while Charlie sat through seconds of dead air.
You caught it only by reading the transcript yourself. It happened again on 08-16: a check ran 43
seconds of meter with 9 seconds of Charlie on the clock and not answering, and every card was
green. The card grades whether Charlie behaved; it is blind to whether the check made money. So a wasteful check can pass forever and the only meter
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

**The grade covers every piece, not only Charlie (owner, 08-16).** Echo's writing delay (how long
after Staff stop talking their words land written), whether Delta played, and the nav time each get
their own bound on the card, so a check that fails because Echo was slow says Echo by name instead
of blaming Charlie, and a wasteful menu walk shows as nav, not talk.

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

**It may build on staging, never promote (owner widened this 08-16):** a fix that needs code. The
diagnosis becomes a work order, an agent session builds it on staging, proves it on the robot
store against the twenty, and it waits for your promote.

**It may only write up for you:** Charlie's words (your locked instructions), his voice (the model
and speed you ruled by ear), and anything about money (prices, what is charged, the 67% floor and
the 23 themselves). A write-up says what the waste is, what it costs per check, and what changing
it would take.

## Bounds

- 200 robot checks a day, hard. It spends its allowance and stops.
- It never dials while your walk has a check in the air — it asks the gatekeeper before every dial.
- It runs only when you start it, and a stop stays stopped, across restarts.
- The first dial of every run must complete whole or the run stops (rule 15's harness already
  enforces this).
- It never dials a real store. Robot store only, forever.

## The safety ladder (owner's questions, 08-16 — how it earns running unsupervised)

**It cannot think ahead, by design.** The machine holds no plan. It is only ever one dial deep: it
saves its state after every step, the record of the last check decides the next step, and a stop
stays stopped. There is no long chain of reasoning that can wander off.

**The try budget.** A scene gets three changes per run (you rule the number). If it still misses
your two numbers after three, the scene is parked with a write-up naming what was tried, what each
try changed, and why it stopped. Three parked scenes in a row end the whole run. Stuck never loops.

**The trust ladder, four stages, you climb it:**
1. **The grade only.** Every check, robot or real, carries the meter half and you read it. No
   machine yet. This stage alone catches a check like the 43 second one with no human digging.
2. **Dials but changes nothing.** The machine runs the graph and grades, and every change it wants
   is a proposal you approve one by one. You are checking its judgment against your own.
3. **Turns numbers inside fences alone.** You read the report at the end of every run, and you
   start every run anyway.
4. **Unsupervised inside the bounds**, only after enough clean runs at stage three where its
   grades caught everything you would have caught. You rule how many clean runs buy this.

## The simulation ladder: three rungs, and the genes of a call (owner, 08-16)

**Your twenty stay locked.** The walk's tests keep their owner-approved words and owner-approved
clips, unchanged. They are the regression gate everything must pass.

**Rung one: pure simulation, no partners at all.** A conversation played out entirely in our own
compute: one AI plays Staff in a chosen mood, another plays Charlie with his words and his rules,
and the whole call is scored on turns, words, seconds and money against the benchmark for that
kind of call. No phone line, no voice partner, no transcriber. Fractions of a cent each, thousands
a day. What it can prove: our words, our decisions, our timing rules. What it can NEVER prove: the
phone plumbing and the partners' hearing. We have been burned exactly there: the goodbye passed
the rig and three live checks in a row never spoke it (08-04, checks 276 to 278, RULES.md 14). A
rung-one win is a candidate, never a proof.

**Rung two: the rig** (already built). The real engine code on a pretend phone line. Proves our
plumbing: what we buffer, when Charlie opens, what gets recorded.

**Rung three: the robot store**, the test store we built that answers its own phone. The real
partners, a real dial, the real record. The only rung where "proven" may be said, inside the 200 a
day. A real store is never dialed.

**What rung one costs (owner asked 08-16, refined same day).** No new bill to start. The talking
is Anthropic compute and runs inside the $200 a month Max account the owner already pays for, the
same way his agent chats run today; one generation can play out a whole pretend call, both voices,
so thousands fit in a day. The data is not bought: free public collections of real recorded calls
and transcripts exist on the internet and we start there.

**The simulation gets a usage unit, measured, never guessed (owner, 08-16).** Exactly the way the
check got its cost card: ONE simulation = one pretend call played out plus its grade. The build's
FIRST step runs 100 of them on the smallest model that can do the job, reads the account's weekly
usage bar before and after, and locks the measured number into this plan as "1,000 simulations =
N% of the weekly all-models limit." No percent is stated before that batch runs; a guessed number
here is how a surprise credit bill happens. Guardrails, tied to usage the way he asked:
- The machine reads the same usage meter his phone shows before every batch and refuses to start
  one when the all-models bar is past a line he sets (proposed: 60%), so his builder agents always
  have room.
- Paid credits are never touched: the brake is the plan's own limits, not the credit card. Credits
  covering overflow is a decision only he can make, per batch, never a default.
- Simulations run on the smaller models, never Fable, so the Fable bar his builder chats draw on
  stays untouched.
- If simulation ever needs more than the plan can give, the overflow path is pay per use on the
  key staging already holds (`BRAIN_API_KEY`), a fraction of a cent per pretend call, and the
  numbers come back to the owner before that switch is flipped.

**The genes of a call.** Real calls that already exist on the internet get broken down into genes,
the behaviors that make calls what they are: Staff pissed off, the caller pissed off, a caller who
talks about family and never gets to the point, calls that keep getting hung up on, a sixteen year
old who can barely be heard. Each gene gets a measured frequency, how often it shows up in real
calls, so we test what actually happens instead of what we imagine. Scenes are composed from
genes, and every major kind of call gets a BENCHMARK: the fewest seconds and cents a perfect run
can take while Staff and the customer both have a good experience. A clear yes runs 23 seconds of
talk today and its floor is likely near 17, the length of the words themselves. The card then
grades distance to the benchmark, not only pass or fail. We write our own scenes from what the
genes teach, never replaying someone else's audio as ours.

## The words Echo listens with (its own small build, fed by this one)

Staff say CVS and the record writes CS; they say Barnes and Noble and the record writes Francis
Noble. Each check can hand Echo a short list of the words that matter at that store (the store's
name, the chain, the product words) so it leans toward hearing them right, and a correction layer
fixes what the CUSTOMER sees while the written record stays exactly as heard, your standing rule.
The list grows on its own: when a check's record shows a wrong word where a name on that list
belongs, the wrong form joins that store's list so it is corrected next time. This is its own
small build; the machine feeds it by catching the checks where a misheard word changed the answer.

## Every customer check self-improves (owner ruled 08-16: not a side feed, THE loop)

The machine never experiments mid-call on a paying customer. But every single customer check joins
the loop the moment it ends:

1. **Graded automatically**, the same card as the tests: the two numbers, every behavior row, and
   every piece by name (Charlie, Echo, Delta, the menu walk), against your goals.
2. **A check that fails or wastes is diagnosed on its own** and filed in Admin under Calls with
   what went wrong in plain words, so the bad ones are waiting for you in one place instead of
   hiding in the pile.
3. **The system builds the fix.** A number inside its fence it turns itself on staging. A fix that
   needs code becomes a work order an agent session builds on staging, proves on the robot store
   against the twenty, and leaves ready. Charlie's words, his voice, and anything about money
   still only reach you as write-ups.
4. **You push to production.** Nothing reaches the real site on its own. The owner named
   fix-it-and-push-straight-to-production as a someday; it is written here as a switch that does
   not exist yet and stays off until he asks for it.

A real check whose shape no scene covers also becomes a drafted shape for the simulation bank, so
the scene list grows from what actually happens on phones, not from imagination.

## The money brake (owner APPROVED 08-16: "the money brake numbers are fine")

The 200 is a ceiling, not a right. The machine EARNS its dials:
- It starts at 20 real dials a day and steps up (50, then 100, then 200, you bless the ladder)
  only while it is making progress: a kept improvement or a new confirmed find inside the last
  step's dials.
- A day that ends with no kept win and no new find STOPS the machine, and it does not dial the
  next day on its own. It comes back to you with the specific questions it is stuck on, because
  your questions are what get it moving again. Stuck never burns money.
- The try budget stands underneath: three changes per scene, three set-aside scenes end the run.
- Rung-one simulation is not braked the same way: it costs compute, not dials, and its daily
  budget is its own number you set.

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
7. The try budget: how many changes a scene gets before it is parked (proposed: three).
8. How many clean stage-three runs buy stage four of the trust ladder.
9. Whether the words Echo listens with is part of this build or its own box.
10. The daily cap on pretend calls (proposed: 1,000; no new dollars, it rides the Max account),
    and how many simulated scenes may take real dials out of the 200.
11. Confirm the widened ladder: the machine may build code fixes on staging from its own
    diagnosis, with words, voice, money and every promote still yours.
12. APPROVED 08-16: the money brake's ladder (20, 50, 100, 200) and the stop rule (a day with no
    kept win and no new find stops the machine until the owner answers its questions).
13. DEFERRED 08-16, owner's call: the first benchmarks wait until the floors are computed as part
    of the build (the clear yes near 17 seconds is the first candidate).
