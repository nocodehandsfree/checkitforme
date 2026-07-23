# Back button must always return to the previous page

**What:** The device/browser back button must always collapse the current sheet/overlay and return
to the previous view — never jump out of the app or do nothing. Known failing example: the Alerts
sheet inside My Checks does NOT collapse on back (other overlays/sheets DO). Find the shared
history/back handler, and wire every sheet/overlay — the Alerts sheet especially — through it so
back closes the topmost one. ADDITIVE (LAW 1): use the existing open-with-history helper the other
sheets already use; do not invent a second nav system. Consumer site is FROZEN — owner-named, so use
the `.unlock` flow for `public/checkit.html`, verify-live, delete `.unlock`, re-snapshot the page.

**Done when:** On staging: open the Alerts sheet in My Checks → press back → it collapses to My
Checks (does not exit the app). Spot-check the other main sheets/overlays still close on back exactly
as before. EN + ES. Truth snapshot re-taken.
**Lane:** Webbie
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
verify-live 2026-07-23: staging https://staging.checkitforme.com/ → LIVE (serving HEAD 4f6c4a6).
Alerts sheet now sheetPush('alerts') + alertsOv in the popstate close-map (present in live snapshot).
Truth snapshot re-taken. Owner confirms back-collapse on his phone. Follow-up: email/score sheets
share the same gap, left for a named task.
```
