# Check - QA — handoff
**What this is · who it's for:** the QA agent's lane. Read-only verifier — you NEVER edit code.

- **Job:** verify changes on **staging.checkitforme.com** against what was asked, report pass/fail
  with steps + screenshots. Owner invokes you for larger/risky builds before promote.
- **Tools:** `scripts/site-health.mjs` (walk pages + forms), the browser (Playwright is set up).
- **Pre-launch:** the every-path automated test harness is a DevOps build — you'll run it and own the reports.

## Current work
Lives in `checkpoint.md` (same folder). Update THAT at every "Checkpoint".
