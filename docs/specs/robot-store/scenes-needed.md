# The 17 tests, the scene each one needs, and what is missing (PM, 2026-08-06)

The owner's 17 locked cards are `docs/specs/charlie-behavior/testing-cards.md`. Sixteen are voice;
the last one (the alert email) is not a robot scene at all. THE SCENE NUMBER IS NOT THE TEST NUMBER:
one card can have several scenes (the clear no has three), and nine cards have no scene at all.

**Today: 8 of 17 cards have a scene. Six of those scenes cannot pass** — each stops one turn too
early, so Charlie asks his follow-up into silence and the check dies with no goodbye. A human at a
real store always says something back.

## THE SIX THAT EXIST BUT CANNOT PASS — one line each fixes them

| Scene | Card | Ends on | What Charlie asks next | Missing line to add |
|---|---|---|---|---|
| 2 | Answer: clear no | "We did not." | when more are coming | "Uh, probably Tuesday, that's when the truck comes." |
| 3 | Answer: clear no | "No, I'm sorry. I haven't seen any yet." | when more are coming | "Not sure, honestly. Soon, I'd think." |
| 4 | Answer: clear no | "No, we don't have any this, this shipment." | when more are coming | "I really don't know, they don't tell us." |
| 5 | Hold: silence | "…Yeah, I did not see any, unfortunately." | when more are coming | "Uh, next week maybe? I'm not certain." |
| 8 | Answer: yes but vague | "Yeah, we've got a few." | the set name and type | "Uh, the Pitch Black boxes I think." |
| 10 | Transfer: Charlie requested | "We did not." (second voice) | when more are coming | "Thursdays, usually." (second voice) |

Three different shapes on purpose: a real day, a vague "soon", and an honest "I don't know". The
card says whatever Staff answer is the answer, even "soon", so all three must be proven.

## THE NINE CARDS WITH NO SCENE AT ALL

**Hold: music** — Staff: "Let me check, hold on a sec." · hold music 15 seconds · "Yeah, we've got
some in." · Charlie asks the set · "It's the Pitch Black boxes." Expect In stock.
NEW ABILITY: playing music. Use the phone company's own free hold music file.
FAILS TODAY: nothing can play music, so this test cannot run at all.

**Hold: phone down** — Staff: "Hold on, let me go look." · busy store noise 15 seconds · "Yeah,
we've got a couple." · Charlie asks the set · "I think they're the Pitch Black ones." Expect In stock.
NEW ABILITY: a busy-store recording, volume set on purpose below the Staff voice. Run it twice: once
with plain noise, once with a quiet voice mixed in that is plainly aimed at somebody else.
FAILS TODAY: no such recording exists.

**Hungup: 90 seconds of ringing** — the robot never answers. Ring 95 seconds. Expect Nobody answered.
NEW ABILITY: the robot refusing to pick up.
FAILS TODAY: the robot always answers, so we have never tested our own ring give-up.

**Hungup: 4 minute limit** — Staff greet, then talk past the answer without ever giving one until the
check hits the 4 minute limit and we end it. Expect Admin hung up, and the customer NOT charged.
COST WARNING: this is the most expensive test on the list, about four times a normal check.
FAILS TODAY: no scene runs long enough to reach the limit.

**Transfer: new person** — Staff transfer us WITHOUT being asked. "Oh, one sec, let me grab someone."
· ringing 6 seconds · second voice: "This is Maria, what can I do for you?" · the recording asks again
· "Yeah, we've got some." · Charlie asks the set · "The Pitch Black boxes." Expect In stock.
FAILS TODAY: the only transfer scene is the one where Charlie ASKS. Nobody has tested a store moving
us on its own, which is the common one.

**Transfer: nobody available** — greeting names the wrong department · "Oh, that's not us, that's the
front." · Charlie asks to be put through · "There's nobody up there right now, sorry." Charlie thanks
them and ends without nagging. Expect Too busy to check.
FAILS TODAY: no scene, and Too busy to check has never been produced by a test.

**Transfer: switch off** — the Admin switch for asking to be put through is OFF for this run. Same
wrong department greeting · "That's the front, I can't see those from back here." Charlie must NEVER
bring up being transferred, takes what he can get and wraps up.
FAILS TODAY: no scene, and the switch has never been proven to actually work.

**Voicemail: detected** — a recorded greeting answers: "You've reached MVP's. We're not able to take
your call right now. Please leave a message after the tone." · beep. We hang up at once, Charlie
never comes on and is never billed. Expect Got their voicemail.
FAILS TODAY: no scene. This is the one where a wrong call costs us a whole recorded message.

**Language: Spanish** — greeting in Spanish · Staff answer in Spanish: "Sí, tenemos algunos." ·
Charlie asks the set in Spanish · "Son las cajas de Pitch Black." Charlie holds the whole
conversation in Spanish and the Spanish answer sets the status. Expect In stock.
FAILS TODAY: no scene, and no check has ever run in Spanish end to end.

**Alert: email** — NOT a robot scene. It is scene 1 run against a store the owner has an alert on,
then proving one email really arrived. Needs its own kind of test, not a script.
FAILS TODAY: nothing proves the email.

## WHAT THIS COSTS
Six lines added to existing scenes are nearly free. The nine new scenes are about 6 to 9 cents a
check, except the 4 minute limit which is roughly four times that. One full pass of all of them,
once, is well under a dollar.
