# Store logo STATUS — chunked, locked workflow

Working method (agreed with owner): process in **chunks of 10, alphabetical**. Fix a chunk →
send one contact sheet at the **real phone size** → owner approves → **lock it**. We never
re-touch locked logos. **NO universal/global normalize passes** (those silently regressed
already-approved logos — that's the bug we're killing).

Rules live in `README.md`. Render math: tile 46px; square logo fits 42×42, wide logo fits
44×34. The #1 cause of "too small" was logos padded inside a 256² canvas with ink at ~84%
width — fix is **trim tight + correct the wide-flag** (`_meta.json` `w:1` when ink aspect ≥ 1.5).

Legend: ✅ locked (owner-approved) · 🔧 in progress · ⬜ todo

---

## Chunk 1 — 7_eleven → bi_mart  ✅ LOCKED (owner-approved sizing; Albertsons re-done from vector)
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| 7-Eleven | app-icon mark | 🔧 | tall mark; shrunk ~10% for symmetry |
| AAFES (Exchange) | **X mark only** | 🔧 | dropped EXCHANGE wordmark + tagline; shrunk ~10% |
| Academy Sports + Outdoors | A+swoosh mark | 🔧 | white fringe removed; shrunk ~10% |
| Ace Hardware | "ACE" wordmark | 🔧 | trimmed tight → now fills width (was too small); wide-flag fixed |
| Acme | "ACME" wordmark | 🔧 | trimmed tight → now fills width (was too small) |
| Albertsons | "A" flame mark | ✅ | re-done from official vector — crisp, no pixelation |
| Aldi | boxed emblem | 🔧 | box = storefront identity (not white); shrunk ~10% — owner to confirm |
| Barnes & Noble | gray B/N + gold & | 🔧 | trimmed bigger; no box (matches spec) |
| Best Buy | yellow tag | 🔧 | trimmed bigger then shrunk ~10%; mark-only (matches spec) |
| Bi-Mart | **real BI·MART** split | 🔧 | their actual red wordmark, "BI" over "MART" (from official SVG) |

## Chunk 2a — big_5 → boxlunch  ✅ LOCKED (owner: "much nicer good job"; Blain's re-cut from vector)
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Big 5 Sporting Goods | "BIG 5" real serif | 🔧 | de-boxed real logo; dropped "Sporting Goods"; "BIG" over big "5" |
| BJ's Wholesale | magenta "BJ's" | 🔧 | de-boxed to brand-color letterforms (#d1335a), no box; sized to icon set |
| Blain's Farm & Fleet | "Blain's" script | ✅ | re-cut from official vector — full cursive swashes, nothing cut; "Farm & Fleet" dropped |
| Books-A-Million | "BAM!" mark | 🔧 | trimmed tight |
| BoxLunch | orange "BL" box | 🔧 | box = brand icon (like Aldi) — owner to confirm; shrunk to match |

## Chunk 2b — buc_ee_s → costco  ✅ LOCKED (owner-approved; Burlington + City Market re-done)
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Buc-ee's | beaver on yellow | ✅ | brand icon (yellow circle = identity); shrunk to match icon set |
| Burlington | heart-B mark | ✅ | complete heart-B from vector — cut at the real B\|u gap so the right lobe rounds |
| City Market | red "C" mark | ✅ | de-boxed their real "C" app icon — solid red, no white box/border (owner: "much better") |
| Claire's | "claire's" wordmark | ✅ | official vector, purple brightened (wide → renders compact, see size note) |
| Costco | "COSTCO WHOLESALE" | ✅ | official vector lockup, no box |

> **Size note (wide wordmarks):** single wide words (Claire's, Costco, Acme, B&N, BAM!,
> Blain's) fit-to-width in a square-ish tile, so they render short. Per-logo trimming is
> maxed out. Making them bigger needs a *global* render change (wider tile or taller
> wide-logo box) — hold for owner decision so it doesn't rebalance the locked chunks.

## Chunk 3a — cvs → dunham_s  🔧 awaiting owner approval
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| CVS | red heart mark | 🔧 | heart only (from CVS app icon), shrunk to icon set; not "CVS"/"CVS Health" |
| Dick's Sporting Goods | green-box logo | 🔧 | owner-attached logo, white bg flooded off, kept full lockup + tagline |
| Dollar General | yellow-box 2 lines | 🔧 | DOLLAR/GENERAL, kept the yellow border (their brand), nothing clipped |
| Dollar Tree | green tree mark | 🔧 | their tree-$1 symbol, shrunk to icon set |
| Dunham's Sports | "Dunham's" script | 🔧 | red italic wordmark filled to width; "Sports" dropped (no better source found) |

## Chunk 3b — family_dollar → fred_meyer  ⬜
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Family Dollar | family-circle mark | ⬜ | use the brand mark, uniform size |
| Five Below | wordmark | ⬜ | clean it up (was a mess) |
| Fleet Farm | wordmark | ⬜ | |
| Food 4 Less | FOOD/LESS + 4 | ⬜ | FOOD over LESS, 4 to the right, big & round |
| Fred Meyer | wordmark | ⬜ | |

## Chunk 4 — fry_s → hobby_lobby  ⬜
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Fry's | wordmark | ⬜ | **too small**; use full wordmark, don't cut |
| GameStop | real logo, split | ⬜ | use their REAL logo broken up — not a made-up one |
| Gelson's | wordmark | ⬜ | **too small**; lighten; remove white in letters |
| Giant Eagle | wordmark/mark | ⬜ | |
| H-E-B | wordmark | ⬜ | **too small** |
| H Mart | "H" over "MART" | ⬜ | their exact lettering, not made-up |
| Hallmark Gold Crown | crown mark | ⬜ | |
| Harris Teeter | wordmark | ⬜ | |
| Hibbett Sports | wordmark | ⬜ | |
| Hobby Lobby | 2 lines | ⬜ | split on two lines |

## Chunk 5 — homegoods → macy_s  ⬜
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| HomeGoods | keep the roof | ⬜ | keep the roof over the words |
| Hot Topic | wordmark | ⬜ | |
| Hy-Vee | wordmark | ⬜ | |
| Jewel-Osco | wordmark | ⬜ | |
| King Soopers | wordmark | ⬜ | |
| Kohl's | wordmark | ⬜ | lighten (dark) |
| Kroger | wordmark | ⬜ | **too small**; drop the shopping cart; lighten/brighten blue |
| Learning Express | wordmark | ⬜ | |
| Lowe's | wordmark | ⬜ | **too small** |
| Macy's (Toys R Us) | wordmark | ⬜ | |

## Chunk 6 — mariano_s → ollie_s  ⬜
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Mariano's | wordmark + leaf | ⬜ | **white space inside the leaf** — remove it |
| Marshalls | "M" mark | ⬜ | lighten; remove white in letters |
| MCX (Marine Corps Exchange) | mark | ⬜ | |
| Meijer | wordmark | ⬜ | remove white inside letters |
| Menards | "M" mark | ⬜ | **too small**; drop the line underneath |
| Michaels | wordmark | ⬜ | |
| Micro Center | wordmark | ⬜ | drop "computers & electronics" tagline |
| NEX (Navy Exchange) | mark | ⬜ | |
| Office Depot OfficeMax | 2 lines | ⬜ | two lines; drop "OfficeMax" |
| Ollie's Bargain Outlet | wordmark | ⬜ | |

## Chunk 7 — pavilions → scheels  ⬜
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Pavilions | wordmark | ⬜ | **too small**; use THEIR logo (don't make one up) |
| Pick 'n Save | 2 lines | ⬜ | "Pick 'n" on one line, "Save" below |
| Publix | wordmark | ⬜ | |
| QFC | Q-with-crown mark | ⬜ | the Q with crown |
| Ralphs | wordmark | ⬜ | |
| Randalls | wordmark | ⬜ | **too small**; lighten; remove white in letters |
| Ross Dress for Less | wordmark | ⬜ | white lettering, readable (lightened blue done before) |
| Safeway | wordmark | ⬜ | |
| Sam's Club | split actual | ⬜ | split their ACTUAL wordmark, don't cut letters |
| Scheels | wordmark | ⬜ | |

## Chunk 8 — shaw_s → tom_thumb  ⬜
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Shaw's | wordmark | ⬜ | remove white inside letters |
| Sheetz | wordmark | ⬜ | |
| Smith's | wordmark | ⬜ | |
| Spencer's | wordmark | ⬜ | |
| Staples | exact owner logo | ⬜ | use the EXACT logo owner gave — not the folded-corner "staple" mark |
| Star Market | wordmark | ⬜ | |
| Target | bullseye mark | ⬜ | |
| TJ Maxx | wordmark | ⬜ | **too small**; remove white inside letters |
| Tokyo Japanese Lifestyle | wordmark | ⬜ | |
| Tom Thumb | 2 lines | ⬜ | drop red line; two lines; brighter blue |

## Chunk 9 — tractor_supply → winco_foods  ⬜
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Tractor Supply | wordmark/mark | ⬜ | |
| Vons | wordmark | ⬜ | remove white inside letters; bigger |
| Walgreens | wordmark | ⬜ | |
| Walmart | spark mark | ⬜ | |
| Wawa | wordmark | ⬜ | |
| Wegmans | wordmark | ⬜ | |
| WinCo Foods | wordmark | ⬜ | |
