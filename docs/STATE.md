# STATE — the owner's single source of truth
One screen. Every session updates this at close (≤40 lines). New truth REPLACES old — history is in
git. Last updated: 2026-07-30 (a wrong department no longer loses the check; Chains rebuilt; six calls open).
## A wrong department no longer costs you the check (07-30, on staging)
- Reaching the pharmacy counter used to fail the check and the customer paid to try again. Now we ask once to be
  put through, stop paying while they hand us over, and ask again when somebody new picks up. Same check, one
  answer, and it tells us that store's route is dropping us at the wrong desk.
- **A switch, default on**, Calls → App: "If we reach the wrong department, ask Staff to transfer us". Off = never
  ask, exactly like before, if you ever want it paid-plans-only.
- **I could not test the real thing:** someone has to answer as Staff and say "this is the pharmacy", and that is
  your phone. Everything the system does around those words I drove and watched work.
## Your test calls grade themselves. Voice → Testing (07-30, live on Admin, set the switch to Staging)
- One line each: **`5.4¢ · not in stock`**. Tap one for **Did the new engine behave**, four rows ticked or crossed:
  asked once · no keypad at a person · meter stopped on hold · mapping held, each with what actually happened. A
  **gray dash** means that call never tested the rule. **No red cross and no real hold seen yet** — the one that
  proves it is you calling the Fun store and walking away for 30 seconds.
## The bottom bar can never go dark again, and Live is cleaned (07-30, live on Admin)
- **The tint is nailed down**, three ways it used to break are refused before anything goes live. Still cannot see
  an iPhone. **Live is cleaned:** Cost per check opens on **The baseline**, your 6.7¢ ceiling off your real
  prices. Three meters moved off that page, none deleted. A cleaned screen cannot rot back.
## Prices are switch rows (07-29): type a number, tap away, saved, **no Save button**. A word bounces back.
## What a check costs (07-28) says "no finished checks yet" and that is TRUE: only test-store calls are priced and those never count. Your first real check fills it in, after a release.
## Chains: the page is rebuilt and every mapping call now lands on it (07-30)
- Tap a chain: **nav time** (getting through their phone menu, the part we control), what that costs, and how
  often the recipe reaches Staff. The wait for Staff to pick up is no longer counted against the menu. **Menu**
  has Daytime · After 9pm · Spanish, because CVS reads a different menu at night and we used to file that as the
  map breaking. **Recipes** shows v1, v2 with the date each locked. **Review** names the store, shows what we
  expected against what we heard, and its buttons now DO the thing they say.
- **The big fix:** Re-map called a real store and told the chain page nothing. Every call feeds the map now,
  whoever started it. **Re-map hangs up on the second ring** of the desk, so it never troubles Staff, and that
  call becomes the recipe.
## The new calling engine is ON for staging. Your six test calls are the last thing (07-28/29)
- **Nothing to flip.** A check from staging.checkitforme.com goes through the new engine. The store hears the
  question the second they say hello, in our own voice, and if Staff walk away we stop paying. **Listen for:** it
  asks once and waits · it never beeps the keypad once you are talking · after a hold it knows time passed, and if
  it might be a different person it asks you again instead of talking to you like the first person.
- **Waiting on YOU:** the six calls, and whether we pay to upgrade our voice — the phone company won't let us use
  our own cheaper thinking with a copied voice, over half of every check.
## PROMOTED 07-27 — the five site fixes, the rebuilt plans and checkout, the call recording and the Use it / Keep the old one buttons are live. **Nobody has seen any of it: the real site still shows the coming-soon splash.**
## Waiting on YOU: hide the fake (simulated) poll rows from the Admin feedback queue? (yes / no) · Next: docs/tasks/INDEX.md.
