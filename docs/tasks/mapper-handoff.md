# Task: Mapper — finish the chain page, then map chains

The owner has been reading the live Chains screen all day and calling out what is wrong. Everything
below is his, in his words, raised 07-30. He wants every one resolved before mapping starts, and he
wants anything he raises next resolved the moment he raises it. Nothing here is optional.

Boot: `git checkout staging && git pull --rebase` · `docs/STATE.md` · `docs/team/voice-calls/checkpoint.md`
· `docs/specs/mapping-admin/plan.md` (the box) · `copy.md` (every string; a control panel talks to nobody).

## 1. Every retry must run exactly the same way
> "Every time we try back it needs to be working the exact same way or the results could be different."

The speed-up calls do NOT run like the listening calls. They play our answers on one timer with the
listener opened only at the end (`navInitialTwiml`, the `s.barge?.plan?.length` block), so they record
almost none of the menu, while a re-listen answers each prompt as it hears it. Two different behaviours
producing two different records of the same store.

**Build:** one behaviour for every mapping call. The listening loop walks the route; the ONE step being
tested early fires on its second; every other step fires on its prompt. The `relisten` path in `navTurn`
is already this shape — generalise it rather than writing a second one.

## 2. The date beside the recipe
> "today is July 30th he did not fix the date where are you pulling the date from?"

It reads `lastVerified` on the map row, which is the live recipe's `approvedAt`. For CVS that is
**25 June 2026** — real, not a bug, but not what he expects to see. (The January 1970 he saw earlier WAS
a bug: seconds read as milliseconds. Fixed 07-30.)

**Decide with him, then build:** he almost certainly wants *last confirmed by a check*, not *first
approved*. Both facts exist. Ask which, label it so the word says which one it is, and never print two
different dates for the same thing on two screens.

## 3. "Mapped checks", and the speed gain belongs on each one
> "where you put the time faster you've ruined the page that's out of place... that should be placed
> upon each new call and retry that we do under mapping. The section should be called 'mapped checks'"

The gain was briefly put on the vitals at the top and has been REMOVED again, so the page is not left
wrong. It was never shipped anywhere else.

**Build:** rename the Mapping calls section to **Mapped checks**, and put the gain on each check card,
against the check before it. The numbers already exist on the map row (`firstSeconds`, `bestSeconds`,
`savedSeconds`, now computed off nav time so they actually fill in) — this is placement, not new maths.

## 4. Colours for Alpha, Bravo and Direct on All stores
He has colour changes he wants on the All stores screen. **Ask him for them before touching anything.**
Today: Alpha `#F4B740` · Bravo `#38BDF8` · Direct `var(--green)`, used on the chains list, the chain
header and the menu ladder. Whatever he picks has to change in all three or they will disagree.

## Then, and only then: map chains
Mapping a chain from nothing is `POST /api/admin/mapper/start {chainId}` — the four phase run that
listens, locks a baseline, then tries the short word and tries answering earlier until nothing new wins.
`POST /api/admin/trainer/document` is ONE check and does none of that; it is for re-listening to a route
already held. **Walgreens (chain 10) is next.** Its live v1 is the hammer route `press 0 ×4` and its own
note says an auto-caller pressed the same key repeatedly, so it needs mapping from nothing, not a
re-listen. Nine stores, all Pacific. It is keypad, so it also proves the menu ladder prints **ALPHA**;
CVS proved BRAVO.

## What is already done and must not be re-broken
CVS (chain 5) is mapped and proven on seven real checks to Lanett (11373): nav time is the AVERAGE of
its checks, the menu is voted on line by line across every check, a check we ended reads **Admin hung
up**, Review is empty, and the clock is gone from a re-listen. The traps behind each of those are in
`docs/team/voice-calls/checkpoint.md` — read it before changing any of them.
