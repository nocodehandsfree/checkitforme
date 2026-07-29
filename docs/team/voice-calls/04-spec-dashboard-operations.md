# docs/team/voice-calls/04-spec-dashboard-operations.md

# Dashboard, Replay & Operations Specification
## Version 1

---

# Mission

The dashboard is the operational command center for CheckItForMe.

It is not an analytics page.

It is where engineering, operations and support understand every production call and improve the platform.

If a production decision cannot be explained from the dashboard, the dashboard is incomplete.

---

# Primary Users

- Engineering
- Operations
- Customer Support
- Product
- QA

---

# Dashboard Objectives

Provide complete visibility into:

- Every call
- Every runtime decision
- Every mapping decision
- Every provider
- Every cost
- Every recommendation
- Every unknown
- Every production trend

---

# Home Dashboard

Display:

- Calls Today
- Successful Results
- Failed Results
- Current Success Rate
- Average Attempts Per Result
- Average Time To Answer
- Average Charlie Seconds
- Average Navigation Time
- Current Gross Margin
- Current Cost Per Result

---

# Runtime Metrics

Track:

- Direct %
- Alpha %
- Bravo %
- Charlie %
- Human Detection Time
- Hold Time
- Transfer Rate
- Unknown Rate
- Voicemail Rate
- Replay Coverage

Show trends by:

- Hour
- Day
- Week
- Month

---

# ROI Dashboard

Continuously calculate:

Revenue

Cost

Gross Margin

Margin %

Twilio Cost

Voice Provider Cost

Reasoning Cost

Infrastructure Cost

Attempts Per Result

Charlie Seconds

Navigation Seconds

Average Customer Wait Time

Average Cost Per Successful Result

"No Check, No Charge" Cost

Show historical trends.

---

# Replay

Every call must support replay.

Replay includes:

Timeline

Audio

Transcript

Runtime Events

Mapping Version

Provider

Model

Confidence

Costs

Final Result

Replay controls:

Pause

Seek

Jump To Event

Jump To Charlie

Jump To Hold

Jump To Transfer

Download Transcript

---

# Call Timeline

Every replay should show:

Call Started

Connected

Delta Decision

Alpha Events

Bravo Events

Charlie Joined

Charlie Left

Transfers

Hold

Inventory Result

Call End

Every event includes timestamp.

---

# Mapping View

Display:

Current Mapping

Previous Mapping

Confidence

Version

Evidence

Traversal Time

Success Rate

Interrupt Timing

Recovery Path

Replay Links

---

# Unknown Queue

Queue every unknown.

Display:

Store

Call

Audio

Transcript

Runtime Events

Confidence

Recommendation

Assigned Engineer

Status

---

# Drift Queue

Display:

Old Prompt

New Prompt

Timing Change

Language Change

DTMF Change

Confidence Change

Evidence

Approve

Reject

---

# Approval Workflow

Recommendations become production only after approval.

Workflow:

Recommendation

↓

Review

↓

Approve

↓

New Version

↓

Production

Never update production mappings automatically.

---

# Store View

Each store displays:

Latest Call

Last Successful Check

Current Mapping

Confidence

Unknown Count

Drift Count

Average Traversal Time

Average Charlie Seconds

Average Attempts

Historical Trend

---

# Retailer View

Display:

Store Count

Success Rate

Unknown Rate

Average Cost

Average Traversal

Mapping Confidence

Drift Frequency

Top Failure Reasons

---

# Plan & ROI View

For every customer plan calculate:

Revenue

Checks Used

Checks Remaining

Average Cost

Average Margin

Average Time Saved

Support Cost

Profitability

This page should guide future pricing decisions.

---

# Alerts

Generate alerts for:

Mapping Drift

High Unknown Rate

Charlie Spike

Provider Failures

Replay Errors

Routing Failures

Margin Drop

Success Rate Drop

---

# Search

Search by:

Call ID

Store

Retailer

Phone Number

Transcript

Status

Runtime Event

Customer

Date

---

# Success Criteria

The dashboard succeeds when:

✓ Every production decision is observable

✓ Every call is replayable

✓ ROI is measurable

✓ Unknowns become actionable work

✓ Mapping approvals require no code

✓ Engineers debug from replay instead of logs

✓ Executives can evaluate profitability from live production data

---

# Definition of Done

The dashboard becomes the single source of truth for engineering, operations, mapping, replay, runtime performance, and business performance.