# One Admin, two environments: shell-level Live/Staging switch

**What:** Promote the scattered per-page "Live site / Staging site" toggle (`srcApi`/`CALL_SRC`, only on Users/Feedback/Testing/Chats today) to ONE visible environment switch in the Admin shell that EVERY page's reads and writes honor. Extend the staging fetch path to the other 18 pages so staging and prod can be managed side by side. Keep it one Admin, never two. Pattern already exists (the 4 toggled pages) and the CRUD comp (1e) already draws an "env track."
**Done when:** A single shell switch flips the whole Admin between Live and Staging; each page reads/writes the chosen env; real-call and Stripe actions stay prod-gated regardless.
**Lane:** Ops + Addie
**Tag:** wiring
**Status:** open (owner-gated — this is the headline fix; scope with the owner)

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
