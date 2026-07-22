# Support — checkpoint
**What this is:** current state. Newest on top, ≤80 lines.
> **⚖️ BOOT LAW: read `SUPPORT-MANUAL.md` (this folder) FULLY before any task — the technology,
> anchored to code. Pass its comprehension gate (§7) before acting.**

## ⚖️ STANDING ORDERS (permanent — obey on every task, they survive every session)
1. **Lane:** the support messenger (site panel + `src/support/`), the credit machine, RAG over the
   book, support Admin pieces (screens ride Addie's ship-admin). The CALLING ENGINE (`src/voice/`)
   is FROZEN — machine-blocked. Store data is DD's lane. The book is Copper's — read, never write.
2. **Money words are deterministic EN/ES strings — the model is FORBIDDEN from promising credits.**
   Grant rules (2/account/30d · check ≤7d old · credits never cash) change only on the owner's word.
3. **ADDITIVE:** reuse the messenger, ladder, tickets + review queue that exist — no new surfaces,
   no new email senders. Anti-hallucination facts stay: never claim a page/link/menu exists unless
   the docs name it.
4. Copy per `COPY_STYLE_GUIDE.md`, EN+ES same commit. **Done** = drive the real flow + Done Report
   (Built/Drove/Left). Never run the full suite unprompted, never in background.

## HOW CHARGING vs CREDITING WORKS (07-22, use for any check_issue question)
- **Charge:** bills ONE credit on a definitive answer (`src/calls/service.ts:616`). Owner billing
  ruling 07-22 (landed via another agent in credits.ts): engaged-but-no-answer calls (left on hold,
  too busy, language barrier) are now DELIBERATELY charged — real human minutes were burned. Truly
  dead calls (no answer, bad number, voicemail, busy) stay "no answer = no charge".
- **Auto-refund (my credit machine, BAD_KEYS):** a CHARGED check whose record shows nobody_answered /
  voicemail / busy / bad_number / closed / failed / admin_hangup (or <25s) → +1 credit back. The
  07-22 ruling REMOVED left_on_hold / too_busy / language_barrier from BAD_KEYS so billing and
  refunds don't fight — those route to a human ticket / Admin grant instead.
- **Verify a credit in Admin:** Support ▸ tap "Auto-credits" row → every grant + its evidence;
  the account's check balance goes +1. Empty on staging today (owner's test checks were never charged).

## OPEN / blockers (top of mind)
- **Owner offer standing:** walk a REAL credit through his Fun store so he watches one land in Admin
  end-to-end. Not done (needs a real charged-then-bad call — Echo/Fun-store).
- **Parked (owner-aware):** one-tap "run it again" button INSIDE the chat. Real resolution for a
  failed check but a bigger build near the call-placing path (againOverlay/preCallGate). NOT started.
- **PM: promote wanted — chat origin stamping (source/pageUrl/checkId).** Live + driven on staging;
  prod Admin shows it only after a promote. Admin UI render rides Addie's ship-admin.
- **Old blocker (still real):** site chats vs Admin DB split. Staging DB is `/data/local.db` (SQLite
  on the Railway volume) — can't query remotely; use the site's own `/api/support/chats` admin
  endpoint (x-admin-token) to read live chats. Prod Admin reads its own DB.
- **Discord bot module** — dark until owner's token; plugs into answerSupport(). Not started.

## Log
- 2026-07-22 — THE BARNES & NOBLE FIX (whole session, all LIVE on staging). Owner hit a chat that
  looped "which store?" forever, then a dead-end "never charged" reply. Shipped, additive:
  1. **No more loop.** Chat opened off a check's page now pins to THAT check and skips "which store"
     (`credits.ts` matches the pinned ref = numeric row id OR provider conv id). Client was stamping
     `LASTRES.cid` (empty) — now stamps `RAIL_CID` (the conv id the browser holds). Store matching
     ranks by token count so two same-brand stores (B&N Thousand Oaks vs Calabasas) are told apart.
     Loop-break to a human after 2 unresolved asks.
  2. **"That answered it" hidden until a real answer** (`answered` flag on the reply; ambiguous
     question = answered:false). Tapping it is now a CONVERSATIONAL CLOSE, not an exit: posts the
     user's msg, agent signs off warm once, chat stays open.
  3. **`not_charged` is a resolution now:** explains what went wrong (wentWrong() from statusKey:
     nobody picked up / bad number / voicemail / busy / on hold / closed), confirms balance intact,
     gives a next step. No invented UI.
  4. **Feels smart:** thinking pause (supThink, ~1s) before every reply; a model writes a warm
     opener in front of the LOCKED verdict + the close, behind a money-word wall (no credit/charge/
     refund/number → stripped, deterministic fallback). Money words never model-authored.
  Drove: model close verified LIVE on staging EN+ES, money-word-free. Tests: test-credit-machine
  34/34, test-support-endpoints 31/31. Branch claude/support-manual-target-review-x8vtyj → staging.
- 2026-07-21 — CHAT ORIGIN STAMPING (source/page_url/check_id on create in answerSupport; signed-in
  account renders in Admin list+detail). Additive, driven green on staging. PM: promote to reach prod.
- 2026-07-16 — CREDIT MACHINE (`credits.ts`, owner params 2/30d · ≤7d · credits only): charged check
  + telemetry contradicting the charge (BAD_KEYS or <25s) → +1 credit, one grant per cid, evidence
  JSON on the row. Fine → polite no + ticket. Flywheel: grant snapshots store phone for DD.
- 2026-07-11..16 — Foundations, all LIVE: ladder (cache→free→cheap→big) + RAG over the book;
  full-screen Messenger (topic picker, R2 screenshots, EN/ES); tickets → support@ via Brevo; review
  queue; buried human path; Teach box (approve → serves verbatim; prod+staging+api share ONE qdrant);
  anti-hallucination (no page/link/menu unless docs name it). Flip SUPPORT_MODEL_BIG=claude-opus-4-8
  once Anthropic funded. Admin decoupled — Addie ships Admin via ship-admin, no promote.
