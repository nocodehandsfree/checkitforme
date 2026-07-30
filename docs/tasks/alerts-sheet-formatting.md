# Alerts sheet formatting

**What:** The alerts bottom sheet formatting is off (spacing/wrap). Frozen-site task: owner names it, .unlock the alerts-sheet section only.
**Done when:** Alerts sheet matches the sheet recipe (variant H) and no line wraps mid-sentence, EN + ES. Truth snapshot re-taken.
**Lane:** Webbie
**Status:** done

**Verify-live output (paste on close — a task without it is NOT closed):**
```
staging  https://staging.checkitforme.com/ -> serving 11f9a8d (merge 11f9a8d54558)
Fixed: sentLines() ran the two sentences together ("watching.Flip") because .subln{display:block}
was scoped to .rsub; unscoped it. Alert rows stacked (.alrow) so long names + cities stop clipping.
Dead duplicate ES 'alerts.sub' key removed. Driven at 390x844 EN + ES: zero clipped elements.
```
