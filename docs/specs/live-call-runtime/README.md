# The live call runtime

**Owner-approved architecture, 2026-07-27. This document is the build order for the calling engine
and the contract Mapper reads. Nothing here is optional and nothing here is a suggestion.**

The goal in one line: **the telephone call never breaks, the Ear never leaves it, and the expensive
agent is switched on only while an actual conversation is happening.**

---

## 0. Before you write a single line

**Do not write code in your first session.** The engineer who wrote this spec built the wrong thing
earlier the same day by skimming one file instead of reading it. The system is not large, but it is
dense with decisions that were paid for in real calls, and the comments carry the reasons.

Read these in full. Not grep, not the first fifty lines.

| File | Why |
|---|---|
| `src/voice/bridge.ts` | the whole runtime. Every trap in section 12 is a comment in here |
| `src/calls/listen-nav.ts` | the Ear. The prompt detector and the unsafe side channel |
| `src/voice/bridge-place.ts` | how a call is actually placed, and where the receipt opens |
| `src/calls/events.ts` | the closed event set and the meters |
| `src/calls/receipt-store.ts` | the only file in the receipt chain that touches the database |
| `src/calls/tapedeck.ts` | Delta as it exists today, including the mid-call handoff that works |
| `src/calls/mapgraph.ts` | Mapper's side. Section 10 depends on knowing what is already built |
| `docs/team/voice-calls/checkpoint.md` | what was tried, what failed, what is live |

**Then, before building, write back a short orientation** the owner can check in under a minute:

1. Where audio leaves us and reaches the phone, named by function.
2. How the runtime knows our own audio is playing, and why that matters to the Ear.
3. What happens today between "a person is detected" and "the agent is billing".
4. Which single change in this spec you believe is riskiest, and why.

If you cannot write those four from memory after reading, read again. Getting this wrong costs real
calls to real stores, and the owner hears every one of them.

---

## 1. The shape

Four parts. Each owns one thing and nothing else.

| Part | What it is | What it owns |
|---|---|---|
| **The Ear** | a cheap acoustic layer, no model | the whole call, from dial to hangup |
| **Alpha / Bravo** | mapped keypad presses / mapped spoken words | walking the phone menu |
| **Delta** | one pre-recorded clip | asking the first stock question |
| **Charlie** | the reasoning agent | every turn after the answer, and closing the call |

**The Ear** hears ringing, menus, voicemail, speech, silence, hold audio, speech returning and
disconnects. It holds a short rolling buffer in memory and it writes the master timeline. It does
not reason about inventory and it never becomes a second agent.

**Delta is not an agent.** It is deterministic audio played by the bridge. It never interprets an
answer and it never decides a call is finished.

**Charlie always owns the answer and always closes.** There is no Delta-only completion path. Not in
version one, not behind a flag.

---

## 2. Hard rules

1. **One call, one receipt.** The Twilio call SID plus our room id is canonical. If Charlie is
   restarted, those are numbered segments *inside* the same call, never separate calls.
2. **Our receipt is the source of truth** for the transcript, the timings and the verdict. The voice
   provider's post-call webhook becomes supporting evidence, not the record.
3. **No conversation audio is ever persisted.** Live call audio may pass through the bridge and sit
   in RAM for the handoff buffer. It is discarded immediately after use. Nothing reaches disk, logs
   or object storage. Text, events, timings and costs only. This rule already exists in
   `docs/specs/call-receipt/README.md` and it does not bend for this work.
   **One deliberate exception, and only this one:** our own synthesized clips — Delta's question, the
   closing lines, the reconnect opener — MAY be cached and reused. They contain no store audio and no
   customer audio; they are our own script in our own voice. Re-synthesizing them on every call costs
   roughly 7¢ per call, measured, which is more than a whole conversation. Cache them.
4. **Every path that dials a store runs this runtime.** Customer checks, scheduled checks, zone
   sweeps, every Admin button, mapping calls, on staging and on production. No exceptions. A call
   that does not produce a receipt is a bug, not a special case.
5. **A number we do not measure is null, never zero.**

---

## 3. GATE ZERO — the silence billing test

**Nothing in section 6 gets built until this returns an answer.** The hold design has two completely
different shapes depending on the result, and building the wrong one wastes the work.

The question is *not* whether the provider discounts silence. It is whether **our gated stream**
counts as qualifying silence.

**Method**

1. Same store (Fun), same agent configuration, same approximate call length every time.
2. **Control:** 30 seconds of normal back-and-forth conversation.
3. **Test:** 30 seconds where the store is on hold, Charlie's session stays open, and the hold audio
   is gated exactly the way production will gate it.
4. After each call, pull that conversation's usage. **If per-conversation cost is not exposed**, run
   the calls in a window when nothing else is dialling, read the account total before and after, and
   take the difference. Tonight's numbers came from `/v1/usage/character-stats` with a product-type
   breakdown over a date range, which is an aggregate, not a per-call figure. Check for a
   per-conversation cost first and fall back to the difference method.
5. Record separately for each call: connected duration, voice credits, LLM credits, total credits.
6. Three runs of each condition. One odd call must not decide this.

**Pass bar — both halves must hold**

- The gated 30 seconds bills at roughly 5% of the active rate, **and**
- Charlie resumes naturally: no second greeting, no lost context, no talking over the clerk.

**If it passes:** keep one Charlie session alive through holds.
**If it fails:** close Charlie for the hold and open a fresh mid-call segment when a person returns,
stitched under the same call id.

Build the code so both work without changing the call architecture. The result picks the path; it
does not change the design.

---

## 4. The call, second by second

```
dial
  Ear attached from the first moment of audio
ringing                         Charlie NOT connected
menu plays                      Alpha/Bravo walk it, Charlie NOT connected
menu ends
desk rings                      Charlie NOT connected
a real person speaks
  → Delta's clip begins playing
  → Charlie is prewarmed WHILE the clip plays
  → any clerk speech that starts early is held in the buffer
clip finishes (Twilio confirms)
  → Charlie's input and output open
  → the buffer is released to Charlie
clerk answers                   Charlie owns every turn from here
...
Charlie closes the call
```

Charlie never joins cold, never speaks first, and never talks over the beginning of the answer.

### Knowing the clip finished — use three signals, not one

Opening Charlie must never depend on a single new message arriving. Whichever of these lands first
opens him, with a small margin so he cannot overlap the tail of the clip:

1. **Twilio's `mark`** — the accurate one, and new code.
2. **The clip's own length** — exact arithmetic, not a guess. Phone audio is 8 bytes per
   millisecond, so a clip we synthesized has a known duration the moment we build it.
3. **The playout clock the bridge already keeps** (`agentPlayingUntil`) — it already adds each
   chunk's real playing time as it is sent, which is how the echo gate works. It costs nothing to
   read and it is already proven on every call.

If all three somehow fail, **open Charlie anyway**. A slightly early agent is recoverable; a live
clerk saying hello into silence is not.

---

## 5. What already exists, and what to build

**Read these before writing anything.** Everything below is in this repo today.

### The Ear — `src/calls/listen-nav.ts`

Already does: μ-law frame energy, a prompt-boundary detector (a burst over 900ms followed by a pause
over 700ms ends a prompt), a per-call session, and it fires each mapped step on a real prompt ending
with a clock fallback. Deliberately has no config and no database imports so its timing rules stay
unit-testable — **keep it that way**.

**Add:** hold-audio detection, hold-end, transfer, a new person, extended dead air, disconnect. All
of it acoustic. Feed the same events into the receipt.

### The bridge — `src/voice/bridge.ts` · **MACHINE-LOCKED**

You cannot edit this file until the owner names the task and you write `src/voice/**` into a
repo-root `.unlock`. Delete the `.unlock` when you are done.

Already does, and you should reuse rather than reinvent:
- **Sends audio out to Twilio** — see how keypad tones are synthesized and pushed as media frames.
  Delta's clip goes out the same way.
- **Tracks when our own audio is playing** (`agentPlayingUntil`) — this is how the Ear knows not to
  mistake our clip, or its echo off the line, for the clerk answering.
- **Buffers inbound audio while the agent connects** (`pending[]`, flushed on ready) — this is the
  handoff buffer, already written.
- **Identifies call-progress tones by frequency** (Goertzel on the published ring/busy pairs) so a
  ringing line is never mistaken for a person.
- **The echo gate**, so the provider never transcribes our own voice as the clerk.

**Does not do:** handle Twilio's `mark` event. That is how we learn Delta's clip finished playing,
and it is new code. It is small.

### Delta — `src/calls/tapedeck.ts`

Today Delta runs an entire call on its own Twilio flow with recorded clips and a cheap classifier.
**That is not what Delta becomes.** Delta becomes one clip played through the bridge.

The clip must be synthesized as **phone-format audio (μ-law 8kHz)**, not the MP3 we generate today,
or it cannot go down the media stream.

The existing whole-call Delta engine and its Charlie handoff stay in the tree for now — do not delete
working code — but no store points at it.

### Charlie joining mid-call

**Do not use the per-call greeting override.** The bridge carries a comment recording that
overriding prompt or first message on a per-call basis *once hung calls up*, which is why every
normal call sends no override at all. The whole design would rest on the one thing already known to
break.

**Instead: a dedicated agent, configured once.** Config already carries several agent ids
(`carryAgentId`, `openAgentId`, `benchAgentId`) and the bridge already accepts which agent to use per
call. Add one more: a mid-call agent whose greeting is empty and whose standing instruction is that
it is joining a conversation already in progress and must wait silently for the answer. The question
Delta asked is supplied as context.

---

## 6. Hold and transfer

The Ear stays on the call. Charlie is what gets suspended.

On hold or transfer detected: stop feeding that audio to Charlie and suppress his output. Keep
Twilio and the Ear running. Buffer the first words when someone comes back.

**When the hold ends, tell Charlie there was a gap and the person may be someone new.** If he has
been fed thirty seconds of silence he will otherwise carry on as though no time passed, and greet a
new clerk as the old one.

Whether the session stays open or is closed and reopened is decided by Gate Zero.

---

## 7. The brain, on our own account

Charlie's model runs *inside* the voice provider's session today, and they bill it. Measured against
the live account on 2026-07-24:

| | credits/min | at $0.0001516/credit |
|---|---|---|
| Voice | 323 | $0.049/min |
| **Brain** | **400** | **$0.061/min** |
| Blended | 723 | **$0.1096/min** |

The plan's headline is $0.08/min because it assumes 528 credits a minute. We burn 723, so $22 buys
about 200 minutes rather than 275. **The brain is the overage**, and the Calc page's long-standing
$0.0002/second figure is roughly right *for running it on our own account* — a system we never
actually built. Moving it is worth about 5x on that line and is independent of everything else here.

**Build it as a switch, not a migration.**

- Lives in **Admin → Calls → App**, beside the other call-engine switches. A setting, not an
  environment variable, so it can be killed from a phone mid-incident the way the menu flag is.
- **Off** = the provider's hosted model. Exactly today's behaviour. Always works.
- **On** = our own account, with the ladder below.
- **Stamp which brain served each call on the receipt.** Without it the cost comparison is
  unprovable, and proving it is the entire point.
- The API key goes in Railway variables on both services. It never appears in a chat or a commit.

**The fallback ladder**

*Before Charlie has spoken:*
1. One immediate retry, tight timeout.
2. Still failing → switch invisibly to the provider-hosted agent. Same voice, no greeting, joining
   mid-call, given the transcript and the question. The clerk notices nothing.
3. That fails too → treat as a dropped call (section 8).

*After Charlie has already spoken:* **no live model swap.** Then it depends on what we have:

- **We already have a usable answer in the transcript** → play the normal warm close, hang up,
  extract the verdict from what we heard, mark the call degraded. The customer gets their answer and
  the store hears a completely normal call. Never throw away a delivered result.
- **We do not have an answer** → the dropped call, below.

---

## 8. The dropped call

Hang up. Say nothing. Stores take thousands of calls and a dead line is unremarkable; a promise to
call back that we might not keep is not.

- **A new status**, in the family that already exists (`left_on_hold`, `admin_hangup`,
  `user_cancelled` all already skip the charge). Add the row in `seedStatuses`
  (`src/db/bootstrap.ts`) with its wording **and its Spanish in the same commit**.
- **Never charge the customer.**
- **Do not retry automatically.**
- **The one-hour block must not count it.** A customer whose call broke must be able to try that
  store again immediately. `findRecentCheck` (`src/calls/service.ts`) only matches rows with status
  `completed`, so a dropped call must not be written as completed. **Verify this on a real dropped
  call rather than trusting the read.**
- **If the customer does call straight back**, Delta plays a different opener: something to the
  effect of *I just got disconnected, I was checking to see if you had Pokémon in*. That line has a
  shelf life — use it only when the retry is soon, same store, same product. Forty minutes later it
  sounds strange, so fall back to the normal greeting. Ships with its Spanish.

---

## 9. The receipt

Most of this is already built — see `docs/specs/call-receipt/README.md` for the full contract. Every
call already writes a timeline of sixteen event kinds plus a roll-up of seconds and cost.

**Add to it:**

- The new Ear events: hold start, hold end, transfer. They are already declared in the closed set and
  simply never emitted. Do not invent a seventeenth kind; put detail in `detail`.
- Charlie segments: if he is restarted, each session id is a numbered segment of the same call.
- Which brain served the call.
- The navigation outcome (section 10).
- Fill `mapVersion` and `attemptOf`. Both columns exist and are sitting empty.

---

## 10. Mapper — the contract

**Mapper should read this whole document.** The two systems share one Ear and one receipt, and that
shared code is what stops them drifting apart. Mapper must not build a second listener or analyse
live audio independently.

### Already built on Mapper's side — do not ask for it again

Read `src/calls/mapgraph.ts` before proposing anything. It already has versioned maps with their own
evidence, propose/approve/reject, confidence computed from calls × stores × days × agreement × age,
observations stored with call id and version id and a drift flag, unknowns folded by prompt with a
count, store-level routes threaded through lookup and versions, a guard against 0-hammer paths, and
staging-to-production publishing with a follower mode. Steps already carry which recording they wait
for and whether we can speak before it ends.

### The wiring gaps, which are ours not Mapper's

1. **`reportCallDrift` exists and nothing calls it.** It takes the steps that actually fired, whether
   a person was reached and how many recordings played, and returns the reasons a route drifted.
   Every customer check must call it. That alone turns every check into a mapping observation, for
   free, across stores we will never deliberately map.
2. **`recordObservation` accepts a call id and never receives one.** Pass the receipt's.
3. **The prompt-anchor side channel is not version-safe and is ours.** `stageNavPromptPlan`
   (`src/calls/listen-nav.ts`) stashes the plan in an in-memory map keyed by the *shape* of the step
   list, with a ten-minute expiry, claimed by whichever call happens to run an identical-looking
   route. It dies on restart and carries no version. **Replace it: read the route and its anchors off
   the active version (`activeMap(chainId, storeId)`) as one atomic thing.** Pieces from two versions
   must never mix.

### What the runtime returns to Mapper

A structured navigation outcome on the receipt. Mapper reads the record; nothing calls anything.

- reached a person · never reached one · still ringing after the menu finished · the route failed
- how long each phase took, and which steps fired on a real pause versus the clock

**The Ear cannot judge "wrong department".** That needs someone to understand *this is the pharmacy*,
which is words, which is Charlie. That half of the outcome comes from the conversation, and the two
halves are assembled on the receipt.

### What Mapper builds

1. **The graph.** A flat recipe can only say *press 2 at 8 seconds*. It cannot say this prompt leads
   here, this store branches differently, or we have never heard this prompt before. The Ear already
   produces nodes and edges naturally — a prompt ended, we did this, here is where we landed.
2. **One store disagreeing makes a store exception, never a chain change.** Franklin's Ace is one
   store out of many; a chain-level truth being wrong at one branch is exactly the case. A chain route
   only moves after several stores agree. Otherwise one strange call breaks five hundred stores.
3. **A language field in the data model now**, even though discovery and execution are deferred. Free
   today, expensive later, because retrofitting means rewriting every stored route.
4. **The hour of day and day of week on every observation.** Stores run different menus after hours
   and around holidays. Without it we chase failures that only mean we called at nine at night.
5. **Failed calls are evidence.** They must not silently change a map, but they must count. A route
   that keeps failing must stop looking healthy.

### The safety rule that belongs to the runtime

**Stop pressing keys the moment a real person answers.** A store mapped with a menu that now answers
directly means we send keypad tones at a live human. The Ear can see it — a person speaks before the
first mapped step fires. Abort the remaining steps and hand straight to the conversation. Today we
would keep pressing.

---

## 11. Done means

- Gate Zero answered with numbers, three runs each way, written down.
- Charlie never speaks before the clerk finishes answering, proven on real calls.
- A hold happens, Charlie stops costing money, and he comes back without greeting again.
- The brain switch flips both ways from Admin with no deploy, and the receipt says which one ran.
- A dropped call charges nobody and does not lock the customer out of that store.
- Every dialling path writes a receipt. Check each one, including the Admin buttons and a zone.
- `reportCallDrift` fires on ordinary customer checks.
- Cost per delivered answer re-measured against the real baseline. **Do not re-count savings already
  banked** — Charlie no longer opens on a ringing line and unanswered calls already hang up early,
  so some of the modelled waste is gone already.

---

## 12. Traps that have already bitten us

- **`src/voice/**` is machine-locked.** Owner-named task, `.unlock` at the repo root, delete it after.
- **The Fun store is currently pointed at "Branson Delta Test"**, which runs the *old* whole-call
  Delta. Move it back before testing anything.
- **Never deploy while the owner is mid test call.** Rapid deploys during an incident split the
  evidence; always check which build served a call.
- **The provider's own transcription is 8.6¢ a call**, measured. It is more than a whole check costs
  and is deliberately not used. Do not quietly reintroduce it.
- **Muting Charlie is not the same as suspending him.** Our own measurement says silence bills as its
  own line; Gate Zero exists to settle whether a gated stream is different.
- Copy laws apply to every new customer-facing string: no dashes inside a sentence, and its Spanish
  ships in the same commit.
