# Branch sweep — 2026-07-23 (Ops)

Task: `docs/tasks/branch-sweep.md`. Goal: no work stranded on a `claude/*` branch.

## The key fact
`staging` was rebuilt as **fresh (orphan) history** on 07-22 (owner-approved, `docs/shared/REBUILD_PLAN.md`).
It has only 60 commits and shares **no common history** with 25 of the 31 open `claude/*` branches.
So **none of them can be cleanly merged** — the only real choice per branch is delete-now vs kill.
For each branch with a real feature, I checked whether that work is already in the live `staging`
source (`public/`, `src/`) rather than just in an old snapshot.

## Verdict: kill all 31. Only ONE piece of real work is not on staging.
- **PR #74 — Admin "Give free credits" button** (`admin-standup-handoff-uipqja`): the grant *endpoint*
  is already on staging (`src/billing.ts`, `src/server.ts`), but the button UI (`giveCredits` in
  `public/app.html`) is **missing**. This is the only stranded, re-landable work. Recommend: re-land
  as a small fresh Admin task, then kill the branch.
- Everything else is either already on staging or intentionally dropped by the rebuild/an owner order.

## The 31 branches

### Already fully on staging — delete, zero risk (4)
| Branch | Note |
|---|---|
| claude/addie-checkpoint-a7f3z0 | tip is an ancestor of staging |
| claude/admin-audit-jtoytv | tip is an ancestor of staging (added these very tasks) |
| claude/support-manual-target-review-x8vtyj | tip is an ancestor of staging |
| claude/the-rebuild-plan-mb0qbk | tip is an ancestor of staging |

### Open PR, but work already live on staging — kill + close PR (3)
| Branch | PR | Why kill |
|---|---|---|
| claude/webbie-checkpoint-yokoam | #83 email alerts | `watchStore`/`openAlerts`/`alerts/pause-all` all in live source |
| claude/copper-landing-page-copy-3tatx4 | #78 referral copy | `refw.*` copy already in `public/checkit.html` |
| claude/mapper-comprehension-check-w0nvju | #88 mapping note | 16-line checkpoint note, superseded by current mapping checkpoint |

### Open PR, work intentionally dropped — kill + close PR (2)
| Branch | PR | Why kill |
|---|---|---|
| claude/echo-boot-checkpoint-lj4dmt | #86 voice | `classifyOpeningLine`/`isDeadAirClerk` reverted by owner order (see `echo-checkpoint-recovery`); need re-captured as an Echo+PM build in mapping checkpoint |
| claude/mapper-checkpoint-scheduling-tbtnps | #85 mapping docs | docs-only handoff snapshot, superseded |

### Open PR with real un-landed work — FLAG (1)
| Branch | PR | Action |
|---|---|---|
| claude/admin-standup-handoff-uipqja | #74 admin free-credits button | Re-land the button on staging (small, additive), then kill + close PR |

### No PR, pre-rebuild orphan history — kill (21)
admin-redesign-data-hiy0ej · android-compatibility-testing-gjimn8 · check-admin-setup-jseff0 ·
check-app-ideas-sv1cl2 · check-email-rendering-uxomo9 · check-pops-devops-cul4v8 ·
checkit-agent-alignment-cgnxk4 · docs-overhaul-public-manuals-smlohx · e2e-coverage-harness-a9esc7 ·
echo-checkpoint-recovery-7hm7hb · hobby-hours-backfill-eexkg0 · lexicon-repo-org-n4lpzn ·
logo-asset-lane-setup-8rx7ep · my-zones-layout-fix-68gs56 · restructure-public-logos-pewy1c ·
ringo-voice-onboarding-634tk6 · support-lane-spec-7hd2aj · ui-polish-pass ·
webbie-landing-pages-lzpq0l · webbie-landing-share-rebuild-345ikb · webbie-website-handoff-s0ql27

## Knowledge-loss check (owner's concern) — CLEAR
Compared every branch's docs against staging at the content level:
- Files unique to the branches are all the **pre-rebuild retired lanes** (copy/design/ideas/lexicon/
  logo/pm) — already preserved in `docs/archive/team/` by the rebuild — plus scratch/test files.
- Everything else the diff flagged is just an **older version** of a file staging already carries newer.
- Only 3 files lived on a branch and nowhere else: `docs/team/devops/checkpoint.md` + `handoff.md`
  (pre-rebuild ops notes; superseded by the ops lane) and `docs/team/copy/referral-welcome-copy.md`
  (its copy already live in `public/checkit.html`). **All 3 captured into `docs/archive/team/` this
  commit**, so deletion loses nothing.

No product/business knowledge (GOTCHAS, manuals, current checkpoints, specs, store data) is on these
branches only — it is all present on staging.

## Open PRs to close when their branches die
#88, #86, #85, #83, #78, #74 — deleting the head branch closes each.

## Status (owner approved 2026-07-23) — deletion BLOCKED by environment
Owner approved killing the branches. **But `git push --delete` returns 403 — the egress policy in
this session blocks remote branch deletion, and there is no GitHub API tool exposed for it.** So the
31 branches cannot be deleted from here; this must be done from the owner's side (GitHub UI or a
session where the policy allows it). The recommendation stands: keep `admin-standup-handoff-uipqja`
(PR #74) until its free-credits button is re-landed, then delete all 31.
Note: PR #74's button work belongs to the active Admin rebuild (`claude/admin-design-system-spec-mgthjd`,
opened today) to fold in — no safe parallel path from here.
