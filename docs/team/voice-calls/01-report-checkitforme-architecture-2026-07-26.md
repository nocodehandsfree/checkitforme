# docs/team/voice-calls/01-report-checkitforme-architecture-2026-07-26.md

# CheckItForMe Voice Platform
## Architecture & Implementation Report
### July 26, 2026

---

# Purpose

This document defines the architecture, implementation priorities, and engineering decisions for the next generation of the CheckItForMe voice platform.

This is **not** a greenfield project.

The current production system already works.

The objective is to improve it using the production data gathered on July 25–26, 2026.

---

# Current Production Architecture

Current call flow:

```
Twilio
    ↓
Media Stream WebSocket
    ↓
Bridge WebSocket
    ↓
ElevenLabs Conversational AI (Charlie)
```

The Twilio integration and bridge already exist.

Do not replace working production components unless measurements demonstrate a clear benefit.

Improve incrementally.

---

# Current Production Metrics

Current callable stores:

- 112,078 stores

Current routing coverage:

- Direct: 59.0%
- Alpha (DTMF): 32.9%
- Bravo (Voice IVR): 6.7%
- Unmapped: 1.4%

Current production baseline:

- 3.6 paid attempts per delivered customer result

This number is **not** considered representative because it includes:

- incomplete mappings
- routing bugs
- engineering experiments
- temporary regressions
- unfinished navigation

The system must be re-measured after implementation.

---

# Charlie Metrics

Current median connected time:

| Result | Median |
|---------|--------|
| In Stock | 42 sec |
| Not In Stock | 28 sec |
| Sold Out | 26 sec |
| Couldn't Tell | 25 sec |
| No Answer | 27 sec |
| Voicemail | 14 sec |
| Overall | 26 sec |

Engineering targets:

Current architecture:
20–22 seconds

Future architecture:
under 20 seconds

---

# Existing Decisions

These decisions are final.

## The runtime is not being rebuilt.

It is being improved.

---

## Charlie is not the system.

Charlie is only the reasoning layer.

The runtime must be designed so reasoning providers can be replaced without changing the architecture.

---

## Deterministic systems always come first.

Use AI only when reasoning is required.

---

## Mapping is a company asset.

Knowledge should never live inside runtime code.

---

## Every production call should improve the platform.

Customer value:

Receive inventory status.

Platform value:

Improve mapping, routing, timing and confidence.

---

# Runtime Layers

The platform consists of four execution layers.

## Direct

Human answers immediately.

No navigation.

---

## Alpha

Deterministic DTMF.

Never conversational.

---

## Bravo

Deterministic spoken IVR.

Known phrases only.

---

## Charlie

Reasoning only.

Charlie should never navigate deterministic menus.

Charlie should activate only after a human is expected.

---

# Delta

Introduce a lightweight admission controller named Delta.

Responsibilities:

- IVR detection
- Human detection
- Voicemail detection
- Hold detection
- Language detection
- Charlie admission

Delta exists to reduce unnecessary Charlie usage.

---

# Runtime Principles

The runtime owns execution.

The runtime does not own:

- mappings
- dashboards
- pricing
- retailer knowledge

Those belong elsewhere.

---

# Mapper Principles

Mapper owns:

- phone trees
- prompt recordings
- transcripts
- timing
- DTMF
- spoken navigation
- versions
- confidence
- drift detection

Production never updates mappings directly.

Production creates recommendations.

Approved recommendations become new mapping versions.

---

# Dashboard

The dashboard is a required component.

It is not optional.

It must become the operational interface for the platform.

Minimum capabilities:

- call replay
- synchronized audio
- transcript
- event timeline
- Alpha decisions
- Bravo decisions
- Delta decisions
- Charlie decisions
- mapping version
- provider costs
- confidence
- unknown queue
- drift queue
- replay search
- retailer analytics
- store analytics
- runtime metrics

If an engineer cannot explain a runtime decision from the dashboard, the dashboard is incomplete.

---

# ROI Instrumentation

The platform must continuously calculate:

- cost per attempt
- cost per successful result
- Twilio cost
- AI cost
- provider cost
- average attempts
- average Charlie seconds
- average navigation time
- gross margin
- revenue per check
- revenue per customer
- cost absorbed by "No Check, No Charge"

Pricing decisions should be based on production measurements rather than estimates.

---

# Rollout Order

Phase 1

Improve runtime.

Improve mapping.

No pricing changes.

---

Phase 2

Deploy replay.

Deploy dashboard.

Collect production metrics.

---

Phase 3

Measure ROI.

Measure provider costs.

Measure margins.

Update customer plans if necessary.

---

# Success Metrics

Engineering success is measured by:

- lower time to answer
- lower Charlie seconds
- fewer attempts per successful result
- higher deterministic routing
- better mapping confidence
- fewer unknowns
- better replay
- lower cost per delivered result

---

# Deliverables

The next implementation must produce:

- improved runtime
- improved mapping engine
- replay system
- engineering dashboard
- ROI reporting
- provider abstraction
- production metrics
- approval workflow
- versioned mappings

---

# Final Direction

The platform is no longer simply an AI caller.

It is a reusable telephone operating system whose primary competitive advantage is the knowledge accumulated from production calls.

Every implementation decision should strengthen that advantage while improving customer experience and lowering operating cost.