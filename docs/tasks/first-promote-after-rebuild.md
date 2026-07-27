# First promote after the rebuild — confirm prod + admin go LIVE in verify-live

**What:** The build stamp shipped with the rebuild, so prod and admin show NOT-LIVE (no stamp)
until the next promote carries it. On that promote, confirm the stamp lights up everywhere.
The promote also carries the zone-lane fix (see ops checkpoint for the full ride-along list).
**Done when:** `bash scripts/verify-live.sh` prints LIVE for staging AND prod AND admin right
after the promote (prod/admin serve origin/main, so promote first, then run it from main).
**Lane:** Ops
**Status:** open (fires at the owner's next promote word)

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
