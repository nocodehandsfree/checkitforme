# Launch mapping gap — callable chains rendering GREYED (unmapped) 2026-07-11

Verified via live `/pub/stores/near`: mapped chains render callable with correct tiers; kiosk vs
retail split works. But these 23 chains are **callable + call-rail + not muted, yet NOT mapped**
(no ringsDirect, no learned tree, not Hobby/Thrift) → they show GREYED "coming soon" and are never
dialed. **~21,945 callable stores, 18,247 of them tier 3-5.** Mapper's launch queue, biggest first.
Many likely RING DIRECT (Family Dollar, Wawa, Sheetz, dollar stores) — one `ringsDirect=true` flag
flips the whole chain callable, no learning call needed. The rest need a tree-map.

| callable stores | tier3-5 | chain | type |
|---|---|---|---|
| 7061 | 7061 | Family Dollar | Discount |
| 2449 | 2449 | Tractor Supply | Other |
| 1763 | 1763 | Lowe's | Other |
| 1134 | 1134 | Wawa | Other |
| 1040 | 1040 | Burlington | Off-Price |
| 1014 | 1014 | TJ Maxx | Off-Price |
| 946 | 946 | Hibbett Sports | Other |
| 774 | 774 | Sheetz | Other |
| 660 | 660 | Ollie's Bargain Outlet | Other |
| 344 | 344 | Menards | Other |
| 331 | 331 | Academy Sports + Outdoors | Other |
| 277 | 277 | BJ's Wholesale | Other |
| 253 | 253 | Dunham's Sports | Other |
| 74 | 74 | WinCo Foods | Other |
| 48 | 48 | Fleet Farm | Other |
| 43 | 43 | Blain's Farm & Fleet | Other |
| 25 | 25 | Pick 'n Save | Other |
| 11 | 11 | Pavilions | Grocery |
| 963 | 0 | HomeGoods | Off-Price |
| 950 | 0 | Marshalls | Off-Price |
| 1080 | 0 | Hallmark Gold Crown | Other |
| 426 | 0 | Macy's (Toys R Us shop-in-shop) | Other |
| 279 | 0 | AAFES | Other |

Separately: **Walmart & Target are NOT muted — they're `stockCheckMethod=site`** (render "check
online", not called), by the MSRP→site rule. If they should be CALLED, flip stockCheckMethod=call
(their trees are already mapped: Walmart press 9 / Target press 2>2). Owner call.
