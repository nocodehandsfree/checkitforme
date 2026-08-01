# CHARLIE — every behaviour, in the owner's words (THE record)

**What this is.** The single source of truth for how Charlie is supposed to behave on a check, what
every step in the log says, and what every pass/fail row says on both sides. An agent who does not
understand Charlie reads THIS, then looks at a real check in Admin ▸ Voice ▸ Testing, which shows the
same words. Built 08-01 with the owner, line by line. **Nothing here is invented: every row is either
grounded in something the engine already records, or marked NOT BUILT YET.**

**How to keep it alive.** The owner edits it; agents propose. When a behaviour changes, this file
changes IN THE SAME COMMIT. If this file and the code disagree, this file is what the owner wants and
the code is the bug.

---

## 1. Where Echo testing stands (08-01)

- The check-life fix + round 2 are LIVE on staging, PM-verified with five blind readers and the full
  rig (259 checks green, typecheck clean). **Nothing is phone-verified.**
- The owner has run test 1 five times across 08-01 (runs 222-226), zero passes yet — every run found
  a real fault, all now fixed.
- **Run 6 ran and FAILED — three faults in one moment, all fixed and on staging** (Echo, checkpoint
  @d52bbd17): the greeting's own pauses were being deleted so it transcribed as different words; two
  turns arrived as one line; and our question printed before their hello. 121 rig checks green.
  **Run 7 is the next attempt.** The PM has NOT independently audited that fix yet.
- Staging is clear: logo work merged beside it and touched no calling code (verified).
- Known before he dials: a check hangs up at 5 minutes flat · the hold hang-up rule is NOT built yet ·
  Testing row 227 is a pre-fix leftover and opens nothing (by design; new checks are fine).

## 2. The owner's test list (HIS words, 08-01 — this had never been written down)

All on the Fun store, one at a time.

1. **The walk-away.** Answer, and when Charlie asks say "hold on, let me go check," stay silent 40
   seconds, come back with "yeah, we got some." Charlie is dropped while you're gone and reconnected
   when you're back.
2. **Wrong department.** Answer "Pharmacy, this is Joe." Charlie asks ONCE to be put through — never
   "go look for me," never hangs up.
3. **The hand-over** (continues test 2). Say "sure, hold on," silent 10 seconds, come back in a
   different voice: "front register." Charlie treats you as new and asks the Pokémon question again.
4. **Nobody to transfer to.** Answer "Pharmacy," and when he asks to be put through say "there's
   nobody up front right now." Charlie wraps warmly and ends — no nagging.
5. **Switch off.** Owner turns the transfer switch off first. Answer "Pharmacy, this is Joe." Charlie
   does NOT ask to be put through, takes what he gets, wraps. The scorecard shows a red X on
   "Transfer requested" — correct here: it means we didn't save it because he told us not to.
6. **The plain check.** Answer straight away and answer the question. Nothing regressed.
7. **The transfer with a real person at the far end.** Proves how the hand-over actually sounds. No
   test rig can do this.
8. **Spanish.** Run the check in Spanish and answer in Spanish the whole way.

## 3. The life of a check, start to finish

1. We dial. The store's phone rings.
2. Somebody answers and says their greeting.
3. **The question plays as a recording** — our own audio, so asking costs nothing.
4. **Charlie warms up 2 seconds before that recording ends**, measured off our own recording whose
   length we know exactly. He bills from the moment he connects. A real question runs about 5
   seconds, so starting him at the top of it would buy 5 seconds of dead air on every check.
5. Charlie hears the answer, may ask a follow-up, then wraps up — thanks them, by name if they gave
   one.
6. Staff step away → **Charlie is dropped** and the meter stops. Staff come back → **Charlie is
   reconnected** as part 2 of the same check, and he is told time passed so he doesn't carry on
   mid-sentence.
7. Wrong department → Charlie asks ONCE to be put through, meter off through the hand-over, asks
   again when somebody new picks up.
8. The check ends. The answer is written and the customer is charged (a hold drop IS charged —
   owner's ruling 08-01; only a genuine failure on our side is free).

**Charlie stops for exactly two reasons: dropped to save money (he comes back), or the check is
over.** "Charlie left" is a third line the code writes when the connection closes behind one of those
two — it is plumbing showing through and must be DELETED.

## 4. Every step in the log

Getting there: Dialling Fun store · The store's phone is ringing · Ring 2 went unanswered · The line
was answered · Staff greeting

The question: The Pokémon question played as a recording *(NOT BUILT YET)* · Charlie started warming
up *(NOT BUILT YET)* · Charlie joined · Charlie reconnected, part 2 of this check

Waiting: Staff stepped away, the line went quiet · Staff back after 40 seconds · Staff back after 40
seconds, and it may not be the same person

Department: We reached the wrong department · Charlie asked to be put through · Transferred, the next
department is ringing · Staff said there was nobody to transfer to

Charlie's words: Charlie asked the question · Charlie wrapped up and thanked them by name *(NOT BUILT
YET)* · Charlie spoke Spanish throughout *(NOT BUILT YET)*

Endings: Charlie dropped · Charlie ended the check · The answer: they have them · Reached a machine,
hung up straight away · Nobody picked up after 6 rings, hung up before Charlie ever billed · Nobody
spoke in the 45 seconds after Charlie joined, hung up · The store put us on hold too long, so we hung
up *(NOT BUILT YET)* · The line dropped from the far end · The check broke on our end, so we hung up
without saying anything

**Moving OUT to the mapping section** (owner: walking a menu is not Charlie): Pressed 2 · Said
"front" · Menu finished, now listening for a real person

## 5. Every pass/fail row, both sides

| # | Row | Pass | Fail |
|---|---|---|---|
| 1 | Handed to Charlie | Reached Staff through Alpha and handed to Charlie cleanly. | Nobody was ever handed to Charlie. |
| 2 | The recorded question played | The question played as a recording, so we paid nothing to ask it. | The recording did not play, so Charlie asked it himself and we paid for it. |
| 3 | Charlie warmed up in time | Charlie was ready the moment the recording finished. | Charlie was still warming up when the recording ended, so there was dead air. |
| 4 | We reached the right department | We reached the right department, no transfer needed. | Wrong department and Charlie never asked to be put through. |
| 5 | Asked to be put through | Wrong department. Charlie asked once to be put through. | Charlie asked more than once. |
| 6 | Asked the new person | Somebody new picked up and Charlie asked them fresh. | Somebody new picked up and Charlie carried on as if nothing changed. |
| 7 | Wrapped without nagging | Staff said there was nobody to transfer to and Charlie wrapped up warmly. | Charlie kept pushing after Staff said no. |
| 8 | Meter stopped | Staff stepped away for 40 seconds, Charlie was dropped, and the meter stopped. Reconnected as part 2 of the same check. | Staff stepped away and Charlie kept billing. |
| 9 | Charlie wrapped up | Charlie thanked them by name and ended. | The check ended without Charlie wrapping up. |
| 10 | Spoke their language | Charlie spoke Spanish throughout. | Charlie answered in English on a Spanish check. |
| 11 | Charlie ended it | Charlie ended the check himself. | Staff hung up on us. |

**Three states, never two** (owner): **Used · Unused · Broken.** Unused is a clean result, not a
failure — a plain check is mostly Unused. A row exists ONLY because a WORKING check could hide the
problem from the owner (his rule, 07-30: walking a menu is not a test; the check failing IS the
report).

**The copy is locked by a test.** `scripts/test-behaved.ts` asserts the exact wording of the three
rows that exist today, so no agent can quietly reword them. Every new row above MUST get the same
assertion in the same commit.

## 6. Decisions made 08-01 (owner)

- **Hold cap: 2 minutes.** Waiting is cheap because Charlie's meter is off — only the phone line
  ticks. Giving up early costs a whole failed check the customer paid for. NOT BUILT YET.
- **The customer-facing status he is creating:** "The store put us on hold for too long, so we hung
  up. Try again in a bit."
- **"Charlie left" is deleted.** Dropped and ended are the only two.
- **Mapping steps leave this page.** Mapping has its own section.
- **A recording must never get a Charlie.** The listener ALREADY has the right test — a short
  greeting (under about 3.5 seconds) followed by a real pause means a person; a recording talks
  longer and never stops for you (`looksLikeAPerson`, `src/calls/listen-nav.ts:154`). It is used to
  stop keypad tones but NOT to decide whether Charlie opens; the thing that opens Charlie is cruder
  (any human-sounding voice, which a recording obviously is). **The fix: Charlie opens on the test we
  already trust.** This is passive — nothing is said, so it cannot trip a store's menu. Franklin's
  Ace Hardware (a recording on an unmapped store, on the direct path) is the case it protects.
  Mapping REMEMBERS the answer afterwards; it does not have to work it out again.

## 7. Still to build (Echo, in this order)

1. Charlie opens on the person test, not the crude one (§6 — protects every unmapped store, day one).
2. Record the recorded question playing, and the warm-up.
3. Record the wrap-up (thanked them, used their name) and which language was spoken.
4. The 2-minute hold cap + its status.
5. Then the Testing card shows all of §4 and §5. The page can only show what the engine records, so
   this is one job in this order, not two agents.

## 8. Open — the owner has a long response to §4 and §5 pending

He is reviewing the wording and has questions plus new failure cases to add. NOTHING in §4/§5 is
approved until he says so. Update this file as each is settled.
