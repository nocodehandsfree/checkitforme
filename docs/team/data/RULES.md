# DATA — NEVER-BREAK RULES (exempt from all size caps: ADD, never delete to fit)
Read EVERY line EVERY session before touching code. One line per rule: the rule, then the failure
that made it law. A rule leaves this file only when the owner himself retires it.

1. The public table-dump NEVER carries call_results. The dump is readable without an admin token, so
   the mirror's load side accepts a wider table set than the dump side is allowed to expose.
2. Stores are matched to their chain by chainId, never by whether the store's name starts with the
   chain's name — a broken name filter hid exactly the mismatches the data-health screen exists for.
3. A store's learned time-to-human comes from its chain's LOCKED recipe. With no locked recipe there
   is no learned time and the caller falls back to that check's own measured nav time — never a
   guess, and never the voice menu's first-words moment (that counted the whole check as talk time).
