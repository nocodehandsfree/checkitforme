# Voice ▸ Testing becomes the new-engine scorecard for test calls

**System:** admin · **Status:** queued — starts ONLY after Addie's dashboard jobs 1 and 2 land
(one agent in `app.html` at a time).
**What:** the owner's test calls (Fun store included — the exclusion only guards real-store stats)
need one-glance feedback on how the new engine performed. The `#testing` section exists; update it,
never add nav (LAW 4).

- Read WHOLE first: `docs/specs/admin-ops-dashboard/CONTRACT.md` §8 (the event kinds) ·
  `docs/team/voice-calls/checkpoint.md` · render the Admin board before touching anything.
- List the latest test checks (Fun + owner-only stores), each opening the SAME receipt sheet the
  Calls page uses (snap on, don't rebuild — `/api/admin/receipt/:room` + the existing sheet).
- Per check, a pass/fail scorecard computed off the receipt events, no new listening:
  · **Asked once** — exactly one ask; no repeat after `hold_end` (no re-greeting).
  · **Never beeped at a person** — zero `alpha_press` after `human_detected`.
  · **Hold stopped the meter** — agent closed on `hold_start`, reopened after, billed as segments.
  · **Mapping held** — for a direct-pickup store: zero steps fired and the agent opened at the
    person (the silent-agent guard); for a mapped store: steps fired on recordings, not the clock.
- Every label in plain words per `COPY_STYLE_GUIDE_ADMIN.md`; tooltip on every scorecard row.

**Done when:** the owner places a Fun call and reads pass/fail on his phone without opening a log ·
driven in a phone-sized browser on shipped Admin bytes · verify-live output pasted below.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
