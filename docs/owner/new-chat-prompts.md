# New-chat prompts — copy, paste, go. (This replaces KICKOFFS.md)
**What this is · who it's for:** Fungie's cheat sheet for starting agent chats that don't die.

## The prompt (same shape for every role — that's the whole point)
> **You are Webbie.**

That one line is enough. The repo guide (CLAUDE.md) makes them: check out staging → read their
`docs/team/<role>/handoff.md` + `checkpoint.md` (CLAUDE.md loads automatically) → reply ready. ~2 short files,
cheap boot, and they resume from their own checkpoint so nothing is "forgotten."

Names: **Pops** (DevOps) · **Webbie** (Website) · **Addie** (Admin) · **DD** (Data) · **Mapper** (Mapping) · **Copper** (Copy + the book) · **CD** (Design) · **Lexicon** (docs)
(add the day's task on a second line if you want: "Today: <one line>").

## How to keep chats from dying (the 3 habits)
1. **One task per chat.** New task → new chat. Cheap boots make this painless now.
2. **Say "Checkpoint" after every milestone** (~30–45 min). They update `docs/team/<role>/checkpoint.md`.
3. **Say "Handoff" while the chat is still healthy** — checkpoint + push + list unfinished. Don't ride a chat to death.

## If an agent seems lost
- "Where did doc X go?" → `docs/START-HERE.md` is the map; finished stuff is in `docs/archive/`.
