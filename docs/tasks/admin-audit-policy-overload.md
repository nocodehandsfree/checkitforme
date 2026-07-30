# Policy page is overloaded — split per comp, drop duplicated blocks

**What:** The comp says Policy splits into a CONSOLE (flags) + LOG queues (requests/waitlist/
moderation). The code did that split, then bolted on a pricing form, a plans mirror, a Pulse block,
and an intel block.
**Done when:** Policy matches its comp (flags console + queues), with pricing where it belongs and no
Pulse/intel/kiosk duplication of other pages.
**Lane:** Addie
**Tag:** comp
**Status:** DONE 07-29 (`0f2b6b7e`). Full proof in `addie-dashboard-continue.md`.

**Where "pricing where it belongs" landed, so nobody re-cuts it:** the comp says "Flags AND pricing
stay as a console", so pricing belongs HERE. It is the GRAMMAR that was wrong: a console has no save
key, so the grid of bare number boxes plus Save pricing became seven console rows that each save when
you leave the field. Pulse and kiosks already had their markup on Live and Kiosk; what was left was
Policy still CALLING their loaders on open. The intel block's holder was already gone, so its function
was dead code. The only thing that moved page is the web-analytics ID, to the App console.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
staging  https://staging.checkitforme.com/ -> LIVE (serving 0f2b6b7efe2b)
prod     https://checkitforme.com/         -> 55badd886004 (origin/main, awaiting promote)
admin    shell override 0f2b6b7e, server 55badd886004
```
