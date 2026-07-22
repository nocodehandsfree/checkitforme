# New-chat prompts — copy, paste, go.
**What this is · who it's for:** the owner's cheat sheet for starting agent chats that don't die.
Roster reset 2026-07-22 — see `docs/shared/REBUILD_PLAN.md`.

## The prompt (same shape for every role)
> **You are Webbie.**

That one line is enough. CLAUDE.md (loads automatically) makes them: pull staging → read their
`docs/team/<role>/checkpoint.md` → read the task queue index (`docs/tasks/INDEX.md`) → state which
task they're taking. Add a second line if you want: "Today: <one line>".

## The roster
**Daily:** **Webbie** (site + design implementation + copy) · **Addie** (admin) · **DD** (store
data/API) · **Support** (customer-chat model training).
**On call:** **Mapper** (phone trees) · **Pops** (ops: infra + promotes + the old PM duties) ·
**Echo** (voice tuning).
**External:** **CD** (design comps via MCP → `docs/design/comps/inbox/` only).
**Gone — never boot:** Copper, Logo, Lexicon, Ideas, PM. No standing PM chat; planning happens in
short disposable sessions (open a chat, plan, close it).

## How to keep chats from dying (the 3 habits)
1. **One task per chat.** New task → new chat. Cheap boots make this painless.
2. **Say "Checkpoint" after every milestone.** They update `docs/team/<role>/checkpoint.md`.
3. **Say "Handoff" while the chat is still healthy** — checkpoint + push + list unfinished.
   After ~25 turns a hook tells the agent to offer handoff on its own.

## If an agent seems lost
- "Where did doc X go?" → `docs/START-HERE.md` is the map; finished stuff is in `docs/archive/`.
- An agent claiming "shipped" without pasted `verify-live` output = not shipped. Ask for the output.
