# The check status page: loud retry, headline states, the counter

**System:** site · **Status:** active (owner-named — this task IS the unlock authority for the
check-status section of `public/checkit.html`; write the exact glob into `.unlock`, fix ONLY that
scope, delete it after).
**Why (owner, 07-29):** the customer can't hear the call, so the status page is where they SEE the
technology being smart. Transparency + managed expectations = patience + trust.

- Read WHOLE first: `docs/design/STYLE_GUIDE.md` · `docs/design/copy/COPY_STYLE_GUIDE.md` · the
  live-site truth snapshot for the check page. Render before building. EVERY string ships its
  length-checked Spanish in the SAME commit.
- **Four headline states** above the detail: `Calling` → `Getting through the menu` →
  `Talking to Staff` → the verdict. Big, one at a time.
- **The counter:** "usually about 90 seconds to reach a person" — from the chain's own measured
  nav time (the number the Chains page already holds). Never promise a person, only the reach time.
- **Loud retry** is its own proud state, never an apology: "The menu changed. We learned the new
  route and we're calling right back." Same counter, reset. The customer sees the system get
  smarter mid-check.
- **The detail log**: keep it, collapsed by default once the verdict lands; the page scrolls to the
  verdict on top (owner's existing behavior — keep). Expand to see every step.
- **The glowing logo header becomes the step window**: the existing logo area animates with the
  current headline state. Reuse the existing header block; invent no new layout.
- The live-call pipe is HANDLE WITH CARE (`stageForLines`/`liveStage`, the socket): UI reads it,
  never rewires it. If the change touches the pipe itself, stop and say so.

## The counter's number is NOT trustworthy yet (added 07-30, decided with the owner)

The counter bullet above says to read "the chain's own measured nav time". **Do not ship that number
until `site-reach-menu-time.md` lands.** Measured on live data 07-30: all 42 chain numbers a customer
can currently see are `source: backfill` ("inherited from the chain row, no per-call evidence"), and
18 of them are routes the map itself flagged `hammer-route`. Worse, that number is measured to the
moment a PERSON spoke, so it carries the department phone ringing and any hold. The owner will not
promise that: if a transfer rings for a minute with nobody there, it is not the store's typical wait.

Two corrections to the bullet, agreed with him:
- The counter is **automated-system time**, up to the handoff and no further. Not time to a person.
- The wording is `Hang tight. ~65 sec of their automated system.` / `Un momento. ~65 seg de su
  sistema automático.` "Phone tree" is our word, not the customer's. A store where a person answers
  at pickup shows **no counter at all**.

So this task can build the four states and the loud-retry state now, and wire the counter to whatever
`site-reach-menu-time.md` exposes rather than reading `avgTreeSeconds` directly.

**Done when:** a real staging check to the Fun store walks all four states with the counter · the
loud-retry state renders (drive it with a forced route-drift if no real one appears) · EN + ES at
375/390/430 with no bad wraps · verify-live output pasted below.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
