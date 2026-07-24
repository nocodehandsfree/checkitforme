# specs/ — ACTIVE builds only. One file (or folder) per feature, named for the feature.
| Spec | What it is | Status |
|---|---|---|
| `price-compare.md` | Cheapest-price display across multi-store checks | ACTIVE (backend field unbuilt) |
| `e2e-coverage/harness.md` | e2e test map, wired into `scripts/launch-gate.sh` | LIVE contract |

**Rule:** feature ships → its spec moves to `docs/archive/`. Temp docs (briefs etc.) live INSIDE the
feature's folder and get archived with it — no temp folders anywhere else, DevOps prunes.
