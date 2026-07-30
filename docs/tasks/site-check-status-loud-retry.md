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
- **The counter's number (Mapper's contract, 07-30 — do not re-derive):** read `navSeconds` off
  `GET /api/admin/map/graph` — the rule lives there in one place. A store with a greeting but no
  menu counts as 0 (answers direct). Today only CVS (chain 5, staging) carries a real measured
  number; the other 92 chains still ride backfilled data — so BUILD against CVS on staging and
  **ship the counter dark** until the re-mapping round fills real numbers. The four states and the
  loud retry ship live now; only the counter waits.
- **Loud retry** is its own proud state, never an apology: "The menu changed. We learned the new
  route and we're calling right back." Same counter, reset. The customer sees the system get
  smarter mid-check.
- **The detail log**: keep it, collapsed by default once the verdict lands; the page scrolls to the
  verdict on top (owner's existing behavior — keep). Expand to see every step.
- **The glowing logo header becomes the step window**: the existing logo area animates with the
  current headline state. Reuse the existing header block; invent no new layout.
- The live-call pipe is HANDLE WITH CARE (`stageForLines`/`liveStage`, the socket): UI reads it,
  never rewires it. If the change touches the pipe itself, stop and say so.

**Done when:** a real staging check to the Fun store walks all four states with the counter · the
loud-retry state renders (drive it with a forced route-drift if no real one appears) · EN + ES at
375/390/430 with no bad wraps · verify-live output pasted below.

**How to ship it — the owner is ruthless on UI/UX, so this is the law for this task:**
1. Render the CURRENT page from the truth snapshot first and match it exactly. The new states
   inherit the page's existing type, spacing, and tokens. You invent ZERO new styles.
2. **One state per push, smallest change first.** After each push: "pushed, check your phone" and
   STOP until he answers. Never one big rewrite. He kills anything that isn't right on sight — a
   small push dies cheap, a big one dies expensive.
3. Torn between two looks? Screenshot both, ask, and wait. Never pick for him.
4. The unlock covers ONLY the check-status section. If your diff touches one line outside it, stop
   and say so.

**Verify-live output (paste on close — a task without it is NOT closed):**
```
(none yet)
```
