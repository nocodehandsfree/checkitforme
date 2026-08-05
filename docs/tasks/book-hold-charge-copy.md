# The book still promises a free check on a hold — the exact words to replace

**System:** support (words are the book's lane) · **Status:** ready to paste, needs the owner's go
**Why:** the owner's 07-22 ruling (extended 08-04) charges for left on hold, too busy to check, a
language barrier, and staff hanging up — a person burned real minutes. Three pages of the book still
tell customers those are free, and the support chat learned the promise from them. Found 08-05 by the
robot customer (`scripts/robot-support.mjs`, scenario 6): the chat told a customer "If they leave you
on hold forever, it's free. Your balance is untouched."

**Where these words live:** branch `v1.0`, which syncs live to the customer docs at readme.io. That
sync publishes to customers the moment it lands, so the owner says go before it is pushed. Everything
else in this find is already fixed and shipped (the chat's own charge rules, the Spanish result
screen) — this file is only the book half.

---
## 1. `docs/Plans & Billing/no-answer-no-charge.md`

**Now:**
> Everything else is free, automatically. Nobody answered. The line was busy. Endless hold. Staff too slammed to check. A bad number. The store turned out closed. The answer wasn't clear. You keep your check, every time.

**Replace with:**
> Everything else is free, automatically. Nobody answered. The line was busy. A bad number. The store turned out closed. The call broke on our end. You keep your check, every time.
>
> One line to be straight about: if a real person picks up and spends their time on us, that check is charged, even when we walk away without an answer. Left on hold. Too slammed to check. We couldn't understand each other. They hung up on us. Someone at that store really did stop what they were doing for you, and we pay for their minutes either way.

**Also now:**
> A check only costs you something when the call ends in a definitive answer: a clear in stock, not in, sold out, or doesn't carry it.

**Replace with:**
> A check costs you something when the call ends in a definitive answer: a clear in stock, not in, sold out, or doesn't carry it. It also costs you when a real person engaged and burned their time without landing on an answer.

**The pull quote "You pay for answers, not attempts." must go** — it is the exact promise we break.
**Replace with:** "You pay when a person picks up. Never when nobody does."

---
## 2. `docs/Help/call-got-no-answer.md`

**Now:**
> First thing to know: **it cost you nothing.** No answer, busy line, endless hold, voicemail, a store that turned out closed: all free, automatically. Your balance is untouched and the result says "No charge for this one".

**Replace with:**
> First thing to know: **if nobody picked up, it cost you nothing.** No answer, busy line, voicemail, a bad number, a store that turned out closed: all free, automatically. Your balance is untouched.
>
> An endless hold is the one that does cost a check. Somebody answered and went to look, so their time was real even though the line dropped before they came back.

The opening line "someone parks us on hold forever" stays — it is true and it is why the page exists.

---
## 3. `docs/Help/common-questions.md`

**Now (question 4):**
> **4. What if nobody answers?**
> It's free. No answer, busy line, endless hold, closed store: you keep your check, every time.

**Replace with:**
> **4. What if nobody answers?**
> It's free. No answer, busy line, bad number, closed store: you keep your check, every time. If a person did pick up and go look, that one counts, even if the line dropped on hold.

---
## Done when
The three pages read as above on readme.io, and `node scripts/robot-support.mjs 6` shows the chat
telling a customer a hold is charged. The chat already answers correctly without this (its own charge
rules outrank the book), so this is about what a customer reads for themselves.
