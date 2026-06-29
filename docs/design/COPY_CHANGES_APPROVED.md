# Approved copy + design changes — consumer site

> **Lane:** website dev (`public/checkit.html` @ r85). Copy + the design notes here.
> **Not here:** code identifiers / file names / storage keys → `docs/ops/NAMING_CLEANUP.md` (DevOps lane).
> **Lenses:** fewest words · friend voice · color/image over copy · pixel alignment · Jobs-clean · a little poetry.
> **Status:** owner-approved. Grows as we go, page by page. Final sweep → staging review → prod.

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

## Notes
- Every reworded EN line ships with its ES twin (above).
- "No answer = no charge" is the spine — 4 beats, parallel. Everything else tunes to that cadence.
