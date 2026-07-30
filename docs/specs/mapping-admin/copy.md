# The mapping screens, word for word

Every string on the chain page and its five sheets. Written to
`docs/design/copy/COPY_STYLE_GUIDE_ADMIN.md`. Nothing ships that is not on this page.

## The rule this page exists to enforce

**A control panel does not talk to anybody.** It names things and shows their state. There is no
"you", no "we", no "our". Nothing is addressed to a reader, nothing reassures, nothing explains
itself. The first draft of this file failed that test twice over ("Route changes waiting on you",
"Things we will not decide on our own") and both are gone.

1. Labels are nouns. States are adjectives. Buttons are verbs or the noun they produce.
2. No sentences on screen. Fragments. The only exception is a confirm dialog, which asks.
3. One concept, one word: `nav`, `menu`, `recipe`, `locked`, `condition`, `Staff`, `check`.
4. Units are exact and consistent: seconds as `41s`, money as `1.4¢`, dates as `Jul 28`.
5. A line that spends money or goes live states it as a fact, next to the control. Never as advice.

## The words this screen owns

| Word | Means here |
|---|---|
| **nav** | getting through the store's phone menu to Staff |
| **menu** | what the store's phone system plays |
| **recipe** | the learned route: which words, at which second |
| **locked** | the date a recipe became the one real checks run |
| **condition** | the same menu under different circumstances (hour, language) |
| **Staff** | the person who answers at the store |
| **check** | one verified stock call |

---

## 1. Chain page

| Slot | Copy |
|---|---|
| Name | `CVS Pharmacy` |
| Under the name | `51 stores · Bravo` |
| Pill | `Mapped` · `Learning` · `Not mapped` |
| Hero | `41s` · `NAV TIME` |
| Tile 1 | `1.4¢` · `NAV COST` |
| Tile 2 | `78%` · `REACHED STAFF` |
| Section | `RECIPE` · right `Tree Recipe v2 · Jul 28` |
| Ladder steps | `Greeting plays` · `Says "no"` · `Says "front"` · `Says "general"` · `Rings the desk` |
| Ladder second line | the quoted menu line, or `39 of 41` |
| Under the ladder | `41s nav · 1.4¢ per check` |
| Buttons | `Re-map` · `Until locked` |
| Under the buttons | `Places real calls. Replaces the recipe only if faster.` |
| `MAPPING` rows | `Menu` `2 of 3` · `Mapping calls` `3 today` · `Recipes` `v2 live` · `Review` `1 waiting` |
| `CHAIN` row | `Settings` `Pharmacy · Tier 5` |
| Not mapped | `No recipe. Re-map to learn one.` |

**Cut:** `COST PER CHECK`, which rested on a guessed 20s of Charlie · `TO A PERSON`, because the wait
for Staff is not nav · `A person answers` as a ladder step · `our job is done here`.

---

## 2. Menu

| Slot | Copy |
|---|---|
| Title | `Menu` |
| Conditions | `Daytime` · `After 9pm` · `Spanish` |
| Ladder | store lines quoted, ours as `Says "no"`, last rung `Rings the desk` |
| Foot | `CVS Alhambra · Jul 28, 2:14 PM` |
| Empty condition | `Not heard` · `Requires a call after 9pm` · button `Map` |
| Under that button | `One real call. Hangs up at the ring.` |

**Cut:** the sub line. The three condition pills say what the screen is.

---

## 3. Recipes

| Slot | Copy |
|---|---|
| Title | `Recipes` |
| Card name | `Tree Recipe v2` |
| Card state | `Live` · `Retired` · `Set aside` |
| Card tiles | `41s` `NAV TIME` · `Jul 28` `LOCKED` |
| Card route | `Say "no", then "front", then "general"` |
| Key | `Show 2 set aside` |
| Foot | `v2 · 26s faster` |
| Empty | `No recipe. Re-map to learn one.` |

**Cut:** the sub line · `Nothing is ever deleted` · confidence wording · evidence counts. A recipe
waiting for approval is not listed here; that decision sits on the chain page.

---

## 4. Review

| Slot | Copy |
|---|---|
| Title | `Review` |
| Card name | `CVS Tarzana · answers direct` |
| Card date | `Jul 27, 10:14 PM` |
| Well | `EXPECTED` `Say "no", then "front", then "general"` · `HEARD` `Staff at 20s, no menu` |
| Buttons | `Own recipe` · `Ignore` |
| Under the buttons | `CVS Tarzana only` |
| Second card | `Recipe reaching nobody` · `Jul 26` · `4 calls · 3 stores` · `Re-map` · `Ignore` |
| Empty | `Nothing to review` |

**Cut:** `Things we will not decide on our own` · `Route changes waiting on you` · `Nothing here
touches a real check until you tap`. All three address a reader.

**Cut:** `Fixed` and `Not a problem` as buttons. They only marked the row read. The buttons now do
the thing they name.

---

## 5. Settings

| Slot | Copy |
|---|---|
| Title | `Settings` |
| `CHAIN` | `Type` `Pharmacy` · `Tier` `5` · `Muted` |
| Muted line | `Hides CVS from customers` |
| `STOCK` | `Sells at MSRP` · `Stock check` `Ask Staff` |
| `CALLS` | `Phone this chain` · `Hang up on voicemail` · `Workflow` |
| Phone this chain line | `Off = listed, never dialled` |
| Voicemail line | `No message, no charge` |
| Workflow value | `Same as everywhere` |
| Workflow line | `Branson Global` |
| Foot | `Live on save` |

**Cut:** the sub line · `Max talk` and its `45` placeholder. It was never talk time. It set a hard
cutoff on the whole call, so 45 would have ended a CVS call before Staff picked up. The hold cutoff
already exists in Global at 60s and is on.

**One Branson Global.** The inherit row reads `Same as everywhere` and never borrows the workflow's
name, so the name appears once, in the list, where it can be pinned.

---

## 6. Mapping calls, already shipped

Corrections to what is live today, same rules.

| Slot | Copy |
|---|---|
| Pill | `Reached Staff` · `Transferred, no answer` · `No answer` |
| Last rung, reached | `Staff answered · "CVS Mulholland, this is Dana"` |
| Last rung, failed | `Hung up, nobody picked up` |
| Produced | `PRODUCED` · `Tree Recipe v2 · 5s faster` or `No change` |
| Key | `Show 4 more` |
| Empty | `No mapping calls. Re-map to place one.` |

**Cut:** the sub line `Every call we made to learn this menu.` The sheet is called Mapping calls and every
card is one call, so the line only repeats the title back.

**Cut:** the foot line `A call only changes the menu when it beats the one we have`.

**Fix:** a recipe that was set aside must not read green. `Set aside` is gray, like `No change`.
