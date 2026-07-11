# Support — checkpoint
**What this is:** current state. Newest on top, ≤80 lines.

- 2026-07-11 (2) — Widget REDESIGN per owner: it's a slide-up bottom sheet now (grabber + swipe /
  backdrop to close, NO X), the input is a growing textarea (room to type), send is a small round
  button, dropped the redundant subtitle. Verified with a local screenshot. NOTE for CD/Design:
  owner has moved OFF centered pop-ups-with-an-X for dialogs — STYLE_GUIDE still says forms are
  centered pop-ups; flag to reconcile.
- 2026-07-11 — LIVE ON STAGING and driven end to end (owner approved merge; PR #5 merged).
  ✓ reindex (18 book pages → qdrant) ✓ grounded EN + ES answers ✓ resolve → review → approve →
  embedded ✓ re-ask hit the $0 cache tier ✓ ticket stored ✓ stats live. Whole drive: $0.0005.
  Prompt tune shipped after drive: "check" never translated in ES replies (was "cheque").
  BREVO_API_KEY copied prod→staging (owner authorized) and PROVEN: Brevo log shows the test
  ticket delivered to support@ and opened. Owner is UI-testing the widget on staging.
  Big-tier flip when Anthropic funded: SUPPORT_MODEL_BIG=claude-opus-4-8 (llm.ts anthropic branch).
  Discord later: plug the bot into answerSupport() in src/support/ladder.ts.
- 2026-07-10 (2) — Whole path built: ladder (cache→free→cheap→big, SUPPORT_MODEL_* env-tunable),
  book→qdrant RAG, chat widget EN/ES, escalation form → Brevo → support@, review queue + stats,
  13-assertion smoke suite in test-all.sh. Browser-QA failures = legacy baseline (proved on base).
- 2026-07-10 (1) — Spec v2 owner-approved: no user-facing email (form → support@), cheap tiers vet
  before money, Discord deferred, ticket system later. Cost model in spec.
- 2026-07-09 — Lane created at the repo split.
