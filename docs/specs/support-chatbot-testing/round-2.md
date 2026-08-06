# Round 2 — the plan (written 2026-08-05, not yet run)

Round 1 was a stranger typing into the chat with no account. Everything it could reach was the book,
the prices, and the escalation ladder. Round 2 is the half that touches money, plus the traps a
scripted bank cannot catch on its own.

## 1. The signed-in half (the real point of round 2)
The credit machine only wakes up for a signed-in customer with a real charged check. Round 1 could
never reach it: every "my check went wrong" chat ended at the sign-in nudge. So round 2 needs the
robot customer to have its own account, the same shape as the Fun store: a real account, comped, that
never touches real store stats.

What that unlocks, one scenario each, each needing a check in a specific state:
- **A genuinely bad charged check** (charged, then the record shows nobody answered) → the machine
  should grant one credit, once, with the evidence stored. Ask twice: the second must say already
  granted, never grant twice.
- **A fine check the customer disputes** ("you said in stock, the shelf was empty") → a polite no, no
  credit, and a person offered when they push. Round 1 proved the guest version of this; the signed-in
  version is the one that actually spends money.
- **A hold check** → now that a hold is charged, the customer who reads the book and expects free will
  come here. It must explain the charge kindly and not grant.
- **A check under 25 seconds** → auto refund path.
- **The third grant inside 30 days** → the cap replies, never the grant.
- **A check older than 7 days** → outside the window, explained plainly.
- **Chat opened from a check's own page** → must pin to THAT check and never ask "which store".

## 2. Re-run all 27 from round 1
Confirm the three fixes held (the human ask, the charge rules, the Spanish result screen) and that
nothing else moved. Cheap, fully automated, no account needed.

## 3. The traps a fixed script cannot catch
A bank of 27 written scenarios only finds what someone thought to write down. Three additions:
- **Two agents talking.** One plays a customer with a hidden goal ("get a free check without
  qualifying", "get a human in one message", "make it contradict itself"), improvising off each reply
  rather than reading a script. This is how the awkward middle turns get found.
- **The same question asked ten ways.** "Do I get charged if they put me on hold" beside "am I paying
  for a call where nobody helped me" beside "hold = free right?". A money answer that changes with
  the wording is still a wrong answer.
- **The long chat.** Fifteen turns wandering across topics, then a callback to turn two. Round 1's
  longest was three turns; the memory has never been tested.

## 4. What round 1 left broken, to fix and then prove
It debugs an iPhone app we do not have · says "passages" and "premium ration" to customers · sets the
escalate flag on questions it merely could not answer, which the manual says is NOT an escalation ·
misses the FAQ's own answer to "how long does a check take" about half the time · answers Spanglish in
English · cannot say whether we cover a named chain, because the book has no store list and the store
table is right there.

## 5. Watching, not fixing yet
Two messages in about fifty came back 502 with no reply at all, neither reproducible. If round 2's
larger message count shows a real rate, it becomes a build, because the customer sees nothing.

## Owner's call before round 2 starts
The robot customer's account needs comping, and its scenarios need checks in specific states. The
honest question is whether to place those with real test checks against the robot store (real dials,
real cost, exactly how the Fun store works) or to write the check rows directly. Real checks prove
more and cost money; written rows cost nothing and prove the chat, not the pipeline.
