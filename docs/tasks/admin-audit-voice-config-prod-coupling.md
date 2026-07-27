# Designer + Workflows write prod voice config — env picker never shipped

**What:** Every voice/opener/persona/workflow/default/lane save in Designer and Workflows writes prod's
LIVE call config (`PATCH /api/settings` → `vt_*`), mostly with no confirm; "Use for live calls"
(`/api/voices/active`) changes what real customer calls sound like. `vt_*` is excluded from the
settings mirror, so staging never follows — there is currently NO way to build/tune a workflow without
mutating prod. The Prod|Staging env picker the checkpoint calls "half done" is 0% in shipped code.
**Done when:** A workflow can be built and tuned against staging, heard on staging, then promoted to
prod — no edit silently changes live calls.
**Lane:** Addie
**Tag:** wiring
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
