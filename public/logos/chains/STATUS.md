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

## Chunk 3a — cvs → dunham_s  ✅ LOCKED (owner-approved after CVS/Dollar Tree/Dunham's size tweaks)
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| CVS | red heart mark | 🔧 | heart only (from CVS app icon), shrunk to icon set; not "CVS"/"CVS Health" |
| Dick's Sporting Goods | green-box logo | 🔧 | owner-attached logo, white bg flooded off, kept full lockup + tagline |
| Dollar General | yellow-box 2 lines | 🔧 | DOLLAR/GENERAL, kept the yellow border (their brand), nothing clipped |
| Dollar Tree | green tree mark | 🔧 | their tree-$1 symbol, shrunk to icon set |
| Dunham's Sports | "Dunham's" script | 🔧 | red italic wordmark filled to width; "Sports" dropped (no better source found) |

## Chunk 3b — family_dollar → fred_meyer  ✅ LOCKED (owner-approved; Burlington 2b also locked)
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Family Dollar | family-circle mark | 🔧 | de-boxed the orange app icon → circle emblem; shrunk per owner |
| Five Below | "five below" wordmark | 🔧 | de-boxed the blue app icon → white wordmark (their real font) |
| Fleet Farm | FF-circle mark | 🔧 | de-boxed the orange app icon → white FF circle |
| Food 4 Less | FOOD/LESS + yellow 4 | 🔧 | their REAL bold font (official vector), broken up: FOOD over LESS, 4 to the right, recolored white (black was invisible on dark) |
| Fred Meyer | red "F" mark | 🔧 | de-boxed their app-icon F; shrunk per owner |

> Burlington (Chunk 2b) shrunk a bit per owner — ready to lock.

## Chunk 4a — fry_s → h_e_b  ✅ LOCKED (owner-approved; GameStop shrunk + locked, H-E-B stadium, Giant Eagle smaller)
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Fry's | "fry's" wordmark | 🔧 | their real red wordmark, full, not cut |
| GameStop | "Game Stop" serif | 🔧 | their REAL app-icon font, de-boxed, broken up (Game over Stop) |
| Gelson's | "Gelson's" script | 🔧 | official vector, soft-white so it reads on dark |
| Giant Eagle | wordmark + leaf | 🔧 | de-boxed the red app icon → white "giant eagle" + sprout |
| H-E-B | white on red box | 🔧 | their iconic red-box logo rebuilt (no clean vector exists; box = brand) |

## Chunk 4b — h_mart → hobby_lobby  ✅ LOCKED (owner-approved; H Mart/crown/Hobby Lobby reduced, Hibbett = wordmark)
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| H Mart | H emblem + MART | ✅ | their real H-mark over MART, reduced |
| Hallmark Gold Crown | gold crown | ✅ | de-boxed app icon → gold crown only (dropped "Cards Now"), reduced |
| Harris Teeter | food-cluster mark | ✅ | de-boxed their app icon (apple/fish/bread) |
| Hibbett Sports | "HIBBETT" wordmark | ✅ | their real wordmark (owner: keep wordmark over the HS monogram) |
| Hobby Lobby | "HOBBY/LOBBY" | ✅ | their real orange wordmark (official vector) split two lines, reduced |

## Chunk 5a — homegoods → king_soopers  ✅ LOCKED (owner-approved)
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| HomeGoods | roof + HOME GOODS | 🔧 | kept the red roof over the words |
| Hot Topic | "HOT/TOPIC" stencil | 🔧 | their real stencil font (official vector), recolored white, split two lines |
| Hy-Vee | "HyVee" wordmark | 🔧 | official vector, dropped "Employee Owned" tagline |
| Jewel-Osco | red oval script | 🔧 | official vector — red Jewel·Osco in the oval, no white bg |
| King Soopers | classic striped logo | 🔧 | their official retro logo (red striped box = brand) |

## Chunk 5b — kohl_s → macy_s  ✅ LOCKED (owner-approved; Kohl's de-boxed + bigger, Kroger/LE/star sized)
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Kohl's | white on red box | 🔧 | lightened the maroon → brighter red box (kept square so it stays readable) |
| Kroger | blue-oval logo | 🔧 | their official oval (white script), brightened blue, no cart — squarer → bigger |
| Learning Express | "LE" mark | 🔧 | kept the LE mark (their colorful wordmark is too busy to read at tile size) |
| Lowe's | blue gable | 🔧 | their real blue gable mark, trimmed bigger |
| Macy's | red star | 🔧 | their star mark, slight shrink |

## Chunk 6a — mariano_s → menards  ✅ LOCKED (owner-approved; switched to ACTUAL logos)
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Mariano's | M + green leaf | ✅ | actual emblem (app icon), de-boxed, leaf filled green, reduced |
| Marshalls | blue wordmark | ✅ | actual Marshalls wordmark, clean brighter blue, fills width |
| MCX | MCCS mark | ✅ | MCCS (MCX's parent — no MCX-specific logo exists); owner accepted |
| Meijer | "meijer" wordmark | ✅ | their red wordmark, white stripped from letters |
| Menards | MENARDS + stripe | ✅ | actual logo with the colorful stripe, fills width |

## Chunk 6b — michaels → ollie_s  🔧 awaiting owner approval
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Michaels | red script | 🔧 | their real wordmark (official vector, no box, no tagline) |
| Micro Center | "MICRO CENTER" | 🔧 | their blocky font, no "computers & electronics" tagline |
| NEX (Navy Exchange) | anchor + "NEX" | 🔧 | official vector; dropped the "/ MCX" half |
| Office Depot | "Office / DEPOT" | 🔧 | official vector split two lines (Office red, DEPOT white); no OfficeMax, no tagline |
| Ollie's Bargain Outlet | mascot | 🔧 | their Ollie mascot, slight shrink |

## Chunk 7a — pavilions → ralphs  🔧 awaiting owner approval (v2: Ralphs oval, Publix wordmark, QFC smaller)
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Pavilions | white serif wordmark | 🔧 | their real wordmark (official vector), recolored white + stretched taller (owner: "pavilions is OK") |
| Pick 'n Save | red "P" mark | 🔧 | de-boxed app-icon "P" → Pick'n Save red (#DC1E2E); **monogram — no wordmark vector exists**, flagged to owner |
| Publix | green "Publix" wordmark | 🔧 | official vector — green wordmark, no box (replaced the "p" mark) |
| QFC | Q-with-crown | 🔧 | their Q-with-crown mark, shrunk per owner ("Q is too big") |
| Ralphs | red oval + white script | 🔧 | owner-supplied real Ralphs oval logo (replaced the red "R" mark) |

## Chunk 7b — randalls → scheels  ⬜
| Logo | Treatment | Status | Notes |
|---|---|---|---|
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
