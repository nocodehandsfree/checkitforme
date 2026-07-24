# New-chat prompts — copy, paste, go.
**What this is · who it's for:** the owner's cheat sheet for starting agent chats that don't die.
Personas retired 2026-07-23 (Phase 4 — see `docs/shared/REBUILD_PLAN.md`). Chats are named by TASK now.

## The prompt (name the task, not a person)
> **Task: <the one thing>.** (e.g. "Task: fix the store-name cutoff on alert cards.")

That one line is enough. CLAUDE.md (loads automatically) makes the agent: pull staging → read
`docs/STATE.md` → read the right SYSTEM's `docs/team/<system>/checkpoint.md` → read the task queue
(`docs/tasks/INDEX.md`) → state which task it's taking. The agent picks its system from the task itself.

## The five systems (the agent maps the task to one)
- **site** — the consumer app (checkitforme.com), design, and copy.
- **admin** — the operator dashboard (admin.checkitforme.com).
- **voice-calls** — the calling engine, voice tuning, and phone-tree mapping.
- **data** — store rows, the importer, sync pipes, and backend/infra/deploys/promotes.
- **support** — the customer-chat support agent.

**External:** CD (design comps via MCP → `docs/design/comps/inbox/` only). No standing planning chat —
plan in a short throwaway session, then close it.

## How to keep chats from dying (the 3 habits)
1. **One task per chat.** New task → new chat. Cheap boots make this painless.
2. **Say "Checkpoint" after every milestone** — the agent updates its system's checkpoint (≤60 lines).
3. **Say "Handoff" while the chat is still healthy** — checkpoint + STATE.md + push + list unfinished.
   After ~25 turns a hook tells the agent to offer handoff on its own.

## If an agent seems lost
- "Where are we?" → `docs/STATE.md` is the single source of truth; `docs/START-HERE.md` maps every doc.
- An agent claiming "shipped" without pasted `verify-live` output = not shipped. Ask for the output.
- Drifting reply (jargon, walls of text)? Say **"Protocol"** — it snaps back to the answer-first style.
