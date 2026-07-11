# Support — checkpoint
**What this is:** current state. Newest on top, ≤80 lines.

- 2026-07-10 (2) — WHOLE PATH BUILT on branch `claude/support-lane-spec-7hd2aj` (PR #5 → staging).
  Ladder (cache→free→cheap→big, env-tunable via SUPPORT_MODEL_*), book→qdrant RAG, site chat
  widget EN/ES, escalation form → Brevo → support@, review queue + stats. Verified locally with
  real keys: full ladder climb, never-guess rule, ES replies, 13-assertion smoke suite in
  test-all.sh. Browser-QA failures = legacy baseline (proved identical on base commit).
  BLOCKED on merge to staging for: reindex+grounded answers, cache-hit test, live widget drive.
  Needs from Pops: BREVO_API_KEY on staging (tickets store-but-don't-email without it).
  Big-tier model flip once Anthropic funded: set SUPPORT_MODEL_BIG=claude-opus-4-8 (llm.ts now
  has an anthropic branch). Discord: plug the bot into answerSupport() in src/support/ladder.ts.
- 2026-07-10 (1) — Spec v2 owner-approved: no user-facing email (form → support@), cheap tiers vet
  before money, Discord deferred, ticket system later. Cost model in spec.
- 2026-07-09 — Lane created at the repo split.
