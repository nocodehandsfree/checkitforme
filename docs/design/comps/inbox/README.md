# comps/inbox/ — CD's submission drop (temporary files ONLY)

CD (external design, writes via MCP) submits comps HERE and nowhere else (REBUILD_PLAN 2026-07-22).
An inbox file is never a source of truth — the live site (via `docs/design/truth/`) is.

The life of an inbox file:
1. CD drops the comp here.
2. The implementing agent runs `node scripts/gap-check.mjs <inbox file> <truth file or live URL>`
   BEFORE building (the gap list is the work) and AFTER (the list should be empty).
3. Ship + verify-live, take a fresh truth snapshot of that page (`bash scripts/snapshot-truth.sh`).
4. DELETE the inbox file and regenerate the index (`node scripts/gen-index.mjs`).

Nothing lives here long. A file sitting in this folder is an open task, not a reference.
