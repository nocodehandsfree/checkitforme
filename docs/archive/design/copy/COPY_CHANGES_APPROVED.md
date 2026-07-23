# Approved copy + design changes — consumer site

> **Lane:** website dev (`public/checkit.html` @ r85). Copy + the design notes here.
> **Not here:** code identifiers / file names / storage keys → git history (DevOps lane).
> **Lenses:** fewest words · friend voice · color/image over copy · pixel alignment · Jobs-clean · a little poetry.
> **Status:** owner-approved. Grows as we go, page by page. Staging-first: land copy on staging, verify on
> `staging.checkitforme.com`, then promote to prod (`checkitforme.com`).

---

## Style rules (apply to every line)

- **No em-dashes (`—`).** Use a period. Let each thought stand. (It's an AI tell and it fights the cadence.)
- **Fewest words** that still carry the meaning.
- **One thought per line.** Short first beat.
- **Friend voice**, culture-aware slang in ES.
- **Color / image before words** where it can carry meaning (see the shield).

---

## ✅ LOCKED — round 1

### Cross-cutting
| What | From | To |
|---|---|---|
| Charge line (everywhere — one version) | `No answer = no charge. You always get the verdict.` / `No check = no charge…` | **`No answer = no charge.`** · ES **`Sin respuesta = sin cargo.`** |
| `brandName()` fallback (rip "Fungibles") | `'Fungibles'` | **`'Check It For Me'`** |
| Result-page foot (rip "Powered by") | `Powered by {brand} · 1 check used` | **`1 check used`** · ES `1 verificación usada` (and `No charge for this one` / `Sin cargo por esta`) |

### Home
| What | From | To |
|---|---|---|
| Category step | `② What are you hunting? — tap one or more` | **`② What are you hunting?`** · ES **`② ¿Qué estás cazando?`** |

### Result
| What | From | To |
|---|---|---|
| Free-check CTA (under "That was your free check 🎯") | `Sign up in 30 seconds to check any store, anytime — it's the only way to keep going.` | **`Sign up free. Keep hunting.`** · ES **`Regístrate gratis. Sigue cazando.`** |

---

## ✅ LOCKED — round 2

### Buy / Plans
| What | From | To |
|---|---|---|
| Member lead (`buy.premium.lead`) | `Restock alerts & auto-checks come with membership — we watch the shelves so you don't have to.` | **`We watch the shelves so you don't have to.`** · ES **`Vigilamos los estantes por ti.`** |
| Out-of-checks lead (`buy.out.lead`) | `Pick a plan and keep hunting — your next find is one check away.` | **`Your next find is one check away.`** · ES **`Tu próximo hallazgo está a una verificación.`** |
| Plan perk (`plan.p3`) | `+ Specific products & multi-asks` | **`+ Exact products. More than one per call.`** · ES **`+ Productos exactos. Más de uno por llamada.`** |

### Sign-in
| What | From | To |
|---|---|---|
| `err.phone` | `Enter your 10-digit US cell number.` | **`Enter your US mobile number.`** · ES **`Ingresa tu número de celular de EE.UU.`** |
| `err.contact` (2 versions → 1) | `…phone number` / `…phone` | **`Enter a valid email or phone number.`** |
| `err.generic` (2 versions → 1) | `Something went wrong` / `…— try again` | **`Something went wrong. Try again.`** |

> Plan perks also get the **icon-per-tier** treatment (🔔 / 📅 / 🎯 / 🗺) — see Design below.

---

## 🎨 DESIGN — image/color over copy (website dev, design pass)

### The green "no-charge" shield  *(biggest win)*
Every miss status repeats the words **"— no charge."** Replace the **words** with **one small green shield icon** = *you weren't charged.* Color carries the meaning; the eye reads it before the brain does.
- Applies to: `nobody_answered`, `too_busy`, `voicemail`, `busy`, `ivr_stuck`, `language_barrier`, `bad_number`, `closed`, `failed`.
- Copy is approved to drop the "— no charge" tail from those lines **once the shield is in.** (Until the shield ships, keep the words.)

### Color the call cost (no reading)
Result foot: **`1 check used`** = gray · **`No charge for this one`** = green. You know if you paid before you read it.

### Plan tiers — perk as icon
Lead each tier's perk with an icon, not a sentence: 🔔 alerts · 📅 auto-checks · 🎯 exact product · 🗺 zone sweep. The ladder reads at a glance.

### Alignment / symmetry (pixel pass)
- Result **poll row**: 4 pills equal-width, icons on one baseline, labels centered under each.
- **Verdict block**: icon → title → sub on a single center axis.
- (Log only — Copy doesn't touch layout; flagging for the design pass.)

---

## ✅ LOCKED — round 3 (Scores / kiosk / receipt)

| key | From | To |
|---|---|---|
| `sc.snap` | `Snap your score and post it to the community wall.` | **`Snap your win. Post it.`** |
| `sc.err.big` | `Photo is too big (max 12MB)` | **`Photo's too big (max 12MB).`** |
| `k.cta` | `Submit & claim my free check →` | **`Claim my free check →`** |
| `k.thanks.free` | `…free check is unlocked — go check a store` | **`…free check is unlocked. Go check a store.`** |
| `rcpt.claim` | `Claim your free call →` | **`Claim your free check →`** (unit) |
| `rcpt.still` | `Still here — email it and keep this open.` | **`Still here. Email it and keep this open.`** |

---

## ✅ LOCKED — round 4 (Live)

| key | From | To |
|---|---|---|
| `live.waitperson` | `Waiting to reach a person…` | **`Reaching a person…`** |

*(Live screen + empty states otherwise reviewed and on-voice; the one dash, `empty.search`, is in the sweep below.)*

---

## ✅ LOCKED — round 5 (Driver hand-off)

| key | From | To |
|---|---|---|
| `ho.s5.cta` | `Confirm drop-off & release the bonus` | **`Release the bonus →`** |
| `ho.dv.4` | `Tap Done → your bonus lands instantly` | **`Tap Done. Your bonus lands instantly.`** |
| `ho.s2.bk` | `…— on top of their normal fare.` | **`…on top of their normal fare.`** (dash) |

---

## 🧹 SWEEP — em-dashes (ban `—`)

**A) Status "— no charge" tails (9)** — handled by the green shield: drop the tail entirely.
`note.badnum` · `note.busy` · `note.closed` · `note.failed` · `note.hold` · `note.ivr` · `note.noanswer` · `note.unreached` · `note.voicemail`

**B) Everything else → period (or restructure). EN (ES mirrors the same way):**

| key | To |
|---|---|
| `acct.upgrade` | `Get more checks.` |
| `buy.fail` | `Couldn't start checkout. Try again.` |
| `cid.startfail` | `Couldn't start verification. Try again.` |
| `cid.timeout` | `Didn't verify in time. Close this and try again.` |
| `cid.unavail` | `Verification is down for now. Try again later.` |
| `cid.donesub` | `Checks now dial from your cell. Stores see your number on caller ID.` |
| `closednow` | use `· closed now` (middot, not a dash) |
| `empty.search` | `No matches. Try a different search, or tap the pin for stores nearby.` |
| `fbk.thanks` | `Thanks. This trains our checks to get sharper.` |
| `ho.copied` | `Copied. Paste it in the driver chat.` |
| `ho.done.title` | `Bonus released. You're done.` |
| `ho.dv.3.ship` | `Drop at USPS. Postage is on the card.` |
| `ho.home.hint` | `Driver brings it to your door. No shipping, no waiting.` |
| `ho.msg.ship` | `drop it at USPS to ship. Postage is on the card.` |
| `ho.ship.hint` | `Packaging and postage go on the driver's card. They ship it on the way back, tracking texted to you.` |
| `plan.founder` | `Founder. Unlimited.` |
| `plan.p4` | `+ Zone sweeps. Every store near you, one tap.` |
| `res.proof` | `Proof. What they said.` *(also kills "clerk")* |
| `sch.cancelfail` | `Couldn't cancel. Try again.` |
| `sch.on.days` | `📅 Auto-check on. We'll call on those days.` |
| `sch.on.ship` | `📅 Auto-check on. We'll call on this store's shipment day.` |
| `share.copied` | `Copied. Paste it anywhere 📋` |
| `sm.nolive` | `No online signal yet. Get notified when it restocks.` |
| `sm.resale` | `Resale. May be over MSRP.` |
| `term.in` | `In stock. Confirmed.` |
| `toast.locblocked` | `Location blocked. Enable it in your browser settings.` |
| `toast.maploading` | `Map couldn't load. Showing the list.` |
| `up.checkback.sub` | `They restock often. Pop back in a day or two.` |
| `up.sched.sub` | `We call for you on restock days. Hands-free.` |
| `v.unclear` | `No clear answer. Recheck.` |
| `watch.done` | `🔔 You're on the list. We'll reach out the moment it's back.` |
| `wl.done` | `🙌 You're on the list. We'll reach out the moment we launch near you.` |
| field hints `— optional` / `— required` (×5+) | `(optional)` / `(required)` |

*(Already locked above, also de-dashed: `buy.out.lead`, `buy.premium.lead`, `err.generic`, `res.free.sub`, `k.thanks.free`, `rcpt.still`.)*

**C) Spanish — bigger job: the `es` map has 104 em-dashes (2.6× the EN).** Don't hand-list. **Blanket rule on the `es` map: replace every ` — ` with `. ` (period).** The `— sin cargo` tails are removed by the shield (same as EN). Spot-check the few where the dash was an aside (use a comma or parens there, e.g. `(opcional)`).

---

## 🧹 SWEEP — "call" → "check" (the unit)

The currency is a **check**. The phone thing is a **call**. Fix where the *unit* says "call":

| key | From | To |
|---|---|---|
| `lead.title` | `Your first call is free` | **`Your first check is free`** |
| `lead.cta` | `Place my free call →` | **`Run my free check →`** |
| `lead.cta` (alt) | `Call the store →` | **`Check this store →`** |
| `rcpt.title` | `Kiosk receipt = free call` | **`Kiosk receipt = free check`** |
| `rcpt.claim` | `Claim your free call →` | **`Claim your free check →`** |
| `earn.store.sub` | `…earn a free call.` | **`…earn a free check.`** |

**Also locked (unit → check):** `kcall.yes` "Yes, call now →" → **"Yes, check it now →"** · `toast.callgone` → **"That check is no longer available"** · `toast.callstart.fail` → **"Couldn't start the check"** · `toast.loadingcall` → **"Loading your check…"** · `up.watch.sub` "a call confirms stock" → **"a check confirms stock"**

**Keep "call" (it's the actual phone call):** `demo.call`, `cid.*`, `cs.*`, `live.*`, `sch.body`, `sch.time`, `kcall.body1`, `note.getting`, `up.sched.sub`.

---

## 📞 Call verdicts (status messages)

**THE FINAL SET — single source of truth.** DevOps keeps the registry matched to this. Tokens `{store}` `{product}` `{category}` `{day}` render live and bold. No em-dashes. One short note line each.

| `key` | Label | Note (EN) |
|---|---|---|
| `in_stock` | In stock! | {store} has {product} in. Go grab it. |
| `not_in_stock` | Not in stock | {store} doesn't have {category} right now. |
| `sold_out` | Sold out | {store} had it, but it's gone for now. |
| `does_not_sell` | They don't carry it | {store} doesn't sell {category}. |
| `no_clear_answer` | Couldn't tell | We couldn't make out a clear answer. |
| `left_on_hold` | Left on hold | Hold ran long and the call dropped. No charge. |
| `too_busy` | Too busy to check | {store} was slammed. No charge. |
| `language_barrier` | Couldn't understand each other | We couldn't communicate. No charge. |
| `nobody_answered` | Nobody answered | No one picked up. No charge. |
| `voicemail` | Got their voicemail | Reached a recording, not a person. No charge. |
| `busy` | Line was busy | Their line was busy. No charge. |
| `bad_number` | Wrong number | That number didn't connect. No charge. |
| `closed` | Store's closed | {store} is closed right now. No charge. |

**Spanish:**

| `key` | Label (ES) | Note (ES) |
|---|---|---|
| `in_stock` | ¡En stock! | {store} tiene {product}. Ve por ello. |
| `not_in_stock` | No está en stock | {store} no tiene {category} ahora. |
| `sold_out` | Agotado | {store} lo tuvo, pero ya se acabó. |
| `does_not_sell` | No lo venden | {store} no vende {category}. |
| `no_clear_answer` | No supimos decir | No pudimos entender bien la respuesta. |
| `left_on_hold` | Nos dejaron en espera | La espera se alargó y la llamada se cortó. Sin cargo. |
| `too_busy` | Muy ocupados para revisar | {store} estaba saturado. Sin cargo. |
| `language_barrier` | No nos entendimos | No pudimos comunicarnos. Sin cargo. |
| `nobody_answered` | Nadie contestó | Nadie respondió. Sin cargo. |
| `voicemail` | Buzón de voz | Salió una grabación, no una persona. Sin cargo. |
| `busy` | Línea ocupada | La línea estaba ocupada. Sin cargo. |
| `bad_number` | Número equivocado | Ese número no conectó. Sin cargo. |
| `closed` | Está cerrado | {store} está cerrado ahora. Sin cargo. |

**Rules baked in:**
- **No charge** is on every status where we didn't get an answer. The 4 real verdicts (in stock / not in / sold out / doesn't carry) don't carry it.
- `no_clear_answer` stays **factual** — the poll UI carries the "read the convo / weigh in" ask.
- **`Call failed` is removed** — there's always a verdict/reason.
- **Restock incoming** (🚚 "soon") is **page-computed**, not a registry row — it fires when a not-in / sold-out call also hears a shipment day. Lives in code, not Admin.

**Restock section under `not_in_stock`:** Premium → `We'll text you the second it's back in stock.` · Non-premium → `They restock often. Pop back in a day or two.`

---

## 🌐 Spanish gaps (wrap in `t()` + add `es`)

The `es` map is thorough; these strings just bypass it. Score modal already fixed by dev — verify the rest:
- **Auth modal:** `Continue →` / `Verify →` / `Check your phone` (also reset in JS — must use `t()` there too). Errors: `err.phone`, `err.code`, `auth.resent` already have keys — just call them.
- **Placeholders:** store-request (`e.g. Target — Thousand Oaks` etc.), schedule `Enter number`, kiosk (`e.g. Albertsons…` / `e.g. sometimes skips the :03 drop`).
- **Toasts (keys already exist — just use them):** `toast.payment`, `toast.maploading`, `toast.callstart.fail`.
- **Raw:** `Store is closed — no call placed`, `Community is coming soon`, search `stores within {n} mi`.
- ES strings for the new ones: ask Copy (short list).

---

## Notes
- Every reworded EN line ships with its ES twin (above).
- "No answer = no charge" is the spine — 4 beats, parallel. Everything else tunes to that cadence.

---

## 🔎 Round 6 — post-redesign copy sweep (full-site review)

> From a full pass over the current staging build. EN + ES given so Design/Dev can drop them straight in. Same rules: no em-dashes, fewest words, "check/verificación" is the customer unit (not "call/llamada").

### 1. Membership name — **Fungie+ → Check+**
- `sch.perk` ES: `Beneficio de miembro Fungie+` → **`Beneficio de miembro Check+`**. Add the EN twin: **`Check+ member benefit`**.

### 2. Em-dashes → period/comma (visible copy)
- **Demo dialogue** (EN 3496–3499 + ES 3504–3507, all 4 categories): `Hi — do you have any {x} in?` → **`Hi, do you have any {x} in?`** · `We sure do — a shipment…` → **`We sure do. A shipment…`** · `In stock — {set}` → **`In stock. {set}`** · ES: `Claro que sí — …` → **`Claro que sí. …`** · `En stock — {set}` → **`En stock. {set}`**
- **Empty states** `empty.hobby / empty.thrift / empty.radius / empty.kiosk` (EN 3314/3320–3322 + ES 2196/2197): `…within {r} mi — try a bigger radius.` → **`…within {r} mi. Try a bigger radius.`** · ES `…en {r} mi — amplía el radio.` → **`…en {r} mi. Amplía el radio.`**
- `cat.any` (3615): `Any {label} — anything counts` → **`Any {label}. Anything counts.`**

### 3. Unit drift — ES says "llamada," should be "verificación"
- `res.free` ES: `Esa fue tu llamada gratis 🎯` → **`Esa fue tu verificación gratis 🎯`**
- `toast.callgone` ES: `Esa llamada ya no está disponible` → **`Esa verificación ya no está disponible`**
- `toast.loadingcall` ES: `Cargando tu llamada…` → **`Cargando tu verificación…`**
- `rail.all` / `rail.calls` ES: `Todas las llamadas` / `Llamadas` → **`Todas las verificaciones`** / **`Verificaciones`**
- `pre.note` (EN "You called {s}…" / ES "Llamaste a {s}…") — **review:** switch to **`You checked {s}`** / **`Verificaste {s}`** for the unit (leave if you want to keep the literal-call read).
- `v.failed` "Call failed" (4406) — should already be **removed** per the status table; confirm it's gone.

### 4. Cold → warm error copy (EN + ES)
- `co.failed`: `Payment failed. Try again.` → **`That payment didn't go through. Try again.`** / ES **`El pago no se procesó. Inténtalo de nuevo.`**
- `err.upload`: `Upload failed.` → **`Photo didn't upload. Try again.`** / ES **`La foto no se subió. Inténtalo de nuevo.`**
- `cid.unavail`: `Verification is down for now…` → **`Verification isn't available right now. Try again soon.`** / ES **`La verificación no está disponible ahora. Vuelve a intentarlo pronto.`**
- `toast.translate.fail`: `Could not translate` → **`Couldn't translate that one.`**
- `err.generic` (`Something went wrong. Try again.`) — fine and single-sourced; optional warm-up **`That didn't go through. Give it another try.`** (owner's call).

### 5. Duplicated / inconsistent source strings (pick one)
- `toast.maploading` renders with **two** different EN fallbacks (`Map couldn't load…` vs `Map could not load…`). Standardize to **`Map didn't load. Here's the list.`**
- `sc.posted` / `sc.posted.review` — one code path hardcodes English with different wording than the keyed version. Use the key everywhere.

### 6. i18n wiring — Copy supplies text, Dev wraps in `t()` + adds ES (these bypass `t()`, so ES users see English)
- Rate-limit (2765) → key `err.toofast`: EN **`Give it a sec, then try again.`** / ES **`Espera un momento e inténtalo de nuevo.`**
- US-only (2766) → key `err.usonly`: EN **`We can only text US mobile numbers right now.`** / ES **`Por ahora solo enviamos SMS a números de EE. UU.`**
- Photo posted (5965) → use existing `sc.posted.review` / `sc.posted` keys.
- Generic fallback (5966) → use `err.generic`.
- Send-code button (2760) → `auth.sending` **`Sending…`** / `auth.resending` **`Resending…`** + ES **`Enviando…`** / **`Reenviando…`**

*Not copy (routed elsewhere): the selected-card green-border clip, low-contrast tiles, modal alignment, spacing rhythm → Design (CSS). The "call didn't hang up after it ended" → DevOps (backend).*
