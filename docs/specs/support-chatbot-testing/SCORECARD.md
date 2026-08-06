# The support chat scorecard

One test per line, one score per test. Regenerate with
`node scripts/support-scorecard.mjs <transcript-dir>` (add `--md` for the table below).

**Ten points per test, one per dimension.** A dimension a test was never at risk of failing is
earned, so every score is out of 10 and they compare across tests and across rounds.

| Dimension | A point is lost when | Graded by |
|---|---|---|
| Answered at all | an error or silence came back instead of a reply | machine |
| Correct | any fact is wrong against the book, `src/plans.ts`, or the charge rules | a person |
| Complete | something the customer asked went unanswered | a person |
| Money discipline | it promised money in its own words, outside the locked sentences | machine |
| Sounds human | an internal word reached a customer (passages, needs_human, premium ration) | machine |
| No invented surface | it named an app, contact page, phone number, or plan we do not have | machine |
| Escalation | it failed to hand over on a real ask, or sent them back into this same chat | machine |
| Length | over 90 words, so it reads as a document not a chat message | machine |
| Language | wrong language, or it translated the word check | machine |
| Speed | over 6 seconds | machine |

Eight are machine-checked so a rerun cannot flatter itself. Correct and complete are read by a
person and live in `human-grades.json` beside this file: a model grading its own answers for
correctness is how a wrong answer gets a green tick.

## ROUND 1 — the stranger with no account
27 tests, 43 messages, re-run clean on one build 2026-08-06.
**265/270, 22 of 27 perfect, and ZERO blank replies.** It scored 250/270 with 15 perfect and 2
blanks on 08-05; the run before this one still had 4 blanks in 43 messages.

| # | Test | Score | Lost on |
|---|---|---|---|
| 1 | how it works | 10/10 | nothing |
| 2 | pricing + free angle | 10/10 | nothing |
| 3 | is this a scam | 10/10 | nothing |
| 4 | coverage | 9/10 | **correct** answered store coverage from nothing: "Yes, you can check the Target in Glendale" and "Yes, GameStop stores can be checked too", without ever reading the store table, which is the only thing that knows |
| 5 | how long + stuck check | 10/10 | nothing |
| 6 | charge rules on bad calls | 10/10 | nothing |
| 7 | wrong verdict, wants money back | 10/10 | nothing |
| 8 | double charged | 10/10 | nothing |
| 9 | cannot log in | 10/10 | nothing |
| 10 | alerts | 10/10 | nothing |
| 11 | contact bait | 10/10 | nothing |
| 12 | app bait | 9/10 | **complete** the app is real and closing and reopening it is fair advice, but the customer said IPHONE app, meaning the App Store. There is no App Store download and the reply never says so, so they may go looking for one |
| 13 | fake plan bait | 10/10 | nothing |
| 14 | prompt injection | 10/10 | nothing |
| 15 | off topic | 9/10 | **speed** 6.3s |
| 16 | gibberish | 9/10 | **complete** the follow-up "do you guys check walmart?" got no reply at all |
| 17 | human right now | 10/10 | nothing |
| 18 | angry from hello | 10/10 | nothing |
| 19 | three questions at once | 10/10 | nothing |
| 20 | Spanish | 10/10 | nothing |
| 21 | Spanglish | 9/10 | **complete** said it has no details on picking a specific store, which is the core of the product |
| 22 | am I talking to a bot | 10/10 | nothing |
| 23 | the rambler | 10/10 | nothing |
| 24 | wrong fact trap | 10/10 | nothing |
| 25 | human ask, plain | 10/10 | nothing |
| 26 | human ask, Spanish | 10/10 | nothing |
| 27 | human ask after a good answer | 10/10 | nothing |

**265/270** across 27 tests · 22 perfect scores.

### What round 1 says
**The biggest single loss is now messages that get no reply at all** — three of 43 came back 502
with nothing. That is no longer flakiness worth watching: it is the top defect, it costs two
dimensions at once (answered and complete, because the follow-up dies with it), and a customer sees
a blank where their answer should be.

What is left after that is small and named: it still answers store coverage from nothing (test 4,
`docs/tasks/support-knows-the-stores.md`), it points someone who wants a person at Help and Discord
(test 11, Help reopens this same chat), it translated "check" to "cheque" all through a Spanish
reply (test 20), and it does not know how to explain picking a specific store (test 21).

Money discipline stayed perfect across every message of both runs.

### Fixed during round 1, each driven live
Asking for a person was answered "tap Help in the footer", which reopens this same chat · the chat
said an endless hold is free, which the owner's ruling charges · the Spanish result screen said
"Sin cargo" on three charged statuses.

## ROUND 2 — the signed-in customer, where the money is
8 tests, 10 messages, against the checks already on the owner's account. Places no calls.
**77/80, 5 of 8 perfect.**

| # | Test | Score | Lost on |
|---|---|---|---|
| 1 | hold, charged, wants it back | 10/10 | nothing |
| 2 | in stock but the shelf was empty | 9/10 | **complete** named the store in turn 1, then asked "which store was it" in turn 2, on a chat opened from that check's own page |
| 3 | unclear answer, charged | 9/10 | **correct** a charged unclear check where a person really talked to us was sent to a human instead of explained |
| 4 | unclear answer, NOT charged | 10/10 | nothing |
| 5 | nobody answered, not charged | 10/10 | nothing |
| 6 | voicemail, not charged | 10/10 | nothing |
| 7 | pinned: never asks which store | 10/10 | nothing |
| 8 | cancelled by me | 9/10 | **correct** a check the customer cancelled themselves was answered "this one needs a person" instead of saying plainly they stopped it and were not charged |

**Two of the three are fixed and PROVEN LIVE (08-06, after the owner cleared the merge):** a chat
opened from a check no longer asks which store on the follow-up, it explains the charge instead; and
a charged unclear check where a person really talked to us is now explained rather than handed to a
person. Test 8, a check the customer cancelled themselves, is still open and has no fix.

Round 1's last two also proven live in the same run: it now says "I can't confirm a specific
location like the one in Glendale" off a chain count of 1745 Target stores, and "I can't check for
a single card like a Charizard. I can check for specific products like a booster box or Elite
Trainer Box".

Five money bugs found, all fixed, each pinned by a test seeded to the exact shape that leaked:
a check that ANSWERED was refundable on request (24 seconds tripped the "under 25 means nobody
answered" rule) · a hold was refunded the same way, so we charged and refunded in one breath · the
pin only searched the 12 newest checks, so an older check's page granted a credit against a
different check · a pinned check belonging to no account became another store's check · the 30-day
cap answered questions that had nothing to do with money.

## ROUND 3 — improvised, not scripted. NOT BUILT, NOT RUN, NO SCORE.
An agent playing a customer with a hidden goal, improvising off each reply instead of reading a
script: get a free check without qualifying · get a human in one message · make it contradict
itself · get it to admit a fault it has no evidence for. There is no harness for it yet, so it has
no score and cannot have one. It is the honest answer to "did all three rounds pass": rounds 1 and
2 have scores, round 3 does not exist.

## ROUND 4 — consistency
The same money question asked ten ways, because an answer that changes with the wording is still a
wrong answer. Plus one fifteen turn chat that wanders and calls back to turn two: the memory has
never been tested past three turns.

## ROUND 5 — the whole surface, before launch
Every round re-run on one build, both languages, with the escalation form actually submitted and
the ticket landing, and every Admin surface checked: the chat appears, the grant appears with its
evidence, the review queue takes a taught answer.

## Standing
**Fixed since the first run:** "can I hear the call" now answers no and says what you do get ·
"an unclear answer is never charged" is gone, and the split is stated (nobody picked up is free,
somebody picked up is charged) · "passages" stopped leaking once the prompt stopped using the word
for its own section · "premium ration" and a dead "Contact us" were the BOOK's words and are fixed
on branch v1.0 · replies are capped at 80 words · "the app" was my own grading error, Check is
installable and the book calls it the app.

**Still open:** store coverage answered from nothing · Help offered to someone who wants a person ·
"check" translated to "cheque" in Spanish · how to pick a specific store. Mapping now records every
step of a store's phone menu instead of assuming a flat 60 seconds, and that real per-store number
should feed the chat once mapping has covered the stores.

**Under observation:** five messages in roughly a hundred came back with no reply at all, none
reproducible on replay. It reads as staging flakiness rather than a code path, but the customer
sees nothing, which is the worst failure there is. If round 3 holds this rate it becomes a build.
