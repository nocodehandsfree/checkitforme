# The robot store — proving a check works without the owner's phone

**Owner-approved 2026-08-01.** A store that answers itself, so an agent can run a whole check end to
end and see what the owner would see. Nothing here is optional.

## Why this exists

On 08-01 the same transcript fault was declared fixed three times and failed on the owner's phone
three times. Every one of those fixes passed the engine test rig, because the rig pretends to be the
voice provider and a pretend provider does whatever the person who wrote it assumed. The fault was
real and simple: held audio was handed over in one instant, and the real transcriber decides where a
sentence ends by hearing a pause pass on a real clock. No test we owned could see that. Only the
owner's phone could, and it cost him fifteen rounds.

**The rule this spec exists to enforce: an agent must be able to prove a check works before asking
the owner to dial.**

## 1. What is real and what is fake

Exactly ONE thing is fake: the person at the store. Everything else is the real system.

| Piece | Real or fake |
|---|---|
| The website | **REAL** — staging.checkitforme.com in a real browser, tapped like a customer |
| The dial, the carrier, Charlie, the transcribing | **REAL** |
| The Admin record of the check | **REAL** |
| The person answering | **the robot** |

**NEVER build a replica of the site.** A copy drifts from the real thing within a week and then the
test proves the copy works. The harness drives the real staging site, and it only ever taps what a
customer can tap: no test-only buttons, no direct links past a screen, no seeded state.

## 2. The number

**+1 424 484 7395** — bought 08-01, Twilio friendly name "Robot store (test harness)". No voice URL
set on it yet; this build sets it.

Point the **MVP store** at it in Admin, the ordinary way an operator points any store at any number.
The Fun store stays pointed at the owner's own phone and is not touched.

## 3. What the robot says

The owner approved these words. The store is **MVP's**, the person is **Larry**. Wording gets one
tuning pass against `how-staff-actually-talk.md` (a separate research task) before it is locked.

| # | Scenario | What the robot says | What else happens |
|---|---|---|---|
| 1 | Greeting (starts every test) | "Thank you for calling MVP's, this is Larry, how can I help you?" | about a second after pickup, then quiet so we can ask |
| 2 | In stock | "Yeah, actually we did just get some in." | |
| 3 | Sold out | "Ah, I'm sorry, we're sold out of those right now." | |
| 4 | Restock day | "I'm sorry, we're out. You can call back Friday though, we get our shipment Friday morning." | |
| 5 | Puts us on hold | "Sure, hold on one second, let me go check for you." → then "Hey, sorry about that. Yeah, we've got a few left." | hold music for 40s between the two |
| 6 | Wrong department, then transfers | greeting is "MVP's pharmacy, this is Larry." → after we ask: "Sure, one moment." → **a different voice**: "Sporting goods, this is Dana." | 6s of ringing before the new voice |
| 7 | Says nothing | (silence) | 12s of it |
| 8 | Hangs up on us | "Yeah, hold on—" | the line drops mid word |

**The Staff voice is NOT Charlie's voice.** Anyone listening back has to be able to tell who is who.

## 4. Where the pass and fail come from

**The owner's Admin → Voice → Testing section IS the expectations list. Do not write a second one.**

He is building it: every step from the transfer onward, each with pass, fail, and what happened. The
robot gets ONE scenario per row. An agent that invents its own expectations has built a test that
proves its own opinion, which is the whole failure this spec is here to end.

**So the order is fixed: Testing is finished FIRST, then this is built against it.**

## 5. What the harness checks, on the real page

Screenshots at every phase, because a description of a screen is not a screen.

1. The store is found from the main page and **Check it** is tapped.
2. If it was checked within the hour, the warning appears and **Check** is tapped again.
3. The check status page: the header moves through its phases **in order**, and never backwards.
4. **Staff's greeting is the FIRST line of the conversation** — this is the one that has failed
   repeatedly, and it is checked on the LIVE view as well as at the end, not only at the end.
5. **The greeting is its own line**, never welded to their answer.
6. **The words match what the robot actually said.** The robot's script is known exactly, so this is
   a comparison, not a judgement. This is the check that would have caught 08-01 on the first round.
7. The conversation scrolls under the header as it grows, and does not bounce when nothing is new.
8. The log expands.
9. The result animates in with the right status for the scenario.
10. Nothing is charged that should not be, and a check that was charged says so.

## 6. Reuse, do not rebuild (LAW 1)

- **The clip machine already exists.** `src/calls/tapedeck.ts` plays a clip, listens, classifies the
  reply cheaply, and picks the next clip. It was built as OUR side of a conversation; the robot is
  the same machine pointed the other way. Do not write a second one.
- `scripts/what-happened.mjs` — reads a real check's saved record off the live site: the conversation,
  the timeline, how much audio was held and for how long, which build served it. The harness reports
  through this rather than inventing its own read.
- `scripts/test-live-view.mjs` — already drives the real page in a real browser at phone size, with
  the follow-the-conversation and scroll-back rules asserted. Extend it; do not start over.
- `src/calls/clip-cache.ts` — turns a line into phone-format audio and caches it. The robot's clips
  ride this, so they cost pennies once rather than every run.

## 7. It has to land in Admin

The Testing section currently shows the **Fun store only**. Robot checks must appear there too, or
the owner cannot see what the agent saw. Same rows, same pass and fail, same detail.

Robot checks are owner-only test traffic: they never touch real-store stats, the finds feed, or any
customer number — the same rule the Fun store already lives under.

## 8. Later, not now: the messy tests

Once the eight above pass reliably, a second stage replaces the clips with a live agent playing
Staff — a distracted man, a blunt one, someone with a speech impediment, background noise mixed
under the line.

**These are deliberately NOT pass and fail.** Two agents improvising produce a different
conversation every run, so they can never prove a fix — they can only FIND new breakage. Keep the
two stages apart and never let an improvised run stand in for a scripted one.

## 9. Done means

- An agent runs one command, and comes back with: every scenario, pass or fail, screenshots, and the
  conversation as it was actually recorded.
- A deliberately broken build FAILS it. Prove that: break the audio handover on purpose, watch the
  harness catch it, then put it back. A test that has never failed has never been tested.
- The owner can open Admin and see the same checks the agent saw.
- Cost per run is written down, measured, not estimated.
