# The mapping screens, word for word

Every string on the chain page and its five sheets, written to
`docs/design/copy/COPY_STYLE_GUIDE_ADMIN.md`. Nothing ships that is not on this page.

**The five tests each line had to pass**

1. A label is a precise noun or a plain verb. Never a sentence, never a joke.
2. One concept, one word. `nav` is always nav, `recipe` is always a recipe, `Staff` is always Staff.
3. No invented terms. Every word is either the operator's real vocabulary or plain English.
4. A line earns its place by carrying information. Reassurance and commentary are clutter and are cut.
5. Anything that spends money or goes live for customers says so, right next to the control.

**The words this screen owns** (glossary, used exactly)

| Word | Means here |
|---|---|
| **nav** | us getting through the store's phone menu to Staff |
| **menu** | what the store's phone system plays |
| **recipe** | the learned route: the words we say and the second we say them |
| **locked** | the date a recipe became the one real checks run |
| **condition** | the same menu heard under different circumstances (hour, language) |
| **Staff** | the person who answers at the store |
| **check** | one verified stock call, the customer's currency |

---

## 1. Chain page

| Slot | Copy |
|---|---|
| Name | `CVS Pharmacy` |
| Under the name | `51 stores · Bravo` |
| Pill | `Mapped` · `Learning` · `Not mapped` |
| Hero number | `41s` |
| Hero label | `NAV TIME` |
| Tile 1 | `1.4¢` · `NAV COST` |
| Tile 2 | `78%` · `REACHED STAFF` |
| Section | `RECIPE`, right side `Tree Recipe v2 · Jul 28` |
| Ladder | `Greeting plays` · `Says "no"` · `Says "front"` · `Says "general"` · `Rings the desk` |
| Ladder second line | the quoted menu line, or `worked 39 of 41` |
| Under the ladder | `41s nav · 1.4¢ a check` |
| Buttons | `RE-MAP` · `UNTIL LOCKED` |
| Under the buttons | `Places real calls ($). Only replaces the recipe if it beats it.` |
| Rows, `MAPPING` | `Menu` → `2 of 3` · `Mapping calls` → `3 today` · `Recipes` → `v2 live` · `Review` → `1 waiting` |
| Rows, `CHAIN` | `Settings` → `Pharmacy · Tier 5` |

**Cut:** `COST PER CHECK` (rested on a guessed 20s of Charlie) · `TO A PERSON` (renamed to nav time,
because the wait for Staff is not ours) · `A person answers` as a ladder step · `our job is done here`.

**Why `NAV TIME` and not `TIME TO STAFF`:** nav is the operator's word for getting through the menu,
and that is now exactly what the number measures. It stops when the desk rings.

**Empty state, chain never mapped:** `Not mapped. Tap Re-map to learn the menu.`

---

## 2. Menu

| Slot | Copy |
|---|---|
| Title | `Menu` |
| Sub | `What the store plays, by condition.` |
| Pills | `Daytime` · `After 9pm` · `Spanish` |
| Ladder | the store's lines quoted, ours as `Says "no"`, last rung `Rings the desk` |
| Foot | `CVS Alhambra · Jul 28, 2:14 PM` |

**Empty condition**

```
Not heard yet
Run one mapping call after 9pm to record it.
[ MAP THIS ONE ]
One real call ($). Hangs up when the desk rings.
```

**Why a sub line at all:** `condition` is a new word on this screen, so the guide says gloss it once.
That is the sub's whole job, and it never appears again.

---

## 3. Recipes

| Slot | Copy |
|---|---|
| Title | `Recipes` |
| Sub | `The learned route to Staff, by version.` |
| Card name | `Tree Recipe v2` |
| Card pill | `Live` · `Retired` · `Set aside` |
| Card tiles | `41s` · `NAV TIME` and `Jul 28` · `LOCKED` |
| Card route | `Say "no", then "front", then "general".` |
| Key | `SHOW 2 SET ASIDE` |
| Foot | `v2 is 26s faster than v1.` |

**Cut:** `Nothing is ever deleted` (reassurance, not information) · confidence wording · evidence
counts. A recipe waiting for a yes never appears here; that decision stays on the chain page.

**Empty state:** `No recipe yet. Tap Re-map to learn one.`

---

## 4. Review

| Slot | Copy |
|---|---|
| Title | `Review` |
| Sub | `Route changes waiting on you.` |
| Card name | names the finding: `CVS Tarzana answers direct` · `Recipe reaching nobody` |
| Card date | `Jul 27, 10:14 PM` |
| Well | `EXPECTED` `Say "no", then "front", then "general"` · `HEARD` `Staff at 20s, no menu` |
| Buttons | `Give it its own recipe` · `Ignore` |
| Consequence | `Changes CVS Tarzana only.` |

Second card: `Recipe reaching nobody` · `4 calls, 3 stores` · buttons `Re-map ($)` · `Ignore`.

**Cut:** `Things we will not decide on our own` (a sentence pretending to be a label, and it told the
reader nothing) · `Fixed` and `Not a problem` as buttons (they changed nothing) · `Nothing here
touches a real check until you tap`.

**Every card names the store and carries its consequence line.** That is the fix: the old card said
`One store needs its own recipe` with no store, no date, and no idea what either button did.

**Empty state:** `Nothing to review.`

---

## 5. Settings

| Slot | Copy |
|---|---|
| Title | `Settings` |
| Sub | `Applies to all 51 CVS stores.` |
| `CHAIN` | `Type` → `Pharmacy` · `Tier` → `5 Best Chance` · `Muted` |
| Muted line | `Hides CVS from customers everywhere.` |
| `STOCK` | `Sells at MSRP` · `Stock check` → `Ask Staff` |
| `CALLS` | `Phone this chain` · `Hang up on voicemail` · `Workflow` |
| Phone this chain line | `Off = listed, never dialled.` |
| Voicemail line | `No message, no charge.` |
| Workflow control | `Same as everywhere` |
| Workflow line | `Voice, openers and lane for every CVS store. Right now that is Branson Global.` |
| Foot | `Saves live for customers.` |

**Cut:** `Max talk` and its `45` placeholder. It was never talk time. It set a hard cutoff on the
whole call, so 45 would have hung up on CVS before Staff picked up. The hold hangup the owner wanted
already exists and is on: Global → 60 seconds on hold.

**One Branson Global.** The inherit row says `Same as everywhere` and never borrows the workflow's
name, so the name appears once, in the list, where it can be pinned.

---

## 6. Mapping calls, already shipped

Corrections to what is live today, same rules.

| Slot | Copy |
|---|---|
| Pill | `Reached Staff` · `Transferred, no answer` · `No answer` |
| Last rung, reached | `Staff answered · "CVS Mulholland, this is Dana"` |
| Last rung, failed | `Hung up, nobody picked up` |
| Produced | `PRODUCED` → `Tree Recipe v2 · 5s faster` or `No change` |
| Key | `SHOW 4 MORE` |

**Cut:** the foot line `A call only changes the menu when it beats the one we have.` It repeats the
line under the Re-map button on the page that opened this sheet.

**Fix:** a recipe that was set aside must not read green. `Set aside` is gray, like `No change`.
