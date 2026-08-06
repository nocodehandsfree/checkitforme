# Support chatbot testing — the robot customer

**The scores live in `SCORECARD.md`.** This file is only how the harness works and why the
scenarios are what they are.

**What this is:** the support chat's twin of the robot store. A scripted customer runs real
conversations against the REAL staging chat (`/pub/support/chat`) so bugs are caught by a machine
before the owner ever reads a bad transcript. Owner ordered it 2026-08-05. Nothing in a run is fake
except the customer typing: real ladder, real models, real staging database rows.

## The three pieces
- `scripts/robot-support.mjs` — round 1, anonymous, 27 scenarios (`--list` prints the bank).
- `scripts/robot-support-signed.mjs` — round 2, signed in, opens the chat from checks that ALREADY
  EXIST on the account. It places no calls: 291 were already sitting there in every state needed.
  The admin token is used only to look up which existing check is in which state, never to chat.
- `scripts/support-scorecard.mjs` — grades the saved transcripts, ten points per test. `--md` prints
  the table that goes in `SCORECARD.md`.

Pacing is law: the site allows 10 chat messages a minute per address, so the harnesses send one
every 7 seconds. A throttled reply read as a bug would waste a whole round.

## Why these scenarios
The bank covers the reasons people actually open a support chat, mapped to Check:
- **Pre-sales trust** (biggest at launch): how it works, is it a scam, what does it cost, coverage.
- **Using it:** how long a check takes, charge rules, alerts, login, Spanish.
- **Something went wrong:** wrong verdict, stuck check, double charge — the credit-machine lanes.
- **Money pressure:** free-check angling, credit demands, chargeback threats, injection attacks.
- **Break tests:** fake features and plans, contact-page bait, gibberish, rambling, multi-question
  messages, wrong-fact traps ("so it's $50 a check right?"), bot identity, abuse, off-topic.
- **The human ask:** plain, in Spanish, and after a good answer — the one a model talks itself out of.

## The loop, each round until launch-clean
Run the bank → score it (`support-scorecard.mjs`, and re-read correctness into `human-grades.json`)
→ fix: code fails to the support system, knowledge gaps to Admin ▸ Support Teach (owner-verified
wording FIRST, because a bad teach poisons every environment), book gaps to branch `v1.0` on the
owner's go → rerun the SAME scenarios to prove the fix → add a scenario for every bug found, seeded
to the shape that leaked.

## Owner decision still open
**The reply engine for the chat.** Recommendation delivered 08-05: use it as a checker that rewrites
only failing replies (small fast model, money words untouched, every number surviving exactly).
Not built, waiting on his call.
