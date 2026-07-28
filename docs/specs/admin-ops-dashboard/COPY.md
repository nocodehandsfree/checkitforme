# The ops dashboard — every label, before a line of it is built

Authority: `docs/design/copy/COPY_STYLE_GUIDE_ADMIN.md`, read whole. English only.
**The rule I broke twice:** a dashboard label is a precise noun, not a sentence. Every visible string
below is a noun or a plain verb. Explanations live in `data-tip` tooltips (admin rule 1), never as a
second line of prose on the screen.

**The terms, taken from the live Admin, not invented**
| Term | Where it already appears |
|---|---|
| `Direct` · `Alpha` · `Bravo` = store type | `CALC_STORE` on the Calc page, with these exact subs: `human picks up` · `keypad tones` · `voice menu` |
| `Charlie` = the live agent, on every call once Staff answer | admin glossary; Calc bills `Charlie's voice` + `Charlie's thinking` |
| `Delta` = the recorded opener, now on every call | Calc: `The recorded opener` |
| `status` = the owner-editable verdict | Playbook → Statuses |
| `Call time` = time to a person vs talk | the existing Call time report |
| `dead air` = connected seconds with nobody speaking | the calling engine (`bridge.ts`) |
| `Staff` · `check` | glossary |

**🔴 One conflict to settle.** `GET /api/admin/call-timing` labels its buckets `byModel`: Charlie =
direct, Alpha = keypad, Bravo = voice. That contradicts the glossary, where Charlie is the live agent
that rides every answered call. The Calc page has it right (`Direct` for a store that picks up). This
spec follows Calc and the glossary. The call-timing labels should be corrected to match.

## Dashboard

| Element | Label | Tooltip |
|---|---|---|
| Hero | `5.2¢` / `COST PER CHECK` / pill `128 checks · 7d` | real cents, summed off finished checks |
| Well 1 | `81%` / `ANSWERED` | checks where Staff picked up |
| Well 2 | `74%` / `CLEAR ANSWER` | checks that landed a definite status |
| Eyebrow | `REPORTS` | |

Report rows. Label + number. No prose under any of them.

| Label | Right side | Tooltip |
|---|---|---|
| `Cost per check` | `5.2¢` | every finished check, priced off the receipt |
| `Checks` | `128` | the full check log, real and test |
| `Money` | `$-11` | revenue, costs, margin, credits |
| `Members` | `0 new` | signups and subscribers |

Removed as rows: `Call time` and `Call health`. Call time moves into the Cost per check sheet;
real vs test checks moves into `Checks`. `Credits` moves into `Money`.

## Cost per check — the sheet

| Element | Label |
|---|---|
| Title | `Cost per check` |
| Subtitle | `Status, store type, Charlie time` |
| Hero | `5.2¢` / `COST PER CHECK` / pill `128 checks · 7d` |
| Tile 1 | `74%` / `clear answer` |
| Tile 2 | `6.4¢` / `per clear answer` |

**`STATUS`** — the owner's own statuses, his icon, his label, his colour. Never a second scale.
Row: status label · `61 checks` · `5.2¢`. Three rows, then `SHOW 3 MORE`.

**`STORE TYPE`** — Calc's three, with Calc's exact subs.

| Row | Sub | Right |
|---|---|---|
| `Direct` | `human picks up` | `74 checks` · `4.1¢` |
| `Alpha` | `keypad tones` | `39 checks` · `6.3¢` |
| `Bravo` | `voice menu` | `15 checks` · `8.8¢` |

**`CHARLIE TIME`** — tooltip on the eyebrow: `Charlie bills every connected second, talking or not.`

| Row | Sub | Right |
|---|---|---|
| `Speaking` | | `6.1s` |
| `Staff speaking` | | `4.4s` |
| `Dead air` | `1.9¢ per check` | `9.7s` amber |

**`CALL TIME`** — the existing report's name and its numbers.

| Row | Right |
|---|---|
| `To a person` | `17s` |
| `Talk` | `22s` |
| `Menu` | `9s` |
| `Hold` | `6s` |

**Footnote.** `Finished checks since the new engine. Test stores and cancelled checks excluded.`

**Empty state** (rule 5, says what to do next). `No finished checks yet. Run one from Search or Chains.`

## Rejected
- Sentences as labels: `What every check really cost`, `In, out and what is left`, `How every check
  landed`, `straight to a person, no menu`. A label is a noun. The explanation is a tooltip.
- `By status` / `By lane` — the eyebrow is the noun itself: `STATUS`, `STORE TYPE`.
- `Call timing` — the report is already called `Call time`. One concept, one word.
- `Charlie` as a store type — Charlie is on every answered call, not a route.
- `Nobody talking` → `Dead air`, the engine's own word.
- `Billed agent time` → `CHARLIE TIME`. Use the real name, gloss it once.
