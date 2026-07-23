# Branch sweep — nothing left stranded on a claude/* branch

**What:** List every open `claude/*` branch and its PR (if any). For each, do one of two things:
merge it to staging, or propose killing it. Nothing stays stranded on a branch where the owner can't
see it. (Remote sessions are forced onto `claude/*` branches, so work lands off-staging by default —
this sweep catches it.)
**Done when:** Every open `claude/*` branch is either merged to staging or killed (owner-approved);
zero stranded work, and the list is recorded.
**Lane:** Ops
**Status:** list produced (2026-07-23) — awaiting owner go on the kills

**Finding (full record: `docs/team/ops/branch-sweep-2026-07-23.md`):**
`staging` is fresh orphan history from the 07-22 rebuild — 25 of 31 `claude/*` branches share NO
history with it, so none can be cleanly merged. Recommendation: **kill all 31**. The only real work
not on staging is PR #74's Admin "Give free credits" button (endpoint already live; re-land the
button, then kill). 4 branches are already fully on staging; the rest are pre-rebuild orphans or
already-live / owner-reverted work. Open PRs #74/#78/#83/#85/#86/#88 close when their branches die.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(pending owner approval to delete branches + re-land PR #74 button)
```
