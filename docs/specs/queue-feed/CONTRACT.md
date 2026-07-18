# Queue feed — the waiting-screen contract (front ⇄ back)

**Owner ask 2026-07-16.** When call slots are full (the concurrency governor is ON and at capacity),
a new single check does not fail — it **queues**. The waiting screen shows the person their **place
in line** and a **real ETA** (seconds until their call dials), polls every second, and **flips to the
live transcript** the instant their call actually dials.

This is the shape DevOps built the backend to. **Front-end (consumer call UI) builds to this exact
shape** so the two match. Only active when `policy.concurrency.enabled` is true — otherwise checks
place instantly as today and none of this is reached.

## 1. Placing a check — the response gains a queued branch

The existing check endpoints are unchanged on the happy path. When the pool is full they return a
`queued` object instead of a call id. Endpoints: `POST /app/check`, `POST /pub/check`,
`POST /app/check-live`, `POST /pub/check-live`.

**Slot free (placed now — TODAY's shape, unchanged):**
```jsonc
{ "providerCallId": "conv_…", "status": "in_progress" }      // /app/check, /pub/check
{ "room": "…", "wsHost": "…" }                                // the -live variants
```

**Pool full (queued):**
```jsonc
{
  "queued": true,
  "ticketId": "q_a1b2c3",     // poll this
  "position": 3,               // 1-based place in line (1 = next up)
  "etaSeconds": 42,            // real estimate, seconds until this call dials
  "pollEveryMs": 1000
}
```
The front-end shows the waiting screen when `queued === true`, and starts polling §2.

## 2. Poll the ticket — `GET /pub/queue/:ticketId` (every ~1s, no auth beyond the cid model)

**Still waiting:**
```jsonc
{ "status": "queued", "position": 2, "etaSeconds": 28 }
```
Render place-in-line + a live countdown. `position` and `etaSeconds` both update as calls end —
`etaSeconds` can tick down between polls on the client, but trust the server value each poll.

**Slot freed → the call is dialing (FLIP to the live transcript now):**
```jsonc
{ "status": "dialing", "providerCallId": "bridge:… | conv:… | delta:…", "room": "…", "wsHost": "…" }
```
This is the flip signal. Drive the live view exactly as a normal check does: poll `GET /pub/live/:id`
+ `GET /pub/result/:id` (and the bridge room / ws for live audio) using `providerCallId` (and `room`/
`wsHost` when present). No new live-view plumbing — same as a check that never queued.

**Could not place (rare — a real error at dial time):**
```jsonc
{ "status": "error", "error": "…" }        // show the normal "call failed" verdict
```

**Ticket unknown or expired (abandoned page, >5 min):**
```jsonc
{ "status": "gone" }                        // send the user back to start a fresh check
```

## 3. How the ETA is REAL (not a guess)

The server reads the **live calls** (every call currently dialing/in-progress: how long each has
been running) and the **expected call length** (rolling average of recent finished calls). It runs a
small event simulation — each live call frees its slot at `expectedLen − elapsed`; as slots free, the
queue is served in order (interactive single checks ahead of batch zone-sweep calls) — and reads off
the second a slot is free for THIS position. So `etaSeconds` falls out of real timing and shrinks as
calls end. It is an estimate (call lengths vary), never a fixed countdown.

## Notes for the front-end
- Position is **per priority class**: a single interactive check is only ever behind other interactive
  checks (zone-sweep batch calls never delay a person's instant check).
- `etaSeconds: 0` with `status: "queued"` means "a slot is opening this second" — keep polling; the
  next poll should return `dialing`.
- Nothing here fires when the governor is off (staging today). Build + test behind that.
