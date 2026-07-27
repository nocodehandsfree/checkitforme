# team/ — one folder per SYSTEM. Your system's folder is where you start.
Phase 4 flip (2026-07-22, `docs/shared/REBUILD_PLAN.md`): personas retired. Work is organized by
SYSTEM, not by persona. Chats are named by task ("Task: fix the alerts row"), not "You are <Name>".

| Folder | System | Owns |
|---|---|---|
| `site/` | Site | the consumer web app (`public/checkit.html`) + consumer routes + design + ALL copy |
| `admin/` | Admin | the one operator dashboard (`public/app.html`) + `/api` |
| `voice-calls/` | Voice-calls | the calling engine + voice tuning + phone-tree mapping |
| `data/` | Data | store rows, importer, chains, the sync pipes + backend/infra/deploys/promotes |
| `support/` | Support | the customer-chat support agent + its model training |

**External:** CD (design comps, writes via MCP) submits ONLY to `docs/design/comps/inbox/` — no folder here.
**Retired systems** (archived in `docs/archive/team/`): the persona lanes (Webbie, Addie, DD, Support,
Mapper, Echo, Pops/Ops) folded into the five systems above — mapping → voice-calls, ops → data.

**Every folder = `handoff.md`** (stable charter, rarely changes) **+ `checkpoint.md`** (current state,
REPLACE stale content, ≤60 lines — the doc-cap gate blocks a push/close while any checkpoint is over).
Boot ritual: pull staging → read `docs/STATE.md` → read your system's `checkpoint.md` → read the task
queue index (`docs/tasks/INDEX.md`) → name the ONE task you're taking. Nothing else until a task needs it.
