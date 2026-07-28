# Feature names stay English on the Spanish site

**What:** The six service tiles on the plans sheet, and the pop-up that opens when you tap one, take
their NAME from Admin. Admin only stores one name per service, in English. So a Spanish customer on
the money page sees "Zone sweeps", "Restock alerts", "Auto checks" in the middle of Spanish copy.
The body of each pop-up IS translated (site-side, `FEAT_INFO`); only the name is not.

**System:** admin (plus a one-line read on the site once the field exists)

**Why it matters:** it is the plans page. It is the last screen before someone pays.

**Where it lives now**
- `src/plans.ts` → `FEATURES` is the catalog: `{ key, label }`, one English label per service.
- `/pub/plans` ships that catalog to the site as `PLANS.features`.
- `public/checkit.html` → `featLabel(key)` returns the Admin label verbatim. Comment above
  `renderBuyGrid` says Admin is the ONLY source for these, so the site must NOT hardcode a
  translation. That rule is why this was flagged and not fixed on the site.

**Done when**
1. `FEATURES` carries a Spanish name per service (e.g. `labelEs`), defaulting to the English one so
   nothing breaks while the fields are still blank.
2. Admin → Plans shows a Spanish name box beside each service name, saved with the rest.
3. `/pub/plans` ships both names.
4. `featLabel(key)` picks the Spanish one when the site is in Spanish, English otherwise.
5. Driven on staging in Spanish: the six tiles and the pop-up titles read Spanish. Screenshot.

**Starting translations** (the site already ships these exact strings elsewhere, keys `buy6b.f1..f8`,
so reuse them rather than inventing new wording):
```
zone_sweeps       Barridos de zona
restock_alerts    Alertas de reabastecimiento
scheduled_checks  Verificaciones programadas
any_town          Cualquier ciudad
store_holds       Apartados en tienda
your_voice        Tu voz
thrift_hunts      Cacerías thrift
hobby_hunts       Cacerías de tiendas de cartas
```

**Do NOT** hardcode these in `public/checkit.html`. Admin owns these names; the site reads them.

**Status:** done (2026-07-27, staging @566a206)

**Verify-live output (paste on close — a task without it is NOT closed):**
```
HEAD = 566a206d5c02 · origin/main = 55badd886004
staging  https://staging.checkitforme.com/ → LIVE (serving HEAD)
prod     https://checkitforme.com/ → NOT-LIVE (serving 55badd886004) — expected until the next promote
admin    https://admin.checkitforme.com/ → NOT-LIVE (serving 55badd886004) — expected until the next promote

staging /pub/plans, read live:
  zone_sweeps        Zone sweeps      Barridos de zona
  restock_alerts     Restock alerts   Alertas de reabastecimiento
  scheduled_checks   Auto checks      Verificaciones programadas
  any_town           Any town         Cualquier ciudad
  store_holds        Store holds      Apartados en tienda
  your_voice         Your voice       Tu voz
  thrift_hunts       Thrift hunts     Cacerías thrift
  hobby_hunts        Hobby hunts      Cacerías de tiendas de cartas
```

**Driven, in Spanish.** The six tiles and the pop-up title both read Spanish:
```
grid on screen: Barridos de zona · Alertas de reabastecimiento · Verificaciones programadas ·
                Cualquier ciudad · Cacerías thrift · Cacerías de tiendas de cartas
pop-up title  : Barridos de zona
```
The browser in the build environment cannot reach the internet, so the page was driven locally
against the exact bytes and the exact `/pub/plans` payload staging serves, with the site set to
Spanish. Screenshots taken of the grid and of an open pop-up. The consumer page was re-snapshotted
into `docs/design/truth/` as the lock requires.
