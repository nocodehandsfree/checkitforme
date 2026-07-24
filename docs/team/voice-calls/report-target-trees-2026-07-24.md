# TARGET PHONE TREES — five stores mapped for real (2026-07-24, PROD)

**Verdict: the tree VARIES by store.** The FIRST menu is word-for-word the same at all five. The
SECOND menu (the department list you get after pressing 2) is DIFFERENT at three of the five, and at
one store the digit 2 is the GROCERY department, not the desk. One chain-level recipe cannot serve
Target. Handing this back — per-store routes are an owner decision, not a mapping cleanup.

Method: `POST /api/admin/trainer/document` on PROD (`checkitforme.com`), one live call per store per
round, 11 calls total, 1:30–2:15 PM local at each store. Raw runs: Admin → Chains → Target → run log
(`nav_runs:1`), sessions dc3f8e00 / a866500a / 5f2755fc / 319e4eb1 / 87930346 (round 1, plain listen)
and bb39beb7 / b4faba28 / 997fb1d7 / f3c21c41 / 6b714eb8 / 62a3398c / bba3aa0f / 2abaed97 (round 2,
press-2-then-department). Seconds below are counted from the moment the store's line answers.

## What is the SAME at all five

1. A recorded greeting names the store: "Thank you for calling the <store name> Target store."
   It ends at 9–12s. Longer store names push everything later (Topanga runs ~8s behind Austin).
2. Then the FIRST menu, identical wording everywhere, finishing 17–24s:
   press 1 hours and location · press 2 reach a specific department · press 3 pharmacy
   (Super Targets add press 4 optical).
3. Digits pressed DURING the greeting are buffered and accepted — pressing 2 at 9s works.
4. In the SECOND menu, 0 is rejected ("Sorry, that response was invalid"). Three invalid entries and
   the system says "Goodbye" and hangs up.

## What VARIES — the second menu (this is the whole problem)

| Store | Second menu as read | Key to a person | Fire it at | Person answered |
|---|---|---|---|---|
| Mission Hills CA · 818-741-1855 | 1 electronics · 2 **food and beverage** · 3 general merchandise | **3** | 19s | 30s |
| Granada Hills · 818-360-2999 | 1 electronics · 2 **guest service desk** / pickup / drive-up | **2** | 20s | 45s |
| Topanga Canyon Blvd · 818-746-9922 | 1 electronics · 2 **guest service desk** / pickup / drive-up | **2** | 28s | 40s |
| Research Blvd, Austin TX · 512-837-5163 | 1 electronics · 2 **guest service desk** / pickup / drive-up | **2** | 17s | 33s (once rang out) |
| Coral Springs FL · 954-366-2134 | 1 electronics · 2 **guest services desk** · 3 HR · 4 food and beverage | **2** | 21s | 36s |

Three different department lists across five stores. Mission Hills has NO guest-service option at
all, and its 2 is groceries — the current chain recipe ("press 2, then press 2") sends every Mission
Hills check to the food department. Coral Springs keeps 2 on the desk but inserts HR at 3.

## Per-store record (greeting → menu → person)

- **Mission Hills CA** — greeting ends 9s · first menu ends 23s · department list read at 19s (when 2
  is pressed at 9s) · reaches a person on **2 @9s then 3 @19s** · a person answered at 30s: "Good
  afternoon, thank you for calling Target Mission Hills" (11s of ringing). On **2 then 2** the call
  lands in food and beverage. On 0 the system rejects it three times and hangs up on us at 45s.
- **Granada Hills** — greeting ends 10s · first menu ends 24s · department list read at 16s · reaches
  a person on **2 @10s then 2 @20s** · answered 45s: "Thank you for calling Target… how may I help
  you?" (25s of ringing). Hammering 0 also works but takes 73s.
- **Topanga Canyon Blvd** — greeting + first menu run together, ending 12–20s (longest greeting of
  the five) · department list read at 28s · reaches a person on **2 @20s then 2 @28s** · answered
  40s: "Thank you for calling Target. Hello." (12s of ringing). Hammering 0 also works, 50s.
- **Research Blvd, Austin TX** — greeting ends 9s · first menu ends 17s · department list read at 17s
  · reaches a person on **2 @9s then 2 @17s** · answered 33s: "Thank you for calling Austin North,
  how may I help you?" (16s of ringing). On an earlier identical call the same desk rang UNANSWERED
  past 110s — this store's desk answers sometimes, so a give-up rule matters here.
- **Coral Springs FL (Super Target)** — greeting ends 9–12s · first menu ends 23s (four options,
  optical added) · department list read at 21s · reaches a person on **2 @9s then 2 @21s** ·
  answered 36s: "Super Target, how may I help you?" (15s of ringing). Hammering 0 never reached
  anyone in a full 165s call.

## Why today's checks die in the menu

The locked chain recipe is `press 2 @8s, press 2 @16s`, navSeconds 16, `answerPath press:2>press:2`,
`phoneTreeDefault "To reach a live person: press 2, then press 2."` Two things are wrong with it:

1. **The second 2 means different things at different stores.** Right at 4 of 5, groceries at Mission
   Hills. There is no digit that is correct everywhere. (The 8s/16s TIMING is roughly fine — digits
   buffer during the greeting — but at Topanga the long greeting pushes the department list to ~28s,
   so a 16s second press can land before the list exists.)
2. **16 seconds is not when a person answers anywhere.** Measured today, press-2-then-the-right-key:
   30s · 33s · 36s · 40s · 45s. 16s is when the second press lands, not when a human speaks —
   anything reading navSeconds as time-to-human is 15–30s early.

The 16s recipe came from two runs on 2026-07-10 (Ventura Blvd) that recorded only our own presses,
heard nothing back, and ended as `done` — never `human`. It was locked on a call that never proved a
person answered.

## Handback — what I did NOT change

Nothing. `chains.navRecipe`, `navSeconds`, `answerPath` and `phoneTreeDefault` for Target are
untouched, and no other chain was touched. Averaging these five into one recipe would keep Mission
Hills broken and would still be 25s early on time-to-human, so it stays the owner's call.

Three ways forward, cheapest first:

1. **Per-store second key.** Keep "press 2" chain-wide, store the SECOND digit per store (2 almost
   everywhere, 3 at Mission Hills). Needs a per-store nav field, which does not exist today.
2. **Read the department list live.** Press 2, listen to the list, pick the guest-service option by
   ear. Costs one cheap listen per call and survives any store's wording. Slower per check.
3. **Chain recipe = press 2 only,** then let the listener handle the department list. Same as 2 but
   keeps the first hop deterministic.

Also true regardless of which is chosen: the time-to-human on Target is 40–50s, not 16s, and some
guest-service desks simply never answer (Research Blvd), so a give-up rule has to exist.
