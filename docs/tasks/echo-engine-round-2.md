# The calling engine, round 2 (Echo)

**System:** voice-calls · **Status:** active
**What:** the runtime spec's remaining "Done means" items plus two recorded receipt problems.

- Read WHOLE, in order: `docs/specs/live-call-runtime/README.md` (answer its §0 four questions back
  to the owner before ANY code) · `docs/team/voice-calls/checkpoint.md` ·
  `docs/team/voice-calls/02-spec-runtime-echo.md` (the owner's original spec, committed verbatim).
- Fix, both driven on a real staging receipt: receipt 199 repeats `transfer` + `hold_end` nine times
  with no `hold_start` and opens `charlie_join` three times (engine noise, recorded 07-28) ·
  `/api/admin/receipt/:room` returns seconds + cost NULL for an attached call while
  `/api/calls/:id/receipt` is full (one envelope, two answers).
- The owner's six Gate Zero calls are STILL PENDING ON HIM. Build what does not need them; never
  block on them, never place real-store calls for him.
- `src/voice/` is locked: owner-named task + `.unlock` only. Never deploy while he is mid test call.

**Done when:** the §11 leftovers check off with evidence · both receipt problems fixed and driven ·
`bash scripts/verify-live.sh` output pasted below.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
