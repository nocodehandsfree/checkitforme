# docs/team/voice-calls/02-spec-runtime-echo.md

# Echo Runtime Specification
## Version 2
## Owner: Echo

---

# Mission

Improve the existing production runtime.

Do not rebuild working systems.

Every change must improve one or more of:

- Time to Answer
- Charlie Seconds
- Cost Per Result
- Deterministic Routing
- Replay Quality
- System Reliability

---

# Existing Production

Current runtime:

```
Twilio
 ↓
Media Stream WS
 ↓
Bridge WS
 ↓
Charlie (ElevenLabs)
```

This architecture remains.

Improve it.

Do not replace it.

---

# Runtime Responsibilities

Echo owns:

- Call lifecycle
- Twilio integration
- Media Stream
- Bridge
- Runtime state machine
- Direct
- Alpha
- Bravo
- Delta
- Charlie lifecycle
- Replay events
- Cost tracking
- Runtime metrics
- Dashboard event emission

Echo does NOT own:

- Phone trees
- Prompt recordings
- Mapping
- Dashboard UI
- Pricing
- Customer plans

---

# Runtime Flow

```
Dial

↓

Connect

↓

Delta

↓

Direct
or
Alpha
or
Bravo

↓

Human Detected

↓

Charlie

↓

Inventory Result

↓

Persist

↓

Replay + Metrics
```

Every transition must generate an event.

---

# Direct

Responsibilities

- Human answers immediately
- Skip navigation
- Activate Charlie only after confirmation

Measure:

- Human Detection Time
- Charlie Join Delay

---

# Alpha

Responsibilities

- Deterministic DTMF only
- Never conversational
- Never reason

Consumes:

- Mapping
- Timing
- Confidence

Produces:

- Replay events
- Metrics

---

# Bravo

Responsibilities

- Deterministic spoken IVR
- Exact mapped phrases
- No reasoning

Consumes:

- Prompt library
- Spoken mappings
- Interrupt timing

Produces:

- Replay events
- Metrics

---

# Delta

Delta is the admission controller.

Responsibilities

Detect:

- IVR
- Human
- Hold
- Voicemail
- Language

Determine:

- Charlie Required
- Charlie Not Required

Charlie should never activate before Delta finishes.

---

# Charlie

Charlie is a runtime role.

Not a vendor.

Reasoning providers must be replaceable.

Charlie only owns:

- Conversation
- Clarification
- Reasoning
- Status extraction

Charlie never owns:

- Phone trees
- Navigation
- Mapping

---

# Provider Abstraction

The runtime should support changing:

Voice Provider

Reasoning Provider

LLM

without changing runtime logic.

Runtime communicates through interfaces.

Never vendor-specific code.

---

# Hold Behavior

When practical:

Pause Charlie.

Keep phone alive.

Reconnect Charlie when needed.

Measure:

- Hold Time
- Charlie Saved Seconds

---

# Runtime Metrics

Track

- Calls Started
- Calls Connected
- Human Detection Time
- Navigation Time
- Charlie Connected Seconds
- Charlie Speaking Seconds
- Charlie Listening Seconds
- Charlie Silence Seconds
- Charlie Needed Seconds
- Charlie Avoidable Seconds
- Time To Answer
- Call Duration

---

# Replay

Replay every call.

Include

- Audio
- Transcript
- Runtime Events
- Mapping Version
- Costs
- Timeline
- Decisions
- Confidence

Replay is the primary debugging tool.

---

# Dashboard Events

Every runtime event must be visible.

Minimum events

- Call Started
- Connected
- Delta Decision
- Alpha Action
- Bravo Action
- Charlie Joined
- Charlie Left
- Hold
- Transfer
- Unknown
- Inventory Status
- Completed

---

# ROI Instrumentation

Record

Twilio Cost

Voice Cost

Reasoning Cost

Infrastructure Cost

Total Cost

Revenue

Gross Margin

Attempts

Result

Do not estimate.

Measure actual production values.

---

# Rollout Plan

Phase 1

Improve runtime behavior.

---

Phase 2

Deploy replay.

Deploy dashboard metrics.

---

Phase 3

Optimize Charlie.

Reduce attempts.

Reduce costs.

---

Phase 4

Measure ROI.

Adjust pricing only after production measurements.

---

# Acceptance Criteria

Runtime is complete when:

✓ Existing production behavior preserved

✓ Replay complete

✓ Dashboard receives all events

✓ Charlie joins later

✓ Time to Answer decreases

✓ Cost per Result decreases

✓ Unknowns recorded

✓ Metrics complete

✓ Provider abstraction complete

✓ No retailer-specific runtime logic

---

# Definition of Done

Echo succeeds when another engineer can replay any production call and understand every runtime decision without reading source code.