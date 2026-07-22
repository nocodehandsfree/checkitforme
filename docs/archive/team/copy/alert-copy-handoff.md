# Alert messaging — final copy (hand to Addie)

Written to `COPY_STYLE_GUIDE.md`: friend voice, no dashes inside sentences, **check** is the unit,
**Staff** is the person at the store, **Check AI** is the caller. Layout is locked
(`docs/design/emails/check-email-alerts-design.html`) — this is words only.

**Tokens fill live:** `{store}` `{product}` `{city}` `{email}` `{result}`
**Where each field lives (for implementing):** email visible copy (kicker/headline/body/module/CTA)
= `src/alerts.ts` → `EMAIL_DESIGN`. Subjects + SMS = `src/alerts.ts` → `DEFAULT_TEMPLATES`
(also editable in Admin → Alerts). Landing pages = `src/server.ts` → `emailLandingPage` calls.
Admin labels = `public/app.html`.

**Result values** (`{result}`): "In stock" / "Not in stock" / "Nobody answered".
⚠ `{result}` currently fills in English. For the Spanish email/text to read right it needs a
Spanish value ("En stock" / "No hay" / "Nadie contestó"). Flagged for Addie/Echo.

---

## 1. Restock email — a watched product is back (CTA → the store)

**EN**
- Subject: `It's back at {store}.`
- Kicker: `BACK IN STOCK`
- Headline: `It's back.`  _(product shows in the card below + the subject, so the big line stays short and never wraps on a long product name)_
- Body: **{store}** in {city} has it again.
  This stuff moves fast. Go before it's gone.
- Module (product card): title `{product}` · sub `{store} · {city}` · badge `JUST SPOTTED`
- CTA: `See the store`

**ES**
- Subject: `Volvió a {store}.`
- Kicker: `YA DISPONIBLE`
- Headline: `Volvió.`
- Body: **{store}** en {city} lo tiene otra vez.
  Esto vuela. Ve por él antes de que se acabe.
- Module: title `{product}` · sub `{store} · {city}` · badge `VISTO HOY`
- CTA: `Ver la tienda`

---

## 2. Auto check results email — a scheduled auto check ran (CTA → the call)

**EN**
- Subject: `Auto check: {result}.`
- Kicker: `AUTO CHECK`
- Headline: `{result}.`
- Body: Your auto check just called **{store}** about **{product}**.
  Tap in to see exactly what Staff said.
- Module: title `{product}` · sub `{store}` · badge `AUTO CHECK`
- CTA: `See the call`

**ES**
- Subject: `Check automático: {result}.`
- Kicker: `CHECK AUTOMÁTICO`
- Headline: `{result}.`
- Body: Tu check automático llamó a **{store}** por **{product}**.
  Toca para ver qué dijo el Staff.
- Module: title `{product}` · sub `{store}` · badge `CHECK AUTO`
- CTA: `Ver la llamada`
- ⚠ Spanish length: kicker `CHECK AUTOMÁTICO` is long for the eyebrow; it fits at the eyebrow
  size but if it ever wraps, fall back to `AUTO CHECK` in both languages. Badge shortened to
  `CHECK AUTO` so the pill doesn't overflow.

---

## 3. Store went live email — a requested store is now on the site, free check granted (CTA → site)

**EN**
- Subject: `You got your store.`
- Kicker: `YOUR STORE IS LIVE`
- Headline: `You got your store.`
- Body: **{store}** in {city} is live, and your next check is on us.
  Pick a product, Check AI calls the Staff, you get a straight answer.
- CTA: `Use my free check`

**ES**
- Subject: `Ya tienes tienda.`
- Kicker: `YA ESTÁ TU TIENDA`
- Headline: `Ya tienes tienda.`
- Body: **{store}** en {city} ya está, y tu próximo check va por nuestra cuenta.
  Elige un producto, Check AI llama al Staff y te da una respuesta clara.
- CTA: `Usar mi check gratis`

---

## 4. Waitlist email — we just launched in their city (CTA → site)

**EN**
- Subject: `{city}, we made it.`
- Kicker: `NOW LIVE NEAR YOU`
- Headline: `{city}, we made it.`
- Body: Check is live in {city}. Call any store near you, right from your phone.
  Your first check is on us.
- CTA: `Use my free check`

**ES**
- Subject: `{city}, ya llegamos.`
- Kicker: `YA ESTAMOS AQUÍ`
- Headline: `{city}, ya llegamos.`
- Body: Check ya está en {city}. Llama a cualquier tienda cerca, desde tu teléfono.
  Tu primer check va por nuestra cuenta.
- CTA: `Usar mi check gratis`

---

## 5. Confirm your email — they added an email, nothing sends until they tap (CTA = confirm link)

**EN**
- Subject: `Confirm your email.`
- Kicker: `CONFIRM YOUR EMAIL`
- Headline: `One tap left.`
- Body: You added this address for alerts. Tap below to confirm it's yours, then they'll land right here.
- Module (chip): `{email}`
- CTA: `Confirm my email`

**ES**
- Subject: `Confirma tu correo.`
- Kicker: `CONFIRMA TU CORREO`
- Headline: `Un toque más.`
- Body: Agregaste este correo para tus alertas. Toca abajo para confirmarlo y empezarán a llegar aquí.
- Module (chip): `{email}`
- CTA: `Confirmar mi correo`

---

## 6. Owner in stock ping — internal, to the owner only (CTA → the call)

_No Spanish (internal). English only._
- Subject: `In stock: {product} at {store}.`
- Kicker: `CALL CONFIRMED`
- Headline: `It's in stock.`
- Body: A call just confirmed **{product}** is on the shelf at **{store}**.
  {dayline}  _(optional; fills to e.g. "They said they restock Fridays." or drops out)_
- Module: title `{product}` · sub `{store}` · badge `CONFIRMED`
- CTA: `See the call`

---

## 7. Restock text (SMS)

- EN: `{product} is back at {store}. Move fast, this stuff doesn't sit. checkitforme.com`
- ES: `{product} volvió a {store}. Ve rápido, esto no dura. checkitforme.com`
- Length: ~95 chars EN / ~80 ES with real tokens. Under 150. ✓

## 8. Auto check results text (SMS)

- EN: `Your auto check called {store}. Result: {result}. See it at checkitforme.com`
- ES: `Tu check automático llamó a {store}. {result}. Míralo en checkitforme.com`
- Length: ~85 chars each. Under 150. ✓  (Same `{result}` Spanish note as email 2.)

---

## Landing pages (title + one line + CTA). Layout renders EN title, EN line, ES line under it, one CTA.

**9. Email confirmed**
- Title: `You're set.`
- Line EN: `Your email is confirmed. Alerts land right here from now on.`
- Line ES: `Tu correo está confirmado. Tus alertas llegarán aquí de ahora en adelante.`
- CTA: `Back to the site`  (ES if a second CTA is ever added: `Volver al sitio`)

**10. Unsubscribed**
- Title: `You're out.`
- Line EN: `No more alert emails to this address. Turn them back on anytime from your account.`
- Line ES: `No más correos de alerta a esta dirección. Puedes reactivarlas cuando quieras desde tu cuenta.`
- CTA: `Back to the site`

**11. Bad link** (two variants — same title, different second sentence)
- Title: `That link didn't work.`
- Confirm variant, Line EN: `It may have expired. Add your email again on the site and we'll send a fresh one.`
  Line ES: `Puede que haya caducado. Agrega tu correo otra vez en el sitio y te enviamos uno nuevo.`
- Unsubscribe variant, Line EN: `We couldn't match this link. Manage alerts from your account on the site instead.`
  Line ES: `No pudimos validar este enlace. Administra tus alertas desde tu cuenta en el sitio.`
- CTA: `Back to the site`

---

## Admin → Alerts page (labels + hints, admin voice: terse, no Spanish, dashes OK)

- Section sub: `Every message we send customers, and every send. Restock rides text or email; the rest go by email.`
- "Message templates" hint: `Tokens fill per send: {store} {product} {city} {email} {result}`  _(add {result})_
- Test recipient placeholder: `your email (or a phone for the text)`
- Per-message descriptions (the line under each editable message):
  - Restock (text or email): `Fires on a confirmed restock, on the channel the customer picked. Texts count against their plan's monthly cap.`
  - Auto check results (text or email): `Fires after each scheduled auto check, with what the call found.`
  - Store went live (email): `Their requested store just went live. Grants a free check.`
  - We're live in your area (email): `A waitlist signup's area just launched.`
  - Confirm your email (email): `Someone added an email. Nothing sends until they tap confirm.`
- Everything else on the page (Delivery status, This month, Save messages, Send yourself a test,
  Recent sends) reads clean already. No change.

## Admin → Support page (labels + hints only — do NOT touch bot answers)

- Reads clean already. One tightening:
  - "Update from the book" tip: `Re-reads the whole help book into the agent's memory. Run it after the book changes so answers use the newest wording.`
- Everything else (filters, Search chats…, Top questions, ranges) stays.
