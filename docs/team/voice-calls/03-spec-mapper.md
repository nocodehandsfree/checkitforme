# docs/team/voice-calls/03-spec-mapper.md

# Mapper Specification
## Version 2
## Owner: Mapper

---

# Mission

Continuously improve the telephone navigation graph using production evidence.

Mapper owns knowledge.

Runtime consumes knowledge.

Production never edits mappings directly.

---

# Existing Reality

Thousands of production calls already exist.

Do not rebuild mappings.

Improve them.

Preserve historical knowledge.

Version every approved change.

---

# Mapper Responsibilities

Own:

- Phone trees
- Prompt recordings
- Prompt transcripts
- Menu graph
- DTMF routes
- Spoken routes
- Prompt timing
- Interrupt timing
- Confidence
- Drift detection
- Recovery paths
- Mapping versions
- Approval workflow

Do NOT own:

- Runtime
- Twilio
- Charlie
- Dashboard UI
- Pricing

---

# Knowledge Pipeline

```
Production Call

↓

Observation

↓

Evidence

↓

Recommendation

↓

Human Review

↓

Approved Version

↓

Production
```

Production never rewrites mappings automatically.

---

# Every Mapping Stores

- Chain
- Store
- Department
- Phone Number
- Language
- Current Version
- Previous Versions
- Confidence
- Last Verified

---

# Every Prompt Stores

- Recording
- Transcript
- Parent Prompt
- Child Prompts
- Expected Duration
- Average Duration
- Interrupt Point
- Language
- Confidence
- Version

---

# Every Route Stores

- DTMF
- Spoken Phrase
- Destination
- Recovery Route
- Confidence
- Success Rate
- Average Traversal Time

---

# Confidence

Every object has confidence.

Increase confidence through repeated production validation.

Decrease confidence when production behavior changes.

Never assume.

---

# Drift Detection

Detect:

- Prompt changes
- Timing changes
- New prompts
- Removed prompts
- Department changes
- Transfer changes
- Language changes
- DTMF changes

Every drift event creates a review item.

---

# Unknown Queue

Unknowns are never discarded.

Store:

- Audio
- Transcript
- Call ID
- Mapping Version
- Runtime Events
- Timestamp
- Confidence

Unknowns become future work.

---

# Recovery

Every node should define:

Primary Path

Fallback

Operator

Repeat

Unknown

Disconnect

Runtime should never become stuck.

---

# Dashboard Data

Mapper provides:

Current Mapping

Previous Mapping

Confidence

Evidence

Versions

Drift

Unknown Queue

Approval Queue

Success Rates

Traversal Times

The dashboard should allow engineers to approve mapping changes without editing code.

---

# Replay Integration

Every mapping object should link to:

- Replay
- Audio
- Transcript
- Production Calls

Evidence should always be reviewable.

---

# Runtime Contract

Runtime requests:

Navigation

Prompt

Timing

Interrupt Point

Language

Recovery

Confidence

Mapper returns structured data.

Runtime never interprets raw phone trees.

---

# ROI Contribution

Track:

Deterministic Success %

Average Traversal Time

Unknown Rate

Drift Rate

Human Review Count

Approved Improvements

Mapping Quality directly impacts:

- Charlie Seconds
- Attempts Per Result
- Customer Wait Time
- Operating Cost

---

# Rollout

Phase 1

Normalize graph.

---

Phase 2

Version mappings.

---

Phase 3

Drift detection.

---

Phase 4

Approval workflow.

---

Phase 5

Production optimization.

---

# Acceptance Criteria

✓ Versioned mappings

✓ Confidence model

✓ Drift detection

✓ Unknown queue

✓ Replay integration

✓ Approval workflow

✓ Runtime interfaces

✓ Dashboard integration

✓ No direct production mutations

---

# Definition of Done

Mapper succeeds when:

Production continuously improves the navigation graph while remaining deterministic, reviewable, versioned, and evidence-based.

The runtime becomes simpler over time because the knowledge becomes better.