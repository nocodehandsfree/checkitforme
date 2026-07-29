# New-chat prompts — copy, paste, go.
**What this is · who it's for:** the owner's cheat sheet for starting agent chats that don't die.
Personas retired 2026-07-23 (Phase 4 — see `docs/shared/REBUILD_PLAN.md`). Chats are named by TASK now.

## The prompt (name the task, not a person)
> **Task: <the one thing>.** (e.g. "Task: fix the store-name cutoff on alert cards.")

That one line is enough. CLAUDE.md (loads automatically) makes the agent: pull staging → read
`docs/STATE.md` → read the right SYSTEM's `docs/team/<system>/checkpoint.md` → read the task queue
(`docs/tasks/INDEX.md`) → state which task it's taking. The agent picks its system from the task itself.

**Never paste a long handoff essay from the last agent.** Anything worth carrying forward belongs in
the checkpoint (the new agent reads it at boot anyway); mistakes belong in GOTCHAS or the checkpoint.
A prompt should only add what the FILES can't know: what you saw on your phone, what you decided.
Rip the rest out — you were right to.

**Check the first reply.** A hook makes every new agent's first reply recite the box back: the task,
the done-when, and the EXISTING pieces it will build on, by name. Read that recitation. If it names
the wrong pieces or invents ones, correct it there — one message now beats a wrong build later.

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
