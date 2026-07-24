# TARGET PHONE TREES — 59 stores called live, 24 states (2026-07-24, PROD)

**Answer: there is ONE Target menu, not a million. 55 of 59 stores put the guest service desk on 2.**
Four stores have no guest service option at all — on those, 2 is the food department. So
`press 2, then press 2` is right ~93% of the time and lands in groceries the rest. The four misses
are not predictable from anything in our store records, but every store READS ITS LIST OUT LOUD
before we have to choose, so a miss is detectable on the call itself.

Nothing was changed. The Target chain row (`navRecipe`, `navSeconds`, `answerPath`,
`phoneTreeDefault`) is untouched and no chain other than Target was called.

## The sample

Round 1 (morning): 11 calls, 5 stores — Mission Hills CA, Granada Hills CA, Topanga Canyon Blvd CA,
Research Blvd Austin TX, Coral Springs FL. Mapped all the way to a person.

Round 2 (2 PM PT): 54 documentation calls, 54 more stores, 2 per state across CA WA OR NV AZ CO UT
TX OK MN IL MI OH GA FL NC VA PA NY MA TN MO plus 10 extra California stores. Each call: press 2
during the greeting, listen to the department list, hang up before anyone answers. ~33s per call, no
employee spoken to. Method: `POST /api/admin/trainer/document` with a one-step barge plan.

## What every Target does the same

1. Greeting names the store: "Thank you for calling the <store> Target store." Ends 9–12s.
2. First menu, identical wording everywhere, ending 17–24s: **1** hours and location · **2** reach a
   specific department · **3** pharmacy (Super Targets add **4** optical).
3. Digits pressed DURING the greeting are buffered and accepted — pressing 2 at 9s works everywhere.
4. The department list starts ~7s after the press and is read in one breath.
5. Press something invalid in the department list and the store says "Sorry, that response was
   invalid" and **re-reads the whole list**. Three invalid entries and it says goodbye and hangs up.
6. 0 is invalid inside the department list. At the FIRST menu 0 does reach a person, but slowly
   (50–73s) and it failed outright at two stores.

## The department list — two shapes, one of them rare

**Shape A — 55 of 59 stores (93%).** "For electronics press 1, guest service desk or order pickup or
drive up press 2" — then, at bigger stores, "food and beverage 3, apparel and accessories 4, human
resources 5, Starbucks 6, wine beer and spirits 7". The extra options are appended at 3 and up;
**2 never moves.** Some stores phrase it "for the guest services desk press 2" with HR at 3. Same 2.

**Shape B — 4 of 59 stores (7%).** No guest service option exists: "For electronics press 1, for food
and beverage press 2" and sometimes "for general merchandise press 3". The person is on **3**, or on
2 if there is no 3. The four: Mission Hills CA · Victory Blvd North Hollywood CA · UC San Diego Price
Center CA · Cambridge St Boston MA. Three of the four are small-format stores; our store records hold
no size or format field, so we cannot pick them out of the database today.

## Time from answer to a person (round 1, correct key, measured)

Mission Hills 30s (2 then 3) · Research Blvd Austin 33s · Coral Springs 36s · Topanga 40s ·
Granada Hills 45s. The chain's `navSeconds` is 16, which is when the second press lands, not when a
human speaks. That 16s came from two runs on 2026-07-10 that heard nothing back and ended `done`,
never `human` — it was locked on a call that never proved a person answered.

Research Blvd's desk rang unanswered past 110s on one call and answered in 33s on the next, so a
give-up rule is needed regardless of which route is chosen.

## Applying it per store — the options, cheapest first (NOT implemented)

The store tells us the answer out loud, every call, before we have to choose. That is the opening.

1. **Read the list, match the words, press the digit.** The department list arrives as text through
   the same Twilio transcription that produced every quote in this report. "guest service desk … press
   2" → press 2. That is plain text matching (`parseMenuOptions` in navigator.ts already does exactly
   this) — no AI model, no Charlie, nothing on the expensive lane. It also self-corrects: on shape B
   there is no guest service line, so the same matcher takes general merchandise instead. Open
   question I have NOT answered: what Twilio charges for the extra speech recognition on a live check.
2. **Learn it once per store, off real traffic.** The first check that hears a store's list stamps
   that store ("desk is 2" / "no desk, person is 3"). Every check after that fires the digit blind and
   deterministic, exactly like today. 1,746 Targets teach themselves; no mapping campaign, no extra
   calls. Needs a per-store nav field, which does not exist yet.
3. **Wrong press, same call, no redial.** Because Target re-reads the list after an invalid entry, a
   wrong guess costs about 10 seconds inside the call. Hanging up and dialing back costs a whole new
   dial plus another 25 seconds of greeting, and it doubles the number of times we ring a store.
4. **Keep 0 at the first menu as the last resort.** Slower (50–73s) and it fails at some stores, but
   it never needs to understand the department list.

A blind chain-wide "2 then 2" with no listening keeps the 4-in-59 broken forever, and would still be
15–30s early on time-to-human.
