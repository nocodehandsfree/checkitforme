# The wrong-department save (owner decision 07-29)

**System:** voice-calls · **Status:** active
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

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
