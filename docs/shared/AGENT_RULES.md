# Agent rules — read before you touch code

Earned by watching the same mistake twice. The model writes plausible code fast; plausible ≠ correct.
Discipline comes from these, not from hoping.

1. **Read before you write.** Read the files you'll touch + their imports; copy the patterns already there. No pattern to copy? Ask, don't guess.
2. **Think before you code.** State your assumption, name the one you picked. Genuinely ambiguous or cross-lane → stop and ask, don't fill the gap with plausible code.
3. **Simplicity.** Minimum that solves the task in front of you. No premature abstraction, no "in case we need it," no hardcoded values that should configure.
4. **Surgical changes.** Smallest diff the task allows. Don't touch what you weren't asked to. Match existing style. Never reformat. If a line wasn't changed by the task, revert it.
5. **Verify.** Test it. For a bug, make the failing test fail *first*, then fix — that's the proof you fixed the cause, not the symptom. "Hard to test" is information about the design, not permission to skip.
6. **Goal-driven.** Define "done" before you start. Multi-step → state the plan first so a wrong approach is caught in a sentence, not an hour.
7. **Debug, don't guess.** Read the whole error + stack. Reproduce before you change anything. Change ONE thing at a time. Find *why* it's null — don't paper over it.
8. **Dependencies are permanent.** Can stdlib / what's already here do it? Say why when you add one, so the choice is visible.
9. **Communicate.** Say what you did and why — not a block of code. Flag concerns even when you did exactly what was asked. Be precise about uncertainty ("not sure X supports streaming" > "should work").
10. **Name the failure modes, then stop.** *Kitchen Sink* (refactoring while you're in there), *Wrong Abstraction* (DRY-ing two things that aren't the same), *Optimistic Path* (happy path handled, the 500 ignored), *Runaway Refactor* (a fix that cascades across files).

## Earned in this repo
11. **Destructive DB ops: check FK cascades + snapshot first.** A `delete` on a parent table can `SET NULL` / `CASCADE` its children (deleting `categories` once wiped prod `call_results`). Read the schema, back up the volume, prefer upsert over delete-replace.
12. **Staging-first, and prod data is never overwritten by a deploy.** Develop on **staging** (`staging` → `staging.checkitforme.com`), then promote to prod by **merging** the staging branch into prod (`main` → `checkitforme.com`) — it's a git merge, there's no promote endpoint. The **Admin reads live PROD data**. A deploy ships code; it never rewrites a DB. Snapshot the volume before any destructive data op.
13. **Checkpoint as you go.** Update your handoff doc the moment there's something worth keeping — not just at the end. Context windows close; only what's written survives.

— after Karpathy, *Field Notes on Getting a Language Model to Write Code You Will Not Rewrite*.
