# The format for a test, and the tests written in it (08-06, owner's rulings)

A test card today says three things: its name, its subhead, and what the test proves in the info
bubble. All three describe CHARLIE. None of them says what Staff do, so when a check comes back wrong
nobody can tell whether Charlie misbehaved or the robot never gave him anything to behave about. That
is what got us stuck: a run of scenes where Staff went quiet after Charlie asked about the product
type and the set, and the tests read as Charlie's failure.

Every test is written in the format below from now on, and the owner approves them ONE AT A TIME.

## THE FORMAT

**Test N — <card name>** — the card's own name from `TEST_CARDS` (behaved.ts). Never the scene's name.

**Subhead** — the card's one line, what the test is.

**What Staff do** — plainly, in a sentence or two: do they answer straight away, hold, transfer, walk
off, hang up. Written from the store's side, never ours.

**Staff's exact words, in order** — every line the robot says, word for word, numbered, including the
greeting, plus what the robot does between lines (holds, rings, silences, hangs up). This is the part
that never existed before. It is the owner's approved copy and it is quoted, never paraphrased.

**What Charlie must do** — his side of the same conversation, in order.

**What we show the customer** — the status word, in the site's own words.

**What else to look for** — the things that could hide a fault even when the status is right: how long
Charlie speaks, who ended the check, whether the customer was charged, what shows on the sheet.

## THE OWNER'S RULINGS THAT CHANGE EXISTING CARDS (08-06)

1. **Every scene must have Staff answer.** The only exceptions are the tests that exist to watch
   Charlie when Staff walk away and never come back, or never pick up at all.
2. **Hungup: 4 minute limit is NOT a chatty Staff member.** It is our own safety net: if something
   goes wrong on a check, our system hangs up at four minutes. Charlie should never have been on a
   call that long, and the check that ran four minutes cost real money. The chatty person who talks
   forever and never answers (robot scene 13) is NOT this test and is not on the owner's list at all.
3. **The customer IS charged on the 4 minute limit test.** The card's info bubble says the customer
   was not charged. That is wrong and the wording has to change: we were on the phone that long, so
   the charge stands.
4. **Hungup: 90 seconds of ringing is the ring AFTER a transfer.** Staff move us on, the line rings,
   and nobody ever comes back. The test proves OUR system hangs up. What is built today (robot scene
   12) rings from the very first dial and nobody ever answers, which is a different test.
5. **Product: one exact item stays on the list.** It is the hobby section, hidden on staging and
   production today and launching later. Asking for one exact item is no different from asking
   whether they have Pokémon in; it is just more specific, and a customer picks it from the hobby
   section of the site.

## THE WORDS AFTER A HOLD: THE SCRIPTS ARE FINE, OUR SYSTEM LOSES THEM

The owner approved the copy and the copy IS in the scenes. Robot scene 5 says, word for word, "Okay,
thank you for holding. Yeah, I did not see any, unfortunately." Nothing is missing from the script.

What happens is ours: we only write down what is said while Charlie is switched on, and he is
switched off the moment Staff step away. Everything spoken as they come back is never written down,
so the record looks like Staff said nothing. Four tests carry it: Hold: silence (scenes 5 and 11),
Answer: yes but vague (scene 8), Transfer: new person (scene 14), Language: Spanish (scene 18). It
lives in the calling engine, in the frozen `src/voice/`, and it is its own job.

## TEST 1 — Answer: clear yes

**Subhead**
Staff said they have the product in stock and we showed an In stock status.

**What Staff do**
They answer the phone themselves, straight away. No menu, no hold, no transfer, nobody walking off.
They give a short plain yes, they name the set when Charlie asks which one, and then they stay on the
line quietly and wait for us to say goodbye instead of putting the phone down the moment the words
are out. That last part matters: a store that hangs up instantly would hide it if Charlie never
signed off.

**Staff's exact words, in order**
1. "Larry Vasquez, how can I help you?"
2. "Yeah."
3. "Uh yeah, it's the Pitch Black booster boxes."
Then they hold the line in silence for about forty seconds, and hang up if nobody says anything.

**What Charlie must do**
Delta's recording asks the stock question once, the moment they finish their greeting. Charlie's very
first words are the follow-up asking which set, never the stock question again in any wording. He
takes their answer, and because it is a yes he does not ask when more are coming in. He thanks them,
says goodbye, and ends the check himself.

**What we show the customer**
In stock.

**What else to look for**
Charlie speaks 23 seconds or less across the whole check · we ended the check, the store never hung
up on us · the customer is charged · the set from their own answer, Pitch Black booster boxes, shows
on the check · the sheet's rows are in the order the check really happened.
