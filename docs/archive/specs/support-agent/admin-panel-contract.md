# Support ⇄ Admin — panel contract (what the Admin Support tab expects)
**What this is · who it's for:** the response shapes the Admin → Support tab (built by Addie,
2026-07-11) reads from the Support lane's endpoints. Updated same day to match the shapes the
Support backend actually ships — the panel now reads BOTH the original names and the live ones.
Support: extend freely, but ping Addie's chat before renaming existing fields.

## GET /api/support/stats?range=today|7d|30d
Live shape (2026-07-11). Panel hides any stat whose field is absent — no dashes.
```jsonc
{
  "range": "7d",
  "conversations": 42,           // total chats ("total" also accepted)
  "members": 30, "guests": 12,   // shown as a breakdown chip
  "selfServed": 35,
  "escalated": 7,
  "escalationRate": 17,          // percent; derived from escalated/conversations if absent
  "resolved": 33,
  "pendingReview": 2,
  "tickets": 3,                  // human-email tickets ("ticketsEmailed" also accepted)
  "estCostUsd": 0.41,            // rendered as $0.41
  "byCategory": { "technical": 12, "bug": 6, "billing": 9, "partnerships": 1, "how_checks_work": 10, "other": 4 },
  "byMaxTier": { "1": 30, "2": 9, "3": 3 },   // chips via tier labels (Tier 1 / Tier 2 / Human email)
  "models": { "free": "…", "cheap": "…", "big": "…" }   // informational; panel ignores
}
```
Optional extras the panel still renders if Support ever adds them: `avgMessages` (stat),
`topQuestions: [{q,n}]` (list, also accepts `{question,count}`).

## GET /api/support/chats?category=&account=all|members|guests&since=&until=&q=
`since`/`until` are unix seconds. Response: an array (or `{chats:[...]}`), newest first:
```jsonc
[{
  "id": "chat_ab12",
  "account": { "email": "x@y.com", "phone": "+1…", "label": "…" } | null,   // null = guest
  "category": "technical|bug|billing|partnerships|how_checks_work|other",
  "lastMessage": "snippet of the last message…",   // also accepts `snippet`
  "tier": 1 | 2 | 3,          // 1 cheap model · 2 smart model · 3 human email ("human"/"smart" strings also accepted)
  "status": "open" | "escalated" | "resolved",
  "createdAt": 1783700000      // unix seconds; `created_at` also accepted
}]
```

## GET /api/support/chats/:id
Everything above for the one chat, plus:
```jsonc
{
  "transcript": [ { "role": "user"|"assistant", "text": "…" } ],  // `messages` / `content` also accepted; role "customer" = user side
  "screenshotUrl": "/path/or/https…",                             // `screenshot` also accepted; omit if none
  "debug": { "ua": "…", "page": "…", "cid": "…" },                // object or string; rendered as-is in a <pre>
  "account": { "email": "…", "phone": "…", "subscription": "…", "credits": 12, "callsMade": 30 } | null
}
```

## Auth
The panel calls with the standard admin auth (admin_session cookie / x-admin-token) — mount the
routes under `/api/*` so the existing admin wall covers them; nothing extra needed.
