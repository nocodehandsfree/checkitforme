# Lexicon — checkpoint
**What this is:** current state of the docs-hygiene lane. Newest on top, ≤80 lines.

## 2026-07-11 — skill library + drift cleanup (Full send)
- **Built 5 skills** under `.claude/skills/`: `build-on-brand` · `ship-it` · `unblock-yourself` ·
  `known-problems` · `reply-simple`. Each = YAML frontmatter (name + trigger-rich when-to-load) + a body
  that POINTS at the owning docs, never copies them. Every command/path verified against the repo (two
  recon subagents); drift-prone facts date-stamped with a one-line recheck.
- **Pruned** `team/website` 202→34 and `team/design` 185→44 — load-bearing traps moved into the
  `known-problems` skill first; open items kept, finished batches dropped (git holds them).
- **Registered the 3 shared manuals** (ADMIN/SYSTEM/WEBSITE) in START-HERE + `shared/README.md`; dropped
  the dead `RUNBOOK.md` row (SYSTEM_MANUAL covers it). Manuals scanned — **no secrets** (only `ADMIN_TOKEN`
  named + "lives in Railway").
- **CI checkpoint-size** (`ci.yml` docs-lint): now **warns at 80+ and FAILS at 120+**. All checkpoints
  currently ≤83, so it's green.
- **Re-applied governance edits that never reached staging** (CLAUDE.md): owner commands Protocol /
  Expand on that / Full send (dropped TLDR); the "You are <Name>" boot-opener rule; Rules-of-road
  push-the-moment + scratchpad + no-new-folders; `.claude/settings.json` pnpm + checkitforme curls.
  (My prior branch was 119 commits behind `origin/staging`, which already carried the repo-org pass +
  token rotation — so I restarted the branch from current staging per the merged-PR rule.)

## Earlier this cycle (already on staging)
- **Repo org:** root = code only — moved the email mock → `design/emails/`, `call-cost-model.xlsx` →
  `finance/`, COVERAGE + chain-scoring specs → `data/` (CSVs stay); merged CALL_ECONOMICS → COST_MODEL;
  archived `loops/`; pruned data/devops checkpoints; fixed stale "Starter" pricing refs.
- **Admin token ROTATED** (prod + staging); new value only in Railway; staging `STORE_SYNC_TOKEN` matched
  to it; the separate fungibles `api` app holds no admin token (unaffected). Old value dead post-rotation.

## Owner: open
- `src/server.ts:3772` has a "(CALL_ECONOMICS §2)" citation pointing at the merged-away filename —
  DevOps to retarget to `COST_MODEL.md Part II §2` (code, not my lane).
- `docs/design/comps/README.md` still has a "Rename status" section implying the WEBSITE_COMPS rename is
  pending; the rename is done — trim it next design/docs pass.
- Reconcile `design/copy/COPY_CHANGES_APPROVED.md` (three docs claim it lives elsewhere) — carry-over.
