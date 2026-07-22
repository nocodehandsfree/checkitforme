# team/ — one folder per lane. Your folder is the ONLY place you start.
Roster reset 2026-07-22 (`docs/shared/REBUILD_PLAN.md`). 7 lanes, nothing else.

| Folder | Agent | Standing | Owns |
|---|---|---|---|
| `website/` | Webbie | daily | the consumer site (checkit.html) + /pub + design implementation + ALL copy |
| `admin/` | Addie | daily | the admin dashboard (app.html) + /api |
| `data/` | DD | daily | store rows, importer, chains, store data/API |
| `support/` | Support | daily | the customer-chat support agent + its model training |
| `mapping/` | Mapper | on call | phone-tree mapper → locked call recipes |
| `voice/` | Echo | on call | voice tuning: call lanes, verdicts, cost per call |
| `ops/` | Ops (Pops) | on call | backend core, infra, deploys, API contract, promotes + the old PM duties |

**External:** CD (design comps, writes via MCP) submits ONLY to `docs/design/comps/inbox/` — no team folder.
**Retired** (archived in `docs/archive/team/`): Copper, Logo, Lexicon, Ideas, and PM as a standing chat.
Copy + logo-display rules folded into `website/handoff.md`; PM's open items live in the task queue.

**Every folder = `handoff.md`** (stable lane charter) **+ `checkpoint.md`** (current state, ≤80 lines,
updated at every "Checkpoint"). Boot = CLAUDE.md (loads automatically) + your two files + the task
queue index (`docs/tasks/INDEX.md`). Nothing else.
