# The master test list — owner-approved cards (living record, 08-04)

Format (owner's, locked): **Headline** = category, colon, exactly what's tested, real number when
there is one. **Subhead** = one plain past-tense sentence saying what happened on the check.
**Bubble** = "this test proves that…", naming the exact status displayed by its real name. Never
"the record", never "the right status", never invented words. Statuses named are from Statuses.

## LOCKED by the owner

**Answer: clear yes** — Staff said they have the product in stock and we showed an In stock status.

**Answer: clear no** — Staff said they do not have the product in stock and we showed a Not in
stock status. Bubble: this test proves that a clear no always ends with a Not in stock status, no
matter how Staff choose to say the no.

**Answer: yes but vague** — Staff said yes without saying yes, like "we did, but it's not out
yet." Bubble: our reading understood the vague yes and we displayed an In stock status. This test
rotates a growing list of real vague yeses, and every new one from a real check gets added.

**Hold: silence** — Staff put us on a silent hold. Action: Charlie dropped on a silent hold,
reconnected when they came back, and we displayed the right status.

**Hold: permanently** — Staff put us on hold and never returned. Action: Charlie hung up at the
hold limit and we displayed a Left on hold status.

**Hungup: Staff** — Staff hung up on us before giving an answer and we showed a Staff hung up
status. Bubble: this test proves that when Staff hung up on us, the record shows they ended the
check, not us. ("Staff hung up" is a NEW status to add to Statuses — owner ruled it gets built.)

**Transfer: new person** — Staff transferred us, Charlie asked a question from the start and
recognized it was a new person.

**Hold: music** — Staff put us on hold with music and Charlie dropped until a person came back.
Bubble: this test proves that hold music stops Charlie's meter the same way silence does, and that
he reconnected when a person spoke to us again.

**Hold: phone down** — Staff set the phone on the counter and Charlie dropped until someone spoke
to us again. Bubble: this test proves that background store noise stops Charlie's meter the same
way silence does. Someone talking across the room is not someone talking to us.

**Hungup: 90 seconds of ringing** — The phone rang with nobody answering and we hung up at the
ring limit. Bubble: this test proves that after 90 seconds of ringing with no person, we ended the
check ourselves, the record shows it was us, and we displayed a Nobody answered status. Charlie
was never on and never billed.

**Hungup: 4 minute limit** — The check hit its 4 minute limit and we ended it. Bubble: this test
proves that a check can never run past the limit you set in Admin, we displayed an Admin hung up
status, and the customer was not charged for an answer we never got.

**Dropped:** the generic "Admin hung up" test (each Hungup test names itself; the status shows in
each). Owner: we test things that work, never bugs.

## STILL IN REVIEW (one at a time, owner approves each)
Transfer: Charlie requested (current) · Transfer: nobody available · Transfer: switch off ·
Voicemail: detected · Language: Spanish · Alert: email

## DECISIONS RIDING WITH THIS WORK
- **Delta plays the recording again after a transfer** (owner APPROVED 08-04): when the new person
  picks up, the recording asks again and Charlie stays off the line. Echo builds it. The
  "Transfer: Charlie requested" card tests this target behavior.
- Echo additions from this review: the signoff (answer in hand → thank and end) · never repeat a
  question · the ping crash after a dropped Charlie (bridge.ts 1157 emails) · the "Staff hung up"
  status · Delta replays after transfer.
- Comp rulings live in the PM chat 08-03/04: short test name no number, cost rows rolled up and
  tappable, no free items in cost, money in cents (5.3¢), charged/not charged is the LAST log
  step, stats pinned (total cost · total time · Charlie talked · gross profit vs the 67% floor),
  tests passed/failed counts, behavior section + transcript both collapsible, Check Log header +
  workflow name subhead as a tappable bubble (voice · personality · model · scripts), date
  timestamp, conversation lines inside the timeline collapsed with a small icon + seconds, no
  "part 2", status word from Statuses + "Decided by" line, mapper menu steps at the front
  expandable, alert email step, refund when our fault, second read as its own step with the model
  name in brackets. Boxes RAISED, not carved. Built from a render of the real Testing page.
