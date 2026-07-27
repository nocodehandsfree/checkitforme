# SUPPORT — checkpoint (current state)

> System: the customer-chat support agent (site panel + `src/support/`), the credit machine, RAG over
> the book, and its model training. `src/voice/` is FROZEN; store data is DD's lane; the book is read-only.
> Charter: `handoff.md` + `SUPPORT-MANUAL.md`. Volatile — REPLACE stale lines, newest on top, ≤60 lines.

## LAW — money words are deterministic EN/ES strings
The model is FORBIDDEN from promising credits. Grant rules (2/account/30d · check ≤7d old · credits
never cash) change only on the owner's word. Money words are never model-authored (stripped behind a wall).

## How charging vs crediting works (07-22, use for any check_issue question)
- **Charge:** bills ONE credit on a definitive answer (`src/calls/service.ts:616`). Owner ruling 07-22:
  engaged-but-no-answer calls (left on hold, too busy, language barrier) are now DELIBERATELY charged
  (real human minutes burned). Truly dead calls (no answer, bad number, voicemail, busy) stay no-charge.
- **Auto-refund (credit machine, BAD_KEYS):** a CHARGED check whose record shows nobody_answered /
  voicemail / busy / bad_number / closed / failed / admin_hangup (or <25s) → +1 credit back. The 07-22
  ruling REMOVED left_on_hold / too_busy / language_barrier from BAD_KEYS so billing and refunds don't
  fight — those route to a human ticket / Admin grant.
- **Verify a credit in Admin:** Support ▸ "Auto-credits" row → every grant + evidence; balance goes +1.

## 2026-07-22 — the Barnes & Noble fix (whole session, all LIVE on staging)
- **No more loop:** chat opened off a check's page pins to THAT check and skips "which store"
  (`credits.ts` matches the pinned ref; client stamps `RAIL_CID`). Store matching ranks by token count so
  two same-brand stores are told apart. Loop-break to a human after 2 unresolved asks.
- **"That answered it" hidden until a real answer;** tapping it is a conversational close, chat stays open.
- **`not_charged` is a resolution now:** explains what went wrong (wentWrong from statusKey), confirms
  balance intact, gives a next step. No invented UI.
- **Feels smart:** thinking pause (~1s); a model writes a warm opener in front of the LOCKED verdict,
  behind a money-word wall. Drove: model close verified LIVE EN+ES, money-word-free. Tests:
  test-credit-machine 34/34, test-support-endpoints 31/31.

## OPEN / blockers
- **Owner offer standing:** walk a REAL credit through his Fun store end-to-end (needs a real
  charged-then-bad call — voice-calls/Fun-store). Not done.
- **Parked (owner-aware):** one-tap "run it again" INSIDE the chat — bigger build near the call-placing
  path (againOverlay/preCallGate). Not started.
- **Promote wanted — chat origin stamping** (source/pageUrl/checkId): live + driven on staging; prod
  Admin shows it only after a promote. Admin render rides ship-admin.
- Site chats vs Admin DB split: staging DB is `/data/local.db` (SQLite on the Railway volume) — read live
  via the site's own `/api/support/chats` (x-admin-token). Prod Admin reads its own DB.
- Discord bot module — dark until the owner's token; plugs into `answerSupport()`. Not started.
- Flip `SUPPORT_MODEL_BIG=claude-opus-4-8` once funded. Shared qdrant across prod+staging+api.
