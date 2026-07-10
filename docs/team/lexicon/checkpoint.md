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

## 2026-07-10 (later) — loops archived + admin-token rotation
- **Moved `loops/` → `docs/archive/loops/`** (owner confirmed the loops are executed/done; the "recent"
  timestamp was the repo bring-over commit, not fresh work). Updated the copy + website handoff COPY-QUEUE
  pointers to the archive path. **DevOps follow-up:** 8 QA scripts hardcode `loops/site-redesign/proofs|render`
  as runtime output paths (gitignored — harmless, they'll recreate a root `loops/` at runtime); retarget to the
  archive path or a dedicated `.artifacts/` dir when convenient. `.gitignore` line left as-is (still matches
  the runtime path).
- **Admin token: rotation PENDING owner** — my env has no `RAILWAY_API_TOKEN`, so I can't write Railway vars.
  Owner to hand over the key (then I rotate `ADMIN_TOKEN` on both services) or paste a fresh token himself. The
  old value is redacted in the working tree but still in git history — **rotation is what kills it** (history
  copy becomes useless once the live token changes).
- **CLAUDE.md:** added the "everything's in Railway → Variables; ask the owner for `RAILWAY_API_TOKEN`" note.
- **`team/design/checkpoint.md` = 165 lines, left as-is** — the file itself declares "80-line cap waived for
  this section" (owner-sanctioned, twice) for the tint + design-gap carry-overs. Not pruning without owner OK.
- **Minor:** `src/server.ts:3772` has a "(CALL_ECONOMICS §2)" citation in a GTM todo string — now points at a
  merged-away filename. It's code (not my lane); flag for DevOps to retarget to `COST_MODEL.md Part II §2`.

## Still open (prior passes)
- Reconcile `design/copy/COPY_CHANGES_APPROVED.md` (three docs claim it lives elsewhere).
