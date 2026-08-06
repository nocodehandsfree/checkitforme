# SUPPORT — checkpoint (current state)

> System: the customer-chat support agent (site panel + `src/support/`), the credit machine, RAG over
> the book, and its model training. `src/voice/` is FROZEN; store data is DD's lane; the book is read-only.
> Charter: `handoff.md` + `SUPPORT-MANUAL.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## LAW — money words are deterministic EN/ES strings
The model is FORBIDDEN from promising credits. Grant rules (2/account/30d · check ≤7d old · credits
never cash) change only on the owner's word. Money words are never model-authored (stripped behind a wall).

## 2026-08-05 — the robot customer (support-chat testing, owner-ordered)
- **Built:** three scripts — `robot-support.mjs` (round 1, anonymous, 27 scenarios),
  `robot-support-signed.mjs` (round 2, signed in, uses checks that ALREADY EXIST, places none),
  `support-scorecard.mjs` (ten points per test, eight machine-checked). Everything in
  `docs/specs/support-chatbot-testing/`: README is how it works, SCORECARD is the scores.
- **Round 1 scored 250/270, 15 tests perfect.** Money discipline, escalation and language perfect
  across 42 messages including a chargeback threat and an injection attempt. Weakest is correctness.
- **FIXED + shipped, each driven on staging, not claimed:**
  1. **The human ask (worst find).** "Let me talk to a real person" answered "tap Help in the
     footer" — Help IS this chat — and needs_human never fired, so the form never appeared. Now
     `HUMAN_ASK` (exported, unit-tested both ways) reads the customer's own words before any rung,
     `humanAsk` rides to the widget, and the person is offered on the FIRST ask. The two-strike
     burial stays for OUR failures only.
  2. **The hold answer (money), closed end to end.** Charge rules sit in the chat's always-true block
     and OUTRANK any passage; SIX book pages corrected on `v1.0` (owner's go — the worst was the
     verdict table's yellow row reading "No charge" for the bucket holding left on hold, too busy,
     language barrier); reindexed with `?source=repo` because ReadMe had not synced. Driven in both
     languages: a hold answers charged, nobody answered stays free.
  3. **The Spanish result screen** said "Sin cargo" on three charged statuses. Fixed (unlock flow).
- **Book vs ReadMe drift is a known trap:** the agent reads ReadMe, ReadMe syncs from `v1.0` on its
  own clock, so a reindex in that window re-teaches the stale page. `?source=repo` is the way out.
- **Reply engine for the chat:** checker-only recommended (small fast model, rewrites only fails,
  numbers survive exactly, money words untouched). Not built, owner's call.
- **Next: score round 2** (clean re-run on one build); round 3 waits on it. Unfixed: an app we do
  not have gets debugged, "passages" and "premium ration" reach customers, an unclear-but-charged
  call was called free, and store coverage is answered from nothing — the agent never reads the
  store table, so it said "yes we check the Target in Glendale" and "yes, GameStop stores can be
  checked too". Owner says GameStop should not be callable while the store table serves it as
  callable+ready: HIS CALL, and it decides the chat's answer. `docs/tasks/support-knows-the-stores.md`.

## How charging vs crediting works (07-22, use for any check_issue question)
- **Charge:** ONE credit on a definitive answer (`src/calls/service.ts:616`), AND on engaged-but-no
  answer (left on hold, too busy, language barrier, staff hung up). Truly dead calls (no answer, bad
  number, voicemail, busy) stay no-charge. `billableOutcome()` is the truth; the chat mirrors it.
- **Auto-refund (BAD_KEYS):** a CHARGED check showing nobody_answered / voicemail / busy /
  bad_number / closed / failed / admin_hangup (or <25s) → +1 credit back. The charged-anyway family
  (hold, too busy, language, staff hung up) NEVER auto-refunds — human ticket / Admin grant only.
- **Verify a credit:** Admin ▸ Support ▸ "Auto-credits" → grant + evidence; balance +1.
- 07-22 Barnes & Noble fix, live: a chat opened off a check's page pins to THAT check, store
  matching ranks by token count, loop-break after 2 unresolved asks, `not_charged` explains itself.

## OPEN / blockers
- **Owner offer standing:** walk a REAL credit through his Fun store end-to-end. Not done.
  **Parked:** one-tap "run it again" INSIDE the chat. Not started.
- **Promote wanted — chat origin stamping** (source/pageUrl/checkId): live + driven on staging.
- Site chats vs Admin DB split: staging is `/data/local.db`, read via `/api/support/chats`
  (x-admin-token); prod Admin reads its own DB.
- Discord bot dark until the owner's token (plugs into `answerSupport()`); flip
  `SUPPORT_MODEL_BIG=claude-opus-4-8` once funded. One qdrant is shared by prod+staging+api.
