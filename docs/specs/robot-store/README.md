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

**Every line below is what a real person really said to us**, taken from
`docs/team/voice-calls/how-staff-actually-talk.md` (all 14 checks in our history that reached a
person who spoke). Only the store name and the person's name are swapped.

A first draft of this list was written from imagination and was wrong in ways that mattered: it had
Staff speaking in clean, complete, helpful sentences. Real Staff are short, they interrupt
themselves, and **the two things that break us most were not in it at all**. Do not "improve" these
lines into better English. The mess is the test.

### The greetings — one per run, rotated

| What the robot says | Why this one |
|---|---|
| "Larry Vasquez, how can I help you?" | their OWN name, not the store's. 7 of 14 lead with a name |
| "Thanks for calling MVP's. Can I help you?" | the plain shape |
| "Good morning, MVP's Woodland Hills. How can I help today?" | 2 of 14 open with the time of day |
| "Mm-hmm. Hello?" | 2 of 14 open on a fragment of a different conversation |
| "Hi, how can I help you? Hello?" | **the most common thing that really happens** — see below |

### The answers

| # | Scenario | What the robot says | What else happens |
|---|---|---|---|
| 1 | Yes, plainly | "Yeah." → if asked again: "We do." | our only real yes in history is two words long. Nobody volunteers detail |
| 2 | No, plainly | "We did not." | |
| 3 | No, softened | "No, I'm sorry. I haven't seen any yet." | |
| 4 | No, this shipment | "No, we don't have any this, this shipment." | the stumble is real, keep it |
| 5 | **Walks away, comes back** | "Uh, Pokémon? Uh, let me check. I just got in, so I have to, uh, I'll have to go up to the front and see. Okay, let me just put you on hold." → **45 seconds of silence** → "Okay, thank you for holding. Yeah, I did not see any, unfortunately." | the ONE hold that ever worked. 45 seconds, not 40, and SILENCE not music: no real store played us music |
| 6 | **Walks away, never comes back** | "Um, give me just a second. Let me double-check." → nothing, ever | happened twice. One ran 121 seconds and never resolved |
| 7 | **The yes hidden inside a no** | "We did, but it's not out yet, so... uh, or I don't think it's out. Let me see." → if asked what form: "It's like a box with, like, three packs in it, I think, or something like that." | **we scored this as no clear answer. It is a YES and we threw it away.** Highest-value test on this list |
| 8 | **The no that turns into a maybe** | "We haven't, as a matter of fact. Uh, let me double-check though. Hold on just a moment." → **30 seconds** → "Yeah, we've got a few." | **we stamped NOT IN STOCK before they came back.** Second-highest |
| 9 | **Cannot hear us, gives up** | "Hi, how can I help you? Hello?" → 3 seconds of nothing → "I'm sorry. You're gonna have to call again. I can't hear you. Bye-bye." → hangs up | **6 of 14 real checks did this. It is the single most common real behaviour and no scripted test has ever reproduced it** |
| 10 | Wrong department, then transfers | greeting is "MVP's pharmacy, this is Larry." → after we ask: "Okay. Transferring you now." → **a different voice**: "Sporting goods, this is Dana." | 6 seconds of ringing before the new voice |

**No restock-day clip.** In 35 real checks, **not one person has ever named a day, a date or a time**.
The stored restock day is empty on every row. Keeping a "call back Friday" clip would test a
conversation that has never happened; the honest version of that test is scenario 4.

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
11. **The verdict is right for the scenario.** Two of the fourteen real checks were scored WRONG —
    a yes read as nothing, a maybe read as a no — and both are scenarios 7 and 8 above. The harness
    fails if either comes back with the wrong answer, because that is money and trust, not cosmetics.

### What the words must be compared against

The robot's script is known exactly, so this is arithmetic, not opinion: **what we wrote down is
compared word for word against what the robot said.** Our own history is full of the failure this
catches — "CVS" written down as "CBS", as "CDS there", and as "Seabass"; four separate turns welded
into one line with no space between them; a store menu recorded as one 181 second clerk line with
the words fused together. Any of those passing silently is the harness failing.

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
