# Echo's whole box: the wrong-department save + three more (owner decisions 07-29)

**System:** voice-calls · **Status:** ALL FOUR ITEMS BUILT AND SHIPPED TO STAGING (07-30). The save is driven on
the real bridge and on live staging; the ONE thing left is a real check where a human says "this is the
pharmacy" and puts us through, which needs his phone. See item 4.
**Owner ruling 07-30:** "disagrees" = one reader says in stock, the other says not. A merely UNSURE second
reader does not downgrade a confident answer. Keep it that way.
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

## 4. The wrong-department save — BUILT AND SHIPPED TO STAGING 07-30

Nothing new was built. Every piece already worked and this snapped onto them, exactly as the box said:

- **Charlie notices it, never the Ear** (spec §10). A standing rule in `src/voice/prompts.ts`, gated on a
  per-call flag in the same shape kiosk mode already uses. Both lanes send the same value off the same switch
  (`buildRestockVars` and `ElevenLabsProvider.startCall`), so it can never be on for one lane and off for the
  other. The phrase test that RECORDS it (`heardWrongDepartment`) is pure and sits beside the rule it partners
  with; it is read in the same place the voicemail phrases are read, on our own transcript.
- **The wait is the existing one:** the transfer detector, `reopen` closing Charlie so the meter stops, and
  `tellCharlieAboutTheGap`. Two real gaps found and closed on the way:
  - **A hand-over is ALWAYS a new person.** `maybeNewPerson` came off a twenty-second stopwatch, right for
    somebody walking to a shelf and wrong for a hand-over. A quick transfer left Charlie carrying on mid answer
    with a stranger, which is this save failing at its last step.
  - **The note was never sent at all when Charlie was closed for the wait.** The reopen branch returned before
    it, so the reopened Charlie started knowing nothing. It is held now and delivered the instant his new
    session reports ready, before a single buffered word reaches him.
- **The drift filing** is `learnFromReceipt` with one new unknown kind, `wrong-department`: a review item with
  what Staff actually said, an observation marked as drift, and trust in that route dropped on the spot. The
  route is never rewritten off one check (§10.2).
- **The flag** `askForTransfer` is in BOTH `ENV_FLAGS` and `KEEP_LOCAL_FLAGS`, default ON, on Calls ▸ App with
  the owner's own label. Comp render done first: **1i, the CONSOLE page**, the same toggle row as "Customers
  hear calls live". Spec check O.2 compares the two lists and passes.
- Three new spec checks hold it: **O.5** (a switch, default on, both lanes read it), **O.6** (judged on words,
  never by the Ear), **O.7** (a transfer always says the person may be new). Check **7.1b was fixed**: it
  grepped `'ourBrain',` so any second call-lane flag failed a check about the Policy screen.

**DRIVEN — the whole save, on the real bridge with real sockets** (`scripts/test-delta-clip.ts`, 61 asserts,
was 42). Staff say "this is the pharmacy" → the receipt carries it and what they said → the desk rings → his
session CLOSES and the receipt says the billing stopped → the phone line never drops → somebody new picks up
after **1 second** → `maybeNewPerson` is TRUE anyway → he opens as **part 2 of the same check** → **exactly one**
note reaches him, saying the person may be someone new, and it never goes down the phone line.

**DRIVEN ON LIVE STAGING** (commit `75639af6`): the switch reads ON; the instructions the Fun store's check will
actually run render the rule with the flag `"true"` and the category filled in; flipping the switch OFF makes the
same instructions say never ask to be put through; flipping it back ON restores it. Switch left ON.

**NOT VERIFIED — needs his phone.** No real check where a human said "this is the pharmacy" and put us through.
I cannot be Staff at the far end, so the words Charlie actually chooses to ask with, and how the hand-over
sounds, are unproven. Everything the runtime does around those words is proven above. Same category as §3's six
calls. Also unchanged and still open: a same-person hold reopens Charlie on the full instructions, so he greets
and asks again rather than carrying on; the note tells him to carry on, but the re-ask is the shape today.


---

## 5. THE TEST LADDER — one at a time, with him on the Fun store (07-30)

He runs them; I place each check on his word and read the scorecard back. **One test, then stop.** The
Fun store is 106361 (`Test — One Question`, answers direct). Place with `POST /api/call-now` on
STAGING `{retailerId:106361, categoryId:<Pokémon>}` — staging has `cheapBridgeAll` on, so it takes the
new engine. Read it back with `/api/admin/receipt/:room` and quote the six rows.

| # | What he does | What must happen | The rows that must move |
|---|---|---|---|
| 1 | Answers, gets asked, says "hold on let me go check", puts the phone down **40s**, comes back and says "yeah we got some" | Charlie is dropped the moment he walks off and reconnected when he returns. He may ask again or carry on, both fine | Meter stopped = tick and says **hold** · Asked once = tick · Asked the new person = **gray dash** · Put through = **gray dash** · NOT ONE cross |
| 2 | Answers **"Pharmacy, this is Joe"** | Charlie asks ONCE to be put through. Never "go and look for me", never hangs up | Put through = tick, and it prints what he said |
| 2b | …then "sure, hold on", silent **10s**, comes back in a different voice: "front register" | Charlie is dropped for the wait and asks the Pokémon question AGAIN to the new voice. A SILENT hand-over, which is the case that used to fail | Asked the new person = tick · Meter stopped = tick and says **hand-over** · Asked once = tick |
| 3 | Answers "Pharmacy", then when asked says **"there's nobody up front right now"** | Charlie wraps warmly and ends. No nagging, no second ask to be put through | Put through = tick (once) · Asked the new person = gray dash |
| 4 | I turn the switch OFF first. He answers "Pharmacy, this is Joe" | Charlie does **not** ask to be put through. Takes whatever answer and wraps | Put through = **cross** (correct: the switch is off, so we did not save it) |
| 5 | Answers straight away and answers the question | The plain check still works, nothing regressed | All four original rows tick or dash, no cross |

**Test 4's cross is the one to explain to him before he runs it**, or it reads as a fault.

**Verify-live output:**
```
HEAD = 75639af6d4ea · origin/main = 55badd886004
staging  https://staging.checkitforme.com/ → LIVE (serving HEAD)
prod     https://checkitforme.com/ → NOT-LIVE (serving 55badd886004, HEAD is 75639af6d4ea) — that IS origin/main: expected until the next promote
admin    https://admin.checkitforme.com/ → NOT-LIVE (serving 55badd886004, HEAD is 75639af6d4ea) — that IS origin/main: expected until the next promote
```
The Admin shell ships on its own path: `ship-admin.sh` reported `{"ok":true,"commit":"75639af6"}` and
admin.checkitforme.com serves the new row ("If we reach the wrong department, ask Staff to transfer us").

---

## 6. HANDOFF — the next Echo runs the test calls with him (07-30)

**Your ONE job: run the test calls WITH him, one at a time.** He calls the store, you place the check
and read the scorecard back. Do not build anything unless a test finds something broken.

**It was six calls. It is now six PLUS the transfer piece** — the wrong-department save shipped after
those six were agreed, and it has never been proven with a real human at the far end.

### Before you say a word to him
1. `git checkout staging && git pull --rebase`, read `docs/STATE.md`, then
   `docs/team/voice-calls/checkpoint.md`. Do not crawl anything else.
2. The ladder is §5 of this file. Run it top to bottom, ONE step per message.
3. Place each check yourself on STAGING: `POST /api/call-now {retailerId:106361, categoryId:1}` with
   the staging admin token (Railway svc `8165df7a-…`). His phone rings. Read it back with
   `/api/admin/receipt/:room`.

### The screen he grades you on — Voice ▸ Testing, top switch on Staging
**THREE rows, all of them Charlie. Do not add a fourth without him asking:**
Meter stopped · Transfer requested · Re-asked after transfer.

**HIS RULE, and he made it twice:** a row belongs there only if a WORKING check could hide it from
him. Walking a phone menu is not a test — it works or the check fails, and the check failing IS the
report. Three rows were deleted for breaking that rule (`asked_once`, `mapping_held`,
`no_keypad_at_person`). Do not helpfully put them back.

### How he wants to be talked to
The locked reply rules + lexicon: `.claude/output-styles/check-owner-reply.md` (the ONE record,
owner-locked 08-04; the reply lock enforces it on every reply).

### The one thing still blocked
**Production.** The Testing SCREEN is already on his production Admin (it ships on its own path), but
the server half and the engine only exist on staging. Reaching Live is a **promote**, which is 139
commits and the whole engine rebuild. That is his call and only his. `PM: promote wanted — the new
engine + Testing on Live.`
