# Lexicon — checkpoint
**What this is:** current state of the docs-hygiene lane. Newest on top, ≤80 lines.

## 2026-07-10 — repo-org pass (owner mandate: root = code only)
Moves (grepped code/scripts/CI first per rule 18 — no code refs to any moved file):
- Moved `emails/check-email-alerts-design.html` → `docs/design/emails/` (+ README pointer; root `emails/` gone).
- Moved `call-cost-model.xlsx` → `docs/finance/`.
- Moved `data/stores-master/COVERAGE_REPORT.md` → `docs/data/`; left the dataset + a README pointer in place.
- Moved the two chain-scoring **specs** (`SCORING_MODEL_spec.md`, `DEV_HANDOFF_final.md`) → `docs/data/`; the
  **CSVs stay** (`src/server.ts:4177` reads `chain_scores_final.csv`); source README rewritten as a pointer.
- Fixed every doc pointer to the moved files (START-HERE, data/design READMEs, scoring.md, store-schema.md,
  provenance untouched=dir still valid, data handoff, moved-doc internal refs).
Checkpoint backlog:
- Merged `business/CALL_ECONOMICS.md` → `finance/COST_MODEL.md` as "Part II"; deleted the old file; updated
  START-HERE finance row. Added a rate-assumption reconciliation note (Part II Admin→Calc rates canonical).
- Pruned `team/data/checkpoint.md` **582 → 79** (dropped completed session logs 06-17…07-06; kept every
  durable fact + open `[ ]` item — git holds the rest).
- Pruned `team/devops/checkpoint.md` **183 → 100** (dropped finished `[x]` items; kept open items + traps).
- Fixed stale pricing refs: removed the hardcoded "Starter $4.99/15…" ladder from devops checkpoint + added
  the "plans live in Admin/`src/plans.ts`, wired to Stripe (source of truth)" banner to COST_MODEL Part II §5.
- Stripped the plaintext admin token from `team/mapping/checkpoint.md` → `<ADMIN_TOKEN>` placeholder.

## Owner: needs your call
- **`loops/` NOT moved** (mandate said archive it). Grep shows `loops/site-redesign/` is an **active** working
  set: 8 QA scripts write proofs/renders there (`qa-behaviors`, `render-comps`, `site-health`, `qa-round6`,
  `qa-hobby`, `qa-thrift`, `qa-paidflow`, `qa-price`), `.gitignore` ignores `loops/site-redesign/render/`, and
  the live **COPY QUEUE** (`MANIFEST.md`) is pointed at by copy + website handoffs. Archiving it needs code
  edits (out of my lane, and the loop isn't shipped — design says prod is still pre-bloom). Move it only once
  the site-redesign loop is retired and DevOps re-points the scripts/gitignore.
- **Admin token still in git history** (`team/mapping/checkpoint.md`, staging branch) — redacting the file
  doesn't remove past commits. DevOps: **rotate it** (already on their launch rotate-list; I cross-linked it there).
- **`team/design/checkpoint.md` = 165 lines, left as-is** — the file itself declares "80-line cap waived for
  this section" (owner-sanctioned, twice) for the tint + design-gap carry-overs. Not pruning without owner OK.
- **Minor:** `src/server.ts:3772` has a "(CALL_ECONOMICS §2)" citation in a GTM todo string — now points at a
  merged-away filename. It's code (not my lane); flag for DevOps to retarget to `COST_MODEL.md Part II §2`.

## Still open (prior passes)
- Reconcile `design/copy/COPY_CHANGES_APPROVED.md` (three docs claim it lives elsewhere).
