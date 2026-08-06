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

## THE THREE HOLES IN THIS LIST, FILLED (owner approved 08-06)

**Test 10, the 4 minute limit, the actual words.** A chatty Staff member who never answers. Between
each line the robot waits for Charlie, so this stretches naturally past the limit. Charlie's own
wrap-up counts only HIS talking, so he stays under it while Staff run the clock.
1. "Oh, Pokemon cards, yeah. We get a ton of calls about those, honestly."
2. "You know my nephew collects them. He's got a whole binder, must be hundreds."
3. "There was a guy in here last week, bought like twenty packs at once. Twenty."
4. "It's been nuts since all the trading card stuff took off again, I'll tell you that."
5. "We used to only carry the sports ones, back when I started here."
6. "Anyway, what was it you were after? Sorry, it's been one of those days."
7. "Right, right. Hang on, my manager's waving at me about something."
8. "Sorry about that. Where were we? Busy in here today."
Repeat 6 to 8 until the 4 minute limit ends the check. Expect Admin hung up, not charged.

**Test 14, transfer switch off, the safety line.** After "That's the front, I can't see those from
back here", Charlie should take it and wrap up. If he says anything more, the robot answers once:
"Yeah, sorry, I really can't help you with that from back here."
Then the robot waits out and hangs up as usual.

**NEW CARD, test 18: one exact product** (the owner's ruling 08-06, this arrives with hobby stores).
On a check for one exact product, Charlie has an extra question no test has ever run: he asks once,
warmly, "do you have a Pitch Black booster box in stock?" Nothing today covers that path.
Scene: greeting, the recording asks, Staff: "Uh, Pokemon, yeah, we've got some stuff." (deliberately
unclear about the exact product) · Charlie asks the exact product question · Staff: "Oh, the Pitch
Black boxes? Yeah, we've got a couple of those." Expect In stock.
The point is that a general yes is NOT a yes on this kind of check, only the exact item is.

## THE OWNER'S CLIP PICKS AND ONE MORE HOLD TEST (08-06)

**Store noise: he picked BOTH.** File 1 (shopping mall, quieter) and file 2 (busy restaurant,
louder). Two runs of the phone-on-the-counter test, one per recording, because the two volumes are
themselves the test. Source: archive.org `aporee_46344_52645` (Public Domain Mark) and
`aporee_14156_16488` (CC BY-SA 3.0). Both free to modify, so the quiet-voice version is allowed.

**Hold music: two, both approved.** Twilio's `classic.mp3` and `ClockworkWaltz.mp3`. The waltz was
picked on purpose because it starts quiet and gets louder, which tests whether a rising sound is
ever mistaken for a person coming back.

**NEW, test 19: hold music with an advertisement in it.** The owner's own case: real stores play
music and then a recorded voice selling something, then more music. A recorded VOICE during a hold
is the dangerous one, because it is the closest thing to Staff coming back that is not Staff.
NO MIXING NEEDED. The robot plays these in order, which it can already do one piece at a time:
1. Staff: "Sure, let me check on that for you, one moment."
2. Hold music, 5 seconds.
3. A recorded advertising voice, NOT the Staff voice: "Thanks for holding. Did you know we price
   match any local competitor? Ask an associate about our rewards program and start earning points
   on every purchase today."
4. Hold music, 5 more seconds.
5. Staff, back for real: "Yeah, we've got some in."
6. Charlie asks the set. Staff: "The Pitch Black boxes."
Expect In stock. WHAT IT PROVES: Charlie stays dropped through the advertisement and never answers
it, the meter stays stopped the whole time, and the advertisement's words never reach the record as
something Staff said to us.
