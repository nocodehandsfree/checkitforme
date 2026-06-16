# Domain Migration Plan — move the product off `*.fungibles.com` to its own domain

Owner is considering a dedicated domain for this product (separate from the Fungibles card app).
Good news: **the app is already domain-agnostic** — `brands.ts` resolves the vertical from the
**subdomain label** ("pokemon.fungibles.com today, pokemon.<newdomain>.com later, both resolve to the
same brand"). So this is ~95% DNS/config, very little code. Not launch-blocking — do it as a clean,
parallel cutover when ready.

## What's on `fungibles.com` today (this product's surface)
- **Consumer verticals:** `pokemon.` / `onepiece.` / `toppsbasketball.` / `needoh.fungibles.com`
- **Admin:** `caller.fungibles.com`
- **Status:** `status.fungibles.com` (shared Cloudflare Worker — also serves the card app)
- Served via the **Cloudflare Worker** `fungibles-verticals` (`workers/verticals.mjs`) which
  reverse-proxies the verticals to the Railway service domain
  `voice-caller-production-2d6b.up.railway.app` and forces `?brand=<sub>`.
- Internal-only (NOT public-domain dependent — won't change): the Railway service domain itself,
  the `RAILWAY_HOST` constant used for the Twilio/WS bridge, and OG/canonical/sitemap (all derived
  from the request `Host` header → auto-adapt to whatever domain serves them).

## Target layout on `<newdomain>.com`
Mirror the subdomains: `pokemon.` / `onepiece.` / `toppsbasketball.` / `needoh.` (consumer),
`app.` or `caller.` (admin), `status.` (its own, or keep shared). Pick the root with the owner.

## Migration steps (parallel cutover — both domains work, then flip)
1. **Register** the domain; **add it as a new Cloudflare zone**; point nameservers.
2. **TLS:** Cloudflare's `*.<newdomain>.com` wildcard cert terminates TLS (same pattern that
   already works around Railway's stuck per-domain validation — see `HANDOFF.md`).
3. **Worker routes:** add the new subdomains as routes to the `fungibles-verticals` Worker (or a
   clone) so they proxy to the same Railway service with `?brand=`. CNAME the new subs (proxied/orange).
4. **Clerk (the one with real cross-domain gotchas):** add the new domain + subdomains to Clerk's
   **allowed origins / redirect URLs**; reissue the cross-subdomain session config for the new apex.
   Test sign-in on the new domain before flipping.
5. **Webhook URLs:** point the **ElevenLabs** post-call webhook + **Stripe** webhook at the new
   domain (or keep them on the stable Railway domain — they're path-based, so the Railway domain is
   actually the *safer* permanent home for webhooks; recommend keeping webhooks on the Railway host).
6. **Analytics:** add the new domain to GA4 / PostHog allowed domains.
7. **No code change expected** for brand resolution. Only if you want the new domain to be the
   *canonical* in `<link rel=canonical>`/OG: that's already `Host`-derived, so it auto-follows.
8. **Redirects (SEO):** 301 the old `*.fungibles.com` product subs → the new domain via Cloudflare
   redirect rules, so existing links + search rankings carry over. Submit the new `sitemap.xml`.
9. **Verify** each vertical + admin + a test check + sign-in on the new domain, then flip canonical
   and turn on the 301s.

## Risk / rollback
- Lowest-risk because both domains can serve simultaneously during the overlap. If anything breaks,
  don't 301 yet — keep traffic on `fungibles.com` until the new domain is fully verified.
- Keep webhooks on the Railway domain to decouple call/payment processing from the public-domain swap.

## Code touch points (minimal)
- `brands.ts` — only if a NEW subdomain label is introduced (existing labels need nothing).
- Worker `workers/verticals.mjs` — add the new hostnames to the route/brand map.
- Env (Railway): Clerk allowed-origins/keys for the new domain; `APP_URL` if it's used in any
  absolute link (check `config.appUrl`, defaults to `caller.fungibles.com`).
