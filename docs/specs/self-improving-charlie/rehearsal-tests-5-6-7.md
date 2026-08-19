# Rehearsal insurance for tests five, six and seven — the first real find

**The PM's idea 1, run 08-18 while Echo was dialing. No phone, no money, no merge.**

All three of those tests are HOLD tests, and a hold only arms when the engine hears Staff announce
they are stepping away (`saidGoingToCheck`, src/voice/prompts.ts). If the announcement is missed,
the hold never arms, Charlie's meter runs through the whole wait, and the test fails on money the
way check 386 did on 08-18.

So instead of guessing at conversations, I ran **123 real ways a person announces a wait through
the engine's own matcher**. It is a pure function, so this is the real code answering, not my
opinion, and it cost nothing.

## THE RESULT: 58 caught, 65 MISSED

The misses are not exotic. They include the plainest phrases a store uses:

- **The bare hold family (biggest risk to test five, hold with music):** "Please hold." · "Hold
  please." · "Please hold for a moment." · "Can you hold?" · "Could you hold a moment." · "Would
  you mind holding?" · "Do you mind holding for a second?" · "If you can hold a second." · "If you
  don't mind holding." · "Placing you on hold." · "I'll put you on a brief hold." · "Hold the line
  please." · "Hold that thought." · "Stay on the line." · "Hang tight."
  Music almost always follows one of these, so a missed one is a whole music hold billed.
- **The phone-down family (test six, the rooms):** "I'm setting the phone down." · "Setting the
  phone down a moment." · "Putting the phone down for a sec." · "I'm putting you down for a
  second." · "Let me set this down." Only the exact 08-18 wording is known today.
- **Present tense, already going:** "I'm checking." · "I'm looking now." · "I'm walking over now."
  · "I'm heading to the back now." · "I'm going to walk over there."
- **Look, without check/see:** "Let me take a look." · "Let me have a look." · "I'll take a look."
- **Short counts:** "Two seconds." · "Give me two seconds." · "Give me a couple seconds." · "Sec."
  · "Gimme a sec." · "A moment please." · "Allow me a moment."
- **Ask and find, without let-me-ask:** "I'll ask my coworker." · "I need to ask someone." · "I'll
  go ask." · "Let me run and ask." · "I'll find out." · "I'll go find out." · "Let me get someone
  for you." · "Let me find somebody who knows."
- **Verify and make sure:** "Let me verify that." · "Let me confirm that for you." · "Let me make
  sure." · "I'll make sure for you." · "I'll need a minute to check." · "It'll take me a second to
  look."
- **Walk and run:** "Let me walk over and look." · "I have to walk to the front." · "I'll run and
  look." · "Let me run to the back real quick." · "Let me duck in the back." · "I'll go grab one."

## WHAT IT COSTS US

Every miss is a wait Charlie bills through. On check 386 one missed wording cost 20 seconds of his
meter on a single check. At his rate that is about 3.7 cents each time, and on a hold test it also
fails the sheet.

## THE PROPOSED FIX — owner's approval first, then one real dial to prove it

Widen `GOING_TO_CHECK` to cover the seven families above. It is words, never the ear (§10), and the
same phrase family the finalizer reads, so both move together. NOT APPLIED: the guard rail is that
nothing from the simulation side touches the calling engine until the owner approves it and one
real dial proves it.

Re-running these 123 lines is the proof it worked, and it takes a second and costs nothing.
