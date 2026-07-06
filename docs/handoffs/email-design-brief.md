# Email design brief for Claude Design — Check It For Me alert emails

Paste-ready prompts (below) for designing the alert emails. Copy is written to
`docs/style-guide/COPY_STYLE_GUIDE.md` (referenced as `business/COPY_STYLE_GUIDE.md` in Design's context).
Website wires these once the templates + Admin `/app/alerts/*` API exist.

READ FIRST (all): review the copy style guide and write every word to it — friend voice, fewest words,
NO em-dashes, "check" is the unit, product is "Check It For Me", the AI is "Check AI", store person is "staff".

GLOBAL DESIGN: Check It For Me brand, dark + a little neo-punk, green go-signal #4ADE80 accent, logo at top.
Mobile-first HTML email (~600px, single column, inline CSS + tables, Gmail/Apple Mail/Outlook safe,
bulletproof CTA button, light-bg fallback). One job per email. Tokens in {curly braces}. From: Bravo, checkitforme.com.

1) STORE ADDED — "your free check". Goal: their requested store went live; make it feel like it paid off,
   pull them back to check. Reward is the hook. CTA "Use my free check". Tokens {name} {store} {city}.
2) WAITLIST — "your area is live". Goal: their market is now covered; get their first check.
   CTA "Check a store". Tokens {name} {city}.
3) BACK IN STOCK — restock (email version). Goal: a product they wanted is back; urgency without spam.
   CTA "See the details". Tokens {name} {product} {store} {city}.
4) WELCOME — after phone sign-up. Goal: warm first email, set expectations, first check is on us.
   CTA "Run my first check". Tokens {name}.
