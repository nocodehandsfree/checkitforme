# Lexicon — checkpoint
**What this is:** current state of the docs-hygiene lane. Newest on top, ≤80 lines.

## 2026-07-17 — janitor sweep (owner review pass)
- **Cap clarified (owner):** the ~80-line cap is CHECKPOINT DOCS ONLY, never code — added to CLAUDE.md
  step 3 + the CI docs-lint comment.
- **Roster sync (I'd missed this — owner caught it):** the new lanes were only in the CLAUDE.md roster.
  Added the 4 missing (**Echo/Voice · Logo · Support · PM**) to `team/README.md` and the 5 missing to
  `owner/new-chat-prompts.md`. All 3 rosters now list the same 13 lanes. Also killed the stale
  "Rename status" section in `comps/README.md` (the WEBSITE_COMPS rename is long done).
- **Pruned** `team/website` 137→49 and `team/admin` 81→80 (finished ✅ batches out; kept the fresh 07-17
  work + open + traps). **Still over the soft cap (their lanes, not this scope):** `team/data` 83,
  `team/design` 97 — flag for CD/DD to prune (warn-only, not the 120 hard-fail).
- **`data/handoffs` cleared** the 6 ingested paste-dumps (kiosk/heb boxes + call-sheet + cleanup
  snapshot; git keeps them). Kept `hours_needed_fresh.csv` (active) + README. **DD: confirm** the 3
  `*-2026-07-11.md` analysis notes are superseded → I'll clear them next pass.
- **Guardrail live (owner):** NO new folder or doc without Lexicon sign-off — I'm the gate now. The
  flagged existing folders (`design/admin`, `copy/readme-theme`, `scripts/data-tools`) hold real files → kept.

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
- `Support: need X` (07-16) — CLAUDE.md contradicts itself on how Admin work ships: the "map of
  surfaces" rule still says "Admin work → promote, he reviews on THE Admin," but the Admin row (and
  reality since 07-15) is the decoupled path: admin UI ships DIRECT to the Admin via
  `scripts/ship-admin.sh`, no promote. Owner asked Lexicon to reconcile (fix the promote line; he
  also expected a "Ship paths" section that isn't in the file — add one if that's the plan).
- `src/server.ts:3772` has a "(CALL_ECONOMICS §2)" citation pointing at the merged-away filename —
  DevOps to retarget to `COST_MODEL.md Part II §2` (code, not my lane).
- `docs/design/comps/README.md` still has a "Rename status" section implying the WEBSITE_COMPS rename is
  pending; the rename is done — trim it next design/docs pass.
- Reconcile `design/copy/COPY_CHANGES_APPROVED.md` (three docs claim it lives elsewhere) — carry-over.
