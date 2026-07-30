# The chain page rebuild, and how we re-map with the new tech

**Approved in design 2026-07-28. GO — the owner said build it, 2026-07-29.** Comps are on the board
(2f revised, 2h, 2i, 2j, 2k). Every string is pre-written in `copy.md`. Work the build order in order.

---

## 1. The owner's calls, in his words

**Nav stops when the desk starts ringing.** Mapping's job ends once the phone system is navigated and
it hands us to a desk. Whether Staff pick up in two seconds or twenty is not the menu being slow, and
counting it made a good route look bad. We already record the transfer moment, so this is a change of
which number is shown, not new listening.

**Cost per check comes off this page.** It rested on a guessed 20 seconds of Charlie, and how long
Staff talk is not this page's business. What stays is nav cost: the phone line and the listening we
pay for while getting through the menu. Both are measured, neither is assumed.

**Two numbers currently disagree.** The chain row says 62s, the chain page says 67s. One truth.

**The listening we now pay for is missing from the price.** The engine bills the media fork at
$0.0044/min (`src/calls/cost.ts` `forkPerMinUsd`) and `syncCallRates` never pulls it, so Admin counts
it as zero. On an 87s call that is about 0.6¢.

**Recipes are named and dated.** `Tree Recipe v1`, `v2`, each with the date it locked and its nav
time. Live and what it replaced only. Set aside attempts sit behind one key, because an attempt is
not a recipe.

**Review buttons do the thing they name.** `Fixed` and `Not a problem` only flipped a status column
(`resolveUnknown`); they changed no route. Every card names the store and the night, shows expected
against heard, and carries its consequence.

**Max talk is deleted.** It was never talk time: `maxTalkSeconds` becomes Twilio's `TimeLimit`, a hard
cutoff on the whole call, so 45 would have ended a CVS call before Staff picked up. Nothing is set on
any of the 130 chains today. The cutoff he actually wanted already exists and is ON in both
environments: `bail.holdMaxSeconds` 60s.

**One Branson Global.** The picker's inherit row borrowed the default workflow's name, so the same
workflow appeared twice. The inherit row reads `Same as everywhere` and never borrows a name.

---

## 2. Conditions: one tree, several versions of its words

CVS reads a different menu after the pharmacy shuts, and a Spanish speaking neighborhood hears it in
Spanish. Same recipe gets through all of them. We used to file those as the map breaking, so a 9pm
call looked like a broken chain.

**Nothing new is recorded.** `EvidenceCall` already carries `hourLocal`, `dow` and `language`, stamped
by `storeLocalTime` and `languageOfCall`. They are ungrouped, not uncollected. The Menu sheet groups
them: `Daytime` · `After 9pm` · `Spanish`.

**Call the same store for a condition.** Dialling a different CVS mixes two conditions together and
the map reads as changed when we only called a different neighborhood.

---

## 3. The re-listen job (this is NOT the mapper's discover loop)

Today's mapper is built to discover a route it does not know: LISTEN, then BASELINE until a human is
reached, then OPTIMIZE with one experiment per call on a fresh store, then LOCK. That is why it calls
back repeatedly. **We already know CVS's recipe.** None of that applies to this round.

The job for re-mapping a chain we have already mapped:

1. Same store, every time.
2. Run the **known** recipe. No experiments, no shortening, no re-deriving.
3. Listen the whole way with the shared Ear and write down every line the store plays.
4. **Hang up the instant the desk starts ringing.** Owner, 07-28: "yes the instant it rings."
5. Never ask about Pokémon. The desk was already proved. The greeting is the check: if it ever comes
   back "Pharmacy, this is…" the route changed and that is a Review card.
6. Repeat at the hour a condition covers to fill the other conditions.

No agent, no person bothered, no cost past the line and the fork.

---

## 4. Bin the bad data first

Prod and staging both carry mapping calls made **before the Ear was attached**, so the agent opened
while a recording was still playing. On CVS (chain 5):

- `CVS Tarzana`, filed as reaching Staff at 20s. The greeting recorded is `"A healthcare provider."`
  That is the recording's own question chopped up. Nobody answered.
- `CVS Mulholland Drive`, 84s, greeting `"Okay, transferring you now."` That is the machine's routing
  line, not a person.
- Two store level recipes born from the Tarzana call, both rejected, both still listed.

Delete the junk calls and the dead recipes before re-mapping, or the new numbers get averaged with
them. Then add the filing rule: a call only counts as reaching Staff when what we heard is a real
greeting, never a routing line and never a chopped question. `looksLikeDirectPickup()` and
`greetingFrom()` exist; they are not applied to what gets saved.

---

## 5. Build order

1. **DONE** The filing rule: `menuStillTalking` in `navigator.ts`, 7 asserts in `test-map-sim.ts`.
2. **DONE** Nav time (`navSecondsOf`), the 62 vs 67 disagreement, `forkPerMinUsd` into the Admin rates.
3. **DONE** Chain page to comp 2f: nav hero, nav cost, reached Staff, ladder ends at the desk ringing.
4. **DONE** Recipes (2i): Tree Recipe vN, nav time, locked date, set aside behind one key.
5. Menu conditions (2h).
6. Review (2j) and Settings (2k).
7. The re-listen job.
8. Bin the bad CVS data. It waited for the filing rule so the same calls cannot come straight back.

Every screen ships against `copy.md`. Every step gets driven in a browser before it is called done.

### What the runtime must never inherit from the screen

`navSeconds` is for reading. `seconds` (time to Staff) is what `connectAtSecFor` opens the paid agent
on, and it stays that way. Opening the agent at nav time would put Charlie on a desk that is still
ringing, which is the waste this whole engine was rebuilt to remove.
