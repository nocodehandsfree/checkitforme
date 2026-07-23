# Alert copy is prod-only — not mirrored to staging

**What:** Editing a customer alert message writes `alerts_json`, which is NOT in the settings-mirror
set — so alert copy is prod-only and staging never follows at all. (Separately, the checkpoint notes
the SITE still reads hardcoded share/referral/zones messages, so a customer's edit won't show on the
site until that's wired.) Decide whether alert copy should mirror like the other settings or ride the
new env switch.
**Done when:** Alert copy either mirrors prod→staging like plans/statuses, or is editable per-env via
the shell switch — no silent prod-only divergence.
**Lane:** Addie + Webbie
**Tag:** wiring
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
