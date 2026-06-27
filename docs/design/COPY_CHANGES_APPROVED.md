# Approved copy + design changes — consumer site

> **Lane:** website dev (`public/checkit.html` @ r85). Copy + the design notes here.
> **Not here:** code identifiers / file names / storage keys → `docs/ops/NAMING_CLEANUP.md` (DevOps lane).
> **Lenses:** fewest words · friend voice · color/image over copy · pixel alignment · Jobs-clean · a little poetry.
> **Status:** owner-approved. Grows as we go, page by page. Final sweep → staging review → prod.

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
| Free-check CTA | `Sign up in 30 seconds to check any store, anytime — it's the only way to keep going.` | **`One check left. Sign up — keep hunting.`** · ES **`Te queda una verificación. Regístrate y sigue cazando.`** |

---

## 🎨 DESIGN — image/color over copy (website dev, design pass)

### The green "no-charge" shield  *(biggest win)*
Every miss status repeats the words **"— no charge."** Replace the **words** with **one small green shield icon** = *you weren't charged.* Color carries the meaning; the eye reads it before the brain does.
- Applies to: `nobody_answered`, `too_busy`, `voicemail`, `busy`, `ivr_stuck`, `language_barrier`, `bad_number`, `closed`, `failed`.
- Copy is approved to drop the "— no charge" tail from those lines **once the shield is in.** (Until the shield ships, keep the words.)

### Color the call cost (no reading)
Result foot: **`1 check used`** = gray · **`No charge for this one`** = green. You know if you paid before you read it.

### Alignment / symmetry (pixel pass)
- Result **poll row**: 4 pills equal-width, icons on one baseline, labels centered under each.
- **Verdict block**: icon → title → sub on a single center axis.
- (Log only — Copy doesn't touch layout; flagging for the design pass.)

---

## Notes
- Every reworded EN line ships with its ES twin (above).
- "No answer = no charge" is the spine — 4 beats, parallel. Everything else tunes to that cadence.
