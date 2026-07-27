# Admin "Unmapped" list — audit + proposed "Can't map" category (2026-07-11)

**Why the list is confusing:** the admin mapping filter only knows two states — a chain shows **Mapped**
only if `navStatus='locked'`, and **everything else** (unmapped / learning / review / needs-review) shows
**Unmapped** (`public/app.html` `mapChipMini`, line ~2847; filter `set_fmap` line ~991). There is no
"can't be mapped" bucket, so muted stores, malls, online-only brands, a test store, and dead merge-stubs
all pile into "Unmapped" and look like real work.

## The two things that looked alarming (both explained)
- **Sam's Club (26) IS mapped** — locked at 44s. What shows in the list is **`_Sams`** (id 4): a muted
  dedup **merge-stub with 0 stores**, not the real chain.
- **Walmart (2)** has a working **10s recipe** but its `navStatus` is **`review`**, not `locked`, so the
  binary chip renders it "Unmapped." Same for **Office Depot (67)** (`review`). Not missing maps —
  mis-labeled status.

## Full breakdown of the "Unmapped" list (48 rows)

### A. Genuinely mappable — real chains, need a tree (≈14 + the H Mart dupes)
Family Dollar(28), FoodMaxx(97), H-E-B(89), Lucky Supermarkets(95), Macy's shop-in-shop(62),
Metro Market(87), Pak N Save(96), Payless Foods(107), Stop & Shop(106), Uwajimaya(111),
Woodman's Market(86). Mostly small/regional groceries. Plus **Walmart(2)** & **Office Depot(67)** —
already have recipes, just stuck in `review`.

### B. DATA DUPLICATE — H Mart split into 6 single-store "chains" (Data Dev merge → 1)
H Mart Aurora(99), Federal Way(108), Lynnwood(110), Niles(114), Portland(102), Redmond(104).
H Mart is one real chain; these should merge into a single mappable chain.

### C. Can't map — MUTED (hidden, no calls) → show "Muted" + reason
Aldi(37, no direct store line), Best Buy(38, national call center), Buc-ee's(42), Pokemon Vending(100),
Spencer's(19).

### D. Can't map — NATIONAL / ONLINE (no store line)
Amazon(3, online-only), Micro Center(66, national call center — routes off the store).

### E. Can't map — NOT A STORE (mall / shopping center, 0 stores)
Capitola Mall(98), Chapel Hills Mall(93), Ford City Mall(113), River Oaks Center(112),
Tacoma Mall(103), The Citadel Mall(92), West Valley Mall(101), Westland Shopping Center(88),
The Commons at Federal Way(109).

### F. Can't map — TEST STORE
MVPs(121) — owner's test store; dials any number, direct call. Exclude from the real board.

### G. DELETE — merge stubs (underscore prefix, 0 stores, dedup leftovers)
_Acme Markets(90), _CVS Pharmacy at Target(115), _Frys(94), _Gelson's Market(91),
_Mariano's Fresh Market(105), _Sams(4).

### H. Independent card/hobby = DIRECT, but 0 store records (need a phone number)
Burbank Sportscards(122), Cash Cards Unlimited(125), CoreTCG(126), Franklin's Ace Hardware(6),
LA Sports Cards(127). These are direct-answer (no tree); they just need a store record with a phone.

## Proposed fix: a third mapping state + reasons
Today: `Mapped | Unmapped`. Add **`Can't map`** with a per-chain **reason**, and a dropdown filter option.

Classification (compute once, chain-level):
| Condition | State | Reason shown |
|---|---|---|
| `navStatus='locked'` | Mapped | time-to-human |
| `ringsDirect=true` / `answerPath=direct_human` | Mapped (Direct) | "Direct — no tree" |
| `muted=true` | Can't map | "Muted — <reason>" |
| `callTarget=false` | Can't map | "No store line (national/online)" |
| type = Mall / 0 stores + mall name | Can't map | "Not a store (mall)" |
| name starts `_` | Can't map (Delete) | "Merge stub" |
| test store flag | Can't map | "Test store" |
| else (has stores, has tree) | Unmapped | "Needs mapping" |

**Missing piece for "muted + reason":** the schema has `muted` (boolean) but **no mute-reason field**.
To show *why*, either add a `muteReason` (or `unmappableReason`) text column, or infer from
callTarget/type/name. A real field is cleaner and lets the owner edit it.

## Who does what
- **Data Dev:** delete the 6 merge stubs; merge the 6 H Mart entries into one; tag/remove the 9 malls
  (they aren't retailers); confirm MVPs stays a test store.
- **Admin (UI):** add "Can't map" to the `set_fmap` dropdown; render the reason on each row.
- **Mapping (me):** owns the classification rules above; can resolve Walmart/Office Depot `review→locked`
  (they have recipes); defines the reason taxonomy.
- **DevOps:** `muteReason` column + migration if we store the reason (vs infer).
