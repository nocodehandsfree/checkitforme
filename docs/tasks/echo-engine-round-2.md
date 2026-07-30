# The calling engine, round 2 (Echo)

**System:** voice-calls · **Status:** done 07-29 (both receipt problems fixed and driven; §11 audited —
what is left needs HIS phone or real customer checks)
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

---

## What was wrong, and what fixed it

**1. Ten false transfers (he counted nine), each with an unpaired `hold_end`.** Receipt 199 was a
direct dial to a store with no menu, never transferred and never held. `ConversationEar` declared a
transfer on ONE 20ms frame sitting on the network's ring frequencies and un-declared it on the next
frame that was not one — a voice lands on those frequencies for a fraction of a second, so it flapped.
Both halves now need a RUN of evidence: `transferToneMs` 600 (a real ringback burst is 2000) and
`backVoiceMs` 400 (about one word). Both live in `src/calls/tuning.ts`, so the Admin can correct them
without a release. The wait is also timed from the FIRST ring rather than the burst we happened to be
on, and the run of speech that proves somebody is back comes OFF `holdMs`. **A transfer now also opens
`hold_start`**, so every `hold_end` has a partner. No new event kinds — the set stays a closed sixteen.

**2. One agent joining wrote three `charlie_join` lines** (the recorded question starting, the session
opening, the handover). The Admin prints every line's note, so that reads as three agents on a call
with one. Now it is ONE line, at the session open, which is where the money clock actually starts. The
other two are details on that line, attached by a new `amend()` in `events.ts` — nothing is lost.

**3. One envelope, two answers.** `/api/admin/receipt/:room` only knew where an UNATTACHED call keeps
its roll-up (the last event's detail). An attached call stamps it on the `call_results` row and nothing
read it back, so the same call answered in full by id and NULL by room. Both routes now go through one
function, `rollupFromRow` in `events.ts`, sitting next to the roll-up it has to agree with.

**4. Found while auditing §10, and it was the biggest one: `reportCallDrift` never fired on an
ordinary customer check.** It is listed in §11 and was reported done. A mapping call writes the step it
took as `key`/`phrase`; an ordinary check writes it as `value`; `learnFromReceipt` read only the first
pair, so every customer check handed it an empty list and taught the map nothing. Every existing test
fed it a tidy list of steps instead of a real receipt, which is exactly the §10b failure mode. Fixed,
and the new test drives the receipt shape `listen-nav` really writes.

## §11, item by item

| # | Item | Status |
|---|---|---|
| 1 | Gate Zero answered with numbers, three runs each way | **HIS PHONE.** `scripts/gate-zero.ts` arms + scores them; it reads the provider's own per-call cost and sums every conversation a call opened. |
| 2 | Charlie never speaks before the answer finishes | **DONE.** His real Fun calls 07-28 plus 42 delta-clip asserts against a real socket. |
| 3 | A hold happens, Charlie stops costing money, comes back without greeting again | **HARNESS ONLY.** Proven end to end in `test-delta-clip.ts`: session closed, line kept up, reopened as part 2 of the same call, one silent note sent, no second greeting. A `holdSeconds` > 0 on a live call still needs somebody to actually put us on hold. |
| 4 | The brain switch flips both ways from Admin, receipt says which one ran | **HALF.** The receipt stamps it (`brain: hosted`, seen on 199 and 204). The "ours" side is blocked on his voice decision, not on code. |
| 5 | A dropped call charges nobody and does not lock the customer out | **DONE.** 15 asserts against a real db; `call_dropped` is never written `completed`. |
| 6 | Every dialling path writes a receipt — check each one | **DONE, audited.** All FOUR dial paths open one: `bridge-place` · `navigator` · `tapedeck` · the provider-native `direct:<id>` in `service.ts`, which the push gate cannot see because it never touches Twilio's `Calls.json`. The only dial with no receipt is `placeAdHocCall`, which rings the OWNER and not a store, so law 4 does not reach it. |
| 7 | `reportCallDrift` fires on ordinary customer checks | **WAS BROKEN, NOW DONE.** See 4 above. |
| 8 | Cost per delivered answer re-measured | **NEEDS REAL CUSTOMER CHECKS.** Test-store calls are excluded from the numbers by design, and every priced call so far is a test-store call. Not something I can manufacture. |

**Also still open (not §11):** spec 7.12 — the brain dying after Charlie has spoken while a usable
answer is already in the transcript should give a warm close, deliver the answer and mark the call
degraded. Today it drops the call and throws the answer away. It needs a status row with its Spanish,
so it is a build rather than a one-liner and did not ride along.

## Driven

- `test-listen-nav.ts` 43 · `test-call-events.ts` 72 · `test-delta-clip.ts` 42 (REAL provider socket +
  real carrier socket) · `test-bridge.ts` 13 · `test-runtime-spec.ts` 53 · `test-dropped-call.ts` 15
  (real db) · `test-map-e2e.ts` 93 · `test-map-sim.ts` 76 · `test-mapgraph.ts` 62. `tsc --noEmit` clean,
  `scripts/spec-gates.sh` ok.
- **REAL STAGING CHECK 204** (me, his Fun test store, on HEAD, after confirming no call was in flight):
  8 events, exactly one of each. **0 false transfers** where 199 had 10 · **0 unpaired `hold_end`** ·
  **`charlie_join` ONCE**, carrying question + clipMs + handoverVia + heldFrames in its detail. Real
  conversation, verdict `in_stock`, 5.3¢.
- **Both receipt doors compared byte for byte** on 199 and 204: by-room == by-id. Before the fix,
  by-room answered `seconds: null, cost: null` on 199.
- `.unlock` was opened for `src/voice/**` and deleted; the spec sweep confirms none is left behind.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
HEAD = aa7996454544 · origin/main = 55badd886004
staging  https://staging.checkitforme.com/ → LIVE (serving HEAD)
prod     https://checkitforme.com/ → NOT-LIVE (serving 55badd886004, HEAD is aa7996454544) — that IS origin/main: expected until the next promote
admin    https://admin.checkitforme.com/ → NOT-LIVE (serving 55badd886004, HEAD is aa7996454544) — that IS origin/main: expected until the next promote
```

**PM: promote wanted** — the receipt is honest now and every check teaches the map. Prod is still on
07-27's build, so neither fix nor the drift wiring reaches a paying customer yet.
