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
     burial stays for OUR failures, which is what the owner built it for.
  2. **The hold answer (money), closed end to end.** Charge rules sit in the chat's always-true block
     and OUTRANK any passage; SIX book pages corrected on `v1.0` (owner's go — the worst was the
     verdict table's yellow row reading "No charge" for the bucket holding left on hold, too busy,
     language barrier); reindexed with `?source=repo` because ReadMe had not synced. Driven in both
     languages: a hold answers charged, nobody answered stays free.
  3. **The Spanish result screen** said "Sin cargo" on three charged statuses while English promised
     nothing. Fixed under the unlock flow.
- **Book vs ReadMe drift is now a known trap:** the agent reads ReadMe, ReadMe syncs from `v1.0` on
  its own clock, so a reindex in that window re-teaches the stale page. `?source=repo` is the way out.
- **Reply engine for the chat:** checker-only recommended (a small fast model grades vs the copy
  guide, rewrites only fails, numbers survive exactly, money words untouched). Not built.
- **Next: score round 2** (clean re-run on one build); round 3 waits on it. Unfixed: an app we do
  not have gets debugged, "passages" and "premium ration" reach customers, coverage is answered from
  nothing ("yes we check the Target in Glendale"), and an unclear-but-charged call was called free.

## How charging vs crediting works (07-22, use for any check_issue question)
- **Charge:** ONE credit on a definitive answer (`src/calls/service.ts:616`), AND on engaged-but-no
  answer (left on hold, too busy, language barrier, staff hung up). Truly dead calls (no answer, bad
  number, voicemail, busy) stay no-charge. `billableOutcome()` is the truth; the chat mirrors it.
- **Auto-refund (BAD_KEYS):** a CHARGED check showing nobody_answered / voicemail / busy /
  bad_number / closed / failed / admin_hangup (or <25s) → +1 credit back. left_on_hold / too_busy /
  language_barrier are NOT in BAD_KEYS (07-22) — those route to a human ticket / Admin grant.
- **Verify a credit:** Admin ▸ Support ▸ "Auto-credits" row → grant + evidence; balance goes +1.

## 2026-07-22 — the Barnes & Noble fix (all LIVE on staging, compressed 08-05)
- Chat opened off a check's page pins to THAT check, skips "which store"; store matching ranks by
  token count; loop-break after 2 unresolved asks; "That answered it" hidden until a real answer;
  `not_charged` explains itself; warm opener/close behind the money wall. Tests: 34/34 + 41/41.

## OPEN / blockers
- **Owner offer standing:** walk a REAL credit through his Fun store end-to-end. Not done.
- **Parked (owner-aware):** one-tap "run it again" INSIDE the chat. Not started.
- **Promote wanted — chat origin stamping** (source/pageUrl/checkId): live + driven on staging.
- Site chats vs Admin DB split: staging DB `/data/local.db`; read via `/api/support/chats`
  (x-admin-token). Prod Admin reads its own DB.
- Discord bot — dark until the owner's token; plugs into `answerSupport()`. Not started.
- Flip `SUPPORT_MODEL_BIG=claude-opus-4-8` once funded. Shared qdrant across prod+staging+api.
