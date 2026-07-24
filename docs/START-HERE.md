# START HERE — the map of every doc (glance and go)
**One rule:** agents boot from CLAUDE.md + `STATE.md` + `team/<system>/` + the task queue index, and
read nothing else until a task needs it. The system runs on gates (hooks that block bad moves), not
memory — the why and the design: `shared/REBUILD_PLAN.md`.

| Folder | What lives there | Who it's for |
|---|---|---|
| `STATE.md` | The owner's single source of truth: active streams, parked work, decisions waiting on him, next actions (≤40 lines, replaced not appended) | The owner + every agent, first read of the boot |
| `team/` | **One folder per SYSTEM** (5: site, admin, voice-calls, data, support): `handoff.md` (stable charter) + `checkpoint.md` (current state, ≤60 lines) | Each agent — your system is your starting point |
| `tasks/` | **THE TASK QUEUE** — `INDEX.md` + one small md per task (what · done-when · status · verify-live output on close) | Everyone, every boot |
| `owner/` | `new-chat-prompts.md` (paste-ready chat starters); business reference = the book (readme.com) | The owner |
| `shared/` | `REBUILD_PLAN.md` · whole-system manuals (ADMIN · WEBSITE · SYSTEM) · AGENT_RULES · ARCHITECTURE · API_CONTRACT · GOTCHAS | Everyone, only when a task needs it |
| `design/` | `INDEX.md` (**generated section index — read THIS, never open checkit/app/comps whole**) · `truth/` (live-site snapshots = the reference for frozen consumer pages) · `STYLE_GUIDE.md` · `brand/` · `comps/` (ADMIN comps active; `comps/inbox/` = CD's temporary submissions) · `copy/` (the voice) · `emails/` | Anyone touching UI or words |
| `specs/` | **Active builds only** — one file/folder per feature; ships → moves to `archive/` | The lanes building them |
| `data/` | Store-data reference (`provenance.md`, `store-logos.md`) + `samples/` | DD |
| `business/` | Roadmap | Owner + Ops |
| `finance/` | Cost model (`COST_MODEL.md`) | Owner + Ops |
| `archive/` | Done or superseded — "where did X go?" answers. Retired team lanes: `archive/team/` | Anyone |

## The rules (the gates enforce most of these — don't fight a hook)
1. **Docs root holds only `START-HERE.md` + `STATE.md`.** Everything else lives in a folder with a README.
2. **New files/docs are gated.** The sprawl gate blocks paths outside the allowed list — write
   `PM: <path> — <why>` in your checkpoint instead of working around it.
3. **Finished work = a git commit message, not a doc.** Superseded doc → `archive/` (suffix why).
   Living docs have hard caps (STATE.md 40 · checkpoints 60 · CLAUDE.md 100) — REPLACE stale content,
   never append; the doc-cap gate fails the session close and blocks a push while any is over.
4. **Big HTML never opens whole.** `design/INDEX.md` first, then read only the line range.
5. **"Done" = `bash scripts/verify-live.sh` output pasted.** Every time. No exceptions.
