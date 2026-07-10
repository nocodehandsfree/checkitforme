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
| Pick 'n Save | "Pick 'n / Save" wordmark | 🔧 | owner-supplied wordmark, recolored to white text + green leaf on the dark tile (no plate) |
| Publix | white "p" mark | 🔧 | owner-supplied logo — white p-mark on the gray tile, sized to match QFC/Ralphs breathing room |
| QFC | Q-with-crown | 🔧 | their Q-with-crown mark, shrunk per owner ("Q is too big") |
| Ralphs | red oval + white script | 🔧 | owner-supplied real Ralphs oval logo (replaced the red "R" mark) |

## Chunk 7b — randalls → scheels  ✅
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Randalls | bright-blue script | ✅ | lightened navy→bright blue, kept red underline, enlarged per owner (w:1) |
| Ross Dress for Less | white wordmark | ✅ | recolored lettering to white |
| Safeway | red app-icon "S" | ✅ | kept the app icon per owner, sized down |
| Sam's Club | "sam's / club" wordmark | ✅ | actual two-line wordmark, sized down per owner |
| Scheels | red "SCHEELS" wordmark | ✅ | owner-supplied logo, de-boxed to brand red #ee2e24 (the 2025 revert to the '98 red), enlarged, w:1 |

## Chunk 8 — shaw_s → tom_thumb  ✅ LOCKED (owner-approved)
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Shaw's | orange wordmark | 🔧 | cleaned near-white from inside the letters |
| Sheetz | red lozenge | 🔧 | real 2024 Sheetz logo (Wikimedia) — replaced the app-icon box |
| Smith's | magenta wordmark | 🔧 | real Smith's logo (Wikimedia) — replaced the generic red "S" |
| Spencer's | white graffiti | 🔧 | real Spencer's graffiti logo (Wikimedia), recolored white — replaced "Spencer's Nation" |
| Staples | red "STAPLES" wordmark | 🔧 | official Staples wordmark (Wikimedia); confirm vs the specific file owner mentioned |
| Star Market | hi-res lockup | 🔧 | high-res lockup (blue "star" + green star + "market") from combined vector |
| Target | red bullseye | 🔧 | official 2004 bullseye, sized down per owner |
| TJ Maxx | red wordmark | 🔧 | re-pulled official SVG at true aspect (no stretch) |
| Tokyo Japanese Lifestyle | TOKYO + fan | 🔧 | raised higher on the tile per owner |
| Tom Thumb | white script, dark tile | ✅ | white Tom/Thumb on dark tile, 3 rules stripped, stray tick removed, red line raised |

## Chunk 9 — tractor_supply → winco_foods  🔧 (9a done + uniform-sized per owner; awaiting approval)
<!-- Uniform sizing: logos normalized to a common envelope (~86% W / 74% H of tile) so they render the same size. Tractor = wordmark only (no shield). Walgreens = W. Tom Thumb left as-is per owner. -->
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Tractor Supply | blocky wordmark (no mark) | 🔧 | dropped TSC shield per owner; white "TRACTOR SUPPLY CO" wordmark, enlarged |
| Vons | red wordmark | 🔧 | real Vons wordmark (Wikimedia), enlarged |
| Walgreens | red cursive W | 🔧 | de-boxed Walgreens "W" in brand red, sized down per owner |
| Walmart | yellow spark | 🔧 | official spark mark (Wikimedia) |
| Wawa | red wordmark + goose | 🔧 | real Wawa wordmark (Wikimedia) — de-boxed |
| Wegmans | white script | ✅ | real Wegmans script, de-boxed → white, enlarged per owner |
| WinCo Foods | red 2-line | ✅ | real WinCo Foods wordmark (Wikimedia), red |

## New stores (owner's 13-list) — 🔧 sourcing as we go
| Logo | Treatment | Status | Notes |
|---|---|---|---|
| Amazon | wordmark + smile | ✅ | white "amazon" + orange smile (Wikimedia) |
| Goodwill | full logo | ✅ | owner-supplied official Goodwill logo (g face + "goodwill") |
| Salvation Army | red shield | ✅ | red shield emblem (Wikimedia), enlarged |
| FoodMaxx | "food"/"maxx" 2 lines | 🔧 | redrawn blue+yellow outline per word (split white letters + exact dilation) — clean, bigger |
| Lucky Supermarkets | red "Lucky" script | 🔧 | real Lucky script (Wikimedia) |
| Savers | tags mark only | 🔧 | brand mark only per owner |
| Uwajimaya | scallop mark only | 🔧 | brand mark only, white, per owner |
| Woodman's | "WOODMAN'S" + apple | 🔧 | name + apple only, enlarged per owner |
| Metro Market | m + green leaf | 🔧 | official app icon (Kroger Co.), de-boxed; same brown m + leaf family as Mariano's (Roundy's siblings, same brown) |
| Pak 'n Save | "Pak 'n / $ave" 2 lines | 🔧 | real Pak 'n $ave Foods lettering (BOTW scan of the print logo), lozenge border dropped + "Foods" dropped, stacked 2 lines, recolored white |
| Payless Foods | yellow-box lockup | 🔧 | official logo from paylessfoods.com (the LA chain — verified vs store data; the Kansas "PAY LE$$" app is a different brand). Box = their sign, kept like Dollar General |
| Unique | red "unique" wordmark | 🔧 | official Savers asset (uni-us-logo SVG from stores.savers.com), ® dropped, w:1 |
| Habitat ReStore | Habitat house mark, green | 🔧 | mark-only from the official Habitat lockup (en.wiki vector), recolored brand green #54B848; stores not in DB yet — alt treatment ("ReStore" wordmark) needs a clean source if owner prefers |
