# Policy / Plans / Statuses edit prod-first — need a staging-writable path

**What:** Editing flags & pricing (Policy → `policy_json`), plans (Plans → `vt_plans`) or the verdict
registry (Statuses) is a PROD write that the settings mirror copies one-way prod → staging every
minute. You cannot preview these on staging first — building forces a prod change. Give these
mirrored settings a staging-writable path (build on staging, then promote), instead of prod-first + mirror.
**Done when:** The owner can change a flag/price/plan/status on staging, see it on staging only, then
promote it to prod deliberately — no silent prod-first write.
**Lane:** Ops
**Tag:** wiring
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
