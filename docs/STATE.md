# STATE — the owner's single source of truth
One screen. Every session updates this at close (≤40 lines). New truth REPLACES old — history is in
git. Last updated: 2026-07-30 (check status page has its big step window; verdicts read as they happen).
## The check status page tells you where the check is, in one big line (07-30, on staging)
- The glowing box now says `Calling` → `Getting through the menu` → `Talking to Staff` instead of just the
  store name, with the store's mark big behind it. The step log and the scroll-back reveal are untouched.
- **Open, and next up:** the conversation still slides under Safari's bottom bar. A first attempt at
  that made it worse and was reverted the same day.
  Handed off in `docs/tasks/site-check-status-fixes.md`. Alerts (no double subscribing, new wording) is second.
## Verdicts are worked out while the check runs, not after it (07-30, on staging)
- We used to wait until the check ended to start reading what Staff said. Now it is read as it happens, so the
  answer is ready the moment we hang up. Nothing changed on the line and the two-reads-must-agree rule is intact.
- **Still slow:** we wait on ElevenLabs' own read. Dropping it needs your call — the trade-off is in the task file.
## A wrong department no longer costs you the check (07-30, on staging)
- We ask once to be put through, stop paying while they hand us over, and ask again when somebody new
  picks up. A switch in Calls → App turns it off. Only your phone can test the real words.
## The bottom bar can never go dark again, and Live is cleaned (07-30, live on Admin)
- **The tint is nailed down**, three ways it used to break are refused before anything goes live. Still cannot see
  an iPhone. **Live is cleaned:** Cost per check opens on **The baseline**, your 6.7¢ ceiling off your real prices.
- Prices are switch rows (07-29): type a number, tap away, saved, **no Save button**. A word bounces back.
## Chains: the page is rebuilt and every mapping call now lands on it (07-30)
- Tap a chain: **nav time** (getting through their phone menu, the part we control), what that costs, and how
  often the recipe reaches Staff. **Menu** has Daytime · After 9pm · Spanish. **Recipes** shows v1, v2 with the
  date each locked. **Review** names the store and its buttons now DO the thing they say.
- **The big fix:** Re-map called a real store and told the chain page nothing. Every call feeds the map now.
  **Re-map hangs up on the second ring** of the desk, so it never troubles Staff, and that call becomes the
  recipe. A call that ends on the ring counts as the good map it is, and **Reached Staff shows nothing instead
  of 0%** until a call actually waits for one.
- **CVS is mapped and proven** (07-30, two real checks): **nav time 53s**, the average of 51s and 55s, so a new
  check nudges the number instead of overwriting it. **The menu is written down line by line in CVS's own
  words**, which it was not before: a re-listen used to fire its answers on a stopwatch and start listening
  only afterwards. **The stopwatch is gone.** One question gets one answer, and if the menu asks twice we say
  the same answer again instead of spending the next one.
## The new calling engine is ON for staging. Your six test calls are the last thing (07-28/29)
- **Nothing to flip.** A check from staging.checkitforme.com goes through the new engine. **Listen for:** it asks
  once and waits · no keypad beeps once you are talking · after a hold it asks you again if you might be new.
- **Waiting on YOU:** the six calls, and whether we pay to upgrade our voice — the phone company won't let us use
  our own cheaper thinking with a copied voice, over half of every check.
## PROMOTED 07-27 — the five site fixes, the rebuilt plans and checkout, the call recording and the Use it / Keep the old one buttons are live. **Nobody has seen any of it: the real site still shows the coming-soon splash.**
## Waiting on YOU: hide the fake (simulated) poll rows from the Admin feedback queue? (yes / no) · Next: docs/tasks/INDEX.md.
