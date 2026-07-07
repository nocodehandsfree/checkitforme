# START HERE — the map of every doc (glance and go)
**One rule:** agents boot from `team/<you>/` and read nothing else until a task needs it.
Every folder below has a README that explains its contents **right on the folder page in GitHub** — click a folder, the explanation is under the file list.

| Folder | What lives there | Who it's for |
|---|---|---|
| `team/` | **One folder per agent**: `handoff.md` (stable lane) + `checkpoint.md` (current state, updated every "Checkpoint") | Each agent — your ONLY starting point |
| `owner/` | `new-chat-prompts.md` (paste-ready chat starters); business reference = the book (readme.com) | Fungie |
| `shared/` | Code rules · architecture · **API contract** · runbook · gotchas | Everyone, only when a task needs it |
| `design/` | **ALL design**: `brand/` (the logo) · `STYLE_GUIDE.md` (the look) · `comps/` (boards) · `copy/` (the voice) | Design, Website, Copy |
| `specs/` | **Active builds only** — one file/folder per feature; ships → moves to `archive/` | The lanes building them |
| `data/` | Store-data reference + `samples/` (raw .json/.csv kept apart from docs) | Data Dev |
| `business/` | Roadmap | Owner + DevOps |
| `finance/` | Cost model + calculator (`CALL_ECONOMICS.md` is in `business/` pending merge into `COST_MODEL.md`) | Owner + DevOps |
| `archive/` | Done or superseded — "where did X go?" answers | Anyone |

## The rules (what keeps this clean — DevOps enforces)
1. **Docs root stays empty** except this file. Everything lives in a folder with a README.
2. **Every doc opens with one line:** *what this is · who it's for.*
3. **Finished work = a git commit message, not a doc.** Superseded doc → `archive/` (suffix the reason: `-SHIPPED`).
4. **Temp docs** (briefs, prompts) live INSIDE their feature's `specs/<feature>/` folder and get archived with it. No temp folders.
5. **New docs go in exactly two places:** your `team/<you>/checkpoint.md`, or `specs/<feature>/` for a cross-lane build. Anywhere else — don't.
