# ECHO'S BUILD — the approved spec (owner signed off 08-01)

Every line here was approved by the owner in conversation on 08-01. The reasoning behind each
decision is in `README.md` beside this file; that document is the law, this one is the work order.
**If this spec and README disagree, README wins.**

**Order matters.** The Testing card can only show what the engine records, so the engine work comes
first and the card comes last. One agent, one order, not two agents.

---

## PART 1 — THE ENGINE

### 1.1 Charlie opens on the person test, not the crude one
`src/calls/listen-nav.ts:154` `looksLikeAPerson` already decides a real person answered: a greeting
under about 3.5 seconds followed by a real pause. A recording talks longer and never stops for you.
It is used today only to stop keypad tones. **The thing that opens Charlie is cruder (any
human-sounding voice, which a recording obviously is) and must now use this test instead.**

Why it matters: thousands of first-ever checks against unmapped stores. Franklin's Ace Hardware
answers with a recording after hours on the direct path, and today it gets a Charlie who bills
against a recording until the give-up rule fires. This is passive: nothing is said, so it cannot trip
a store's menu.

### 1.2 A fourth sound shape: a loud room
The listener knows QUIET, MUSIC and RINGING. **A phone set down on a counter is none of them** —
background store noise is irregular with gaps, the exact shape of somebody talking, so Charlie stays
open and bills while the handset lies there.

**Build:** sound that is present but well below the loudness of somebody speaking INTO the handset,
held for the silence window, is treated exactly like silence: Charlie is dropped, the meter stops,
and he reconnects the moment somebody speaks up close again.

### 1.3 Record what is invisible today
Nothing writes these down, so the log and the card cannot show them:
- the recorded question playing
- Charlie warming up
- Charlie wrapping up, and whether he used their name
- which language was spoken

### 1.4 If the recording is missing, Charlie asks immediately
Today a failed recording falls back and the check runs the old way. **We know the instant it is not
there, so Charlie must say the question himself straight away** — no dead air while nothing happens.

### 1.5 The wrap-up limit
At the limit Charlie **starts wrapping up**. It NEVER hangs up. Cutting off a clerk mid help kills a
check the customer already paid for.

His line, the owner's words, **NO DASHES** (they read strangely through ElevenLabs):
> "Don't want to keep you, did you find out if you have Pokémon cards?"

If they still cannot answer, he says goodbye warmly. **Saying he will call back is fine** (owner:
Staff take thousands of calls, humans say this all the time).

### 1.6 The hold cap
2 minutes on a hold, then we hang up. **The status is the existing "left on hold"** — no new status.
From the customer's side the outcome is identical: nobody came back.

### 1.7 Delete "Charlie left"
Charlie stops for exactly two reasons: **dropped** (saving money, he comes back) and **ended the
check**. "Charlie left" is the connection closing behind one of those two and must go.

### 1.8 Delete the per-ring lines
"Ring 2 went unanswered" tells the owner nothing and costs nothing, because Charlie is off while a
phone rings. **The 6-ring give-up RULE stays** (it stops us waiting forever at a department nobody
works at); only the per-ring line goes.

## PART 2 — ADMIN ▸ APP (three new numbers, all tunable, no deploy to change)

| Setting | Starts at | What it does |
|---|---|---|
| Charlie wrap-up seconds | 23 | How long Charlie may actually be TALKING before he starts wrapping up. The owner's own arithmetic: 45 does not hold 67% profit, 23 does. He will tune it. |
| Hold cap seconds | 120 | How long a hold may run before we hang up. |
| Silence before Charlie drops | 6 | How long a pause runs before we say Staff walked off. **Owner's decision: keep 6 until the robot store can measure the floor.** Too long costs about 1.1¢ each time; too short makes Charlie choppy and choppy loses whole checks. Tune to evidence, never to a guess. |

Every one of these must read from Admin at call time, exactly like `src/calls/tuning.ts` does today.

### WHERE THEY LIVE — this is not optional (owner asked 08-01: "do we need this on production AND staging?")

**YES, both, and independently.** He tunes staging while testing; production must not move under him,
and staging must not be stomped by production.

**Put all three in the `call_tuning` setting**, beside the timing numbers already there
(`holdQuietMs`, `prewarmLeadMs`, and the rest). That setting is DELIBERATELY outside the settings
mirror's scope (`src/settings-sync.ts:5-20`: the whitelist is `policy_json`, `vt_plans`,
`support_banner_*`, `statuses` — nothing else), so each environment keeps its own values with no
extra work.

**DO NOT put them in `policy_json`.** Production's policy copies down onto staging **every 60
seconds**. A number tuned on staging would be silently overwritten inside a minute, mid test, and it
would look like the setting "didn't work". The only escape hatch there is `KEEP_LOCAL_FLAGS`
(`settings-sync.ts:39`), which holds call-lane switches, not numbers — do not extend it for this.

Both Admin environments must show and write their own values. Prove it: change a number on staging,
wait two minutes, confirm it did not revert and that production's value did not move.

## PART 3 — THE LOG, END TO END

**Same shape as the customer's own check log** (owner: *"a complete end to end log of the entire
transaction which is huge for myself and any agent"*). The menu walk STAYS. Both already come from
the same timeline.

Dialling Fun store · The store's phone is ringing · The line was answered · Staff greeting · Pressed
2 · Said "front" · Menu finished, now listening for a real person · The Pokémon question played as a
recording · Charlie warmed up · Charlie joined · Charlie reconnected, part 2 of this check · Staff
stepped away, the line went quiet · The room went quiet, Staff put the phone down · Staff back after
40 seconds · Staff back after 40 seconds, and it may not be the same person · We reached the wrong
department · Charlie asked to be transferred · Transferred, the next department is ringing · Staff
said there was nobody to transfer to · We were sent back through the phone menu · Charlie asked about
Pokémon booster boxes · Charlie asked when the next delivery lands · Charlie wrapped up and thanked
them by name · Charlie spoke Spanish throughout · Charlie dropped · Charlie ended the check · The
answer: In stock · Reached a machine, hung up straight away · Nobody picked up after 6 rings, hung up
before Charlie ever billed · Nobody spoke for 35 seconds after Charlie joined, so we hung up · The
store put us on hold too long, so we hung up · The store hung up on us · The check was disconnected ·
Something went wrong on our end, so we hung up. No check, no charge.

**"The answer" takes its word from Statuses, nowhere else** (owner law).

**Who hung up:** the carrier only says the check finished, not who ended it. But WE know when we hang
up, because we do it. So: the check ended and we did not hang up = the store hung up. A failure
rather than a normal finish = the check was disconnected.

## PART 4 — THE CARD

| # | Row | Pass | Fail |
|---|---|---|---|
| 1 | Handed to Charlie | Reached Staff through Alpha and handed to Charlie. | Staff never picked up, so there was nobody to hand to. |
| 2 | The question played as a recording | The question played as a recording. | The recording did not play, so Charlie asked the question himself. |
| 3 | Charlie warmed up in time | Charlie warmed up in time. | Charlie warmed up late. There was dead air for 2 seconds. |
| 4 | We reached the right department | We reached the right department, no transfer needed. | Wrong department and Charlie never asked to be transferred. |
| 5 | Asked to be transferred | Charlie asked to be transferred. | Charlie asked to be transferred more than once. |
| 6 | Reacted to a new person | Charlie reacted correctly to a new staff member after the transfer. | Charlie did not react to a new staff member after the transfer. |
| 7 | Said goodbye when told no | Staff said there was nobody to transfer to and Charlie said goodbye. | Charlie kept pushing after Staff said no. |
| 8 | Meter stopped | Staff stepped away for 40 seconds. Charlie was dropped and the meter stopped. | Staff put us on hold or transferred us and Charlie kept billing. |
| 9 | Charlie wrapped up | Charlie thanked them by name and ended. | The check ended without Charlie wrapping up. |
| 10 | Spoke their language | Charlie spoke Spanish throughout. | Charlie answered in English on a Spanish check. |
| 11 | Charlie ended the check | Charlie ended the check. | Staff hung up on us. *(or)* The check was disconnected. |

**THREE STATES, never two: Used · Unused · Broken.** Unused is a clean result. A plain check shows
most rows Unused and that is a good check. **A row never claims a pass for something that never
happened** — row 6 must also name WHICH event it judged (after a transfer, or after a wait).

**RETROACTIVE:** every one of these is already saved on past checks, so the card must render checks
that ran BEFORE this build. Prove it on the owner's existing Fun store checks.

**THE COPY IS LOCKED.** `scripts/test-behaved.ts` asserts the exact wording of the rows that exist
today, deliberately, because the owner spent real time on these words. **Every new string above gets
the same assertion in the same commit**, so no future agent can quietly reword it.

## DONE-WHEN

- `npx tsc --noEmit` clean · the tests for what you touched green (NEVER the full suite unprompted)
- A new rig scene per engine change in PART 1, each proving the behaviour, not the wiring
- You opened Voice ▸ Testing on real Admin, tapped an OLD check, and saw the log and the rows render.
  Say what you saw.
- The three Admin numbers change behaviour without a deploy. Say that you changed one and saw it.
- Shipped: merge to staging + `bash scripts/ship-admin.sh`

## RULES

- **The owner is running phone tests.** Do NOT ship until he says testing is finished. Every push
  restarts staging and kills a check in progress.
- His words only: it is a **check** · the person is **Staff** · **dropped Charlie** and
  **reconnected Charlie** · **department**, never desk · **ElevenLabs**, never "the voice company".
- No dashes inside a sentence, anywhere the owner or a customer reads it, and never in Charlie's
  spoken lines.
- Behaviour not in this spec is out of scope. Find a bug, write it down, leave it.
