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
- **Admin token: ROTATED 2026-07-10.** Confirmed the leaked value was the live `ADMIN_TOKEN` on BOTH
  `voice-caller` (prod) + `voice-caller-staging` (same hash). Generated a fresh `adm_` token, upserted it to
  both via Railway API, verified the read-back (old hash gone). Railway auto-redeploys on the var change. New
  raw value lives only in Railway → Variables (never printed/committed). The leaked history copy is now dead.
  Scanned all 6 Railway services for the old token's footprint: the separate **`api` (fungibles) service holds
  NO admin token** → rotation did NOT break it. Fixed the one internal caller that did carry it — staging
  `STORE_SYNC_TOKEN` (code says it must equal prod ADMIN_TOKEN) → updated to the new value, so the (disarmed)
  store-sync stays valid when re-armed. **Owner: the site checkers / Discord cook-group listener post to
  `/api/stock/ingest` with the admin token — that app is a separate repo/deploy (not in this Railway project),
  so if it hardcodes the old token it's locked out now and needs the new value.** Browser admin sessions
  (signed cookie) survive; a new `/admin-login?token=` needs the new value.
- **CLAUDE.md:** now says `RAILWAY_API_TOKEN` is embedded in the Claude env (ask the owner only if it 401s).
- **`team/design/checkpoint.md` = 165 lines, left as-is** — the file itself declares "80-line cap waived for
  this section" (owner-sanctioned, twice) for the tint + design-gap carry-overs. Not pruning without owner OK.
- **Minor:** `src/server.ts:3772` has a "(CALL_ECONOMICS §2)" citation in a GTM todo string — now points at a
  merged-away filename. It's code (not my lane); flag for DevOps to retarget to `COST_MODEL.md Part II §2`.

## Still open (prior passes)
- Reconcile `design/copy/COPY_CHANGES_APPROVED.md` (three docs claim it lives elsewhere).
