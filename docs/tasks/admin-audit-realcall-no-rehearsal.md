# Real prod calls with no staging rehearsal (Chains / Search / Designer / Fun)

**What:** Chains mapping, Search call-now, Designer's test bench, and Fun all place REAL prod phone
calls (Chains mapping burns real budget at 12/day; Plans Publish spends real Stripe money). These
legitimately stay prod, but there's no staging dry-run — you can't rehearse a mapping run or a bench
call against staging's simulated-call path from THE Admin. Document which actions are intentionally
prod-and-money, and route the rehearsable ones (mapping) through the env switch so staging can dry-run
them (staging simulates calls, zero telephony cost).
**Done when:** Real-money actions are clearly labeled prod-only; mapping/bench can be rehearsed on
staging via the switch.
**Lane:** Ops + Echo
**Tag:** wiring
**Status:** open

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
