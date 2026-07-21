# HOW SUPPORT WORKS — the Support manual (read FULLY before any task)
> Every claim is anchored to code (`src/support/`). When this file and the code disagree, the code
> wins — tell PM, don't improvise. Money words and grant rules change ONLY on the owner's word.

## 1. Why this lane exists (the money)
Support answers customers about checks, plans, and problems — cheaply and honestly — and hands out
CREDITS (never cash) only when the machine proves the customer was wronged. A wrong answer costs
trust; an invented promise costs real money. That's why everything below is deterministic first,
model second.

## 2. The answer ladder (src/support/ladder.ts — ONE brain behind every surface)
Rungs, cheapest first; a rung answers only if the one below couldn't:
- **0 · answer cache** — an approved Q&A close enough (high cosine bar) serves VERBATIM, $0. This is
  what the Admin "Teach" box feeds: approve a corrected answer → embedded → serves verbatim forever.
- **1 · free model + RAG** (Gemini Flash-Lite) — answers from the book (readme.com, 46 pages,
  `rag.ts`; 10-min FAQ cache from Copper's common questions).
- **2 · cheap paid retry** (gpt-4o-mini) · **3 · big model** multi-turn troubleshooting (gpt-4o;
  flip `SUPPORT_MODEL_BIG` to claude-opus-4-8 once Anthropic is funded).
- **Anti-hallucination is law in the system prompt:** never claim a page/link/menu exists unless the
  docs name it. Site facts are baked in (real footer links, NO contact page, partnerships→Discord).
- One qdrant (`support_qa`) is shared by prod+staging+api — taught answers are GLOBAL, so a bad
  teach poisons every environment. Teach carefully.

## 3. The credit machine (src/support/credits.ts — deterministic, runs BEFORE any model)
- On a "something's wrong with my check" chat: signed-in + a CHARGED check + telemetry contradicting
  the charge (bad statusKeys: nobody_answered, bad_number, voicemail, busy, left_on_hold, failed —
  or a <25s call) → instant +1 credit via grantCredits. ONE grant per check EVER (unique), evidence
  JSON stored on the grant row.
- Owner-approved limits: 2 grants per account per 30 days · check must be ≤7 days old · credits
  only, never cash. **The model is FORBIDDEN from promising credits — money words are fixed EN/ES
  strings.** Telemetry fine → polite no + human ticket. Never charged → says so plainly.
- Flywheel: a grant snapshots the store phone + background re-lookup fills `suggested_phone` for DD.

## 4. Chats, tickets, and where they live
- Every chat records its origin: `source` (status_page vs messenger), `page_url`, `check_id` —
  stamped on create in answerSupport (07-21 build). Signed-in accounts render in the Admin list.
- Escalation = human ticket → support@ via Brevo (`tickets.ts`). The human path is deliberately
  buried (revealed after 2 failed answers). Review queue: low-confidence answers wait for approval.
- **KNOWN BLOCKER:** site chats don't all appear in Admin ▸ Support (site DB vs Admin/prod DB
  split — Addie is wiring it; the origin-stamping server half needs a promote to show on prod Admin).
- The messenger UI (site panel: Home/Messages/Help, topic picker, screenshots to R2, EN/ES) is
  Webbie-adjacent but YOUR feature — reuse it, never build a second surface.

## 5. The ONE rules
- Reuse the ladder + messenger + tickets + review queue for every new need — no new surfaces, no
  new email senders, no second brains. Discord bot (dark until the owner's token) plugs into
  `answerSupport()` — same ladder, different door.
- The book (readme.com, branch v1.0) is Copper's: READ, never write. Store data is DD's. The
  calling engine (`src/voice/`) is machine-frozen.
- Copy per `COPY_STYLE_GUIDE.md`, EN+ES in the same commit. Admin screens ride Addie's ship-admin.

## 6. Traps that burned past Support agents
- Teaching a "fixed" answer before the underlying thing is actually fixed = the agent confidently
  serves a lie, globally, forever. Verify first, teach second.
- The agent claiming pages/features that don't exist was the original sin here — the ladder forbids
  it; never weaken that block for a "friendlier" answer.
- suite `scripts/test-support-endpoints.ts` (+ credit machine tests) covers this lane — run THOSE,
  never the full suite unprompted, never in background.

## 7. Comprehension gate — before your first action in ANY session
Explain back to the owner/PM in plain words: (a) the exact conditions under which a customer gets a
credit, and who decides — the model or the machine; (b) what happens when a customer asks about a
page the book doesn't mention. Wrong answers here cost real money and trust — re-read until right.
