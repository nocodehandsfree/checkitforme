# SUPPORT — checkpoint (current state)

> System: the customer-chat support agent (site panel + `src/support/`), the credit machine, RAG over
> the book, and its model training. `src/voice/` is FROZEN; store data is DD's lane; the book is read-only.
> Charter: `handoff.md` + `SUPPORT-MANUAL.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## LAW — money words are deterministic EN/ES strings
The model is FORBIDDEN from promising credits. Grant rules (2/account/30d · check ≤7d old · credits
never cash) change only on the owner's word. Money words are never model-authored (stripped behind a wall).

## 2026-08-05/06 — the robot customer (support-chat testing, owner-ordered)
- **Built:** `robot-support.mjs` (round 1, anonymous, 27 scenarios), `robot-support-signed.mjs`
  (round 2, signed in, uses checks that ALREADY EXIST, places none), `support-scorecard.mjs` (ten
  points per test, eight machine-checked). Docs: `docs/specs/support-chatbot-testing/`.
- **Round 1: 265/270, 22 of 27 perfect, ZERO blank replies in 43 messages** (was 250/270 with 15
  perfect and 4 blanks). Money discipline, escalation, language and length all perfect.
- **FIXED + shipped, each driven on staging, not claimed:**
  1. **The human ask (worst find).** "Let me talk to a real person" answered "tap Help in the
     footer", which reopens this same chat, and the hand over never fired. `HUMAN_ASK` now reads the
     customer's own words before any rung and a person is offered on the FIRST ask; the two-strike
     burial stays for OUR failures only.
  2. **The hold answer (money), closed end to end.** Charge rules sit in the chat's always-true block
     and OUTRANK any passage; SIX book pages corrected on `v1.0` (owner's go — the worst was the
     verdict table's yellow row reading "No charge" for the bucket holding hold/too busy/language).
     Driven in both languages: a hold answers charged, nobody answered stays free.
  3. **Spanish result screen** said "Sin cargo" on three charged statuses. Fixed (unlock flow).
- **Book vs ReadMe drift is a known trap:** the agent reads ReadMe, ReadMe syncs from `v1.0` on its
  own clock, so a reindex in that window re-teaches the stale page. `?source=repo` is the way out,
  and a reindex now writes first and prunes after, so a failed one cannot leave the agent empty.
- **Reply engine for the chat:** checker-only recommended. Not built, owner's call.
- **Round 2: 77/80, 5 of 8 perfect** (signed in, against checks ALREADY on the owner's account,
  places none). Blank replies were the top defect, 4 of 43: nothing in the chat had a time limit and
  the edge cuts a request at ~15s, so one slow lookup ate the budget and the customer saw silence.
  ONE deadline for the whole reply fixed it, zero blanks since. Coverage now comes from the store
  table (`src/support/stores.ts`), counted in SQL, chain-level only, never a branch.
- **Still open:** a check the customer CANCELLED themselves answers "this one needs a person"
  instead of saying they stopped it and were not charged (round 2 test 8). Round 3, the improvised
  customer, has no harness and no score.
- **OWNER RULINGS WANTED:** `SHORT_CALL_SECS = 25` (credits.ts) was written by an agent 08-01 and
  never approved, and `CACHE_MIN = 0.92` (ladder.ts) is unapproved too. Separately, he says GameStop
  should not be callable while the store table serves 1186 of them as callable and ready, so the
  chat says yes. `docs/tasks/support-knows-the-stores.md`.

## How charging vs crediting works (07-22, use for any check_issue question)
- **Charge:** ONE credit on a definitive answer (`src/calls/service.ts:616`), AND on engaged-but-no
  answer (left on hold, too busy, language barrier, staff hung up). Truly dead calls (no answer, bad
  number, voicemail, busy) stay no-charge. `billableOutcome()` is the truth; the chat mirrors it.
- **Auto-refund (BAD_KEYS):** a CHARGED check showing nobody_answered / voicemail / busy /
  bad_number / closed / failed / admin_hangup (or <25s) → +1 credit back. The charged-anyway family
  (hold, too busy, language, staff hung up, a real two-way that stayed unclear) NEVER auto-refunds.
- 07-22 Barnes & Noble fix, live: a chat off a check's page pins to THAT check, store matching
  ranks by token count, loop-break after 2 unresolved asks, `not_charged` explains itself.

## OPEN / blockers
- **Owner offer standing:** walk a REAL credit through his Fun store end to end. Not done.
  **Parked:** one-tap "run it again" INSIDE the chat.
- **Promote wanted:** chat origin stamping (source/pageUrl/checkId), live + driven on staging.
- Site chats vs Admin DB split: staging is `/data/local.db`, read via `/api/support/chats`; prod
  Admin reads its own. Discord bot dark until the owner's token; flip `SUPPORT_MODEL_BIG` when
  funded. One qdrant is shared by prod+staging+api.
