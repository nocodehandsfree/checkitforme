# ECHO ROUND 2 — everything else today's exercise caught

Round 1 is `echo-build.md` (running now). This is the rest: real faults and gaps found while writing
the Testing section on 08-01, none of them in round 1. **The reasoning for all of it lives in
`README.md`, which is the law.** Build these so they already exist when the robot store starts
running checks against them.

**Same hard rule as round 1: the owner is running phone tests. Build and hold. Do NOT ship until he
says testing is finished — every push restarts staging and kills a check in progress.**

---

## 1. CHARLIE IS BEING OPENED TO AN EMPTY LINE (the worst one — real money, seen on his screen)

The owner's own check log, 08-01: **"Charlie was let on without hearing Staff (hold-timeout)" at 63
seconds**, with nobody having spoken. `holdMaxSeconds` (Admin "Hold max seconds", 60) is NOT a hang
up — it **OPENS Charlie when no human was ever heard**. So on a real store Charlie is switched on to
talk to hold music, and bills at 11¢ a minute for it.

**Build: delete that behaviour.** Round 1 gives the hold a real ending (the 2-minute cap), which is
what that setting was reaching for. Nothing may open Charlie except a real person being heard.

**NO VOICE = NO CHECK still holds:** a hold that nobody ever returns from ends at the hold cap with
the existing "left on hold" status. It does not get a Charlie first.

## 2. A DEAD BOX IN ADMIN THAT LOOKS LIVE

`ivrMaxSeconds` (Admin, 90) is **wired to nothing**. The owner can set it, save it, and it changes
nothing at all. Either wire it or remove it from Admin. **PM's recommendation: remove it** — a
control that silently does nothing is worse than no control, and it has already cost reading time.

While in there: `ringMaxSeconds` (35) is the ONLY real give-up today. Confirm it still makes sense
beside round 1's new rules and say so, rather than leaving three timers whose relationship nobody
can state.

## 3. A MISHEARD MACHINE PHRASE CAN STILL HANG UP ON A REAL PERSON

`src/voice/bridge.ts` (~:805-820): the voicemail phrase check is correctly inert during a hold and
after Staff have come back once. **But before any hold, after a real person has answered, a phrase
match still closes both legs.** The pattern includes lines live Staff plausibly say: "is not
available" ("the manager is not available"), "has been forwarded to".

**Build: the check must also go inert once a real person has been found** (`humanAtMs > 0`), not
only once a hold has happened. A machine that answers the phone is caught before that point anyway.

## 4. THINGS THE LOG CLAIMS BUT NOTHING DETECTS

Round 1's log lists these; nothing writes them today, so build the detection:
- **"We were sent back through the phone menu"** — Staff transfer us and we land back in the menu
  instead of at a department. The owner sees this often.
- **"The check was disconnected during the transfer"** — the transfer drops the check entirely. Also
  common, per the owner.

## 5. TELLING THE STORE HANGING UP FROM THE LINE DYING

The carrier only says the check finished, not who ended it. **But we know when WE hang up, because
we do it.** So: ended and we did not hang up = **the store hung up on us**. A failure status rather
than a normal finish = **the check was disconnected**. Wire that so row 11 on the card can be
truthful instead of guessing.

## 6. LEFTOVERS FROM THE 08-01 AUDIT (small, none blocking, all real)

- `mayWriteVerdict` (`src/calls/check-life.ts:111`) has **zero callers** — every finalize calls
  `isCheckAlive` and negates it. Wire it or delete it, so the stated one-question rule cannot drift.
- `lineStillUp` (`src/calls/events.ts:416`) is **dead in production**, referenced only by tests. It
  is the pre-gatekeeper guard and a trap for the next reader. Delete it.
- The delta path never stamps `check_life`, so the gatekeeper is near-inert there while comments
  claim full coverage. Either stamp it or correct the comments — do not leave the lie.
- `/pub/charge` (`src/server.ts:1427`) dedupes charges in **memory only**; a restart lets the same
  check charge twice. Kiosk lane, low stakes, but it is a charge decided from something a restart
  wipes.
- `LIFE_HARD_CAP_SECS` (30 min) and the bridge's 30-minute memory are constants **not validated
  against** the Admin-tunable `maxCallSeconds` / `maxTalkSeconds`. Safe at today's values; a raised
  setting silently resurrects the whole class of fault. Add the guard.

## 7. WHAT IS DELIBERATELY *NOT* HERE

- **"I can't hear you, let me call back."** The owner designed this as a safety net for when our own
  thinking behind Charlie has a blip. It is parked because ElevenLabs will not let us run our own
  thinking while using Branson's cloned voice. Not absent, parked — its own box when he wants it.
- **Splitting the big files.** Its own agent, its own pass, `README.md` §10.
- **The robot store.** Its own build; it sits on top of round 1's card.

## DONE-WHEN

- `npx tsc --noEmit` clean · the tests for what you touched green (NEVER the full suite unprompted)
- A rig scene for items 1, 3, 4 and 5 — each proving the behaviour, not the wiring
- Item 1 proven twice: a hold nobody returns from ends with "left on hold" and **no Charlie ever
  opened**, and a hold somebody DOES return from still reconnects him.
- You opened Admin and confirmed the dead box is gone (item 2). Say what you saw.
- Shipped: merge to staging + `bash scripts/ship-admin.sh`, **only after the owner says testing is
  finished**

## RULES

His words only: it is a **check** · the person is **Staff** · **dropped Charlie** and **reconnected
Charlie** · **department**, never desk · **ElevenLabs**, never "the voice company". No dashes inside
a sentence anywhere he or a customer reads, and never in Charlie's spoken lines. Behaviour not in
this spec is out of scope: find a bug, write it down, leave it.
