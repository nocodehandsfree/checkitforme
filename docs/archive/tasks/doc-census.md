# Doc census — every .md outside docs/archive: keep / fix / archive

**What:** Inventory every `.md` in the repo outside `docs/archive`. For each, one line: is it accurate
and still true → **keep** / **fix** / **archive**. Produce the full list first; the OWNER approves it
before any file is moved or changed. The sprawl gate stops new junk from landing; this cleans the old
docs already in the tree.
**Done when:** A complete one-line-per-doc keep/fix/archive list is produced and owner-approved; the
approved moves/fixes are done.
**Lane:** Ops
**Status:** owner-approved + executed (2026-07-23) — 10 archived, 5/8 fixes done, 3 routed to lanes

**Finding (full record: `docs/team/ops/doc-census-2026-07-23.md`):**
158 `.md` outside `docs/archive/`: **~140 keep, 8 fix, 10 archive.** The full `docs/tasks/` queue and
all manuals/guides/checkpoints keep. 10 dated snapshots/consumed handoffs → archive. 8 fix (half are
one theme: docs still naming the retired `?skin=v2` gate + archived comp boards as live). Nothing
destructive; awaiting owner go.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
2026-07-23: 10 docs → docs/archive/ (git renames). 5 stale docs fixed in-tree
(STYLE_GUIDE, design/README, comps/README, build-on-brand SKILL, CHEAP_NAV).
3 held for lane context (API_CONTRACT auth, specs/README index, alerts build-spec).
Record: docs/team/ops/doc-census-2026-07-23.md. (verify-live.sh N/A — docs-only.)
```
