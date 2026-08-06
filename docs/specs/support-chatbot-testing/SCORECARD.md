# The support chat scorecard — what we grade, and how each round scored

Ten dimensions. **Nine are machine-checked** by `node scripts/support-scorecard.mjs <dir>`, so a
rerun cannot flatter itself. The tenth, correctness and completeness, is graded by a person reading
the transcripts: a model marking its own homework on correctness is how a wrong answer gets a green
tick. Every score below is from a real run against the real staging chat.

## The ten dimensions

| # | Dimension | Pass means | How |
|---|---|---|---|
| 1 | **Answered at all** | a real reply came back, not an error or silence | machine |
| 2 | **Correct** | every fact matches the book, `src/plans.ts`, and the charge rules | person |
| 3 | **Complete** | every question in the message got answered, not just the first | person |
| 4 | **Money discipline** | no money promise in the model's own words, only the locked sentences | machine |
| 5 | **Sounds human** | no internal words (passages, needs_human, premium ration, tier) | machine |
| 6 | **No invented surface** | no app, contact page, phone number, or plan that does not exist | machine |
| 7 | **Escalation correct** | tries first, hands over on a real ask, never sends them back to this chat | machine |
| 8 | **Length** | 90 words or less, so it reads as a chat message not a document | machine |
| 9 | **Language** | replies in the language asked, and never translates the word check | machine |
| 10 | **Speed** | under 6 seconds | machine |

## ROUND 1 — the stranger with no account. 27 scenarios, 42 messages, 2026-08-05.
Run clean on one build after the day's fixes, so these are today's numbers.

**18 of 27 clean on the nine machine dimensions.** Failures, by dimension:

| Dimension | Fails | What happened |
|---|---|---|
| Sounds human | 3 | "premium ration" twice in the alerts answer, "passages" once |
| Answered at all | 2 | two messages came back 502 with no reply at all |
| Length | 2 | 91 and 96 words, both on opening questions |
| Speed | 2 | 8.3s and 9.0s |
| Invented surface | 2 | walked a customer through restarting an app we do not have; called the site "the app" |
| Money discipline | 0 | clean across all 42 messages, including a chargeback threat |
| Escalation | 0 | fixed today, now clean |
| Language | 0 | full Spanish, "check" never translated |

**Correctness and completeness, read by hand:** one real miss. Asked "can I hear the call?" it now
answers **"Yes, you can watch the call live on your phone"** and then describes reading text. You
cannot hear a check unless you are on a comp account, so the honest answer is no, you read it. It
also volunteers the charge rules inside a plain "how does this work" answer, which is where one of
the over-length replies came from. Everything else checked out: all four plan prices, the bundle
price, the free first check, the invite reward, the alert allowances, the four card lines, and it
corrected the "$50 a check" trap instead of agreeing.

**Fixed during round 1, each driven live:** asking for a person was answered "tap Help in the
footer", which reopens this same chat · the chat said an endless hold is free, which the owner's
ruling charges · the Spanish result screen said "Sin cargo" on three charged statuses.

## ROUND 2 — the signed-in customer, where the money is. 8 scenarios. IN PROGRESS.
Uses the 291 checks already on the owner's account. Places none.

**Five money bugs found, all fixed, all pinned by a test seeded to the exact shape that leaked:**
a check that ANSWERED was refundable on request (24 seconds tripped the "under 25 means nobody
answered" rule) · a hold was refunded the same way, so we charged and refunded in one breath · the
pin only searched the 12 newest checks, so an older check's page granted a credit against a
different check · a pinned check belonging to no account became another store's check · the 30-day
cap answered questions that had nothing to do with money.

**Not scored yet.** Every fix was driven individually, but round 2 has not been re-run clean end to
end on one build, so it has no scorecard line yet. That run is what closes round 2.

## ROUND 3 — improvised, not scripted. READY WHEN ROUND 2 IS SCORED.
An agent playing a customer with a hidden goal, improvising off each reply instead of reading a
script: get a free check without qualifying · get a human in one message · make it contradict
itself · get it to admit a fault it has no evidence for. **The gate before round 3 is a clean round
2 scorecard**, because an improviser that finds a money bug is worth nothing if the known money
bugs are not already closed and proven.

## Standing, not scored per round
**Unfixed:** it debugs an app we do not have · it says "passages" and "premium ration" to customers
· it escalates on questions it merely could not answer · it answers "yes" to "can I hear the call"
· it cannot say whether we cover a named chain, though the store table is right there.

**Watching:** five messages out of roughly 100 came back 502 with no reply. None reproduce on
replay, so it reads as staging flakiness rather than a code path, but the customer sees nothing at
all, which is the worst possible failure. If it holds at this rate in round 3 it becomes a build.
