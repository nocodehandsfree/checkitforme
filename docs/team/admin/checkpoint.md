# ADMIN — checkpoint (current state)
> The one operator dashboard `public/app.html` + `/api/*`. Ships LIVE via `bash scripts/ship-admin.sh`
> (never waits on a promote); server halves ride the promote train. Charter: `handoff.md`.
> Volatile — REPLACE stale lines, newest on top, ≤60 lines.
## 2026-08-06 PM — the check sheet tells the truth: ONE clock in real milliseconds, the card, the status, the charge
- 🔴 **ORDER COMES OFF ONE LIST IN MILLISECONDS.** `receipt-store` rounded the spoken lines to whole seconds at
  persist and `checkV2From` spliced two rounded lists by comparing seconds. Now `atMs` rides both (`transcript
  Timed`, the 16-line copy, BOTH receipt routes), every row is filed by its millisecond and the log sorts ONCE at
  the end. Seconds-only records keep their second. **Never add a second place that decides order.**
- 🔴 **A CHECK'S STATUS WORDS COME FROM THE SITE THE CHECK CAME FROM.** `/api/statuses` is a CONFIG_READ (always
  prod) while Testing reads checks off staging, which carries statuses prod has not got: check 345 was filed
  staff_hung_up and the sheet printed "Nobody answered". `statusFor(key)` = `SRC_STATUSES` then `STATUSES`, ONE
  lookup; `verdictKey` trusts a present key; an unknown key reads as its own words, NEVER as another status.
- 🔴 **A 22px marker in a `display:grid` box is NOT centred:** the track grows to 22px in a 15px box and starts left. The rail is `display:flex;justify-content:center`; measured at 390px, one centre.
- Charged is a FACT: the finalizer bills BEFORE the tail, `recordVerdict` reads `chargedAt`, the sheet reads
  `charged` off the receipt route, and `/api/calls/:id/receipt` finally SENDS `chargedAt`. Scorecard untouched.
- **NEXT ROUND, owner 08-06 PM, agreed not built:** the log's marks come from Statuses, never from us (the
  status circle draws our own tick/cross/dash; five statuses hold an emoji not a lucide name; a hold row is a
  plain dot and should be `pause`) · an "Issue:" row prints the scorecard row's NAME, so a failed "Charlie
  ended the check" reads as a claim that he did · **Total time is `call.callSeconds`, the PROVIDER's last
  session (0:19 on a 143s check 348, 0:08 on 84s check 347), and it feeds the reports** · both hold rows draw
  ~6s late: `beginHold`/`endHold` carry the true backdated `atMs` in their detail and `emit` stamps `now`.
- 🔴 **A MOMENT IS NEVER MEASURED FROM SOMEBODY ELSE'S ZERO** (check 345: the greeting drew at 1s over "The line
  was answered" at 2s). `recordLine` takes the EPOCH moment now and the receipt does the subtraction; a value too
  small to be an epoch is refused. Staff lines are filed at their voice start (`theirVoiceStarts` in `bridge.ts`,
  VOICE_FRAMES sustained). Measured vs the robot: was 3.3s late, 6.1s after a hold; now within ~1.2s.
## 2026-08-02 — Statuses page + the confirm sheet (SHIPPED LIVE + DRIVEN in a local browser)
- 🔴 **`askSheet` ALWAYS resolved false:** `ok.onclick` closed the sheet BEFORE `finish(true)` and `sheetclosed`
  fires synchronously, so every Yes in the Admin read as a cancel, all six call sites. ANSWER, then close.
- 🔴 **A body-level layer over the sheet is eaten by the tap-outside listener** (capture-phase `stopPropagation`
  in `_ensureSheet`); `#iconpick` is exempt and any future overlay must be too.
## 2026-07-30 — Voice ▸ **Test calls** is the new-engine scorecard (@5b1f325, SHIPPED + DRIVEN)
- `src/calls/behaved.ts` = the PURE scorer on the SAME `/api/admin/receipt/:room` envelope, NO second route. 79 asserts in `scripts/test-behaved.ts`. Page = comp 1c.
- 🔴 **THREE STATES, NOT TWO.** A gray dash = this check never put that rule to the test; a cross for "nobody put us
  on hold" is a lie and a tick is worse. Same law as an unstamped cost never printing as nought.
- 🔴 **`status` and `statusKey` are TWO fields, never merged.** **PM: promote wanted**, this page's server half is staging only.
## 2026-07-30 — Unify GATE + page 1 (Live) shipped (@71b724a5). **dash is SEALED. Next page: App (settings).**
- `scripts/qa-admin-unify.mjs`. A page = its `<section>` + its `TAB_LOADERS` loader body + a `chrome` page. It
  fails on a SECOND way to mark a hint, on-page directional copy, the UNTRUE list and his-words. Both lists are IN
  the script: GROW them, never weaken one to pass a page (`unless:` covers ordinary English). **RATCHET:** only
  ids in `SEALED` are enforced, so the sweep cannot brick the ship path; seal a page as its session's LAST step.
- **The ONE hint standard is `data-tip` + one `[data-tip]::after{content:"ⓘ"}` rule** (tap-to-show). 🔴 The comp
  board's "tooltips become gray lines" is OLDER than the shipped pattern; never "fix" the Admin back to them.
  ⚠️ Calls/Testing still put `title=` on the status icon; `aria-label` carries it, so both drop it on their pass.
## 2026-07-29/30 — Policy is a console (@0f2b6b7e) · the iOS bottom tint is LOCKED (owner order)
- 🔴 **CHECK BEFORE YOU CUT:** the queue said cut Policy's pricing form, the comp said the OPPOSITE and only the
  GRAMMAR was wrong. Console pattern: a row saves on `change`, merges its sub-object, re-reads the PATCH response.
- 🔴 **Driving the Admin in a browser: FIRST Compute entry in `docs/shared/GOTCHAS.md`, to the letter** (no internet
  for Chromium). `qa-tint-lock` covers `app.html` 28/28 in the push gate and ship-admin: **only `.sheet` may be a
  filled `position:fixed` on `bottom:0`** and a closed sheet is `display:none`. No iOS here, he reads that edge.
## Reference + traps (detail in git and in the task files; only what a future session trips on)
- Ops 07-28: `src/calls/ops.ts` is a PURE roll-up owning NO scale; unstamped = not counted, NEVER a zero.
- 🔴 main is an UNRELATED history, so **any future promote hits that wall.** 🔴 **ship-admin's override is NOT
  git**: shipping from a branch never merged to `staging` gets WIPED by the next ship, so ALWAYS merge first.
- `chainLogoInfo` gives ANY store row its logo. `api()` GETs staging when CALL_SRC==='staging'; **writes ALWAYS prod.**
- **NEVER invent copy, grep + reuse.** ⚠️ Alerts editor shipped, the SITE still reads hardcoded copy. **OPEN owner
  asks:** hide `sim_` poll rows from Feedback · his email on PROD · store LOGOS on site alerts · an account view.
- **KIT** (app.html `<style>`; comps `ADMIN_COMPS.dc.html`, RENDER it, never read it): hero = ONE number +
  honest spark · `.peek` · ONE sheet openSheet/closeSheet/`askSheet`, NEVER `confirm()` · `.k-eyebrow`/sub/
  note · `logoTile`/`logTile` for ANY store row · `.mladder` · `.k-switch`/`.k-num` on a console.
