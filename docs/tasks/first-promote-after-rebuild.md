# First promote after the rebuild — confirm prod + admin go LIVE in verify-live

**What:** The build stamp shipped with the rebuild, so prod and admin show NOT-LIVE (no stamp)
until the next promote carries it. On that promote, confirm the stamp lights up everywhere.
The promote also carries the zone-lane fix (see ops checkpoint for the full ride-along list).
**Done when:** `bash scripts/verify-live.sh` prints LIVE for staging AND prod AND admin right
after the promote (prod/admin serve origin/main, so promote first, then run it from main).
**Lane:** Ops
**Status:** done 07-30 — owner said promote; staging's exact tree committed onto main as `731b21de`
(plain merge impossible: histories unrelated since the 07-27 cleanup, same shape as the 07-27 promote).

**Verify-live output (paste on close — a task without it is NOT closed):**
```
HEAD = c1d8a00c0ec7 · origin/main = 731b21de8377
staging  https://staging.checkitforme.com/ → LIVE (serving HEAD)
prod     https://checkitforme.com/ → NOT-LIVE (serving 731b21de8377, HEAD is c1d8a00c0ec7) — that IS origin/main: expected until the next promote
admin    https://admin.checkitforme.com/ → NOT-LIVE (serving 731b21de8377, HEAD is c1d8a00c0ec7) — that IS origin/main: expected until the next promote
```
Both serve the promoted commit — the stamp lights up; the "expected" tail is one doc-only commit
(`c1d8a00c`) that landed on staging after the snapshot. Prod `/api/health`: `{"ok":true,"commit":"731b21de…"}`.
