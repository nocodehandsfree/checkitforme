# The result screen tells them to try again and gives them no way to do it

**What:** When a check ends without an answer we say "No charge. Try again" and then the only button
on the screen sends them to a DIFFERENT store. The customer who wanted this store has to back out and
rebuild the whole check by hand. Owner-named 07-30.

**System:** site (`public/checkit.html`).

## What is actually on the screen today
`showResult()` builds one `primaryCta`, and for a signed-in customer it is always the same button:

```
<button class="cta" onclick="backToBuilder()">Check another store</button>
```

Meanwhile the note above it, for every outcome where nobody was reached, ends in "Try again":

| Outcome | The note says | The button offers |
|---|---|---|
| Nobody answered | "No charge. Try again in a bit." | Check ANOTHER store |
| Line was busy | "No charge. Try again shortly." | Check ANOTHER store |
| Left on hold | "No charge. Try again." | Check ANOTHER store |
| Store closed | "No charge. Try again when they're open." | Check ANOTHER store |

So the words and the button disagree, on the four outcomes where the customer is most likely to feel
they got nothing. Two costs: they may believe the check was spent (it was not, `o.charged` is false),
and the one thing they want, this store again, is the one thing the screen will not do.

## The shape
1. **Loud status.** On a no-answer outcome the screen has to say, unmissably, that no check was spent.
   "No charge" is currently the tail of a subhead sentence. It belongs where the eye lands.
2. **Retry the SAME store.** The primary button on those outcomes re-runs the check the customer
   already built, same store, same product, one tap. "Check another store" drops to secondary.
3. **Respect the cooldown.** `too_soon` already comes back from the server with `retryAfterMin`. A
   retry button that fires straight into a rate-limit toast is worse than no button. If the store is
   in cooldown, say when they can go again instead of offering a tap that fails.
4. **Store closed is not a retry.** Nothing to retry until they open. That outcome keeps its own
   wording and does NOT get the button.

## Done when
1. On no-answer / busy / left-on-hold, the primary button re-runs the same store and product.
2. That screen states plainly that no check was spent, at hero level, not buried in a sentence.
3. "Check another store" is still reachable, as the secondary action.
4. A store inside its cooldown window shows when it can be checked again, and no dead button.
5. Store-closed keeps today's copy and gets no retry button.
6. Every new string ships EN + ES in the same commit, checked at 375/390/430 for wrapping.
7. Driven on staging end to end: force each of the four outcomes, tap the retry, watch the same store
   dial again. Not "the code path looks right".

## Watch out
- **The check-spend claim has to be true.** `o.charged` is the only honest source for whether a check
  was used; the timeline already prints "1 check used" off it. Read it, never assume.
- The result screen is rebuilt by `showResult()` on every repaint, including the `status==='pending'`
  placeholder, which deliberately shows animated dots and NO cta so it never reads as calling again.
  Do not let a retry button appear on the pending render.
- The four outcomes come from the owner-edited Statuses registry (`RSTATUSES`) as often as from the
  hardcoded branches. Key the behavior off the outcome, not off a copy string.

**Reference:** `showResult()` at `public/checkit.html` ~6348, `primaryCta` ~6489, the card markup
~6543, the unreachable notes ~6290 to ~6318, the `too_soon` handling at ~5448 and ~5844.
`public/checkit.html` is frozen: needs the `.unlock` flow, then re-snapshot the page.

**Status:** ready

**Sibling:** `site-check-status-loud-retry.md` owns the LIVE status page during a check. This one owns
the screen AFTER it ends. They touch different renders; do not merge them.
