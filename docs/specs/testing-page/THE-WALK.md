# The walk: every test, one at a time (08-07)

Twenty tests. We dial ONE, you open its check on Admin, Voice, Testing and say pass or fail, and
nothing else dials until you have. A test is not done until it has been dialed, fixed, and dialed
again clean.

Each test below says what Staff do, what you should see, and which rows on the Charlie behavior
card have to be green. A row a check never put to the test is not drawn at all, so every row you
can see is one that counts.

Every hold ends in a real answer and a real status, because Staff come back and answer. Hold:
permanently is the only one where nobody ever comes back.

## 1. Answer: clear yes

Staff said they have the product in stock and we showed an In stock status.

**What it proves.** This test proves that a plain yes ends with an In stock status, and that the set Staff named is the one on the check.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 1` — scene 1 (Yes, plainly)

**Status it must come back with.** In stock

**Rows that must be green.** Handed to Charlie · The question played as a recording · Charlie warmed up in time · Charlie wrapped up · Charlie ended the check

## 2. Answer: clear no

Staff said they do not have the product in stock and we showed a Not in stock status.

**What it proves.** This test proves that a clear no always ends with a Not in stock status, no matter how Staff choose to say the no.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 2` — scene 2 (No, plainly) · scene 3 (No, softened) · scene 4 (No, this shipment)

**Status it must come back with.** Not in stock

**Rows that must be green.** Handed to Charlie · The question played as a recording · Charlie warmed up in time · Charlie wrapped up · Charlie ended the check

## 3. Answer: yes but vague

Staff said yes without saying yes, like "we did, but it's not out yet."

**What it proves.** Our reading understood the vague yes and we displayed an In stock status. This test rotates a growing list of real vague yeses, and every new one from a real check gets added.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 7` — scene 7 (The yes hidden inside a no) · scene 8 (The no that turns into a maybe)

**Status it must come back with.** In stock

**Rows that must be green.** Handed to Charlie · The question played as a recording · Charlie warmed up in time · Charlie wrapped up · Charlie ended the check

## 4. Hold: silence

Staff put us on a silent hold.

**What it proves.** Charlie dropped on a silent hold, reconnected when they came back, and we displayed the right status.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 5` — scene 5 (Walks away, comes back) · scene 11 (Walks away, comes back asking if we are there)

**Status it must come back with.** Not in stock

**Rows that must be green.** Handed to Charlie · The question played as a recording · Meter stopped · Charlie wrapped up · Charlie ended the check

## 5. Hold: music

Staff put us on hold with music and Charlie dropped until a person came back.

**What it proves.** This test proves that hold music stops Charlie's meter the same way silence does, and that he reconnected when a person spoke to us again.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 20` — scene 20 (Hold with music, then an answer) · scene 21 (Hold with music that swells, then an answer) · scene 22 (Hold with an advert in the music, then an answer)

**Status it must come back with.** In stock

**Rows that must be green.** Handed to Charlie · The question played as a recording · Meter stopped · Charlie wrapped up · Charlie ended the check

## 6. Hold: phone down

Staff set the phone on the counter and Charlie dropped until someone spoke to us again.

**What it proves.** This test proves that background store noise stops Charlie's meter the same way silence does. Someone talking across the room is not someone talking to us.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 23` — scene 23 (Phone on the counter, quieter room) · scene 24 (Phone on the counter, louder room)

**Status it must come back with.** In stock

**Rows that must be green.** Handed to Charlie · The question played as a recording · Meter stopped · Charlie wrapped up · Charlie ended the check

## 7. Hold: permanently

Staff put us on hold and never returned.

**What it proves.** Charlie hung up at the hold limit and we displayed a Left on hold status.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 6` — scene 6 (Walks away, never comes back)

**Status it must come back with.** Left on hold

**Rows that must be green.** Handed to Charlie · The question played as a recording · Meter stopped

## 8. Transfer: new person

Staff transferred us, Charlie asked a question from the start and recognized it was a new person.

**What it proves.** This test proves that when a store moves us on without being asked, Delta plays the recording again for the new person and Charlie carries on from their answer instead of starting over.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 14` — scene 14 (Moved on without being asked)

**Status it must come back with.** In stock

**Rows that must be green.** Handed to Charlie · The question played as a recording · Meter stopped · Reacted to a new person · Charlie wrapped up · Charlie ended the check

## 9. Transfer: Charlie requested

Charlie reached a wrong department and asked to be put through.

**What it proves.** This test proves that Charlie recognized the wrong department and asked to be transferred. When the new person picked up, Delta played the recording, and Charlie came back only after Staff answered it, to ask his follow-up.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 10` — scene 10 (Wrong department, then transfers)

**Status it must come back with.** Not in stock

**Rows that must be green.** Handed to Charlie · The question played as a recording · Asked to be transferred · Meter stopped · Reacted to a new person · Charlie wrapped up · Charlie ended the check

## 10. Transfer: nobody available

Charlie asked to be put through and Staff said there was nobody available.

**What it proves.** This test proves that Charlie thanked them and ended the check without nagging, and we displayed a Too busy to check status.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 15` — scene 15 (Nobody up front to take it)

**Status it must come back with.** Too busy to check

**Rows that must be green.** Handed to Charlie · The question played as a recording · Asked to be transferred · Said goodbye when told no · Charlie wrapped up · Charlie ended the check

## 11. Transfer: switch off

The Admin switch for asking to be transferred was off and Charlie did not ask.

**What it proves.** This test proves the switch really works. Charlie never brought up being transferred and took whatever answer Staff could give. If Staff transfer us anyway, the check rides it as normal. This test checks the switch only, not a status.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 16` — scene 16 (Wrong department, asking switched off)

**Status it must come back with.** None. This test does not judge a status.

**Rows that must be green.** Handed to Charlie · The question played as a recording · Charlie wrapped up · Charlie ended the check

## 12. Hungup: Staff

Staff hung up on us before giving an answer and we showed a Staff hung up status.

**What it proves.** This test proves that when Staff hung up on us, the record shows they ended the check, not us.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 9` — scene 9 (Cannot hear us, gives up)

**Status it must come back with.** Staff hung up

**Rows that must be green.** 

## 13. Hungup: 90 seconds of ringing

The phone rang with nobody answering and we hung up at the ring limit.

**What it proves.** This test proves that after 90 seconds of ringing with no person, we ended the check ourselves, the record shows it was us, and we displayed a Nobody answered status. Charlie was never on and never billed.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 12` — scene 12 (Transferred to a desk that only rings)

**Status it must come back with.** Nobody answered

**Rows that must be green.** 

## 14. Wrapup: they never answered

Staff rambled and would not give us an answer, so Charlie wrapped up and ended the check.

**What it proves.** This test proves that once Charlie has been talking for the time set in Admin, he asks the question one more time, takes whatever he gets, and ends the check himself.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 13` — scene 13 (Talks past the answer, forever)

**Status it must come back with.** No clear answer

**Rows that must be green.** Handed to Charlie · The question played as a recording · Charlie warmed up in time · Charlie wrapped up · Charlie ended the check

## 15. Hungup: 4 minute limit

The check hit its 4 minute limit and we ended it.

**What it proves.** This test proves that a check can never run past the limit you set in Admin, we displayed an Admin hung up status, and the customer was charged, because we really were on the phone that long.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 26` — scene 26 (The runaround, until the four minute limit)

**Status it must come back with.** Admin hung up

**Rows that must be green.** 

## 16. Voicemail: detected

A machine answered and our system ended the check.

**What it proves.** This test proves that we hung up the moment the voicemail was detected, Charlie was never on and never billed, and we displayed a Got their voicemail status.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 17` — scene 17 (Their answering machine picks up)

**Status it must come back with.** Got their voicemail

**Rows that must be green.** 

## 17. Language: Spanish

Staff spoke Spanish and Charlie held the entire conversation in Spanish.

**What it proves.** This test proves that Charlie never switched to English mid check, and the answer Staff gave in Spanish set the status.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 18` — scene 18 (Staff speak Spanish)

**Status it must come back with.** In stock

**Rows that must be green.** Handed to Charlie · The question played as a recording · Spoke their language · Charlie wrapped up · Charlie ended the check

## 18. Product: one exact item

The check asked for one exact product and Charlie asked about that item by name.

**What it proves.** This test proves that a general yes about the category is not an In stock status on this kind of check. Only Staff confirming the exact item is.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 19` — scene 19 (A general yes is not the exact product)

**Status it must come back with.** In stock

**Rows that must be green.** Handed to Charlie · The question played as a recording · Charlie warmed up in time · Charlie wrapped up · Charlie ended the check

## 19. Delta: failed

Delta failed to ask about the product, so Charlie asked it himself.

**What it proves.** This test proves Charlie will ask the store the first question if Delta fails.

**How to dial it.** `ADMIN_TOKEN=… node scripts/robot-check.mjs 25` — scene 25 (Delta never played, Charlie asks it himself)

**Status it must come back with.** In stock

**Rows that must be green.** Handed to Charlie · Charlie warmed up in time · Charlie wrapped up · Charlie ended the check

## 20. Alert: email

The check landed In stock at a store a customer watches and an in stock email was sent.

**What it proves.** This test proves that in stock email alerts work for a store the customer has subscribed to.

**How to dial it.** Not a robot scene. It is test 1 run against a store you have an alert on, and the email arriving is the test.

**Status it must come back with.** In stock

**Rows that must be green.** Handed to Charlie · The question played as a recording · Charlie warmed up in time · Charlie wrapped up · Charlie ended the check

