# The check-life audit (PM, 08-01) — why fixes keep missing, and the whole fix list

Two blind readers over the engine, after five test-day runs. **84 code sites can touch a live
check's life. 20 are wrong: 8 still ask ElevenLabs whether a check is alive, 12 can act at moments
they must not.** Every 08-01 fix was correct AND each closed one door of a pair — the sibling stayed
open. This file is the complete door list. RULES.md #11 applies: each family fixes in ONE commit.

## Family 1 — still trusting ElevenLabs for aliveness (the run-1/2/3 fault, 5 doors left)
- `server.ts:3448` `/pub/result`'s own finalize: guarded only by the in-memory receipt lookup at
  `:3391` — after a restart, or once the receipt (15 min) or conv→room map (10 min) expires, it
  writes a verdict + CHARGES off ElevenLabs' word. The third finalize path; `lineStillUp` never sees it.
- `server.ts:3541` `/pub/live` last-resort branch: raw ElevenLabs status → `live:false`, no receipt.
- `server.ts:3524-3535` `/pub/live` D-lane escalated branch: ElevenLabs OVERRIDES our own session —
  a Charlie closed for a hold reports the check dead. The D-lane never got the run-1 fix at all
  (`/pub/result`'s delta branch answers from the row, not the receipt: `server.ts:3371-3384`).
- `server.ts:2917` admin "restore from ElevenLabs history": inserts finished rows straight off the
  provider; can duplicate a live bridge check.
- `bridge.ts:775-779` voicemail phrase in a transcript closes BOTH legs off provider text — no
  `onHold`/`humanAtMs` guard: a misheard line mid-hold can hang up on real Staff.

## Family 2 — can open Charlie at a moment it must not (the run-5 fault, siblings left)
`triggerConnect`'s human/hold gate (`bridge.ts:836-844`) is correct but the CLIP path never passes
through it: `prewarmTimer` (`bridge.ts:1050`), the short-clip immediate open (`:1051`), the
socket-retry open (`:1052`), and all four racers into `openCharlieGate` (`:452`; reached from
`:513,:515,:519,:1086`) call `connectEleven` with no `onHold` check. A hold starting in the opening
clip's last two seconds still opens a ghost Charlie. Also `bridge.ts:831`: recipe keypad presses
keep firing after a human is found (`stopKeysOnHuman` only covers the other lane).

## Family 3 — quiet clocks that erase the guards (nobody has re-audited these)
- `bridge.ts:106`: the bridge's memory of the check expires at 300s — the SAME length as the longest
  staging call. At the cap, the hold-reopen rule reads undefined and a hold-close ends the whole check.
- `bridge.ts:706`: the conv→room lookup dies at 10 min while the receipt lives 15 — the run-3 fix
  silently falls back to ElevenLabs in that gap.
- `events.ts:171`: an expired/unknown receipt makes `lineStillUp` answer "line is down" (fail-open) —
  also true for any row that never got its `room` written (`events.ts:389`, webhook gate no-ops).
- These gaps are unreachable today ONLY because no check outlives 5 minutes. The owner's wanted
  hold hang-up timer is exactly the change that makes them live. Fix the clocks FIRST.
- Single machine only: every guard is one process's memory. A second Railway replica reopens every
  door. Do not add replicas before the guards move to the database.

## The four open faults, answered
1. **"No worries" to every fragment:** there is no our-side assembler — one provider turn = one
   reply, and our own machinery MANUFACTURES fragment boundaries: the echo gate drops inbound frames
   while Charlie speaks +150ms (`bridge.ts:1055-1057`), and held audio is replayed with an injected
   800ms gap (`:429-437`) — each hole becomes a turn, each turn another "take your time." Fix =
   assemble utterances (debounce the reply until a real pause) and/or run the agent patient with
   early-guessing off (`elevenlabs.ts:139-154`, `speculative_turn` is ON today).
2. **Never-dialed check shows a dead Testing row:** the row is created BEFORE dialing
   (`service.ts:737-745`) but its receipt key (`room`) is only written after a successful dial
   (`:783`); pre-dial refusals stamp a status with no room, and the Testing list renders room-less
   rows as dead tiles (`app.html:6699-6701`). The refusal receipts EXIST but are orphaned under a
   room the row never learned (`bridge-place.ts:88,115,193`). Fix = write the room on the row at
   receipt-open, before the dial.
3. **"No charge" vs "1 check used" on a hold drop — OWNER RULED 08-01: CHARGE.** A hold-drop check
   is charged; only a genuine failure on OUR side is free. The biller (`service.ts:1154`) and the
   refund list (`credits.ts:25-31`) are BOTH correct and stay untouched. The wrong writer is the
   page copy at `checkit.html:6469` — rewrite it to match (site is frozen: that one string is a
   boxed Webbie task, English + Spanish, per the copy guide).
4. **Page bounce / doubled question:** confirmed still reachable — the echo-drop is one-shot and
   exact-string only (`bridge.ts:787`), the relay channel is never deduped (`:745,:797,:510`), the
   client appends blind (`checkit.html:6025`) and re-renders + smooth-scrolls on every tick
   (`:5801,:6090`). Fix = dedupe where lines are RECORDED and RELAYED (fuzzy, not `===`), and stop
   re-scrolling when nothing new arrived.

## The smarter shape (the actual cure)
Stop guarding 84 doors. Build ONE gatekeeper: a single function that owns every question about a
check's life — may Charlie open now? may Charlie close? may a verdict be written? is this check
alive? — answering ONLY from our receipt + the carrier, with the state kept in the database, not in
one process's memory. Every site in this file then calls the gatekeeper instead of deciding for
itself; the inventory above is the rewiring checklist, family by family, one commit per family,
prior runs replayed clean on the rig before the owner dials (RULES.md #12). When the last caller is
rewired, this whole class of fault cannot recur — there is one door left to guard.
