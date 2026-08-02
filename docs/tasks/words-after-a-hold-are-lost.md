# Everything Staff says after a hold is missing from the check

**System:** voice-calls · **Status:** active · **Found:** 2026-08-02 by the robot store, checks 246-251.

## What happens
Staff answer, we ask, and they go away to look. From that moment on, **nothing they say is written
down.** The check is filed on the greeting alone, so the answer they came back with never reaches the
owner or the customer. Same shape when they transfer us to someone else, and when they hang up on us.

Scenes that answer straight away (1, 2, 3, 7) lose nothing. Only the ones with a gap in them break.

## The four it was caught on
| Scene | What Staff really said | What we filed |
|---|---|---|
| 8 · the no that turns into a yes | "We haven't, as a matter of fact. Uh, let me double-check though." → 30 seconds → **"Yeah, we've got a few."** | **left on hold** — the yes thrown away (check 249) |
| 5 · walks away, comes back | "let me check… put you on hold" → 45 seconds → **"Yeah, I did not see any, unfortunately."** | **nobody answered**, and the SCREEN said **In stock** (check 246) |
| 9 · cannot hear us | "I'm sorry. You're gonna have to call again. I can't hear you. Bye-bye." | couldn't tell, and the line is missing (check 250) |
| 10 · wrong department | "Okay. Transferring you now." → a different person: "Sporting goods, this is Dana." | couldn't tell, both lines missing (check 251) |

Scene 8 is the same failure as real check 135, and scene 5 shows a customer being told the OPPOSITE
of what Staff said. That is money and trust, not cosmetics.

## Where to start
Check 246's own timeline has all of it: Staff greeting at 4 seconds, hold at 27, Charlie dropped at 27,
reconnected at 69 after a 47 second gap, hang up at 95. So the gap is SEEN. What is said after the
reconnect is what never lands in the written conversation. `node scripts/what-happened.mjs 246`.

## Done when
`node scripts/robot-check.mjs 5 6 8 9 10` comes back with every scene holding: the words match what the
robot said, and each verdict is the one the scene expects (8 is **in stock**, 5 is **not in stock**).

## Two more the same run found, smaller, same lane
- **One check can write four records.** Check 238 is the real one; 239, 240 and 241 are copies of the
  same phone call, written 41 seconds later, with no room and a shorter conversation. Anything reading
  the newest row gets the unfinished one, and the owner's Testing screen shows all four.
- **Two turns welded into one line** (check 238): "Mm-hmm. Hello? No, we don't have any this, this
  shipment." was a greeting and, seconds later, an answer.
