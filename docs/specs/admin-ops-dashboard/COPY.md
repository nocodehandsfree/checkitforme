# The ops dashboard — every string, before a line of it is built

Owner, 07-28: the words were invented and vague. This file is the whole vocabulary, written first and
approved before the build. Authority: `docs/design/copy/COPY_STYLE_GUIDE_ADMIN.md`. English only.

**The rule I broke and am not breaking again:** I named sections after what the code does ("what
happened", "how we got in", "where the seconds went", "the clock"). Every name below is either a word
this system already uses on another screen, or a plain description of the thing being counted.

## The words this system already owns — use these, never a synonym
| Word | Means | Already on screen at |
|---|---|---|
| check | one stock call to a store; the customer's currency | everywhere |
| status | the owner-editable verdict a check landed on | Playbook → Statuses |
| lane | how the call got to a person: Charlie · Alpha · Bravo | Chains, a chain's badge |
| Staff | the person who answers at the store | the call sheet |
| Check AI | the voice agent | the call sheet |
| dead air | connected seconds with nobody speaking | new here, glossed once |

## Dashboard

| Element | String |
|---|---|
| Hero number | `5.2¢` |
| Hero label | `COST PER CHECK` |
| Hero pill | `128 checks · 7 days` |
| Well 1 | `81%` / `ANSWERED` (was "Reach · 30d") |
| Well 2 | `74%` / `CLEAR ANSWERS` (replaces Credits, which moves to Money) |
| Eyebrow | `REPORTS` |

Report rows, four, each with a one-line note so the row explains itself without a tap:

| Row | Note | Right side |
|---|---|---|
| `Cost per check` | `What every check really cost` | `5.2¢` |
| `Checks` | `Every check and how it ended` | `128` |
| `Money` | `In, out and what is left` | `$-11` |
| `Members` | `Signups and who is paying` | `0 new` |

Gone as rows: `Call time` and `Call health`. Their numbers move into `Cost per check` (time to a
person, talk time) and `Checks` (real checks vs test checks). Nothing is dropped.

## The slide up

| Element | String |
|---|---|
| Title | `Cost per check` |
| Subtitle | `Added up from finished checks` |
| Hero | `5.2¢` / `COST PER CHECK` / pill `128 checks · 7 days` |
| Tile 1 | `74%` / `clear answers` |
| Tile 2 | `6.4¢` / `per clear answer` |

**Section 1 — eyebrow `BY STATUS`.** The rows are the owner's own statuses, with his icon, his label
and his colour. Never a second scale. Row: status label · `61 checks` · `5.2¢`. Caps at three, then
`SHOW 3 MORE`.

**Section 2 — eyebrow `BY LANE`.** The names already badged on Chains, each with its plain gloss as
the row's second line (copy rule 2: use the real term, gloss it once).

| Row | Second line |
|---|---|
| `Charlie` | `straight to a person, no menu` |
| `Alpha` | `keypad menu` |
| `Bravo` | `spoken menu` |

**Section 3 — eyebrow `BILLED AGENT TIME`.** What we are charged for, split three ways.

| Row | Second line | Right side |
|---|---|---|
| `Check AI speaking` | | `6.1s` |
| `Staff speaking` | | `4.4s` |
| `Dead air` | `1.9¢ of every check` | `9.7s` amber |

Footnote under the section: `Check AI bills every connected second, talking or not.`

**Section 4 — eyebrow `CALL TIMING`.** The clock a person asks about. Every line averages only the
checks that measured it.

| Row | Right side |
|---|---|
| `Time to a person` | `17s` |
| `Talk time` | `22s` |
| `Menu time` | `9s` |
| `Hold time` | `6s` |

**Sheet footnote.** `Every finished check since the new calling engine. Cancelled checks and test
stores are never counted.`

**Empty state** (copy rule 5, says what fills it): `No finished checks yet. The next real check lands
here on its own. Test store checks never count.`

## Rejected, and why
- `What happened` → **`By status`**. Status is the word the owner edits on his own Statuses page.
- `How we got in` → **`By lane`**. Lane is already badged on every chain.
- `Where the seconds went` → **`Billed agent time`**. Says what it is: the part of the bill we control.
- `The clock` → **`Call timing`**. Same words the Call time report used, so nothing was renamed.
- `Nobody talking` → **`Dead air`**. Shorter, exact, and it is what the thing is called.
- `tries per answer` → dropped for **`clear answers`** as a percentage. Same fact, read in one beat.
