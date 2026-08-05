# Support chatbot testing — the robot customer

**What this is:** the support chat's twin of the robot store. A scripted customer runs real
conversations against the REAL staging chat (`/pub/support/chat`) so bugs are caught by a machine
before the owner ever reads a bad transcript. Owner ordered it 2026-08-05. Harness:
`scripts/robot-support.mjs` (run `--list` to see the bank). Nothing in the run is fake except the
customer typing: real ladder, real models, real staging database rows.

## Why these scenarios (the research)
The bank covers the reasons people actually open a support chat, mapped to Check:
- **Pre-sales trust** (biggest at launch): how it works, is it a scam, what does it cost, coverage.
- **Using it:** how long a check takes, charge rules, alerts, login, Spanish.
- **Something went wrong:** wrong verdict, stuck check, double charge — the credit-machine lanes.
- **Money pressure:** free-check angling, credit demands, chargeback threats, injection attacks.
- **Break tests:** fake features/plans, no-contact-page bait, gibberish, rambling, multi-question
  messages, wrong-fact traps ("so it's $50 a check right?"), bot identity, abuse, off-topic.

## The rubric (grade every reply against these)
1. **Facts right** — vs the book/FAQ, `src/plans.ts` (prices), and the credit rules in
   `docs/team/support/checkpoint.md`. A "right" answer from a stale book is still a finding.
2. **Sounds human** — plain friend voice per the copy guide. Internal words ("passages"), dev
   phrasing, or debugging features we do not have are fails.
3. **Money discipline** — no model-authored promise of credits or free anything, ever. Deterministic
   money strings only (the wall in `src/support/ladder.ts`).
4. **Escalation timing** — genuinely tries first; human only on explicit ask or a real account
   action; loop-break after 2 failed answers. Too early AND too stubborn are both fails.
5. **No invented surfaces** — pages, buttons, apps, plans that do not exist.
6. **Language** — full ES replies; "check" never translated.
7. **Follow-ups** — remembers the conversation; consistent turn to turn.

## The loop (each round, until launch-clean)
Run the bank → grade transcripts (`round-N.md`) → fix: code fails to the support system, knowledge
gaps to Admin ▸ Support Teach (owner-verified wording FIRST — a bad teach poisons every
environment), book gaps to a PM note (the book is Copper's, read-only here) → rerun the SAME
scenarios to prove the fix → add new break scenarios each round.

## Not built yet (owner decisions pending, 08-05)
- **Signed-in scenarios:** credits on a real charged check need the robot customer's own account
  (Fun-store pattern: flagged, never in real stats). Not started.
- **Scenarios 17–24** of round 1 (human-now, angry, multi-question, ES, rambler, wrong-fact trap):
  paused mid-run by the owner.
- **The reply engine for the chat:** recommendation delivered 08-05 — use it as a checker that
  rewrites only failing replies (small fast model, money words untouched, numbers must survive
  exactly). Waiting on the owner's call. DO NOT BUILD until he decides.
