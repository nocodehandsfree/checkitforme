# The support chat answers store questions from nothing

**System:** support · **Status:** active, not started · **Found:** 2026-08-05, round 1 test 4

## What happens now
Asked "do you check the Target in Glendale?" the chat answered **"Yes, you can check the Target in
Glendale. Just pick it as your store and tell us what you're hunting for. We'll handle the call for
you."** Asked "what about GameStop stores?" it answered **"Yes, GameStop stores can be checked too.
Just choose a specific GameStop location and let us know what you're looking for."**

It has no idea. The support agent reads the book and approved answers only; it never touches the
store table, so both answers are guesses that happened to sound confident. It used to hedge ("I'm
not sure if we check…"), which was at least honest, and it now states them flatly, which is worse.

## Two things to settle first
1. **GameStop.** The owner says GameStop should not be callable at all. The staging store table
   disagrees: a search returns GameStop rows with `callable: true`, `callReady: true`,
   `isMSRP: true`. So the chat's "yes" currently matches the site. Either the site is wrong and
   GameStop rows need switching off, or the rule is narrower than "GameStop". **Owner's call**, and
   it is worth more than the chat wording: whatever the site says today is what customers can do.
2. **What the agent is allowed to say.** "Yes we can call that exact store" is a promise. It should
   come from the same `callable` / `callReady` flags the store list uses, so the chat and the site
   can never disagree.

## Done when
- The chat can answer "do you check <store or chain>?" from the store table, not from the book, and
  says plainly when a store is not one we can call.
- A store the site greys out as not ready is never promised in chat.
- `node scripts/robot-support.mjs 4` scores 10/10, and a new scenario asks about a chain the site
  does not call and gets a clean no.

## Related, same lane
**"How long does a check take?"** is answered "about two minutes" from the book, and the chat missed
even that (round 1 test 5). Mapping now records every step of a store's phone menu instead of
assuming a flat 60 seconds, and the real number already renders under the button on the store
select. Once mapping has covered the stores, that per-store number should feed the chat so the
answer is that store's real menu time, not an average. Blocked on mapping, not on this task.
