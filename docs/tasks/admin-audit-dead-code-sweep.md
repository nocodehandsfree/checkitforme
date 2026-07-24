# Dead-code sweep across the Admin

**What:** The audit found handlers with no callers and controls with no elements:
- Search: `refreshHours`, `backfillAllHours` (no callers; the latter would re-load 100k stores every 8s).
- Statuses: `saveStatus` (no caller — edits auto-save); ALSO no delete handler exists (add one).
- App (settings): `loadSettings` + `toggleVoicemail` drive a `vmToggle` that isn't on the page.
- Chats: `supReindex` ("Update from the book") has no button; the "Pending review · N" pill counts a
  queue with no screen.
- ADMIN_MANUAL §13 dead JS: Live Listen card, Bridge Call, Tree Lab, voice presets, bail-rules editor
  (functions exist, elements gone).
- `#catalog` section exists but is unreachable from nav.
**Done when:** Each item is deleted or wired; the missing Statuses delete is added; no orphaned handlers
remain.
**Lane:** Addie
**Tag:** cut
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
