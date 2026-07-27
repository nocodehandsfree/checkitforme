# Referral welcome card — copy (APPROVED, owner 2026-07-19)

*What this is: the words for the green "gift from a friend" card a cold visitor lands on when they
open a friend's referral link (`?ref` on the homepage, not signed in). Who it's for: Webbie, to drop
into `public/checkit.html` → `openRefWelcome()` (the `refw.*` t()/tf() keys, ~line 3745). I own the
words; Webbie ships the screen.*

## The moment (write to THIS, don't over-explain)
A friend texts you their referral link. You land here knowing nothing about Check. The card gives a
quick synopsis: I got something free, my friend sent it, this thing calls stores to find sold-out
stuff, tap to grab it. Nothing more.

## The deck — English
| Slot | Key | Copy |
|---|---|---|
| Badge | `refw.badge` | A gift from a friend |
| Headline | `refw.title` | You got a free check. |
| Subhead | `refw.sub` | Your friend hooked you up. |
| What Check is | `refw.what` | Check AI calls stores and finds the stuff that's always sold out. |
| CTA | `refw.cta` | Claim it → |
| Foot | `refw.hook` | You both get one. |

## The deck — Spanish (same commit, length-checked)
| Key | Copy |
|---|---|
| `refw.badge` | Un regalo de un amigo |
| `refw.title` | Tienes una verificación gratis. |
| `refw.sub` | Tu amigo te la regaló. |
| `refw.what` | Check AI llama a las tiendas y encuentra lo que siempre está agotado. |
| `refw.cta` | Reclámala → |
| `refw.hook` | Los dos reciben una. |

## Notes for Webbie
- Badge renders UPPERCASE via CSS — write it normal case, the style does the caps.
- Headline + subhead are two separate lines (big headline, smaller subhead under it), matching the
  current card's "A free check / on your friend" two-size split — just new words.
- `refw.what` is the body paragraph; it may wrap across two lines, that's fine for a body block.
  Headline/subhead/CTA are each one short sentence and must NOT wrap mid-sentence.
- Kills the old "A free check, on your friend" — it read as running a check ON your friend.
