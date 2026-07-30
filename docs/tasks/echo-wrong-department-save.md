# Echo's whole box: the wrong-department save + three more (owner decisions 07-29)

**System:** voice-calls · **Status:** active — **items 1, 2 and 3 DONE and shipped 07-30. Item 4 (the save)
NOT STARTED**, and it is the one that needs a fresh chat: it opens the locked bridge, adds a call flag to both
flag lists, and touches an Admin screen (which needs a comp render first).
**Order:** the three quick items first (workflow · reader rule · walkthrough), then the save.

1. **A Testing workflow named "Test — One Question"** on Branson HD: the approved question and its
   one follow-up, nothing else — the owner's six test calls will run exactly this.
2. **Prove the reader rule:** when the second reader disagrees with Charlie's status, the customer
   gets "couldn't tell" and NO charge — never a wrong answer. If that is not how it works today,
   make it so and prove it.
3. **The owner's six test calls, written step by step:** one short message per call — what he does,
   what he should hear, what you check after. Leave it as your reply so it waits for him in the
   morning. Place no calls yourself.
**What:** when Staff say we reached the wrong department, Charlie asks them to transfer us and asks
again once we land — the check is saved on the same call instead of failing and retrying.

- Read first: `docs/specs/live-call-runtime/README.md` §6 (hold and transfer) ·
  `docs/team/voice-calls/checkpoint.md` · this file whole.
- **A switch, not a hardwire:** ON/OFF beside the other call settings, plain label ("If we reach the
  wrong department, ask Staff to transfer us"), default ON. The owner may later limit it to premium
  plans — build it as a flag so that is a config change, not a rebuild.
- During the transfer wait: **drop Charlie** (meter off), reconnect when a real voice returns, told
  it may be someone new — the same shape as a hold.
- What it heard is evidence: landing wrong means the route drifted — file it to the map exactly like
  any other drift, so the save also teaches.
- The re-ask after a hold when a NEW person picks up is designed already — PROVE it on a real
  staging check and write the proof here.

**Done when:** a staging check that lands wrong gets transferred, re-asks once, delivers the answer ·
the flag shows with its plain label · the drift filed · verify-live output pasted below.

---

## 1. The Testing workflow — DONE, live on staging, driven

`Test — One Question` on Branson HD, and the Fun store now runs it. `scripts/make-test-workflow.ts` holds the
definition AND writes it (dry run unless `--apply`); the test imports the same constant, so the thing we assert
and the thing we ship cannot drift.

It is **Branson Global with the four-opener rotation collapsed to the one approved question** — nothing in it is
newly written copy. Gate Zero's own method says "same store, same agent configuration, same approximate call
length every time"; four rotating openers would have made his six calls into six slightly different calls.

**Driven on real staging check 205** (Fun store, on HEAD): it asked his approved question word for word, the
store said no, it asked the one restock line word for word, got "Friday", wrapped. One question each way, eight
timeline events, `not_in_stock`, 5.4¢. `vt_*` keys sit outside the settings-sync whitelist, so this is
staging-only and prod never saw it — and Branson Global, the default, is untouched.

## 2. The reader rule — IT WAS NOT HOW IT WORKED. Now it is.

The rule lived in `reconcile` all along, but **three of the five finalize paths never let it see the second
read**. They passed `needSecond ? second : null`, and `needSecond` was false exactly when the live extraction
already had an opinion. So the case that matters most — the live read saying IN STOCK while the transcript
reader said NOT IN STOCK — was thrown away: the customer saw a green and was charged for it. A false red was
never checked at all, because on a decisive "no" the reader was not even run.

The three were `/pub/result/:cid` (**the first verdict a customer ever sees**), the provider webhook, and the
poller. Bridge calls flow through all three, so the new engine had the hole too.

Fixed by making it not a caller's decision: `consensusFor` (`src/voice/verdict.ts`) gets the read and reconciles,
always, and all four live paths call it. **Spec gate 4 now fails the push** if anyone takes that decision back —
and I proved the gate fails on the pre-fix code and passes on this one, so it is a real guard, not decoration.

- 13 new asserts, including the false green and the false red, and that an abstention is NOT a disagreement (a
  reader with no opinion must not erase a real answer, or nothing would ever be charged).
- Driven live: call 205 was a decisive "not in stock", which previously got NO second read at all. It ran, and
  its extraction captured the restock day "Friday" onto the row.
- **NOT observed live:** an actual disagreement. I cannot manufacture one on a test store, so the conflict path
  is proven by unit test and by the gate, not by a real call.
- Cost: one extra Flash-Lite read on calls where the live read said "not in stock". None before; it already ran
  on every other call.

## 3. The six test calls — in my reply to the owner, per the box. No calls placed for him.

## 4. The wrong-department save — NOT STARTED

Every piece it needs now works, which is why it should be its own chat rather than a tail on this one:

- **Noticing it is Charlie's job, not the Ear's** (spec §10 says so in plain words: the Ear cannot judge "wrong
  department", that needs words). So it is a standing rule in the prompt library (`src/voice/prompts.ts`), the
  same shape as the one-question instructions, telling the agent to ask to be put through.
- **The transfer wait is already built and now reliable:** `ConversationEar` transfer (fixed 07-29, it used to
  fire on one frame), `reopen` closing Charlie so the meter stops, and `tellCharlieAboutTheGap` warning him the
  person may be new. The re-ask after a hold is designed; it has never been proven on a real transfer.
- **The drift filing is already built:** `learnFromReceipt` → `reportUnknown` / `reportCallDrift`. It needs one
  new unknown kind for "we landed in the wrong department".
- **The flag** must go in BOTH `ENV_FLAGS` (public/app.html) and `KEEP_LOCAL_FLAGS` (src/settings-sync.ts), or
  the prod mirror stomps it inside a minute. Plain label, default ON. The Admin edit needs a comp render first.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(pending — items 1-3 shipped, item 4 not started; not closed)
```
