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

## Chunk 1 — 7_eleven → bi_mart  🔧 awaiting owner approval
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| 7-Eleven | app-icon mark | 🔧 | tall mark; shrunk ~10% for symmetry |
| AAFES (Exchange) | **X mark only** | 🔧 | dropped EXCHANGE wordmark + tagline; shrunk ~10% |
| Academy Sports + Outdoors | A+swoosh mark | 🔧 | white fringe removed; shrunk ~10% |
| Ace Hardware | "ACE" wordmark | 🔧 | trimmed tight → now fills width (was too small); wide-flag fixed |
| Acme | "ACME" wordmark | 🔧 | trimmed tight → now fills width (was too small) |
| Albertsons | "A" flame mark | 🔧 | white fringe removed, trimmed bigger |
| Aldi | boxed emblem | 🔧 | box = storefront identity (not white); shrunk ~10% — owner to confirm |
| Barnes & Noble | gray B/N + gold & | 🔧 | trimmed bigger; no box (matches spec) |
| Best Buy | yellow tag | 🔧 | trimmed bigger then shrunk ~10%; mark-only (matches spec) |
| Bi-Mart | **real BI·MART** split | 🔧 | their actual red wordmark, "BI" over "MART" (from official SVG) |

## Chunk 2 — big_5 → costco  ⬜
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Big 5 Sporting Goods | "BIG 5" mark | ⬜ | use the real Big 5, no blue box, bigger |
| BJ's Wholesale | wordmark | ⬜ | |
| Blain's Farm & Fleet | "Blain's" | ⬜ | **too small**; drop "Farm & Fleet" tagline; don't cut bottom |
| Books-A-Million | wordmark | ⬜ | |
| BoxLunch | wordmark | ⬜ | |
| Buc-ee's | beaver mark | ⬜ | |
| Burlington | heart-B mark | ⬜ | **heart cut off on the right** — tighten crop |
| City Market | 2 lines, red | ⬜ | two lines, red letters, no white border |
| Claire's | wordmark | ⬜ | **too small** |
| Costco | wordmark | ⬜ | |

## Chunk 3 — cvs → fred_meyer  ⬜
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| CVS | heart mark only | ⬜ | heart only, not "CVS"/"CVS Health" |
| Dick's Sporting Goods | wordmark | ⬜ | **too small**; use owner-attached Dick's logo |
| Dollar General | 2 lines + yellow | ⬜ | two lines, keep yellow border, don't cut outside border |
| Dollar Tree | wordmark | ⬜ | |
| Dunham's Sports | "Dunham's" | ⬜ | **too small**; drop "Sports" tagline |
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
