# The master test list — ALL 16 CARDS LOCKED BY THE OWNER (08-04)

Format (owner's law): **Headline** = category, colon, exactly what's tested, real number when there
is one. **Subhead** = one plain past-tense sentence saying what happened on the check. **Bubble** =
"this test proves that…", naming the exact status displayed by its real name from Statuses. Never
"the record", never "the right status", never invented words. We test things that WORK, never bugs.

**Answer: clear yes** — Staff said they have the product in stock and we showed an In stock status.

**Answer: clear no** — Staff said they do not have the product in stock and we showed a Not in
stock status. Bubble: this test proves that a clear no always ends with a Not in stock status, no
matter how Staff choose to say the no.

**Answer: yes but vague** — Staff said yes without saying yes, like "we did, but it's not out
yet." Bubble: our reading understood the vague yes and we displayed an In stock status. This test
rotates a growing list of real vague yeses, and every new one from a real check gets added.
(The list lives with the robot store's script; Charlie and the readings never read it.)

**Hold: silence** — Staff put us on a silent hold. Action: Charlie dropped on a silent hold,
reconnected when they came back, and we displayed the right status.

**Hold: permanently** — Staff put us on hold and never returned. Action: Charlie hung up at the
hold limit and we displayed a Left on hold status.

**Hold: music** — Staff put us on hold with music and Charlie dropped until a person came back.
Bubble: this test proves that hold music stops Charlie's meter the same way silence does, and that
he reconnected when a person spoke to us again.

**Hold: phone down** — Staff set the phone on the counter and Charlie dropped until someone spoke
to us again. Bubble: this test proves that background store noise stops Charlie's meter the same
way silence does. Someone talking across the room is not someone talking to us.

**Hungup: Staff** — Staff hung up on us before giving an answer and we showed a Staff hung up
status. Bubble: this test proves that when Staff hung up on us, the record shows they ended the
check, not us. ("Staff hung up" is a NEW status to add to Statuses — owner ruled it gets built.)

**Hungup: 90 seconds of ringing** — The phone rang with nobody answering and we hung up at the
ring limit. Bubble: this test proves that after 90 seconds of ringing with no person, we ended the
check ourselves, the record shows it was us, and we displayed a Nobody answered status. Charlie
was never on and never billed.

**Hungup: 4 minute limit** — The check hit its 4 minute limit and we ended it. Bubble: this test
proves that a check can never run past the limit you set in Admin, we displayed an Admin hung up
status, and the customer was not charged for an answer we never got.

**Transfer: new person** — Staff transferred us, Charlie asked a question from the start and
recognized it was a new person.

**Transfer: Charlie requested** — Charlie reached a wrong department and asked to be put through.
Bubble: this test proves that Charlie recognized the wrong department and asked to be transferred.
When the new person picked up, Delta played the recording, and Charlie came back only after Staff
answered it, to ask his follow-up.

**Transfer: nobody available** — Charlie asked to be put through and Staff said there was nobody
available. Bubble: this test proves that Charlie thanked them and ended the check without nagging,
and we displayed a Too busy to check status.

**Transfer: switch off** — The Admin switch for asking to be transferred was off and Charlie did
not ask. Bubble: this test proves the switch really works. Charlie never brought up being
transferred and took whatever answer Staff could give. If Staff transfer us anyway, the check
rides it as normal. This test checks the switch only, not a status.

**Voicemail: detected** — A machine answered and our system ended the check. Bubble: this test
proves that we hung up the moment the voicemail was detected, Charlie was never on and never
billed, and we displayed a Got their voicemail status.

**Language: Spanish** — Staff spoke Spanish and Charlie held the entire conversation in Spanish.
Bubble: this test proves that Charlie never switched to English mid check, and the answer Staff
gave in Spanish set the status.

**Alert: email** — The check landed In stock at a store a customer watches and an in stock email
was sent. Bubble: this test proves that in stock email alerts work for a store the customer has
subscribed to.

**Dropped:** the generic "Admin hung up" test (each Hungup card names itself and its status).

## ENGINE WORK THESE CARDS REQUIRE (Echo's list, owner-approved)
- The signoff: answer in hand → thank them and end the check.
- Never ask the same question twice; ask about the missing part once, in different words.
- **Delta plays the recording again after a transfer** and Charlie stays off the line until Staff
  answer it (owner: "Echo absolutely needs to build this").
- The "Staff hung up" status added to Statuses.
- The ping crash after a dropped Charlie (the uncaughtException email, bridge.ts ~1157).
- Both Charlies same words on every update (BUILT, verified live 08-03).

## FINAL RULINGS 08-04 (these override anything above where they differ)
- Cost buckets, his names: **Bravo (Menu Nav) · Foxtrot (Phone Line) · Echo (Listening) · Charlie
  (Talking) · Status (Verification)**. Rates come from the real pricing code, never typed in.
  Charlie's line covers voice and thinking together. Delta is free per check, so no Delta line.
- Charlie talked tile: **green at 23s or under · yellow 24 to 30 · red 31 and up**.
- Colors: words stay white; only markers carry color. Gray = machinery (Staff back after a hold is
  machinery). Green = a Staff greeting (the speech icon itself goes green). Yellow = waiting.
  Red only on a bad final status.
- The sheet covers 96% of the screen. Detail rows under a cost line: copy left, dotted line,
  number right. Only passed and failed pills at the top, no unused pill.
- The built screen LIVES IN public/app.html already (checkV2Html + MOCK_CHECK_V2, opened by
  /testing#mockcheck). Echo wires it to real records and deletes nothing visual.

## COMP RULINGS (the Testing screen, built from a render of the REAL page)
Short test name, no number, never wraps two lines · headline/subhead/bubble per the format above ·
cost rows rolled up, tap to expand details, no free items listed, money in cents (5.3¢) ·
charged / not charged is the LAST step of Check Log · stats pinned on top, RAISED boxes: total
cost · total time · Charlie talked · gross profit vs the 67% floor · tests passed and failed
counts · behavior rows (Used / Unused / Broken) and the conversation each collapsible ·
Check Log is one long box with a header row, workflow name as a tappable bubble under it (voice ·
personality · model · scripts rotating), date timestamp · conversation lines sit inside the
timeline under their step, collapsed, small lucide icon, with seconds · no "part 2" wording ·
the status word comes from Statuses with a "Decided by" line under it quoting Staff's words ·
the second read is its own step before the status, model name in brackets · mapper's menu steps
show at the front of Check Log, expandable · the alert email shows as a step when it fired ·
a refund shows when a failure was ours.
