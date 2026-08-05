# SUPPORT — checkpoint (current state)

> System: the customer-chat support agent (site panel + `src/support/`), the credit machine, RAG over
> the book, and its model training. `src/voice/` is FROZEN; store data is DD's lane; the book is read-only.
> Charter: `handoff.md` + `SUPPORT-MANUAL.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## LAW — money words are deterministic EN/ES strings
The model is FORBIDDEN from promising credits. Grant rules (2/account/30d · check ≤7d old · credits
never cash) change only on the owner's word. Money words are never model-authored (stripped behind a wall).

## 2026-08-05 — the robot customer (support-chat testing, owner-ordered)
- **Built:** `scripts/robot-support.mjs` — 24 scripted customer conversations against the REAL
  staging chat, anonymous, paced under the 10/min limit. Spec + rubric:
  `docs/specs/support-chatbot-testing/README.md`. **Ran 16 of 24** (owner paused the rest mid-run);
  graded findings: `docs/specs/support-chatbot-testing/round-1.md`.
- **Held:** zero money promises in 28 messages; credit pushback + chargeback threat + injection all
  broke correctly; prices and alert numbers all right.
- **Broke:** the hold answer (book's stale "endless hold is free" vs the 07-22 charged ruling — the
  worst one); a literal FAQ question answered "I'm not sure"; debugged an iPhone app we do not
  have; "passages"/"the app"/"premium ration" said to customers; human form offered on first
  messages (tier-3 not-confident path — check what the widget renders before changing the server).
- **Reply engine for the chat:** recommendation delivered 08-05 — checker-only (small fast model
  grades vs the copy guide, rewrites only fails, numbers survive exactly, money words untouched).
  DO NOT BUILD until the owner decides. His three open calls: who fixes the book on holds · is
  live listening real for customers ("can I hear the call") · style gate now vs after round 2.
- **Next when he says go:** scenarios 17–24 · the robot customer's own account (Fun-store pattern)
  for signed-in credit scenarios · turn round-1 gaps into owner-approved Teach answers.

## How charging vs crediting works (07-22, use for any check_issue question)
- **Charge:** ONE credit on a definitive answer (`src/calls/service.ts:616`). Owner ruling 07-22:
  engaged-but-no-answer (left on hold, too busy, language barrier) is DELIBERATELY charged.
  Truly dead calls (no answer, bad number, voicemail, busy) stay no-charge.
- **Auto-refund (BAD_KEYS):** a CHARGED check showing nobody_answered / voicemail / busy /
  bad_number / closed / failed / admin_hangup (or <25s) → +1 credit back. left_on_hold / too_busy /
  language_barrier are NOT in BAD_KEYS (07-22) — those route to a human ticket / Admin grant.
- **Verify a credit:** Admin ▸ Support ▸ "Auto-credits" row → grant + evidence; balance goes +1.

## 2026-07-22 — the Barnes & Noble fix (all LIVE on staging, compressed 08-05)
- Chat opened off a check's page pins to THAT check, skips "which store"; store matching ranks by
  token count; loop-break to a human after 2 unresolved asks; "That answered it" hidden until a
  real answer; `not_charged` explains itself; warm opener/close behind the money wall.
  Tests: test-credit-machine 34/34, test-support-endpoints 31/31.

## OPEN / blockers
- **Owner offer standing:** walk a REAL credit through his Fun store end-to-end. Not done.
- **Parked (owner-aware):** one-tap "run it again" INSIDE the chat. Not started.
- **Promote wanted — chat origin stamping** (source/pageUrl/checkId): live + driven on staging.
- Site chats vs Admin DB split: staging DB `/data/local.db`; read via `/api/support/chats`
  (x-admin-token). Prod Admin reads its own DB.
- Discord bot — dark until the owner's token; plugs into `answerSupport()`. Not started.
- Flip `SUPPORT_MODEL_BIG=claude-opus-4-8` once funded. Shared qdrant across prod+staging+api.
