# Voice ▸ Testing becomes the new-engine scorecard for test calls

**System:** admin · **Status:** active — UNBLOCKED 07-29 (Addie's jobs 1 and 2 are done; one agent in `app.html` at a time still holds).
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

**The screen, so nobody guesses (owner walked it 07-29):** LOG page grammar. Title `Test calls`,
sub `Fun store and owner-only stores. These never touch real-store stats.` One list, newest first:
logo tile · time · verdict pill · cost (`1.7¢ · nobody answered`). Tap a row → the SAME receipt
sheet Calls uses, with one new card on top titled `Did the new engine behave`, four rows, each a
green check or red cross:
· `Asked once` — tip: "One question, then the wrap. A second ask after a hold is a fail."
· `No keypad at a person` — tip: "Zero keypad presses after a human was heard."
· `Meter stopped on hold` — tip: "The thinking closed when the hold started and returned as a new
  segment of the same call. Segments are listed below."
· `Mapping held` — tip: "Direct store: no steps fired and the agent opened at the person. Mapped
  store: every step fired on the store's recording, never the clock."
Below the card, the cost split the owner reads first: `Menu` (line + listening before a person) vs
`Charlie` (agent seconds), same rows the check sheet already prints.

**Done when:** the owner places a Fun call and reads pass/fail on his phone without opening a log ·
driven in a phone-sized browser on shipped Admin bytes · verify-live output pasted below.

**THE CONTRACT (LAW 2, written 07-30 before any code). Ten assertions, each testable:**
1. `behaved()` (new `src/calls/behaved.ts`, PURE) returns exactly four rows, fixed order, each
   `pass: true | false | null`. `null` = this check never put that rule to the test — a cross for
   "nobody put us on hold" is a lie and a tick is worse (same law as an unstamped cost).
2. **Asked once:** two stock questions in what the agent said → false · one → true · a second
   greeting → false · nothing written down → null.
3. **No keypad at a person:** an `alpha_press` at or after `human_detected` → false · a person and no
   press → true · no person → null.
4. **Meter stopped on hold:** `hold_start` with a `charlie_leave` after it and a `charlie_join` after
   `hold_end` → true · a hold the agent sat through → false · no hold → null.
5. **Mapping held:** direct store (no plan on `dialed`) with zero steps and the agent opening at or
   after the person → true; any step fired, or the agent opening before the person → false. Mapped
   store: every step `via:"prompt"` → true; any step on the clock, or none fired → false.
6. `GET /api/admin/receipt/:room` carries `behaved` on the SAME envelope (no second route), and a
   room with no events still 404s exactly as before.
7. `GET /api/admin/test-calls` rows carry `room` · `lane` · the readable cost · verdict words · the
   logo fields every other store row uses. No new route.
8. Testing reads as comp 1c: title `Test calls`, one list newest first, each row logo tile · time ·
   cost + verdict words · verdict icon. Tapping opens the SAME sheet `openReceiptInto` renders.
9. The card `Did the new engine behave` sits on top of that sheet, four tooltipped rows, then the
   `Menu` vs `Charlie` cost split. The card shows ONLY when opened from Test calls.
10. Testing follows the header Live/Staging switch on the list AND on the sheet · `npx tsc --noEmit`
    clean · `scripts/test-behaved.ts` green · no new nav entry (LAW 4).

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
