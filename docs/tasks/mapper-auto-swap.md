# Routes swap themselves at three stores, and the owner just gets the note (decision 07-29)

**System:** voice-calls + admin · **Status:** DONE 07-30
**What:** the owner no longer taps "Use it" for maintenance. When THREE separate stores walk the same
new route, the chain's route swaps itself and files a note. Nothing is ever silent.

- Read first: `docs/team/voice-calls/04-map-graph.md` (the three-store rule is already computed —
  this changes what happens when it is met) · `docs/specs/mapping-admin/plan.md` · this file whole.
- A single store that disagrees still gets its own route immediately (already built — do not touch).
- **At three agreeing stores:** the proposed chain route ACTIVATES on its own. The review queue keeps
  the entry, marked "Swapped automatically · 3 stores agree", with the calls attached — the owner
  reads it, he never has to approve it. "Use it / Keep the old one" stays for anything below the
  three-store bar.
- **The Chains page dropdown grows one view: `Menu changed`** — chains and stores with drift, a new
  condition (night/Spanish), or an automatic swap since the owner last looked. Sits beside
  mapped/unmapped in the existing filter. Comp grammar, copy per `copy.md`, no new nav.

**Done when:** a three-store agreement (simulated on staging data) activates the route with the note ·
below three stores still waits for the owner · the `Menu changed` view driven in a browser ·
verify-live output pasted below.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
HEAD = d8c843ec2fd3 · origin/main = 55badd886004
staging  https://staging.checkitforme.com/ → serving aa71339f8570, redeploying to d8c843ec2fd3
prod     https://checkitforme.com/ → 55badd886004 = origin/main: expected until the next promote
admin    https://admin.checkitforme.com/ → ship-admin.sh: {"ok":true,"commit":"d8c843ec","bytes":652611}
         and the LIVE page serves it: "Menu changed" 1 · route-swapped 2 · "Recipe swapped itself" 2
```
The swap itself is server code, so it runs on staging now and on the real site at the next promote.
The screens are live on Admin already.
