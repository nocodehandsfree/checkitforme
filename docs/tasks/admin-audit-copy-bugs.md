# Small Admin copy fixes (wrong toast, dev-speak, raw values)

**What:** A cluster of small copy problems found in the audit:
- Add: an import failure shows "Couldn't backfill the regions" (copy-pasted from the wrong handler).
- Alerts: "Stubbed" / "Stubbed sends never reach a customer" — say "test only / not delivered."
- Live (dash): Call-health tile says "dup ingests" — dev-speak.
- Kiosk: shows the raw address `restocktimer@gmail.com`.
- Policy: raw "GA4 measurement id" and "Finds headstart (min)" fields exposed.
- Chats: invented "Tier 1 / Tier 2 / Human email" label set.
- Chains: tooltip typo "wrapping up.ping up." (also in ADMIN_MANUAL §13).
**Done when:** Each string reads plain per the copy guide, with length-checked Spanish shipped in the
same commit.
**Lane:** Webbie
**Tag:** copy
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
