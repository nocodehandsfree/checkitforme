# SUPPORT — checkpoint (current state)

> System: the customer-chat support agent (site panel + `src/support/`), the credit machine, RAG over
> the book, and its model training. `src/voice/` is FROZEN; store data is DD's lane; the book is read-only.
> Charter: `handoff.md` + `SUPPORT-MANUAL.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## LAW — money words are deterministic EN/ES strings
The model is FORBIDDEN from promising credits. Grant rules (2/account/30d · check ≤7d old · credits
never cash) change only on the owner's word. Money words are never model-authored (stripped behind a wall).

## 2026-08-05 — the robot customer (support-chat testing, owner-ordered)
- **Built:** `scripts/robot-support.mjs` — 27 scripted customer conversations against the REAL
  staging chat, anonymous, paced under the 10/min limit. Spec, rubric and graded round-1 findings:
  `docs/specs/support-chatbot-testing/`. **Round 1 ran all 24**, 39 messages.
- **Held:** zero money promises in 39 messages; credit pushback, a chargeback threat and the
  injection attempt all broke correctly; every price and alert number right; the "$50 a check" trap
  corrected; full Spanish with "check" untranslated.
- **FIXED + shipped, each driven on staging, not claimed:**
  1. **The human ask (worst find).** "Let me talk to a real person" answered "tap Help in the
     footer" — Help IS this chat — and needs_human never fired, so the form never appeared. Now
     `HUMAN_ASK` (exported, unit-tested both ways) reads the customer's own words before any rung,
     `humanAsk` rides to the widget, and the person is offered on the FIRST ask. The two-strike
     burial stays for OUR failures, which is what the owner built it for.
  2. **The hold answer (money).** Charge rules now sit in the chat's always-true block and OUTRANK
     any book passage. Staff hung up → charged, nobody answered → free, both verified live.
     **Hold itself still answers wrong**: the book says free in three places and the model sides
     with it. Closes when the book lands, or when charge answers go deterministic.
  3. **The Spanish result screen** said "Sin cargo" on three charged statuses while English promised
     nothing. Fixed under the unlock flow.
- **Owner's open call:** `docs/tasks/book-hold-charge-copy.md` holds the exact replacement words for
  the three book pages. NOT pushed — branch `v1.0` publishes to real customers on landing.
- **Reply engine for the chat:** checker-only recommended (a small fast model grades vs the copy
  guide, rewrites only fails, numbers survive exactly, money words untouched). Not built.
- **Next:** round 2 is the signed-in half (the credit machine needs an account with a real charged
  check), then re-run all 27. Still unfixed: it debugs an iPhone app we do not have, says "passages"
  to customers, escalates on questions it merely could not answer, and misses the FAQ's own answer
  to "how long does a check take" about half the time.

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
